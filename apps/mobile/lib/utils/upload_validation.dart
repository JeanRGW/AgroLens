import 'dart:io';

// Keep release overrides aligned with the backend upload limits.
const maxUploadFiles = int.fromEnvironment(
  'UPLOAD_MAX_FILES',
  defaultValue: 100,
);
const maxUploadFileSizeBytes = int.fromEnvironment(
  'UPLOAD_MAX_FILE_SIZE_BYTES',
  defaultValue: 100 * 1024 * 1024,
);

Future<String?> validateUploadFiles(List<String> paths) async {
  if (paths.isEmpty) return 'Selecione pelo menos uma imagem.';
  if (paths.length > maxUploadFiles) {
    return 'Selecione no máximo $maxUploadFiles imagens por lote.';
  }
  for (final path in paths) {
    final size = await File(path).length();
    if (size == 0 || size > maxUploadFileSizeBytes) {
      return 'Cada imagem deve ter entre 1 e $maxUploadFileSizeBytes bytes.';
    }
  }
  return null;
}
