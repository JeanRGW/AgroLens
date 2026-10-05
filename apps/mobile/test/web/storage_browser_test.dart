@TestOn('browser')
library;

import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:typed_data';

import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/models/pending_upload.dart';
import 'package:agrolens/services/api_client.dart';
import 'package:agrolens/services/app_database.dart' show AppDatabase;
import 'package:agrolens/services/auth_service.dart';
import 'package:agrolens/services/database_helper.dart';
import 'package:agrolens/services/local_image_store_web.dart';
import 'package:agrolens/services/token_storage.dart';
import 'package:agrolens/utils/upload_validation.dart';
import 'package:agrolens/utils/image_naming.dart';
import 'package:agrolens/utils/storage_guard_web.dart';
import 'package:agrolens/utils/offline_shell_web.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_secure_storage_web/flutter_secure_storage_web.dart';
import 'package:flutter_web_plugins/flutter_web_plugins.dart';
import 'package:drift/drift.dart' show LazyDatabase;
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image_picker/image_picker.dart';
import 'package:web/web.dart' as web;

String _token(String owner) =>
    'header.${base64Url.encode(utf8.encode(jsonEncode({'sub': owner})))}.signature';

ApiClient _api(String owner) => ApiClient(
  env: const EnvConfig(apiBaseUrl: 'https://test.invalid/api'),
  httpClient: MockClient(
    (request) async => http.Response(
      jsonEncode({
        'accessToken': _token(owner),
        'refreshToken': 'refresh-$owner',
        'user': {
          'id': owner,
          'email': '$owner@test',
          'fullName': owner,
          'role': 'user',
          'createdAt': '2026-01-01T00:00:00Z',
          'updatedAt': '2026-01-01T00:00:00Z',
        },
      }),
      200,
    ),
  ),
);

class _PausedStore extends WebLocalImageStore {
  final saved = Completer<void>();
  final release = Completer<void>();

  @override
  Future<String> saveImage({
    required XFile file,
    required String fileName,
  }) async {
    final path = await super.saveImage(file: file, fileName: fileName);
    saved.complete();
    await release.future;
    return path;
  }
}

class _QueueDatabase extends AppDatabase {
  _QueueDatabase()
    : super(
        executor: LazyDatabase(
          () async => throw StateError('SQL is not used in this lock test'),
        ),
      );
  final rows = <String, Map<String, dynamic>>{};
  Future<void> Function()? beforeSave;
  @override
  Future<int> saveRow(String table, Map<String, Object?> row) async {
    await beforeSave?.call();
    rows[row['id'] as String] = Map<String, dynamic>.from(row);
    return 1;
  }

  @override
  Future<List<Map<String, dynamic>>> readRows(
    String sql, [
    List<Object?> arguments = const [],
  ]) async => arguments.isEmpty
      ? rows.values.toList()
      : [if (rows[arguments.first] != null) rows[arguments.first]!];
  @override
  Future<int> deleteRows(
    String table,
    String where,
    List<Object?> arguments,
  ) async {
    rows.remove(arguments.first);
    return 1;
  }
}

Future<web.HTMLIFrameElement> _peerDocument() async {
  final frame = web.HTMLIFrameElement()..srcdoc = '<!doctype html>'.toJS;
  final loaded = Completer<void>();
  frame.onload = ((web.Event _) => loaded.complete()).toJS;
  web.document.body!.append(frame);
  await loaded.future;
  addTearDown(() => frame.remove());
  return frame;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  FlutterSecureStorageWeb.registerWith(webPluginRegistrar);

  for (final scope in ['/', '/m/', '/custom/mobile/']) {
    test('offline readiness uses the registered scope $scope', () async {
      final serviceWorker = web.window.navigator.serviceWorker;
      final cache = web.window.caches;
      final originalRegistration = serviceWorker.getProperty<JSFunction>(
        'getRegistration'.toJS,
      );
      final originalMatch = cache.getProperty<JSFunction>('match'.toJS);
      final registration = JSObject()
        ..setProperty('scope'.toJS, '${web.window.location.origin}$scope'.toJS)
        ..setProperty('active'.toJS, JSObject());
      String? requestedUrl;
      bool hasMarker = true;
      serviceWorker.setProperty(
        'getRegistration'.toJS,
        (() => Future<JSObject>.value(registration).toJS).toJS,
      );
      cache.setProperty(
        'match'.toJS,
        ((JSAny request) {
          requestedUrl = (request as JSString).toDart;
          return Future<web.Response?>.value(
            hasMarker ? web.Response('{}'.toJS) : null,
          ).toJS;
        }).toJS,
      );
      try {
        expect(await isOfflineShellReady(), isTrue);
        expect(
          requestedUrl,
          '${web.window.location.origin}${scope}offline-ready.json',
        );
        hasMarker = false;
        expect(await isOfflineShellReady(), isFalse);
        registration.setProperty('active'.toJS, null);
        requestedUrl = null;
        expect(await isOfflineShellReady(), isFalse);
        expect(requestedUrl, isNull);
      } finally {
        serviceWorker.setProperty('getRegistration'.toJS, originalRegistration);
        cache.setProperty('match'.toJS, originalMatch);
      }
    });
  }

  test(
    'a second PWA database instance is blocked until the first closes',
    () async {
      final first = StorageGuard();
      final second = StorageGuard();
      await first.acquire();
      await expectLater(second.acquire(), throwsStateError);
      first.release();
      final reopened = StorageGuard();
      await reopened.acquire();
      reopened.release();
    },
  );

  test(
    'concurrent auth coordinators rotate a shared refresh token only once',
    () async {
      final storage = TokenStorage();
      final oldAccess = _token('a');
      final newAccess = '${_token('a')}new';
      final user = {
        'id': 'a',
        'email': 'a@test',
        'fullName': 'a',
        'role': 'user',
        'createdAt': '2026-01-01T00:00:00Z',
        'updatedAt': '2026-01-01T00:00:00Z',
      };
      final started = Completer<void>();
      final release = Completer<void>();
      var refreshes = 0;
      ApiClient api() => ApiClient(
        env: const EnvConfig(apiBaseUrl: 'https://test.invalid/api'),
        httpClient: MockClient((request) async {
          if (request.url.path.endsWith('/refresh')) {
            refreshes++;
            if (!started.isCompleted) started.complete();
            await release.future;
            return http.Response(
              jsonEncode({'accessToken': newAccess, 'refreshToken': 'rotated'}),
              200,
            );
          }
          if (request.url.path.endsWith('/login')) {
            return http.Response(
              jsonEncode({
                'accessToken': oldAccess,
                'refreshToken': 'original',
                'user': user,
              }),
              200,
            );
          }
          if (request.url.path.endsWith('/users/me') &&
              request.headers['Authorization'] == 'Bearer $oldAccess') {
            return http.Response('{"message":"expired"}', 401);
          }
          return http.Response(jsonEncode({'user': user}), 200);
        }),
      );
      final apiA = api();
      final authA = AuthService(apiClient: apiA, tokenStorage: storage);
      await authA.login(email: 'a@test', password: 'password');
      final apiB = api();
      final authB = AuthService(apiClient: apiB, tokenStorage: storage);
      await authB.tryRestoreSession();
      try {
        final a = authA.updateProfile(fullName: 'a');
        await started.future;
        final b = authB.updateProfile(fullName: 'a');
        await Future<void>.delayed(const Duration(milliseconds: 50));
        release.complete();
        await Future.wait([a, b]);
        expect(refreshes, 1);
        expect(authA.currentUser?.id, 'a');
        expect(authB.currentUser?.id, 'a');
        expect(await storage.getRefreshToken(), 'rotated');
      } finally {
        if (!release.isCompleted) release.complete();
        authA.dispose();
        authB.dispose();
        apiA.dispose();
        apiB.dispose();
        await storage.clearAll();
      }
    },
  );

  test(
    'picker-style blob URL originals validate and persist without renaming',
    () async {
      final bytes = Uint8List.fromList([0xff, 0xd8, 0xff]);
      final url = web.URL.createObjectURL(
        web.Blob([bytes.toJS].toJS, web.BlobPropertyBag(type: 'image/jpeg')),
      );
      addTearDown(() => web.URL.revokeObjectURL(url));
      final file = XFile(
        url,
        name: 'picker.heic',
        mimeType: 'image/heic',
        length: bytes.length,
      );
      expect(await validateUploadFiles([file]), isNull);
      final extension = await imageExtension(file);
      expect(extension, '.jpg');
      final images = WebLocalImageStore();
      final path = await images.saveImage(
        file: file,
        fileName: 'picker-regression$extension',
      );
      addTearDown(() => images.deleteImage(path));
      expect(await images.readBytes(path), bytes);
    },
  );

  test(
    'fresh web encryption can decrypt both tokens after the first save',
    () async {
      const key = 'AgroLens-token-regression';
      web.window.localStorage.removeItem(key);
      final storage = TokenStorage(
        storage: const FlutterSecureStorage(
          webOptions: WebOptions(publicKey: key),
        ),
      );
      await storage.saveTokens(
        accessToken: _token('a'),
        refreshToken: 'refresh-a',
      );
      final reopened = TokenStorage(
        storage: const FlutterSecureStorage(
          webOptions: WebOptions(publicKey: key),
        ),
      );
      expect(await reopened.getAccessToken(), _token('a'));
      expect(await reopened.getRefreshToken(), 'refresh-a');
      await storage.clearAll();
      web.window.localStorage.removeItem(key);
    },
  );

  test(
    'a browser storage event invalidates the PWA without clearing shared tokens',
    () async {
      final storage = TokenStorage();
      final api = _api('a');
      final auth = AuthService(apiClient: api, tokenStorage: storage);
      addTearDown(auth.dispose);
      addTearDown(api.dispose);
      await auth.login(email: 'a@test', password: 'password');
      final generation = auth.sessionGeneration;
      await storage.saveTokens(
        accessToken: _token('b'),
        refreshToken: 'refresh-b',
      );
      final peer = await _peerDocument();
      final invalidated = auth.authStateChanges.firstWhere(
        (user) => user == null,
      );
      peer.contentWindow!.localStorage.setItem(
        'agrolens:mobile-session',
        'other-tab',
      );
      await invalidated.timeout(const Duration(seconds: 2));
      expect(auth.currentUser, isNull);
      expect(auth.sessionGeneration, greaterThan(generation));
      expect(await storage.getRefreshToken(), 'refresh-b');
      await storage.clearAll();
    },
  );

  test(
    'cleanup waits until a saved original has its queue reference',
    () async {
      final api = _api('a');
      final auth = AuthService(apiClient: api, tokenStorage: TokenStorage());
      await auth.login(email: 'a@test', password: 'password');
      final db = _QueueDatabase();
      final saver = DatabaseHelper(appDatabase: db, authService: auth);
      final cleaner = DatabaseHelper(appDatabase: db, authService: auth);
      final store = _PausedStore();
      final file = XFile.fromData(
        Uint8List.fromList([0xff, 0xd8, 0xff]),
        name: 'photo.jpg',
      );
      final saving = saver.saveUploadImages(
        files: [file],
        imageStore: store,
        createUpload: (paths) => PendingUpload(
          id: 'locked-batch',
          ownerId: 'a',
          paths: paths,
          createdAt: DateTime.now(),
        ),
      );
      await store.saved.future;
      final peer = await _peerDocument();
      var peerAcquired = false;
      var peerSawReference = false;
      final peerLock = peer.contentWindow!.navigator.locks
          .request(
            'agrolens-image-queue',
            ((web.Lock? _) {
              peerAcquired = true;
              peerSawReference = db.rows['locked-batch'] != null;
            }).toJS,
          )
          .toDart;
      var cleanupFinished = false;
      final cleanup = cleaner.cleanupOrphanedImages(imageStore: store).then((
        count,
      ) {
        cleanupFinished = true;
        return count;
      });
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(cleanupFinished, isFalse);
      expect(peerAcquired, isFalse);
      store.release.complete();
      await saving;
      await peerLock;
      expect(peerAcquired, isTrue);
      expect(peerSawReference, isTrue);
      expect(await cleanup, 0);
      final upload = (await saver.getUploadById('locked-batch'))!;
      expect(await store.readBytes(upload.paths.single), [0xff, 0xd8, 0xff]);
      await store.deleteImage(upload.paths.single);
      await saver.deleteUpload(upload.id);
      await saver.close();
      await cleaner.close();
      await auth.logout();
      auth.dispose();
      api.dispose();
    },
  );

  test(
    'draft removal keeps the image-queue lock through commit and cleanup',
    () async {
      final api = _api('a');
      final auth = AuthService(apiClient: api, tokenStorage: TokenStorage());
      await auth.login(email: 'a@test', password: 'password');
      final db = _QueueDatabase();
      final helper = DatabaseHelper(appDatabase: db, authService: auth);
      final store = WebLocalImageStore();
      final started = Completer<void>();
      final release = Completer<void>();
      Future<PendingUpload>? saving;
      Future<JSAny?>? peerLock;
      try {
        final draft = await helper.saveUploadImages(
          files: [
            XFile.fromData(
              Uint8List.fromList([0xff, 0xd8, 0xff]),
              name: 'removed.jpg',
            ),
          ],
          imageStore: store,
          createUpload: (paths) => PendingUpload(
            id: 'removed-draft',
            ownerId: 'a',
            createdAt: DateTime.utc(2026),
            status: PendingUploadStatus.draft,
            paths: paths,
          ),
        );
        db.beforeSave = () async {
          started.complete();
          await release.future;
        };
        saving = helper.saveUploadImages(
          files: [],
          imageStore: store,
          createUpload: (_) => draft.copyWith(images: []),
        );
        await started.future;
        final peer = await _peerDocument();
        var peerAcquired = false;
        var peerSawCleanup = false;
        peerLock = peer.contentWindow!.navigator.locks
            .request(
              'agrolens-image-queue',
              ((web.Lock? _) => (() async {
                peerAcquired = true;
                peerSawCleanup = !await store.exists(draft.paths.single);
              })().toJS).toJS,
            )
            .toDart;
        await Future<void>.delayed(const Duration(milliseconds: 50));
        expect(peerAcquired, isFalse);
        expect(await store.exists(draft.paths.single), isTrue);
        expect((await helper.getUploadById(draft.id))!.paths, draft.paths);
        release.complete();
        await saving;
        await peerLock;
        expect(peerSawCleanup, isTrue);
        db.beforeSave = null;
        await helper.discardDraft(draft.id, imageStore: store);
      } finally {
        if (!release.isCompleted) release.complete();
        await saving;
        await peerLock;
        db.beforeSave = null;
        await helper.close();
        await auth.logout();
        auth.dispose();
        api.dispose();
      }
    },
  );

  test(
    'transaction abort after request success rejects instead of hanging',
    () async {
      final db = JSObject();
      final txn = JSObject();
      final store = JSObject();
      db.setProperty(
        'transaction'.toJS,
        ((JSAny? names, String mode) => txn).toJS,
      );
      txn.setProperty('objectStore'.toJS, ((String name) => store).toJS);
      txn.setProperty('abort'.toJS, (() {}).toJS);
      store.setProperty(
        'put'.toJS,
        ((JSAny? value, JSAny? key) {
          final request = JSObject();
          request.setProperty('result'.toJS, key);
          scheduleMicrotask(() {
            request
                .getProperty<JSFunction>('onsuccess'.toJS)
                .callAsFunction(request, web.Event('success'));
            scheduleMicrotask(
              () => txn
                  .getProperty<JSFunction>('onabort'.toJS)
                  .callAsFunction(txn, web.Event('abort')),
            );
          });
          return request;
        }).toJS,
      );
      final images = WebLocalImageStore(
        openDatabase: () async => db as web.IDBDatabase,
      );
      await expectLater(
        images
            .saveImage(
              file: XFile.fromData(Uint8List.fromList([1])),
              fileName: 'abort.jpg',
            )
            .timeout(const Duration(seconds: 2)),
        throwsStateError,
      );
    },
  );
}
