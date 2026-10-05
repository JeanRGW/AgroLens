// █████████████████████████████████████████████████████████████████████████
// Real-backend integration test for the mobile sync flow.
//
// Gated behind --dart-define=REAL_BACKEND_BASE_URL.  NOT run by normal
// `flutter test` unless the define is set.
//
// Prerequisites:
//   1. Backend infrastructure: docker compose up -d (PostgreSQL + Garage)
//   2. Backend NestJS app running NATIVELY (outside Docker) on the host:
//         cd refactor/backend
//         npm run start:dev    # Reads .env, S3_ENDPOINT=http://localhost:3900
//   3. Finalization worker enabled: WORKER_ENABLED=true in backend .env
//      Must be set BEFORE starting the backend (worker processes jobs within
//      the test's poll timeout).
//
//   ⚠ If the backend runs INSIDE Docker, presigned URLs will point to the
//     internal Docker hostname "garage:3900", which is unreachable from the
//     host. In that case the presigned PUT step will fail with a connection
//     error or 403 (signature mismatch if URL is rewritten).  Run the backend
//     natively on the host to avoid this.
//
// Run:
//   flutter test test/integration/real_backend_sync_test.dart \
//     --dart-define=REAL_BACKEND_BASE_URL=http://localhost:3000/api
//
// Expected HTTP response shapes (NestJS backend):
//   POST /api/auth/register → { user, accessToken, refreshToken }
//   POST /api/auth/login    → { user, accessToken, refreshToken }
//   POST /api/properties    → { property: { id } }
//   POST /api/talhoes       → { talhao: { id } }
//   POST /api/crop-types    → { cropType: { id } }
//   POST /api/estadios      → { estadio: { id } }
//   POST /api/uploads/init  → { uploadId, status, files: [{ id, uploadUrl }] }
//   PUT (presigned)         → 200
//   POST /api/uploads/:id/complete → { upload: { id, status } }
//   GET  /api/uploads/:id   → { id, status, files, ... }
//   GET  /api/uploads       → { uploads: [...], total, ... }
//
// Mobile model mismatches fixed in this phase:
//   - UploadInitResponse parses files[{uploadUrl}]
//   - UploadCompleteResponse accepts top-level {uploadId} and {upload:{id}}
//   - DownloadUrlResponse parses downloadUrl
//
// █████████████████████████████████████████████████████████████████████████

@TestOn('vm')
@Timeout(Duration(seconds: 120))
library;

import 'dart:convert';
import 'dart:developer' as dev;
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/models/pending_upload.dart';
import 'package:agrolens/services/api_client.dart';
import 'package:agrolens/services/auth_service.dart';
import 'package:agrolens/services/database_helper.dart';
import 'package:agrolens/services/catalog_repository.dart';
import 'package:agrolens/services/sync_service.dart';
import 'package:agrolens/services/token_storage.dart';
import '../helpers/test_doubles.dart';

// ── Gate ───────────────────────────────────────────────────────────────────

/// Returns the backend base URL from dart-define, or empty if not set.
String _backendUrl() => const String.fromEnvironment('REAL_BACKEND_BASE_URL');

/// Returns the cross-app artifact output path, or empty if not set.
/// When set, a JSON file is written after successful sync containing
/// enough data for the web E2E to use the mobile-created upload.
String _crossAppArtifactPath() =>
    const String.fromEnvironment('CROSS_APP_ARTIFACT_PATH');

// ── Helpers ────────────────────────────────────────────────────────────────

/// Minimal valid 2×2 red PNG (base64), same fixture as backend e2e-helpers.
const _minimalPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVQImWP4z8DwnwGM/zMwAAAf7gP9qS/A4gAAAABJRU5ErkJggg==';

List<int> _testImageBytes() => base64Decode(_minimalPngBase64);

/// Unique suffix for email/client IDs to avoid collisions across runs.
String _uniqueSuffix() {
  final ts = DateTime.now().millisecondsSinceEpoch;
  final rnd = Random().nextInt(99999);
  return 'int_${ts}_$rnd';
}

/// Generate a unique email for this test run.
String _uniqueEmail() => 'mobile_inttest_${_uniqueSuffix()}@example.com';

/// Generate a unique client upload ID.
String _uniqueClientId() => 'mobile_inttest_${_uniqueSuffix()}';

/// A minimal PNG file on disk for upload testing.
Future<File> _createTempImage() async {
  final dir = Directory('/tmp/mobile_inttest');
  if (!await dir.exists()) {
    await dir.create(recursive: true);
  }
  final file = File('${dir.path}/test_${_uniqueSuffix()}.png');
  await file.writeAsBytes(_testImageBytes());
  return file;
}

/// Make a raw authenticated POST request and parse JSON body.
Future<Map<String, dynamic>> _authPost(
  http.Client client,
  String url,
  Map<String, dynamic> body,
  String? accessToken,
) async {
  final headers = <String, String>{
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (accessToken != null) {
    headers['Authorization'] = 'Bearer $accessToken';
  }
  final response = await client.post(
    Uri.parse(url),
    headers: headers,
    body: jsonEncode(body),
  );
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw HttpException(
      'POST $url failed: ${response.statusCode} ${response.body}',
    );
  }
  return jsonDecode(response.body) as Map<String, dynamic>;
}

// ── Main test suite ────────────────────────────────────────────────────────

void main() {
  final backendBaseUrl = _backendUrl();
  if (backendBaseUrl.isEmpty) {
    test(
      'real-backend integration',
      () {},
      skip: 'REAL_BACKEND_BASE_URL not set',
    );
    return;
  }

  // Validate the backend is reachable before running any tests.
  late http.Client rawClient;
  late String accessToken;
  late String testEmail;

  setUpAll(() async {
    rawClient = http.Client();

    // Quick connectivity check
    try {
      final healthResp = await rawClient
          .get(Uri.parse('$backendBaseUrl/auth/me'))
          .timeout(const Duration(seconds: 5));
      // 401 is fine — it means the backend is alive (just not authenticated).
      // Any other status (including 200 which shouldn't happen without token)
      // means the backend is reachable.
      dev.log(
        'Backend reachable at $backendBaseUrl '
        '(status ${healthResp.statusCode})',
        name: 'inttest',
      );
    } catch (e) {
      throw Exception(
        'Cannot reach backend at $backendBaseUrl. '
        'Is it running? Error: $e',
      );
    }

    // Register a real user via raw HTTP (so we have the access token).
    testEmail = _uniqueEmail();
    final registerBody = {
      'email': testEmail,
      'password': 'password123',
      'fullName': 'Mobile Int Test User',
      'clientType': 'mobile',
    };
    final regJson = await _authPost(
      rawClient,
      '$backendBaseUrl/auth/register',
      registerBody,
      null,
    );
    accessToken = regJson['accessToken'] as String;
    dev.log('Registered test user: $testEmail', name: 'inttest');
  });

  tearDownAll(() {
    rawClient.close();
  });

  group('Real-backend mobile sync integration', () {
    late String propertyId;
    late String talhaoId;
    late String cropTypeId;
    late String? estadioId;
    late File tempImage;
    late String clientUploadId;

    setUpAll(() async {
      // ── Step 1: Create catalog records via raw HTTP ─────────────────
      final propertyBody = {
        'name': 'Mobile Int Test Farm ${_uniqueSuffix()}',
        'owner': 'Test Owner',
        'address': '123 Test St',
        'latitude': -22.9,
        'longitude': -43.1,
      };
      final propJson = await _authPost(
        rawClient,
        '$backendBaseUrl/properties',
        propertyBody,
        accessToken,
      );
      propertyId =
          (propJson['property'] as Map<String, dynamic>)['id'] as String;
      dev.log('Created property: $propertyId', name: 'inttest');

      final talhaoBody = {
        'name': 'Mobile Int Test Talhao',
        'propertyId': propertyId,
      };
      final talhaoJson = await _authPost(
        rawClient,
        '$backendBaseUrl/talhoes',
        talhaoBody,
        accessToken,
      );
      talhaoId = (talhaoJson['talhao'] as Map<String, dynamic>)['id'] as String;
      dev.log('Created talhao: $talhaoId', name: 'inttest');

      final cropBody = {'name': 'Mobile Int Test Crop ${_uniqueSuffix()}'};
      final cropJson = await _authPost(
        rawClient,
        '$backendBaseUrl/crop-types',
        cropBody,
        accessToken,
      );
      cropTypeId =
          (cropJson['cropType'] as Map<String, dynamic>)['id'] as String;
      dev.log('Created cropType: $cropTypeId', name: 'inttest');

      final estadioBody = {
        'name': 'Mobile Int Test Stage',
        'cropTypeId': cropTypeId,
      };
      final estadioJson = await _authPost(
        rawClient,
        '$backendBaseUrl/estadios',
        estadioBody,
        accessToken,
      );
      estadioId =
          (estadioJson['estadio'] as Map<String, dynamic>)['id'] as String;
      dev.log('Created estadio: $estadioId', name: 'inttest');

      // ── Step 2: Create temp image file ──────────────────────────────
      tempImage = await _createTempImage();
      dev.log('Created temp image: ${tempImage.path}', name: 'inttest');

      // ── Step 3: Generate unique clientUploadId ──────────────────────
      clientUploadId = _uniqueClientId();
    });

    test('full sync flow against real backend', () async {
      // ── Wire up mobile services ─────────────────────────────────
      final envConfig = EnvConfig(apiBaseUrl: backendBaseUrl);
      final apiClient = ApiClient(httpClient: http.Client(), env: envConfig);
      final tokenStorage = TokenStorage(storage: FakeFlutterSecureStorage());
      final authService = AuthService(
        apiClient: apiClient,
        tokenStorage: tokenStorage,
      );
      final appDb = createTestAppDatabase();
      final catalogRepository = CatalogRepository(
        appDatabase: appDb,
        apiClient: apiClient,
        authService: authService,
      );
      final databaseHelper = DatabaseHelper(
        appDatabase: appDb,
        authService: authService,
      );
      final syncService = SyncService(
        apiClient: apiClient,
        authService: authService,
        databaseHelper: databaseHelper,
        catalogRepository: catalogRepository,
      );

      // ── Step 4: Login via mobile AuthService ────────────────────
      final loginBody = {
        'email': testEmail,
        'password': 'password123',
        'clientType': 'mobile',
      };
      final regJson = await _authPost(
        rawClient,
        '$backendBaseUrl/auth/login',
        loginBody,
        null,
      );
      final mobileAccessToken = regJson['accessToken'] as String;
      await tokenStorage.saveTokens(
        accessToken: mobileAccessToken,
        refreshToken: regJson['refreshToken'] as String,
      );
      await authService.tryRestoreSession();
      // Refresh catalogs exactly like the old SyncService.refreshCatalogs seam.
      await catalogRepository.syncPendingCatalogCreates();
      await Future.wait([
        catalogRepository.getProperties(forceRefresh: true),
        catalogRepository.getTalhoes(forceRefresh: true),
        catalogRepository.getCropTypes(forceRefresh: true),
        catalogRepository.getEstadios(forceRefresh: true),
      ]);

      // Tokens stored directly; getValidAccessToken() reads the stored token.

      // ── Step 5: Insert PendingUpload in SQLite ──────────────────
      final testUpload = PendingUpload(
        id: clientUploadId,
        paths: [tempImage.path],
        latitude: -22.9,
        longitude: -43.1,
        createdAt: DateTime.now(),
        propertyId: propertyId,
        talhaoId: talhaoId,
        cropTypeId: cropTypeId,
        estadioId: estadioId,
        source: 'phone',
      );
      await databaseHelper.insertPendingUpload(testUpload);

      // Verify it's in SQLite as pending
      var allUploads = await databaseHelper.getAllUploads();
      expect(allUploads.length, greaterThan(0));
      expect(
        allUploads.firstWhere((u) => u.id == clientUploadId).status,
        PendingUploadStatus.pending,
      );

      // ── Step 6: Run full sync via SyncService.syncOne() ────────
      // This exercises: uploadInit → presigned PUT → uploadComplete → poll.
      // The mobile models now accept the real backend's JSON shapes
      // (files[{uploadUrl}] for init, { upload: { id } } for complete).
      PendingUpload synced;
      try {
        synced = await syncService.syncOne(testUpload);
      } catch (e) {
        // Log the error for debugging but let the test fail with context
        dev.log('syncOne failed: $e', name: 'inttest', error: e);
        rethrow;
      }

      dev.log(
        'syncOne completed — status: ${synced.status}, '
        'backendStatus: ${synced.backendStatus}',
        name: 'inttest',
      );

      final errorSuffix = synced.errorMessage != null
          ? ' — ${synced.errorMessage}'
          : '';
      expect(
        synced.status,
        PendingUploadStatus.completed,
        reason:
            'syncOne should end in completed. '
            'Actual: ${synced.status}$errorSuffix',
      );
      expect(synced.backendStatus, 'ready');
      expect(synced.backendUploadId, isNotEmpty);

      final uploadId = synced.backendUploadId!;

      // ── Step 7: Verify backend detail has original + preview ───
      final detail = await syncService.fetchRemoteUploadDetail(uploadId);
      expect(detail.status, 'ready');
      expect(
        detail.files.length,
        2,
        reason: 'Should have both original and preview files',
      );

      final originalFile = detail.files.firstWhere(
        (f) => f.variant == 'original',
      );
      final previewFile = detail.files.firstWhere(
        (f) => f.variant == 'preview',
      );
      expect(originalFile.objectKey, isNotEmpty);
      expect(previewFile.objectKey, isNotEmpty);
      expect(previewFile.contentType, 'image/jpeg');

      dev.log('Detail verified — original + preview present', name: 'inttest');

      // ── Step 8: Verify local SQLite row transitioned to completed ──
      final localUploads = await databaseHelper.getAllUploads();
      final localDone = localUploads.firstWhere((u) => u.id == clientUploadId);
      expect(localDone.status, PendingUploadStatus.completed);
      expect(localDone.backendStatus, 'ready');

      dev.log('Local SQLite row is completed', name: 'inttest');

      // ── Step 9: Verify list endpoint includes the upload ───────
      final remoteUploads = await syncService.fetchRemoteUploads();
      final found = remoteUploads.any((u) => u.id == uploadId);
      expect(found, isTrue, reason: 'Upload should appear in list');
      final listEntry = remoteUploads.firstWhere((u) => u.id == uploadId);
      expect(listEntry.status, 'ready');

      dev.log('List verified — upload appears as ready', name: 'inttest');

      // ── Step 10: Write cross-app artifact (optional) ──────────
      final artifactPath = _crossAppArtifactPath();
      if (artifactPath.isNotEmpty) {
        final artifact = {
          'backendBaseUrl': backendBaseUrl,
          'ownerEmail': testEmail,
          'ownerPassword': 'password123',
          'uploadId': uploadId,
          'clientUploadId': clientUploadId,
          'propertyId': propertyId,
          'talhaoId': talhaoId,
          'cropTypeId': cropTypeId,
          'estadioId': estadioId,
          'createdAt': DateTime.now().toUtc().toIso8601String(),
        };
        final artifactFile = File(artifactPath);
        final parentDir = artifactFile.parent;
        if (!await parentDir.exists()) {
          await parentDir.create(recursive: true);
        }
        await artifactFile.writeAsString(
          const JsonEncoder.withIndent('  ').convert(artifact),
        );
        dev.log(
          'Cross-app artifact written to: $artifactPath',
          name: 'inttest',
        );
        dev.log(
          'Artifact contains: backendBaseUrl, ownerEmail, uploadId, '
          'catalog IDs (ownerPassword included for web E2E login)',
          name: 'inttest',
        );
      }

      dev.log('=== INTEGRATION TEST PASSED ===', name: 'inttest');

      // ── Cleanup local state ────────────────────────────────────
      await databaseHelper.deleteUpload(clientUploadId);

      // Close mobile services
      apiClient.dispose();
      await databaseHelper.close();
    });
  });

  // ── Teardown: remove temp files ──────────────────────────────────────
  tearDownAll(() async {
    try {
      final dir = Directory('/tmp/mobile_inttest');
      if (await dir.exists()) {
        await dir.delete(recursive: true);
      }
    } catch (_) {
      // Best-effort cleanup
    }
  });
}
