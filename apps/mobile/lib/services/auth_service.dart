import 'dart:async';

import '../models/user.dart';
import 'api_client.dart';
import 'token_storage.dart';

/// Auth service that uses the backend `/auth/*` endpoints.
///
/// Manages token lifecycle: login, register, refresh, logout, and session
/// restoration via GET /auth/me.
class AuthService {
  final ApiClient _apiClient;
  final TokenStorage _tokenStorage;

  /// Stream of auth state changes. Emits the current user or null.
  final StreamController<User?> _authStateController =
      StreamController<User?>.broadcast();

  AuthService({required this._apiClient, required this._tokenStorage}) {
    _apiClient.setRefreshHandler(_refreshAccessToken);
  }

  Stream<User?> get authStateChanges => _authStateController.stream;

  User? _currentUser;
  int _sessionGeneration = 0;
  int get sessionGeneration => _sessionGeneration;
  Future<String?>? _refreshInFlight;
  // Serialize storage commits with session transitions, including token rotation.
  Future<void>? _storageWrite;
  User? get currentUser => _currentUser;

  /// Register a new user. On success, stores tokens and updates state.
  Future<User> register({
    required String email,
    required String password,
    required String fullName,
    String? phone,
  }) async {
    final generation = ++_sessionGeneration;
    _refreshInFlight = null;
    _apiClient.invalidateAuthRequests();
    await _storageWrite;
    _ensureSession(generation);
    final response = await _apiClient.register(
      email: email,
      password: password,
      fullName: fullName,
      phone: phone,
    );
    await _writeForSession(generation, () async {
      await _tokenStorage.saveTokens(
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      );
      await _tokenStorage.saveUser(response.user);
    });
    _ensureSession(generation);
    _currentUser = response.user;
    _authStateController.add(_currentUser);
    return response.user;
  }

  /// Login with email/password. On success, stores tokens and updates state.
  Future<User> login({required String email, required String password}) async {
    final generation = ++_sessionGeneration;
    _refreshInFlight = null;
    _apiClient.invalidateAuthRequests();
    await _storageWrite;
    _ensureSession(generation);
    final response = await _apiClient.login(email: email, password: password);
    await _writeForSession(generation, () async {
      await _tokenStorage.saveTokens(
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      );
      await _tokenStorage.saveUser(response.user);
    });
    _ensureSession(generation);
    _currentUser = response.user;
    _authStateController.add(_currentUser);
    return response.user;
  }

  /// Attempt to restore session using stored tokens.
  ///
  /// Never throws on network errors. Uses a bounded timeout for the
  /// network path and falls back to the cached [User] persisted in
  /// [FlutterSecureStorage] so previously authenticated users can use
  /// the app offline. Tokens are only cleared on 401.
  Future<User?> tryRestoreSession({
    Duration restoreTimeout = const Duration(seconds: 7),
  }) async {
    final generation = _sessionGeneration;
    final hasTokens = await _tokenStorage.hasTokens();
    if (!hasTokens || generation != _sessionGeneration) return null;

    final accessToken = await _tokenStorage.getAccessToken();
    if (accessToken != null) {
      try {
        final me = await _apiClient
            .me(accessToken: accessToken, retry: false)
            .timeout(restoreTimeout);
        await _writeForSession(
          generation,
          () => _tokenStorage.saveUser(me.user),
        );
        _ensureSession(generation);
        _currentUser = me.user;
        _authStateController.add(_currentUser);
        return me.user;
      } on ApiException catch (e) {
        if (generation != _sessionGeneration) return null;
        if (e.statusCode != 401) {
          return _restoreFromCacheOrNull(generation);
        }
        // Access token expired, try refresh below
      } catch (_) {
        return _restoreFromCacheOrNull(generation);
      }
    }

    // Try refreshing
    final refreshToken = await _tokenStorage.getRefreshToken();
    if (generation != _sessionGeneration) return null;
    if (refreshToken == null) {
      await _writeForSession(generation, _tokenStorage.clearAll);
      return null;
    }

    try {
      // Persist rotation even if startup stops waiting and falls back offline.
      final accessToken = await _refreshAccessToken().timeout(restoreTimeout);
      if (accessToken == null || generation != _sessionGeneration) return null;
      final me = await _apiClient
          .me(accessToken: accessToken, retry: false)
          .timeout(restoreTimeout);
      await _writeForSession(generation, () => _tokenStorage.saveUser(me.user));
      _ensureSession(generation);
      _currentUser = me.user;
      _authStateController.add(_currentUser);
      return me.user;
    } on ApiException catch (error) {
      if (generation != _sessionGeneration) return null;
      if (error.statusCode == 401) {
        await _writeForSession(generation, _tokenStorage.clearAll);
        _ensureSession(generation);
        _sessionGeneration++;
        _apiClient.invalidateAuthRequests();
        _currentUser = null;
        _authStateController.add(null);
        return null;
      }
      return _restoreFromCacheOrNull(generation);
    } catch (_) {
      return _restoreFromCacheOrNull(generation);
    }
  }

  Future<User?> _restoreFromCacheOrNull(int generation) async {
    final cached = await _tokenStorage.getCachedUser();
    if (generation != _sessionGeneration) return null;
    if (cached != null) {
      _currentUser = cached;
      _authStateController.add(_currentUser);
      return cached;
    }
    return null;
  }

  /// Logout: revoke refresh token on backend and clear local storage.
  Future<void> logout() async {
    final generation = ++_sessionGeneration;
    _refreshInFlight = null;
    _apiClient.invalidateAuthRequests();
    await _storageWrite;
    _ensureSession(generation);
    final refreshToken = await _tokenStorage.getRefreshToken();
    await _writeForSession(generation, _tokenStorage.clearAll);
    _ensureSession(generation);
    _currentUser = null;
    _authStateController.add(null);
    try {
      if (refreshToken != null) {
        await _apiClient.logout(refreshToken: refreshToken);
      }
    } catch (_) {
      // Ignore backend errors on logout — still clear local state
    }
  }

  /// Update the current user's profile via PATCH /users/me.
  Future<User> updateProfile({required String fullName, String? phone}) async {
    final generation = _sessionGeneration;
    final token = await getValidAccessToken();
    if (token == null || generation != _sessionGeneration) {
      throw const ApiException(401, 'Not authenticated');
    }

    final me = await _apiClient.updateProfile(
      accessToken: token,
      fullName: fullName,
      phone: phone,
    );

    if (generation != _sessionGeneration) {
      throw const ApiException(401, 'Session changed');
    }
    await _writeForSession(generation, () => _tokenStorage.saveUser(me.user));
    _ensureSession(generation);
    _currentUser = me.user;
    _authStateController.add(_currentUser);
    return me.user;
  }

  /// Request a password reset email for [email].
  /// Unauthenticated — always shows generic success to avoid enumeration.
  Future<void> requestPasswordReset({required String email}) async {
    await _apiClient.requestPasswordReset(email: email);
  }

  /// Return the stored access token. Authenticated API calls refresh it on 401.
  /// Returns null if not authenticated.
  Future<String?> getValidAccessToken() => _tokenStorage.getAccessToken();

  Future<String?> _refreshAccessToken() {
    final existing = _refreshInFlight;
    if (existing != null) return existing;
    final future = _executeRefresh();
    _refreshInFlight = future;
    return future.whenComplete(() {
      if (identical(_refreshInFlight, future)) _refreshInFlight = null;
    });
  }

  Future<String?> _executeRefresh() async {
    final generation = _sessionGeneration;
    final refreshToken = await _tokenStorage.getRefreshToken();
    if (refreshToken == null) return null;
    try {
      final refreshed = await _apiClient.refresh(refreshToken: refreshToken);
      if (generation != _sessionGeneration) return null;
      await _writeForSession(
        generation,
        () => _tokenStorage.saveTokens(
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
        ),
      );
      if (generation != _sessionGeneration) return null;
      return refreshed.accessToken;
    } on ApiException catch (error) {
      if (generation != _sessionGeneration) return null;
      if (error.statusCode == 401) {
        await _writeForSession(generation, _tokenStorage.clearAll);
        _ensureSession(generation);
        _sessionGeneration++;
        _apiClient.invalidateAuthRequests();
        _currentUser = null;
        _authStateController.add(null);
        return null;
      }
      rethrow;
    }
  }

  void _ensureSession(int generation) {
    if (generation != _sessionGeneration) {
      throw const ApiException(401, 'Session changed');
    }
  }

  Future<void> _writeForSession(
    int generation,
    Future<void> Function() write,
  ) async {
    final previous = _storageWrite;
    final pending = Future<void>.sync(() async {
      if (previous != null) await previous;
      _ensureSession(generation);
      await write();
    });
    final tracked = pending.catchError((Object _) {});
    _storageWrite = tracked;
    try {
      await pending;
      _ensureSession(generation);
    } finally {
      if (identical(_storageWrite, tracked)) _storageWrite = null;
    }
  }

  void dispose() {
    _authStateController.close();
  }
}
