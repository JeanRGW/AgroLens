import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/utils/upload_validation.dart';

void main() {
  test('rejects empty and oversized batches before accessing files', () async {
    expect(await validateUploadFiles([]), isNotNull);
    expect(
      await validateUploadFiles(
        List.filled(maxUploadFiles + 1, '/missing.jpg'),
      ),
      isNotNull,
    );
  });

  test('enforces file size boundaries using the original bytes', () async {
    final dir = await Directory.systemTemp.createTemp('upload-validation-');
    addTearDown(() => dir.delete(recursive: true));
    final file = File('${dir.path}/image.jpg');
    await file.writeAsBytes([]);
    expect(await validateUploadFiles([file.path]), isNotNull);
    await file.writeAsBytes([1]);
    expect(await validateUploadFiles([file.path]), isNull);
    final handle = await file.open(mode: FileMode.append);
    await handle.truncate(maxUploadFileSizeBytes);
    expect(await validateUploadFiles([file.path]), isNull);
    await handle.truncate(maxUploadFileSizeBytes + 1);
    await handle.close();
    expect(await validateUploadFiles([file.path]), isNotNull);
  });
}
