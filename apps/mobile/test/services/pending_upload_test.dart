import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/models/pending_upload.dart';

void main() {
  group('PendingUploadStatus', () {
    test('name returns correct string', () {
      expect(PendingUploadStatus.pending.name, 'pending');
      expect(PendingUploadStatus.uploading.name, 'uploading');
      expect(
        PendingUploadStatus.pendingMetadataSync.name,
        'pendingMetadataSync',
      );
      expect(PendingUploadStatus.completed.name, 'completed');
      expect(PendingUploadStatus.failed.name, 'failed');
    });

    test('values.byName parses correctly', () {
      expect(
        PendingUploadStatus.values.byName('pending'),
        PendingUploadStatus.pending,
      );
      expect(
        PendingUploadStatus.values.byName('uploading'),
        PendingUploadStatus.uploading,
      );
      expect(
        PendingUploadStatus.values.byName('pendingMetadataSync'),
        PendingUploadStatus.pendingMetadataSync,
      );
      expect(
        PendingUploadStatus.values.byName('completed'),
        PendingUploadStatus.completed,
      );
      expect(
        PendingUploadStatus.values.byName('failed'),
        PendingUploadStatus.failed,
      );
    });

    test('fromSqliteRow defaults to pending for unknown value', () {
      final row = {
        'id': 'test',
        'image_paths': '[]',
        'latitude': 0.0,
        'longitude': 0.0,
        'created_at': 0,
        'status': 'unknown',
      };
      final upload = PendingUpload.fromSqliteRow(row);
      expect(upload.status, PendingUploadStatus.pending);
    });
  });

  group('PendingUpload', () {
    final base = PendingUpload(
      id: 'test-id-123',
      imagePaths: '["/tmp/img1.jpg","/tmp/img2.jpg"]',
      latitude: -22.9,
      longitude: -43.1,
      createdAt: DateTime.now(),
      activityDate: DateTime.parse('2026-06-30T12:00:00Z'),
    );

    test('has correct initial status', () {
      expect(base.status, PendingUploadStatus.pending);
    });

    test('copyWith preserves unchanged fields', () {
      final copy = base.copyWith(status: PendingUploadStatus.uploading);
      expect(copy.id, base.id);
      expect(copy.imagePaths, base.imagePaths);
      expect(copy.status, PendingUploadStatus.uploading);
    });

    test('copyWith allows clearing error message', () {
      final withError = base.copyWith(errorMessage: 'Something went wrong');
      expect(withError.errorMessage, 'Something went wrong');

      final cleared = withError.copyWith(clearErrorMessage: true);
      expect(cleared.errorMessage, isNull);
    });

    test('copyWith clear flags reset nullable fields to null', () {
      final populated = base.copyWith(
        backendStatus: 'failed',
        backendError: 'Server rejected payload',
        syncErrorCode: 'SYNC_HTTP_500',
        errorMessage: 'Erro anterior',
      );

      final clearedBackendStatus = populated.copyWith(clearBackendStatus: true);
      expect(clearedBackendStatus.backendStatus, isNull);
      expect(clearedBackendStatus.backendError, 'Server rejected payload');

      final clearedBackendError = populated.copyWith(clearBackendError: true);
      expect(clearedBackendError.backendError, isNull);
      expect(clearedBackendError.backendStatus, 'failed');

      final clearedSyncCode = populated.copyWith(clearSyncErrorCode: true);
      expect(clearedSyncCode.syncErrorCode, isNull);
      expect(clearedSyncCode.backendStatus, 'failed');

      final allCleared = populated.copyWith(
        clearBackendStatus: true,
        clearBackendError: true,
        clearSyncErrorCode: true,
      );
      expect(allCleared.backendStatus, isNull);
      expect(allCleared.backendError, isNull);
      expect(allCleared.syncErrorCode, isNull);
    });

    test('clear flags beat explicit values and do not touch other fields', () {
      final populated = base.copyWith(
        backendStatus: 'draft',
        backendError: 'boom',
        syncErrorCode: 'SYNC_FAILED',
      );

      // Explicit nulls were already silent no-ops; the flag is the way out.
      final nullAssignments = populated.copyWith(
        backendStatus: null,
        backendError: null,
      );
      expect(nullAssignments.backendStatus, 'draft');
      expect(nullAssignments.backendError, 'boom');

      // A new value wins unless the clear flag is also set.
      final replaced = populated.copyWith(backendStatus: 'ready');
      expect(replaced.backendStatus, 'ready');

      final clearedOverValue = populated.copyWith(
        backendStatus: 'ready',
        clearBackendStatus: true,
      );
      expect(clearedOverValue.backendStatus, isNull);
      expect(clearedOverValue.backendError, 'boom');
      expect(clearedOverValue.syncErrorCode, 'SYNC_FAILED');
    });

    test('copyWith updates backend fields', () {
      final withBackend = base.copyWith(
        backendUploadId: 'backend-uuid',
        backendStatus: 'draft',
      );
      expect(withBackend.backendUploadId, 'backend-uuid');
      expect(withBackend.backendStatus, 'draft');
    });

    test(
      'paths parses JSON array safely and returns fallback on corrupt data',
      () {
        expect(base.paths, ['/tmp/img1.jpg', '/tmp/img2.jpg']);

        final corrupt = base.copyWith(imagePaths: 'invalid-json');
        expect(corrupt.paths, isEmpty);

        final nonList = base.copyWith(imagePaths: '{"key": "value"}');
        expect(nonList.paths, isEmpty);
      },
    );

    test('toSqliteRow and fromSqliteRow roundtrip', () {
      final upload = base.copyWith(
        status: PendingUploadStatus.completed,
        backendUploadId: 'backend-uuid',
        propertyId: 'prop-uuid',
        talhaoId: 'talhao-uuid',
        cropTypeId: 'crop-uuid',
        source: 'phone',
      );
      final row = upload.toSqliteRow();
      final restored = PendingUpload.fromSqliteRow(row);

      expect(restored.id, upload.id);
      expect(restored.imagePaths, upload.imagePaths);
      expect(restored.images.first.latitude, upload.images.first.latitude);
      expect(restored.images.first.longitude, upload.images.first.longitude);
      expect(restored.status, upload.status);
      expect(restored.backendUploadId, upload.backendUploadId);
      expect(restored.propertyId, upload.propertyId);
      expect(restored.talhaoId, upload.talhaoId);
      expect(restored.cropTypeId, upload.cropTypeId);
      expect(restored.source, upload.source);
      expect(
        restored.activityDate.isAtSameMomentAs(upload.activityDate),
        isTrue,
      );
    });

    test(
      'persists independent image locations including explicit nulls through retries',
      () {
        final upload = PendingUpload(
          id: 'mixed-locations',
          createdAt: DateTime.now(),
          images: [
            PendingImage(
              path: '/photos/camera.jpg',
              latitude: -22.9,
              longitude: -43.1,
              origin: 'camera',
            ),
            PendingImage(path: '/photos/gallery.jpg', origin: 'gallery'),
          ],
        );
        final restored = PendingUpload.fromSqliteRow(upload.toSqliteRow());
        final retry = restored.copyWith(status: PendingUploadStatus.failed);
        expect(retry.images.first.latitude, -22.9);
        expect(retry.images.last.latitude, isNull);
        expect(retry.images.last.longitude, isNull);
        expect(retry.images.first.origin, 'camera');
        expect(retry.images.first.imageId, upload.images.first.imageId);
      },
    );
  });
}
