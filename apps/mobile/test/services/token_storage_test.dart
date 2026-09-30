import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/services/token_storage.dart';
import '../helpers/test_doubles.dart';

void main() {
  late FakeFlutterSecureStorage fakeStorage;
  late TokenStorage tokenStorage;

  setUp(() {
    fakeStorage = FakeFlutterSecureStorage();
    tokenStorage = TokenStorage(storage: fakeStorage);
  });

  group('TokenStorage', () {
    test(
      'finishes the first encrypted write before starting the second',
      () async {
        final started = Completer<void>();
        final release = Completer<void>();
        final writes = <String>[];
        fakeStorage.beforeWrite = (key) async {
          writes.add(key);
          if (key == 'access_token') {
            started.complete();
            await release.future;
          }
        };
        final saving = tokenStorage.saveTokens(
          accessToken: 'access',
          refreshToken: 'refresh',
        );
        await started.future;
        expect(writes, ['access_token']);
        release.complete();
        await saving;
        expect(writes, ['access_token', 'refresh_token']);
        expect(await tokenStorage.hasTokens(), isTrue);
      },
    );
    test('saves, replaces, and clears the token pair', () async {
      expect(await tokenStorage.hasTokens(), isFalse);
      await tokenStorage.saveTokens(
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
      );

      expect(await tokenStorage.getAccessToken(), 'access-123');
      expect(await tokenStorage.getRefreshToken(), 'refresh-456');
      expect(await tokenStorage.hasTokens(), isTrue);

      await tokenStorage.saveTokens(
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      );
      expect(await tokenStorage.getAccessToken(), 'new-access');
      expect(await tokenStorage.getRefreshToken(), 'new-refresh');

      await tokenStorage.clearTokens();

      expect(await tokenStorage.getAccessToken(), isNull);
      expect(await tokenStorage.getRefreshToken(), isNull);
      expect(await tokenStorage.hasTokens(), isFalse);
    });
  });
}
