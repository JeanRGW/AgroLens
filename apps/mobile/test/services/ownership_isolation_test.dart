import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/models/pending_upload.dart';
import 'package:agrolens/services/api_client.dart';
import 'package:agrolens/services/auth_service.dart';
import 'package:agrolens/services/catalog_repository.dart';
import 'package:agrolens/services/database_helper.dart';
import 'package:agrolens/services/token_storage.dart';
import '../helpers/test_doubles.dart';

class _CatalogApi extends ApiClient {
  _CatalogApi()
    : super(
        httpClient: http.Client(),
        env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
      );
}

void main() {
  sqfliteFfiInit();
  databaseFactory = databaseFactoryFfi;

  for (final operation in ['fetch', 'create', 'update', 'sync']) {
    test('late catalog $operation cannot write into another account', () async {
      final appDb = createTestAppDatabase();
      final httpClient = MockHttpClient();
      final api = ApiClient(
        httpClient: httpClient,
        env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
      );
      final auth = AuthService(
        apiClient: api,
        tokenStorage: TokenStorage(storage: FakeFlutterSecureStorage()),
      );
      final repo = CatalogRepository(
        appDatabase: appDb,
        apiClient: api,
        authService: auth,
      );
      addTearDown(() async {
        auth.dispose();
        api.dispose();
        await appDb.close();
      });
      final now = DateTime.utc(2026).toIso8601String();
      Future<void> login(String id) async {
        httpClient.queueResponse('POST', '/api/auth/login', 200, {
          'accessToken': id,
          'refreshToken': 'refresh-$id',
          'user': {
            'id': id,
            'email': '$id@example.com',
            'fullName': id,
            'role': 'user',
            'createdAt': now,
            'updatedAt': now,
          },
        });
        await auth.login(email: '$id@example.com', password: 'password');
      }

      await login('a');
      Future<Object> create() => repo.createProperty(
        name: 'A field',
        owner: 'A',
        address: 'Private address',
        latitude: 1,
        longitude: 2,
      );
      if (operation == 'sync') {
        for (var i = 0; i < 2; i++) {
          httpClient.queueResponse('POST', '/api/properties', 503, {
            'message': 'offline',
          });
          await create();
        }
      }
      final started = Completer<void>();
      final release = Completer<void>();
      httpClient.beforeResponse = (request) async {
        if (request.url.path.startsWith('/api/properties')) {
          started.complete();
          await release.future;
        }
      };
      final property = {
        'id': 'property-a',
        'name': 'A field',
        'userId': 'a',
        'owner': 'A',
        'address': 'Private address',
        'latitude': 1,
        'longitude': 2,
        'createdAt': now,
        'updatedAt': now,
      };
      final method = operation == 'fetch'
          ? 'GET'
          : operation == 'update'
          ? 'PATCH'
          : 'POST';
      final path = operation == 'update'
          ? '/api/properties/property-a'
          : '/api/properties';
      httpClient.queueResponse(
        method,
        path,
        200,
        operation == 'fetch'
            ? {
                'properties': [property],
              }
            : {'property': property},
      );
      final pending = switch (operation) {
        'fetch' => repo.getProperties(forceRefresh: true),
        'create' => create(),
        'update' => repo.updateProperty(
          propertyId: 'property-a',
          name: 'Changed',
        ),
        _ => repo.syncPendingCatalogCreates(),
      };
      final assertion = expectLater(pending, throwsA(isA<ApiException>()));
      await started.future;
      await login('b');
      release.complete();
      await assertion;
      final db = await appDb.database;
      for (final table in [
        'catalog_properties',
        'pending_catalog_creates',
        'catalog_id_mappings',
      ]) {
        expect(
          await db.query(table, where: 'owner_id = ?', whereArgs: ['b']),
          isEmpty,
        );
      }
      expect(
        httpClient.requests.where(
          (r) =>
              r.url.path.startsWith('/api/properties') &&
              r.headers['Authorization'] == 'Bearer b',
        ),
        isEmpty,
      );
      if (operation == 'sync') {
        expect(await db.query('pending_catalog_creates'), hasLength(2));
      }
    });
  }

  test('upload rows are isolated and legacy rows remain hidden', () async {
    final api = _CatalogApi();
    final a = FakeAuthService(
      apiClient: api,
      tokenStorage: TokenStorage(storage: FakeFlutterSecureStorage()),
      userId: 'user-a',
    );
    final b = FakeAuthService(
      apiClient: api,
      tokenStorage: TokenStorage(storage: FakeFlutterSecureStorage()),
      userId: 'user-b',
    );
    final appDb = createTestAppDatabase();
    final helperA = DatabaseHelper(appDatabase: appDb, authService: a);
    final helperB = DatabaseHelper(appDatabase: appDb, authService: b);
    final upload = PendingUpload(
      id: 'a-upload',
      imagePaths: '[]',
      latitude: 0,
      longitude: 0,
      createdAt: DateTime.now(),
    );
    await helperA.insertPendingUpload(upload);
    final db = await helperA.database;
    await db.update(
      'pending_uploads',
      {'status': PendingUploadStatus.failed.name},
      where: 'id = ? AND owner_id = ?',
      whereArgs: ['a-upload', 'user-a'],
    );
    expect(await helperA.getPendingAndFailedUploads(), hasLength(1));

    expect(await helperB.getPendingAndFailedUploads(), isEmpty);
    expect(await helperB.getAllUploads(), isEmpty);
    expect(await helperB.resetUploadingToPending(), 0);
    expect(await helperB.deleteCompletedUploads(), 0);
    expect(await helperB.deleteUpload('a-upload'), 0);
    expect(
      (await db.query(
        'pending_uploads',
        where: 'id = ?',
        whereArgs: ['a-upload'],
      )).single['owner_id'],
      'user-a',
    );
    await appDb.close();
  });

  test('catalog cache rows are isolated by owner_id', () async {
    final appDb = createTestAppDatabase();
    final api = _CatalogApi();
    final a = FakeAuthService(
      apiClient: api,
      tokenStorage: TokenStorage(storage: FakeFlutterSecureStorage()),
      userId: 'user-a',
    );
    final b = FakeAuthService(
      apiClient: api,
      tokenStorage: TokenStorage(storage: FakeFlutterSecureStorage()),
      userId: 'user-b',
    );
    final repoA = CatalogRepository(
      appDatabase: appDb,
      apiClient: api,
      authService: a,
    );
    final db = await repoA.database;
    final data = jsonEncode({
      'id': 'p-a',
      'name': 'A',
      'userId': 'user-a',
      'owner': 'A',
      'address': '',
      'latitude': 0,
      'longitude': 0,
      'createdAt': DateTime.now().toIso8601String(),
      'updatedAt': DateTime.now().toIso8601String(),
    });
    await db.insert('catalog_properties', {
      'id': 'p-a',
      'owner_id': 'user-a',
      'data': data,
      'cached_at': 1,
      'is_pending_sync': 0,
      'sync_error': null,
    });
    await db.insert('catalog_properties', {
      'id': 'shared-id',
      'owner_id': 'user-a',
      'data': data,
      'cached_at': 1,
      'is_pending_sync': 0,
      'sync_error': null,
    });
    await db.insert('catalog_properties', {
      'id': 'shared-id',
      'owner_id': 'user-b',
      'data': data.replaceAll('user-a', 'user-b'),
      'cached_at': 1,
      'is_pending_sync': 0,
      'sync_error': null,
    });
    final repoB = CatalogRepository(
      appDatabase: appDb,
      apiClient: api,
      authService: b,
    );
    final repoBDb = await repoB.database;
    expect(
      (await repoBDb.query(
        'catalog_properties',
        where: 'id = ?',
        whereArgs: ['shared-id'],
      )),
      hasLength(2),
    );
    expect(
      (await repoBDb.query(
        'catalog_properties',
        where: 'owner_id = ?',
        whereArgs: ['user-b'],
      )),
      hasLength(1),
    );
    expect(await repoA.getProperties(), hasLength(2));
    expect(await repoB.getProperties(), hasLength(1));
    await appDb.close();
  });
}
