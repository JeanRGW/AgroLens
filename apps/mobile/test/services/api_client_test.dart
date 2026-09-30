import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/services/api_client.dart';
import '../helpers/test_doubles.dart';

/// Helper to extract JSON body from a POST request.
Future<Map<String, dynamic>> extractJsonBody(http.BaseRequest request) async {
  if (request is http.Request) {
    return jsonDecode(request.body) as Map<String, dynamic>;
  }
  if (request is http.StreamedRequest) {
    final bytes = await request.finalize().toBytes();
    return jsonDecode(utf8.decode(bytes.toList())) as Map<String, dynamic>;
  }
  throw ArgumentError('Unknown request type: ${request.runtimeType}');
}

void main() {
  late MockHttpClient mockHttp;
  late ApiClient apiClient;

  const timestamp = '2026-06-30T12:00:00Z';
  final userJson = {
    'id': 'user-1',
    'email': 'test@example.com',
    'fullName': 'Test User',
    'phone': null,
    'role': 'user',
    'disabledAt': null,
    'createdAt': timestamp,
    'updatedAt': timestamp,
  };
  final uploadJson = {
    'id': 'upload-1',
    'status': 'ready',
    'propertyId': 'prop-uuid',
    'talhaoId': 'talhao-uuid',
    'cropTypeId': 'crop-uuid',
    'estadioId': null,
    'source': 'phone',
    'activityDate': timestamp,
    'createdAt': timestamp,
    'updatedAt': timestamp,
  };

  setUp(() {
    mockHttp = MockHttpClient();
    apiClient = ApiClient(
      httpClient: mockHttp,
      env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
    );
  });

  group('ApiClient - auth', () {
    test('times out stalled requests', () async {
      mockHttp.beforeResponse = (_) => Completer<void>().future;
      apiClient = ApiClient(
        httpClient: mockHttp,
        env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
        requestTimeout: Duration.zero,
      );

      await expectLater(
        apiClient.login(email: 'test@example.com', password: 'secret123'),
        throwsA(isA<TimeoutException>()),
      );
    });

    test('login constructs correct request and parses response', () async {
      mockHttp.queueResponse('POST', '/api/auth/login', 200, {
        'user': userJson,
        'accessToken': 'access-123',
        'refreshToken': 'refresh-456',
      });

      final response = await apiClient.login(
        email: 'test@example.com',
        password: 'secret123',
      );

      expect(response.user.email, 'test@example.com');
      expect(response.accessToken, 'access-123');
      expect(response.refreshToken, 'refresh-456');

      final body = await extractJsonBody(mockHttp.requests.first);
      expect(body['email'], 'test@example.com');
      expect(body['password'], 'secret123');
      expect(body['clientType'], 'mobile');
    });

    test('register sends mobile clientType', () async {
      mockHttp.queueResponse('POST', '/api/auth/register', 201, {
        'user': {
          ...userJson,
          'id': 'user-2',
          'email': 'new@example.com',
          'fullName': 'New User',
          'phone': '+5511999999999',
        },
        'accessToken': 'access-abc',
        'refreshToken': 'refresh-def',
      });

      final response = await apiClient.register(
        email: 'new@example.com',
        password: 'password123',
        fullName: 'New User',
        phone: '+5511999999999',
      );

      expect(response.user.fullName, 'New User');
      expect(response.user.phone, '+5511999999999');

      final body = await extractJsonBody(mockHttp.requests.first);
      expect(body['clientType'], 'mobile');
      expect(body['phone'], '+5511999999999');
    });

    test('refresh sends refreshToken in body', () async {
      mockHttp.queueResponse('POST', '/api/auth/refresh', 200, {
        'accessToken': 'access-new',
        'refreshToken': 'refresh-new',
      });

      final response = await apiClient.refresh(refreshToken: 'refresh-old');

      expect(response.accessToken, 'access-new');
      expect(response.refreshToken, 'refresh-new');

      final body = await extractJsonBody(mockHttp.requests.first);
      expect(body['refreshToken'], 'refresh-old');
    });

    test('logout clears session', () async {
      mockHttp.queueRawResponse('POST', '/api/auth/logout', 204, '');

      await apiClient.logout(refreshToken: 'refresh-token');

      final body = await extractJsonBody(mockHttp.requests.first);
      expect(body['refreshToken'], 'refresh-token');
    });

    test('me uses Bearer token', () async {
      mockHttp.queueResponse('GET', '/api/auth/me', 200, {'user': userJson});

      final response = await apiClient.me(accessToken: 'bearer-token');
      expect(response.user.email, 'test@example.com');

      final headers = mockHttp.requests.first.headers;
      expect(headers['Authorization'], 'Bearer bearer-token');
    });
  });

  group('ApiClient - uploads', () {
    test('uploadInit sends correct body and parses presigned URLs', () async {
      mockHttp.queueResponse('POST', '/api/uploads/init', 201, {
        'uploadId': 'upload-1',
        'status': 'draft',
        'files': [
          {
            'imageId': 'image-1',
            'fileId': 'file-1',
            'objectKey': 'uploads/u1/a/original.jpeg',
            'uploadUrl': 'https://storage.example.com/presigned-put-1',
            'expiresAt': '2026-07-01T00:00:00Z',
            'headers': {'x-amz-meta-user': 'mobile'},
          },
          {
            'imageId': 'image-2',
            'fileId': 'existing-file',
            'objectKey': 'uploads/u1/b/original.jpeg',
            'uploadUrl': null,
            'method': 'GET',
            'expiresAt': null,
          },
        ],
      });

      final response = await apiClient.uploadInit(
        accessToken: 'token',
        body: {
          'clientUploadId': 'client-uuid',
          'propertyId': 'prop-uuid',
          'talhaoId': 'talhao-uuid',
          'cropTypeId': 'crop-uuid',
          'source': 'phone',
          'activityDate': '2026-06-30T12:00:00Z',
          'files': [
            {
              'imageId': 'image-1',
              'contentType': 'image/jpeg',
              'latitude': -22.9,
              'longitude': -43.1,
            },
            {'imageId': 'image-2', 'contentType': 'image/jpeg'},
          ],
        },
      );

      expect(response.uploadId, 'upload-1');
      expect(response.status, 'draft');
      expect(response.presignedUrls.length, 2);
      expect(
        response.presignedUrls.first.url,
        'https://storage.example.com/presigned-put-1',
      );
      expect(response.presignedUrls.first.fileId, 'file-1');
      expect(
        response.presignedUrls.first.objectKey,
        'uploads/u1/a/original.jpeg',
      );
      expect(response.presignedUrls.first.headers['x-amz-meta-user'], 'mobile');
      expect(response.presignedUrls.last.url, isNull);
      expect(response.presignedUrls.last.requiresUpload, isFalse);

      final headers = mockHttp.requests.first.headers;
      expect(headers['Authorization'], 'Bearer token');
    });

    test('uploadComplete sends POST with upload ID', () async {
      mockHttp.queueResponse('POST', '/api/uploads/upload-1/complete', 200, {
        'upload': {'id': 'upload-1', 'status': 'finalizing'},
      });

      final response = await apiClient.uploadComplete(
        accessToken: 't',
        uploadId: 'upload-1',
      );
      expect(response.uploadId, 'upload-1');
      expect(response.status, 'finalizing');
    });

    test('getUploadDetail parses nested files', () async {
      mockHttp.queueResponse('GET', '/api/uploads/upload-1', 200, {
        ...uploadJson,
        'estadioId': 'estadio-uuid',
        'source': 'drone',
        'files': [
          {
            'id': 'file-1',
            'imageId': 'image-1',
            'latitude': -22.9,
            'longitude': -43.1,
            'variant': 'original',
            'objectKey': 'uploads/u1/0/original.jpeg',
            'contentType': 'image/jpeg',
            'sizeBytes': 1024000,
          },
          {
            'id': 'preview-1',
            'imageId': 'image-1',
            'latitude': -22.9,
            'longitude': -43.1,
            'variant': 'preview',
            'objectKey': 'uploads/u1/0/preview.jpg',
            'contentType': 'image/jpeg',
            'sizeBytes': 256000,
          },
        ],
      });

      final detail = await apiClient.getUploadDetail(
        accessToken: 't',
        uploadId: 'upload-1',
      );
      expect(detail.status, 'ready');
      expect(detail.estadioId, 'estadio-uuid');
      expect(detail.source, 'drone');
      expect(detail.fileCount, 1);
      expect(detail.files.length, 2);
      expect(detail.files.first.contentType, 'image/jpeg');
      expect(detail.files.first.latitude, -22.9);
      expect(detail.files.first.longitude, -43.1);
      expect(detail.files.first.variant, 'original');
      expect(detail.files.first.sizeBytes, 1024000);
      expect(detail.files.last.variant, 'preview');
    });

    for (final endpoint in ['preview-url', 'download-url']) {
      test('$endpoint uses the file route and parses the signed URL', () async {
        mockHttp.queueResponse(
          'GET',
          '/api/uploads/upload-1/files/file-1/$endpoint',
          200,
          {
            'downloadUrl': 'https://storage.example.com/signed/file-1',
            'expiresAt': '2026-07-02T12:00:00Z',
            'fileId': 'file-1',
            'uploadId': 'upload-1',
          },
        );
        final fetch = endpoint == 'preview-url'
            ? apiClient.getPreviewUrl
            : apiClient.getDownloadUrl;
        final result = await fetch(
          accessToken: 'token',
          uploadId: 'upload-1',
          fileId: 'file-1',
        );
        expect(result.url, 'https://storage.example.com/signed/file-1');
        expect(result.fileId, 'file-1');
        expect(result.uploadId, 'upload-1');
        expect(
          mockHttp.requests.single.headers['Authorization'],
          'Bearer token',
        );
      });
    }

    test(
      'listUploads parses summaries and sends pagination and filters',
      () async {
        mockHttp.queueResponse('GET', '/api/uploads', 200, {
          'uploads': [
            {
              ...uploadJson,
              'fileCount': 3,
              'previewFileId': 'preview-1',
              'previewCount': 3,
              'files': null,
            },
            {...uploadJson, 'id': 'upload-2', 'source': 'drone', 'files': []},
          ],
        });
        final queryParams = {'limit': '10', 'offset': '10', 'source': 'phone'};
        final result = await apiClient.listUploads(
          accessToken: 'token',
          queryParams: queryParams,
        );

        expect(result.map((upload) => upload.id), ['upload-1', 'upload-2']);
        expect(result.first.fileCount, 3);
        expect(result.first.previewFileId, 'preview-1');
        expect(result.first.previewCount, 3);
        expect(result.first.status, 'ready');
        expect(result.first.source, 'phone');
        expect(result.first.propertyId, 'prop-uuid');
        expect(result.first.talhaoId, 'talhao-uuid');
        expect(result.first.cropTypeId, 'crop-uuid');
        expect(result.first.estadioId, isNull);
        expect(result.first.createdAt, DateTime.parse(timestamp));
        expect(result.first.files, isEmpty);
        expect(result.last.files, isEmpty);
        expect(result.last.source, 'drone');
        expect(mockHttp.requests.single.url.queryParameters, queryParams);
        expect(
          mockHttp.requests.single.headers['Authorization'],
          'Bearer token',
        );
      },
    );

    test(
      'listUploads falls back to one preview when count is absent',
      () async {
        mockHttp.queueResponse('GET', '/api/uploads', 200, {
          'uploads': [
            {...uploadJson, 'previewFileId': 'preview-1'},
          ],
        });
        final result = await apiClient.listUploads(accessToken: 'token');
        expect(result.single.previewCount, 1);
      },
    );

    test('listUploads returns an empty list when no uploads exist', () async {
      mockHttp.queueResponse('GET', '/api/uploads', 200, {'uploads': []});
      expect(await apiClient.listUploads(accessToken: 'token'), isEmpty);
    });

    test('deleteUpload sends DELETE with bearer token', () async {
      mockHttp.queueRawResponse('DELETE', '/api/uploads/upload-1', 204, '');

      await apiClient.deleteUpload(accessToken: 'token', uploadId: 'upload-1');

      final request = mockHttp.requests.first;
      expect(request.method, 'DELETE');
      expect(request.url.path, '/api/uploads/upload-1');
      expect(request.headers['Authorization'], 'Bearer token');
    });
  });

  group('ApiClient - catalog CRUD', () {
    test('property CRUD uses expected routes and response wrappers', () async {
      final now = DateTime.now().toUtc().toIso8601String();
      mockHttp.queueResponse('POST', '/api/properties', 201, {
        'property': {
          'id': 'prop-1',
          'name': 'Fazenda Santa Maria',
          'userId': 'user-1',
          'owner': 'João Silva',
          'address': 'Rodovia SP-340',
          'latitude': -22.9,
          'longitude': -43.1,
          'createdAt': now,
          'updatedAt': now,
        },
      });
      mockHttp.queueResponse('PATCH', '/api/properties/prop-1', 200, {
        'property': {
          'id': 'prop-1',
          'name': 'Fazenda Atualizada',
          'userId': 'user-1',
          'owner': 'João Silva',
          'address': 'Rodovia SP-340',
          'latitude': -22.91,
          'longitude': -43.11,
          'createdAt': now,
          'updatedAt': now,
        },
      });
      mockHttp.queueRawResponse('DELETE', '/api/properties/prop-1', 204, '');

      final created = await apiClient.createProperty(
        accessToken: 'token',
        name: 'Fazenda Santa Maria',
        owner: 'João Silva',
        address: 'Rodovia SP-340',
        latitude: -22.9,
        longitude: -43.1,
      );
      expect(created.id, 'prop-1');
      expect(created.name, 'Fazenda Santa Maria');
      expect(created.owner, 'João Silva');
      expect(created.address, 'Rodovia SP-340');
      expect(created.latitude, -22.9);
      expect(created.longitude, -43.1);

      final updated = await apiClient.updateProperty(
        accessToken: 'token',
        propertyId: 'prop-1',
        name: 'Fazenda Atualizada',
        latitude: -22.91,
        longitude: -43.11,
      );
      expect(updated.name, 'Fazenda Atualizada');

      await apiClient.deleteProperty(
        accessToken: 'token',
        propertyId: 'prop-1',
      );

      expect(mockHttp.requests[0].method, 'POST');
      expect(mockHttp.requests[0].url.path, '/api/properties');
      expect(mockHttp.requests[1].method, 'PATCH');
      expect(mockHttp.requests[1].url.path, '/api/properties/prop-1');
      expect(mockHttp.requests[2].method, 'DELETE');
      expect(mockHttp.requests[2].url.path, '/api/properties/prop-1');

      final createBody = await extractJsonBody(mockHttp.requests[0]);
      expect(createBody['name'], 'Fazenda Santa Maria');
      expect(createBody['owner'], 'João Silva');
    });

    test('talhao CRUD uses expected routes and response wrappers', () async {
      final now = DateTime.now().toUtc().toIso8601String();
      mockHttp.queueResponse('POST', '/api/talhoes', 201, {
        'talhao': {
          'id': 'talhao-1',
          'name': 'Talhão Norte',
          'userId': 'user-1',
          'propertyId': 'prop-1',
          'createdAt': now,
          'updatedAt': now,
        },
      });
      mockHttp.queueResponse('PATCH', '/api/talhoes/talhao-1', 200, {
        'talhao': {
          'id': 'talhao-1',
          'name': 'Talhão Norte 2',
          'userId': 'user-1',
          'propertyId': 'prop-1',
          'createdAt': now,
          'updatedAt': now,
        },
      });
      mockHttp.queueRawResponse('DELETE', '/api/talhoes/talhao-1', 204, '');

      final created = await apiClient.createTalhao(
        accessToken: 'token',
        name: 'Talhão Norte',
        propertyId: 'prop-1',
      );
      expect(created.propertyId, 'prop-1');

      final updated = await apiClient.updateTalhao(
        accessToken: 'token',
        talhaoId: 'talhao-1',
        name: 'Talhão Norte 2',
      );
      expect(updated.name, 'Talhão Norte 2');

      await apiClient.deleteTalhao(accessToken: 'token', talhaoId: 'talhao-1');

      expect(mockHttp.requests[0].url.path, '/api/talhoes');
      expect(mockHttp.requests[1].url.path, '/api/talhoes/talhao-1');
      expect(mockHttp.requests[2].url.path, '/api/talhoes/talhao-1');
    });

    test('crop type CRUD uses expected routes and response wrappers', () async {
      final now = DateTime.now().toUtc().toIso8601String();
      mockHttp.queueResponse('POST', '/api/crop-types', 201, {
        'cropType': {
          'id': 'crop-1',
          'name': 'Soja',
          'userId': 'user-1',
          'createdAt': now,
          'updatedAt': now,
        },
      });
      mockHttp.queueResponse('PATCH', '/api/crop-types/crop-1', 200, {
        'cropType': {
          'id': 'crop-1',
          'name': 'Soja Premium',
          'userId': 'user-1',
          'createdAt': now,
          'updatedAt': now,
        },
      });
      mockHttp.queueRawResponse('DELETE', '/api/crop-types/crop-1', 204, '');

      final created = await apiClient.createCropType(
        accessToken: 'token',
        name: 'Soja',
      );
      expect(created.name, 'Soja');

      final updated = await apiClient.updateCropType(
        accessToken: 'token',
        cropTypeId: 'crop-1',
        name: 'Soja Premium',
      );
      expect(updated.name, 'Soja Premium');

      await apiClient.deleteCropType(
        accessToken: 'token',
        cropTypeId: 'crop-1',
      );

      expect(mockHttp.requests[0].url.path, '/api/crop-types');
      expect(mockHttp.requests[1].url.path, '/api/crop-types/crop-1');
      expect(mockHttp.requests[2].url.path, '/api/crop-types/crop-1');
    });

    test('estadio CRUD uses expected routes and response wrappers', () async {
      final now = DateTime.now().toUtc().toIso8601String();
      mockHttp.queueResponse('POST', '/api/estadios', 201, {
        'estadio': {
          'id': 'estadio-1',
          'name': 'Vegetativo',
          'userId': 'user-1',
          'cropTypeId': 'crop-1',
          'createdAt': now,
          'updatedAt': now,
        },
      });
      mockHttp.queueResponse('PATCH', '/api/estadios/estadio-1', 200, {
        'estadio': {
          'id': 'estadio-1',
          'name': 'Vegetativo Inicial',
          'userId': 'user-1',
          'cropTypeId': 'crop-1',
          'createdAt': now,
          'updatedAt': now,
        },
      });
      mockHttp.queueRawResponse('DELETE', '/api/estadios/estadio-1', 204, '');

      final created = await apiClient.createEstadio(
        accessToken: 'token',
        name: 'Vegetativo',
        cropTypeId: 'crop-1',
      );
      expect(created.cropTypeId, 'crop-1');

      final updated = await apiClient.updateEstadio(
        accessToken: 'token',
        estadioId: 'estadio-1',
        name: 'Vegetativo Inicial',
      );
      expect(updated.name, 'Vegetativo Inicial');

      await apiClient.deleteEstadio(
        accessToken: 'token',
        estadioId: 'estadio-1',
      );

      expect(mockHttp.requests[0].url.path, '/api/estadios');
      expect(mockHttp.requests[1].url.path, '/api/estadios/estadio-1');
      expect(mockHttp.requests[2].url.path, '/api/estadios/estadio-1');
    });
  });

  group('ApiClient - profile', () {
    test(
      'updateProfile sends PATCH with fullName, phone, and bearer token',
      () async {
        mockHttp.queueResponse('PATCH', '/api/users/me', 200, {
          'user': {
            ...userJson,
            'fullName': 'Updated Name',
            'phone': '+5511999999999',
          },
        });
        final response = await apiClient.updateProfile(
          accessToken: 'token',
          fullName: 'Updated Name',
          phone: '+5511999999999',
        );
        expect(response.user.fullName, 'Updated Name');
        expect(response.user.phone, '+5511999999999');
        final request = mockHttp.requests.single;
        expect(request.method, 'PATCH');
        expect(request.headers['Authorization'], 'Bearer token');
        expect(await extractJsonBody(request), {
          'fullName': 'Updated Name',
          'phone': '+5511999999999',
        });
      },
    );

    for (final phone in ['', '  ']) {
      test(
        'updateProfile clears a blank phone (${phone.length} characters)',
        () async {
          mockHttp.queueResponse('PATCH', '/api/users/me', 200, {
            'user': userJson,
          });
          final response = await apiClient.updateProfile(
            accessToken: 'token',
            fullName: 'Test User',
            phone: phone,
          );
          expect(response.user.phone, isNull);
          expect(await extractJsonBody(mockHttp.requests.single), {
            'fullName': 'Test User',
            'phone': null,
          });
        },
      );
    }
  });

  group('ApiClient - error handling', () {
    test('carries the disabled code and flag on suspension 401s', () async {
      mockHttp.queueResponse('POST', '/api/auth/login', 401, {
        'message': 'Account is disabled',
        'code': 'account_disabled',
        'error': 'Unauthorized',
        'statusCode': 401,
      });

      expect(
        () => apiClient.login(email: 'a@b.com', password: 'right'),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 401)
              .having((e) => e.code, 'code', 'account_disabled')
              .having((e) => e.isAccountDisabled, 'isAccountDisabled', isTrue),
        ),
      );
    });

    test('leaves the code null and the flag false without a code', () async {
      mockHttp.queueResponse('POST', '/api/auth/login', 401, {
        'message': 'Invalid credentials',
      });

      expect(
        () => apiClient.login(email: 'a@b.com', password: 'wrong'),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 401)
              .having((e) => e.code, 'code', isNull)
              .having((e) => e.isAccountDisabled, 'isAccountDisabled', isFalse),
        ),
      );
    });

    test('throws ApiException on 409', () async {
      mockHttp.queueResponse('POST', '/api/uploads/init', 409, {
        'message': 'Metadata changed for existing clientUploadId',
      });

      expect(
        () => apiClient.uploadInit(
          accessToken: 't',
          body: {'clientUploadId': 'dup'},
        ),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            contains('Metadata changed'),
          ),
        ),
      );
    });

    test('parses validation errors array from backend', () async {
      mockHttp.queueResponse('POST', '/api/auth/login', 422, {
        'message': 'Validation failed',
        'errors': [
          {'field': 'email', 'message': 'is invalid'},
          {'field': 'password', 'message': 'is too short'},
        ],
      });

      expect(
        () => apiClient.login(email: 'bad', password: 'short'),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            allOf(
              contains('Validation failed'),
              contains('email'),
              contains('password'),
            ),
          ),
        ),
      );
    });

    test('throws a safe ApiException for non-JSON 2xx responses', () {
      mockHttp.queueRawResponse('POST', '/api/auth/login', 200, 'ok');

      expect(
        () => apiClient.login(email: 'a@b.com', password: 'secret123'),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            'Invalid JSON response',
          ),
        ),
      );
    });
  });
}
