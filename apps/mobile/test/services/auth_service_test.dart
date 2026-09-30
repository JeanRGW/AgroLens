import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/models/user.dart';
import 'package:agrolens/services/api_client.dart';
import 'package:agrolens/services/auth_service.dart';
import 'package:agrolens/services/token_storage.dart';
import 'package:agrolens/services/session_events.dart';
import 'package:agrolens/services/database_helper.dart';
import 'package:agrolens/services/catalog_repository.dart';
import 'package:agrolens/services/upload_pipeline.dart';
import 'package:agrolens/models/pending_upload.dart';
import '../helpers/test_doubles.dart';

class _DelayedTokenStorage extends TokenStorage {
  _DelayedTokenStorage() : super(storage: FakeFlutterSecureStorage());
  final started = Completer<void>();
  final release = Completer<void>();

  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    if (accessToken == 'slow') {
      started.complete();
      await release.future;
    }
    await super.saveTokens(
      accessToken: accessToken,
      refreshToken: refreshToken,
    );
  }
}

String _jwt(String subject) =>
    'eyJhbGciOiJIUzI1NiJ9.${base64Url.encode(utf8.encode(jsonEncode({'sub': subject})))}.signature';

class _SessionEvents extends SessionEvents {
  final events = StreamController<void>.broadcast(sync: true);
  @override
  String? revision;
  @override
  Stream<void> get changes => events.stream;
  @override
  void notifyChange() => revision = '${revision ?? ''}next';
  void changeFromAnotherTab({bool dispatch = true}) {
    notifyChange();
    if (dispatch) events.add(null);
  }

  @override
  void dispose() => events.close();
}

void main() {
  late MockHttpClient mockHttp;
  late ApiClient apiClient;
  late TokenStorage tokenStorage;
  late AuthService authService;

  final now = DateTime.now().toIso8601String();
  final userJson = {
    'id': 'user-1',
    'email': 'test@example.com',
    'fullName': 'Test User',
    'phone': null,
    'role': 'user',
    'disabledAt': null,
    'createdAt': now,
    'updatedAt': now,
  };

  setUp(() {
    mockHttp = MockHttpClient();
    apiClient = ApiClient(
      httpClient: mockHttp,
      env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
    );
    tokenStorage = TokenStorage(storage: FakeFlutterSecureStorage());
    authService = AuthService(apiClient: apiClient, tokenStorage: tokenStorage);
  });
  tearDown(() => authService.dispose());

  Future<void> loginAs(String id) async {
    mockHttp.queueResponse('POST', '/api/auth/login', 200, {
      'user': {...userJson, 'id': id},
      'accessToken': _jwt(id),
      'refreshToken': 'refresh-$id',
    });
    await authService.login(email: '$id@test', password: 'password');
  }

  group('cross-tab queue ownership', () {
    Future<void> loginA() async {
      mockHttp.queueResponse('POST', '/api/auth/login', 200, {
        'user': userJson,
        'accessToken': _jwt('user-1'),
        'refreshToken': 'refresh-a',
      });
      await authService.login(email: 'a@test', password: 'password');
    }

    for (final dispatch in [true, false]) {
      test(
        'account changes invalidate the session (storage event: $dispatch)',
        () async {
          authService.dispose();
          final events = _SessionEvents();
          authService = AuthService(
            apiClient: apiClient,
            tokenStorage: tokenStorage,
            sessionEvents: events,
          );
          await loginA();
          final generation = authService.sessionGeneration;
          events.changeFromAnotherTab(dispatch: dispatch);
          await tokenStorage.saveTokens(
            accessToken: _jwt('user-2'),
            refreshToken: 'refresh-b',
          );
          if (dispatch) {
            expect(authService.currentUser, isNull);
          } else {
            await expectLater(
              authService.getValidAccessToken(),
              throwsA(isA<ApiException>()),
            );
          }
          expect(authService.sessionGeneration, greaterThan(generation));
          expect(authService.currentUser, isNull);
          expect(await tokenStorage.getRefreshToken(), 'refresh-b');
        },
      );
    }

    test(
      'rejects another account token even without any storage event or marker',
      () async {
        await loginA();
        await tokenStorage.saveTokens(
          accessToken: _jwt('user-2'),
          refreshToken: 'refresh-b',
        );
        await expectLater(
          authService.getValidAccessToken(),
          throwsA(isA<ApiException>()),
        );
        expect(authService.currentUser, isNull);
        expect(mockHttp.requests, hasLength(1));
        expect(await tokenStorage.getRefreshToken(), 'refresh-b');
      },
    );

    test(
      'cannot initialize A queued images with B shared credentials',
      () async {
        await loginA();
        final db = createTestAppDatabase();
        final helper = DatabaseHelper(
          appDatabase: db,
          authService: authService,
        );
        addTearDown(helper.close);
        final upload = PendingUpload(
          id: 'a-batch',
          ownerId: 'user-1',
          paths: [],
          createdAt: DateTime.now(),
          propertyId: 'shared-property',
          talhaoId: 'shared-talhao',
          cropTypeId: 'shared-crop',
        );
        await helper.insertPendingUpload(upload);
        final catalogs = CatalogRepository(
          appDatabase: db,
          apiClient: apiClient,
          authService: authService,
        );
        final pipeline = UploadPipeline(
          apiClient: apiClient,
          authService: authService,
          databaseHelper: helper,
          catalogRepository: catalogs,
        );
        await tokenStorage.saveTokens(
          accessToken: _jwt('user-2'),
          refreshToken: 'refresh-b',
        );
        await expectLater(
          pipeline.stepInit(upload),
          throwsA(isA<ApiException>()),
        );
        expect(
          mockHttp.requests.where((r) => r.url.path == '/api/uploads/init'),
          isEmpty,
        );
        expect(
          (await db.readRows(
            'SELECT owner_id FROM pending_uploads WHERE id = ?',
            ['a-batch'],
          )).single['owner_id'],
          'user-1',
        );
      },
    );

    test('never replays an A request with a refreshed B token', () async {
      await loginA();
      mockHttp.queueResponse('GET', '/api/uploads', 401, {
        'message': 'Expired',
      });
      mockHttp.queueResponse('POST', '/api/auth/refresh', 200, {
        'accessToken': _jwt('user-2'),
        'refreshToken': 'refresh-b',
      });
      await expectLater(
        apiClient.listUploads(accessToken: _jwt('user-1')),
        throwsA(isA<ApiException>()),
      );
      expect(
        mockHttp.requests.where((r) => r.url.path == '/api/uploads'),
        hasLength(1),
      );
      expect(await tokenStorage.getAccessToken(), _jwt('user-1'));
      expect(authService.currentUser, isNull);
    });

    test(
      'offline restoration refuses a cached A user with B credentials',
      () async {
        await tokenStorage.saveUser(User.fromJson(userJson));
        await tokenStorage.saveTokens(
          accessToken: _jwt('user-2'),
          refreshToken: 'refresh-b',
        );
        mockHttp.queueResponse('GET', '/api/auth/me', 503, {
          'message': 'Offline',
        });
        expect(await authService.tryRestoreSession(), isNull);
        expect(authService.currentUser, isNull);
      },
    );
  });

  group('AuthService - token lifecycle', () {
    test(
      'logout waits for a storage commit then clears the entire session',
      () async {
        final storage = _DelayedTokenStorage();
        final auth = AuthService(apiClient: apiClient, tokenStorage: storage);
        addTearDown(auth.dispose);
        mockHttp.queueResponse('POST', '/api/auth/login', 200, {
          'user': userJson,
          'accessToken': 'slow',
          'refreshToken': 'r',
        });
        final login = auth.login(email: 'a@example.com', password: 'password');
        final rejected = expectLater(login, throwsA(isA<ApiException>()));
        await storage.started.future;
        mockHttp.queueResponse('POST', '/api/auth/logout', 200, {});
        final logout = auth.logout();
        storage.release.complete();
        await Future.wait([rejected, logout]);
        expect(auth.currentUser, isNull);
        expect(await storage.hasTokens(), isFalse);
        expect(await storage.getCachedUser(), isNull);
      },
    );

    for (final operation in ['login', 'register']) {
      test('late $operation cannot replace a newer login', () async {
        final started = Completer<void>();
        final release = Completer<void>();
        mockHttp.beforeResponse = (request) async {
          if (request.url.path == '/api/auth/$operation' &&
              (request as http.Request).body.contains('old@example.com')) {
            started.complete();
            await release.future;
          }
        };
        final old = operation == 'login'
            ? authService.login(email: 'old@example.com', password: 'password')
            : authService.register(
                email: 'old@example.com',
                password: 'password',
                fullName: 'Old',
              );
        final rejected = expectLater(old, throwsA(isA<ApiException>()));
        await started.future;
        mockHttp.queueResponse('POST', '/api/auth/login', 200, {
          'user': {...userJson, 'id': 'user-2'},
          'accessToken': 'account-b',
          'refreshToken': 'refresh-b',
        });
        await authService.login(email: 'new@example.com', password: 'password');
        mockHttp.queueResponse('POST', '/api/auth/$operation', 200, {
          'user': userJson,
          'accessToken': 'account-a',
          'refreshToken': 'refresh-a',
        });
        release.complete();
        await rejected;
        expect(authService.currentUser?.id, 'user-2');
        expect(await tokenStorage.getAccessToken(), 'account-b');
        expect((await tokenStorage.getCachedUser())?.id, 'user-2');
      });
    }

    test(
      'logout clears the UI session before waiting for the network',
      () async {
        mockHttp.queueResponse('POST', '/api/auth/login', 200, {
          'user': userJson,
          'accessToken': 'a',
          'refreshToken': 'r',
        });
        await authService.login(
          email: 'test@example.com',
          password: 'password',
        );
        final started = Completer<void>();
        final release = Completer<void>();
        mockHttp.beforeResponse = (request) async {
          if (request.url.path == '/api/auth/logout') {
            started.complete();
            await release.future;
          }
        };
        mockHttp.queueResponse('POST', '/api/auth/logout', 200, {});
        final logout = authService.logout();
        await started.future;
        expect(authService.currentUser, isNull);
        expect(await tokenStorage.hasTokens(), isFalse);
        release.complete();
        await logout;
      },
    );

    test('new session refresh does not join the old session refresh', () async {
      await tokenStorage.saveTokens(
        accessToken: 'account-a',
        refreshToken: 'refresh-a',
      );
      final started = Completer<void>();
      final release = Completer<void>();
      mockHttp.beforeResponse = (request) async {
        if (request.url.path == '/api/auth/refresh' &&
            (request as http.Request).body.contains('refresh-a')) {
          started.complete();
          await release.future;
        }
      };
      mockHttp.queueResponse('PATCH', '/api/users/me', 401, {
        'message': 'expired',
      });
      mockHttp.queueResponse('POST', '/api/auth/refresh', 200, {
        'accessToken': _jwt('user-2'),
        'refreshToken': 'rotated',
      });
      final oldRequest = apiClient.updateProfile(
        accessToken: 'account-a',
        fullName: 'A',
      );
      final oldAssertion = expectLater(
        oldRequest,
        throwsA(isA<ApiException>()),
      );
      await started.future;
      mockHttp.queueResponse('POST', '/api/auth/login', 200, {
        'user': {...userJson, 'id': 'user-2'},
        'accessToken': _jwt('user-2'),
        'refreshToken': 'refresh-b',
      });
      await authService.login(email: 'b@example.com', password: 'password');
      mockHttp.queueResponse('PATCH', '/api/users/me', 401, {
        'message': 'expired',
      });
      mockHttp.queueResponse('POST', '/api/auth/refresh', 200, {
        'accessToken': _jwt('user-2'),
        'refreshToken': 'rotated',
      });
      mockHttp.queueResponse('PATCH', '/api/users/me', 200, {
        'user': {...userJson, 'id': 'user-2'},
      });
      await authService.updateProfile(fullName: 'B');
      release.complete();
      await oldAssertion;
      expect(
        mockHttp.requests.where((r) => r.url.path == '/api/auth/refresh'),
        hasLength(2),
      );
      expect(authService.currentUser?.id, 'user-2');
    });
    for (final switchAccount in [false, true]) {
      test(
        'ignores late successful profile response (switch: $switchAccount)',
        () async {
          await loginAs('user-1');
          final started = Completer<void>();
          final release = Completer<void>();
          mockHttp.beforeResponse = (request) async {
            if (request.url.path == '/api/users/me') {
              started.complete();
              await release.future;
            }
          };
          mockHttp.queueResponse('PATCH', '/api/users/me', 200, {
            'user': userJson,
          });
          final pending = authService.updateProfile(fullName: 'Changed');
          final assertion = expectLater(pending, throwsA(isA<ApiException>()));
          await started.future;
          if (switchAccount) {
            mockHttp.queueResponse('POST', '/api/auth/login', 200, {
              'user': {...userJson, 'id': 'user-2'},
              'accessToken': 'account-b',
              'refreshToken': 'refresh-b',
            });
            await authService.login(
              email: 'b@example.com',
              password: 'password',
            );
          } else {
            mockHttp.queueResponse('POST', '/api/auth/logout', 200, {});
            await authService.logout();
          }
          release.complete();
          await assertion;
          expect(authService.currentUser?.id, switchAccount ? 'user-2' : null);
          expect(
            (await tokenStorage.getCachedUser())?.id,
            switchAccount ? 'user-2' : null,
          );
          expect(
            mockHttp.requests.where((r) => r.url.path == '/api/auth/me'),
            isEmpty,
          );
        },
      );
    }
    test('does not replay an old mutation after switching accounts', () async {
      final started = Completer<void>();
      final release = Completer<void>();
      mockHttp.beforeResponse = (request) async {
        if (request.url.path == '/api/users/me') {
          started.complete();
          await release.future;
        }
      };
      mockHttp.queueResponse('PATCH', '/api/users/me', 401, {
        'message': 'Expired',
      });
      mockHttp.queueResponse('POST', '/api/auth/login', 200, {
        'user': {...userJson, 'id': 'user-2'},
        'accessToken': 'account-b',
        'refreshToken': 'refresh-b',
      });
      final pending = apiClient.updateProfile(
        accessToken: 'account-a',
        fullName: 'Changed A',
      );
      final assertion = expectLater(pending, throwsA(isA<ApiException>()));
      await started.future;
      await authService.login(email: 'b@example.com', password: 'password');
      release.complete();
      await assertion;
      expect(
        mockHttp.requests.where((r) => r.url.path == '/api/auth/refresh'),
        isEmpty,
      );
      expect(await tokenStorage.getAccessToken(), 'account-b');
    });

    test(
      'preserves transient refresh failures instead of reporting logout',
      () async {
        await tokenStorage.saveTokens(
          accessToken: 'expired',
          refreshToken: 'refresh',
        );
        mockHttp.queueResponse('GET', '/api/uploads', 401, {
          'message': 'Expired',
        });
        mockHttp.queueResponse('POST', '/api/auth/refresh', 503, {
          'message': 'Unavailable',
        });
        await expectLater(
          apiClient.listUploads(accessToken: 'expired'),
          throwsA(
            isA<ApiException>().having(
              (error) => error.statusCode,
              'status',
              503,
            ),
          ),
        );
        expect(await tokenStorage.getRefreshToken(), 'refresh');
      },
    );

    test(
      'persists a refresh rotation that finishes after the startup timeout',
      () async {
        await tokenStorage.saveTokens(
          accessToken: _jwt('user-1'),
          refreshToken: 'refresh',
        );
        await tokenStorage.saveUser(User.fromJson(userJson));
        final release = Completer<void>();
        mockHttp.beforeResponse = (request) async {
          if (request.url.path == '/api/auth/refresh') await release.future;
        };
        mockHttp.queueResponse('GET', '/api/auth/me', 401, {
          'message': 'Expired',
        });
        mockHttp.queueResponse('POST', '/api/auth/refresh', 200, {
          'accessToken': _jwt('user-1'),
          'refreshToken': 'rotated-refresh',
        });
        final user = await authService.tryRestoreSession(
          restoreTimeout: const Duration(milliseconds: 20),
        );
        expect(user?.id, 'user-1');
        release.complete();
        await Future<void>.delayed(const Duration(milliseconds: 20));
        expect(await tokenStorage.getRefreshToken(), 'rotated-refresh');
      },
    );

    test(
      'getValidAccessToken verifies the stored subject without network preflight',
      () async {
        await loginAs('user-1');
        final requestCount = mockHttp.requests.length;

        final token = await authService.getValidAccessToken();

        expect(token, _jwt('user-1'));
        expect(mockHttp.requests, hasLength(requestCount));
      },
    );

    test('ApiClient refreshes through AuthService after an API 401', () async {
      await tokenStorage.saveTokens(
        accessToken: 'expired-access',
        refreshToken: 'usable-refresh',
      );
      mockHttp.queueResponse('GET', '/api/uploads', 401, {
        'message': 'Token expired',
      });
      mockHttp.queueResponse('POST', '/api/auth/refresh', 200, {
        'accessToken': 'new-access',
        'refreshToken': 'new-refresh',
      });
      mockHttp.queueResponse('GET', '/api/uploads', 200, {'uploads': []});

      final uploads = await apiClient.listUploads(
        accessToken: 'expired-access',
      );

      expect(uploads, isEmpty);
      expect(await tokenStorage.getAccessToken(), 'new-access');
      expect(await tokenStorage.getRefreshToken(), 'new-refresh');
      expect(mockHttp.requests.map((request) => request.url.path), [
        '/api/uploads',
        '/api/auth/refresh',
        '/api/uploads',
      ]);
    });

    test('clears tokens when API 401 refresh fails', () async {
      await tokenStorage.saveTokens(
        accessToken: 'expired-access',
        refreshToken: 'invalid-refresh',
      );
      mockHttp.queueResponse('GET', '/api/uploads', 401, {
        'message': 'Token expired',
      });
      mockHttp.queueResponse('POST', '/api/auth/refresh', 401, {
        'message': 'Invalid refresh token',
      });

      await expectLater(
        apiClient.listUploads(accessToken: 'expired-access'),
        throwsA(
          isA<ApiException>().having(
            (error) => error.statusCode,
            'statusCode',
            401,
          ),
        ),
      );
      expect(await tokenStorage.hasTokens(), isFalse);
      expect(authService.currentUser, isNull);
    });

    test(
      'tryRestoreSession does not automatically refresh before explicit refresh',
      () async {
        await tokenStorage.saveTokens(
          accessToken: 'expired-access',
          refreshToken: 'usable-refresh',
        );
        mockHttp.queueResponse('GET', '/api/auth/me', 401, {
          'message': 'Token expired',
        });
        mockHttp.queueResponse('POST', '/api/auth/refresh', 500, {
          'message': 'Server error',
        });

        final user = await authService.tryRestoreSession();

        expect(user, isNull);
        expect(
          mockHttp.requests.where(
            (request) => request.url.path == '/api/auth/me',
          ),
          hasLength(1),
        );
        expect(
          mockHttp.requests.where(
            (request) => request.url.path == '/api/auth/refresh',
          ),
          hasLength(1),
        );
      },
    );

    test('getValidAccessToken returns null when no tokens exist', () async {
      final token = await authService.getValidAccessToken();
      expect(token, isNull);
      expect(authService.currentUser, isNull);
    });

    test(
      'updateProfile retries with refreshed token and uses the mutation response',
      () async {
        await loginAs('user-1');
        mockHttp.queueResponse('PATCH', '/api/users/me', 401, {
          'message': 'Token expired',
        });
        mockHttp.queueResponse('POST', '/api/auth/refresh', 200, {
          'accessToken': _jwt('user-1'),
          'refreshToken': 'new-refresh',
        });
        mockHttp.queueResponse('PATCH', '/api/users/me', 200, {
          'user': userJson,
        });

        await authService.updateProfile(fullName: 'Updated User');
        expect(
          mockHttp.requests.where((r) => r.url.path == '/api/auth/me'),
          isEmpty,
        );

        expect(
          mockHttp.requests.where(
            (request) => request.url.path == '/api/auth/refresh',
          ),
          hasLength(1),
        );
        expect(
          mockHttp.requests.last.headers['authorization'],
          'Bearer ${_jwt('user-1')}',
        );
      },
    );
  });

  group('AuthService - logout', () {
    test('a late refresh cannot restore tokens after logout', () async {
      await tokenStorage.saveTokens(
        accessToken: 'expired',
        refreshToken: 'refresh',
      );
      final started = Completer<void>();
      final release = Completer<void>();
      mockHttp.beforeResponse = (request) async {
        if (request.url.path == '/api/auth/refresh') {
          started.complete();
          await release.future;
        }
      };
      mockHttp.queueResponse('GET', '/api/uploads', 401, {
        'message': 'Expired',
      });
      mockHttp.queueResponse('POST', '/api/auth/refresh', 200, {
        'accessToken': 'late-access',
        'refreshToken': 'late-refresh',
      });
      mockHttp.queueResponse('POST', '/api/auth/logout', 200, {});
      final request = expectLater(
        apiClient.listUploads(accessToken: 'expired'),
        throwsA(isA<ApiException>()),
      );
      await started.future;
      await authService.logout();
      release.complete();
      await request;
      expect(await tokenStorage.hasTokens(), isFalse);
    });
    test('logout clears local tokens even when backend logout fails', () async {
      await tokenStorage.saveTokens(
        accessToken: 'access',
        refreshToken: 'refresh',
      );
      // Pre-set current user to simulate being logged in
      // (we can't set _currentUser directly, but tryRestoreSession can)
      mockHttp.queueResponse('GET', '/api/auth/me', 200, {'user': userJson});
      await authService.tryRestoreSession();
      expect(authService.currentUser, isNotNull);

      // Backend logout fails
      mockHttp.queueResponse('POST', '/api/auth/logout', 500, {
        'message': 'Server error',
      });

      final states = <User?>[];
      final sub = authService.authStateChanges.listen((u) => states.add(u));

      await authService.logout();

      // Verify local state is cleared despite backend error
      expect(await tokenStorage.hasTokens(), isFalse);
      expect(authService.currentUser, isNull);
      expect(states, contains(null));

      await sub.cancel();
    });

    test('logout clears local state when backend logout times out', () async {
      await tokenStorage.saveTokens(
        accessToken: 'access',
        refreshToken: 'refresh',
      );
      final timeoutApiClient = ApiClient(
        httpClient: mockHttp,
        env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
        requestTimeout: const Duration(milliseconds: 1),
      );
      final timeoutAuthService = AuthService(
        apiClient: timeoutApiClient,
        tokenStorage: tokenStorage,
      );
      mockHttp.queueResponse('GET', '/api/auth/me', 200, {'user': userJson});
      await timeoutAuthService.tryRestoreSession();
      mockHttp.beforeResponse = (request) {
        if (request.url.path == '/api/auth/logout') {
          return Completer<void>().future;
        }
        return Future<void>.value();
      };

      await expectLater(timeoutAuthService.logout(), completes);
      expect(await tokenStorage.hasTokens(), isFalse);
      expect(timeoutAuthService.currentUser, isNull);
    });

    test('logout clears local tokens when backend logout succeeds', () async {
      await tokenStorage.saveTokens(
        accessToken: 'access',
        refreshToken: 'refresh',
      );

      mockHttp.queueResponse('POST', '/api/auth/logout', 200, {
        'message': 'Logged out',
      });

      final states = <User?>[];
      final sub = authService.authStateChanges.listen((u) => states.add(u));

      await authService.logout();

      expect(await tokenStorage.hasTokens(), isFalse);
      expect(authService.currentUser, isNull);
      expect(states, contains(null));

      await sub.cancel();
    });

    test('logout is safe when already logged out', () async {
      // No tokens, no current user
      await authService.logout(); // should not throw
      expect(authService.currentUser, isNull);
    });
  });

  group('AuthService - register/login/store tokens', () {
    test('register stores tokens and sets currentUser', () async {
      mockHttp.queueResponse('POST', '/api/auth/register', 201, {
        'user': userJson,
        'accessToken': 'reg-access',
        'refreshToken': 'reg-refresh',
      });

      final states = <User?>[];
      final sub = authService.authStateChanges.listen((u) => states.add(u));

      final user = await authService.register(
        email: 'test@example.com',
        password: 'pass',
        fullName: 'Test User',
      );

      expect(user.email, 'test@example.com');
      expect(await tokenStorage.getAccessToken(), 'reg-access');
      expect(await tokenStorage.getRefreshToken(), 'reg-refresh');
      expect(authService.currentUser?.email, 'test@example.com');
      expect(states, [isNotNull]);

      await sub.cancel();
    });

    test('login stores tokens and sets currentUser', () async {
      mockHttp.queueResponse('POST', '/api/auth/login', 200, {
        'user': userJson,
        'accessToken': 'login-access',
        'refreshToken': 'login-refresh',
      });

      final states = <User?>[];
      final sub = authService.authStateChanges.listen((u) => states.add(u));

      final user = await authService.login(
        email: 'test@example.com',
        password: 'pass',
      );

      expect(user.email, 'test@example.com');
      expect(await tokenStorage.getAccessToken(), 'login-access');
      expect(await tokenStorage.getRefreshToken(), 'login-refresh');
      expect(authService.currentUser?.email, 'test@example.com');
      expect(states, [isNotNull]);

      await sub.cancel();
    });
  });
}
