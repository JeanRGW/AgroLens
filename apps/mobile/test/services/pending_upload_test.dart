import 'package:flutter_test/flutter_test.dart';
import 'package:agrolens/models/pending_upload.dart';

void main() {
  group('PendingUpload', () {
    final base = PendingUpload(
      id: 'test-id-123',
      paths: ['/tmp/img1.jpg', '/tmp/img2.jpg'],
      latitude: -22.9,
      longitude: -43.1,
      createdAt: DateTime.now(),
      activityDate: DateTime.parse('2026-06-30T12:00:00Z'),
    );

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
        clearErrorMessage: true,
        clearBackendStatus: true,
        clearBackendError: true,
        clearSyncErrorCode: true,
      );
      expect(allCleared.errorMessage, isNull);
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
      expect(restored.paths, upload.paths);
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
