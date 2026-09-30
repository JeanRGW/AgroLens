import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/services/api_client.dart';
import 'package:agrolens/services/app_database.dart';
import 'package:agrolens/services/catalog_repository.dart';
import 'package:agrolens/services/token_storage.dart';
import '../helpers/test_doubles.dart';

void main() {
  late ApiClient apiClient;
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
    final mockHttp = MockHttpClient();
    mockHttp.queueResponse('GET', '/api/properties', 200, {
      'properties': [initialProperty],
    });
    apiClient = ApiClient(
      httpClient: mockHttp,
      env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
    );
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
    'resolveCatalogId accepts uncached manual UUIDs and preserves known ids',
    () async {
      await repository.getProperties();
      final db = repository.database;
      await db.saveRow('catalog_id_mappings', {
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
}
