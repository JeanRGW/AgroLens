import 'dart:typed_data';
import 'package:image_picker/image_picker.dart';

/// Cross-platform storage for pending-upload image originals.
///
/// On io platforms images are files under the app documents directory; on web
/// they are blobs in IndexedDB. The persisted [PendingImage.path] value is an
/// opaque key owned by the active implementation: an absolute file path on io,
/// a `pending_images/<name>` key on web. Keys keep the file extension so
/// content types stay derivable from them.
abstract class LocalImageStore {
  /// Persists picked [file] and returns the key to store in [PendingImage.path].
  Future<String> saveImage({required XFile file, required String fileName});

  Future<bool> exists(String path);

  Future<int> length(String path);

  Stream<List<int>> openRead(String path);

  Future<Uint8List> readBytes(String path);

  Future<void> deleteImage(String path);

  /// Comparison key for the same image; stored paths and web blob keys stay intact.
  String comparisonKey(String path);

  /// Keys of every image currently stored (used for orphan cleanup).
  Future<List<String>> listPaths();
}
