import 'dart:convert';

enum PendingCatalogEntityType { property, talhao, cropType, estadio }

class PendingCatalogCreate {
  static PendingCatalogEntityType _parseEntityType(String raw) {
    try {
      return PendingCatalogEntityType.values.byName(raw);
    } catch (_) {
      return PendingCatalogEntityType.property;
    }
  }

  final String tempId;
  final String? ownerId;
  final PendingCatalogEntityType entityType;
  final String payloadJson;
  final String normalizedName;
  final String? parentId;
  final DateTime createdAt;
  final String? errorMessage;

  const PendingCatalogCreate({
    required this.tempId,
    this.ownerId,
    required this.entityType,
    required this.payloadJson,
    required this.normalizedName,
    this.parentId,
    required this.createdAt,
    this.errorMessage,
  });

  Map<String, dynamic> toSqliteRow() => {
    'temp_id': tempId,
    'owner_id': ownerId,
    'entity_type': entityType.name,
    'payload_json': payloadJson,
    'normalized_name': normalizedName,
    'parent_id': parentId,
    'created_at': createdAt.millisecondsSinceEpoch,
    'error_message': errorMessage,
  };

  factory PendingCatalogCreate.fromSqliteRow(Map<String, dynamic> row) {
    return PendingCatalogCreate(
      tempId: row['temp_id'] as String,
      ownerId: row['owner_id'] as String?,
      entityType: PendingCatalogCreate._parseEntityType(
        row['entity_type'] as String,
      ),
      payloadJson: row['payload_json'] as String,
      normalizedName: row['normalized_name'] as String,
      parentId: row['parent_id'] as String?,
      createdAt: DateTime.fromMillisecondsSinceEpoch(row['created_at'] as int),
      errorMessage: row['error_message'] as String?,
    );
  }

  Map<String, dynamic> get payload =>
      jsonDecode(payloadJson) as Map<String, dynamic>;
}
