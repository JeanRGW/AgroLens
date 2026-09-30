import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/env_config.dart';
import '../models/catalog.dart';
import '../models/auth_response.dart';
import '../models/download_url_response.dart';
import '../models/upload_response.dart';

/// Typed API client for the backend.
///
/// Handles HTTP calls, JSON serialization, and Bearer token injection.
/// Does NOT manage token lifecycle — callers (AuthService, SyncService)
/// provide the current access token.
class ApiClient {
  final http.Client _httpClient;
  final EnvConfig _env;
  final Duration requestTimeout;
  final Duration uploadTimeout;
  Future<String?> Function()? _refreshAccessToken;
  Future<String?>? _refreshInFlight;
  int _authGeneration = 0;

  void invalidateAuthRequests() {
    _authGeneration++;
    _refreshInFlight = null;
  }

  ApiClient({
    http.Client? httpClient,
    EnvConfig? env,
    this.requestTimeout = const Duration(seconds: 30),
    this.uploadTimeout = const Duration(minutes: 5),
  }) : _httpClient = httpClient ?? http.Client(),
       _env = env ?? EnvConfig.defaultInstance();

  /// Installs the one auth coordinator used by every authenticated request.
  void setRefreshHandler(Future<String?> Function()? handler) {
    _refreshAccessToken = handler;
  }

  // ── Auth endpoints ────────────────────────────────────────────────

  Future<AuthResponse> register({
    required String email,
    required String password,
    required String fullName,
    String? phone,
  }) async {
    final body = {
      'email': email.trim().toLowerCase(),
      'password': password,
      'fullName': fullName.trim(),
      'clientType': 'mobile',
    };
    if (phone != null && phone.trim().isNotEmpty) {
      body['phone'] = phone.trim();
    }
    return _post('/auth/register', body, (json) => AuthResponse.fromJson(json));
  }

  Future<AuthResponse> login({
    required String email,
    required String password,
  }) async {
    return _post('/auth/login', {
      'email': email.trim().toLowerCase(),
      'password': password,
      'clientType': 'mobile',
    }, (json) => AuthResponse.fromJson(json));
  }

  Future<RefreshResponse> refresh({required String refreshToken}) async {
    return _post('/auth/refresh', {
      'refreshToken': refreshToken,
      'clientType': 'mobile',
    }, (json) => RefreshResponse.fromJson(json));
  }

  Future<void> logout({required String refreshToken}) async {
    final uri = _env.uri('/auth/logout');
    final response = await _httpClient
        .post(
          uri,
          headers: const {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: jsonEncode({
            'refreshToken': refreshToken,
            'clientType': 'mobile',
          }),
        )
        .timeout(requestTimeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final json = _decodeErrorJson(response);
      throw ApiException(
        response.statusCode,
        _extractErrorMessage(json, response.statusCode),
        code: _extractErrorCode(json),
      );
    }
  }

  Future<void> requestPasswordReset({required String email}) async {
    final uri = _env.uri('/auth/forgot-password');
    final response = await _httpClient
        .post(
          uri,
          headers: const {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: jsonEncode({'email': email.trim()}),
        )
        .timeout(requestTimeout);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return;
    }
    final json = _decodeErrorJson(response);
    throw ApiException(
      response.statusCode,
      _extractErrorMessage(json, response.statusCode),
      code: _extractErrorCode(json),
    );
  }

  Future<MeResponse> me({
    required String accessToken,
    bool retry = true,
  }) async {
    return _get(
      '/auth/me',
      accessToken,
      (json) => MeResponse.fromJson(json),
      retry: retry,
    );
  }

  // ── Upload endpoints ──────────────────────────────────────────────

  Future<UploadInitResponse> uploadInit({
    required String accessToken,
    required Map<String, dynamic> body,
  }) async {
    return _post(
      '/uploads/init',
      body,
      (json) => UploadInitResponse.fromJson(json),
      accessToken: accessToken,
    );
  }

  Future<UploadCompleteResponse> uploadComplete({
    required String accessToken,
    required String uploadId,
  }) async {
    return _post(
      '/uploads/$uploadId/complete',
      null,
      (json) => UploadCompleteResponse.fromJson(json),
      accessToken: accessToken,
    );
  }

  Future<UploadDetail> getUploadDetail({
    required String accessToken,
    required String uploadId,
  }) async {
    return _get(
      '/uploads/$uploadId',
      accessToken,
      (json) => UploadDetail.fromJson(json),
    );
  }

  Future<List<UploadDetail>> listUploads({
    required String accessToken,
    Map<String, String>? queryParams,
  }) async {
    String path = '/uploads';
    if (queryParams != null && queryParams.isNotEmpty) {
      final parts = queryParams.entries
          .map(
            (e) =>
                '${Uri.encodeComponent(e.key)}=${Uri.encodeComponent(e.value)}',
          )
          .join('&');
      path = '$path?$parts';
    }
    return _get(path, accessToken, (json) {
      final list = json['uploads'] as List<dynamic>;
      return list
          .map((e) => UploadDetail.fromJson(e as Map<String, dynamic>))
          .toList();
    });
  }

  // ── Download URL endpoint ─────────────────────────────────────────

  Future<DownloadUrlResponse> getDownloadUrl({
    required String accessToken,
    required String uploadId,
    required String fileId,
  }) async {
    return _get(
      '/uploads/$uploadId/files/$fileId/download-url',
      accessToken,
      (json) => DownloadUrlResponse.fromJson(json),
    );
  }

  Future<DownloadUrlResponse> getPreviewUrl({
    required String accessToken,
    required String uploadId,
    required String fileId,
  }) async {
    return _get(
      '/uploads/$uploadId/files/$fileId/preview-url',
      accessToken,
      (json) => DownloadUrlResponse.fromJson(json),
    );
  }

  Future<void> deleteUpload({
    required String accessToken,
    required String uploadId,
  }) async {
    await _delete('/uploads/$uploadId', accessToken: accessToken);
  }

  // ── Profile update endpoint ───────────────────────────────────────

  Future<MeResponse> updateProfile({
    required String accessToken,
    required String fullName,
    String? phone,
  }) async {
    final body = <String, dynamic>{'fullName': fullName.trim()};
    if (phone != null) {
      body['phone'] = phone.trim().isEmpty ? null : phone.trim();
    }
    return _patch(
      '/users/me',
      body,
      (json) => MeResponse.fromJson(json),
      accessToken: accessToken,
    );
  }

  // ── Catalog endpoints ─────────────────────────────────────────────

  Future<List<Map<String, dynamic>>> getProperties({
    required String accessToken,
  }) async {
    return _getList('/properties', accessToken, 'properties');
  }

  Future<List<Map<String, dynamic>>> getTalhoes({
    required String accessToken,
    String? propertyId,
  }) async {
    final path = propertyId != null
        ? '/talhoes?propertyId=$propertyId'
        : '/talhoes';
    return _getList(path, accessToken, 'talhoes');
  }

  Future<List<Map<String, dynamic>>> getCropTypes({
    required String accessToken,
  }) async {
    return _getList('/crop-types', accessToken, 'cropTypes');
  }

  Future<List<Map<String, dynamic>>> getEstadios({
    required String accessToken,
    String? cropTypeId,
  }) async {
    final path = cropTypeId != null
        ? '/estadios?cropTypeId=$cropTypeId'
        : '/estadios';
    return _getList(path, accessToken, 'estadios');
  }

  Future<Property> createProperty({
    required String accessToken,
    required String name,
    required String owner,
    required String address,
    required double latitude,
    required double longitude,
  }) async {
    return _post(
      '/properties',
      {
        'name': name,
        'owner': owner,
        'address': address,
        'latitude': latitude,
        'longitude': longitude,
      },
      (json) => _unwrapEntity(json, 'property', Property.fromJson),
      accessToken: accessToken,
    );
  }

  Future<Property> updateProperty({
    required String accessToken,
    required String propertyId,
    String? name,
    String? owner,
    String? address,
    double? latitude,
    double? longitude,
    String? userId,
  }) async {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name;
    if (owner != null) body['owner'] = owner;
    if (address != null) body['address'] = address;
    if (latitude != null) body['latitude'] = latitude;
    if (longitude != null) body['longitude'] = longitude;
    if (userId != null) body['userId'] = userId;
    return _patch(
      '/properties/$propertyId',
      body,
      (json) => _unwrapEntity(json, 'property', Property.fromJson),
      accessToken: accessToken,
    );
  }

  Future<void> deleteProperty({
    required String accessToken,
    required String propertyId,
  }) async {
    await _delete('/properties/$propertyId', accessToken: accessToken);
  }

  Future<Talhao> createTalhao({
    required String accessToken,
    required String name,
    required String propertyId,
  }) async {
    return _post(
      '/talhoes',
      {'name': name, 'propertyId': propertyId},
      (json) => _unwrapEntity(json, 'talhao', Talhao.fromJson),
      accessToken: accessToken,
    );
  }

  Future<Talhao> updateTalhao({
    required String accessToken,
    required String talhaoId,
    required String name,
    String? propertyId,
    String? userId,
  }) async {
    return _patch(
      '/talhoes/$talhaoId',
      {'name': name, 'propertyId': ?propertyId, 'userId': ?userId},
      (json) => _unwrapEntity(json, 'talhao', Talhao.fromJson),
      accessToken: accessToken,
    );
  }

  Future<void> deleteTalhao({
    required String accessToken,
    required String talhaoId,
  }) async {
    await _delete('/talhoes/$talhaoId', accessToken: accessToken);
  }

  Future<CropType> createCropType({
    required String accessToken,
    required String name,
  }) async {
    return _post(
      '/crop-types',
      {'name': name},
      (json) => _unwrapEntity(json, 'cropType', CropType.fromJson),
      accessToken: accessToken,
    );
  }

  Future<CropType> updateCropType({
    required String accessToken,
    required String cropTypeId,
    required String name,
    String? userId,
  }) async {
    return _patch(
      '/crop-types/$cropTypeId',
      {'name': name, 'userId': ?userId},
      (json) => _unwrapEntity(json, 'cropType', CropType.fromJson),
      accessToken: accessToken,
    );
  }

  Future<void> deleteCropType({
    required String accessToken,
    required String cropTypeId,
  }) async {
    await _delete('/crop-types/$cropTypeId', accessToken: accessToken);
  }

  Future<Estadio> createEstadio({
    required String accessToken,
    required String name,
    required String cropTypeId,
  }) async {
    return _post(
      '/estadios',
      {'name': name, 'cropTypeId': cropTypeId},
      (json) => _unwrapEntity(json, 'estadio', Estadio.fromJson),
      accessToken: accessToken,
    );
  }

  Future<Estadio> updateEstadio({
    required String accessToken,
    required String estadioId,
    required String name,
    String? cropTypeId,
    String? userId,
  }) async {
    return _patch(
      '/estadios/$estadioId',
      {'name': name, 'cropTypeId': ?cropTypeId, 'userId': ?userId},
      (json) => _unwrapEntity(json, 'estadio', Estadio.fromJson),
      accessToken: accessToken,
    );
  }

  Future<void> deleteEstadio({
    required String accessToken,
    required String estadioId,
  }) async {
    await _delete('/estadios/$estadioId', accessToken: accessToken);
  }

  // ── Presigned upload PUT ──────────────────────────────────────────

  /// Upload file bytes or stream them directly to a presigned URL (PUT).
  Future<int> uploadFileToPresignedUrl({
    required String presignedUrl,
    List<int>? bytes,
    Stream<List<int>>? stream,
    int? contentLength,
    required String contentType,
    Map<String, String>? headers,
  }) async {
    final requestHeaders = <String, String>{...?headers};
    final hasContentType = requestHeaders.keys.any(
      (key) => key.toLowerCase() == 'content-type',
    );
    if (!hasContentType) {
      requestHeaders['Content-Type'] = contentType;
    }
    final uri = Uri.parse(presignedUrl);
    final http.BaseRequest req;
    if (stream != null) {
      final streamReq = http.StreamedRequest('PUT', uri)
        ..headers.addAll(requestHeaders)
        ..contentLength = contentLength;
      // Pipe errors (image deleted/locked mid-upload) must surface as the
      // upload failure, not as an uncaught async error.
      unawaited(
        stream.pipe(streamReq.sink).catchError((Object error) {
          streamReq.sink.addError(error);
          streamReq.sink.close();
        }),
      );
      req = streamReq;
    } else {
      req = http.Request('PUT', uri)
        ..headers.addAll(requestHeaders)
        ..bodyBytes = bytes ?? const [];
    }
    final streamed = await _httpClient.send(req).timeout(uploadTimeout);
    // Drain the response body so the pooled socket is released; an error
    // body (e.g. S3 XML error) propagates as the upload failure.
    try {
      await streamed.stream.drain<void>().timeout(uploadTimeout);
    } on TimeoutException {
      // Response headers already arrived with a status; the body trickled
      // too slowly. Keep the status — the caller treats non-2xx as failure.
    }
    return streamed.statusCode;
  }

  // ── Internal helpers ──────────────────────────────────────────────

  Map<String, String> _buildHeaders(String? accessToken) {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (accessToken != null) {
      headers['Authorization'] = 'Bearer $accessToken';
    }
    return headers;
  }

  Future<T> _sendWithAuthRetry<T>(
    Future<http.Response> Function(Map<String, String> headers) sendRequest,
    T Function(http.Response) handleResponse, {
    String? accessToken,
    bool retry = true,
  }) async {
    final generation = _authGeneration;
    final headers = _buildHeaders(accessToken);
    final response = await sendRequest(headers).timeout(requestTimeout);
    try {
      return handleResponse(response);
    } on ApiException catch (error) {
      if (!retry || accessToken == null || error.statusCode != 401) rethrow;
      if (generation != _authGeneration) rethrow;
      final replacement = await _refreshOnce();
      if (replacement == null || generation != _authGeneration) rethrow;
      return _sendWithAuthRetry(
        sendRequest,
        handleResponse,
        accessToken: replacement,
        retry: false,
      );
    }
  }

  Future<T> _get<T>(
    String path,
    String? accessToken,
    T Function(Map<String, dynamic>) parse, {
    bool retry = true,
  }) {
    final uri = _env.uri(path);
    return _sendWithAuthRetry(
      (headers) => _httpClient.get(uri, headers: headers),
      (response) => _handleResponse(response, parse),
      accessToken: accessToken,
      retry: retry,
    );
  }

  Future<T> _post<T>(
    String path,
    Map<String, dynamic>? body,
    T Function(Map<String, dynamic>) parse, {
    String? accessToken,
    bool retry = true,
  }) {
    final uri = _env.uri(path);
    return _sendWithAuthRetry(
      (headers) => _httpClient.post(
        uri,
        headers: headers,
        body: body != null ? jsonEncode(body) : null,
      ),
      (response) => _handleResponse(response, parse),
      accessToken: accessToken,
      retry: retry,
    );
  }

  Future<String?> _refreshOnce() {
    final existing = _refreshInFlight;
    if (existing != null) return existing;
    final handler = _refreshAccessToken;
    if (handler == null) return Future<String?>.value(null);
    final future = handler();
    _refreshInFlight = future;
    return future.whenComplete(() {
      if (identical(_refreshInFlight, future)) _refreshInFlight = null;
    });
  }

  Future<T> _patch<T>(
    String path,
    Map<String, dynamic> body,
    T Function(Map<String, dynamic>) parse, {
    required String accessToken,
    bool retry = true,
  }) {
    final uri = _env.uri(path);
    return _sendWithAuthRetry(
      (headers) =>
          _httpClient.patch(uri, headers: headers, body: jsonEncode(body)),
      (response) => _handleResponse(response, parse),
      accessToken: accessToken,
      retry: retry,
    );
  }

  Future<List<Map<String, dynamic>>> _getList(
    String path,
    String accessToken,
    String key, {
    bool retry = true,
  }) {
    final uri = _env.uri(path);
    return _sendWithAuthRetry(
      (headers) => _httpClient.get(uri, headers: headers),
      (response) => _handleResponse(response, (json) {
        final list = json[key] as List<dynamic>;
        return list.map((e) => e as Map<String, dynamic>).toList();
      }),
      accessToken: accessToken,
      retry: retry,
    );
  }

  Future<void> _delete(
    String path, {
    required String accessToken,
    bool retry = true,
  }) {
    final uri = _env.uri(path);
    return _sendWithAuthRetry(
      (headers) => _httpClient.delete(uri, headers: headers),
      (response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          return;
        }
        final json = _decodeErrorJson(response);
        throw ApiException(
          response.statusCode,
          _extractErrorMessage(json, response.statusCode),
          code: _extractErrorCode(json),
        );
      },
      accessToken: accessToken,
      retry: retry,
    );
  }

  T _unwrapEntity<T>(
    Map<String, dynamic> json,
    String key,
    T Function(Map<String, dynamic>) parse,
  ) {
    return parse(json[key] as Map<String, dynamic>);
  }

  T _handleResponse<T>(
    http.Response response,
    T Function(Map<String, dynamic>) parse,
  ) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) {
        throw ApiException(response.statusCode, 'Empty response');
      }
      try {
        final json = _decodeJsonObject(response);
        return parse(json);
      } on FormatException {
        throw ApiException(response.statusCode, 'Invalid JSON response');
      }
    }
    String message;
    String? code;
    try {
      final json = _decodeErrorJson(response);
      message = _extractErrorMessage(json, response.statusCode);
      code = _extractErrorCode(json);
    } on ApiException {
      rethrow;
    } catch (_) {
      message = 'HTTP ${response.statusCode}';
    }
    throw ApiException(response.statusCode, message, code: code);
  }

  Map<String, dynamic> _decodeJsonObject(http.Response response) {
    final decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) return decoded;
    throw const FormatException('Expected JSON object');
  }

  Map<String, dynamic> _decodeErrorJson(http.Response response) {
    try {
      return _decodeJsonObject(response);
    } on FormatException {
      throw ApiException(response.statusCode, 'Invalid JSON response');
    }
  }

  /// Machine-readable backend error code, when the response carries one
  /// (e.g. `account_disabled` on suspension 401s). Never matched on prose.
  String? _extractErrorCode(Map<String, dynamic> json) {
    final code = json['code'];
    return code is String && code.isNotEmpty ? code : null;
  }

  String _extractErrorMessage(Map<String, dynamic> json, int statusCode) {
    final parts = <String>[];

    final message = json['message'] ?? json['error'];
    if (message is String && message.trim().isNotEmpty) {
      parts.add(message.trim());
    }

    final errors = json['errors'];
    if (errors is List) {
      final nested = <String>[];
      for (final entry in errors) {
        final text = _errorEntryToMessage(entry);
        if (text.isNotEmpty) nested.add(text);
      }
      if (nested.isNotEmpty) {
        parts.add(nested.join('; '));
      }
    }

    if (parts.isEmpty) {
      return 'HTTP $statusCode';
    }
    return parts.join(' | ');
  }

  String _errorEntryToMessage(dynamic entry) {
    if (entry is String) return entry.trim();
    if (entry is Map) {
      final map = entry.cast<dynamic, dynamic>();
      final field = map['field'] ?? map['path'] ?? map['name'];
      final message = map['message'] ?? map['error'] ?? map['msg'];
      final text = message is String ? message.trim() : '';
      if (field is String && field.trim().isNotEmpty && text.isNotEmpty) {
        return '${field.trim()}: $text';
      }
      if (text.isNotEmpty) return text;
    }
    return '';
  }

  void dispose() {
    _httpClient.close();
  }
}

/// API-level exception.
class ApiException {
  final int statusCode;
  final String message;

  /// Machine-readable backend error code, when the response carries one.
  /// Must match the backend suspension contract (`account_disabled`).
  final String? code;

  static const String accountDisabledCode = 'account_disabled';

  const ApiException(this.statusCode, this.message, {this.code});

  /// Whether this failure reports a suspended account. Matches only on the
  /// machine-readable code — never on human-readable text.
  bool get isAccountDisabled =>
      statusCode == 401 && code == accountDisabledCode;

  @override
  String toString() => 'ApiException($statusCode): $message';
}
