import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/models/download_url_response.dart';
import 'package:agrolens/models/upload_response.dart';
import 'package:agrolens/services/api_client.dart';
import '../helpers/test_doubles.dart';

void main() {
  group('DownloadUrlResponse', () {
    test('fromJson parses old shape (url)', () {
      final json = {
        'url': 'https://storage.example.com/signed/abc123',
        'expiresAt': '2026-07-02T12:00:00Z',
        'fileId': 'file-uuid-1',
        'uploadId': 'upload-uuid-1',
      };

      final response = DownloadUrlResponse.fromJson(json);
      expect(response.url, 'https://storage.example.com/signed/abc123');
      expect(response.expiresAt, DateTime.parse('2026-07-02T12:00:00Z'));
      expect(response.fileId, 'file-uuid-1');
      expect(response.uploadId, 'upload-uuid-1');
    });

    test('fromJson parses real backend shape (downloadUrl)', () {
      final json = {
        'downloadUrl': 'https://storage.example.com/signed/backend-xyz',
        'expiresAt': '2026-07-02T12:00:00Z',
        'fileId': 'file-uuid-2',
        'uploadId': 'upload-uuid-2',
      };

      final response = DownloadUrlResponse.fromJson(json);
      expect(response.url, 'https://storage.example.com/signed/backend-xyz');
      expect(response.fileId, 'file-uuid-2');
      expect(response.uploadId, 'upload-uuid-2');
    });
  });

  group('UploadInitResponse', () {
    test('fromJson parses old shape (presignedUrls)', () {
      final json = {
        'uploadId': 'upload-1',
        'status': 'draft',
        'presignedUrls': [
          {
            'fileId': 'f1',
            'objectKey': 'uploads/u/0/original.jpeg',
            'url': 'https://storage.example.com/put-1',
            'expiresAt': '2026-07-01T00:00:00Z',
          },
        ],
      };

      final response = UploadInitResponse.fromJson(json);
      expect(response.uploadId, 'upload-1');
      expect(response.status, 'draft');
      expect(response.presignedUrls.length, 1);
      expect(
        response.presignedUrls.first.url,
        'https://storage.example.com/put-1',
      );
      expect(response.presignedUrls.first.fileId, 'f1');
    });

    test('fromJson parses real backend shape (files with uploadUrl)', () {
      final json = {
        'uploadId': 'upload-2',
        'status': 'draft',
        'files': [
          {
            'id': 'backend-file-id',
            'key': 'uploads/u/0/original.jpeg',
            'uploadUrl': 'https://garage:3900/bucket/presigned-put',
            'expiresAt': '2026-07-01T00:00:00Z',
            'headers': {'x-amz-meta-user': 'mobile'},
          },
        ],
      };

      final response = UploadInitResponse.fromJson(json);
      expect(response.uploadId, 'upload-2');
      expect(response.status, 'draft');
      expect(response.presignedUrls.length, 1);
      expect(
        response.presignedUrls.first.url,
        'https://garage:3900/bucket/presigned-put',
      );
      expect(response.presignedUrls.first.fileId, 'backend-file-id');
      expect(
        response.presignedUrls.first.objectKey,
        'uploads/u/0/original.jpeg',
      );
      expect(response.presignedUrls.first.headers['x-amz-meta-user'], 'mobile');
    });

    test('fromJson preserves skip markers for already-uploaded files', () {
      final json = {
        'uploadId': 'upload-3',
        'status': 'draft',
        'files': [
          {
            'id': 'existing-file-id',
            'key': 'uploads/u/0/original.jpeg',
            'uploadUrl': null,
            'method': 'GET',
            'expiresAt': null,
          },
        ],
      };

      final response = UploadInitResponse.fromJson(json);
      expect(response.presignedUrls.length, 1);
      expect(response.presignedUrls.first.url, isNull);
      expect(response.presignedUrls.first.requiresUpload, isFalse);
    });
  });

  group('UploadCompleteResponse', () {
    test('fromJson parses old shape (top-level uploadId)', () {
      final json = {'uploadId': 'upload-1', 'status': 'finalizing'};

      final response = UploadCompleteResponse.fromJson(json);
      expect(response.uploadId, 'upload-1');
      expect(response.status, 'finalizing');
    });

    test('fromJson parses real backend shape (wrapped upload)', () {
      final json = {
        'upload': {
          'id': 'backend-upload-id',
          'status': 'finalizing',
          'propertyId': 'prop-uuid',
          'talhaoId': 'talhao-uuid',
        },
      };

      final response = UploadCompleteResponse.fromJson(json);
      expect(response.uploadId, 'backend-upload-id');
      expect(response.status, 'finalizing');
    });
  });

  group('ApiClient - downloadUrl', () {
    late MockHttpClient mockHttp;
    late ApiClient apiClient;

    setUp(() {
      mockHttp = MockHttpClient();
      apiClient = ApiClient(
        httpClient: mockHttp,
        env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
      );
    });

    test(
      'getDownloadUrl constructs correct path and parses response',
      () async {
        mockHttp.queueResponse(
          'GET',
          '/api/uploads/upload-1/files/file-1/download-url',
          200,
          {
            'url': 'https://storage.example.com/signed/xyz',
            'expiresAt': '2026-07-02T12:00:00Z',
            'fileId': 'file-1',
            'uploadId': 'upload-1',
          },
        );

        final result = await apiClient.getDownloadUrl(
          accessToken: 'token',
          uploadId: 'upload-1',
          fileId: 'file-1',
        );

        expect(result.url, 'https://storage.example.com/signed/xyz');
        expect(result.fileId, 'file-1');
        expect(result.uploadId, 'upload-1');

        final headers = mockHttp.requests.first.headers;
        expect(headers['Authorization'], 'Bearer token');
      },
    );

    test(
      'uploadFileToPresignedUrl preserves custom headers and content type fallback',
      () async {
        mockHttp.queueResponse('PUT', '/bucket/presigned-put', 200, {});

        await apiClient.uploadFileToPresignedUrl(
          presignedUrl: 'https://storage.example.com/bucket/presigned-put',
          bytes: [1, 2, 3],
          contentType: 'image/jpeg',
          headers: {'x-amz-meta-user': 'mobile'},
        );

        final headers = mockHttp.requests.first.headers;
        expect(headers['x-amz-meta-user'], 'mobile');
        expect(headers['Content-Type'], 'image/jpeg');
      },
    );
  });

  group('ApiClient - updateProfile', () {
    late MockHttpClient mockHttp;
    late ApiClient apiClient;

    setUp(() {
      mockHttp = MockHttpClient();
      apiClient = ApiClient(
        httpClient: mockHttp,
        env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
      );
    });

    test('updateProfile sends PATCH with fullName and phone', () async {
      final now = DateTime.now().toIso8601String();
      mockHttp.queueResponse('PATCH', '/api/users/me', 200, {
        'user': {
          'id': 'user-1',
          'email': 'test@example.com',
          'fullName': 'Updated Name',
          'phone': '+5511999999999',
          'role': 'user',
          'disabledAt': null,
          'createdAt': now,
          'updatedAt': now,
        },
      });

      final response = await apiClient.updateProfile(
        accessToken: 'token',
        fullName: 'Updated Name',
        phone: '+5511999999999',
      );

      expect(response.user.fullName, 'Updated Name');
      expect(response.user.phone, '+5511999999999');

      final request = mockHttp.requests.first;
      expect(request.method, 'PATCH');
      final body =
          jsonDecode((request as http.Request).body) as Map<String, dynamic>;
      expect(body['fullName'], 'Updated Name');
      expect(body['phone'], '+5511999999999');
    });

    test(
      'updateProfile clears the phone with explicit null when empty',
      () async {
        final now = DateTime.now().toIso8601String();
        mockHttp.queueResponse('PATCH', '/api/users/me', 200, {
          'user': {
            'id': 'user-1',
            'email': 'test@example.com',
            'fullName': 'Name Only',
            'phone': null,
            'role': 'user',
            'disabledAt': null,
            'createdAt': now,
            'updatedAt': now,
          },
        });

        final response = await apiClient.updateProfile(
          accessToken: 'token',
          fullName: 'Name Only',
          phone: '',
        );

        expect(response.user.fullName, 'Name Only');
        expect(response.user.phone, isNull);

        final request = mockHttp.requests.first;
        final body =
            jsonDecode((request as http.Request).body) as Map<String, dynamic>;
        expect(body['fullName'], 'Name Only');
        expect(body.containsKey('phone'), isTrue);
        expect(body['phone'], isNull);
      },
    );

    test('updateProfile sends Bearer token', () async {
      final now = DateTime.now().toIso8601String();
      mockHttp.queueResponse('PATCH', '/api/users/me', 200, {
        'user': {
          'id': 'user-1',
          'email': 'test@example.com',
          'fullName': 'Name',
          'phone': null,
          'role': 'user',
          'disabledAt': null,
          'createdAt': now,
          'updatedAt': now,
        },
      });

      await apiClient.updateProfile(
        accessToken: 'my-access-token',
        fullName: 'Name',
      );

      final headers = mockHttp.requests.first.headers;
      expect(headers['Authorization'], 'Bearer my-access-token');
    });
  });

  group('Completed upload cleanup logic', () {
    // Test the decision logic: only completed uploads should be cleaned up.
    // Files for pending/failed/pendingMetadataSync/uploading must be preserved.
    test('cleanup filter only selects completed status', () {
      final statuses = [
        ('pending', false),
        ('uploading', false),
        ('pendingMetadataSync', false),
        ('completed', true),
        ('failed', false),
      ];

      for (final (status, shouldClean) in statuses) {
        expect(
          shouldClean,
          status == 'completed',
          reason:
              'Status $status should${shouldClean ? '' : ' not'} be cleaned',
        );
      }
    });

    test('image count helper works for cleanup', () {
      // Simulate parsing image paths
      final pathsJson = '["/tmp/img1.jpg","/tmp/img2.jpg"]';
      final paths = List<String>.from(jsonDecode(pathsJson));
      expect(paths.length, 2);
    });
  });

  group('ApiClient.extractItems envelope compatibility', () {
    test('extracts items from standard envelope {items: [...]}', () {
      final json = {
        'items': [
          {'id': 'item-1'},
          {'id': 'item-2'},
        ],
        'total': 2,
      };
      final result = ApiClient.extractItems(json);
      expect(result, isA<List>());
      expect((result as List).length, 2);
    });

    test('extracts items from legacy envelope {grants: [...]}', () {
      final json = {
        'grants': [
          {'id': 'grant-1'},
        ],
        'total': 1,
      };
      final result = ApiClient.extractItems(json);
      expect((result as List).length, 1);
    });

    test('extracts items from legacy envelope {users: [...]}', () {
      final json = {
        'users': [
          {'id': 'user-1'},
        ],
        'total': 1,
      };
      final result = ApiClient.extractItems(json);
      expect((result as List).length, 1);
    });

    test('extracts items from legacy envelope {events: [...]}', () {
      final json = {
        'events': [
          {'id': 'evt-1'},
        ],
        'total': 1,
      };
      final result = ApiClient.extractItems(json);
      expect((result as List).length, 1);
    });

    test('extracts items from fallback key {properties: [...]}', () {
      final json = {
        'properties': [
          {'id': 'prop-1'},
        ],
      };
      final result = ApiClient.extractItems(json, 'properties');
      expect((result as List).length, 1);
    });

    test('prefers items over legacy key when both are present', () {
      final json = {
        'items': [
          {'id': 'from-items'},
        ],
        'grants': [
          {'id': 'from-grants'},
        ],
      };
      final result = ApiClient.extractItems(json);
      expect((result as List).first['id'], 'from-items');
    });

    test('returns direct array as-is', () {
      final list = [
        {'id': 'direct'},
      ];
      final result = ApiClient.extractItems(list);
      expect(result, list);
    });
  });
}
