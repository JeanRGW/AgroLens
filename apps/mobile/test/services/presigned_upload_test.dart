import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/services/api_client.dart';

/// Mock client whose [send] returns a pre-built [http.StreamedResponse],
/// allowing tests to control status, body, and stream errors.
class _StreamedMockClient extends http.BaseClient {
  final http.StreamedResponse Function(http.BaseRequest request) handler;
  final List<http.BaseRequest> requests = [];

  _StreamedMockClient(this.handler);

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    requests.add(request);
    return handler(request);
  }
}

Stream<List<int>> _bodyStream(String content) async* {
  yield content.codeUnits;
}

Stream<List<int>> _errorBodyStream(Object error) async* {
  yield* Stream<List<int>>.error(error);
}

void main() {
  group('uploadFileToPresignedUrl streaming PUT', () {
    test('returns status code and drains response body for a 200', () async {
      final client = _StreamedMockClient(
        (request) => http.StreamedResponse(
          _bodyStream('ok'),
          200,
          headers: {'content-type': 'text/plain'},
        ),
      );
      final apiClient = ApiClient(
        httpClient: client,
        env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
      );

      final statusCode = await apiClient.uploadFileToPresignedUrl(
        presignedUrl: 'https://storage.example.com/put-1',
        bytes: [1, 2, 3],
        contentType: 'image/jpeg',
      );

      expect(statusCode, 200);
      expect(client.requests.single.method, 'PUT');
      expect(client.requests.single.url.host, 'storage.example.com');
    });

    test('returns non-2xx status without throwing on error response', () async {
      final client = _StreamedMockClient(
        (request) => http.StreamedResponse(
          _bodyStream('<Error><Code>AccessDenied</Code></Error>'),
          403,
          headers: {'content-type': 'application/xml'},
        ),
      );
      final apiClient = ApiClient(
        httpClient: client,
        env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
      );

      final statusCode = await apiClient.uploadFileToPresignedUrl(
        presignedUrl: 'https://storage.example.com/put-2',
        bytes: [1, 2, 3],
        contentType: 'image/jpeg',
      );

      expect(statusCode, 403);
    });

    test('propagates mid-stream response errors as upload failures', () async {
      final client = _StreamedMockClient(
        (request) => http.StreamedResponse(
          _errorBodyStream(const SocketException('connection reset')),
          200,
        ),
      );
      final apiClient = ApiClient(
        httpClient: client,
        env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
      );

      await expectLater(
        apiClient.uploadFileToPresignedUrl(
          presignedUrl: 'https://storage.example.com/put-3',
          bytes: [1, 2, 3],
          contentType: 'image/jpeg',
        ),
        throwsA(isA<SocketException>()),
      );
    });

    test('propagates source file read errors from the streamed pipe', () async {
      // Missing file: openRead() errors immediately when the stream is read.
      final missingFile = File(
        '${Directory.systemTemp.path}/agrolens_missing_${DateTime.now().microsecondsSinceEpoch}.jpg',
      );
      final client = _StreamedMockClient(
        (request) => http.StreamedResponse(Stream.value('ok'.codeUnits), 200),
      );
      final apiClient = ApiClient(
        httpClient: client,
        env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
      );

      await expectLater(
        apiClient.uploadFileToPresignedUrl(
          presignedUrl: 'https://storage.example.com/put-4',
          file: missingFile,
          contentType: 'image/jpeg',
        ),
        throwsA(anyOf(isA<FileSystemException>(), isA<StateError>())),
      );
    });

    test('respects uploadTimeout for stalled response bodies', () async {
      final client = _StreamedMockClient(
        (request) => http.StreamedResponse(
          // Headers arrive immediately, body never completes.
          Stream<List<int>>.fromFuture(Completer<List<int>>().future),
          200,
        ),
      );
      final apiClient = ApiClient(
        httpClient: client,
        env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
        uploadTimeout: const Duration(milliseconds: 50),
      );

      final statusCode = await apiClient.uploadFileToPresignedUrl(
        presignedUrl: 'https://storage.example.com/put-5',
        bytes: [1, 2, 3],
        contentType: 'image/jpeg',
      );

      // Stalled body degrades gracefully: status is kept, no hang.
      expect(statusCode, 200);
    });

    test('does not override caller-provided Content-Type', () async {
      final client = _StreamedMockClient(
        (request) => http.StreamedResponse(_bodyStream('ok'), 200),
      );
      final apiClient = ApiClient(
        httpClient: client,
        env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
      );

      await apiClient.uploadFileToPresignedUrl(
        presignedUrl: 'https://storage.example.com/put-6',
        bytes: [1, 2, 3],
        contentType: 'image/jpeg',
        headers: {'Content-Type': 'application/octet-stream'},
      );

      final request = client.requests.single;
      expect(request.headers['content-type'], 'application/octet-stream');
    });
  });
}
