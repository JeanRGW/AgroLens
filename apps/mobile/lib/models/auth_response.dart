import 'user.dart';

/// Response payload from POST /auth/login and POST /auth/register.
class AuthResponse {
  final User user;
  final String accessToken;
  final String refreshToken;

  const AuthResponse({
    required this.user,
    required this.accessToken,
    required this.refreshToken,
  });

  factory AuthResponse.fromJson(Map<String, dynamic> json) {
    return AuthResponse(
      user: User.fromJson(json['user'] as Map<String, dynamic>),
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
    );
  }
}

/// Response payload from POST /auth/refresh.
class RefreshResponse {
  final String accessToken;
  final String refreshToken;

  const RefreshResponse({
    required this.accessToken,
    required this.refreshToken,
  });

  factory RefreshResponse.fromJson(Map<String, dynamic> json) {
    return RefreshResponse(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
    );
  }
}

/// Response payload from GET /auth/me.
class MeResponse {
  final User user;

  const MeResponse({required this.user});

  factory MeResponse.fromJson(Map<String, dynamic> json) {
    return MeResponse(
      user: User.fromJson(json['user'] as Map<String, dynamic>),
    );
  }
}
