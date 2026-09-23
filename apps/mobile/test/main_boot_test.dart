import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/main.dart';
import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/models/pending_upload.dart';
import 'package:agrolens/models/user.dart';
import 'package:agrolens/screens/home_screen.dart';
import 'package:agrolens/screens/login_screen.dart';
import 'package:agrolens/screens/profile_screen.dart';
import 'package:agrolens/services/api_client.dart';
import 'package:agrolens/services/token_storage.dart';
import 'package:flutter/services.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'helpers/test_doubles.dart';

void main() {
  sqfliteFfiInit();
  testWidgets(
    'profile updates preserve active uploads; expiry removes nested routes',
    (tester) async {
      const connectivity = MethodChannel(
        'dev.fluttercommunity.plus/connectivity',
      );
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        connectivity,
        (_) async => ['none'],
      );
      const events = MethodChannel(
        'dev.fluttercommunity.plus/connectivity_status',
      );
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        events,
        (_) async => null,
      );
      addTearDown(() {
        tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          connectivity,
          null,
        );
        tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          events,
          null,
        );
      });
      final db = createTestAppDatabase();
      await tester.runAsync(() async {
        await db.database;
      });
      final client = MockHttpClient();
      final api = ApiClient(
        httpClient: client,
        env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
      );
      final storage = TokenStorage(storage: FakeFlutterSecureStorage());
      final user = User(
        id: 'a',
        email: 'a@example.com',
        fullName: 'Account A',
        role: 'user',
        createdAt: DateTime.utc(2026),
        updatedAt: DateTime.utc(2026),
      );
      await storage.saveTokens(accessToken: 'a', refreshToken: 'r');
      await storage.saveUser(user);
      client.queueResponse('GET', '/api/auth/me', 200, {'user': user.toJson()});
      await tester.pumpWidget(
        MaterialApp(
          home: AuthWrapper(
            apiClient: api,
            tokenStorage: storage,
            appDatabase: db,
          ),
        ),
      );
      for (
        var i = 0;
        i < 10 && find.byType(HomeScreen).evaluate().isEmpty;
        i++
      ) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)),
        );
        await tester.pump();
      }
      expect(find.byType(HomeScreen), findsOneWidget);
      for (var i = 0; i < 5; i++) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)),
        );
        await tester.pump();
      }
      final home = tester.widget<HomeScreen>(find.byType(HomeScreen));
      await tester.runAsync(() async {
        await home.databaseHelper.insertPendingUpload(
          PendingUpload(
            id: 'active',
            paths: [],
            latitude: 0,
            longitude: 0,
            createdAt: DateTime.utc(2026),
            status: PendingUploadStatus.uploading,
          ),
        );
        client.queueResponse('PATCH', '/api/users/me', 200, {
          'user': user.toJson(),
        });
      });
      final updated = home.authService.updateProfile(fullName: 'Updated');
      await tester.pump();
      await updated;
      await tester.runAsync(() async {
        expect(
          (await home.databaseHelper.getUploadById('active'))!.status,
          PendingUploadStatus.uploading,
        );
      });
      unawaited(
        Navigator.of(tester.element(find.byType(HomeScreen))).push(
          MaterialPageRoute<void>(
            builder: (_) => ProfileScreen(authService: home.authService),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(ProfileScreen), findsOneWidget);
      client.queueResponse('PATCH', '/api/users/me', 401, {
        'message': 'expired',
      });
      client.queueResponse('POST', '/api/auth/refresh', 401, {
        'message': 'revoked',
      });
      final expired = expectLater(
        home.authService.updateProfile(fullName: 'Changed'),
        throwsA(isA<ApiException>()),
      );
      await tester.pump();
      await expired;
      await tester.pumpAndSettle();
      expect(find.byType(LoginScreen), findsOneWidget);
      expect(find.byType(ProfileScreen), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.runAsync(db.close);
    },
  );

  testWidgets(
    'cold-start app boots through AuthWrapper without initialization errors',
    (tester) async {
      await tester.pumpWidget(const AgroLensRefactorApp());
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 100));
    },
  );
}
