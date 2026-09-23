import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/config/env_config.dart';

void main() {
  group('EnvConfig constants', () {
    test('production default targets the public API', () {
      expect(
        EnvConfig.productionApiBaseUrl,
        equals('https://app.agrolens.rgw.app/api'),
      );
    });

    test('default API base URL is the safe production URL', () {
      expect(
        EnvConfig.defaultApiBaseUrl,
        equals(EnvConfig.productionApiBaseUrl),
      );
    });

    test('explicit apiBaseUrl override is honored', () {
      const env = EnvConfig(apiBaseUrl: 'https://test.api/api');
      expect(env.apiBaseUrl, equals('https://test.api/api'));
      expect(
        env.uri('/uploads').toString(),
        equals('https://test.api/api/uploads'),
      );
    });

    test('defaultInstance resolves to the production default', () {
      // When API_BASE_URL is supplied via --dart-define this assertion is
      // skipped (covered by the override test below); otherwise the resolved
      // default must be the safe production URL, never a local host.
      const override = String.fromEnvironment('API_BASE_URL');
      if (override.isNotEmpty) return;
      final env = EnvConfig.defaultInstance();
      expect(env.apiBaseUrl, equals(EnvConfig.productionApiBaseUrl));
      expect(env.apiBaseUrl, isNot(startsWith('http://10.0.2.2')));
      expect(env.apiBaseUrl, isNot(startsWith('http://10.0.0.2')));
    });

    test('defaultInstance honors API_BASE_URL dart-define when set', () {
      // Mirrors the integration test gate: this assertion only runs when the
      // test is launched with --dart-define=API_BASE_URL=....
      const override = String.fromEnvironment('API_BASE_URL');
      if (override.isEmpty) {
        // No override supplied; verify the safe production default instead.
        expect(
          EnvConfig.defaultInstance().apiBaseUrl,
          equals(EnvConfig.productionApiBaseUrl),
        );
        return;
      }
      expect(EnvConfig.defaultInstance().apiBaseUrl, equals(override));
    });
    test('uri throws FormatException when apiBaseUrl lacks a valid scheme', () {
      const invalid = EnvConfig(apiBaseUrl: 'no-scheme.com/api');
      expect(() => invalid.uri('/uploads'), throwsFormatException);
    });
  });
}
