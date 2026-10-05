import 'package:image_picker/image_picker.dart';
import 'image_naming.dart';

// Keep release overrides aligned with the backend upload limits.
const maxUploadFiles = int.fromEnvironment(
  'UPLOAD_MAX_FILES',
  defaultValue: 100,
);
const maxUploadFileSizeBytes = int.fromEnvironment(
  'UPLOAD_MAX_FILE_SIZE_BYTES',
  defaultValue: 100 * 1024 * 1024,
);

Future<String?> validateUploadFiles(List<XFile> files) async {
  if (files.isEmpty) return 'Selecione pelo menos uma imagem.';
  if (files.length > maxUploadFiles) {
    return 'Selecione no máximo $maxUploadFiles imagens por lote.';
  }
  for (final file in files) {
    final size = await file.length();
    if (size == 0 || size > maxUploadFileSizeBytes) {
      return 'Cada imagem deve ter entre 1 e $maxUploadFileSizeBytes bytes.';
    }
    try {
      await imageExtension(file);
    } on FormatException catch (error) {
      return error.message;
    }
  }
  return null;
}
