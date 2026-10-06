typedef Json = Map<String, dynamic>;

class InferenceModel {
  final String id, name;
  final List<InferenceClass> classes;
  InferenceModel.fromJson(Json json)
    : id = json['id'] as String,
      name = json['name'] as String,
      classes = (json['classes'] as List? ?? [])
          .map((e) => InferenceClass.fromJson(e as Json))
          .toList();
}

class InferenceClass {
  final int id;
  final String name;
  InferenceClass.fromJson(Json json)
    : id = json['id'] as int,
      name = json['name'] as String;
}

class InferenceJob {
  final String id, status, sourceType, modelName;
  final int imageCount, completedCount, failedCount;
  final DateTime createdAt;
  final DateTime? expiresAt;
  final String? errorMessage;
  final List<InferenceImage> images;
  bool get active => ['uploading', 'queued', 'running'].contains(status);
  InferenceJob.fromJson(Json json)
    : id = json['id'] as String,
      status = json['status'] as String,
      sourceType = json['sourceType'] as String,
      modelName =
          (json['modelSnapshot'] as Json?)?['name'] as String? ??
          'Modelo indisponível',
      imageCount = json['imageCount'] as int,
      completedCount = json['completedCount'] as int,
      failedCount = json['failedCount'] as int,
      createdAt = DateTime.parse(json['createdAt'] as String),
      expiresAt = json['expiresAt'] == null
          ? null
          : DateTime.parse(json['expiresAt'] as String),
      errorMessage = json['errorMessage'] as String?,
      images = (json['images'] as List? ?? [])
          .map((e) => InferenceImage.fromJson(e as Json))
          .toList();
}

class InferenceImage {
  final String id, fileName, status;
  InferenceImage.fromJson(Json json)
    : id = json['id'] as String,
      fileName = json['fileName'] as String,
      status = json['status'] as String;
}

class Detection {
  final int classId;
  final String className;
  final double confidence, xCenter, yCenter, width, height;
  Detection.fromJson(Json json)
    : classId = json['classId'] as int,
      className = json['className'] as String,
      confidence = (json['confidence'] as num).toDouble(),
      xCenter = (json['xCenter'] as num).toDouble(),
      yCenter = (json['yCenter'] as num).toDouble(),
      width = (json['width'] as num).toDouble(),
      height = (json['height'] as num).toDouble();
}

class InferenceResult {
  final Json json;
  final String id, imageUrl;
  final List<Detection> detections;
  InferenceResult.fromJson(this.json)
    : id = json['id'] as String,
      imageUrl = json['imageUrl'] as String,
      detections = (json['detections'] as List? ?? [])
          .map((e) => Detection.fromJson(e as Json))
          .toList();
}

String inferenceStatus(String status) => switch (status) {
  'uploading' => 'Enviando',
  'queued' => 'Na fila',
  'running' => 'Executando',
  'completed' => 'Concluído',
  'failed' => 'Falhou',
  _ => status,
};
