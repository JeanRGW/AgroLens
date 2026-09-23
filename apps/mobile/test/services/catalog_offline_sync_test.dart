import 'dart:convert';
import 'dart:io';

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

class SyncingCatalogApiClient extends ApiClient {
  bool failCreates = true;
  final List<String> callOrder = [];
  final List<Property> serverProperties = [];
  final List<CropType> serverCropTypes = [];
  final List<Talhao> serverTalhoes = [];
  final List<Estadio> serverEstadios = [];

  SyncingCatalogApiClient()
    : super(
        httpClient: http.Client(),
        env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
      );

  @override
  Future<List<Map<String, dynamic>>> getProperties({
    required String accessToken,
  }) async => serverProperties
      .map((item) => item.toJson())
      .map((row) => Map<String, dynamic>.from(row))
      .toList();

  @override
  Future<List<Map<String, dynamic>>> getCropTypes({
    required String accessToken,
  }) async => serverCropTypes
      .map((item) => item.toJson())
      .map((row) => Map<String, dynamic>.from(row))
      .toList();

  @override
  Future<List<Map<String, dynamic>>> getTalhoes({
    required String accessToken,
    String? propertyId,
  }) async => serverTalhoes
      .map((item) => item.toJson())
      .map((row) => Map<String, dynamic>.from(row))
      .toList();

  @override
  Future<List<Map<String, dynamic>>> getEstadios({
    required String accessToken,
    String? cropTypeId,
  }) async => serverEstadios
      .map((item) => item.toJson())
      .map((row) => Map<String, dynamic>.from(row))
      .toList();

  @override
  Future<Property> createProperty({
    required String accessToken,
    required String name,
    required String owner,
    required String address,
    required double latitude,
    required double longitude,
  }) async {
    callOrder.add('property');
    if (failCreates) throw const SocketException('offline');
    final now = DateTime.utc(2026, 7, 1);
    final item = Property(
      id: 'srv-property-${serverProperties.length + 1}',
      name: name,
      userId: 'user-1',
      createdAt: now,
      updatedAt: now,
      owner: owner,
      address: address,
      latitude: latitude,
      longitude: longitude,
    );
    serverProperties.add(item);
    return item;
  }

  @override
  Future<CropType> createCropType({
    required String accessToken,
    required String name,
  }) async {
    callOrder.add('cropType');
    if (failCreates) throw const SocketException('offline');
    final now = DateTime.utc(2026, 7, 1);
    final item = CropType(
      id: 'srv-crop-${serverCropTypes.length + 1}',
      name: name,
      userId: 'user-1',
      createdAt: now,
      updatedAt: now,
    );
    serverCropTypes.add(item);
    return item;
  }

  @override
  Future<Talhao> createTalhao({
    required String accessToken,
    required String name,
    required String propertyId,
  }) async {
    callOrder.add('talhao');
    if (failCreates) throw const SocketException('offline');
    final now = DateTime.utc(2026, 7, 1);
    final item = Talhao(
      id: 'srv-talhao-${serverTalhoes.length + 1}',
      name: name,
      userId: 'user-1',
      createdAt: now,
      updatedAt: now,
      propertyId: propertyId,
    );
    serverTalhoes.add(item);
    return item;
  }

  @override
  Future<Estadio> createEstadio({
    required String accessToken,
    required String name,
    required String cropTypeId,
  }) async {
    callOrder.add('estadio');
    if (failCreates) throw const SocketException('offline');
    final now = DateTime.utc(2026, 7, 1);
    final item = Estadio(
      id: 'srv-estadio-${serverEstadios.length + 1}',
      name: name,
      userId: 'user-1',
      createdAt: now,
      updatedAt: now,
      cropTypeId: cropTypeId,
    );
    serverEstadios.add(item);
    return item;
  }
}

/// Subclass that turns [createFailure] into an arbitrary thrown object so
/// each transport error class can be exercised in the fallback tests.
class ThrowingCatalogApiClient extends SyncingCatalogApiClient {
  Object? createFailure;

  @override
  Future<Property> createProperty({
    required String accessToken,
    required String name,
    required String owner,
    required String address,
    required double latitude,
    required double longitude,
  }) async {
    final failure = createFailure;
    if (failure != null) throw failure;
    return super.createProperty(
      accessToken: accessToken,
      name: name,
      owner: owner,
      address: address,
      latitude: latitude,
      longitude: longitude,
    );
  }

  @override
  Future<List<Map<String, dynamic>>> getProperties({
    required String accessToken,
  }) async {
    final failure = createFailure;
    if (failure != null) throw failure;
    return super.getProperties(accessToken: accessToken);
  }
}

void main() {
  sqfliteFfiInit();
  databaseFactory = databaseFactoryFfi;

  late SyncingCatalogApiClient apiClient;
  late FakeAuthService authService;
  late AppDatabase appDb;
  late CatalogRepository repository;

  setUp(() async {
    appDb = createTestAppDatabase();
    apiClient = SyncingCatalogApiClient();
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
    'offline create rolls back cache when queue persistence fails',
    () async {
      final db = await appDb.database;
      await db.execute('''
      CREATE TRIGGER reject_pending_create BEFORE INSERT ON pending_catalog_creates
      BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END
    ''');
      await expectLater(
        repository.createProperty(
          name: 'Field',
          owner: 'Owner',
          address: 'Address',
          latitude: 1,
          longitude: 2,
        ),
        throwsA(isA<DatabaseException>()),
      );
      expect(await db.query('catalog_properties'), isEmpty);
      expect(await db.query('pending_catalog_creates'), isEmpty);
    },
  );

  test(
    'failed catalog creates expose the sync error in cached items',
    () async {
      final property = await repository.createProperty(
        name: 'Fazenda Offline',
        owner: 'Maria',
        address: 'Rua A',
        latitude: -10,
        longitude: -20,
      );

      await repository.syncPendingCatalogCreates();

      final cached = await repository.getProperties();
      expect(cached, hasLength(1));
      expect(cached.single.id, property.id);
      expect(cached.single.isPendingSync, isTrue);
      expect(cached.single.syncError, 'offline');

      final db = await repository.database;
      final row = await db.query(
        'catalog_properties',
        where: 'id = ?',
        whereArgs: [property.id],
        limit: 1,
      );
      expect(row.single['is_pending_sync'], 1);
      expect(row.single['sync_error'], 'offline');
      expect(
        (jsonDecode(row.single['data'] as String)
            as Map<String, dynamic>)['syncError'],
        'offline',
      );
    },
  );

  test(
    'offline catalog creates stay pending until sync promotes temp ids',
    () async {
      final property = await repository.createProperty(
        name: 'Fazenda Offline',
        owner: 'Maria',
        address: 'Rua A',
        latitude: -10,
        longitude: -20,
      );
      final cropType = await repository.createCropType(name: 'Soja');
      final talhao = await repository.createTalhao(
        name: 'Talhão 1',
        propertyId: property.id,
      );
      final estadio = await repository.createEstadio(
        name: 'V3',
        cropTypeId: cropType.id,
      );

      expect(property.isPendingSync, isTrue);
      expect(cropType.isPendingSync, isTrue);
      expect(talhao.isPendingSync, isTrue);
      expect(estadio.isPendingSync, isTrue);

      apiClient.failCreates = false;
      apiClient.callOrder.clear();

      await repository.syncPendingCatalogCreates();

      expect(apiClient.callOrder, [
        'property',
        'cropType',
        'talhao',
        'estadio',
      ]);
      expect(
        await repository.resolveCatalogId(property.id),
        startsWith('srv-property-'),
      );
      expect(
        await repository.resolveCatalogId(cropType.id),
        startsWith('srv-crop-'),
      );

      final db = await repository.database;
      expect(await db.query('pending_catalog_creates'), isEmpty);

      final talhaoRow = await db.query(
        'catalog_talhoes',
        where: 'id LIKE ?',
        whereArgs: ['srv-talhao-%'],
      );
      final estadioRow = await db.query(
        'catalog_estadios',
        where: 'id LIKE ?',
        whereArgs: ['srv-estadio-%'],
      );
      expect(talhaoRow, hasLength(1));
      expect(estadioRow, hasLength(1));

      final talhaoData =
          jsonDecode(talhaoRow.first['data'] as String) as Map<String, dynamic>;
      final estadioData =
          jsonDecode(estadioRow.first['data'] as String)
              as Map<String, dynamic>;
      expect(talhaoData['propertyId'], startsWith('srv-property-'));
      expect(estadioData['cropTypeId'], startsWith('srv-crop-'));
    },
  );

  group('transport fallback coverage', () {
    late ThrowingCatalogApiClient throwingClient;

    setUp(() {
      throwingClient = ThrowingCatalogApiClient();
    });

    test(
      'http.ClientException on create falls back to local pending',
      () async {
        apiClient = throwingClient;
        throwingClient.createFailure = http.ClientException(
          'Connection closed',
        );
        repository = CatalogRepository(
          appDatabase: appDb,
          apiClient: apiClient,
          authService: authService,
        );

        final property = await repository.createProperty(
          name: 'Fazenda Reset',
          owner: 'João',
          address: 'Rua B',
          latitude: -11,
          longitude: -21,
        );

        expect(property.isPendingSync, isTrue);
      },
    );

    test('5xx ApiException on create falls back to local pending', () async {
      apiClient = throwingClient;
      throwingClient.createFailure = const ApiException(
        500,
        'Servidor recusou a operação',
      );
      repository = CatalogRepository(
        appDatabase: appDb,
        apiClient: apiClient,
        authService: authService,
      );

      final property = await repository.createProperty(
        name: 'Fazenda 500',
        owner: 'Maria',
        address: 'Rua C',
        latitude: -12,
        longitude: -22,
      );

      expect(property.isPendingSync, isTrue);
    });

    test('4xx ApiException on create still fails hard', () async {
      apiClient = throwingClient;
      throwingClient.createFailure = const ApiException(400, 'Nome inválido');
      repository = CatalogRepository(
        appDatabase: appDb,
        apiClient: apiClient,
        authService: authService,
      );

      await expectLater(
        repository.createProperty(
          name: 'Fazenda 400',
          owner: 'Maria',
          address: 'Rua D',
          latitude: -13,
          longitude: -23,
        ),
        throwsA(isA<ApiException>()),
      );
    });

    test(
      'failed refresh serves stale cache instead of wiping the list',
      () async {
        apiClient = throwingClient;
        throwingClient.serverProperties.add(
          Property(
            id: 'srv-property-seed',
            name: 'Fazenda Cache',
            userId: 'user-1',
            createdAt: DateTime.utc(2026, 7, 1),
            updatedAt: DateTime.utc(2026, 7, 1),
            owner: 'Maria',
            address: 'Rua A',
            latitude: -10,
            longitude: -20,
          ),
        );
        repository = CatalogRepository(
          appDatabase: appDb,
          apiClient: apiClient,
          authService: authService,
        );

        // First load populates the cache from the (mocked) server.
        final seeded = await repository.getProperties();
        expect(seeded, hasLength(1));

        // Refresh goes offline: the previously cached list must survive.
        throwingClient.createFailure = http.ClientException('offline refresh');
        final stale = await repository.getProperties(forceRefresh: true);
        expect(stale, hasLength(1));
        expect(stale.single.id, seeded.single.id);
      },
    );

    test(
      'first load offline with empty cache still surfaces the error',
      () async {
        apiClient = throwingClient;
        throwingClient.createFailure = http.ClientException(
          'offline first load',
        );
        repository = CatalogRepository(
          appDatabase: appDb,
          apiClient: apiClient,
          authService: authService,
        );

        await expectLater(
          repository.getProperties(forceRefresh: true),
          throwsA(isA<http.ClientException>()),
        );
      },
    );
  });
}
