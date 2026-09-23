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
    test('saveTokens stores both access and refresh', () async {
      await tokenStorage.saveTokens(
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
      );

      expect(await tokenStorage.getAccessToken(), 'access-123');
      expect(await tokenStorage.getRefreshToken(), 'refresh-456');
    });

    test('hasTokens returns true when both tokens are present', () async {
      expect(await tokenStorage.hasTokens(), isFalse);

      await tokenStorage.saveTokens(accessToken: 'a', refreshToken: 'b');

      expect(await tokenStorage.hasTokens(), isTrue);
    });

    test('clearTokens removes both tokens', () async {
      await tokenStorage.saveTokens(accessToken: 'a', refreshToken: 'b');
      await tokenStorage.clearTokens();

      expect(await tokenStorage.getAccessToken(), isNull);
      expect(await tokenStorage.getRefreshToken(), isNull);
      expect(await tokenStorage.hasTokens(), isFalse);
    });

    test('overwrite updates existing tokens', () async {
      await tokenStorage.saveTokens(accessToken: 'old', refreshToken: 'old');
      await tokenStorage.saveTokens(
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      );

      expect(await tokenStorage.getAccessToken(), 'new-access');
      expect(await tokenStorage.getRefreshToken(), 'new-refresh');
    });
  });
}
