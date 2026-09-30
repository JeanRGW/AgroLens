import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/services/api_client.dart';
import 'package:agrolens/services/auth_service.dart';
import 'package:agrolens/services/catalog_repository.dart';
import 'package:agrolens/services/database_helper.dart';
import 'package:agrolens/services/sync_service.dart';
import 'package:agrolens/services/token_storage.dart';
import 'package:agrolens/screens/about_screen.dart';
import 'package:agrolens/screens/home_screen.dart';
import 'package:agrolens/screens/login_screen.dart';
import '../helpers/test_doubles.dart';

void main() {
  late MockHttpClient mockHttp;
  late ApiClient apiClient;
  late TokenStorage tokenStorage;
  late AuthService authService;

  setUp(() {
    mockHttp = MockHttpClient();
    apiClient = ApiClient(
      httpClient: mockHttp,
      env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
    );
    tokenStorage = TokenStorage(storage: FakeFlutterSecureStorage());
    authService = AuthService(apiClient: apiClient, tokenStorage: tokenStorage);
  });

  testWidgets('forgot password navigates to password recovery screen', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(home: LoginScreen(authService: authService)),
    );

    await tester.tap(find.text('Esqueceu a senha?'));
    await tester.pumpAndSettle();

    expect(find.text('Recuperação de senha'), findsOneWidget);
    expect(find.text('Enviar link'), findsOneWidget);
  });

  testWidgets('home exposes the About action from the app bar', (tester) async {
    final now = DateTime.now().toIso8601String();
    await tokenStorage.saveTokens(
      accessToken: 'access-123',
      refreshToken: 'refresh-456',
    );
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
    final databaseHelper = DatabaseHelper(
      appDatabase: appDb,
      authService: authService,
    );
    final catalogRepository = CatalogRepository(
      appDatabase: appDb,
      apiClient: apiClient,
      authService: authService,
    );
    final syncService = SyncService(
      apiClient: apiClient,
      authService: authService,
      databaseHelper: databaseHelper,
      catalogRepository: catalogRepository,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: HomeScreen(
          authService: authService,
          databaseHelper: databaseHelper,
          catalogRepository: catalogRepository,
          syncService: syncService,
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 2));

    expect(find.byTooltip('Mais opções'), findsNothing);
    expect(find.byTooltip('Sair'), findsOneWidget);
  });

  testWidgets('about screen shows AgroLens web details', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: AboutScreen()));

    expect(find.text('https://app.agrolens.rgw.app'), findsWidgets);
    expect(
      find.textContaining('contate o administrador do sistema'),
      findsOneWidget,
    );
  });
}
