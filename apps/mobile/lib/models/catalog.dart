/// Base catalog item from the backend API.
class CatalogItem {
  final String id;
  final String name;
  final String userId;
  final DateTime createdAt;
  final DateTime updatedAt;
  final bool isPendingSync;
  final String? syncError;

  const CatalogItem({
    required this.id,
    required this.name,
    required this.userId,
    required this.createdAt,
    required this.updatedAt,
    this.isPendingSync = false,
    this.syncError,
  });

  factory CatalogItem.fromJson(Map<String, dynamic> json) {
    return CatalogItem(
      id: json['id'] as String,
      name: json['name'] as String,
      userId: json['userId'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      isPendingSync: json['isPendingSync'] as bool? ?? false,
      syncError: json['syncError'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'userId': userId,
    'createdAt': createdAt.toIso8601String(),
    'updatedAt': updatedAt.toIso8601String(),
    'isPendingSync': isPendingSync,
    if (syncError != null) 'syncError': syncError,
  };
}

/// Property with additional fields.
class Property extends CatalogItem {
  final String owner;
  final String address;
  final double latitude;
  final double longitude;

  const Property({
    required super.id,
    required super.name,
    required super.userId,
    required super.createdAt,
    required super.updatedAt,
    super.isPendingSync,
    super.syncError,
    required this.owner,
    required this.address,
    required this.latitude,
    required this.longitude,
  });

  factory Property.fromJson(Map<String, dynamic> json) {
    return Property(
      id: json['id'] as String,
      name: json['name'] as String,
      userId: json['userId'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      isPendingSync: json['isPendingSync'] as bool? ?? false,
      syncError: json['syncError'] as String?,
      owner: json['owner'] as String,
      address: json['address'] as String,
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
    );
  }

  @override
  Map<String, dynamic> toJson() => {
    ...super.toJson(),
    'owner': owner,
    'address': address,
    'latitude': latitude,
    'longitude': longitude,
  };
}

/// Talhao (field/plot) with property reference.
class Talhao extends CatalogItem {
  final String propertyId;

  const Talhao({
    required super.id,
    required super.name,
    required super.userId,
    required super.createdAt,
    required super.updatedAt,
    super.isPendingSync,
    super.syncError,
    required this.propertyId,
  });

  factory Talhao.fromJson(Map<String, dynamic> json) {
    return Talhao(
      id: json['id'] as String,
      name: json['name'] as String,
      userId: json['userId'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      isPendingSync: json['isPendingSync'] as bool? ?? false,
      syncError: json['syncError'] as String?,
      propertyId: json['propertyId'] as String,
    );
  }

  @override
  Map<String, dynamic> toJson() => {
    ...super.toJson(),
    'propertyId': propertyId,
  };
}

/// Crop type (e.g. Soja, Milho).
class CropType extends CatalogItem {
  const CropType({
    required super.id,
    required super.name,
    required super.userId,
    required super.createdAt,
    required super.updatedAt,
    super.isPendingSync,
    super.syncError,
  });

  factory CropType.fromJson(Map<String, dynamic> json) {
    return CropType(
      id: json['id'] as String,
      name: json['name'] as String,
      userId: json['userId'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      isPendingSync: json['isPendingSync'] as bool? ?? false,
      syncError: json['syncError'] as String?,
    );
  }
}

/// Estadio (growth stage) with crop type reference.
class Estadio extends CatalogItem {
  final String cropTypeId;

  const Estadio({
    required super.id,
    required super.name,
    required super.userId,
    required super.createdAt,
    required super.updatedAt,
    super.isPendingSync,
    super.syncError,
    required this.cropTypeId,
  });

  factory Estadio.fromJson(Map<String, dynamic> json) {
    return Estadio(
      id: json['id'] as String,
      name: json['name'] as String,
      userId: json['userId'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      isPendingSync: json['isPendingSync'] as bool? ?? false,
      syncError: json['syncError'] as String?,
      cropTypeId: json['cropTypeId'] as String,
    );
  }

  @override
  Map<String, dynamic> toJson() => {
    ...super.toJson(),
    'cropTypeId': cropTypeId,
  };
}
