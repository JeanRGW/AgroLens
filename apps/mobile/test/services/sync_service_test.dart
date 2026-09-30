import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/models/catalog.dart';
import 'package:agrolens/models/pending_upload.dart';
import 'package:agrolens/models/upload_response.dart';
import 'package:agrolens/services/api_client.dart';
import 'package:agrolens/services/app_database.dart' show AppDatabase;
import 'package:agrolens/services/auth_service.dart';
import 'package:agrolens/services/catalog_repository.dart';
import 'package:agrolens/services/database_helper.dart';
import 'package:agrolens/services/sync_service.dart';
import 'package:agrolens/services/token_storage.dart';
import '../helpers/test_doubles.dart';

/// Creates a temp file for upload reading tests.
Future<File> createTempFile(String path, String content) async {
  final file = File(path);
  await file.parent.create(recursive: true);
  await file.writeAsString(content);
  return file;
}

void main() {
  late MockHttpClient mockHttp;
  late ApiClient apiClient;
  late TokenStorage tokenStorage;
  late AuthService authService;
  late AppDatabase appDb;
  late CatalogRepository catalogRepository;
  late DatabaseHelper databaseHelper;
  late SyncService syncService;

  setUp(() async {
    mockHttp = MockHttpClient();
    mockHttp.transformResponse = (request, body) {
      if (request.method != 'POST' ||
          request.url.path != '/api/uploads/init' ||
          request is! http.Request) {
        return body;
      }
      final descriptors =
          (jsonDecode(request.body) as Map<String, dynamic>)['files']
              as List<dynamic>;
      final files = body['files'] as List<dynamic>? ?? [];
      return {
        ...body,
        'files': [
          for (var i = 0; i < files.length; i++)
            {
              ...(files[i] as Map<String, dynamic>),
              'imageId': (descriptors[i] as Map<String, dynamic>)['imageId'],
            },
        ],
      };
    };
    apiClient = ApiClient(
      httpClient: mockHttp,
      env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
    );
    tokenStorage = TokenStorage(storage: FakeFlutterSecureStorage());
    authService = FakeAuthService(
      apiClient: apiClient,
      tokenStorage: tokenStorage,
    );
    appDb = createTestAppDatabase();
    catalogRepository = CatalogRepository(
      appDatabase: appDb,
      apiClient: apiClient,
      authService: authService,
    );
    databaseHelper = DatabaseHelper(
      appDatabase: appDb,
      authService: authService,
    );

    // Pre-authenticate: save tokens and restore session
    await tokenStorage.saveTokens(
      accessToken: testAccessToken('user-1'),
      refreshToken: 'refresh-456',
    );
    final now = DateTime.now().toIso8601String();
    mockHttp.queueResponse('POST', '/api/auth/refresh', 200, {
      'accessToken': testAccessToken('user-1'),
      'refreshToken': 'refresh-new',
    });
    mockHttp.queueResponse('GET', '/api/auth/me', 200, {
      'user': {
        'id': 'user-1',
        'email': 'test@example.com',
        'fullName': 'Test User',
        'phone': null,
        'role': 'user',
        'disabledAt': null,
        'createdAt': now,
        'updatedAt': now,
      },
    });
    await authService.tryRestoreSession();

    // These uploads represent records already created on the server. Keep
    // them in the catalog cache so resolveCatalogId can distinguish server IDs
    // from the local IDs covered by the blocking test below.
    final catalogDb = catalogRepository.database;
    final serverCatalogFixtures = <String, List<String>>{
      'catalog_properties': ['prop-uuid', 'p', 'p1', 'p2'],
      'catalog_talhoes': ['talhao-uuid', 't', 't1', 't2'],
      'catalog_crop_types': ['crop-uuid', 'c', 'c1', 'c2'],
    };
    for (final entry in serverCatalogFixtures.entries) {
      for (final id in entry.value) {
        await catalogDb.saveRow(entry.key, {
          'id': id,
          'owner_id': 'user-1',
          'data': '{}',
          'cached_at': DateTime.now().millisecondsSinceEpoch,
          'is_pending_sync': 0,
          'sync_error': null,
        });
      }
    }

    syncService = SyncService(
      apiClient: apiClient,
      authService: authService,
      databaseHelper: databaseHelper,
      catalogRepository: catalogRepository,
    );
  });

  tearDown(() async {
    await appDb.close();
  });

  for (final step in ['originals', 'complete', 'poll']) {
    test('stopping during $step rejects the late response', () async {
      final dir = await Directory.systemTemp.createTemp('sync-session-');
      addTearDown(() => dir.delete(recursive: true));
      final image = await createTempFile('${dir.path}/image.jpg', 'bytes');
      final upload = PendingUpload(
        id: 'late-$step',
        paths: [image.path],
        latitude: 0,
        longitude: 0,
        createdAt: DateTime.utc(2026),
        status: PendingUploadStatus.pendingMetadataSync,
        backendUploadId: 'backend-late',
        backendStatus: 'draft',
      );
      await databaseHelper.insertPendingUpload(upload);
      final started = Completer<void>();
      final release = Completer<void>();
      mockHttp.beforeResponse = (_) async {
        started.complete();
        await release.future;
      };
      mockHttp.queueResponse('PUT', '/original', 200, {});
      mockHttp.queueResponse(
        'POST',
        '/api/uploads/backend-late/complete',
        200,
        {
          'upload': {'id': 'backend-late', 'status': 'finalizing'},
        },
      );
      mockHttp.queueResponse('GET', '/api/uploads/backend-late', 200, {
        'id': 'backend-late',
        'status': 'ready',
        'propertyId': 'p',
        'talhaoId': 't',
        'cropTypeId': 'c',
        'latitude': 0,
        'longitude': 0,
        'source': 'phone',
        'activityDate': '2026-01-01T00:00:00Z',
        'createdAt': '2026-01-01T00:00:00Z',
        'updatedAt': '2026-01-01T00:00:00Z',
        'files': [],
      });
      final pending = switch (step) {
        'originals' => syncService.stepUploadOriginals(upload, upload.paths, [
          PresignedUploadUrl.fromJson({
            'imageId': upload.images.single.imageId,
            'fileId': 'file',
            'objectKey': 'original',
            'uploadUrl': 'https://storage.example.com/original',
            'expiresAt': '2026-01-01T00:00:00Z',
          }),
        ]),
        'complete' => syncService.stepComplete(upload),
        _ => syncService.stepPollUntilReady(
          upload: upload,
          pollInterval: Duration.zero,
        ),
      };
      final assertion = expectLater(pending, throwsA(isA<ApiException>()));
      await started.future;
      syncService.stop();
      release.complete();
      await assertion;
      final saved = (await databaseHelper.getUploadById(upload.id))!;
      expect(saved.backendStatus, 'draft');
      expect(saved.status, PendingUploadStatus.pendingMetadataSync);
    });
  }

  test(
    'catalog waiting keeps its retry budget and catalog-first sync recovers it',
    () async {
      mockHttp.queueResponse('POST', '/api/properties', 503, {
        'message': 'unavailable',
      });
      final property = await catalogRepository.createProperty(
        name: 'Field',
        owner: 'Owner',
        address: 'Address',
        latitude: 1,
        longitude: 2,
      );
      final dir = await Directory.systemTemp.createTemp('sync-dependency-');
      addTearDown(() => dir.delete(recursive: true));
      final image = await createTempFile('${dir.path}/image.jpg', 'bytes');
      final upload = PendingUpload(
        id: 'dependency',
        paths: [image.path],
        latitude: 1,
        longitude: 2,
        createdAt: DateTime.utc(2026),
        propertyId: property.id,
        talhaoId: 't',
        cropTypeId: 'c',
        syncAttemptCount: 4,
      );
      await databaseHelper.insertPendingUpload(upload);
      await syncService.syncAll();
      await syncService.syncAll();
      expect(
        (await databaseHelper.getUploadById(upload.id))!.syncAttemptCount,
        4,
      );
      final now = DateTime.utc(2026).toIso8601String();
      mockHttp.queueResponse('POST', '/api/properties', 200, {
        'property': {
          'id': 'server-property',
          'name': 'Field',
          'owner': 'Owner',
          'address': 'Address',
          'latitude': 1,
          'longitude': 2,
          'userId': 'user-1',
          'createdAt': now,
          'updatedAt': now,
        },
      });
      mockHttp.queueResponse('POST', '/api/uploads/init', 200, {
        'uploadId': 'server-upload',
        'status': 'ready',
        'files': [],
      });
      final result = await syncService.syncPendingCatalogsAndUploads();
      expect(result!.successful, 1);
      final request = mockHttp.requests.last as http.Request;
      expect(jsonDecode(request.body)['propertyId'], 'server-property');
      expect(
        (await databaseHelper.getUploadById(upload.id))!.status,
        PendingUploadStatus.completed,
      );
    },
  );

  group('SyncService - stepInit', () {
    test('sends actual local file size in init descriptors', () async {
      final file = await createTempFile(
        '/tmp/agrolens-init-size.jpg',
        '1234567',
      );
      addTearDown(() => file.delete());
      final upload = PendingUpload(
        id: 'init-size-test-uuid',
        paths: [file.path],
        latitude: -22.9,
        longitude: -43.1,
        createdAt: DateTime.now(),
        activityDate: DateTime.parse('2026-06-29T12:00:00Z'),
        propertyId: 'prop-uuid',
        talhaoId: 'talhao-uuid',
        cropTypeId: 'crop-uuid',
        source: 'phone',
      );
      mockHttp.queueResponse('POST', '/api/uploads/init', 201, {
        'uploadId': 'backend-init-size-uuid',
        'status': 'draft',
        'files': [],
      });

      await syncService.stepInit(upload);

      final request =
          mockHttp.requests
                  .where(
                    (r) =>
                        r.method == 'POST' && r.url.path == '/api/uploads/init',
                  )
                  .single
              as http.Request;
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      expect((body['files'] as List).single['sizeBytes'], 7);
    });

    test('maps a missing local file to LOCAL_FILE_UNAVAILABLE', () async {
      final upload = PendingUpload(
        id: 'missing-file-upload',
        paths: ['/tmp/agrolens-missing-file.jpg'],
        latitude: -22.9,
        longitude: -43.1,
        createdAt: DateTime.now(),
        propertyId: 'prop-uuid',
        talhaoId: 'talhao-uuid',
        cropTypeId: 'crop-uuid',
        source: 'phone',
      );
      await databaseHelper.insertPendingUpload(upload);

      final result = await syncService.syncAll();

      expect(result.failed, 1);
      expect(result.failures.single.code, 'LOCAL_FILE_UNAVAILABLE');
      final persisted = (await databaseHelper.getAllUploads()).single;
      expect(persisted.syncErrorCode, 'LOCAL_FILE_UNAVAILABLE');
    });

    test('creates upload and stores backendUploadId', () async {
      final image = await createTempFile(
        '/tmp/agrolens-init-test.jpg',
        'init_test_bytes',
      );
      addTearDown(() => image.delete());
      final upload = PendingUpload(
        id: 'init-test-uuid',
        paths: [image.path],
        latitude: -22.9,
        longitude: -43.1,
        createdAt: DateTime.now(),
        activityDate: DateTime.parse('2026-06-29T12:00:00Z'),
        propertyId: 'prop-uuid',
        talhaoId: 'talhao-uuid',
        cropTypeId: 'crop-uuid',
        source: 'phone',
      );

      mockHttp.queueResponse('POST', '/api/uploads/init', 201, {
        'uploadId': 'backend-init-uuid',
        'status': 'draft',
        'files': [
          {
            'fileId': 'f1',
            'objectKey': 'uploads/u/0/original.jpeg',
            'uploadUrl': 'https://storage.example.com/put-init',
            'expiresAt': '2026-07-01T00:00:00Z',
          },
        ],
      });

      final result = await syncService.stepInit(upload);
      expect(result.upload.backendUploadId, 'backend-init-uuid');
      expect(result.upload.status, PendingUploadStatus.uploading);
      expect(result.presignedUrls.length, 1);
      expect(
        result.presignedUrls.first.url,
        'https://storage.example.com/put-init',
      );

      final initRequest =
          mockHttp.requests.firstWhere(
                (r) => r.method == 'POST' && r.url.path == '/api/uploads/init',
              )
              as http.Request;
      final body = jsonDecode(initRequest.body) as Map<String, dynamic>;
      expect(body['activityDate'], '2026-06-29T12:00:00.000Z');
    });

    test(
      'blocks uploads that still reference unmapped local catalog ids',
      () async {
        final catalogDb = catalogRepository.database;
        final serverNow = DateTime.utc(2026, 7, 1).millisecondsSinceEpoch;
        await catalogDb.saveRow('catalog_properties', {
          'id': 'tmp-prop',
          'owner_id': 'user-1',
          'data': jsonEncode(
            Property(
              id: 'tmp-prop',
              name: 'Fazenda Pendente',
              userId: 'user-1',
              createdAt: DateTime.utc(2026, 7, 1),
              updatedAt: DateTime.utc(2026, 7, 1),
              owner: 'Maria',
              address: 'Rua A',
              latitude: -22.9,
              longitude: -43.1,
              isPendingSync: true,
              syncError: 'Pendente de sincronização',
            ).toJson(),
          ),
          'cached_at': serverNow,
          'is_pending_sync': 1,
          'sync_error': 'Pendente de sincronização',
        });
        await catalogDb.saveRow('catalog_talhoes', {
          'id': 'tmp-talhao',
          'owner_id': 'user-1',
          'data': jsonEncode(
            Talhao(
              id: 'tmp-talhao',
              name: 'Talhão Pendente',
              userId: 'user-1',
              createdAt: DateTime.utc(2026, 7, 1),
              updatedAt: DateTime.utc(2026, 7, 1),
              propertyId: 'tmp-prop',
              isPendingSync: true,
              syncError: 'Pendente de sincronização',
            ).toJson(),
          ),
          'cached_at': serverNow,
          'is_pending_sync': 1,
          'sync_error': 'Pendente de sincronização',
        });
        await catalogDb.saveRow('catalog_crop_types', {
          'id': 'tmp-crop',
          'owner_id': 'user-1',
          'data': jsonEncode(
            CropType(
              id: 'tmp-crop',
              name: 'Soja Pendente',
              userId: 'user-1',
              createdAt: DateTime.utc(2026, 7, 1),
              updatedAt: DateTime.utc(2026, 7, 1),
              isPendingSync: true,
              syncError: 'Pendente de sincronização',
            ).toJson(),
          ),
          'cached_at': serverNow,
          'is_pending_sync': 1,
          'sync_error': 'Pendente de sincronização',
        });

        final image = await createTempFile(
          '/tmp/agrolens-blocked.jpg',
          'blocked_bytes',
        );
        addTearDown(() => image.delete());
        final upload = PendingUpload(
          id: 'blocked-upload',
          paths: [image.path],
          latitude: -22.9,
          longitude: -43.1,
          createdAt: DateTime.now(),
          activityDate: DateTime.parse('2026-06-29T12:00:00Z'),
          propertyId: 'tmp-prop',
          talhaoId: 'tmp-talhao',
          cropTypeId: 'tmp-crop',
          source: 'phone',
        );
        await databaseHelper.insertPendingUpload(upload);

        await expectLater(
          () => syncService.stepInit(upload),
          throwsA(
            isA<ApiException>().having((e) => e.statusCode, 'statusCode', 412),
          ),
        );

        final blocked = (await databaseHelper.getAllUploads()).firstWhere(
          (item) => item.id == 'blocked-upload',
        );
        expect(blocked.status, PendingUploadStatus.failed);
        expect(blocked.errorMessage, contains('aguardando sincronização'));

        final now = DateTime.utc(2026, 7, 1).millisecondsSinceEpoch;
        await catalogDb.saveRow('catalog_properties', {
          'id': 'srv-prop-1',
          'owner_id': 'user-1',
          'data': jsonEncode(
            Property(
              id: 'srv-prop-1',
              name: 'Fazenda Exemplo',
              userId: 'user-1',
              createdAt: DateTime.utc(2026, 7, 1),
              updatedAt: DateTime.utc(2026, 7, 1),
              owner: 'Maria',
              address: 'Rua A',
              latitude: -22.9,
              longitude: -43.1,
            ).toJson(),
          ),
          'cached_at': now,
          'is_pending_sync': 0,
          'sync_error': null,
        });
        await catalogDb.saveRow('catalog_talhoes', {
          'id': 'srv-talhao-1',
          'owner_id': 'user-1',
          'data': jsonEncode(
            Talhao(
              id: 'srv-talhao-1',
              name: 'Talhão Exemplo',
              userId: 'user-1',
              createdAt: DateTime.utc(2026, 7, 1),
              updatedAt: DateTime.utc(2026, 7, 1),
              propertyId: 'srv-prop-1',
            ).toJson(),
          ),
          'cached_at': now,
          'is_pending_sync': 0,
          'sync_error': null,
        });
        await catalogDb.saveRow('catalog_crop_types', {
          'id': 'srv-crop-1',
          'owner_id': 'user-1',
          'data': jsonEncode(
            CropType(
              id: 'srv-crop-1',
              name: 'Soja',
              userId: 'user-1',
              createdAt: DateTime.utc(2026, 7, 1),
              updatedAt: DateTime.utc(2026, 7, 1),
            ).toJson(),
          ),
          'cached_at': now,
          'is_pending_sync': 0,
          'sync_error': null,
        });
        await catalogDb.saveRow('catalog_id_mappings', {
          'temp_id': 'tmp-prop',
          'owner_id': 'user-1',
          'server_id': 'srv-prop-1',
          'entity_type': 'property',
          'created_at': serverNow,
        });
        await catalogDb.saveRow('catalog_id_mappings', {
          'temp_id': 'tmp-talhao',
          'owner_id': 'user-1',
          'server_id': 'srv-talhao-1',
          'entity_type': 'talhao',
          'created_at': serverNow,
        });
        await catalogDb.saveRow('catalog_id_mappings', {
          'temp_id': 'tmp-crop',
          'owner_id': 'user-1',
          'server_id': 'srv-crop-1',
          'entity_type': 'cropType',
          'created_at': serverNow,
        });

        mockHttp.queueResponse('POST', '/api/uploads/init', 201, {
          'uploadId': 'backend-blocked',
          'status': 'draft',
          'files': [],
        });

        final resolved = await syncService.stepInit(upload);
        expect(resolved.upload.backendUploadId, 'backend-blocked');

        final initRequest = mockHttp.requests.last as http.Request;
        final body = jsonDecode(initRequest.body) as Map<String, dynamic>;
        expect(body['propertyId'], 'srv-prop-1');
        expect(body['talhaoId'], 'srv-talhao-1');
        expect(body['cropTypeId'], 'srv-crop-1');
      },
    );

    test('treats a 429 upload-init rate limit as retryable', () async {
      final image = await createTempFile(
        '/tmp/agrolens-rate-limited.jpg',
        'rate_limited_bytes',
      );
      addTearDown(() => image.delete());
      final upload = PendingUpload(
        id: 'rate-limited-upload',
        paths: [image.path],
        latitude: -22.9,
        longitude: -43.1,
        createdAt: DateTime.now(),
        activityDate: DateTime.parse('2026-06-29T12:00:00Z'),
        propertyId: 'prop-uuid',
        talhaoId: 'talhao-uuid',
        cropTypeId: 'crop-uuid',
        source: 'phone',
      );
      await databaseHelper.insertPendingUpload(upload);

      mockHttp.queueResponse('POST', '/api/uploads/init', 429, {
        'code': 'UPLOAD_INIT_RATE_LIMITED',
        'message': 'Upload initialization rate limit exceeded',
      });

      await syncService.syncAll();

      final persisted = (await databaseHelper.getAllUploads()).firstWhere(
        (item) => item.id == 'rate-limited-upload',
      );
      // Failed but NOT terminally: the record must remain eligible for
      // automatic retry while syncAttemptCount < maxAutomaticSyncAttempts.
      expect(persisted.status, PendingUploadStatus.failed);
      expect(persisted.syncErrorCode, 'SYNC_HTTP_429');
      expect(persisted.syncAttemptCount, 1);

      final stillQueued = await databaseHelper.getPendingAndFailedUploads();
      expect(
        stillQueued.any((item) => item.id == 'rate-limited-upload'),
        isTrue,
      );

      // A later sync attempt with the limit lifted succeeds.
      mockHttp.queueResponse('POST', '/api/uploads/init', 201, {
        'uploadId': 'backend-rate-limited',
        'status': 'draft',
        'files': [
          {
            'fileId': 'f1',
            'objectKey': 'uploads/u/0/original.jpeg',
            'uploadUrl': 'https://storage.example.com/put-rate-limited',
            'expiresAt': '2026-07-01T00:00:00Z',
          },
        ],
      });
      mockHttp.queueResponse('PUT', '/put-rate-limited', 200, {});
      mockHttp.queueResponse(
        'POST',
        '/api/uploads/backend-rate-limited/complete',
        200,
        {
          'upload': {'id': 'backend-rate-limited', 'status': 'finalizing'},
        },
      );
      mockHttp.queueResponse('GET', '/api/uploads/backend-rate-limited', 200, {
        'id': 'backend-rate-limited',
        'status': 'ready',
        'propertyId': 'srv-prop-1',
        'talhaoId': 'srv-talhao-1',
        'cropTypeId': 'srv-crop-1',
        'source': 'phone',
        'latitude': -22.9,
        'longitude': -43.1,
        'activityDate': '2026-06-29T12:00:00Z',
        'createdAt': '2026-06-29T12:00:00Z',
        'updatedAt': '2026-06-29T12:00:00Z',
        'fileCount': 1,
        'files': [],
      });
      final retried = await syncService.syncOne(persisted);
      expect(retried.backendUploadId, 'backend-rate-limited');
      expect(retried.status, isNot(PendingUploadStatus.failed));
    });
  });

  group('SyncService - stepUploadOriginals', () {
    test('uploads files to presigned URLs', () async {
      final imgPath = '/tmp/upload_original_test.jpg';
      await createTempFile(imgPath, 'fake_image_bytes');

      // Mock the PUT — request.url.path will be '/put-test-file'
      mockHttp.queueResponse('PUT', '/put-test-file', 200, {});

      final upload = PendingUpload(
        id: 'upload-test',
        paths: [imgPath],
        latitude: 0.0,
        longitude: 0.0,
        createdAt: DateTime.now(),
        propertyId: 'p',
        talhaoId: 't',
        cropTypeId: 'c',
        source: 'phone',
      );
      final presignedUrls = [
        PresignedUploadUrl(
          imageId: upload.images.single.imageId,
          fileId: 'f1',
          objectKey: 'uploads/u/0/original.jpeg',
          url: 'https://storage.example.com/put-test-file',
          expiresAt: DateTime.now().add(const Duration(hours: 1)),
          headers: {'x-amz-meta-user': 'mobile'},
        ),
      ];

      final result = await syncService.stepUploadOriginals(upload, [
        imgPath,
      ], presignedUrls);
      expect(result.status, PendingUploadStatus.pendingMetadataSync);

      final putRequest = mockHttp.requests.firstWhere((r) => r.method == 'PUT');
      expect(putRequest.headers['x-amz-meta-user'], 'mobile');
      expect(putRequest.headers['Content-Type'], 'image/jpeg');

      await File(imgPath).delete();
    });

    test('skips already-uploaded files and only PUTs missing ones', () async {
      final firstPath = '/tmp/upload_skip_existing.jpg';
      final secondPath = '/tmp/upload_skip_missing.jpg';
      await createTempFile(firstPath, 'existing_bytes');
      await createTempFile(secondPath, 'missing_bytes');

      mockHttp.queueResponse('PUT', '/put-missing', 200, {});

      final upload = PendingUpload(
        id: 'skip-test',
        paths: [firstPath, secondPath],
        latitude: 0.0,
        longitude: 0.0,
        createdAt: DateTime.now(),
        propertyId: 'p',
        talhaoId: 't',
        cropTypeId: 'c',
        source: 'phone',
      );
      final presignedUrls = [
        PresignedUploadUrl(
          imageId: upload.images.first.imageId,
          fileId: 'existing-file',
          objectKey: 'uploads/u/0/original.jpeg',
          url: null,
          method: 'GET',
          expiresAt: null,
        ),
        PresignedUploadUrl(
          imageId: upload.images.last.imageId,
          fileId: 'missing-file',
          objectKey: 'uploads/u/1/original.jpeg',
          url: 'https://storage.example.com/put-missing',
          expiresAt: DateTime.now().add(const Duration(hours: 1)),
        ),
      ];

      final result = await syncService.stepUploadOriginals(upload, [
        firstPath,
        secondPath,
      ], presignedUrls);
      expect(result.status, PendingUploadStatus.pendingMetadataSync);

      final putRequests = mockHttp.requests
          .where((r) => r.method == 'PUT')
          .toList();
      expect(putRequests.length, 1);
      expect(putRequests.first.url.path, '/put-missing');

      await File(firstPath).delete();
      await File(secondPath).delete();
    });

    test('matches reordered presigned URLs to image IDs', () async {
      final firstPath = '/tmp/upload_id_first.png';
      final secondPath = '/tmp/upload_id_second.jpg';
      await createTempFile(firstPath, 'first');
      await createTempFile(secondPath, 'second');
      addTearDown(() async {
        await File(firstPath).delete();
        await File(secondPath).delete();
      });
      final upload = PendingUpload(
        id: 'reordered',
        paths: [firstPath, secondPath],
        createdAt: DateTime.now(),
      );
      mockHttp.queueResponse('PUT', '/first', 200, {});
      mockHttp.queueResponse('PUT', '/second', 200, {});

      await syncService.stepUploadOriginals(upload, upload.paths, [
        PresignedUploadUrl(
          imageId: upload.images[1].imageId,
          fileId: 'b',
          url: 'https://storage.example.com/second',
        ),
        PresignedUploadUrl(
          imageId: upload.images[0].imageId,
          fileId: 'a',
          url: 'https://storage.example.com/first',
        ),
      ]);

      final puts = mockHttp.requests
          .where((request) => request.method == 'PUT')
          .toList();
      expect(puts.map((request) => request.url.path), ['/second', '/first']);
      expect(puts.map((request) => request.headers['Content-Type']), [
        'image/jpeg',
        'image/png',
      ]);
    });

    test('throws on file count mismatch', () async {
      final upload = PendingUpload(
        id: 'mismatch',
        paths: ['/tmp/a.jpg', '/tmp/b.jpg'],
        latitude: 0.0,
        longitude: 0.0,
        createdAt: DateTime.now(),
        propertyId: 'p',
        talhaoId: 't',
        cropTypeId: 'c',
        source: 'phone',
      );

      await expectLater(
        () => syncService.stepUploadOriginals(upload, ['/tmp/a.jpg'], []),
        throwsA(isA<ApiException>()),
      );
    });
  });

  group('SyncService - stepComplete', () {
    test('calls complete endpoint', () async {
      final upload = PendingUpload(
        id: 'complete-test',
        paths: [],
        latitude: 0.0,
        longitude: 0.0,
        createdAt: DateTime.now(),
        propertyId: 'p',
        talhaoId: 't',
        cropTypeId: 'c',
        source: 'phone',
        backendUploadId: 'backend-complete',
      );

      mockHttp.queueResponse(
        'POST',
        '/api/uploads/backend-complete/complete',
        200,
        {
          'upload': {'id': 'backend-complete', 'status': 'finalizing'},
        },
      );

      final result = await syncService.stepComplete(upload);
      expect(result.backendStatus, 'finalizing');
    });

    test('throws when no backendUploadId', () async {
      final upload = PendingUpload(
        id: 'no-backend',
        paths: [],
        latitude: 0.0,
        longitude: 0.0,
        createdAt: DateTime.now(),
        propertyId: 'p',
        talhaoId: 't',
        cropTypeId: 'c',
        source: 'phone',
      );

      await expectLater(
        () => syncService.stepComplete(upload),
        throwsA(isA<ApiException>()),
      );
    });
  });

  group('SyncService - stepPollUntilReady', () {
    test('returns completed on ready status', () async {
      mockHttp.queueResponse('GET', '/api/uploads/backend-poll', 200, {
        'id': 'backend-poll',
        'status': 'ready',
        'propertyId': 'p',
        'talhaoId': 't',
        'cropTypeId': 'c',
        'source': 'phone',
        'latitude': 0.0,
        'longitude': 0.0,
        'activityDate': '2026-06-30T12:00:00Z',
        'createdAt': '2026-06-30T12:00:00Z',
        'updatedAt': '2026-06-30T12:00:00Z',
        'files': [],
      });

      final upload = PendingUpload(
        id: 'poll-ready',
        paths: [],
        latitude: 0.0,
        longitude: 0.0,
        createdAt: DateTime.now(),
        propertyId: 'p',
        talhaoId: 't',
        cropTypeId: 'c',
        source: 'phone',
        backendUploadId: 'backend-poll',
      );

      final result = await syncService.stepPollUntilReady(
        upload: upload,
        maxPolls: 1,
        pollInterval: const Duration(milliseconds: 1),
      );
      expect(result.status, PendingUploadStatus.completed);
      expect(result.backendStatus, 'ready');
    });

    test('returns failed on backend failed status', () async {
      mockHttp.queueResponse('GET', '/api/uploads/backend-poll-fail', 200, {
        'id': 'backend-poll-fail',
        'status': 'failed',
        'errorMessage': 'Preview generation failed',
        'propertyId': 'p',
        'talhaoId': 't',
        'cropTypeId': 'c',
        'source': 'phone',
        'latitude': 0.0,
        'longitude': 0.0,
        'activityDate': '2026-06-30T12:00:00Z',
        'createdAt': '2026-06-30T12:00:00Z',
        'updatedAt': '2026-06-30T12:00:00Z',
        'files': [],
      });

      final upload = PendingUpload(
        id: 'poll-failed',
        paths: [],
        latitude: 0.0,
        longitude: 0.0,
        createdAt: DateTime.now(),
        propertyId: 'p',
        talhaoId: 't',
        cropTypeId: 'c',
        source: 'phone',
        backendUploadId: 'backend-poll-fail',
      );

      final result = await syncService.stepPollUntilReady(
        upload: upload,
        maxPolls: 1,
        pollInterval: const Duration(milliseconds: 1),
      );
      expect(result.status, PendingUploadStatus.failed);
      expect(result.backendError, 'Preview generation failed');
    });

    test('uses the refreshed token on later poll iterations', () async {
      var currentToken = 'token-123';
      authService = FakeAuthService(
        apiClient: apiClient,
        tokenStorage: tokenStorage,
        accessTokenProvider: () => currentToken,
      );
      syncService = SyncService(
        apiClient: apiClient,
        authService: authService,
        databaseHelper: databaseHelper,
        catalogRepository: catalogRepository,
        delay: (_) async {},
      );

      mockHttp.queueResponse('GET', '/api/uploads/backend-poll-refresh', 401, {
        'message': 'Token expired',
      });
      mockHttp.queueResponse('POST', '/api/auth/refresh', 200, {
        'accessToken': testAccessToken('user-1', session: 'new'),
        'refreshToken': 'new-refresh',
      });
      mockHttp.queueResponse('GET', '/api/uploads/backend-poll-refresh', 200, {
        'id': 'backend-poll-refresh',
        'status': 'finalizing',
        'propertyId': 'p',
        'talhaoId': 't',
        'cropTypeId': 'c',
        'source': 'phone',
        'latitude': 0.0,
        'longitude': 0.0,
        'activityDate': '2026-06-30T12:00:00Z',
        'createdAt': '2026-06-30T12:00:00Z',
        'updatedAt': '2026-06-30T12:00:00Z',
        'files': [],
      });
      mockHttp.queueResponse('GET', '/api/uploads/backend-poll-refresh', 200, {
        'id': 'backend-poll-refresh',
        'status': 'ready',
        'propertyId': 'p',
        'talhaoId': 't',
        'cropTypeId': 'c',
        'source': 'phone',
        'latitude': 0.0,
        'longitude': 0.0,
        'activityDate': '2026-06-30T12:00:00Z',
        'createdAt': '2026-06-30T12:00:00Z',
        'updatedAt': '2026-06-30T12:00:00Z',
        'files': [],
      });
      mockHttp.beforeResponse = (request) async {
        if (request.url.path == '/api/auth/refresh') {
          currentToken = 'new-access';
        }
      };

      final upload = PendingUpload(
        id: 'poll-refresh',
        paths: [],
        latitude: 0.0,
        longitude: 0.0,
        createdAt: DateTime.now(),
        propertyId: 'p',
        talhaoId: 't',
        cropTypeId: 'c',
        source: 'phone',
        backendUploadId: 'backend-poll-refresh',
      );

      final result = await syncService.stepPollUntilReady(
        upload: upload,
        maxPolls: 2,
        pollInterval: Duration.zero,
      );

      expect(result.status, PendingUploadStatus.completed);
      expect(
        mockHttp.requests.where(
          (request) => request.url.path == '/api/auth/refresh',
        ),
        hasLength(1),
      );
    });
  });

  group('SyncService - connectivity coordination', () {
    test('coalesces connectivity flapping while one pass is open', () async {
      final connectivity = StreamController<List<ConnectivityResult>>(
        sync: true,
      );
      final catalogGate = Completer<void>();
      var activePasses = 0;
      var maxActivePasses = 0;
      var passCount = 0;
      final secondPass = Completer<void>();
      var secondPassStarted = false;
      final service = SyncService(
        apiClient: apiClient,
        authService: authService,
        databaseHelper: databaseHelper,
        catalogRepository: catalogRepository,
        connectivityChanges: connectivity.stream,
        connectivityDebounce: Duration.zero,
        checkConnectivity: () async => [ConnectivityResult.none],
        syncPendingCatalogCreates: () async {
          passCount++;
          activePasses++;
          if (activePasses > maxActivePasses) maxActivePasses = activePasses;
          if (passCount == 1) {
            await catalogGate.future;
          } else {
            secondPassStarted = true;
            secondPass.complete();
          }
          activePasses--;
        },
      );
      service.initialize();
      final firstPass = service.syncPendingCatalogsAndUploads();
      await Future<void>.delayed(Duration.zero);
      expect(passCount, 1);
      connectivity.add([ConnectivityResult.wifi]);
      connectivity.add([ConnectivityResult.none]);
      connectivity.add([ConnectivityResult.mobile]);
      await Future<void>.delayed(Duration.zero);
      expect(maxActivePasses, 1);
      expect(passCount, 1);
      catalogGate.complete();
      await firstPass;
      await secondPass.future;
      expect(secondPassStarted, isTrue);
      expect(maxActivePasses, 1);
      expect(passCount, 2);
      service.dispose();
      await connectivity.close();
    });
  });

  group('SyncService - logout cancellation', () {
    test(
      'quietly stops an in-flight sync and reinitializes without duplicate work',
      () async {
        final connectivity =
            StreamController<List<ConnectivityResult>>.broadcast(sync: true);
        final initGate = Completer<void>();
        final initStarted = Completer<void>();
        var pausedInit = false;
        var catalogSyncs = 0;
        final service = SyncService(
          apiClient: apiClient,
          authService: authService,
          databaseHelper: databaseHelper,
          catalogRepository: catalogRepository,
          connectivityChanges: connectivity.stream,
          connectivityDebounce: Duration.zero,
          checkConnectivity: () async => [ConnectivityResult.none],
          syncPendingCatalogCreates: () async => catalogSyncs++,
          delay: (_) async {},
          pollDelay: (_) => Duration.zero,
        );
        final image = await createTempFile('/tmp/logout-sync.jpg', 'data');
        final upload = PendingUpload(
          id: 'logout-sync',
          paths: [image.path],
          latitude: 0,
          longitude: 0,
          createdAt: DateTime.utc(2026, 1, 1),
          propertyId: 'p1',
          talhaoId: 't1',
          cropTypeId: 'c1',
        );
        await databaseHelper.insertPendingUpload(upload);
        mockHttp.beforeResponse = (request) async {
          if (request.method == 'POST' &&
              request.url.path == '/api/uploads/init' &&
              !pausedInit) {
            pausedInit = true;
            initStarted.complete();
            await initGate.future;
          }
        };
        mockHttp.queueResponse('POST', '/api/uploads/init', 201, {
          'uploadId': 'backend-logout',
          'status': 'draft',
          'files': [
            {
              'fileId': 'f1',
              'objectKey': 'uploads/logout/original.jpg',
              'uploadUrl': 'https://storage.example.com/logout-put',
              'expiresAt': '2026-07-01T00:00:00Z',
            },
          ],
        });

        service.initialize();
        service.initialize();
        final firstPass = service.syncPendingCatalogsAndUploads();
        await initStarted.future;
        expect(pausedInit, isTrue);
        final initRequests = mockHttp.requests.length;

        service.stop();
        (authService as FakeAuthService).setAuthenticated(false);
        initGate.complete();
        await firstPass;
        await Future<void>.delayed(Duration.zero);

        expect(mockHttp.requests.length, initRequests);
        expect(catalogSyncs, 1);

        (authService as FakeAuthService).setAuthenticated(true);
        final persistedAfterLogout =
            (await databaseHelper.getAllUploads()).single;
        expect(persistedAfterLogout.backendUploadId, isNull);

        mockHttp.queueResponse('POST', '/api/uploads/init', 201, {
          'uploadId': 'backend-logout',
          'status': 'draft',
          'files': [
            {
              'fileId': 'f1',
              'objectKey': 'uploads/logout/original.jpg',
              'uploadUrl': 'https://storage.example.com/logout-put',
              'expiresAt': '2026-07-01T00:00:00Z',
            },
          ],
        });
        mockHttp.queueResponse('PUT', '/logout-put', 200, {});
        mockHttp.queueResponse(
          'POST',
          '/api/uploads/backend-logout/complete',
          200,
          {
            'upload': {'id': 'backend-logout', 'status': 'finalizing'},
          },
        );
        mockHttp.queueResponse('GET', '/api/uploads/backend-logout', 200, {
          'id': 'backend-logout',
          'status': 'ready',
          'propertyId': 'p1',
          'talhaoId': 't1',
          'cropTypeId': 'c1',
          'source': 'phone',
          'latitude': 0,
          'longitude': 0,
          'activityDate': '2026-01-01T00:00:00Z',
          'createdAt': '2026-01-01T00:00:00Z',
          'updatedAt': '2026-01-01T00:00:00Z',
          'files': [],
        });
        service.initialize();
        service.initialize();
        final resumed = service.syncPendingCatalogsAndUploads();
        await resumed;

        expect(catalogSyncs, 2);
        expect(
          (await databaseHelper.getAllUploads()).single.status,
          PendingUploadStatus.completed,
        );
        service.dispose();
        await connectivity.close();
        await image.delete();
      },
    );
  });

  group('SyncService - deterministic polling and failures', () {
    test(
      'uses exponential capped delays and deadline without waiting',
      () async {
        var now = DateTime.utc(2026, 1, 1);
        final delays = <Duration>[];
        final service = SyncService(
          apiClient: apiClient,
          authService: authService,
          databaseHelper: databaseHelper,
          catalogRepository: catalogRepository,
          pollDelay: (attempt) =>
              Duration(milliseconds: 100 * (1 << attempt.clamp(0, 3))),
          delay: (duration) async {
            delays.add(duration);
            now = now.add(duration);
          },
          now: () => now,
        );
        final upload = PendingUpload(
          id: 'poll-timeout',
          paths: [],
          latitude: 0,
          longitude: 0,
          createdAt: now,
          status: PendingUploadStatus.pendingMetadataSync,
          backendUploadId: 'backend-timeout',
        );
        for (var i = 0; i < 4; i++) {
          mockHttp.queueResponse('GET', '/api/uploads/backend-timeout', 200, {
            'id': 'backend-timeout',
            'status': 'finalizing',
            'propertyId': 'p',
            'talhaoId': 't',
            'cropTypeId': 'c',
            'source': 'phone',
            'latitude': 0,
            'longitude': 0,
            'activityDate': '2026-01-01T00:00:00Z',
            'createdAt': '2026-01-01T00:00:00Z',
            'updatedAt': '2026-01-01T00:00:00Z',
            'files': [],
          });
        }
        final result = await service.stepPollUntilReady(
          upload: upload,
          maxPolls: 4,
          pollInterval: const Duration(milliseconds: 50),
          deadline: const Duration(milliseconds: 1000),
        );
        expect(delays, [
          const Duration(milliseconds: 50),
          const Duration(milliseconds: 100),
          const Duration(milliseconds: 200),
          const Duration(milliseconds: 400),
        ]);
        expect(result.status, PendingUploadStatus.pendingMetadataSync);
        service.dispose();
      },
    );

    test(
      'persists safe structured failures and exposes them in result',
      () async {
        final fixedTime = DateTime.utc(2026, 1, 1);
        final upload = PendingUpload(
          id: 'failure-id',
          paths: [],
          latitude: 0,
          longitude: 0,
          createdAt: fixedTime,
        );
        await databaseHelper.insertPendingUpload(upload);
        final result = await syncService.syncAll();
        expect(result.failed, 1);
        expect(result.failures.single.uploadId, 'failure-id');
        expect(result.failures.single.code, isNotEmpty);
        expect(result.failures.single.message, isNot(contains('failure-id')));
        final persisted = (await databaseHelper.getAllUploads()).single;
        expect(persisted.syncAttemptCount, 0);
        expect(persisted.lastSyncAttemptAt, isNull);
        expect(persisted.errorMessage, isNot(contains('https://')));
        expect(persisted.errorMessage, isNot(contains('token')));
      },
    );
  });

  group('SyncService - syncAll', () {
    test('processes a pending upload end-to-end', () async {
      final imgPath = '/tmp/e2e_test.jpg';
      await createTempFile(imgPath, 'data_e2e');

      final upload = PendingUpload(
        id: 'e2e-uuid',
        paths: [imgPath],
        latitude: -10.0,
        longitude: -20.0,
        createdAt: DateTime.now(),
        propertyId: 'p1',
        talhaoId: 't1',
        cropTypeId: 'c1',
        source: 'phone',
      );
      await databaseHelper.insertPendingUpload(upload);

      // Mock init
      mockHttp.queueResponse('POST', '/api/uploads/init', 201, {
        'uploadId': 'backend-e2e',
        'status': 'draft',
        'files': [
          {
            'fileId': 'f1',
            'objectKey': 'uploads/u/0/original.jpeg',
            'uploadUrl': 'https://storage.example.com/put-e2e',
            'expiresAt': '2026-07-01T00:00:00Z',
          },
        ],
      });
      // Mock PUT
      mockHttp.queueResponse('PUT', '/put-e2e', 200, {});
      // Mock complete
      mockHttp.queueResponse('POST', '/api/uploads/backend-e2e/complete', 200, {
        'upload': {'id': 'backend-e2e', 'status': 'finalizing'},
      });
      // Mock poll → ready
      mockHttp.queueResponse('GET', '/api/uploads/backend-e2e', 200, {
        'id': 'backend-e2e',
        'status': 'ready',
        'propertyId': 'p1',
        'talhaoId': 't1',
        'cropTypeId': 'c1',
        'source': 'phone',
        'latitude': -10.0,
        'longitude': -20.0,
        'activityDate': '2026-06-30T12:00:00Z',
        'createdAt': '2026-06-30T12:00:00Z',
        'updatedAt': '2026-06-30T12:00:00Z',
        'files': [],
      });

      final result = await syncService.syncAll();
      expect(result.totalAttempted, 1);
      expect(result.successful, 1);
      expect(result.failed, 0);

      final remaining = await databaseHelper.getAllUploads();
      expect(remaining.first.status, PendingUploadStatus.completed);

      await File(imgPath).delete();
    });

    test('counts poll timeouts as sync failures', () async {
      var now = DateTime.utc(2026, 1, 1);
      final timeoutService = SyncService(
        apiClient: apiClient,
        authService: authService,
        databaseHelper: databaseHelper,
        catalogRepository: catalogRepository,
        pollDelay: (_) => Duration.zero,
        delay: (_) async {},
        now: () => now,
      );
      final upload = PendingUpload(
        id: 'syncall-poll-timeout',
        paths: [],
        latitude: 0.0,
        longitude: 0.0,
        createdAt: now,
        status: PendingUploadStatus.pendingMetadataSync,
        propertyId: 'p',
        talhaoId: 't',
        cropTypeId: 'c',
        source: 'phone',
        backendUploadId: 'backend-syncall-poll-timeout',
        backendStatus: 'finalizing',
      );
      await databaseHelper.insertPendingUpload(upload);

      mockHttp.queueResponse('POST', '/api/uploads/init', 200, {
        'uploadId': 'backend-syncall-poll-timeout',
        'status': 'finalizing',
      });
      for (var i = 0; i < 30; i++) {
        mockHttp.queueResponse(
          'GET',
          '/api/uploads/backend-syncall-poll-timeout',
          200,
          {
            'id': 'backend-syncall-poll-timeout',
            'status': 'finalizing',
            'propertyId': 'p',
            'talhaoId': 't',
            'cropTypeId': 'c',
            'source': 'phone',
            'latitude': 0,
            'longitude': 0,
            'activityDate': '2026-01-01T00:00:00Z',
            'createdAt': '2026-01-01T00:00:00Z',
            'updatedAt': '2026-01-01T00:00:00Z',
            'files': [],
          },
        );
      }

      final result = await timeoutService.syncAll();
      final persisted = (await databaseHelper.getAllUploads()).single;

      expect(result.successful, 0);
      expect(result.failed, 1);
      expect(result.failures, hasLength(1));
      expect(result.failures.single.uploadId, upload.id);
      expect(
        mockHttp.requests.where(
          (request) =>
              request.method == 'GET' &&
              request.url.path == '/api/uploads/backend-syncall-poll-timeout',
        ),
        hasLength(30),
      );
      expect(
        result.failures.single.message,
        isNot(contains('backend-syncall')),
      );
      expect(persisted.status, PendingUploadStatus.failed);
      expect(persisted.syncAttemptCount, 1);
      expect(persisted.lastSyncAttemptAt, isNotNull);
      timeoutService.dispose();
    });

    test('counts backend-declared poll failures as sync failures', () async {
      final upload = PendingUpload(
        id: 'syncall-poll-failed',
        paths: [],
        latitude: 0.0,
        longitude: 0.0,
        createdAt: DateTime.now(),
        status: PendingUploadStatus.pendingMetadataSync,
        propertyId: 'p',
        talhaoId: 't',
        cropTypeId: 'c',
        source: 'phone',
        backendUploadId: 'backend-syncall-poll-fail',
        backendStatus: 'finalizing',
      );
      await databaseHelper.insertPendingUpload(upload);

      mockHttp.queueResponse('POST', '/api/uploads/init', 200, {
        'uploadId': 'backend-syncall-poll-fail',
        'status': 'finalizing',
      });
      mockHttp
          .queueResponse('GET', '/api/uploads/backend-syncall-poll-fail', 200, {
            'id': 'backend-syncall-poll-fail',
            'status': 'failed',
            'errorMessage': 'Sensitive backend failure detail',
            'propertyId': 'p',
            'talhaoId': 't',
            'cropTypeId': 'c',
            'source': 'phone',
            'latitude': 0,
            'longitude': 0,
            'activityDate': '2026-01-01T00:00:00Z',
            'createdAt': '2026-01-01T00:00:00Z',
            'updatedAt': '2026-01-01T00:00:00Z',
            'files': [],
          });

      final result = await syncService.syncAll();
      final persisted = (await databaseHelper.getAllUploads()).single;

      expect(result.successful, 0);
      expect(result.failed, 1);
      expect(result.failures, hasLength(1));
      expect(result.failures.single.uploadId, upload.id);
      expect(result.failures.single.message, isNot(contains('Sensitive')));
      expect(persisted.backendStatus, 'failed');
      expect(persisted.syncAttemptCount, 1);
      expect(persisted.lastSyncAttemptAt, isNotNull);
    });

    test('returns early when nothing to sync', () async {
      final result = await syncService.syncAll();
      expect(result.totalAttempted, 0);
      expect(result.message, contains('Nothing'));
    });

    test('a second syncAll while one is in flight returns early', () async {
      final image = await createTempFile('/tmp/overlap-sync.jpg', 'data');
      await databaseHelper.insertPendingUpload(
        PendingUpload(
          id: 'overlap-sync',
          paths: [image.path],
          latitude: 0,
          longitude: 0,
          createdAt: DateTime.utc(2026, 1, 1),
          propertyId: 'p1',
          talhaoId: 't1',
          cropTypeId: 'c1',
        ),
      );
      // The queued init response fails, but the first call still holds the
      // in-progress flag while it runs; the second must not overlap it.
      final first = syncService.syncAll();
      final second = await syncService.syncAll();
      expect(second.totalAttempted, 0);
      expect(second.message, contains('already in progress'));
      await first;
    });
  });

  group('SyncService - lifecycle', () {
    test('dispose is safe to call multiple times', () {
      syncService.dispose();
      syncService.dispose(); // should not throw
    });
  });

  group('SyncService - resume from pendingMetadataSync', () {
    test('reconciles finalizing without repeating complete', () async {
      final upload = PendingUpload(
        id: 'resume-finalizing',
        paths: [],
        latitude: 0.0,
        longitude: 0.0,
        createdAt: DateTime.now(),
        propertyId: 'p',
        talhaoId: 't',
        cropTypeId: 'c',
        source: 'phone',
        backendUploadId: 'backend-finalizing',
        status: PendingUploadStatus.pendingMetadataSync,
      );
      await databaseHelper.insertPendingUpload(upload);

      mockHttp.queueResponse('POST', '/api/uploads/init', 200, {
        'uploadId': 'backend-finalizing',
        'status': 'finalizing',
        'files': [],
      });
      mockHttp.queueResponse('GET', '/api/uploads/backend-finalizing', 200, {
        'id': 'backend-finalizing',
        'status': 'ready',
        'propertyId': 'p',
        'talhaoId': 't',
        'cropTypeId': 'c',
        'source': 'phone',
        'latitude': 0.0,
        'longitude': 0.0,
        'activityDate': '2026-06-30T12:00:00Z',
        'createdAt': '2026-06-30T12:00:00Z',
        'updatedAt': '2026-06-30T12:00:00Z',
        'files': [],
      });

      final result = await syncService.syncAll();
      expect(result.successful, 1);
      expect(
        mockHttp.requests.where((r) => r.url.path.endsWith('/complete')),
        isEmpty,
      );
      expect(
        (await databaseHelper.getAllUploads()).single.status,
        PendingUploadStatus.completed,
      );
    });

    test(
      'init ready marks upload completed without upload or complete',
      () async {
        final upload = PendingUpload(
          id: 'resume-ready',
          paths: [],
          latitude: 0.0,
          longitude: 0.0,
          createdAt: DateTime.now(),
          propertyId: 'p',
          talhaoId: 't',
          cropTypeId: 'c',
          source: 'phone',
          backendUploadId: 'backend-ready',
          status: PendingUploadStatus.pendingMetadataSync,
        );
        await databaseHelper.insertPendingUpload(upload);

        mockHttp.queueResponse('POST', '/api/uploads/init', 200, {
          'uploadId': 'backend-ready',
          'status': 'ready',
          'files': [],
        });

        final result = await syncService.syncAll();
        expect(result.successful, 1);
        expect(
          mockHttp.requests.where(
            (r) => r.method == 'POST' && r.url.path.endsWith('/complete'),
          ),
          isEmpty,
        );
        expect(
          (await databaseHelper.getAllUploads()).single.status,
          PendingUploadStatus.completed,
        );
      },
    );

    test('reconciles pendingMetadataSync through idempotent init', () async {
      final upload = PendingUpload(
        id: 'resume-metasync',
        paths: [],
        latitude: 0.0,
        longitude: 0.0,
        createdAt: DateTime.now(),
        propertyId: 'p',
        talhaoId: 't',
        cropTypeId: 'c',
        source: 'phone',
        backendUploadId: 'backend-existing',
        status: PendingUploadStatus.pendingMetadataSync,
        backendStatus: 'draft',
      );
      await databaseHelper.insertPendingUpload(upload);

      mockHttp.queueResponse('POST', '/api/uploads/init', 200, {
        'uploadId': 'backend-existing',
        'status': 'finalizing',
        'files': [],
      });
      mockHttp.queueResponse('GET', '/api/uploads/backend-existing', 200, {
        'id': 'backend-existing',
        'status': 'ready',
        'propertyId': 'p',
        'talhaoId': 't',
        'cropTypeId': 'c',
        'source': 'phone',
        'latitude': 0.0,
        'longitude': 0.0,
        'activityDate': '2026-06-30T12:00:00Z',
        'createdAt': '2026-06-30T12:00:00Z',
        'updatedAt': '2026-06-30T12:00:00Z',
        'files': [],
      });

      final result = await syncService.syncAll();
      expect(result.successful, 1);

      // Init reconciles the backend state; complete is not repeated.
      final initCalls = mockHttp.requests.where(
        (r) => r.method == 'POST' && r.url.path == '/api/uploads/init',
      );
      expect(initCalls.length, 1);
      expect(
        mockHttp.requests.where((r) => r.url.path.endsWith('/complete')),
        isEmpty,
      );
    });
  });

  group('SyncService - no duplicate init', () {
    test(
      'syncOne calls uploadInit exactly once for a new pending upload',
      () async {
        final imgPath = '/tmp/no_dup_test.jpg';
        await createTempFile(imgPath, 'data');

        final upload = PendingUpload(
          id: 'no-dup-uuid',
          paths: [imgPath],
          latitude: 0.0,
          longitude: 0.0,
          createdAt: DateTime.now(),
          propertyId: 'p',
          talhaoId: 't',
          cropTypeId: 'c',
          source: 'phone',
        );
        await databaseHelper.insertPendingUpload(upload);

        // Mock init (only needs to be called once)
        mockHttp.queueResponse('POST', '/api/uploads/init', 201, {
          'uploadId': 'backend-no-dup',
          'status': 'draft',
          'files': [
            {
              'fileId': 'f1',
              'objectKey': 'uploads/u/0/original.jpeg',
              'uploadUrl': 'https://storage.example.com/put-no-dup',
              'expiresAt': '2026-07-01T00:00:00Z',
            },
          ],
        });
        mockHttp.queueResponse('PUT', '/put-no-dup', 200, {});
        mockHttp.queueResponse(
          'POST',
          '/api/uploads/backend-no-dup/complete',
          200,
          {
            'upload': {'id': 'backend-no-dup', 'status': 'finalizing'},
          },
        );
        mockHttp.queueResponse('GET', '/api/uploads/backend-no-dup', 200, {
          'id': 'backend-no-dup',
          'status': 'ready',
          'propertyId': 'p',
          'talhaoId': 't',
          'cropTypeId': 'c',
          'source': 'phone',
          'latitude': 0.0,
          'longitude': 0.0,
          'activityDate': '2026-06-30T12:00:00Z',
          'createdAt': '2026-06-30T12:00:00Z',
          'updatedAt': '2026-06-30T12:00:00Z',
          'files': [],
        });

        await syncService.syncAll();

        // Verify init was called exactly once
        final initCalls = mockHttp.requests.where(
          (r) => r.method == 'POST' && r.url.path == '/api/uploads/init',
        );
        expect(
          initCalls.length,
          1,
          reason: 'uploadInit must be called exactly once',
        );

        await File(imgPath).delete();
      },
    );
  });

  group('SyncService - retryUpload', () {
    test('shares an in-flight sync for the same upload', () async {
      final image = await createTempFile('/tmp/concurrent-retry.jpg', 'data');
      final upload = PendingUpload(
        id: 'concurrent-retry',
        paths: [image.path],
        latitude: 0,
        longitude: 0,
        createdAt: DateTime.utc(2026, 1, 1),
        propertyId: 'p',
        talhaoId: 't',
        cropTypeId: 'c',
      );
      await databaseHelper.insertPendingUpload(upload);

      final initStarted = Completer<void>();
      final releaseInit = Completer<void>();
      mockHttp.beforeResponse = (request) async {
        if (request.method == 'POST' &&
            request.url.path == '/api/uploads/init') {
          initStarted.complete();
          await releaseInit.future;
        }
      };
      mockHttp.queueResponse('POST', '/api/uploads/init', 201, {
        'uploadId': 'backend-concurrent-retry',
        'status': 'ready',
        'files': <Object>[],
      });

      final first = syncService.syncOne(upload);
      await initStarted.future;
      await expectLater(
        syncService.deleteQueuedUpload(upload, deleteRemote: false),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 409)),
      );
      expect(await image.exists(), isTrue);
      expect(await databaseHelper.getUploadById(upload.id), isNotNull);
      final retry = syncService.retryUpload(upload);
      releaseInit.complete();

      final results = await Future.wait([first, retry]);
      expect(
        results.every(
          (result) => result.status == PendingUploadStatus.completed,
        ),
        isTrue,
      );
      expect(
        mockHttp.requests
            .where(
              (request) =>
                  request.method == 'POST' &&
                  request.url.path == '/api/uploads/init',
            )
            .length,
        1,
      );

      await syncService.deleteQueuedUpload(upload, deleteRemote: false);
      expect(await image.exists(), isFalse);
      expect(await databaseHelper.getUploadById(upload.id), isNull);
    });

    test(
      'persists an escaped retry failure without incrementing attempts',
      () async {
        final file = await createTempFile(
          '/tmp/retry-missing-file.jpg',
          'retry data',
        );
        addTearDown(() async {
          if (await file.exists()) await file.delete();
        });
        final upload = PendingUpload(
          id: 'retry-missing-file',
          paths: [file.path],
          latitude: 0.0,
          longitude: 0.0,
          createdAt: DateTime.utc(2026, 1, 1),
          propertyId: 'p',
          talhaoId: 't',
          cropTypeId: 'c',
          status: PendingUploadStatus.failed,
          syncAttemptCount: 2,
        );
        await databaseHelper.insertPendingUpload(upload);

        mockHttp.beforeResponse = (request) async {
          if (request.method == 'POST' &&
              request.url.path == '/api/uploads/init') {
            await file.delete();
          }
        };
        mockHttp.queueResponse('POST', '/api/uploads/init', 201, {
          'uploadId': 'retry-missing-file-backend',
          'status': 'draft',
          'files': [
            {
              'fileId': 'missing-file',
              'objectKey': 'uploads/retry-missing-file/original.jpg',
              'uploadUrl': 'https://storage.example.com/retry-missing-file',
              'expiresAt': '2026-07-01T00:00:00Z',
            },
          ],
        });

        await expectLater(
          () => syncService.retryUpload(upload),
          throwsA(
            isA<ApiException>().having(
              (error) => error.statusCode,
              'statusCode',
              404,
            ),
          ),
        );

        final persisted = (await databaseHelper.getAllUploads()).single;
        expect(persisted.status, PendingUploadStatus.failed);
        expect(persisted.syncAttemptCount, 2);
        expect(persisted.syncErrorCode, startsWith('SYNC_'));
        expect(persisted.errorMessage, isNotEmpty);
        expect(persisted.errorMessage, isNot(contains(upload.id)));
      },
    );

    test('reuses backend state and preserves identifiers', () async {
      final firstPath = '/tmp/retry_existing.jpg';
      final secondPath = '/tmp/retry_missing.jpg';
      await createTempFile(firstPath, 'data_existing');
      await createTempFile(secondPath, 'data_missing');

      final upload = PendingUpload(
        id: 'retry-uuid',
        paths: [firstPath, secondPath],
        latitude: -10.0,
        longitude: -20.0,
        createdAt: DateTime.now(),
        propertyId: 'p1',
        talhaoId: 't1',
        cropTypeId: 'c1',
        source: 'phone',
        status: PendingUploadStatus.failed,
        errorMessage: 'Previous failure',
        backendUploadId: 'stale-backend',
        backendStatus: 'failed',
        backendError: 'Previous failure',
      );
      await databaseHelper.insertPendingUpload(upload);

      mockHttp.queueResponse('POST', '/api/uploads/init', 201, {
        'uploadId': 'stale-backend',
        'status': 'draft',
        'files': [
          {
            'fileId': 'existing-file',
            'objectKey': 'uploads/u/0/original.jpeg',
            'uploadUrl': null,
            'method': 'GET',
            'expiresAt': null,
          },
          {
            'fileId': 'missing-file',
            'objectKey': 'uploads/u/1/original.jpeg',
            'uploadUrl': 'https://storage.example.com/put-retry',
            'expiresAt': '2026-07-01T00:00:00Z',
          },
        ],
      });
      mockHttp.queueResponse('PUT', '/put-retry', 200, {});
      mockHttp.queueResponse(
        'POST',
        '/api/uploads/stale-backend/complete',
        200,
        {
          'upload': {'id': 'stale-backend', 'status': 'finalizing'},
        },
      );
      mockHttp.queueResponse('GET', '/api/uploads/stale-backend', 200, {
        'id': 'stale-backend',
        'status': 'ready',
        'propertyId': 'p1',
        'talhaoId': 't1',
        'cropTypeId': 'c1',
        'source': 'phone',
        'latitude': -10.0,
        'longitude': -20.0,
        'activityDate': '2026-06-30T12:00:00Z',
        'createdAt': '2026-06-30T12:00:00Z',
        'updatedAt': '2026-06-30T12:00:00Z',
        'files': [],
      });

      final result = await syncService.retryUpload(upload);
      expect(result.status, PendingUploadStatus.completed);
      expect(result.backendStatus, 'ready');
      expect(result.id, 'retry-uuid');
      expect(result.backendUploadId, 'stale-backend');

      final putRequests = mockHttp.requests
          .where((r) => r.method == 'PUT')
          .toList();
      expect(putRequests.length, 1);

      final initCalls = mockHttp.requests.where(
        (r) => r.method == 'POST' && r.url.path == '/api/uploads/init',
      );
      expect(initCalls.length, 1);

      await File(firstPath).delete();
      await File(secondPath).delete();
    });
  });

  group('SyncService - failed uploads picked up by syncAll', () {
    test(
      'automatic sync excludes failed uploads at the attempt limit',
      () async {
        final exhausted = PendingUpload(
          id: 'exhausted-retry-uuid',
          paths: ['/tmp/exhausted.jpg'],
          latitude: -10.0,
          longitude: -20.0,
          createdAt: DateTime.now(),
          status: PendingUploadStatus.failed,
          syncAttemptCount: DatabaseHelper.maxAutomaticSyncAttempts,
        );
        final retryable = exhausted.copyWith(
          id: 'retryable-retry-uuid',
          syncAttemptCount: DatabaseHelper.maxAutomaticSyncAttempts - 1,
        );
        final exhaustedPending = exhausted.copyWith(
          id: 'exhausted-pending-uuid',
          status: PendingUploadStatus.pending,
        );
        final exhaustedMetadata = exhausted.copyWith(
          id: 'exhausted-metadata-uuid',
          status: PendingUploadStatus.pendingMetadataSync,
        );
        final eligiblePending = exhausted.copyWith(
          id: 'eligible-pending-uuid',
          status: PendingUploadStatus.pending,
          syncAttemptCount: 0,
        );
        final uploading = exhausted.copyWith(
          id: 'uploading-uuid',
          status: PendingUploadStatus.uploading,
          syncAttemptCount: 0,
        );
        final completed = exhausted.copyWith(
          id: 'completed-uuid',
          status: PendingUploadStatus.completed,
          syncAttemptCount: 0,
        );
        for (final upload in [
          exhausted,
          retryable,
          exhaustedPending,
          exhaustedMetadata,
          eligiblePending,
          uploading,
          completed,
        ]) {
          await databaseHelper.insertPendingUpload(upload);
        }

        final uploads = await databaseHelper.getPendingAndFailedUploads();

        expect(uploads.map((upload) => upload.id), [
          'retryable-retry-uuid',
          'eligible-pending-uuid',
        ]);
      },
    );

    test('syncAll retries a failed upload while app is open', () async {
      final firstPath = '/tmp/syncall_existing.jpg';
      final secondPath = '/tmp/syncall_missing.jpg';
      await createTempFile(firstPath, 'syncall_existing');
      await createTempFile(secondPath, 'syncall_missing');

      final upload = PendingUpload(
        id: 'syncall-retry-uuid',
        paths: [firstPath, secondPath],
        latitude: -10.0,
        longitude: -20.0,
        createdAt: DateTime.now(),
        propertyId: 'p2',
        talhaoId: 't2',
        cropTypeId: 'c2',
        source: 'phone',
        status: PendingUploadStatus.failed,
        errorMessage: 'Previous failure',
        backendUploadId: 'syncall-stale-backend',
      );
      await databaseHelper.insertPendingUpload(upload);

      mockHttp.queueResponse('POST', '/api/uploads/init', 201, {
        'uploadId': 'syncall-stale-backend',
        'status': 'draft',
        'files': [
          {
            'fileId': 'existing-file',
            'objectKey': 'uploads/u/0/original.jpeg',
            'uploadUrl': null,
            'method': 'GET',
            'expiresAt': null,
          },
          {
            'fileId': 'missing-file',
            'objectKey': 'uploads/u/1/original.jpeg',
            'uploadUrl': 'https://storage.example.com/put-syncall',
            'expiresAt': '2026-07-01T00:00:00Z',
          },
        ],
      });
      mockHttp.queueResponse('PUT', '/put-syncall', 200, {});
      mockHttp.queueResponse(
        'POST',
        '/api/uploads/syncall-stale-backend/complete',
        200,
        {
          'upload': {'id': 'syncall-stale-backend', 'status': 'finalizing'},
        },
      );
      mockHttp.queueResponse('GET', '/api/uploads/syncall-stale-backend', 200, {
        'id': 'syncall-stale-backend',
        'status': 'ready',
        'propertyId': 'p2',
        'talhaoId': 't2',
        'cropTypeId': 'c2',
        'source': 'phone',
        'latitude': -10.0,
        'longitude': -20.0,
        'activityDate': '2026-06-30T12:00:00Z',
        'createdAt': '2026-06-30T12:00:00Z',
        'updatedAt': '2026-06-30T12:00:00Z',
        'files': [],
      });

      final result = await syncService.syncAll();
      expect(result.successful, 1);
      expect(result.failed, 0);

      final remaining = await databaseHelper.getAllUploads();
      expect(
        remaining.firstWhere((u) => u.id == 'syncall-retry-uuid').status,
        PendingUploadStatus.completed,
      );

      final putRequests = mockHttp.requests
          .where((r) => r.method == 'PUT')
          .toList();
      expect(putRequests.length, 1);

      await File(firstPath).delete();
      await File(secondPath).delete();
    });
  });
}
