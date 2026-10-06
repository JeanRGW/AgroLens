import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:agrolens/utils/inference_thumbnail.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';

Future<Uint8List> imageBytes(int width, int height) async {
  final recorder = ui.PictureRecorder();
  ui.Canvas(recorder).drawRect(
    ui.Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble()),
    ui.Paint()..color = const ui.Color(0xff245d38),
  );
  final picture = recorder.endRecording();
  final image = await picture.toImage(width, height);
  try {
    return (await image.toByteData(
      format: ui.ImageByteFormat.png,
    ))!.buffer.asUint8List();
  } finally {
    image.dispose();
    picture.dispose();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final dimensions in [
    (1440, 720, 360, 180),
    (720, 1440, 180, 360),
    (20, 10, 20, 10),
  ]) {
    test(
      'thumbnail is bounded and keeps aspect ratio for ${dimensions.$1}×${dimensions.$2}',
      () async {
        final original = await imageBytes(dimensions.$1, dimensions.$2);
        final file = XFile.fromData(
          original,
          name: 'a.png',
          mimeType: 'image/png',
        );
        final thumbnail = await inferenceThumbnail(file);
        expect(thumbnail, isNotNull);
        final codec = await ui.instantiateImageCodec(thumbnail!);
        final image = (await codec.getNextFrame()).image;
        try {
          expect(image.width, dimensions.$3);
          expect(image.height, dimensions.$4);
        } finally {
          image.dispose();
          codec.dispose();
        }
        expect(await file.readAsBytes(), original);
        expect(await file.length(), original.length);
        expect(
          await file.openRead().expand((chunk) => chunk).toList(),
          original,
        );
      },
    );
  }
  test(
    'invalid image returns a preview fallback without changing the original',
    () async {
      final bytes = Uint8List.fromList([1, 2, 3]);
      final file = XFile.fromData(bytes, name: 'invalid.png');
      expect(await inferenceThumbnail(file), isNull);
      expect(await file.readAsBytes(), bytes);
    },
  );
}
