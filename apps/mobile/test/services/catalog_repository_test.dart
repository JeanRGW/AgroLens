import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/models/catalog.dart';
import 'package:agrolens/services/api_client.dart';
import 'package:agrolens/services/app_database.dart';
import 'package:agrolens/services/catalog_repository.dart';
import 'package:agrolens/services/token_storage.dart';
import '../helpers/test_doubles.dart';

class FakeCatalogApiClient extends ApiClient {
  List<Map<String, dynamic>> propertyRows;
  int getPropertiesCalls = 0;
  int createPropertyCalls = 0;
  Map<String, dynamic>? lastCreatePropertyBody;

  FakeCatalogApiClient({required this.propertyRows})
    : super(
        httpClient: http.Client(),
        env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
      );

  @override
  Future<List<Map<String, dynamic>>> getProperties({
    required String accessToken,
  }) async {
    getPropertiesCalls++;
    return propertyRows.map((row) => Map<String, dynamic>.from(row)).toList();
  }

  @override
  Future<Property> createProperty({
    required String accessToken,
    required String name,
    required String owner,
    required String address,
    required double latitude,
    required double longitude,
  }) async {
    createPropertyCalls++;
    lastCreatePropertyBody = {
      'accessToken': accessToken,
      'name': name,
      'owner': owner,
      'address': address,
      'latitude': latitude,
      'longitude': longitude,
    };

    final now = DateTime.utc(2026, 7, 1).toIso8601String();
    final created = {
      'id': 'prop-2',
      'name': name,
      'userId': 'user-1',
      'owner': owner,
      'address': address,
      'latitude': latitude,
      'longitude': longitude,
      'createdAt': now,
      'updatedAt': now,
    };
    propertyRows = [...propertyRows, created];
    return Property.fromJson(created);
  }
}

void main() {
  sqfliteFfiInit();
  databaseFactory = databaseFactoryFfi;

  late FakeCatalogApiClient apiClient;
  late FakeAuthService authService;
  late AppDatabase appDb;
  late CatalogRepository repository;

  final initialProperty = {
    'id': 'prop-1',
    'name': 'Fazenda Inicial',
    'userId': 'user-1',
    'owner': 'João',
    'address': 'Rua A',
    'latitude': -22.9,
    'longitude': -43.1,
    'createdAt': DateTime.utc(2026, 6, 30).toIso8601String(),
    'updatedAt': DateTime.utc(2026, 6, 30).toIso8601String(),
  };

  setUp(() async {
    appDb = createTestAppDatabase();
    apiClient = FakeCatalogApiClient(propertyRows: [initialProperty]);
    authService = FakeAuthService(
      apiClient: apiClient,
      tokenStorage: TokenStorage(storage: FakeFlutterSecureStorage()),
    );
    repository = CatalogRepository(
      appDatabase: appDb,
      apiClient: apiClient,
      authService: authService,
    );
  });

  tearDown(() async {
    await appDb.close();
  });

  test(
    'isolated owner catalog cache maintains independent entries per user',
    () async {
      final serverData = jsonEncode(initialProperty);
      final db = await repository.database;
      await db.insert('catalog_properties', {
        'id': 'prop-server',
        'owner_id': 'user-1',
        'data': serverData,
        'cached_at': 101,
        'is_pending_sync': 0,
        'sync_error': null,
      });
      await db.insert('catalog_properties', {
        'id': 'prop-server',
        'owner_id': 'user-2',
        'data': serverData,
        'cached_at': 303,
        'is_pending_sync': 0,
        'sync_error': null,
      });

      final rows = await db.query(
        'catalog_properties',
        where: 'owner_id = ?',
        whereArgs: ['user-1'],
      );
      expect(rows, hasLength(1));
      expect(rows.first['owner_id'], 'user-1');
    },
  );

  test(
    'resolveCatalogId accepts uncached manual UUIDs and preserves known ids',
    () async {
      await repository.getProperties();
      final db = await repository.database;
      await db.insert('catalog_id_mappings', {
        'owner_id': 'user-1',
        'temp_id': 'temp-1',
        'server_id': 'prop-1',
        'entity_type': 'property',
        'created_at': DateTime.now().millisecondsSinceEpoch,
      });

      expect(await repository.resolveCatalogId('prop-1'), 'prop-1');
      expect(await repository.resolveCatalogId('temp-1'), 'prop-1');
      expect(await repository.resolveCatalogId('unknown-1'), isNull);
      const manualId = '9c8d44ac-b18d-4b0b-a8b8-6a67097a1551';
      expect(await repository.resolveCatalogId(manualId), manualId);
    },
  );

  test(
    'createProperty updates the cache without dropping pending rows',
    () async {
      final properties = await repository.getProperties();
      expect(properties, hasLength(1));
      expect(apiClient.getPropertiesCalls, 1);

      final db = await repository.database;
      await db.insert('catalog_crop_types', {
        'id': 'crop-1',
        'owner_id': 'user-1',
        'data': jsonEncode({
          'id': 'crop-1',
          'name': 'Soja',
          'userId': 'user-1',
          'createdAt': DateTime.utc(2026, 6, 30).toIso8601String(),
          'updatedAt': DateTime.utc(2026, 6, 30).toIso8601String(),
        }),
        'cached_at': DateTime.now().millisecondsSinceEpoch,
        'is_pending_sync': 0,
      });

      final created = await repository.createProperty(
        name: 'Fazenda Nova',
        owner: 'Maria',
        address: 'Rua B',
        latitude: -23.0,
        longitude: -44.0,
      );

      expect(created.id, 'prop-2');
      expect(apiClient.createPropertyCalls, 1);
      expect(apiClient.lastCreatePropertyBody?['accessToken'], 'token-123');
      expect(apiClient.lastCreatePropertyBody?['name'], 'Fazenda Nova');

      final propertyRows = await db.query('catalog_properties');
      final cropTypeRows = await db.query('catalog_crop_types');
      expect(propertyRows, hasLength(2));
      expect(cropTypeRows, hasLength(1));

      final refreshed = await repository.getProperties();
      expect(refreshed, hasLength(2));
      expect(apiClient.getPropertiesCalls, 1);
    },
  );
}
