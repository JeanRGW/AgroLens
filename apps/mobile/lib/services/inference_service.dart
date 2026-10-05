import 'package:image_picker/image_picker.dart';
import '../models/inference.dart';
import '../models/upload_response.dart';
import 'api_client.dart';
import 'auth_service.dart';

String inferenceFileType(XFile file) {
  final extension = file.name.toLowerCase().split('.').last;
  final type = file.mimeType;
  if (type != null && type.isNotEmpty && type != 'application/octet-stream') {
    if (['image/jpeg', 'image/png', 'image/webp'].contains(type)) return type;
    throw const FormatException('Selecione imagens JPEG, PNG ou WebP.');
  }
  return switch (extension) {
    'jpg' || 'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'webp' => 'image/webp',
    _ => throw const FormatException('Selecione imagens JPEG, PNG ou WebP.'),
  };
}

Future<void> validateInferenceFiles(List<XFile> files) async {
  if (files.isEmpty || files.length > 20) {
    throw const FormatException('Selecione de 1 a 20 imagens.');
  }
  for (final file in files) {
    inferenceFileType(file);
    final size = await file.length();
    if (size <= 0 || size > 25 * 1024 * 1024) {
      throw FormatException(
        '${file.name}: o arquivo deve ter conteúdo e até 25 MB.',
      );
    }
  }
}

class InferenceService {
  final ApiClient api;
  final AuthService auth;
  InferenceService(this.api, this.auth);
  Future<String> _token() async =>
      await auth.getValidAccessToken() ??
      (throw StateError('Entre novamente para continuar.'));
  Future<List<InferenceModel>> models() async =>
      api.inferenceModels(await _token());
  Future<Map<String, String>> propertyNames() async => {
    for (final property in await api.getProperties(accessToken: await _token()))
      property['id'] as String: property['name'] as String,
  };
  Future<Json> history(int offset) async =>
      api.inferenceJobs(await _token(), offset);
  Future<InferenceJob> job(String id) async =>
      api.inferenceJob(await _token(), id);
  Future<InferenceResult> image(String job, String image) async =>
      api.inferenceImage(await _token(), job, image);
  Future<void> delete(String id) async =>
      api.deleteInference(await _token(), id);
  Future<List<UploadDetail>> uploads(int offset) async => api.listUploads(
    accessToken: await _token(),
    queryParams: {'limit': '20', 'offset': '$offset', 'status': 'ready'},
  );
  Future<String?> cover(UploadDetail upload) async {
    final detail = upload.previewFileId == null
        ? await api.getUploadDetail(
            accessToken: await _token(),
            uploadId: upload.id,
          )
        : upload;
    final fileId =
        detail.previewFileId ??
        detail.files.where((f) => f.variant == 'preview').firstOrNull?.id;
    if (fileId != null) {
      return (await api.getPreviewUrl(
        accessToken: await _token(),
        uploadId: upload.id,
        fileId: fileId,
      )).url;
    }
    final original = detail.files
        .where((f) => f.variant == 'original')
        .firstOrNull;
    if (original == null) return null;
    return (await api.getDownloadUrl(
      accessToken: await _token(),
      uploadId: upload.id,
      fileId: original.id,
    )).url;
  }

  Future<String> submit({
    required String modelId,
    UploadDetail? upload,
    String? imageId,
    List<XFile> files = const [],
    required void Function(String) stage,
  }) async {
    final generation = auth.sessionGeneration;
    void checkSession() {
      if (generation != auth.sessionGeneration) {
        throw StateError('A sessão mudou. Entre novamente.');
      }
    }

    if (upload != null) {
      stage('Iniciando inferência…');
      final response = await api.createInference(await _token(), {
        'modelId': modelId,
        'uploadId': upload.id,
        if (imageId != null) 'imageIds': [imageId],
      });
      checkSession();
      return response['id'] as String;
    }
    await validateInferenceFiles(files);
    final descriptors = <Json>[];
    for (final file in files) {
      descriptors.add({
        'fileName': file.name,
        'contentType': inferenceFileType(file),
        'sizeBytes': await file.length(),
      });
    }
    checkSession();
    stage('Preparando execução…');
    final response = await api.createInference(await _token(), {
      'modelId': modelId,
      'files': descriptors,
    });
    checkSession();
    final instructions = response['files'] as List;
    if (instructions.length != files.length) {
      throw StateError('Resposta de envio incompleta. Tente novamente.');
    }
    final seen = <int>{};
    for (final raw in instructions) {
      final instruction = raw as Json;
      final index = instruction['imageIndex'] as int;
      if (index < 0 || index >= files.length || !seen.add(index)) {
        throw StateError('Resposta de envio inválida.');
      }
      stage('Enviando imagem ${seen.length} de ${files.length}…');
      final status = await api.uploadFileToPresignedUrl(
        presignedUrl: instruction['uploadUrl'] as String,
        stream: files[index].openRead().map<List<int>>((chunk) => chunk),
        contentLength: await files[index].length(),
        contentType: inferenceFileType(files[index]),
        headers: (instruction['headers'] as Map).map(
          (k, v) => MapEntry(k as String, v as String),
        ),
      );
      checkSession();
      if (status < 200 || status >= 300) {
        throw StateError(
          'Falha ao enviar ${files[index].name}. Tente novamente.',
        );
      }
    }
    stage('Iniciando inferência…');
    await api.completeInference(await _token(), response['id'] as String);
    checkSession();
    return response['id'] as String;
  }
}
