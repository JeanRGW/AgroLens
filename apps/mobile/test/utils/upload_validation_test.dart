import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:agrolens/utils/upload_validation.dart';
import 'package:agrolens/utils/image_naming.dart';

void main() {
  XFile image(List<int> bytes, String name, String mimeType) =>
      XFile.fromData(Uint8List.fromList(bytes), name: name, mimeType: mimeType);

  test(
    'original bytes determine the extension, not a misleading picker name',
    () async {
      expect(
        await imageExtension(
          image([0xff, 0xd8, 0xff], 'photo.heic', 'image/heic'),
        ),
        '.jpg',
      );
      expect(
        await imageExtension(
          image(
            [0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10],
            'photo.jpg',
            'image/jpeg',
          ),
        ),
        '.png',
      );
      expect(
        await imageExtension(
          image([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80], 'photo', ''),
        ),
        '.webp',
      );
    },
  );

  test('HEIC/HEIF originals are rejected even if labelled JPEG', () async {
    for (final brand in ['heic', 'heif', 'mif1']) {
      final file = image(
        [0, 0, 0, 24, ...'ftyp$brand'.codeUnits],
        'photo.jpg',
        'image/jpeg',
      );
      expect(await validateUploadFiles([file]), contains('JPEG, PNG ou WebP'));
      await expectLater(imageExtension(file), throwsFormatException);
    }
  });

  test('rejects empty and oversized batches before accessing files', () async {
    expect(await validateUploadFiles([]), isNotNull);
    expect(
      await validateUploadFiles(
        List.filled(maxUploadFiles + 1, XFile('/missing.jpg')),
      ),
      isNotNull,
    );
  });

  test('enforces file size boundaries using the original bytes', () async {
    final dir = await Directory.systemTemp.createTemp('upload-validation-');
    addTearDown(() => dir.delete(recursive: true));
    final file = File('${dir.path}/image.jpg');
    await file.writeAsBytes([]);
    expect(await validateUploadFiles([XFile(file.path)]), isNotNull);
    await file.writeAsBytes([1]);
    expect(await validateUploadFiles([XFile(file.path)]), contains('Formato'));
    await file.writeAsBytes([0xff, 0xd8, 0xff]);
    expect(await validateUploadFiles([XFile(file.path)]), isNull);
    final handle = await file.open(mode: FileMode.append);
    await handle.truncate(maxUploadFileSizeBytes);
    expect(await validateUploadFiles([XFile(file.path)]), isNull);
    await handle.truncate(maxUploadFileSizeBytes + 1);
    await handle.close();
    expect(await validateUploadFiles([XFile(file.path)]), isNotNull);
  });
}
