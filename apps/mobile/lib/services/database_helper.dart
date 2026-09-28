import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:sqflite/sqflite.dart';
import '../models/pending_upload.dart';
import 'app_database.dart';
import 'auth_service.dart';

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

  Future<Database> get database => appDatabase.database;

  /// Insert a new pending upload.
  Future<int> insertPendingUpload(PendingUpload upload) async {
    final ownerId = _ownerId();
    final db = await database;
    final row = upload.toSqliteRow()..['owner_id'] = ownerId;
    final result = await db.insert(
      _tablePendingUploads,
      row,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
    _notifyChanges();
    return result;
  }

  /// Get all pending (not completed/failed) uploads, oldest first.
  Future<List<PendingUpload>> getPendingAndFailedUploads() async {
    final ownerId = _ownerId();
    final db = await database;
    final rows = await db.query(
      _tablePendingUploads,
      where: '''owner_id = ? AND (
        (status = ? OR status = ? OR status = ?) AND
        sync_attempt_count < ?
      )''',
      whereArgs: [
        ownerId,
        PendingUploadStatus.pending.name,
        PendingUploadStatus.pendingMetadataSync.name,
        PendingUploadStatus.failed.name,
        maxAutomaticSyncAttempts,
      ],
      orderBy: 'created_at ASC',
    );
    return rows.map(PendingUpload.fromSqliteRow).toList();
  }

  /// Get all uploads most recent first.
  Future<List<PendingUpload>> getAllUploads() async {
    final ownerId = _ownerId();
    final db = await database;
    final rows = await db.query(
      _tablePendingUploads,
      where: 'owner_id = ?',
      whereArgs: [ownerId],
      orderBy: 'created_at DESC',
    );
    return rows.map(PendingUpload.fromSqliteRow).toList();
  }

  /// Get a single upload by clientUploadId, or null when absent.
  Future<PendingUpload?> getUploadById(String id) async {
    final ownerId = _ownerId();
    final db = await database;
    final rows = await db.query(
      _tablePendingUploads,
      where: 'id = ? AND owner_id = ?',
      whereArgs: [id, ownerId],
      limit: 1,
    );
    return rows.isEmpty ? null : PendingUpload.fromSqliteRow(rows.first);
  }

  /// Update upload status and optional fields.
  Future<int> updateUpload(PendingUpload upload) async {
    final ownerId = _ownerId();
    final db = await database;
    final row = upload.toSqliteRow()..['owner_id'] = ownerId;
    final result = await db.update(
      _tablePendingUploads,
      row,
      where: 'id = ? AND owner_id = ?',
      whereArgs: [upload.id, ownerId],
    );
    _notifyChanges();
    return result;
  }

  /// Reset all `uploading` entries back to `pending` (e.g. on app restart).
  Future<int> resetUploadingToPending() async {
    final ownerId = _ownerId();
    final db = await database;
    final result = await db.update(
      _tablePendingUploads,
      {'status': PendingUploadStatus.pending.name, 'error_message': null},
      where: 'owner_id = ? AND status = ?',
      whereArgs: [ownerId, PendingUploadStatus.uploading.name],
    );
    _notifyChanges();
    return result;
  }

  /// Delete a single upload by clientUploadId.
  Future<int> deleteUpload(String id) async {
    final ownerId = _ownerId();
    final db = await database;
    final result = await db.delete(
      _tablePendingUploads,
      where: 'id = ? AND owner_id = ?',
      whereArgs: [id, ownerId],
    );
    _notifyChanges();
    return result;
  }

  /// Delete all completed uploads.
  Future<int> deleteCompletedUploads() async {
    final ownerId = _ownerId();
    final db = await database;
    final result = await db.delete(
      _tablePendingUploads,
      where: 'owner_id = ? AND status = ?',
      whereArgs: [ownerId, PendingUploadStatus.completed.name],
    );
    _notifyChanges();
    return result;
  }

  /// Deletes local image files in [imagesDirectory] that are no longer
  /// referenced by any upload across the entire database.
  Future<int> cleanupOrphanedImages({Directory? imagesDirectory}) async {
    final dir = imagesDirectory;
    if (dir == null || !await dir.exists()) return 0;

    final db = await database;
    final rows = await db.query(_tablePendingUploads, columns: ['images_json']);
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
      final entities = await dir.list().toList();
      for (final entity in entities) {
        if (entity is File && !activePaths.contains(entity.path)) {
          try {
            await entity.delete();
            deleted++;
          } catch (_) {}
        }
      }
    } catch (_) {}
    return deleted;
  }

  Future<void> close() async {
    if (!_changesController.isClosed) {
      await _changesController.close();
    }
    await appDatabase.close();
  }
}
