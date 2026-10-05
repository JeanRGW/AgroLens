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
  Future<PendingUpload> saveUploadImages({
    required List<XFile> files,
    required LocalImageStore imageStore,
    required PendingUpload Function(List<String> paths) createUpload,
  }) => withBrowserLock('agrolens-image-queue', () async {
    final ownerId = _ownerId();
    final generation = authService.sessionGeneration;
    final paths = <String>[];
    late PendingUpload upload;
    List<String> removedPaths = [];
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
      upload = createUpload(paths);
      final previous = await getUploadById(upload.id);
      if (authService.currentUser?.id != ownerId ||
          authService.sessionGeneration != generation) {
        throw StateError('Session changed');
      }
      final retainedPaths = upload.paths.map(imageStore.comparisonKey).toSet();
      removedPaths =
          previous?.paths
              .where(
                (path) =>
                    !retainedPaths.contains(imageStore.comparisonKey(path)),
              )
              .toList() ??
          [];
      await insertPendingUpload(upload);
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
    // Cleanup failure must not roll back originals referenced by a committed row.
    await _deleteUnreferencedImages(imageStore, removedPaths);
    return upload;
  });

  Future<void> discardDraft(String id, {required LocalImageStore imageStore}) =>
      withBrowserLock('agrolens-image-queue', () async {
        final ownerId = _ownerId();
        final generation = authService.sessionGeneration;
        final draft = await getUploadById(id);
        if (draft == null) return;
        if (authService.currentUser?.id != ownerId ||
            authService.sessionGeneration != generation) {
          throw StateError('Session changed');
        }
        if (draft.status != PendingUploadStatus.draft) {
          throw StateError('Only drafts can be discarded');
        }
        if (await deleteUpload(id) > 0) {
          await _deleteUnreferencedImages(imageStore, draft.paths);
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
      'SELECT * FROM $_tablePendingUploads WHERE owner_id = ? AND status != ? ORDER BY created_at DESC',
      [ownerId, PendingUploadStatus.draft.name],
    );
    return rows.map(PendingUpload.fromSqliteRow).toList();
  }

  Future<List<PendingUpload>> getDrafts() async {
    final rows = await database.readRows(
      'SELECT * FROM $_tablePendingUploads WHERE owner_id = ? AND status = ? ORDER BY created_at DESC',
      [_ownerId(), PendingUploadStatus.draft.name],
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
  Future<int> cleanupOrphanedImages({required LocalImageStore imageStore}) =>
      withBrowserLock('agrolens-image-queue', () async {
        try {
          return await _deleteUnreferencedImages(
            imageStore,
            await imageStore.listPaths(),
          );
        } catch (_) {
          return 0;
        }
      });

  Future<int> _deleteUnreferencedImages(
    LocalImageStore imageStore,
    List<String> paths,
  ) async {
    if (paths.isEmpty) return 0;
    try {
      final rows = await database.readRows(
        'SELECT images_json FROM $_tablePendingUploads',
      );
      final activePaths = <String>{};
      for (final row in rows) {
        final raw = row['images_json'] as String?;
        if (raw != null) {
          try {
            final images = (jsonDecode(raw) as List<dynamic>)
                .cast<Map<String, dynamic>>();
            activePaths.addAll(
              images.map(
                (image) => imageStore.comparisonKey(image['path'] as String),
              ),
            );
          } catch (_) {
            // A corrupt queue row must not cause cleanup to delete another batch's images.
            return 0;
          }
        }
      }

      int deleted = 0;
      for (final path in paths) {
        if (!activePaths.contains(imageStore.comparisonKey(path))) {
          try {
            await imageStore.deleteImage(path);
            deleted++;
          } catch (_) {}
        }
      }
      return deleted;
    } catch (_) {
      return 0;
    }
  }

  Future<void> close() async {
    if (!_changesController.isClosed) {
      await _changesController.close();
    }
    await appDatabase.close();
  }
}
