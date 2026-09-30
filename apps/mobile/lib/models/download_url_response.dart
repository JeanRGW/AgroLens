/// Response from `GET /uploads/:id/files/:fileId/download-url`.
class DownloadUrlResponse {
  final String url;
  final DateTime expiresAt;
  final String fileId;
  final String uploadId;

  const DownloadUrlResponse({
    required this.url,
    required this.expiresAt,
    required this.fileId,
    required this.uploadId,
  });

  factory DownloadUrlResponse.fromJson(Map<String, dynamic> json) {
    return DownloadUrlResponse(
      url: json['downloadUrl'] as String,
      expiresAt: DateTime.parse(json['expiresAt'] as String),
      fileId: json['fileId'] as String,
      uploadId: json['uploadId'] as String,
    );
  }
}
