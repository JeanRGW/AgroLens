import 'dart:async';
import 'dart:io';
import '../models/pending_upload.dart';
import '../models/upload_response.dart';
import 'api_client.dart';
import 'auth_service.dart';
import 'database_helper.dart';
import 'catalog_repository.dart';

/// Encapsulates the 4 individual steps of the upload sync pipeline:
/// 1. init (POST /uploads/init)
/// 2. upload originals (PUT presigned URLs)
/// 3. complete (POST /uploads/:id/complete)
/// 4. poll (GET /uploads/:id)
class UploadPipeline {
  final ApiClient apiClient;
  final AuthService authService;
  final DatabaseHelper databaseHelper;
  final CatalogRepository catalogRepository;
  final Duration Function(int attempt) _pollDelay;
  final Future<void> Function(Duration) _delay;
  final DateTime Function() _now;

  UploadPipeline({
    required this.apiClient,
    required this.authService,
    required this.databaseHelper,
    required this.catalogRepository,
    Duration Function(int attempt)? pollDelay,
    Future<void> Function(Duration)? delay,
    DateTime Function()? now,
  }) : _pollDelay = pollDelay ?? _defaultPollDelay,
       _delay = delay ?? Future<void>.delayed,
       _now = now ?? DateTime.now;

  static Duration _defaultPollDelay(int attempt) {
    final seconds = 1 << attempt.clamp(0, 4);
    return Duration(seconds: seconds > 16 ? 16 : seconds);
  }

  /// Step 1: Call POST /uploads/init and update local record.
  Future<StepInitResult> stepInit(
    PendingUpload upload, {
    int session = 0,
    int Function()? getSession,
  }) async {
    final generation = authService.sessionGeneration;
    void ensureSession() =>
        _ensureSession(upload, generation, session, getSession);
    ensureSession();
    final token = await authService.getValidAccessToken();
    if (token == null) throw const ApiException(401, 'Not authenticated');

    final resolvedCatalogIds = await resolveUploadCatalogIds(upload);
    final fileList = await encodeFileList(upload.paths);
    ensureSession();

    final body = {
      'clientUploadId': upload.id,
      'propertyId': resolvedCatalogIds['propertyId'],
      'talhaoId': resolvedCatalogIds['talhaoId'],
      'cropTypeId': resolvedCatalogIds['cropTypeId'],
      if (resolvedCatalogIds['estadioId'] != null)
        'estadioId': resolvedCatalogIds['estadioId'],
      'source': upload.source ?? 'phone',
      // Serialize in UTC: backend activity_date is timestamptz and rejects
      // naive local strings now that init requires timezone-qualified ISO.
      'activityDate': upload.activityDate.toUtc().toIso8601String(),
      'latitude': upload.latitude,
      'longitude': upload.longitude,
      'files': fileList,
    };

    final response = await apiClient.uploadInit(accessToken: token, body: body);
    ensureSession();

    final recoveredStatus = switch (response.status) {
      'ready' => PendingUploadStatus.completed,
      'finalizing' => PendingUploadStatus.pendingMetadataSync,
      _ => PendingUploadStatus.uploading,
    };
    final updated = upload.copyWith(
      status: recoveredStatus,
      backendUploadId: response.uploadId,
      backendStatus: response.status,
    );
    await databaseHelper.updateUpload(updated);
    return StepInitResult(
      upload: updated,
      presignedUrls: response.presignedUrls,
    );
  }

  /// Step 2: Upload original file bytes to presigned URLs.
  Future<PendingUpload> stepUploadOriginals(
    PendingUpload upload,
    List<String> localPaths,
    List<PresignedUploadUrl> presignedUrls, {
    int session = 0,
    int Function()? getSession,
  }) async {
    final generation = authService.sessionGeneration;
    void ensureSession() =>
        _ensureSession(upload, generation, session, getSession);
    ensureSession();
    if (localPaths.length != presignedUrls.length) {
      throw ApiException(
        400,
        'File count mismatch: ${localPaths.length} paths vs ${presignedUrls.length} URLs',
      );
    }

    for (var i = 0; i < presignedUrls.length; i++) {
      ensureSession();
      final presigned = presignedUrls[i];
      if (!presigned.requiresUpload) continue;

      final presignedUrl = presigned.url;
      if (presignedUrl == null || presignedUrl.trim().isEmpty) continue;

      final file = File(localPaths[i]);
      if (!await file.exists()) {
        throw ApiException(404, 'Local file not found: ${localPaths[i]}');
      }
      final ext = localPaths[i].split('.').last.toLowerCase();
      final contentType = contentTypeForExtension(ext);
      ensureSession();
      final statusCode = await apiClient.uploadFileToPresignedUrl(
        presignedUrl: presignedUrl,
        file: file,
        contentType: contentType,
        headers: presigned.headers,
      );
      ensureSession();
      if (statusCode < 200 || statusCode >= 300) {
        final failed = upload.copyWith(
          status: PendingUploadStatus.failed,
          errorMessage: 'PUT failed with status $statusCode for file $i',
        );
        await databaseHelper.updateUpload(failed);
        throw ApiException(statusCode, 'Upload failed for file index $i');
      }
    }

    final updated = upload.copyWith(
      status: PendingUploadStatus.pendingMetadataSync,
    );
    await databaseHelper.updateUpload(updated);
    return updated;
  }

  /// Step 3: Call POST /uploads/:id/complete.
  Future<PendingUpload> stepComplete(
    PendingUpload upload, {
    int session = 0,
    int Function()? getSession,
  }) async {
    final generation = authService.sessionGeneration;
    void ensureSession() =>
        _ensureSession(upload, generation, session, getSession);
    final token = await authService.getValidAccessToken();
    ensureSession();
    if (token == null) throw const ApiException(401, 'Not authenticated');
    if (upload.backendUploadId == null) {
      throw const ApiException(400, 'No backend upload ID');
    }

    final response = await apiClient.uploadComplete(
      accessToken: token,
      uploadId: upload.backendUploadId!,
    );
    ensureSession();

    final updated = upload.copyWith(backendStatus: response.status);
    await databaseHelper.updateUpload(updated);
    return updated;
  }

  /// Step 4: Poll upload detail until ready or failed.
  Future<PendingUpload> stepPollUntilReady({
    required PendingUpload upload,
    int maxPolls = 30,
    Duration pollInterval = const Duration(seconds: 2),
    Duration deadline = const Duration(minutes: 2),
    int session = 0,
    int Function()? getSession,
  }) async {
    final generation = authService.sessionGeneration;
    void ensureSession() =>
        _ensureSession(upload, generation, session, getSession);
    if (upload.backendUploadId == null) {
      throw const ApiException(400, 'No backend upload ID');
    }

    final token = await authService.getValidAccessToken();
    if (token == null) throw const ApiException(401, 'Not authenticated');

    final startedAt = _now();
    for (var i = 0; i < maxPolls; i++) {
      ensureSession();
      final delay = i == 0 ? pollInterval : _pollDelay(i - 1);
      if (_now().difference(startedAt) + delay > deadline) break;
      await _delay(delay);
      ensureSession();

      final currentToken = i == 0
          ? token
          : await authService.getValidAccessToken();
      if (currentToken == null) {
        throw const ApiException(401, 'Not authenticated');
      }
      ensureSession();
      final detail = await apiClient.getUploadDetail(
        accessToken: currentToken,
        uploadId: upload.backendUploadId!,
      );
      ensureSession();

      switch (detail.status) {
        case 'ready':
          final done = upload.copyWith(
            status: PendingUploadStatus.completed,
            backendStatus: 'ready',
            clearErrorMessage: true,
          );
          await databaseHelper.updateUpload(done);
          return done;
        case 'failed':
          final failed = upload.copyWith(
            status: PendingUploadStatus.failed,
            backendStatus: 'failed',
            backendError: detail.errorMessage,
            errorMessage: detail.errorMessage,
          );
          await databaseHelper.updateUpload(failed);
          return failed;
        case 'finalizing':
        case 'draft':
          continue;
      }
    }

    final timedOut = upload.copyWith(
      errorMessage:
          'Poll timed out after ${maxPolls * pollInterval.inSeconds}s',
    );
    await databaseHelper.updateUpload(timedOut);
    return timedOut;
  }

  void _ensureSession(
    PendingUpload upload,
    int generation,
    int session,
    int Function()? getSession,
  ) {
    if (authService.currentUser == null ||
        authService.sessionGeneration != generation ||
        (getSession != null && getSession() != session) ||
        (upload.ownerId != null &&
            upload.ownerId != authService.currentUser?.id)) {
      throw const ApiException(401, 'Sync stopped after logout');
    }
  }

  Future<Map<String, String?>> resolveUploadCatalogIds(
    PendingUpload upload,
  ) async {
    if (upload.propertyId == null || upload.propertyId!.trim().isEmpty) {
      const message = 'Upload sem propriedade selecionada.';
      await _markUploadDependencyWaiting(upload, message);
      throw const ApiException(412, message);
    }
    if (upload.talhaoId == null || upload.talhaoId!.trim().isEmpty) {
      const message = 'Upload sem talhão selecionado.';
      await _markUploadDependencyWaiting(upload, message);
      throw const ApiException(412, message);
    }
    if (upload.cropTypeId == null || upload.cropTypeId!.trim().isEmpty) {
      const message = 'Upload sem cultura selecionada.';
      await _markUploadDependencyWaiting(upload, message);
      throw const ApiException(412, message);
    }

    final propertyId = await catalogRepository.resolveCatalogId(
      upload.propertyId!,
    );
    if (propertyId == null) {
      const message = 'Upload aguardando sincronização da propriedade local.';
      await _markUploadDependencyWaiting(upload, message);
      throw const ApiException(412, message);
    }

    final talhaoId = await catalogRepository.resolveCatalogId(upload.talhaoId!);
    if (talhaoId == null) {
      const message = 'Upload aguardando sincronização do talhão local.';
      await _markUploadDependencyWaiting(upload, message);
      throw const ApiException(412, message);
    }

    final cropTypeId = await catalogRepository.resolveCatalogId(
      upload.cropTypeId!,
    );
    if (cropTypeId == null) {
      const message = 'Upload aguardando sincronização da cultura local.';
      await _markUploadDependencyWaiting(upload, message);
      throw const ApiException(412, message);
    }

    final estadioId = upload.estadioId == null
        ? null
        : await catalogRepository.resolveCatalogId(upload.estadioId!);
    if (upload.estadioId != null && estadioId == null) {
      const message = 'Upload aguardando sincronização do estádio local.';
      await _markUploadDependencyWaiting(upload, message);
      throw const ApiException(412, message);
    }

    return {
      'propertyId': propertyId,
      'talhaoId': talhaoId,
      'cropTypeId': cropTypeId,
      'estadioId': estadioId,
    };
  }

  Future<void> _markUploadDependencyWaiting(
    PendingUpload upload,
    String message,
  ) async {
    final waiting = upload.copyWith(
      status: PendingUploadStatus.failed,
      errorMessage: message,
      clearErrorMessage: false,
    );
    await databaseHelper.updateUpload(waiting);
  }

  Future<List<Map<String, dynamic>>> encodeFileList(List<String> paths) async {
    final results = <Map<String, dynamic>>[];
    for (var i = 0; i < paths.length; i++) {
      final path = paths[i];
      final ext = path.split('.').last.toLowerCase();
      final contentType = contentTypeForExtension(ext);
      final sizeBytes = await File(path).length();
      results.add({
        'imageIndex': i,
        'fileName': path.split('/').last,
        'contentType': contentType,
        'sizeBytes': sizeBytes,
      });
    }
    return results;
  }

  String contentTypeForExtension(String ext) {
    switch (ext) {
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      default:
        return 'image/jpeg';
    }
  }
}

/// Result of a stepInit invocation, carrying the updated upload together
/// with the presigned URLs so callers do not need to re-init.
class StepInitResult {
  final PendingUpload upload;
  final List<PresignedUploadUrl> presignedUrls;

  const StepInitResult({required this.upload, required this.presignedUrls});
}
