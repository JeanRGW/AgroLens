import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/config/env_config.dart';

void main() {
  group('EnvConfig', () {
    test('explicit apiBaseUrl override is honored', () {
      const env = EnvConfig(apiBaseUrl: 'https://test.api/api');
      expect(env.apiBaseUrl, equals('https://test.api/api'));
      expect(
        env.uri('/uploads').toString(),
        equals('https://test.api/api/uploads'),
      );
    });

    test('defaultInstance resolves the configured or production endpoint', () {
      const override = String.fromEnvironment('API_BASE_URL');
      expect(
        EnvConfig.defaultInstance().apiBaseUrl,
        override.isEmpty ? 'https://app.agrolens.rgw.app/api' : override,
      );
    });
    test('uri throws FormatException when apiBaseUrl lacks a valid scheme', () {
      const invalid = EnvConfig(apiBaseUrl: 'no-scheme.com/api');
      expect(() => invalid.uri('/uploads'), throwsFormatException);
    });
  });
}
