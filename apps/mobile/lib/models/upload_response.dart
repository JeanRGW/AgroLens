/// A presigned URL returned by `/uploads/init` for uploading a file.
class PresignedUploadUrl {
  final String imageId;
  final String fileId;
  final String? objectKey;
  final String? url;
  final DateTime? expiresAt;
  final String? method;
  final Map<String, String> headers;

  const PresignedUploadUrl({
    required this.imageId,
    required this.fileId,
    this.objectKey,
    this.url,
    this.expiresAt,
    this.method,
    this.headers = const {},
  });

  factory PresignedUploadUrl.fromJson(Map<String, dynamic> json) {
    return PresignedUploadUrl(
      imageId: json['imageId'] as String,
      fileId: (json['fileId'] ?? json['id']) as String,
      objectKey: _asNullableString(json['objectKey'] ?? json['key']),
      url: _asNullableString(json['uploadUrl'] ?? json['url']),
      expiresAt: _parseDateTime(json['expiresAt']),
      method: _asNullableString(json['method']),
      headers: _parseHeaders(json['headers']),
    );
  }

  bool get requiresUpload {
    final uploadUrl = url?.trim() ?? '';
    if (uploadUrl.isEmpty) return false;
    final requestMethod = method?.trim().toUpperCase();
    return requestMethod == null ||
        requestMethod.isEmpty ||
        requestMethod == 'PUT';
  }

  static Map<String, String> _parseHeaders(dynamic raw) {
    if (raw is! Map) return const {};
    return raw.map((key, value) => MapEntry(key.toString(), value.toString()));
  }

  static String? _asNullableString(dynamic value) {
    if (value == null) return null;
    final text = value.toString();
    return text.isEmpty ? null : text;
  }

  static DateTime? _parseDateTime(dynamic value) {
    final text = _asNullableString(value);
    if (text == null) return null;
    return DateTime.parse(text);
  }
}

/// Response from `POST /uploads/init`.
class UploadInitResponse {
  final String uploadId;
  final String status; // draft
  final List<PresignedUploadUrl> presignedUrls;

  const UploadInitResponse({
    required this.uploadId,
    required this.status,
    required this.presignedUrls,
  });

  factory UploadInitResponse.fromJson(Map<String, dynamic> json) {
    final raw = json['files'] ?? json['presignedUrls'];
    final rawList = raw is List ? raw : const [];
    return UploadInitResponse(
      uploadId: json['uploadId'] as String,
      status: json['status'] as String,
      presignedUrls: rawList
          .map((e) => PresignedUploadUrl.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// Response from `POST /uploads/:id/complete`.
class UploadCompleteResponse {
  final String uploadId;
  final String status; // finalizing

  const UploadCompleteResponse({required this.uploadId, required this.status});

  factory UploadCompleteResponse.fromJson(Map<String, dynamic> json) {
    final upload = (json['upload'] ?? json) as Map<String, dynamic>;
    return UploadCompleteResponse(
      uploadId: (upload['id'] ?? upload['uploadId']) as String,
      status: upload['status'] as String,
    );
  }
}

/// File metadata within an upload detail.
class UploadFileInfo {
  final String id;
  final String imageId;
  final double? latitude;
  final double? longitude;
  final String variant;
  final String? objectKey;
  final String contentType;
  final int? sizeBytes;

  const UploadFileInfo({
    required this.id,
    required this.imageId,
    this.latitude,
    this.longitude,
    required this.variant,
    this.objectKey,
    required this.contentType,
    this.sizeBytes,
  });

  factory UploadFileInfo.fromJson(Map<String, dynamic> json) {
    return UploadFileInfo(
      id: json['id'] as String,
      imageId: json['imageId'] as String,
      latitude: (json['latitude'] as num?)?.toDouble(),
      longitude: (json['longitude'] as num?)?.toDouble(),
      variant: json['variant'] as String,
      objectKey: json['objectKey'] as String?,
      contentType: json['contentType'] as String,
      sizeBytes: json['sizeBytes'] as int?,
    );
  }
}

/// Upload detail from `GET /uploads/:id`.
class UploadDetail {
  final String id;
  final String status;
  final int fileCount;
  final String? errorMessage;
  final String propertyId;
  final String talhaoId;
  final String cropTypeId;
  final String? estadioId;
  final String source;
  final DateTime activityDate;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? previewFileId;
  final int previewCount;
  final List<UploadFileInfo> files;

  const UploadDetail({
    required this.id,
    required this.status,
    this.fileCount = 0,
    this.errorMessage,
    required this.propertyId,
    required this.talhaoId,
    required this.cropTypeId,
    this.estadioId,
    required this.source,
    required this.activityDate,
    required this.createdAt,
    required this.updatedAt,
    this.previewFileId,
    this.previewCount = 0,
    required this.files,
  });

  factory UploadDetail.fromJson(Map<String, dynamic> json) {
    return UploadDetail(
      id: json['id'] as String,
      status: json['status'] as String,
      fileCount:
          (json['fileCount'] as num?)?.toInt() ??
          ((json['files'] as List<dynamic>?) ?? const [])
              .where(
                (file) =>
                    file is Map<String, dynamic> &&
                    file['variant'] == 'original',
              )
              .length,

      errorMessage: json['errorMessage'] as String?,
      propertyId: json['propertyId'] as String,
      talhaoId: json['talhaoId'] as String,
      cropTypeId: json['cropTypeId'] as String,
      estadioId: json['estadioId'] as String?,
      source: json['source'] as String,
      activityDate: DateTime.parse(json['activityDate'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      previewFileId: json['previewFileId'] as String?,
      previewCount:
          (json['previewCount'] as num?)?.toInt() ??
          (json['previewFileId'] == null ? 0 : 1),
      files:
          (json['files'] as List<dynamic>?)
              ?.map((e) => UploadFileInfo.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}
