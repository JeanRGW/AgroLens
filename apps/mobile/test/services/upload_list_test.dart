import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/services/api_client.dart';
import '../helpers/test_doubles.dart';

void main() {
  late MockHttpClient mockHttp;
  late ApiClient apiClient;

  setUp(() {
    mockHttp = MockHttpClient();
    apiClient = ApiClient(
      httpClient: mockHttp,
      env: const EnvConfig(apiBaseUrl: 'https://test.api/api'),
    );
  });

  group('ApiClient - listUploads', () {
    final sampleUploadJson = {
      'id': 'upload-ready-1',
      'status': 'ready',
      'propertyId': 'prop-uuid-1',
      'talhaoId': 'talhao-uuid-1',
      'cropTypeId': 'crop-uuid-1',
      'estadioId': null,
      'source': 'phone',
      'activityDate': '2026-06-30T12:00:00Z',
      'createdAt': '2026-06-30T10:00:00Z',
      'updatedAt': '2026-06-30T12:05:00Z',
      'fileCount': 3,
      'previewFileId': 'preview-1',
      'previewCount': 3,
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
      ],
    };

    test('returns list of UploadDetail from GET /uploads', () async {
      mockHttp.queueResponse('GET', '/api/uploads', 200, {
        'uploads': [
          {...sampleUploadJson, 'files': null},
        ],
      });

      final result = await apiClient.listUploads(accessToken: 'token');
      expect(result.length, 1);
      expect(result.first.id, 'upload-ready-1');
      expect(result.first.fileCount, 3);
      expect(result.first.previewFileId, 'preview-1');
      expect(result.first.previewCount, 3);
      expect(result.first.status, 'ready');

      expect(result.first.source, 'phone');
      expect(result.first.files, isEmpty);
      expect(result.first.propertyId, 'prop-uuid-1');
      expect(result.first.talhaoId, 'talhao-uuid-1');
      expect(result.first.cropTypeId, 'crop-uuid-1');
      expect(result.first.createdAt, DateTime.parse('2026-06-30T10:00:00Z'));
    });

    test('falls back to one preview when count is absent', () async {
      final json = Map<String, dynamic>.from(sampleUploadJson)
        ..remove('previewCount');
      mockHttp.queueResponse('GET', '/api/uploads', 200, {
        'uploads': [json],
      });

      final result = await apiClient.listUploads(accessToken: 'token');

      expect(result.single.previewCount, 1);
    });

    test('parses original count and first preview metadata', () async {
      mockHttp.queueResponse('GET', '/api/uploads', 200, {
        'uploads': [
          {...sampleUploadJson, 'fileCount': 1, 'previewFileId': 'preview-1'},
        ],
      });

      final result = await apiClient.listUploads(accessToken: 'token');

      expect(result.single.fileCount, 1);
      expect(result.single.previewFileId, 'preview-1');
    });

    test('passes query parameters when provided', () async {
      mockHttp.queueResponse('GET', '/api/uploads', 200, {
        'uploads': [sampleUploadJson],
      });

      final queryParams = <String, String>{
        'limit': '10',
        'offset': '10',
        'source': 'phone',
      };

      await apiClient.listUploads(
        accessToken: 'token',
        queryParams: queryParams,
      );

      final request = mockHttp.requests.first;
      expect(request.url.queryParameters['limit'], '10');
      expect(request.url.queryParameters['offset'], '10');
      expect(request.url.queryParameters['source'], 'phone');
    });

    test('sends Bearer token', () async {
      mockHttp.queueResponse('GET', '/api/uploads', 200, {
        'uploads': [sampleUploadJson],
      });

      await apiClient.listUploads(accessToken: 'my-access-token');

      final headers = mockHttp.requests.first.headers;
      expect(headers['Authorization'], 'Bearer my-access-token');
    });

    test('returns empty list when no uploads', () async {
      mockHttp.queueResponse('GET', '/api/uploads', 200, {'uploads': []});

      final result = await apiClient.listUploads(accessToken: 'token');
      expect(result, isEmpty);
    });

    test('returns multiple uploads with varied statuses', () async {
      mockHttp.queueResponse('GET', '/api/uploads', 200, {
        'uploads': [
          sampleUploadJson,
          {
            ...sampleUploadJson,
            'id': 'upload-ready-2',
            'status': 'ready',
            'source': 'drone',
            'latitude': -10.0,
            'longitude': -20.0,
          },
        ],
      });

      final result = await apiClient.listUploads(accessToken: 'token');
      expect(result.length, 2);
      expect(result[0].id, 'upload-ready-1');
      expect(result[1].id, 'upload-ready-2');
      expect(result[1].source, 'drone');
    });
  });

  group('ApiClient - getUploadDetail (list/detail)', () {
    test('returns upload with estadio', () async {
      mockHttp.queueResponse('GET', '/api/uploads/detail-1', 200, {
        'id': 'detail-1',
        'status': 'ready',
        'propertyId': 'prop-uuid',
        'talhaoId': 'talhao-uuid',
        'cropTypeId': 'crop-uuid',
        'estadioId': 'estadio-uuid',
        'source': 'drone',
        'latitude': -15.5,
        'longitude': -47.5,
        'activityDate': '2026-06-30T12:00:00Z',
        'createdAt': '2026-06-30T10:00:00Z',
        'updatedAt': '2026-07-01T08:00:00Z',
        'files': [
          {
            'id': 'f1',
            'imageId': 'image-1',
            'latitude': -15.5,
            'longitude': -47.5,
            'variant': 'original',
            'objectKey': 'uploads/u/d/0/original.jpeg',
            'contentType': 'image/jpeg',
            'sizeBytes': 2048000,
          },
          {
            'id': 'f2',
            'imageId': 'image-1',
            'latitude': -15.5,
            'longitude': -47.5,
            'variant': 'preview',
            'objectKey': 'uploads/u/d/0/preview.jpg',
            'contentType': 'image/jpeg',
            'sizeBytes': 256000,
          },
        ],
      });

      final detail = await apiClient.getUploadDetail(
        accessToken: 't',
        uploadId: 'detail-1',
      );

      expect(detail.estadioId, 'estadio-uuid');
      expect(detail.source, 'drone');
      expect(detail.fileCount, 1);
      expect(detail.files.length, 2);
      expect(detail.files[0].variant, 'original');

      expect(detail.files[1].variant, 'preview');
      expect(detail.files[0].sizeBytes, 2048000);
    });
  });
}
