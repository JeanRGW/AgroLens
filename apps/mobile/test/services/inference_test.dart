import 'dart:convert';
import 'dart:typed_data';
import 'package:agrolens/config/env_config.dart';
import 'package:agrolens/models/inference.dart';
import 'package:agrolens/models/upload_response.dart';
import 'package:agrolens/services/api_client.dart';
import 'package:agrolens/services/auth_service.dart';
import 'package:agrolens/services/inference_service.dart';
import 'package:agrolens/services/token_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image_picker/image_picker.dart';
import '../helpers/test_doubles.dart';

class TestAuth extends AuthService {
  TestAuth(ApiClient api)
    : super(
        apiClient: api,
        tokenStorage: TokenStorage(storage: FakeFlutterSecureStorage()),
      );
  @override
  Future<String?> getValidAccessToken() async => 'test-token';
}

Map<String, dynamic> uploadJson() => {
  'id': 'upload-12345678',
  'status': 'ready',
  'fileCount': 2,
  'propertyId': 'property',
  'talhaoId': 'talhao',
  'cropTypeId': 'crop',
  'source': 'phone',
  'activityDate': '2026-10-05T12:00:00Z',
  'createdAt': '2026-10-05T12:00:00Z',
  'updatedAt': '2026-10-05T12:00:00Z',
  'previewFileId': 'cover',
  'files': [],
};

void main() {
  test('validates types, empty files, size and selection count', () async {
    XFile file(String name, int length, {String? type}) => XFile.fromData(
      Uint8List(length),
      path: name,
      name: name,
      mimeType: type,
    );
    await validateInferenceFiles([
      file('photo.JPG', 1),
      file('photo.png', 2),
      file('photo.webp', 3),
    ]);
    expect(
      validateInferenceFiles([file('photo.gif', 1)]),
      throwsFormatException,
    );
    expect(
      validateInferenceFiles([file('photo.jpg', 1, type: 'image/gif')]),
      throwsFormatException,
    );
    expect(
      validateInferenceFiles([file('photo.jpg', 0)]),
      throwsFormatException,
    );
    expect(
      validateInferenceFiles([file('photo.jpg', 25 * 1024 * 1024 + 1)]),
      throwsFormatException,
    );
    expect(
      validateInferenceFiles(List.generate(21, (i) => file('$i.jpg', 1))),
      throwsFormatException,
    );
  });
  test(
    'parses null classes and detection arrays without historical aliases',
    () {
      expect(
        InferenceModel.fromJson({
          'id': 'm',
          'name': 'Pragas',
          'classes': null,
        }).classes,
        isEmpty,
      );
      expect(
        InferenceResult.fromJson({
          'id': 'a',
          'imageUrl': 'url',
          'detections': null,
        }).detections,
        isEmpty,
      );
      expect(
        () => InferenceResult.fromJson({'id': 'a', 'url': 'legacy'}),
        throwsA(isA<TypeError>()),
      );
    },
  );
  test(
    'models accepts the bare array response and handles authentication errors',
    () async {
      final api = ApiClient(
        env: const EnvConfig(apiBaseUrl: 'https://test/api'),
        httpClient: MockClient((request) async {
          expect(request.url.path, '/api/inference/models');
          expect(request.headers['Authorization'], 'Bearer token');
          return http.Response(
            '[{"id":"m","name":"Pragas","classes":[]}]',
            200,
          );
        }),
      );
      expect((await api.inferenceModels('token')).single.name, 'Pragas');
      final unauthorized = ApiClient(
        httpClient: MockClient(
          (_) async => http.Response('{"message":"Denied"}', 403),
        ),
      );
      expect(
        unauthorized.inferenceModels('token'),
        throwsA(isA<ApiException>()),
      );
    },
  );
  test(
    'existing upload creation preserves the selected image without uploading files',
    () async {
      final api = ApiClient(
        httpClient: MockClient((request) async {
          expect(jsonDecode(request.body), {
            'modelId': 'm',
            'uploadId': 'upload-12345678',
            'imageIds': ['image-1'],
          });
          return http.Response('{"id":"job"}', 201);
        }),
      );
      final service = InferenceService(api, TestAuth(api));
      expect(
        await service.submit(
          modelId: 'm',
          upload: UploadDetail.fromJson(uploadJson()),
          imageId: 'image-1',
          stage: (_) {},
        ),
        'job',
      );
    },
  );
  test(
    'temporary submission uses imageIndex, signed headers and completes only after PUT',
    () async {
      final methods = <String>[];
      final stages = <String>[];
      final api = ApiClient(
        httpClient: MockClient((request) async {
          methods.add('${request.method} ${request.url.path}');
          if (request.method == 'PUT') {
            expect(request.headers['x-test'], 'signed');
            expect(request.headers.containsKey('Authorization'), isFalse);
            expect(request.bodyBytes, [1, 2]);
            return http.Response('', 200);
          }
          if (request.url.path.endsWith('/complete')) {
            return http.Response('{"status":"queued"}', 200);
          }
          return http.Response(
            jsonEncode({
              'id': 'job',
              'files': [
                {
                  'imageIndex': 0,
                  'uploadUrl': 'https://storage/image',
                  'headers': {'x-test': 'signed'},
                },
              ],
            }),
            201,
          );
        }),
      );
      final service = InferenceService(api, TestAuth(api));
      expect(
        await service.submit(
          modelId: 'm',
          files: [
            XFile.fromData(
              Uint8List.fromList([1, 2]),
              path: 'a.png',
              name: 'a.png',
            ),
          ],
          stage: stages.add,
        ),
        'job',
      );
      expect(methods.map((m) => m.split(' ').first), ['POST', 'PUT', 'POST']);
      expect(stages, contains('Enviando imagem 1 de 1…'));
    },
  );
  test('failed PUT never completes the job', () async {
    bool completed = false;
    final api = ApiClient(
      httpClient: MockClient((request) async {
        if (request.method == 'PUT') return http.Response('', 500);
        if (request.url.path.endsWith('/complete')) completed = true;
        return http.Response(
          '{"id":"job","files":[{"imageIndex":0,"uploadUrl":"https://storage/image","headers":{}}]}',
          201,
        );
      }),
    );
    final service = InferenceService(api, TestAuth(api));
    await expectLater(
      service.submit(
        modelId: 'm',
        files: [XFile.fromData(Uint8List(1), path: 'a.jpg', name: 'a.jpg')],
        stage: (_) {},
      ),
      throwsStateError,
    );
    expect(completed, isFalse);
  });
  test(
    'cover uses the preview endpoint and current downloadUrl envelope',
    () async {
      final api = ApiClient(
        httpClient: MockClient((request) async {
          expect(request.url.path, endsWith('/files/cover/preview-url'));
          return http.Response(
            '{"downloadUrl":"https://storage/cover","expiresAt":"2026-10-06T00:00:00Z","fileId":"cover","uploadId":"upload-12345678"}',
            200,
          );
        }),
      );
      expect(
        await InferenceService(
          api,
          TestAuth(api),
        ).cover(UploadDetail.fromJson(uploadJson())),
        'https://storage/cover',
      );
    },
  );
}
