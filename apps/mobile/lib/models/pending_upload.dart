import 'dart:convert';

/// Local pending upload statuses matching the backend flow.
///
/// Status flow:
/// - pending        → waiting to call /uploads/init or upload originals
/// - uploading      → uploading originals to object storage
/// - pendingMetadataSync → waiting to call /uploads/:id/complete
/// - completed      → backend returned finalized ready upload
/// - failed         → retryable failure
enum PendingUploadStatus {
  pending,
  uploading,
  pendingMetadataSync,
  completed,
  failed,
}

/// Local pending upload record stored in SQLite.
class PendingUpload {
  static PendingUploadStatus _parseStatus(String raw) {
    try {
      return PendingUploadStatus.values.byName(raw);
    } catch (_) {
      return PendingUploadStatus.pending;
    }
  }

  final String id; // clientUploadId (UUID v4)
  final String? ownerId;
  final List<String> paths;
  final double latitude;
  final double longitude;
  final DateTime createdAt;
  final DateTime activityDate;
  final PendingUploadStatus status;
  final String? errorMessage;
  final String? propertyId;
  final String? talhaoId;
  final String? cropTypeId;
  final String? estadioId;
  final String? source;
  final String? backendUploadId; // Backend upload UUID after /uploads/init
  final String? backendStatus; // Backend upload status for polling
  final String? backendError; // Backend error message
  final String? syncErrorCode;
  final int syncAttemptCount;
  final DateTime? lastSyncAttemptAt;

  /// JSON-encoded representation of [paths] for backwards compatibility / SQLite.
  String get imagePaths => jsonEncode(paths);

  PendingUpload({
    required this.id,
    this.ownerId,
    List<String>? paths,
    String? imagePaths,
    required this.latitude,
    required this.longitude,
    required this.createdAt,
    DateTime? activityDate,
    this.status = PendingUploadStatus.pending,
    this.errorMessage,
    this.propertyId,
    this.talhaoId,
    this.cropTypeId,
    this.estadioId,
    this.source,
    this.backendUploadId,
    this.backendStatus,
    this.backendError,
    this.syncErrorCode,
    this.syncAttemptCount = 0,
    this.lastSyncAttemptAt,
  }) : paths = paths ?? _decodePaths(imagePaths),
       activityDate = activityDate ?? createdAt;

  static List<String> _decodePaths(String? raw) {
    if (raw == null || raw.trim().isEmpty) return const [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is List) {
        return decoded.map((e) => e.toString()).toList();
      }
      return const [];
    } catch (_) {
      return const [];
    }
  }

  PendingUpload copyWith({
    String? id,
    String? ownerIdOverride,
    List<String>? paths,
    String? imagePaths,
    double? latitude,
    double? longitude,
    DateTime? createdAt,
    DateTime? activityDate,
    PendingUploadStatus? status,
    String? errorMessage,
    String? propertyId,
    String? talhaoId,
    String? cropTypeId,
    String? estadioId,
    String? source,
    String? backendUploadId,
    String? backendStatus,
    String? backendError,
    String? syncErrorCode,
    int? syncAttemptCount,
    DateTime? lastSyncAttemptAt,
    bool clearErrorMessage = false,
    bool clearBackendStatus = false,
    bool clearBackendError = false,
    bool clearSyncErrorCode = false,
  }) {
    return PendingUpload(
      id: id ?? this.id,
      ownerId: ownerIdOverride ?? ownerId,
      paths:
          paths ?? (imagePaths != null ? _decodePaths(imagePaths) : this.paths),
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      createdAt: createdAt ?? this.createdAt,
      activityDate: activityDate ?? this.activityDate,
      status: status ?? this.status,
      errorMessage: clearErrorMessage
          ? null
          : (errorMessage ?? this.errorMessage),
      propertyId: propertyId ?? this.propertyId,
      talhaoId: talhaoId ?? this.talhaoId,
      cropTypeId: cropTypeId ?? this.cropTypeId,
      estadioId: estadioId ?? this.estadioId,
      source: source ?? this.source,
      backendUploadId: backendUploadId ?? this.backendUploadId,
      backendStatus: clearBackendStatus
          ? null
          : (backendStatus ?? this.backendStatus),
      backendError: clearBackendError
          ? null
          : (backendError ?? this.backendError),
      syncErrorCode: clearSyncErrorCode
          ? null
          : (syncErrorCode ?? this.syncErrorCode),
      syncAttemptCount: syncAttemptCount ?? this.syncAttemptCount,
      lastSyncAttemptAt: lastSyncAttemptAt ?? this.lastSyncAttemptAt,
    );
  }

  Map<String, dynamic> toSqliteRow() => {
    'id': id,
    'owner_id': ownerId,
    'image_paths': imagePaths,
    'latitude': latitude,
    'longitude': longitude,
    'created_at': createdAt.millisecondsSinceEpoch,
    'activity_date': activityDate.millisecondsSinceEpoch,
    'status': status.name,
    'error_message': errorMessage,
    'property_id': propertyId,
    'talhao_id': talhaoId,
    'crop_type_id': cropTypeId,
    'estadio_id': estadioId,
    'source': source,
    'backend_upload_id': backendUploadId,
    'backend_status': backendStatus,
    'backend_error': backendError,
    'sync_error_code': syncErrorCode,
    'sync_attempt_count': syncAttemptCount,
    'last_sync_attempt_at': lastSyncAttemptAt?.millisecondsSinceEpoch,
  };

  factory PendingUpload.fromSqliteRow(Map<String, dynamic> row) {
    return PendingUpload(
      id: row['id'] as String,
      ownerId: row['owner_id'] as String?,
      imagePaths: row['image_paths'] as String,
      latitude: (row['latitude'] as num).toDouble(),
      longitude: (row['longitude'] as num).toDouble(),
      createdAt: DateTime.fromMillisecondsSinceEpoch(row['created_at'] as int),
      activityDate: DateTime.fromMillisecondsSinceEpoch(
        (row['activity_date'] as int?) ?? (row['created_at'] as int),
      ),
      status: PendingUpload._parseStatus(row['status'] as String),
      errorMessage: row['error_message'] as String?,
      propertyId: row['property_id'] as String?,
      talhaoId: row['talhao_id'] as String?,
      cropTypeId: row['crop_type_id'] as String?,
      estadioId: row['estadio_id'] as String?,
      source: row['source'] as String?,
      backendUploadId: row['backend_upload_id'] as String?,
      backendStatus: row['backend_status'] as String?,
      backendError: row['backend_error'] as String?,
      syncErrorCode: row['sync_error_code'] as String?,
      syncAttemptCount: (row['sync_attempt_count'] as int?) ?? 0,
      lastSyncAttemptAt: row['last_sync_attempt_at'] == null
          ? null
          : DateTime.fromMillisecondsSinceEpoch(
              row['last_sync_attempt_at'] as int,
            ),
    );
  }
}
