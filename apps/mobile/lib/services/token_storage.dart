import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/user.dart';

/// Secure storage service for access/refresh tokens.
///
/// Uses platform secure storage (iOS Keychain, Android EncryptedSharedPreferences).
/// Tokens are NEVER stored in SQLite or plain preferences.
class TokenStorage {
  final FlutterSecureStorage _storage;

  static const _accessTokenKey = 'access_token';
  static const _refreshTokenKey = 'refresh_token';
  static const _userJsonKey = 'cached_user_json';

  TokenStorage({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(encryptedSharedPreferences: true),
          );

  /// Store both tokens after login, register, or refresh.
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    // Web storage creates a shared encryption key lazily on the first write.
    await _storage.write(key: _accessTokenKey, value: accessToken);
    await _storage.write(key: _refreshTokenKey, value: refreshToken);
  }

  /// Read the stored access token.
  Future<String?> getAccessToken() async {
    return _storage.read(key: _accessTokenKey);
  }

  /// Read the stored refresh token.
  Future<String?> getRefreshToken() async {
    return _storage.read(key: _refreshTokenKey);
  }

  /// Remove both tokens (logout).
  Future<void> clearTokens() async {
    await Future.wait([
      _storage.delete(key: _accessTokenKey),
      _storage.delete(key: _refreshTokenKey),
    ]);
  }

  /// Check if tokens are present (quick auth state check).
  Future<bool> hasTokens() async {
    final access = await getAccessToken();
    final refresh = await getRefreshToken();
    return access != null &&
        access.isNotEmpty &&
        refresh != null &&
        refresh.isNotEmpty;
  }

  Future<void> saveUser(User user) async {
    await _storage.write(key: _userJsonKey, value: jsonEncode(user.toJson()));
  }

  Future<User?> getCachedUser() async {
    final raw = await _storage.read(key: _userJsonKey);
    if (raw == null || raw.trim().isEmpty) return null;
    try {
      final json = jsonDecode(raw) as Map<String, dynamic>;
      return User.fromJson(json);
    } catch (_) {
      return null;
    }
  }

  Future<void> clearUser() async {
    await _storage.delete(key: _userJsonKey);
  }

  Future<void> clearAll() async {
    await Future.wait([
      _storage.delete(key: _accessTokenKey),
      _storage.delete(key: _refreshTokenKey),
      _storage.delete(key: _userJsonKey),
    ]);
  }
}
