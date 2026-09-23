import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'package:agrolens/models/user.dart';
import 'package:agrolens/services/app_database.dart';
import 'package:agrolens/services/auth_service.dart';

/// Helper to create an isolated in-memory [AppDatabase] for unit tests.
AppDatabase createTestAppDatabase({String? path}) {
  return AppDatabase(
    factory: databaseFactoryFfi,
    path: path ?? inMemoryDatabasePath,
  );
}

/// Fake in-memory implementation of [FlutterSecureStorage] for unit tests.
class FakeFlutterSecureStorage extends FlutterSecureStorage {
  final Map<String, String> _store = {};

  @override
  Future<void> write({
    required String key,
    String? value,
    AndroidOptions? aOptions,
    IOSOptions? iOptions,
    LinuxOptions? lOptions,
    MacOsOptions? mOptions,
    WebOptions? webOptions,
    WindowsOptions? wOptions,
    WindowsOptions? wOptionsWindows,
  }) async {
    if (value != null) _store[key] = value;
  }

  @override
  Future<String?> read({
    required String key,
    AndroidOptions? aOptions,
    IOSOptions? iOptions,
    LinuxOptions? lOptions,
    MacOsOptions? mOptions,
    WebOptions? webOptions,
    WindowsOptions? wOptions,
    WindowsOptions? wOptionsWindows,
  }) async {
    return _store[key];
  }

  @override
  Future<void> delete({
    required String key,
    AndroidOptions? aOptions,
    IOSOptions? iOptions,
    LinuxOptions? lOptions,
    MacOsOptions? mOptions,
    WebOptions? webOptions,
    WindowsOptions? wOptions,
    WindowsOptions? wOptionsWindows,
  }) async {
    _store.remove(key);
  }

  @override
  Future<bool> containsKey({
    required String key,
    AndroidOptions? aOptions,
    IOSOptions? iOptions,
    LinuxOptions? lOptions,
    MacOsOptions? mOptions,
    WebOptions? webOptions,
    WindowsOptions? wOptions,
    WindowsOptions? wOptionsWindows,
  }) async {
    return _store.containsKey(key);
  }

  @override
  Future<Map<String, String>> readAll({
    AndroidOptions? aOptions,
    IOSOptions? iOptions,
    LinuxOptions? lOptions,
    MacOsOptions? mOptions,
    WebOptions? webOptions,
    WindowsOptions? wOptions,
    WindowsOptions? wOptionsWindows,
  }) async {
    return Map.unmodifiable(_store);
  }
}

/// Mock HTTP client that returns canned JSON or raw text responses.
///
/// Use [queueResponse] for JSON responses and [queueRawResponse] for
/// raw-string responses (e.g. 204 No Content, non-JSON 2xx).
class MockHttpClient extends http.BaseClient {
  final Map<String, List<(int, Map<String, dynamic>)>> _responses = {};
  final Map<String, List<(int, String)>> _rawResponses = {};
  final List<http.BaseRequest> _requests = [];
  Future<void> Function(http.BaseRequest)? beforeResponse;

  void queueResponse(
    String method,
    String path,
    int statusCode,
    Map<String, dynamic> body,
  ) {
    _responses.putIfAbsent('$method $path', () => []).add((statusCode, body));
  }

  void queueRawResponse(
    String method,
    String path,
    int statusCode,
    String body,
  ) {
    _rawResponses.putIfAbsent('$method $path', () => []).add((
      statusCode,
      body,
    ));
  }

  List<http.BaseRequest> get requests => List.unmodifiable(_requests);

  void clearRequests() => _requests.clear();

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    _requests.add(request);
    await beforeResponse?.call(request);
    final key = '${request.method} ${request.url.path}';

    // Check raw (non-JSON) responses first
    final rawQueue = _rawResponses[key];
    if (rawQueue != null && rawQueue.isNotEmpty) {
      final (statusCode, responseBody) = rawQueue.removeAt(0);
      final bytes = utf8.encode(responseBody);
      return Future.value(
        http.StreamedResponse(
          http.ByteStream.fromBytes(bytes),
          statusCode,
          headers: {'content-type': 'text/plain'},
        ),
      );
    }

    // Then check JSON responses
    final queue = _responses[key];
    if (queue == null || queue.isEmpty) {
      final body = utf8.encode(
        jsonEncode({'message': 'Not mock-matched: $key'}),
      );
      return Future.value(
        http.StreamedResponse(
          http.ByteStream.fromBytes(body),
          404,
          headers: {'content-type': 'application/json'},
        ),
      );
    }

    final (statusCode, responseBody) = queue.removeAt(0);
    final bytes = utf8.encode(jsonEncode(responseBody));
    return Future.value(
      http.StreamedResponse(
        http.ByteStream.fromBytes(bytes),
        statusCode,
        headers: {'content-type': 'application/json'},
      ),
    );
  }
}

/// Fake auth service that always returns a hard-coded access token.
///
/// Avoids the need to set up token storage and mock HTTP responses just to
/// satisfy [AuthService.getValidAccessToken].
class FakeAuthService extends AuthService {
  FakeAuthService({
    required super.apiClient,
    required super.tokenStorage,
    String userId = 'user-1',
    this._accessTokenProvider,
  }) : _user = User(
         id: userId,
         email: '$userId@example.com',
         fullName: 'Test User',
         role: 'user',
         createdAt: DateTime.utc(2026, 1, 1),
         updatedAt: DateTime.utc(2026, 1, 1),
       );

  final User _user;
  final String? Function()? _accessTokenProvider;
  bool _authenticated = true;

  @override
  User? get currentUser => _authenticated ? _user : null;

  void setAuthenticated(bool authenticated) => _authenticated = authenticated;

  @override
  Future<String?> getValidAccessToken() async =>
      _authenticated ? (_accessTokenProvider?.call() ?? 'token-123') : null;
}
