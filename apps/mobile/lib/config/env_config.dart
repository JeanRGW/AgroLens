import 'api_base_url.dart';

/// Environment and API configuration for the mobile app.
///
/// The backend base URL is resolved at compile time from the
/// `--dart-define=API_BASE_URL` definition. When no definition is supplied, a
/// safe production default is used so that release APKs always target the
/// public API. During local development, override it with e.g.
/// `--dart-define=API_BASE_URL=http://10.0.2.2:3000/api`.
class EnvConfig {
  /// Production public API base URL. This is the safe default used by release
  /// builds so a distributed APK never points at an emulator/local host.
  static const String productionApiBaseUrl = 'https://app.agrolens.rgw.app/api';

  /// Default (production) API base URL. Used when no `--dart-define` is set.
  static const String defaultApiBaseUrl = productionApiBaseUrl;

  /// The backend API base URL (e.g. `https://app.agrolens.rgw.app/api`).
  final String apiBaseUrl;

  const EnvConfig({this.apiBaseUrl = defaultApiBaseUrl})
    : assert(apiBaseUrl.length > 0, 'apiBaseUrl cannot be empty');

  /// Resolves the API base URL from compile-time dart-defines.
  ///
  /// Prefers `API_BASE_URL` (from `--dart-define`); otherwise falls back to
  /// the platform default: [defaultApiBaseUrl] (production) on io, and the
  /// same-origin `/api` on web.
  static final EnvConfig _instance = EnvConfig._resolve();
  factory EnvConfig.defaultInstance() => _instance;

  static EnvConfig _resolve() {
    const defined = String.fromEnvironment('API_BASE_URL');
    if (defined.isNotEmpty) return EnvConfig(apiBaseUrl: defined);
    final platformBase = platformDefaultApiBaseUrl();
    return EnvConfig(apiBaseUrl: platformBase ?? defaultApiBaseUrl);
  }

  /// Convenience getter for forming endpoint paths.
  Uri uri(String path) {
    final base = Uri.parse(apiBaseUrl);
    if (!base.hasScheme) {
      throw FormatException(
        'API base URL must have a valid scheme (http/https): $apiBaseUrl',
      );
    }
    return Uri.parse('$apiBaseUrl$path');
  }
}
