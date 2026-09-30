import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/services/api_client.dart';
import 'package:agrolens/services/auth_service.dart';
import 'package:agrolens/services/token_storage.dart';
import 'package:agrolens/screens/login_screen.dart';
import '../helpers/test_doubles.dart';

void main() {
  late MockHttpClient mockHttp;
  late ApiClient apiClient;
  late AuthService authService;

  setUp(() {
    mockHttp = MockHttpClient();
    apiClient = ApiClient(
      httpClient: mockHttp,
      env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
    );
    authService = AuthService(
      apiClient: apiClient,
      tokenStorage: TokenStorage(storage: FakeFlutterSecureStorage()),
    );
  });

  Future<void> pumpLogin(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(home: LoginScreen(authService: authService)),
    );
    await tester.enterText(
      find.byType(TextFormField).at(0),
      'suspenso@test.local',
    );
    await tester.enterText(find.byType(TextFormField).at(1), 'password123');
    // The form lives in a scrollable column taller than the 800x600 test
    // viewport, so the button may be off-screen depending on async asset
    // layout timing. Bring it into view before tapping.
    await tester.ensureVisible(find.text('Entrar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Entrar'));
    await tester.pumpAndSettle();
  }

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

  testWidgets('shows the suspension message for disabled accounts', (
    tester,
  ) async {
    mockHttp.queueResponse('POST', '/api/auth/login', 401, {
      'message': 'Account is disabled',
      'code': 'account_disabled',
      'error': 'Unauthorized',
      'statusCode': 401,
    });

    await pumpLogin(tester);

    expect(
      find.text('Conta suspensa. Fale com um administrador.'),
      findsOneWidget,
    );
  });

  testWidgets('keeps the server message for other login failures', (
    tester,
  ) async {
    mockHttp.queueResponse('POST', '/api/auth/login', 401, {
      'message': 'Invalid email or password',
    });

    await pumpLogin(tester);

    expect(find.text('Invalid email or password'), findsOneWidget);
    expect(
      find.text('Conta suspensa. Fale com um administrador.'),
      findsNothing,
    );
  });
}
