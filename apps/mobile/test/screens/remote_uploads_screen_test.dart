import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/services/api_client.dart';
import 'package:agrolens/services/auth_service.dart';
import 'package:agrolens/services/catalog_repository.dart';
import 'package:agrolens/services/database_helper.dart';
import 'package:agrolens/services/sync_service.dart';
import 'package:agrolens/services/token_storage.dart';
import 'package:agrolens/screens/remote_uploads_screen.dart';
import '../helpers/test_doubles.dart';

void main() {
  late MockHttpClient mockHttp;
  late ApiClient apiClient;
  late AuthService authService;
  late CatalogRepository catalogRepository;
  late DatabaseHelper databaseHelper;

  setUp(() async {
    mockHttp = MockHttpClient();
    apiClient = ApiClient(
      httpClient: mockHttp,
      env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
    );
    final tokenStorage = TokenStorage(storage: FakeFlutterSecureStorage());
    authService = AuthService(apiClient: apiClient, tokenStorage: tokenStorage);
    await tokenStorage.saveTokens(
      accessToken: testAccessToken('user-1'),
      refreshToken: 'refresh-456',
    );
    final now = DateTime.now().toIso8601String();
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
    final appDb = createTestAppDatabase();
    catalogRepository = CatalogRepository(
      appDatabase: appDb,
      apiClient: apiClient,
      authService: authService,
    );
    databaseHelper = DatabaseHelper(
      appDatabase: appDb,
      authService: authService,
    );
  });

  Widget buildScreen() {
    final syncService = SyncService(
      apiClient: apiClient,
      authService: authService,
      databaseHelper: databaseHelper,
      catalogRepository: catalogRepository,
    );
    return MaterialApp(
      home: RemoteUploadsScreen(
        authService: authService,
        syncService: syncService,
        catalogRepository: catalogRepository,
      ),
    );
  }

  Map<String, dynamic> uploadJson(int i, {bool withPreview = true}) {
    final now = DateTime.now().toIso8601String();
    return {
      'id': 'upload-$i-abcdef1234567890',
      'status': 'ready',
      'fileCount': 4,
      'errorMessage': null,
      'propertyId': 'prop-$i',
      'talhaoId': 'talhao-$i',
      'cropTypeId': 'crop-$i',
      'estadioId': null,
      'source': 'phone',
      'latitude': -22.123456,
      'longitude': -47.654321,
      'activityDate': now,
      'createdAt': now,
      'updatedAt': now,
      'previewFileId': withPreview ? 'file-preview-$i' : null,
      'previewImageIndex': withPreview ? 0 : null,
      'previewCount': withPreview ? 4 : 0,
      'files': <dynamic>[],
    };
  }

  testWidgets('error state renders retry button without overflow', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    // No queued response for GET /uploads -> ApiException(404).
    await tester.pumpWidget(buildScreen());
    await tester.pumpAndSettle();

    expect(find.text('Tentar novamente'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('list with previews and load-more renders without overflow', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    mockHttp.queueResponse('GET', '/api/uploads', 200, {
      'uploads': [for (var i = 0; i < 20; i++) uploadJson(i)],
    });

    await tester.pumpWidget(buildScreen());
    await tester.pumpAndSettle();

    expect(find.byType(ListTile), findsWidgets);
    await tester.scrollUntilVisible(
      find.text('Carregar mais'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Carregar mais'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('list item with long error message wraps without overflow', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final withError = uploadJson(1, withPreview: false);
    withError['errorMessage'] =
        'Falha no processamento: o arquivo excedeu o tamanho máximo permitido '
        'pelo servidor e precisará ser reenviado manualmente.';
    mockHttp.queueResponse('GET', '/api/uploads', 200, {
      'uploads': [withError],
    });

    await tester.pumpWidget(buildScreen());
    await tester.pumpAndSettle();

    expect(find.byType(ListTile), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
