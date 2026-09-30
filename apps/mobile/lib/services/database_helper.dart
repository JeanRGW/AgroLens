import 'dart:async';
import 'dart:convert';
import 'package:image_picker/image_picker.dart';
import 'package:uuid/uuid.dart';
import '../models/pending_upload.dart';
import '../utils/browser_lock.dart';
import '../utils/image_naming.dart';
import 'app_database.dart' show AppDatabase;
import 'auth_service.dart';
import 'local_image_store.dart';

/// SQLite database helper for the pending upload queue.
///
/// Uses the same status model across local queueing and backend sync:
/// pending → uploading → pendingMetadataSync → completed | failed
class DatabaseHelper {
  /// Failed uploads are retried automatically at most this many times.
  /// Explicit user retries are not subject to this limit.
  static const int maxAutomaticSyncAttempts = 5;
  static const String _tablePendingUploads = 'pending_uploads';

  final AppDatabase appDatabase;
  final AuthService authService;
  final StreamController<void> _changesController =
      StreamController<void>.broadcast();

  Stream<void> get changes => _changesController.stream;

  DatabaseHelper({required this.appDatabase, required this.authService});

  void _notifyChanges() {
    if (!_changesController.isClosed) {
      _changesController.add(null);
    }
  }

  String _ownerId() =>
      authService.currentUser?.id ??
      (throw StateError('Authenticated owner is required'));

  AppDatabase get database => appDatabase;

  /// Protect the interval between committing originals and their queue row.
  Future<void> saveUploadImages({
    required List<XFile> files,
    required LocalImageStore imageStore,
    required PendingUpload Function(List<String> paths) createUpload,
  }) => withBrowserLock('agrolens-image-queue', () async {
    final paths = <String>[];
    try {
      for (final file in files) {
        final extension = await imageExtension(file);
        paths.add(
          await imageStore.saveImage(
            file: file,
            fileName: '${const Uuid().v4()}$extension',
          ),
        );
      }
      await insertPendingUpload(createUpload(paths));
    } catch (_) {
      for (final path in paths) {
        try {
          await imageStore.deleteImage(path);
        } catch (_) {
          // Orphan cleanup can retry failed rollback without masking the save error.
        }
      }
      rethrow;
    }
  });

  /// Insert a new pending upload.
  Future<int> insertPendingUpload(PendingUpload upload) async {
    final ownerId = _ownerId();
    final db = database;
    final row = upload.toSqliteRow()..['owner_id'] = ownerId;
    final result = await db.saveRow(_tablePendingUploads, row);
    _notifyChanges();
    return result;
  }

  /// Get all pending (not completed/failed) uploads, oldest first.
  Future<List<PendingUpload>> getPendingAndFailedUploads() async {
    final ownerId = _ownerId();
    final db = database;
    final rows = await db.readRows(
      '''SELECT * FROM $_tablePendingUploads WHERE owner_id = ? AND (
        (status = ? OR status = ? OR status = ?) AND
        sync_attempt_count < ?
      ) ORDER BY created_at ASC''',
      [
        ownerId,
        PendingUploadStatus.pending.name,
        PendingUploadStatus.pendingMetadataSync.name,
        PendingUploadStatus.failed.name,
        maxAutomaticSyncAttempts,
      ],
    );
    return rows.map(PendingUpload.fromSqliteRow).toList();
  }

  /// Get all uploads most recent first.
  Future<List<PendingUpload>> getAllUploads() async {
    final ownerId = _ownerId();
    final db = database;
    final rows = await db.readRows(
      'SELECT * FROM $_tablePendingUploads WHERE owner_id = ? ORDER BY created_at DESC',
      [ownerId],
    );
    return rows.map(PendingUpload.fromSqliteRow).toList();
  }

  /// Get a single upload by clientUploadId, or null when absent.
  Future<PendingUpload?> getUploadById(String id) async {
    final ownerId = _ownerId();
    final db = database;
    final rows = await db.readRows(
      'SELECT * FROM $_tablePendingUploads WHERE id = ? AND owner_id = ? LIMIT 1',
      [id, ownerId],
    );
    return rows.isEmpty ? null : PendingUpload.fromSqliteRow(rows.first);
  }

  /// Update upload status and optional fields.
  Future<int> updateUpload(PendingUpload upload) async {
    final ownerId = _ownerId();
    final db = database;
    final row = upload.toSqliteRow()..['owner_id'] = ownerId;
    final result = await db.updateRow(
      _tablePendingUploads,
      row,
      'id = ? AND owner_id = ?',
      [upload.id, ownerId],
    );
    _notifyChanges();
    return result;
  }

  /// Reset all `uploading` entries back to `pending` (e.g. on app restart).
  Future<int> resetUploadingToPending() async {
    final ownerId = _ownerId();
    final db = database;
    final result = await db.updateRow(
      _tablePendingUploads,
      {'status': PendingUploadStatus.pending.name, 'error_message': null},
      'owner_id = ? AND status = ?',
      [ownerId, PendingUploadStatus.uploading.name],
    );
    _notifyChanges();
    return result;
  }

  /// Delete a single upload by clientUploadId.
  Future<int> deleteUpload(String id) async {
    final ownerId = _ownerId();
    final db = database;
    final result = await db.deleteRows(
      _tablePendingUploads,
      'id = ? AND owner_id = ?',
      [id, ownerId],
    );
    _notifyChanges();
    return result;
  }

  /// Delete all completed uploads.
  Future<int> deleteCompletedUploads() async {
    final ownerId = _ownerId();
    final db = database;
    final result = await db.deleteRows(
      _tablePendingUploads,
      'owner_id = ? AND status = ?',
      [ownerId, PendingUploadStatus.completed.name],
    );
    _notifyChanges();
    return result;
  }

  /// Deletes local images in [imageStore] that are no longer
  /// referenced by any upload across the entire database.
  Future<int> cleanupOrphanedImages({
    required LocalImageStore imageStore,
  }) => withBrowserLock('agrolens-image-queue', () async {
    final db = database;
    final rows = await db.readRows(
      'SELECT images_json FROM $_tablePendingUploads',
    );
    final activePaths = <String>{};
    for (final row in rows) {
      final raw = row['images_json'] as String?;
      if (raw != null) {
        try {
          final images = (jsonDecode(raw) as List<dynamic>)
              .cast<Map<String, dynamic>>();
          activePaths.addAll(images.map((image) => image['path'] as String));
        } catch (_) {
          // A corrupt queue row must not cause cleanup to delete another batch's images.
          return 0;
        }
      }
    }

    int deleted = 0;
    try {
      final storedPaths = await imageStore.listPaths();
      for (final path in storedPaths) {
        if (!activePaths.contains(path)) {
          try {
            await imageStore.deleteImage(path);
            deleted++;
          } catch (_) {}
        }
      }
    } catch (_) {}
    return deleted;
  });

  Future<void> close() async {
    if (!_changesController.isClosed) {
      await _changesController.close();
    }
    await appDatabase.close();
  }
}
