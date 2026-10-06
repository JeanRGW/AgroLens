import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:image_picker/image_picker.dart';

Future<Uint8List?> inferenceThumbnail(XFile file) async {
  ui.Codec? codec;
  ui.Image? image;
  try {
    final buffer = await ui.ImmutableBuffer.fromUint8List(
      await file.readAsBytes(),
    );
    codec = await ui.instantiateImageCodecWithSize(
      buffer,
      getTargetSize: (width, height) {
        final scale = math.min(1.0, 360 / math.max(width, height));
        return ui.TargetImageSize(
          width: math.max(1, (width * scale).round()),
          height: math.max(1, (height * scale).round()),
        );
      },
    );
    image = (await codec.getNextFrame()).image;
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    return bytes?.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes);
  } catch (_) {
    return null;
  } finally {
    image?.dispose();
    codec?.dispose();
  }
}
