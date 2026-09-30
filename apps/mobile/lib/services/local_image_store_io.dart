import 'dart:io';
import 'dart:typed_data';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'local_image_store_base.dart';

export 'local_image_store_base.dart';

/// File-based [LocalImageStore] keeping originals in `<docs>/pending_images`.
class IoLocalImageStore implements LocalImageStore {
  final Future<Directory> Function() _resolveDirectory;

  IoLocalImageStore({Future<Directory> Function()? directory})
    : _resolveDirectory = directory ?? _defaultImagesDirectory;

  static Future<Directory> _defaultImagesDirectory() async {
    final appDir = await getApplicationDocumentsDirectory();
    final imagesDir = Directory('${appDir.path}/pending_images');
    if (!await imagesDir.exists()) {
      await imagesDir.create(recursive: true);
    }
    return imagesDir;
  }

  @override
  Future<String> saveImage({
    required XFile file,
    required String fileName,
  }) async {
    final dir = await _resolveDirectory();
    final destPath = '${dir.path}/$fileName';
    if (file.path.isNotEmpty) {
      await File(file.path).copy(destPath);
    } else {
      await File(destPath).writeAsBytes(await file.readAsBytes(), flush: true);
    }
    return destPath;
  }

  @override
  Future<bool> exists(String path) => File(path).exists();

  @override
  Future<int> length(String path) => File(path).length();

  @override
  Stream<List<int>> openRead(String path) => File(path).openRead();

  @override
  Future<Uint8List> readBytes(String path) => File(path).readAsBytes();

  @override
  Future<void> deleteImage(String path) => File(path).delete();

  @override
  Future<List<String>> listPaths() async {
    final dir = await _resolveDirectory();
    if (!await dir.exists()) return const [];
    final entities = await dir.list().toList();
    return entities.whereType<File>().map((file) => file.path).toList();
  }
}

LocalImageStore createLocalImageStore() => IoLocalImageStore();
