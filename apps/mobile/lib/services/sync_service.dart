import 'dart:async';
import 'inference_service.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../models/download_url_response.dart';
import '../models/pending_upload.dart';
import '../models/upload_response.dart';
import '../utils/app_logger.dart';
import '../utils/platform_errors.dart';
import 'api_client.dart';
import 'auth_service.dart';
import 'database_helper.dart';
import 'catalog_repository.dart';
import 'connectivity_monitor.dart';
import 'local_image_store.dart';
import 'upload_pipeline.dart';

export 'upload_pipeline.dart' show StepInitResult;

/// Sync service orchestrating catalog sync, upload queue execution,
/// retry logic, and connectivity monitoring.
class SyncService {
  late final inference = InferenceService(_apiClient, _authService);
  final ApiClient _apiClient;
  final AuthService _authService;
  final DatabaseHelper _databaseHelper;
  final LocalImageStore _imageStore;
  final ConnectivityMonitor _connectivityMonitor;
  final UploadPipeline _pipeline;
  final Future<void> Function() _syncPendingCatalogCreates;
  final DateTime Function() _now;

  bool _disposed = false;
  bool _isSyncingAll = false;
  bool _isConnectivitySyncing = false;
  bool _connectivitySyncQueued = false;
  int _sessionGeneration = 0;
  final Map<String, Future<PendingUpload>> _activeUploads = {};
  final Set<String> _deletingUploads = {};

  bool isUploadActive(String id) =>
      _activeUploads.containsKey(id) || _deletingUploads.contains(id);

  /// Stream of connection status (true = online).
  Stream<bool> get connectionStatus => _connectivityMonitor.connectionStatus;

  SyncService({
    required ApiClient apiClient,
    required AuthService authService,
    required DatabaseHelper databaseHelper,
    required CatalogRepository catalogRepository,
    LocalImageStore? imageStore,
    Connectivity? connectivity,
    Stream<List<ConnectivityResult>>? connectivityChanges,
    Duration connectivityDebounce = const Duration(milliseconds: 250),
    Future<List<ConnectivityResult>> Function()? checkConnectivity,
    Duration Function(int attempt)? pollDelay,
    Future<void> Function(Duration)? delay,
    DateTime Function()? now,
    Future<void> Function()? syncPendingCatalogCreates,
  }) : _apiClient = apiClient,
       _authService = authService,
       _databaseHelper = databaseHelper,
       _imageStore = imageStore ?? createLocalImageStore(),
       _now = now ?? DateTime.now,
       _syncPendingCatalogCreates =
           syncPendingCatalogCreates ??
           (() => catalogRepository.syncPendingCatalogCreates()),
       _connectivityMonitor = ConnectivityMonitor(
         connectivity: connectivity,
         connectivityChanges: connectivityChanges,
         checkConnectivity: checkConnectivity,
         debounceDuration: connectivityDebounce,
       ),
       _pipeline = UploadPipeline(
         apiClient: apiClient,
         authService: authService,
         databaseHelper: databaseHelper,
         catalogRepository: catalogRepository,
         imageStore: imageStore,
         pollDelay: pollDelay,
         delay: delay,
         now: now,
       );

  // ── Lifecycle ──────────────────────────────────────────────────────

  /// Initialize connectivity monitoring.
  /// On start, checks connectivity and triggers sync if online.
  void initialize() {
    if (_disposed) return;
    _connectivityMonitor.start(
      onOnline: () {
        if (!_disposed) unawaited(_syncPendingCatalogsAndUploads());
      },
    );
  }

  /// Stop connectivity monitoring while logged out; can be initialized again.
  void stop() {
    _sessionGeneration++;
    _connectivityMonitor.stop();
  }

  /// Clean up subscriptions.
  void dispose() {
    stop();
    _disposed = true;
    _connectivityMonitor.dispose();
  }

  // ── Individual sync steps ─────────────────────────────────────────

  Future<StepInitResult> stepInit(PendingUpload upload) => _pipeline.stepInit(
    upload,
    session: _sessionGeneration,
    getSession: () => _sessionGeneration,
  );

  Future<PendingUpload> stepUploadOriginals(
    PendingUpload upload,
    List<String> localPaths,
    List<PresignedUploadUrl> presignedUrls,
  ) => _pipeline.stepUploadOriginals(
    upload,
    localPaths,
    presignedUrls,
    session: _sessionGeneration,
    getSession: () => _sessionGeneration,
  );

  Future<PendingUpload> stepComplete(PendingUpload upload) =>
      _pipeline.stepComplete(
        upload,
        session: _sessionGeneration,
        getSession: () => _sessionGeneration,
      );

  Future<PendingUpload> stepPollUntilReady({
    required PendingUpload upload,
    int maxPolls = 30,
    Duration pollInterval = const Duration(seconds: 2),
    Duration deadline = const Duration(minutes: 2),
  }) => _pipeline.stepPollUntilReady(
    upload: upload,
    maxPolls: maxPolls,
    pollInterval: pollInterval,
    deadline: deadline,
    session: _sessionGeneration,
    getSession: () => _sessionGeneration,
  );

  // ── Full sync orchestration ───────────────────────────────────────

  Future<PendingUpload> syncOne(PendingUpload upload) {
    return _runOnce(upload.id, () => _syncOne(upload));
  }

  Future<PendingUpload> _runOnce(
    String uploadId,
    Future<PendingUpload> Function() run,
  ) {
    if (_deletingUploads.contains(uploadId)) {
      return Future.error(const ApiException(409, 'Upload is being deleted'));
    }
    final active = _activeUploads[uploadId];
    if (active != null) return active;

    late final Future<PendingUpload> tracked;
    tracked = Future<PendingUpload>.sync(run).whenComplete(() {
      if (identical(_activeUploads[uploadId], tracked)) {
        _activeUploads.remove(uploadId);
      }
    });
    _activeUploads[uploadId] = tracked;
    return tracked;
  }

  Future<PendingUpload> _syncOne(PendingUpload upload) async {
    if (upload.status == PendingUploadStatus.draft) {
      throw const ApiException(
        409,
        'Finalize o rascunho antes de sincronizar.',
      );
    }
    final session = _sessionGeneration;
    final authGeneration = _authService.sessionGeneration;
    PendingUpload current = upload;
    List<PresignedUploadUrl> presignedUrls = [];
    void ensureSession() {
      if (session != _sessionGeneration ||
          _authService.currentUser == null ||
          authGeneration != _authService.sessionGeneration ||
          (upload.ownerId != null &&
              upload.ownerId != _authService.currentUser?.id)) {
        throw const ApiException(401, 'Sync stopped after logout');
      }
    }

    ensureSession();
    final needsInit =
        current.backendUploadId == null ||
        current.status == PendingUploadStatus.pending ||
        current.status == PendingUploadStatus.pendingMetadataSync ||
        current.status == PendingUploadStatus.failed;

    if (needsInit) {
      final initResult = await stepInit(current);
      ensureSession();
      current = initResult.upload;
      presignedUrls = initResult.presignedUrls;
    }

    // Step 2: upload originals (if not yet done)
    if (current.status == PendingUploadStatus.pending ||
        current.status == PendingUploadStatus.uploading) {
      if (presignedUrls.isEmpty) {
        throw const ApiException(
          500,
          'Cannot upload originals without presigned URLs from init',
        );
      }
      final localPaths = current.paths;
      current = current.copyWith(status: PendingUploadStatus.uploading);
      await _databaseHelper.updateUpload(current);

      ensureSession();
      current = await stepUploadOriginals(current, localPaths, presignedUrls);
      ensureSession();
    }

    // Handle crashed state after complete
    if (current.status == PendingUploadStatus.pendingMetadataSync &&
        current.backendStatus != 'finalizing' &&
        current.backendStatus != 'ready') {
      ensureSession();
      current = await stepComplete(current);
      ensureSession();
    }

    if (current.backendStatus == 'ready') {
      current = current.copyWith(
        status: PendingUploadStatus.completed,
        clearErrorMessage: true,
      );
      await _databaseHelper.updateUpload(current);
      return current;
    }

    // Step 4: poll
    if (current.backendStatus == 'finalizing' ||
        current.backendStatus == 'draft') {
      ensureSession();
      current = await stepPollUntilReady(upload: current);
    }

    return current;
  }

  /// Sync all pending, failed, and pendingMetadataSync uploads.
  Future<SyncAllResult> syncAll() async {
    if (_isSyncingAll) {
      return const SyncAllResult(
        totalAttempted: 0,
        successful: 0,
        failed: 0,
        message: 'Sync already in progress',
      );
    }

    _isSyncingAll = true;
    final session = _sessionGeneration;
    try {
      final uploads = await _databaseHelper.getPendingAndFailedUploads();
      if (session != _sessionGeneration || _authService.currentUser == null) {
        return const SyncAllResult(
          totalAttempted: 0,
          successful: 0,
          failed: 0,
          message: 'Sync stopped after logout',
        );
      }
      if (uploads.isEmpty) {
        return const SyncAllResult(
          totalAttempted: 0,
          successful: 0,
          failed: 0,
          message: 'Nothing to sync',
        );
      }

      int successful = 0;
      int failed = 0;
      final failures = <SyncFailure>[];

      for (final upload in uploads) {
        if (session != _sessionGeneration || _authService.currentUser == null) {
          break;
        }
        Object? syncError;
        PendingUpload? synced;
        try {
          if (_deletingUploads.contains(upload.id) ||
              await _databaseHelper.getUploadById(upload.id) == null) {
            continue;
          }
          if (session != _sessionGeneration ||
              _authService.currentUser == null) {
            break;
          }
          synced = await syncOne(upload);
        } catch (error, stack) {
          syncError = error;
          AppLogger.warning(
            'syncAll: upload ${upload.id} failed '
            '(attempt ${upload.syncAttemptCount + 1})',
            error,
            stack,
          );
        }

        if (syncError == null &&
            synced?.status == PendingUploadStatus.completed) {
          successful++;
          continue;
        }
        if (session != _sessionGeneration || _authService.currentUser == null) {
          break;
        }
        failed++;
        final current =
            await _databaseHelper.getUploadById(upload.id) ?? upload;
        final safe = _safeSyncFailure(syncError ?? const _BackendSyncFailure());
        final message = await _persistSyncFailure(
          current,
          syncError ?? const _BackendSyncFailure(),
          incrementAttempt:
              !(syncError is ApiException && syncError.statusCode == 412),
        );
        failures.add(
          SyncFailure(uploadId: upload.id, code: safe.code, message: message),
        );
      }

      return SyncAllResult(
        totalAttempted: uploads.length,
        successful: successful,
        failed: failed,
        message: failed > 0
            ? 'Synced $successful/${uploads.length} ($failed failed)'
            : 'All $successful uploads synced',
        failures: failures,
      );
    } finally {
      _isSyncingAll = false;
    }
  }

  // ── Download URL ────────────────────────────────────────────────────

  Future<DownloadUrlResponse> fetchDownloadUrl({
    required String uploadId,
    required String fileId,
  }) async {
    final token = await _authService.getValidAccessToken();
    if (token == null) throw const ApiException(401, 'Not authenticated');
    return _apiClient.getDownloadUrl(
      accessToken: token,
      uploadId: uploadId,
      fileId: fileId,
    );
  }

  Future<DownloadUrlResponse> fetchPreviewUrl({
    required String uploadId,
    required String fileId,
  }) async {
    final token = await _authService.getValidAccessToken();
    if (token == null) throw const ApiException(401, 'Not authenticated');
    return _apiClient.getPreviewUrl(
      accessToken: token,
      uploadId: uploadId,
      fileId: fileId,
    );
  }

  Future<void> deleteRemoteUpload(String uploadId) async {
    final token = await _authService.getValidAccessToken();
    if (token == null) throw const ApiException(401, 'Not authenticated');
    await _apiClient.deleteUpload(accessToken: token, uploadId: uploadId);
  }

  Future<void> deleteQueuedUpload(
    PendingUpload upload, {
    required bool deleteRemote,
  }) async {
    if (isUploadActive(upload.id)) {
      throw const ApiException(409, 'Upload is syncing');
    }
    final session = _sessionGeneration;
    final ownerId = _authService.currentUser?.id;
    _deletingUploads.add(upload.id);
    try {
      final current = await _databaseHelper.getUploadById(upload.id);
      if (current == null) return;
      if (session != _sessionGeneration ||
          _authService.currentUser?.id != ownerId) {
        throw const ApiException(401, 'Session changed');
      }
      if (deleteRemote && current.backendUploadId != null) {
        await deleteRemoteUpload(current.backendUploadId!);
      }
      if (session != _sessionGeneration ||
          _authService.currentUser?.id != ownerId) {
        throw const ApiException(401, 'Session changed');
      }
      await _databaseHelper.deleteUpload(current.id);
      for (final path in current.paths) {
        try {
          await _imageStore.deleteImage(path);
        } catch (_) {
          // Startup orphan cleanup retries images that could not be removed.
        }
      }
    } finally {
      _deletingUploads.remove(upload.id);
    }
  }

  Future<PendingUpload> retryUpload(PendingUpload upload) {
    if (upload.status == PendingUploadStatus.draft) {
      return Future.error(
        const ApiException(409, 'Finalize o rascunho antes de sincronizar.'),
      );
    }
    return _runOnce(upload.id, () async {
      final session = _sessionGeneration;
      final authGeneration = _authService.sessionGeneration;
      final reset = upload.copyWith(
        status: PendingUploadStatus.pending,
        clearBackendStatus: true,
        clearBackendError: true,
        clearErrorMessage: true,
      );
      await _databaseHelper.updateUpload(reset);
      try {
        return await _syncOne(reset);
      } catch (error) {
        if (session != _sessionGeneration ||
            authGeneration != _authService.sessionGeneration ||
            _authService.currentUser == null) {
          rethrow;
        }
        final current = await _databaseHelper.getUploadById(upload.id) ?? reset;
        await _persistSyncFailure(current, error, incrementAttempt: false);
        rethrow;
      }
    });
  }

  Future<String> _persistSyncFailure(
    PendingUpload current,
    Object error, {
    required bool incrementAttempt,
  }) async {
    final safe = _safeSyncFailure(error);
    final message =
        error is ApiException &&
            error.statusCode == 412 &&
            current.errorMessage?.isNotEmpty == true
        ? current.errorMessage!
        : safe.message;
    await _databaseHelper.updateUpload(
      current.copyWith(
        status: PendingUploadStatus.failed,
        errorMessage: message,
        syncErrorCode: safe.code,
        syncAttemptCount: incrementAttempt
            ? current.syncAttemptCount + 1
            : current.syncAttemptCount,
        lastSyncAttemptAt: incrementAttempt
            ? _now()
            : current.lastSyncAttemptAt,
      ),
    );
    return message;
  }

  // ── Remote upload list / detail ─────────────────────────────────────

  Future<List<UploadDetail>> fetchRemoteUploads({
    Map<String, String>? queryParams,
  }) async {
    final token = await _authService.getValidAccessToken();
    if (token == null) throw const ApiException(401, 'Not authenticated');
    return _apiClient.listUploads(accessToken: token, queryParams: queryParams);
  }

  Future<UploadDetail> fetchRemoteUploadDetail(String uploadId) async {
    final token = await _authService.getValidAccessToken();
    if (token == null) throw const ApiException(401, 'Not authenticated');
    return _apiClient.getUploadDetail(accessToken: token, uploadId: uploadId);
  }

  // ── Internal Helpers ───────────────────────────────────────────────

  Future<SyncAllResult?> syncPendingCatalogsAndUploads() {
    return _syncPendingCatalogsAndUploads();
  }

  Future<SyncAllResult?> _syncPendingCatalogsAndUploads() async {
    final session = _sessionGeneration;
    if (_isConnectivitySyncing) {
      _connectivitySyncQueued = true;
      return null;
    }
    _isConnectivitySyncing = true;
    try {
      SyncFailure? catalogFailure;
      try {
        await _syncPendingCatalogCreates();
      } catch (error, stack) {
        final safe = _safeSyncFailure(error);
        AppLogger.warning('Pending catalog create sync failed', error, stack);
        catalogFailure = const SyncFailure(
          uploadId: 'catalog-sync',
          code: 'CATALOG_SYNC_FAILED',
          message: 'Não foi possível sincronizar o catálogo. Tente novamente.',
        );
        if (safe.code == 'AUTH_REQUIRED') {
          catalogFailure = const SyncFailure(
            uploadId: 'catalog-sync',
            code: 'CATALOG_AUTH_REQUIRED',
            message: 'Sessão expirada. Entre novamente.',
          );
        }
      }
      if (session != _sessionGeneration || _authService.currentUser == null) {
        return null;
      }
      final result = await syncAll();
      if (catalogFailure == null) return result;
      return result.withCatalogFailure(catalogFailure);
    } finally {
      _isConnectivitySyncing = false;
      if (_connectivitySyncQueued && !_disposed) {
        _connectivitySyncQueued = false;
        unawaited(_syncPendingCatalogsAndUploads());
      }
    }
  }

  ({String code, String message}) _safeSyncFailure(Object error) {
    if (isConnectionError(error) || error is TimeoutException) {
      return (
        code: 'SYNC_NETWORK_UNREACHABLE',
        message:
            'Não foi possível acessar o armazenamento. Verifique a conexão e tente novamente.',
      );
    }
    if (error is _BackendSyncFailure) {
      return (
        code: 'SYNC_BACKEND_FAILED',
        message: 'O processamento da sincronização falhou. Tente novamente.',
      );
    }
    if (error is ApiException) {
      final code = error.statusCode == 401
          ? 'AUTH_REQUIRED'
          : 'SYNC_HTTP_${error.statusCode}';
      return (
        code: code,
        message: error.statusCode == 401
            ? 'Sessão expirada. Entre novamente.'
            : 'Servidor recusou a sincronização. Tente novamente.',
      );
    }
    if (isLocalFileError(error)) {
      return (
        code: 'LOCAL_FILE_UNAVAILABLE',
        message:
            'Arquivo local indisponível. Verifique a foto e tente novamente.',
      );
    }
    return (
      code: 'SYNC_FAILED',
      message: 'Não foi possível sincronizar. Tente novamente.',
    );
  }
}

class _BackendSyncFailure implements Exception {
  const _BackendSyncFailure();
}

class SyncAllResult {
  final int totalAttempted;
  final int successful;
  final int failed;
  final String message;
  final List<SyncFailure> failures;

  const SyncAllResult({
    required this.totalAttempted,
    required this.successful,
    required this.failed,
    required this.message,
    this.failures = const [],
  });

  SyncAllResult withCatalogFailure(SyncFailure failure) {
    return SyncAllResult(
      totalAttempted: totalAttempted,
      successful: successful,
      failed: failed,
      message: '$message; catalog sync failed',
      failures: [...failures, failure],
    );
  }
}

class SyncFailure {
  final String uploadId;
  final String code;
  final String message;

  const SyncFailure({
    required this.uploadId,
    required this.code,
    required this.message,
  });
}
