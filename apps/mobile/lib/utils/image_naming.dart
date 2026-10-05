import 'dart:math' as math;

import 'package:image_picker/image_picker.dart';

/// Names originals from their bytes, never by pretending an unsupported format
/// (such as HEIC returned by the browser picker) has been converted to JPEG.
Future<String> imageExtension(XFile file) async {
  final header = await file
      .openRead(0, math.min(12, await file.length()))
      .fold<List<int>>([], (bytes, chunk) => bytes..addAll(chunk));
  bool startsWith(List<int> signature) =>
      header.length >= signature.length &&
      List.generate(
        signature.length,
        (i) => header[i] == signature[i],
      ).every((value) => value);

  if (startsWith([0xff, 0xd8, 0xff])) return '.jpg';
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return '.png';
  }
  if (header.length >= 12 &&
      startsWith([0x52, 0x49, 0x46, 0x46]) &&
      header[8] == 0x57 &&
      header[9] == 0x45 &&
      header[10] == 0x42 &&
      header[11] == 0x50) {
    return '.webp';
  }
  throw const FormatException(
    'Formato de imagem não suportado. Use JPEG, PNG ou WebP.',
  );
}
