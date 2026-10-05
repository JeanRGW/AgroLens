// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_database.dart';

// ignore_for_file: type=lint
class PendingUploads extends Table
    with TableInfo<PendingUploads, PendingUpload> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  PendingUploads(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'PRIMARY KEY NOT NULL',
  );
  static const VerificationMeta _ownerIdMeta = const VerificationMeta(
    'ownerId',
  );
  late final GeneratedColumn<String> ownerId = GeneratedColumn<String>(
    'owner_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _imagesJsonMeta = const VerificationMeta(
    'imagesJson',
  );
  late final GeneratedColumn<String> imagesJson = GeneratedColumn<String>(
    'images_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _activityDateMeta = const VerificationMeta(
    'activityDate',
  );
  late final GeneratedColumn<int> activityDate = GeneratedColumn<int>(
    'activity_date',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _errorMessageMeta = const VerificationMeta(
    'errorMessage',
  );
  late final GeneratedColumn<String> errorMessage = GeneratedColumn<String>(
    'error_message',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    $customConstraints: '',
  );
  static const VerificationMeta _propertyIdMeta = const VerificationMeta(
    'propertyId',
  );
  late final GeneratedColumn<String> propertyId = GeneratedColumn<String>(
    'property_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    $customConstraints: '',
  );
  static const VerificationMeta _talhaoIdMeta = const VerificationMeta(
    'talhaoId',
  );
  late final GeneratedColumn<String> talhaoId = GeneratedColumn<String>(
    'talhao_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    $customConstraints: '',
  );
  static const VerificationMeta _cropTypeIdMeta = const VerificationMeta(
    'cropTypeId',
  );
  late final GeneratedColumn<String> cropTypeId = GeneratedColumn<String>(
    'crop_type_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    $customConstraints: '',
  );
  static const VerificationMeta _estadioIdMeta = const VerificationMeta(
    'estadioId',
  );
  late final GeneratedColumn<String> estadioId = GeneratedColumn<String>(
    'estadio_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    $customConstraints: '',
  );
  static const VerificationMeta _sourceMeta = const VerificationMeta('source');
  late final GeneratedColumn<String> source = GeneratedColumn<String>(
    'source',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    $customConstraints: '',
  );
  static const VerificationMeta _backendUploadIdMeta = const VerificationMeta(
    'backendUploadId',
  );
  late final GeneratedColumn<String> backendUploadId = GeneratedColumn<String>(
    'backend_upload_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    $customConstraints: '',
  );
  static const VerificationMeta _backendStatusMeta = const VerificationMeta(
    'backendStatus',
  );
  late final GeneratedColumn<String> backendStatus = GeneratedColumn<String>(
    'backend_status',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    $customConstraints: '',
  );
  static const VerificationMeta _backendErrorMeta = const VerificationMeta(
    'backendError',
  );
  late final GeneratedColumn<String> backendError = GeneratedColumn<String>(
    'backend_error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    $customConstraints: '',
  );
  static const VerificationMeta _syncErrorCodeMeta = const VerificationMeta(
    'syncErrorCode',
  );
  late final GeneratedColumn<String> syncErrorCode = GeneratedColumn<String>(
    'sync_error_code',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    $customConstraints: '',
  );
  static const VerificationMeta _syncAttemptCountMeta = const VerificationMeta(
    'syncAttemptCount',
  );
  late final GeneratedColumn<int> syncAttemptCount = GeneratedColumn<int>(
    'sync_attempt_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    $customConstraints: 'NOT NULL DEFAULT 0',
    defaultValue: const CustomExpression('0'),
  );
  static const VerificationMeta _lastSyncAttemptAtMeta = const VerificationMeta(
    'lastSyncAttemptAt',
  );
  late final GeneratedColumn<int> lastSyncAttemptAt = GeneratedColumn<int>(
    'last_sync_attempt_at',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    $customConstraints: '',
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    ownerId,
    imagesJson,
    createdAt,
    activityDate,
    status,
    errorMessage,
    propertyId,
    talhaoId,
    cropTypeId,
    estadioId,
    source,
    backendUploadId,
    backendStatus,
    backendError,
    syncErrorCode,
    syncAttemptCount,
    lastSyncAttemptAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'pending_uploads';
  @override
  VerificationContext validateIntegrity(
    Insertable<PendingUpload> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('owner_id')) {
      context.handle(
        _ownerIdMeta,
        ownerId.isAcceptableOrUnknown(data['owner_id']!, _ownerIdMeta),
      );
    } else if (isInserting) {
      context.missing(_ownerIdMeta);
    }
    if (data.containsKey('images_json')) {
      context.handle(
        _imagesJsonMeta,
        imagesJson.isAcceptableOrUnknown(data['images_json']!, _imagesJsonMeta),
      );
    } else if (isInserting) {
      context.missing(_imagesJsonMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('activity_date')) {
      context.handle(
        _activityDateMeta,
        activityDate.isAcceptableOrUnknown(
          data['activity_date']!,
          _activityDateMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_activityDateMeta);
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    } else if (isInserting) {
      context.missing(_statusMeta);
    }
    if (data.containsKey('error_message')) {
      context.handle(
        _errorMessageMeta,
        errorMessage.isAcceptableOrUnknown(
          data['error_message']!,
          _errorMessageMeta,
        ),
      );
    }
    if (data.containsKey('property_id')) {
      context.handle(
        _propertyIdMeta,
        propertyId.isAcceptableOrUnknown(data['property_id']!, _propertyIdMeta),
      );
    }
    if (data.containsKey('talhao_id')) {
      context.handle(
        _talhaoIdMeta,
        talhaoId.isAcceptableOrUnknown(data['talhao_id']!, _talhaoIdMeta),
      );
    }
    if (data.containsKey('crop_type_id')) {
      context.handle(
        _cropTypeIdMeta,
        cropTypeId.isAcceptableOrUnknown(
          data['crop_type_id']!,
          _cropTypeIdMeta,
        ),
      );
    }
    if (data.containsKey('estadio_id')) {
      context.handle(
        _estadioIdMeta,
        estadioId.isAcceptableOrUnknown(data['estadio_id']!, _estadioIdMeta),
      );
    }
    if (data.containsKey('source')) {
      context.handle(
        _sourceMeta,
        source.isAcceptableOrUnknown(data['source']!, _sourceMeta),
      );
    }
    if (data.containsKey('backend_upload_id')) {
      context.handle(
        _backendUploadIdMeta,
        backendUploadId.isAcceptableOrUnknown(
          data['backend_upload_id']!,
          _backendUploadIdMeta,
        ),
      );
    }
    if (data.containsKey('backend_status')) {
      context.handle(
        _backendStatusMeta,
        backendStatus.isAcceptableOrUnknown(
          data['backend_status']!,
          _backendStatusMeta,
        ),
      );
    }
    if (data.containsKey('backend_error')) {
      context.handle(
        _backendErrorMeta,
        backendError.isAcceptableOrUnknown(
          data['backend_error']!,
          _backendErrorMeta,
        ),
      );
    }
    if (data.containsKey('sync_error_code')) {
      context.handle(
        _syncErrorCodeMeta,
        syncErrorCode.isAcceptableOrUnknown(
          data['sync_error_code']!,
          _syncErrorCodeMeta,
        ),
      );
    }
    if (data.containsKey('sync_attempt_count')) {
      context.handle(
        _syncAttemptCountMeta,
        syncAttemptCount.isAcceptableOrUnknown(
          data['sync_attempt_count']!,
          _syncAttemptCountMeta,
        ),
      );
    }
    if (data.containsKey('last_sync_attempt_at')) {
      context.handle(
        _lastSyncAttemptAtMeta,
        lastSyncAttemptAt.isAcceptableOrUnknown(
          data['last_sync_attempt_at']!,
          _lastSyncAttemptAtMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  PendingUpload map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return PendingUpload(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      ownerId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}owner_id'],
      )!,
      imagesJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}images_json'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
      activityDate: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}activity_date'],
      )!,
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      errorMessage: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}error_message'],
      ),
      propertyId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}property_id'],
      ),
      talhaoId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}talhao_id'],
      ),
      cropTypeId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}crop_type_id'],
      ),
      estadioId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}estadio_id'],
      ),
      source: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}source'],
      ),
      backendUploadId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}backend_upload_id'],
      ),
      backendStatus: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}backend_status'],
      ),
      backendError: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}backend_error'],
      ),
      syncErrorCode: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sync_error_code'],
      ),
      syncAttemptCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}sync_attempt_count'],
      )!,
      lastSyncAttemptAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}last_sync_attempt_at'],
      ),
    );
  }

  @override
  PendingUploads createAlias(String alias) {
    return PendingUploads(attachedDatabase, alias);
  }

  @override
  bool get dontWriteConstraints => true;
}

class PendingUpload extends DataClass implements Insertable<PendingUpload> {
  final String id;
  final String ownerId;
  final String imagesJson;
  final int createdAt;
  final int activityDate;
  final String status;
  final String? errorMessage;
  final String? propertyId;
  final String? talhaoId;
  final String? cropTypeId;
  final String? estadioId;
  final String? source;
  final String? backendUploadId;
  final String? backendStatus;
  final String? backendError;
  final String? syncErrorCode;
  final int syncAttemptCount;
  final int? lastSyncAttemptAt;
  const PendingUpload({
    required this.id,
    required this.ownerId,
    required this.imagesJson,
    required this.createdAt,
    required this.activityDate,
    required this.status,
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
    required this.syncAttemptCount,
    this.lastSyncAttemptAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['owner_id'] = Variable<String>(ownerId);
    map['images_json'] = Variable<String>(imagesJson);
    map['created_at'] = Variable<int>(createdAt);
    map['activity_date'] = Variable<int>(activityDate);
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || errorMessage != null) {
      map['error_message'] = Variable<String>(errorMessage);
    }
    if (!nullToAbsent || propertyId != null) {
      map['property_id'] = Variable<String>(propertyId);
    }
    if (!nullToAbsent || talhaoId != null) {
      map['talhao_id'] = Variable<String>(talhaoId);
    }
    if (!nullToAbsent || cropTypeId != null) {
      map['crop_type_id'] = Variable<String>(cropTypeId);
    }
    if (!nullToAbsent || estadioId != null) {
      map['estadio_id'] = Variable<String>(estadioId);
    }
    if (!nullToAbsent || source != null) {
      map['source'] = Variable<String>(source);
    }
    if (!nullToAbsent || backendUploadId != null) {
      map['backend_upload_id'] = Variable<String>(backendUploadId);
    }
    if (!nullToAbsent || backendStatus != null) {
      map['backend_status'] = Variable<String>(backendStatus);
    }
    if (!nullToAbsent || backendError != null) {
      map['backend_error'] = Variable<String>(backendError);
    }
    if (!nullToAbsent || syncErrorCode != null) {
      map['sync_error_code'] = Variable<String>(syncErrorCode);
    }
    map['sync_attempt_count'] = Variable<int>(syncAttemptCount);
    if (!nullToAbsent || lastSyncAttemptAt != null) {
      map['last_sync_attempt_at'] = Variable<int>(lastSyncAttemptAt);
    }
    return map;
  }

  PendingUploadsCompanion toCompanion(bool nullToAbsent) {
    return PendingUploadsCompanion(
      id: Value(id),
      ownerId: Value(ownerId),
      imagesJson: Value(imagesJson),
      createdAt: Value(createdAt),
      activityDate: Value(activityDate),
      status: Value(status),
      errorMessage: errorMessage == null && nullToAbsent
          ? const Value.absent()
          : Value(errorMessage),
      propertyId: propertyId == null && nullToAbsent
          ? const Value.absent()
          : Value(propertyId),
      talhaoId: talhaoId == null && nullToAbsent
          ? const Value.absent()
          : Value(talhaoId),
      cropTypeId: cropTypeId == null && nullToAbsent
          ? const Value.absent()
          : Value(cropTypeId),
      estadioId: estadioId == null && nullToAbsent
          ? const Value.absent()
          : Value(estadioId),
      source: source == null && nullToAbsent
          ? const Value.absent()
          : Value(source),
      backendUploadId: backendUploadId == null && nullToAbsent
          ? const Value.absent()
          : Value(backendUploadId),
      backendStatus: backendStatus == null && nullToAbsent
          ? const Value.absent()
          : Value(backendStatus),
      backendError: backendError == null && nullToAbsent
          ? const Value.absent()
          : Value(backendError),
      syncErrorCode: syncErrorCode == null && nullToAbsent
          ? const Value.absent()
          : Value(syncErrorCode),
      syncAttemptCount: Value(syncAttemptCount),
      lastSyncAttemptAt: lastSyncAttemptAt == null && nullToAbsent
          ? const Value.absent()
          : Value(lastSyncAttemptAt),
    );
  }

  factory PendingUpload.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return PendingUpload(
      id: serializer.fromJson<String>(json['id']),
      ownerId: serializer.fromJson<String>(json['owner_id']),
      imagesJson: serializer.fromJson<String>(json['images_json']),
      createdAt: serializer.fromJson<int>(json['created_at']),
      activityDate: serializer.fromJson<int>(json['activity_date']),
      status: serializer.fromJson<String>(json['status']),
      errorMessage: serializer.fromJson<String?>(json['error_message']),
      propertyId: serializer.fromJson<String?>(json['property_id']),
      talhaoId: serializer.fromJson<String?>(json['talhao_id']),
      cropTypeId: serializer.fromJson<String?>(json['crop_type_id']),
      estadioId: serializer.fromJson<String?>(json['estadio_id']),
      source: serializer.fromJson<String?>(json['source']),
      backendUploadId: serializer.fromJson<String?>(json['backend_upload_id']),
      backendStatus: serializer.fromJson<String?>(json['backend_status']),
      backendError: serializer.fromJson<String?>(json['backend_error']),
      syncErrorCode: serializer.fromJson<String?>(json['sync_error_code']),
      syncAttemptCount: serializer.fromJson<int>(json['sync_attempt_count']),
      lastSyncAttemptAt: serializer.fromJson<int?>(
        json['last_sync_attempt_at'],
      ),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'owner_id': serializer.toJson<String>(ownerId),
      'images_json': serializer.toJson<String>(imagesJson),
      'created_at': serializer.toJson<int>(createdAt),
      'activity_date': serializer.toJson<int>(activityDate),
      'status': serializer.toJson<String>(status),
      'error_message': serializer.toJson<String?>(errorMessage),
      'property_id': serializer.toJson<String?>(propertyId),
      'talhao_id': serializer.toJson<String?>(talhaoId),
      'crop_type_id': serializer.toJson<String?>(cropTypeId),
      'estadio_id': serializer.toJson<String?>(estadioId),
      'source': serializer.toJson<String?>(source),
      'backend_upload_id': serializer.toJson<String?>(backendUploadId),
      'backend_status': serializer.toJson<String?>(backendStatus),
      'backend_error': serializer.toJson<String?>(backendError),
      'sync_error_code': serializer.toJson<String?>(syncErrorCode),
      'sync_attempt_count': serializer.toJson<int>(syncAttemptCount),
      'last_sync_attempt_at': serializer.toJson<int?>(lastSyncAttemptAt),
    };
  }

  PendingUpload copyWith({
    String? id,
    String? ownerId,
    String? imagesJson,
    int? createdAt,
    int? activityDate,
    String? status,
    Value<String?> errorMessage = const Value.absent(),
    Value<String?> propertyId = const Value.absent(),
    Value<String?> talhaoId = const Value.absent(),
    Value<String?> cropTypeId = const Value.absent(),
    Value<String?> estadioId = const Value.absent(),
    Value<String?> source = const Value.absent(),
    Value<String?> backendUploadId = const Value.absent(),
    Value<String?> backendStatus = const Value.absent(),
    Value<String?> backendError = const Value.absent(),
    Value<String?> syncErrorCode = const Value.absent(),
    int? syncAttemptCount,
    Value<int?> lastSyncAttemptAt = const Value.absent(),
  }) => PendingUpload(
    id: id ?? this.id,
    ownerId: ownerId ?? this.ownerId,
    imagesJson: imagesJson ?? this.imagesJson,
    createdAt: createdAt ?? this.createdAt,
    activityDate: activityDate ?? this.activityDate,
    status: status ?? this.status,
    errorMessage: errorMessage.present ? errorMessage.value : this.errorMessage,
    propertyId: propertyId.present ? propertyId.value : this.propertyId,
    talhaoId: talhaoId.present ? talhaoId.value : this.talhaoId,
    cropTypeId: cropTypeId.present ? cropTypeId.value : this.cropTypeId,
    estadioId: estadioId.present ? estadioId.value : this.estadioId,
    source: source.present ? source.value : this.source,
    backendUploadId: backendUploadId.present
        ? backendUploadId.value
        : this.backendUploadId,
    backendStatus: backendStatus.present
        ? backendStatus.value
        : this.backendStatus,
    backendError: backendError.present ? backendError.value : this.backendError,
    syncErrorCode: syncErrorCode.present
        ? syncErrorCode.value
        : this.syncErrorCode,
    syncAttemptCount: syncAttemptCount ?? this.syncAttemptCount,
    lastSyncAttemptAt: lastSyncAttemptAt.present
        ? lastSyncAttemptAt.value
        : this.lastSyncAttemptAt,
  );
  PendingUpload copyWithCompanion(PendingUploadsCompanion data) {
    return PendingUpload(
      id: data.id.present ? data.id.value : this.id,
      ownerId: data.ownerId.present ? data.ownerId.value : this.ownerId,
      imagesJson: data.imagesJson.present
          ? data.imagesJson.value
          : this.imagesJson,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      activityDate: data.activityDate.present
          ? data.activityDate.value
          : this.activityDate,
      status: data.status.present ? data.status.value : this.status,
      errorMessage: data.errorMessage.present
          ? data.errorMessage.value
          : this.errorMessage,
      propertyId: data.propertyId.present
          ? data.propertyId.value
          : this.propertyId,
      talhaoId: data.talhaoId.present ? data.talhaoId.value : this.talhaoId,
      cropTypeId: data.cropTypeId.present
          ? data.cropTypeId.value
          : this.cropTypeId,
      estadioId: data.estadioId.present ? data.estadioId.value : this.estadioId,
      source: data.source.present ? data.source.value : this.source,
      backendUploadId: data.backendUploadId.present
          ? data.backendUploadId.value
          : this.backendUploadId,
      backendStatus: data.backendStatus.present
          ? data.backendStatus.value
          : this.backendStatus,
      backendError: data.backendError.present
          ? data.backendError.value
          : this.backendError,
      syncErrorCode: data.syncErrorCode.present
          ? data.syncErrorCode.value
          : this.syncErrorCode,
      syncAttemptCount: data.syncAttemptCount.present
          ? data.syncAttemptCount.value
          : this.syncAttemptCount,
      lastSyncAttemptAt: data.lastSyncAttemptAt.present
          ? data.lastSyncAttemptAt.value
          : this.lastSyncAttemptAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('PendingUpload(')
          ..write('id: $id, ')
          ..write('ownerId: $ownerId, ')
          ..write('imagesJson: $imagesJson, ')
          ..write('createdAt: $createdAt, ')
          ..write('activityDate: $activityDate, ')
          ..write('status: $status, ')
          ..write('errorMessage: $errorMessage, ')
          ..write('propertyId: $propertyId, ')
          ..write('talhaoId: $talhaoId, ')
          ..write('cropTypeId: $cropTypeId, ')
          ..write('estadioId: $estadioId, ')
          ..write('source: $source, ')
          ..write('backendUploadId: $backendUploadId, ')
          ..write('backendStatus: $backendStatus, ')
          ..write('backendError: $backendError, ')
          ..write('syncErrorCode: $syncErrorCode, ')
          ..write('syncAttemptCount: $syncAttemptCount, ')
          ..write('lastSyncAttemptAt: $lastSyncAttemptAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    ownerId,
    imagesJson,
    createdAt,
    activityDate,
    status,
    errorMessage,
    propertyId,
    talhaoId,
    cropTypeId,
    estadioId,
    source,
    backendUploadId,
    backendStatus,
    backendError,
    syncErrorCode,
    syncAttemptCount,
    lastSyncAttemptAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PendingUpload &&
          other.id == this.id &&
          other.ownerId == this.ownerId &&
          other.imagesJson == this.imagesJson &&
          other.createdAt == this.createdAt &&
          other.activityDate == this.activityDate &&
          other.status == this.status &&
          other.errorMessage == this.errorMessage &&
          other.propertyId == this.propertyId &&
          other.talhaoId == this.talhaoId &&
          other.cropTypeId == this.cropTypeId &&
          other.estadioId == this.estadioId &&
          other.source == this.source &&
          other.backendUploadId == this.backendUploadId &&
          other.backendStatus == this.backendStatus &&
          other.backendError == this.backendError &&
          other.syncErrorCode == this.syncErrorCode &&
          other.syncAttemptCount == this.syncAttemptCount &&
          other.lastSyncAttemptAt == this.lastSyncAttemptAt);
}

class PendingUploadsCompanion extends UpdateCompanion<PendingUpload> {
  final Value<String> id;
  final Value<String> ownerId;
  final Value<String> imagesJson;
  final Value<int> createdAt;
  final Value<int> activityDate;
  final Value<String> status;
  final Value<String?> errorMessage;
  final Value<String?> propertyId;
  final Value<String?> talhaoId;
  final Value<String?> cropTypeId;
  final Value<String?> estadioId;
  final Value<String?> source;
  final Value<String?> backendUploadId;
  final Value<String?> backendStatus;
  final Value<String?> backendError;
  final Value<String?> syncErrorCode;
  final Value<int> syncAttemptCount;
  final Value<int?> lastSyncAttemptAt;
  final Value<int> rowid;
  const PendingUploadsCompanion({
    this.id = const Value.absent(),
    this.ownerId = const Value.absent(),
    this.imagesJson = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.activityDate = const Value.absent(),
    this.status = const Value.absent(),
    this.errorMessage = const Value.absent(),
    this.propertyId = const Value.absent(),
    this.talhaoId = const Value.absent(),
    this.cropTypeId = const Value.absent(),
    this.estadioId = const Value.absent(),
    this.source = const Value.absent(),
    this.backendUploadId = const Value.absent(),
    this.backendStatus = const Value.absent(),
    this.backendError = const Value.absent(),
    this.syncErrorCode = const Value.absent(),
    this.syncAttemptCount = const Value.absent(),
    this.lastSyncAttemptAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  PendingUploadsCompanion.insert({
    required String id,
    required String ownerId,
    required String imagesJson,
    required int createdAt,
    required int activityDate,
    required String status,
    this.errorMessage = const Value.absent(),
    this.propertyId = const Value.absent(),
    this.talhaoId = const Value.absent(),
    this.cropTypeId = const Value.absent(),
    this.estadioId = const Value.absent(),
    this.source = const Value.absent(),
    this.backendUploadId = const Value.absent(),
    this.backendStatus = const Value.absent(),
    this.backendError = const Value.absent(),
    this.syncErrorCode = const Value.absent(),
    this.syncAttemptCount = const Value.absent(),
    this.lastSyncAttemptAt = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       ownerId = Value(ownerId),
       imagesJson = Value(imagesJson),
       createdAt = Value(createdAt),
       activityDate = Value(activityDate),
       status = Value(status);
  static Insertable<PendingUpload> custom({
    Expression<String>? id,
    Expression<String>? ownerId,
    Expression<String>? imagesJson,
    Expression<int>? createdAt,
    Expression<int>? activityDate,
    Expression<String>? status,
    Expression<String>? errorMessage,
    Expression<String>? propertyId,
    Expression<String>? talhaoId,
    Expression<String>? cropTypeId,
    Expression<String>? estadioId,
    Expression<String>? source,
    Expression<String>? backendUploadId,
    Expression<String>? backendStatus,
    Expression<String>? backendError,
    Expression<String>? syncErrorCode,
    Expression<int>? syncAttemptCount,
    Expression<int>? lastSyncAttemptAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (ownerId != null) 'owner_id': ownerId,
      if (imagesJson != null) 'images_json': imagesJson,
      if (createdAt != null) 'created_at': createdAt,
      if (activityDate != null) 'activity_date': activityDate,
      if (status != null) 'status': status,
      if (errorMessage != null) 'error_message': errorMessage,
      if (propertyId != null) 'property_id': propertyId,
      if (talhaoId != null) 'talhao_id': talhaoId,
      if (cropTypeId != null) 'crop_type_id': cropTypeId,
      if (estadioId != null) 'estadio_id': estadioId,
      if (source != null) 'source': source,
      if (backendUploadId != null) 'backend_upload_id': backendUploadId,
      if (backendStatus != null) 'backend_status': backendStatus,
      if (backendError != null) 'backend_error': backendError,
      if (syncErrorCode != null) 'sync_error_code': syncErrorCode,
      if (syncAttemptCount != null) 'sync_attempt_count': syncAttemptCount,
      if (lastSyncAttemptAt != null) 'last_sync_attempt_at': lastSyncAttemptAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  PendingUploadsCompanion copyWith({
    Value<String>? id,
    Value<String>? ownerId,
    Value<String>? imagesJson,
    Value<int>? createdAt,
    Value<int>? activityDate,
    Value<String>? status,
    Value<String?>? errorMessage,
    Value<String?>? propertyId,
    Value<String?>? talhaoId,
    Value<String?>? cropTypeId,
    Value<String?>? estadioId,
    Value<String?>? source,
    Value<String?>? backendUploadId,
    Value<String?>? backendStatus,
    Value<String?>? backendError,
    Value<String?>? syncErrorCode,
    Value<int>? syncAttemptCount,
    Value<int?>? lastSyncAttemptAt,
    Value<int>? rowid,
  }) {
    return PendingUploadsCompanion(
      id: id ?? this.id,
      ownerId: ownerId ?? this.ownerId,
      imagesJson: imagesJson ?? this.imagesJson,
      createdAt: createdAt ?? this.createdAt,
      activityDate: activityDate ?? this.activityDate,
      status: status ?? this.status,
      errorMessage: errorMessage ?? this.errorMessage,
      propertyId: propertyId ?? this.propertyId,
      talhaoId: talhaoId ?? this.talhaoId,
      cropTypeId: cropTypeId ?? this.cropTypeId,
      estadioId: estadioId ?? this.estadioId,
      source: source ?? this.source,
      backendUploadId: backendUploadId ?? this.backendUploadId,
      backendStatus: backendStatus ?? this.backendStatus,
      backendError: backendError ?? this.backendError,
      syncErrorCode: syncErrorCode ?? this.syncErrorCode,
      syncAttemptCount: syncAttemptCount ?? this.syncAttemptCount,
      lastSyncAttemptAt: lastSyncAttemptAt ?? this.lastSyncAttemptAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (ownerId.present) {
      map['owner_id'] = Variable<String>(ownerId.value);
    }
    if (imagesJson.present) {
      map['images_json'] = Variable<String>(imagesJson.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (activityDate.present) {
      map['activity_date'] = Variable<int>(activityDate.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (errorMessage.present) {
      map['error_message'] = Variable<String>(errorMessage.value);
    }
    if (propertyId.present) {
      map['property_id'] = Variable<String>(propertyId.value);
    }
    if (talhaoId.present) {
      map['talhao_id'] = Variable<String>(talhaoId.value);
    }
    if (cropTypeId.present) {
      map['crop_type_id'] = Variable<String>(cropTypeId.value);
    }
    if (estadioId.present) {
      map['estadio_id'] = Variable<String>(estadioId.value);
    }
    if (source.present) {
      map['source'] = Variable<String>(source.value);
    }
    if (backendUploadId.present) {
      map['backend_upload_id'] = Variable<String>(backendUploadId.value);
    }
    if (backendStatus.present) {
      map['backend_status'] = Variable<String>(backendStatus.value);
    }
    if (backendError.present) {
      map['backend_error'] = Variable<String>(backendError.value);
    }
    if (syncErrorCode.present) {
      map['sync_error_code'] = Variable<String>(syncErrorCode.value);
    }
    if (syncAttemptCount.present) {
      map['sync_attempt_count'] = Variable<int>(syncAttemptCount.value);
    }
    if (lastSyncAttemptAt.present) {
      map['last_sync_attempt_at'] = Variable<int>(lastSyncAttemptAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('PendingUploadsCompanion(')
          ..write('id: $id, ')
          ..write('ownerId: $ownerId, ')
          ..write('imagesJson: $imagesJson, ')
          ..write('createdAt: $createdAt, ')
          ..write('activityDate: $activityDate, ')
          ..write('status: $status, ')
          ..write('errorMessage: $errorMessage, ')
          ..write('propertyId: $propertyId, ')
          ..write('talhaoId: $talhaoId, ')
          ..write('cropTypeId: $cropTypeId, ')
          ..write('estadioId: $estadioId, ')
          ..write('source: $source, ')
          ..write('backendUploadId: $backendUploadId, ')
          ..write('backendStatus: $backendStatus, ')
          ..write('backendError: $backendError, ')
          ..write('syncErrorCode: $syncErrorCode, ')
          ..write('syncAttemptCount: $syncAttemptCount, ')
          ..write('lastSyncAttemptAt: $lastSyncAttemptAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class CatalogProperties extends Table
    with TableInfo<CatalogProperties, CatalogProperty> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  CatalogProperties(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _ownerIdMeta = const VerificationMeta(
    'ownerId',
  );
  late final GeneratedColumn<String> ownerId = GeneratedColumn<String>(
    'owner_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _dataMeta = const VerificationMeta('data');
  late final GeneratedColumn<String> data = GeneratedColumn<String>(
    'data',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _cachedAtMeta = const VerificationMeta(
    'cachedAt',
  );
  late final GeneratedColumn<int> cachedAt = GeneratedColumn<int>(
    'cached_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _isPendingSyncMeta = const VerificationMeta(
    'isPendingSync',
  );
  late final GeneratedColumn<int> isPendingSync = GeneratedColumn<int>(
    'is_pending_sync',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    $customConstraints: 'NOT NULL DEFAULT 0',
    defaultValue: const CustomExpression('0'),
  );
  static const VerificationMeta _syncErrorMeta = const VerificationMeta(
    'syncError',
  );
  late final GeneratedColumn<String> syncError = GeneratedColumn<String>(
    'sync_error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    $customConstraints: '',
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    ownerId,
    data,
    cachedAt,
    isPendingSync,
    syncError,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'catalog_properties';
  @override
  VerificationContext validateIntegrity(
    Insertable<CatalogProperty> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('owner_id')) {
      context.handle(
        _ownerIdMeta,
        ownerId.isAcceptableOrUnknown(data['owner_id']!, _ownerIdMeta),
      );
    } else if (isInserting) {
      context.missing(_ownerIdMeta);
    }
    if (data.containsKey('data')) {
      context.handle(
        _dataMeta,
        this.data.isAcceptableOrUnknown(data['data']!, _dataMeta),
      );
    } else if (isInserting) {
      context.missing(_dataMeta);
    }
    if (data.containsKey('cached_at')) {
      context.handle(
        _cachedAtMeta,
        cachedAt.isAcceptableOrUnknown(data['cached_at']!, _cachedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_cachedAtMeta);
    }
    if (data.containsKey('is_pending_sync')) {
      context.handle(
        _isPendingSyncMeta,
        isPendingSync.isAcceptableOrUnknown(
          data['is_pending_sync']!,
          _isPendingSyncMeta,
        ),
      );
    }
    if (data.containsKey('sync_error')) {
      context.handle(
        _syncErrorMeta,
        syncError.isAcceptableOrUnknown(data['sync_error']!, _syncErrorMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id, ownerId};
  @override
  CatalogProperty map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CatalogProperty(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      ownerId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}owner_id'],
      )!,
      data: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}data'],
      )!,
      cachedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}cached_at'],
      )!,
      isPendingSync: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}is_pending_sync'],
      )!,
      syncError: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sync_error'],
      ),
    );
  }

  @override
  CatalogProperties createAlias(String alias) {
    return CatalogProperties(attachedDatabase, alias);
  }

  @override
  List<String> get customConstraints => const ['PRIMARY KEY(id, owner_id)'];
  @override
  bool get dontWriteConstraints => true;
}

class CatalogProperty extends DataClass implements Insertable<CatalogProperty> {
  final String id;
  final String ownerId;
  final String data;
  final int cachedAt;
  final int isPendingSync;
  final String? syncError;
  const CatalogProperty({
    required this.id,
    required this.ownerId,
    required this.data,
    required this.cachedAt,
    required this.isPendingSync,
    this.syncError,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['owner_id'] = Variable<String>(ownerId);
    map['data'] = Variable<String>(data);
    map['cached_at'] = Variable<int>(cachedAt);
    map['is_pending_sync'] = Variable<int>(isPendingSync);
    if (!nullToAbsent || syncError != null) {
      map['sync_error'] = Variable<String>(syncError);
    }
    return map;
  }

  CatalogPropertiesCompanion toCompanion(bool nullToAbsent) {
    return CatalogPropertiesCompanion(
      id: Value(id),
      ownerId: Value(ownerId),
      data: Value(data),
      cachedAt: Value(cachedAt),
      isPendingSync: Value(isPendingSync),
      syncError: syncError == null && nullToAbsent
          ? const Value.absent()
          : Value(syncError),
    );
  }

  factory CatalogProperty.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CatalogProperty(
      id: serializer.fromJson<String>(json['id']),
      ownerId: serializer.fromJson<String>(json['owner_id']),
      data: serializer.fromJson<String>(json['data']),
      cachedAt: serializer.fromJson<int>(json['cached_at']),
      isPendingSync: serializer.fromJson<int>(json['is_pending_sync']),
      syncError: serializer.fromJson<String?>(json['sync_error']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'owner_id': serializer.toJson<String>(ownerId),
      'data': serializer.toJson<String>(data),
      'cached_at': serializer.toJson<int>(cachedAt),
      'is_pending_sync': serializer.toJson<int>(isPendingSync),
      'sync_error': serializer.toJson<String?>(syncError),
    };
  }

  CatalogProperty copyWith({
    String? id,
    String? ownerId,
    String? data,
    int? cachedAt,
    int? isPendingSync,
    Value<String?> syncError = const Value.absent(),
  }) => CatalogProperty(
    id: id ?? this.id,
    ownerId: ownerId ?? this.ownerId,
    data: data ?? this.data,
    cachedAt: cachedAt ?? this.cachedAt,
    isPendingSync: isPendingSync ?? this.isPendingSync,
    syncError: syncError.present ? syncError.value : this.syncError,
  );
  CatalogProperty copyWithCompanion(CatalogPropertiesCompanion data) {
    return CatalogProperty(
      id: data.id.present ? data.id.value : this.id,
      ownerId: data.ownerId.present ? data.ownerId.value : this.ownerId,
      data: data.data.present ? data.data.value : this.data,
      cachedAt: data.cachedAt.present ? data.cachedAt.value : this.cachedAt,
      isPendingSync: data.isPendingSync.present
          ? data.isPendingSync.value
          : this.isPendingSync,
      syncError: data.syncError.present ? data.syncError.value : this.syncError,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CatalogProperty(')
          ..write('id: $id, ')
          ..write('ownerId: $ownerId, ')
          ..write('data: $data, ')
          ..write('cachedAt: $cachedAt, ')
          ..write('isPendingSync: $isPendingSync, ')
          ..write('syncError: $syncError')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, ownerId, data, cachedAt, isPendingSync, syncError);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CatalogProperty &&
          other.id == this.id &&
          other.ownerId == this.ownerId &&
          other.data == this.data &&
          other.cachedAt == this.cachedAt &&
          other.isPendingSync == this.isPendingSync &&
          other.syncError == this.syncError);
}

class CatalogPropertiesCompanion extends UpdateCompanion<CatalogProperty> {
  final Value<String> id;
  final Value<String> ownerId;
  final Value<String> data;
  final Value<int> cachedAt;
  final Value<int> isPendingSync;
  final Value<String?> syncError;
  final Value<int> rowid;
  const CatalogPropertiesCompanion({
    this.id = const Value.absent(),
    this.ownerId = const Value.absent(),
    this.data = const Value.absent(),
    this.cachedAt = const Value.absent(),
    this.isPendingSync = const Value.absent(),
    this.syncError = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CatalogPropertiesCompanion.insert({
    required String id,
    required String ownerId,
    required String data,
    required int cachedAt,
    this.isPendingSync = const Value.absent(),
    this.syncError = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       ownerId = Value(ownerId),
       data = Value(data),
       cachedAt = Value(cachedAt);
  static Insertable<CatalogProperty> custom({
    Expression<String>? id,
    Expression<String>? ownerId,
    Expression<String>? data,
    Expression<int>? cachedAt,
    Expression<int>? isPendingSync,
    Expression<String>? syncError,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (ownerId != null) 'owner_id': ownerId,
      if (data != null) 'data': data,
      if (cachedAt != null) 'cached_at': cachedAt,
      if (isPendingSync != null) 'is_pending_sync': isPendingSync,
      if (syncError != null) 'sync_error': syncError,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CatalogPropertiesCompanion copyWith({
    Value<String>? id,
    Value<String>? ownerId,
    Value<String>? data,
    Value<int>? cachedAt,
    Value<int>? isPendingSync,
    Value<String?>? syncError,
    Value<int>? rowid,
  }) {
    return CatalogPropertiesCompanion(
      id: id ?? this.id,
      ownerId: ownerId ?? this.ownerId,
      data: data ?? this.data,
      cachedAt: cachedAt ?? this.cachedAt,
      isPendingSync: isPendingSync ?? this.isPendingSync,
      syncError: syncError ?? this.syncError,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (ownerId.present) {
      map['owner_id'] = Variable<String>(ownerId.value);
    }
    if (data.present) {
      map['data'] = Variable<String>(data.value);
    }
    if (cachedAt.present) {
      map['cached_at'] = Variable<int>(cachedAt.value);
    }
    if (isPendingSync.present) {
      map['is_pending_sync'] = Variable<int>(isPendingSync.value);
    }
    if (syncError.present) {
      map['sync_error'] = Variable<String>(syncError.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CatalogPropertiesCompanion(')
          ..write('id: $id, ')
          ..write('ownerId: $ownerId, ')
          ..write('data: $data, ')
          ..write('cachedAt: $cachedAt, ')
          ..write('isPendingSync: $isPendingSync, ')
          ..write('syncError: $syncError, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class CatalogTalhoes extends Table
    with TableInfo<CatalogTalhoes, CatalogTalhoe> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  CatalogTalhoes(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _ownerIdMeta = const VerificationMeta(
    'ownerId',
  );
  late final GeneratedColumn<String> ownerId = GeneratedColumn<String>(
    'owner_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _dataMeta = const VerificationMeta('data');
  late final GeneratedColumn<String> data = GeneratedColumn<String>(
    'data',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _cachedAtMeta = const VerificationMeta(
    'cachedAt',
  );
  late final GeneratedColumn<int> cachedAt = GeneratedColumn<int>(
    'cached_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _isPendingSyncMeta = const VerificationMeta(
    'isPendingSync',
  );
  late final GeneratedColumn<int> isPendingSync = GeneratedColumn<int>(
    'is_pending_sync',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    $customConstraints: 'NOT NULL DEFAULT 0',
    defaultValue: const CustomExpression('0'),
  );
  static const VerificationMeta _syncErrorMeta = const VerificationMeta(
    'syncError',
  );
  late final GeneratedColumn<String> syncError = GeneratedColumn<String>(
    'sync_error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    $customConstraints: '',
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    ownerId,
    data,
    cachedAt,
    isPendingSync,
    syncError,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'catalog_talhoes';
  @override
  VerificationContext validateIntegrity(
    Insertable<CatalogTalhoe> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('owner_id')) {
      context.handle(
        _ownerIdMeta,
        ownerId.isAcceptableOrUnknown(data['owner_id']!, _ownerIdMeta),
      );
    } else if (isInserting) {
      context.missing(_ownerIdMeta);
    }
    if (data.containsKey('data')) {
      context.handle(
        _dataMeta,
        this.data.isAcceptableOrUnknown(data['data']!, _dataMeta),
      );
    } else if (isInserting) {
      context.missing(_dataMeta);
    }
    if (data.containsKey('cached_at')) {
      context.handle(
        _cachedAtMeta,
        cachedAt.isAcceptableOrUnknown(data['cached_at']!, _cachedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_cachedAtMeta);
    }
    if (data.containsKey('is_pending_sync')) {
      context.handle(
        _isPendingSyncMeta,
        isPendingSync.isAcceptableOrUnknown(
          data['is_pending_sync']!,
          _isPendingSyncMeta,
        ),
      );
    }
    if (data.containsKey('sync_error')) {
      context.handle(
        _syncErrorMeta,
        syncError.isAcceptableOrUnknown(data['sync_error']!, _syncErrorMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id, ownerId};
  @override
  CatalogTalhoe map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CatalogTalhoe(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      ownerId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}owner_id'],
      )!,
      data: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}data'],
      )!,
      cachedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}cached_at'],
      )!,
      isPendingSync: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}is_pending_sync'],
      )!,
      syncError: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sync_error'],
      ),
    );
  }

  @override
  CatalogTalhoes createAlias(String alias) {
    return CatalogTalhoes(attachedDatabase, alias);
  }

  @override
  List<String> get customConstraints => const ['PRIMARY KEY(id, owner_id)'];
  @override
  bool get dontWriteConstraints => true;
}

class CatalogTalhoe extends DataClass implements Insertable<CatalogTalhoe> {
  final String id;
  final String ownerId;
  final String data;
  final int cachedAt;
  final int isPendingSync;
  final String? syncError;
  const CatalogTalhoe({
    required this.id,
    required this.ownerId,
    required this.data,
    required this.cachedAt,
    required this.isPendingSync,
    this.syncError,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['owner_id'] = Variable<String>(ownerId);
    map['data'] = Variable<String>(data);
    map['cached_at'] = Variable<int>(cachedAt);
    map['is_pending_sync'] = Variable<int>(isPendingSync);
    if (!nullToAbsent || syncError != null) {
      map['sync_error'] = Variable<String>(syncError);
    }
    return map;
  }

  CatalogTalhoesCompanion toCompanion(bool nullToAbsent) {
    return CatalogTalhoesCompanion(
      id: Value(id),
      ownerId: Value(ownerId),
      data: Value(data),
      cachedAt: Value(cachedAt),
      isPendingSync: Value(isPendingSync),
      syncError: syncError == null && nullToAbsent
          ? const Value.absent()
          : Value(syncError),
    );
  }

  factory CatalogTalhoe.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CatalogTalhoe(
      id: serializer.fromJson<String>(json['id']),
      ownerId: serializer.fromJson<String>(json['owner_id']),
      data: serializer.fromJson<String>(json['data']),
      cachedAt: serializer.fromJson<int>(json['cached_at']),
      isPendingSync: serializer.fromJson<int>(json['is_pending_sync']),
      syncError: serializer.fromJson<String?>(json['sync_error']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'owner_id': serializer.toJson<String>(ownerId),
      'data': serializer.toJson<String>(data),
      'cached_at': serializer.toJson<int>(cachedAt),
      'is_pending_sync': serializer.toJson<int>(isPendingSync),
      'sync_error': serializer.toJson<String?>(syncError),
    };
  }

  CatalogTalhoe copyWith({
    String? id,
    String? ownerId,
    String? data,
    int? cachedAt,
    int? isPendingSync,
    Value<String?> syncError = const Value.absent(),
  }) => CatalogTalhoe(
    id: id ?? this.id,
    ownerId: ownerId ?? this.ownerId,
    data: data ?? this.data,
    cachedAt: cachedAt ?? this.cachedAt,
    isPendingSync: isPendingSync ?? this.isPendingSync,
    syncError: syncError.present ? syncError.value : this.syncError,
  );
  CatalogTalhoe copyWithCompanion(CatalogTalhoesCompanion data) {
    return CatalogTalhoe(
      id: data.id.present ? data.id.value : this.id,
      ownerId: data.ownerId.present ? data.ownerId.value : this.ownerId,
      data: data.data.present ? data.data.value : this.data,
      cachedAt: data.cachedAt.present ? data.cachedAt.value : this.cachedAt,
      isPendingSync: data.isPendingSync.present
          ? data.isPendingSync.value
          : this.isPendingSync,
      syncError: data.syncError.present ? data.syncError.value : this.syncError,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CatalogTalhoe(')
          ..write('id: $id, ')
          ..write('ownerId: $ownerId, ')
          ..write('data: $data, ')
          ..write('cachedAt: $cachedAt, ')
          ..write('isPendingSync: $isPendingSync, ')
          ..write('syncError: $syncError')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, ownerId, data, cachedAt, isPendingSync, syncError);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CatalogTalhoe &&
          other.id == this.id &&
          other.ownerId == this.ownerId &&
          other.data == this.data &&
          other.cachedAt == this.cachedAt &&
          other.isPendingSync == this.isPendingSync &&
          other.syncError == this.syncError);
}

class CatalogTalhoesCompanion extends UpdateCompanion<CatalogTalhoe> {
  final Value<String> id;
  final Value<String> ownerId;
  final Value<String> data;
  final Value<int> cachedAt;
  final Value<int> isPendingSync;
  final Value<String?> syncError;
  final Value<int> rowid;
  const CatalogTalhoesCompanion({
    this.id = const Value.absent(),
    this.ownerId = const Value.absent(),
    this.data = const Value.absent(),
    this.cachedAt = const Value.absent(),
    this.isPendingSync = const Value.absent(),
    this.syncError = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CatalogTalhoesCompanion.insert({
    required String id,
    required String ownerId,
    required String data,
    required int cachedAt,
    this.isPendingSync = const Value.absent(),
    this.syncError = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       ownerId = Value(ownerId),
       data = Value(data),
       cachedAt = Value(cachedAt);
  static Insertable<CatalogTalhoe> custom({
    Expression<String>? id,
    Expression<String>? ownerId,
    Expression<String>? data,
    Expression<int>? cachedAt,
    Expression<int>? isPendingSync,
    Expression<String>? syncError,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (ownerId != null) 'owner_id': ownerId,
      if (data != null) 'data': data,
      if (cachedAt != null) 'cached_at': cachedAt,
      if (isPendingSync != null) 'is_pending_sync': isPendingSync,
      if (syncError != null) 'sync_error': syncError,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CatalogTalhoesCompanion copyWith({
    Value<String>? id,
    Value<String>? ownerId,
    Value<String>? data,
    Value<int>? cachedAt,
    Value<int>? isPendingSync,
    Value<String?>? syncError,
    Value<int>? rowid,
  }) {
    return CatalogTalhoesCompanion(
      id: id ?? this.id,
      ownerId: ownerId ?? this.ownerId,
      data: data ?? this.data,
      cachedAt: cachedAt ?? this.cachedAt,
      isPendingSync: isPendingSync ?? this.isPendingSync,
      syncError: syncError ?? this.syncError,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (ownerId.present) {
      map['owner_id'] = Variable<String>(ownerId.value);
    }
    if (data.present) {
      map['data'] = Variable<String>(data.value);
    }
    if (cachedAt.present) {
      map['cached_at'] = Variable<int>(cachedAt.value);
    }
    if (isPendingSync.present) {
      map['is_pending_sync'] = Variable<int>(isPendingSync.value);
    }
    if (syncError.present) {
      map['sync_error'] = Variable<String>(syncError.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CatalogTalhoesCompanion(')
          ..write('id: $id, ')
          ..write('ownerId: $ownerId, ')
          ..write('data: $data, ')
          ..write('cachedAt: $cachedAt, ')
          ..write('isPendingSync: $isPendingSync, ')
          ..write('syncError: $syncError, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class CatalogCropTypes extends Table
    with TableInfo<CatalogCropTypes, CatalogCropType> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  CatalogCropTypes(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _ownerIdMeta = const VerificationMeta(
    'ownerId',
  );
  late final GeneratedColumn<String> ownerId = GeneratedColumn<String>(
    'owner_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _dataMeta = const VerificationMeta('data');
  late final GeneratedColumn<String> data = GeneratedColumn<String>(
    'data',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _cachedAtMeta = const VerificationMeta(
    'cachedAt',
  );
  late final GeneratedColumn<int> cachedAt = GeneratedColumn<int>(
    'cached_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _isPendingSyncMeta = const VerificationMeta(
    'isPendingSync',
  );
  late final GeneratedColumn<int> isPendingSync = GeneratedColumn<int>(
    'is_pending_sync',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    $customConstraints: 'NOT NULL DEFAULT 0',
    defaultValue: const CustomExpression('0'),
  );
  static const VerificationMeta _syncErrorMeta = const VerificationMeta(
    'syncError',
  );
  late final GeneratedColumn<String> syncError = GeneratedColumn<String>(
    'sync_error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    $customConstraints: '',
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    ownerId,
    data,
    cachedAt,
    isPendingSync,
    syncError,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'catalog_crop_types';
  @override
  VerificationContext validateIntegrity(
    Insertable<CatalogCropType> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('owner_id')) {
      context.handle(
        _ownerIdMeta,
        ownerId.isAcceptableOrUnknown(data['owner_id']!, _ownerIdMeta),
      );
    } else if (isInserting) {
      context.missing(_ownerIdMeta);
    }
    if (data.containsKey('data')) {
      context.handle(
        _dataMeta,
        this.data.isAcceptableOrUnknown(data['data']!, _dataMeta),
      );
    } else if (isInserting) {
      context.missing(_dataMeta);
    }
    if (data.containsKey('cached_at')) {
      context.handle(
        _cachedAtMeta,
        cachedAt.isAcceptableOrUnknown(data['cached_at']!, _cachedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_cachedAtMeta);
    }
    if (data.containsKey('is_pending_sync')) {
      context.handle(
        _isPendingSyncMeta,
        isPendingSync.isAcceptableOrUnknown(
          data['is_pending_sync']!,
          _isPendingSyncMeta,
        ),
      );
    }
    if (data.containsKey('sync_error')) {
      context.handle(
        _syncErrorMeta,
        syncError.isAcceptableOrUnknown(data['sync_error']!, _syncErrorMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id, ownerId};
  @override
  CatalogCropType map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CatalogCropType(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      ownerId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}owner_id'],
      )!,
      data: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}data'],
      )!,
      cachedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}cached_at'],
      )!,
      isPendingSync: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}is_pending_sync'],
      )!,
      syncError: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sync_error'],
      ),
    );
  }

  @override
  CatalogCropTypes createAlias(String alias) {
    return CatalogCropTypes(attachedDatabase, alias);
  }

  @override
  List<String> get customConstraints => const ['PRIMARY KEY(id, owner_id)'];
  @override
  bool get dontWriteConstraints => true;
}

class CatalogCropType extends DataClass implements Insertable<CatalogCropType> {
  final String id;
  final String ownerId;
  final String data;
  final int cachedAt;
  final int isPendingSync;
  final String? syncError;
  const CatalogCropType({
    required this.id,
    required this.ownerId,
    required this.data,
    required this.cachedAt,
    required this.isPendingSync,
    this.syncError,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['owner_id'] = Variable<String>(ownerId);
    map['data'] = Variable<String>(data);
    map['cached_at'] = Variable<int>(cachedAt);
    map['is_pending_sync'] = Variable<int>(isPendingSync);
    if (!nullToAbsent || syncError != null) {
      map['sync_error'] = Variable<String>(syncError);
    }
    return map;
  }

  CatalogCropTypesCompanion toCompanion(bool nullToAbsent) {
    return CatalogCropTypesCompanion(
      id: Value(id),
      ownerId: Value(ownerId),
      data: Value(data),
      cachedAt: Value(cachedAt),
      isPendingSync: Value(isPendingSync),
      syncError: syncError == null && nullToAbsent
          ? const Value.absent()
          : Value(syncError),
    );
  }

  factory CatalogCropType.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CatalogCropType(
      id: serializer.fromJson<String>(json['id']),
      ownerId: serializer.fromJson<String>(json['owner_id']),
      data: serializer.fromJson<String>(json['data']),
      cachedAt: serializer.fromJson<int>(json['cached_at']),
      isPendingSync: serializer.fromJson<int>(json['is_pending_sync']),
      syncError: serializer.fromJson<String?>(json['sync_error']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'owner_id': serializer.toJson<String>(ownerId),
      'data': serializer.toJson<String>(data),
      'cached_at': serializer.toJson<int>(cachedAt),
      'is_pending_sync': serializer.toJson<int>(isPendingSync),
      'sync_error': serializer.toJson<String?>(syncError),
    };
  }

  CatalogCropType copyWith({
    String? id,
    String? ownerId,
    String? data,
    int? cachedAt,
    int? isPendingSync,
    Value<String?> syncError = const Value.absent(),
  }) => CatalogCropType(
    id: id ?? this.id,
    ownerId: ownerId ?? this.ownerId,
    data: data ?? this.data,
    cachedAt: cachedAt ?? this.cachedAt,
    isPendingSync: isPendingSync ?? this.isPendingSync,
    syncError: syncError.present ? syncError.value : this.syncError,
  );
  CatalogCropType copyWithCompanion(CatalogCropTypesCompanion data) {
    return CatalogCropType(
      id: data.id.present ? data.id.value : this.id,
      ownerId: data.ownerId.present ? data.ownerId.value : this.ownerId,
      data: data.data.present ? data.data.value : this.data,
      cachedAt: data.cachedAt.present ? data.cachedAt.value : this.cachedAt,
      isPendingSync: data.isPendingSync.present
          ? data.isPendingSync.value
          : this.isPendingSync,
      syncError: data.syncError.present ? data.syncError.value : this.syncError,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CatalogCropType(')
          ..write('id: $id, ')
          ..write('ownerId: $ownerId, ')
          ..write('data: $data, ')
          ..write('cachedAt: $cachedAt, ')
          ..write('isPendingSync: $isPendingSync, ')
          ..write('syncError: $syncError')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, ownerId, data, cachedAt, isPendingSync, syncError);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CatalogCropType &&
          other.id == this.id &&
          other.ownerId == this.ownerId &&
          other.data == this.data &&
          other.cachedAt == this.cachedAt &&
          other.isPendingSync == this.isPendingSync &&
          other.syncError == this.syncError);
}

class CatalogCropTypesCompanion extends UpdateCompanion<CatalogCropType> {
  final Value<String> id;
  final Value<String> ownerId;
  final Value<String> data;
  final Value<int> cachedAt;
  final Value<int> isPendingSync;
  final Value<String?> syncError;
  final Value<int> rowid;
  const CatalogCropTypesCompanion({
    this.id = const Value.absent(),
    this.ownerId = const Value.absent(),
    this.data = const Value.absent(),
    this.cachedAt = const Value.absent(),
    this.isPendingSync = const Value.absent(),
    this.syncError = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CatalogCropTypesCompanion.insert({
    required String id,
    required String ownerId,
    required String data,
    required int cachedAt,
    this.isPendingSync = const Value.absent(),
    this.syncError = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       ownerId = Value(ownerId),
       data = Value(data),
       cachedAt = Value(cachedAt);
  static Insertable<CatalogCropType> custom({
    Expression<String>? id,
    Expression<String>? ownerId,
    Expression<String>? data,
    Expression<int>? cachedAt,
    Expression<int>? isPendingSync,
    Expression<String>? syncError,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (ownerId != null) 'owner_id': ownerId,
      if (data != null) 'data': data,
      if (cachedAt != null) 'cached_at': cachedAt,
      if (isPendingSync != null) 'is_pending_sync': isPendingSync,
      if (syncError != null) 'sync_error': syncError,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CatalogCropTypesCompanion copyWith({
    Value<String>? id,
    Value<String>? ownerId,
    Value<String>? data,
    Value<int>? cachedAt,
    Value<int>? isPendingSync,
    Value<String?>? syncError,
    Value<int>? rowid,
  }) {
    return CatalogCropTypesCompanion(
      id: id ?? this.id,
      ownerId: ownerId ?? this.ownerId,
      data: data ?? this.data,
      cachedAt: cachedAt ?? this.cachedAt,
      isPendingSync: isPendingSync ?? this.isPendingSync,
      syncError: syncError ?? this.syncError,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (ownerId.present) {
      map['owner_id'] = Variable<String>(ownerId.value);
    }
    if (data.present) {
      map['data'] = Variable<String>(data.value);
    }
    if (cachedAt.present) {
      map['cached_at'] = Variable<int>(cachedAt.value);
    }
    if (isPendingSync.present) {
      map['is_pending_sync'] = Variable<int>(isPendingSync.value);
    }
    if (syncError.present) {
      map['sync_error'] = Variable<String>(syncError.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CatalogCropTypesCompanion(')
          ..write('id: $id, ')
          ..write('ownerId: $ownerId, ')
          ..write('data: $data, ')
          ..write('cachedAt: $cachedAt, ')
          ..write('isPendingSync: $isPendingSync, ')
          ..write('syncError: $syncError, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class CatalogEstadios extends Table
    with TableInfo<CatalogEstadios, CatalogEstadio> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  CatalogEstadios(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _ownerIdMeta = const VerificationMeta(
    'ownerId',
  );
  late final GeneratedColumn<String> ownerId = GeneratedColumn<String>(
    'owner_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _dataMeta = const VerificationMeta('data');
  late final GeneratedColumn<String> data = GeneratedColumn<String>(
    'data',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _cachedAtMeta = const VerificationMeta(
    'cachedAt',
  );
  late final GeneratedColumn<int> cachedAt = GeneratedColumn<int>(
    'cached_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _isPendingSyncMeta = const VerificationMeta(
    'isPendingSync',
  );
  late final GeneratedColumn<int> isPendingSync = GeneratedColumn<int>(
    'is_pending_sync',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    $customConstraints: 'NOT NULL DEFAULT 0',
    defaultValue: const CustomExpression('0'),
  );
  static const VerificationMeta _syncErrorMeta = const VerificationMeta(
    'syncError',
  );
  late final GeneratedColumn<String> syncError = GeneratedColumn<String>(
    'sync_error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    $customConstraints: '',
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    ownerId,
    data,
    cachedAt,
    isPendingSync,
    syncError,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'catalog_estadios';
  @override
  VerificationContext validateIntegrity(
    Insertable<CatalogEstadio> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('owner_id')) {
      context.handle(
        _ownerIdMeta,
        ownerId.isAcceptableOrUnknown(data['owner_id']!, _ownerIdMeta),
      );
    } else if (isInserting) {
      context.missing(_ownerIdMeta);
    }
    if (data.containsKey('data')) {
      context.handle(
        _dataMeta,
        this.data.isAcceptableOrUnknown(data['data']!, _dataMeta),
      );
    } else if (isInserting) {
      context.missing(_dataMeta);
    }
    if (data.containsKey('cached_at')) {
      context.handle(
        _cachedAtMeta,
        cachedAt.isAcceptableOrUnknown(data['cached_at']!, _cachedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_cachedAtMeta);
    }
    if (data.containsKey('is_pending_sync')) {
      context.handle(
        _isPendingSyncMeta,
        isPendingSync.isAcceptableOrUnknown(
          data['is_pending_sync']!,
          _isPendingSyncMeta,
        ),
      );
    }
    if (data.containsKey('sync_error')) {
      context.handle(
        _syncErrorMeta,
        syncError.isAcceptableOrUnknown(data['sync_error']!, _syncErrorMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id, ownerId};
  @override
  CatalogEstadio map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CatalogEstadio(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      ownerId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}owner_id'],
      )!,
      data: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}data'],
      )!,
      cachedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}cached_at'],
      )!,
      isPendingSync: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}is_pending_sync'],
      )!,
      syncError: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sync_error'],
      ),
    );
  }

  @override
  CatalogEstadios createAlias(String alias) {
    return CatalogEstadios(attachedDatabase, alias);
  }

  @override
  List<String> get customConstraints => const ['PRIMARY KEY(id, owner_id)'];
  @override
  bool get dontWriteConstraints => true;
}

class CatalogEstadio extends DataClass implements Insertable<CatalogEstadio> {
  final String id;
  final String ownerId;
  final String data;
  final int cachedAt;
  final int isPendingSync;
  final String? syncError;
  const CatalogEstadio({
    required this.id,
    required this.ownerId,
    required this.data,
    required this.cachedAt,
    required this.isPendingSync,
    this.syncError,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['owner_id'] = Variable<String>(ownerId);
    map['data'] = Variable<String>(data);
    map['cached_at'] = Variable<int>(cachedAt);
    map['is_pending_sync'] = Variable<int>(isPendingSync);
    if (!nullToAbsent || syncError != null) {
      map['sync_error'] = Variable<String>(syncError);
    }
    return map;
  }

  CatalogEstadiosCompanion toCompanion(bool nullToAbsent) {
    return CatalogEstadiosCompanion(
      id: Value(id),
      ownerId: Value(ownerId),
      data: Value(data),
      cachedAt: Value(cachedAt),
      isPendingSync: Value(isPendingSync),
      syncError: syncError == null && nullToAbsent
          ? const Value.absent()
          : Value(syncError),
    );
  }

  factory CatalogEstadio.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CatalogEstadio(
      id: serializer.fromJson<String>(json['id']),
      ownerId: serializer.fromJson<String>(json['owner_id']),
      data: serializer.fromJson<String>(json['data']),
      cachedAt: serializer.fromJson<int>(json['cached_at']),
      isPendingSync: serializer.fromJson<int>(json['is_pending_sync']),
      syncError: serializer.fromJson<String?>(json['sync_error']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'owner_id': serializer.toJson<String>(ownerId),
      'data': serializer.toJson<String>(data),
      'cached_at': serializer.toJson<int>(cachedAt),
      'is_pending_sync': serializer.toJson<int>(isPendingSync),
      'sync_error': serializer.toJson<String?>(syncError),
    };
  }

  CatalogEstadio copyWith({
    String? id,
    String? ownerId,
    String? data,
    int? cachedAt,
    int? isPendingSync,
    Value<String?> syncError = const Value.absent(),
  }) => CatalogEstadio(
    id: id ?? this.id,
    ownerId: ownerId ?? this.ownerId,
    data: data ?? this.data,
    cachedAt: cachedAt ?? this.cachedAt,
    isPendingSync: isPendingSync ?? this.isPendingSync,
    syncError: syncError.present ? syncError.value : this.syncError,
  );
  CatalogEstadio copyWithCompanion(CatalogEstadiosCompanion data) {
    return CatalogEstadio(
      id: data.id.present ? data.id.value : this.id,
      ownerId: data.ownerId.present ? data.ownerId.value : this.ownerId,
      data: data.data.present ? data.data.value : this.data,
      cachedAt: data.cachedAt.present ? data.cachedAt.value : this.cachedAt,
      isPendingSync: data.isPendingSync.present
          ? data.isPendingSync.value
          : this.isPendingSync,
      syncError: data.syncError.present ? data.syncError.value : this.syncError,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CatalogEstadio(')
          ..write('id: $id, ')
          ..write('ownerId: $ownerId, ')
          ..write('data: $data, ')
          ..write('cachedAt: $cachedAt, ')
          ..write('isPendingSync: $isPendingSync, ')
          ..write('syncError: $syncError')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, ownerId, data, cachedAt, isPendingSync, syncError);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CatalogEstadio &&
          other.id == this.id &&
          other.ownerId == this.ownerId &&
          other.data == this.data &&
          other.cachedAt == this.cachedAt &&
          other.isPendingSync == this.isPendingSync &&
          other.syncError == this.syncError);
}

class CatalogEstadiosCompanion extends UpdateCompanion<CatalogEstadio> {
  final Value<String> id;
  final Value<String> ownerId;
  final Value<String> data;
  final Value<int> cachedAt;
  final Value<int> isPendingSync;
  final Value<String?> syncError;
  final Value<int> rowid;
  const CatalogEstadiosCompanion({
    this.id = const Value.absent(),
    this.ownerId = const Value.absent(),
    this.data = const Value.absent(),
    this.cachedAt = const Value.absent(),
    this.isPendingSync = const Value.absent(),
    this.syncError = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CatalogEstadiosCompanion.insert({
    required String id,
    required String ownerId,
    required String data,
    required int cachedAt,
    this.isPendingSync = const Value.absent(),
    this.syncError = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       ownerId = Value(ownerId),
       data = Value(data),
       cachedAt = Value(cachedAt);
  static Insertable<CatalogEstadio> custom({
    Expression<String>? id,
    Expression<String>? ownerId,
    Expression<String>? data,
    Expression<int>? cachedAt,
    Expression<int>? isPendingSync,
    Expression<String>? syncError,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (ownerId != null) 'owner_id': ownerId,
      if (data != null) 'data': data,
      if (cachedAt != null) 'cached_at': cachedAt,
      if (isPendingSync != null) 'is_pending_sync': isPendingSync,
      if (syncError != null) 'sync_error': syncError,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CatalogEstadiosCompanion copyWith({
    Value<String>? id,
    Value<String>? ownerId,
    Value<String>? data,
    Value<int>? cachedAt,
    Value<int>? isPendingSync,
    Value<String?>? syncError,
    Value<int>? rowid,
  }) {
    return CatalogEstadiosCompanion(
      id: id ?? this.id,
      ownerId: ownerId ?? this.ownerId,
      data: data ?? this.data,
      cachedAt: cachedAt ?? this.cachedAt,
      isPendingSync: isPendingSync ?? this.isPendingSync,
      syncError: syncError ?? this.syncError,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (ownerId.present) {
      map['owner_id'] = Variable<String>(ownerId.value);
    }
    if (data.present) {
      map['data'] = Variable<String>(data.value);
    }
    if (cachedAt.present) {
      map['cached_at'] = Variable<int>(cachedAt.value);
    }
    if (isPendingSync.present) {
      map['is_pending_sync'] = Variable<int>(isPendingSync.value);
    }
    if (syncError.present) {
      map['sync_error'] = Variable<String>(syncError.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CatalogEstadiosCompanion(')
          ..write('id: $id, ')
          ..write('ownerId: $ownerId, ')
          ..write('data: $data, ')
          ..write('cachedAt: $cachedAt, ')
          ..write('isPendingSync: $isPendingSync, ')
          ..write('syncError: $syncError, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class PendingCatalogCreates extends Table
    with TableInfo<PendingCatalogCreates, PendingCatalogCreate> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  PendingCatalogCreates(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _tempIdMeta = const VerificationMeta('tempId');
  late final GeneratedColumn<String> tempId = GeneratedColumn<String>(
    'temp_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _ownerIdMeta = const VerificationMeta(
    'ownerId',
  );
  late final GeneratedColumn<String> ownerId = GeneratedColumn<String>(
    'owner_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _entityTypeMeta = const VerificationMeta(
    'entityType',
  );
  late final GeneratedColumn<String> entityType = GeneratedColumn<String>(
    'entity_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _payloadJsonMeta = const VerificationMeta(
    'payloadJson',
  );
  late final GeneratedColumn<String> payloadJson = GeneratedColumn<String>(
    'payload_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _normalizedNameMeta = const VerificationMeta(
    'normalizedName',
  );
  late final GeneratedColumn<String> normalizedName = GeneratedColumn<String>(
    'normalized_name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _parentIdMeta = const VerificationMeta(
    'parentId',
  );
  late final GeneratedColumn<String> parentId = GeneratedColumn<String>(
    'parent_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    $customConstraints: '',
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _errorMessageMeta = const VerificationMeta(
    'errorMessage',
  );
  late final GeneratedColumn<String> errorMessage = GeneratedColumn<String>(
    'error_message',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    $customConstraints: '',
  );
  @override
  List<GeneratedColumn> get $columns => [
    tempId,
    ownerId,
    entityType,
    payloadJson,
    normalizedName,
    parentId,
    createdAt,
    errorMessage,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'pending_catalog_creates';
  @override
  VerificationContext validateIntegrity(
    Insertable<PendingCatalogCreate> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('temp_id')) {
      context.handle(
        _tempIdMeta,
        tempId.isAcceptableOrUnknown(data['temp_id']!, _tempIdMeta),
      );
    } else if (isInserting) {
      context.missing(_tempIdMeta);
    }
    if (data.containsKey('owner_id')) {
      context.handle(
        _ownerIdMeta,
        ownerId.isAcceptableOrUnknown(data['owner_id']!, _ownerIdMeta),
      );
    } else if (isInserting) {
      context.missing(_ownerIdMeta);
    }
    if (data.containsKey('entity_type')) {
      context.handle(
        _entityTypeMeta,
        entityType.isAcceptableOrUnknown(data['entity_type']!, _entityTypeMeta),
      );
    } else if (isInserting) {
      context.missing(_entityTypeMeta);
    }
    if (data.containsKey('payload_json')) {
      context.handle(
        _payloadJsonMeta,
        payloadJson.isAcceptableOrUnknown(
          data['payload_json']!,
          _payloadJsonMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_payloadJsonMeta);
    }
    if (data.containsKey('normalized_name')) {
      context.handle(
        _normalizedNameMeta,
        normalizedName.isAcceptableOrUnknown(
          data['normalized_name']!,
          _normalizedNameMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_normalizedNameMeta);
    }
    if (data.containsKey('parent_id')) {
      context.handle(
        _parentIdMeta,
        parentId.isAcceptableOrUnknown(data['parent_id']!, _parentIdMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('error_message')) {
      context.handle(
        _errorMessageMeta,
        errorMessage.isAcceptableOrUnknown(
          data['error_message']!,
          _errorMessageMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {tempId, ownerId};
  @override
  PendingCatalogCreate map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return PendingCatalogCreate(
      tempId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}temp_id'],
      )!,
      ownerId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}owner_id'],
      )!,
      entityType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}entity_type'],
      )!,
      payloadJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payload_json'],
      )!,
      normalizedName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}normalized_name'],
      )!,
      parentId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}parent_id'],
      ),
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
      errorMessage: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}error_message'],
      ),
    );
  }

  @override
  PendingCatalogCreates createAlias(String alias) {
    return PendingCatalogCreates(attachedDatabase, alias);
  }

  @override
  List<String> get customConstraints => const [
    'PRIMARY KEY(temp_id, owner_id)',
  ];
  @override
  bool get dontWriteConstraints => true;
}

class PendingCatalogCreate extends DataClass
    implements Insertable<PendingCatalogCreate> {
  final String tempId;
  final String ownerId;
  final String entityType;
  final String payloadJson;
  final String normalizedName;
  final String? parentId;
  final int createdAt;
  final String? errorMessage;
  const PendingCatalogCreate({
    required this.tempId,
    required this.ownerId,
    required this.entityType,
    required this.payloadJson,
    required this.normalizedName,
    this.parentId,
    required this.createdAt,
    this.errorMessage,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['temp_id'] = Variable<String>(tempId);
    map['owner_id'] = Variable<String>(ownerId);
    map['entity_type'] = Variable<String>(entityType);
    map['payload_json'] = Variable<String>(payloadJson);
    map['normalized_name'] = Variable<String>(normalizedName);
    if (!nullToAbsent || parentId != null) {
      map['parent_id'] = Variable<String>(parentId);
    }
    map['created_at'] = Variable<int>(createdAt);
    if (!nullToAbsent || errorMessage != null) {
      map['error_message'] = Variable<String>(errorMessage);
    }
    return map;
  }

  PendingCatalogCreatesCompanion toCompanion(bool nullToAbsent) {
    return PendingCatalogCreatesCompanion(
      tempId: Value(tempId),
      ownerId: Value(ownerId),
      entityType: Value(entityType),
      payloadJson: Value(payloadJson),
      normalizedName: Value(normalizedName),
      parentId: parentId == null && nullToAbsent
          ? const Value.absent()
          : Value(parentId),
      createdAt: Value(createdAt),
      errorMessage: errorMessage == null && nullToAbsent
          ? const Value.absent()
          : Value(errorMessage),
    );
  }

  factory PendingCatalogCreate.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return PendingCatalogCreate(
      tempId: serializer.fromJson<String>(json['temp_id']),
      ownerId: serializer.fromJson<String>(json['owner_id']),
      entityType: serializer.fromJson<String>(json['entity_type']),
      payloadJson: serializer.fromJson<String>(json['payload_json']),
      normalizedName: serializer.fromJson<String>(json['normalized_name']),
      parentId: serializer.fromJson<String?>(json['parent_id']),
      createdAt: serializer.fromJson<int>(json['created_at']),
      errorMessage: serializer.fromJson<String?>(json['error_message']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'temp_id': serializer.toJson<String>(tempId),
      'owner_id': serializer.toJson<String>(ownerId),
      'entity_type': serializer.toJson<String>(entityType),
      'payload_json': serializer.toJson<String>(payloadJson),
      'normalized_name': serializer.toJson<String>(normalizedName),
      'parent_id': serializer.toJson<String?>(parentId),
      'created_at': serializer.toJson<int>(createdAt),
      'error_message': serializer.toJson<String?>(errorMessage),
    };
  }

  PendingCatalogCreate copyWith({
    String? tempId,
    String? ownerId,
    String? entityType,
    String? payloadJson,
    String? normalizedName,
    Value<String?> parentId = const Value.absent(),
    int? createdAt,
    Value<String?> errorMessage = const Value.absent(),
  }) => PendingCatalogCreate(
    tempId: tempId ?? this.tempId,
    ownerId: ownerId ?? this.ownerId,
    entityType: entityType ?? this.entityType,
    payloadJson: payloadJson ?? this.payloadJson,
    normalizedName: normalizedName ?? this.normalizedName,
    parentId: parentId.present ? parentId.value : this.parentId,
    createdAt: createdAt ?? this.createdAt,
    errorMessage: errorMessage.present ? errorMessage.value : this.errorMessage,
  );
  PendingCatalogCreate copyWithCompanion(PendingCatalogCreatesCompanion data) {
    return PendingCatalogCreate(
      tempId: data.tempId.present ? data.tempId.value : this.tempId,
      ownerId: data.ownerId.present ? data.ownerId.value : this.ownerId,
      entityType: data.entityType.present
          ? data.entityType.value
          : this.entityType,
      payloadJson: data.payloadJson.present
          ? data.payloadJson.value
          : this.payloadJson,
      normalizedName: data.normalizedName.present
          ? data.normalizedName.value
          : this.normalizedName,
      parentId: data.parentId.present ? data.parentId.value : this.parentId,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      errorMessage: data.errorMessage.present
          ? data.errorMessage.value
          : this.errorMessage,
    );
  }

  @override
  String toString() {
    return (StringBuffer('PendingCatalogCreate(')
          ..write('tempId: $tempId, ')
          ..write('ownerId: $ownerId, ')
          ..write('entityType: $entityType, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('normalizedName: $normalizedName, ')
          ..write('parentId: $parentId, ')
          ..write('createdAt: $createdAt, ')
          ..write('errorMessage: $errorMessage')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    tempId,
    ownerId,
    entityType,
    payloadJson,
    normalizedName,
    parentId,
    createdAt,
    errorMessage,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PendingCatalogCreate &&
          other.tempId == this.tempId &&
          other.ownerId == this.ownerId &&
          other.entityType == this.entityType &&
          other.payloadJson == this.payloadJson &&
          other.normalizedName == this.normalizedName &&
          other.parentId == this.parentId &&
          other.createdAt == this.createdAt &&
          other.errorMessage == this.errorMessage);
}

class PendingCatalogCreatesCompanion
    extends UpdateCompanion<PendingCatalogCreate> {
  final Value<String> tempId;
  final Value<String> ownerId;
  final Value<String> entityType;
  final Value<String> payloadJson;
  final Value<String> normalizedName;
  final Value<String?> parentId;
  final Value<int> createdAt;
  final Value<String?> errorMessage;
  final Value<int> rowid;
  const PendingCatalogCreatesCompanion({
    this.tempId = const Value.absent(),
    this.ownerId = const Value.absent(),
    this.entityType = const Value.absent(),
    this.payloadJson = const Value.absent(),
    this.normalizedName = const Value.absent(),
    this.parentId = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.errorMessage = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  PendingCatalogCreatesCompanion.insert({
    required String tempId,
    required String ownerId,
    required String entityType,
    required String payloadJson,
    required String normalizedName,
    this.parentId = const Value.absent(),
    required int createdAt,
    this.errorMessage = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : tempId = Value(tempId),
       ownerId = Value(ownerId),
       entityType = Value(entityType),
       payloadJson = Value(payloadJson),
       normalizedName = Value(normalizedName),
       createdAt = Value(createdAt);
  static Insertable<PendingCatalogCreate> custom({
    Expression<String>? tempId,
    Expression<String>? ownerId,
    Expression<String>? entityType,
    Expression<String>? payloadJson,
    Expression<String>? normalizedName,
    Expression<String>? parentId,
    Expression<int>? createdAt,
    Expression<String>? errorMessage,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (tempId != null) 'temp_id': tempId,
      if (ownerId != null) 'owner_id': ownerId,
      if (entityType != null) 'entity_type': entityType,
      if (payloadJson != null) 'payload_json': payloadJson,
      if (normalizedName != null) 'normalized_name': normalizedName,
      if (parentId != null) 'parent_id': parentId,
      if (createdAt != null) 'created_at': createdAt,
      if (errorMessage != null) 'error_message': errorMessage,
      if (rowid != null) 'rowid': rowid,
    });
  }

  PendingCatalogCreatesCompanion copyWith({
    Value<String>? tempId,
    Value<String>? ownerId,
    Value<String>? entityType,
    Value<String>? payloadJson,
    Value<String>? normalizedName,
    Value<String?>? parentId,
    Value<int>? createdAt,
    Value<String?>? errorMessage,
    Value<int>? rowid,
  }) {
    return PendingCatalogCreatesCompanion(
      tempId: tempId ?? this.tempId,
      ownerId: ownerId ?? this.ownerId,
      entityType: entityType ?? this.entityType,
      payloadJson: payloadJson ?? this.payloadJson,
      normalizedName: normalizedName ?? this.normalizedName,
      parentId: parentId ?? this.parentId,
      createdAt: createdAt ?? this.createdAt,
      errorMessage: errorMessage ?? this.errorMessage,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (tempId.present) {
      map['temp_id'] = Variable<String>(tempId.value);
    }
    if (ownerId.present) {
      map['owner_id'] = Variable<String>(ownerId.value);
    }
    if (entityType.present) {
      map['entity_type'] = Variable<String>(entityType.value);
    }
    if (payloadJson.present) {
      map['payload_json'] = Variable<String>(payloadJson.value);
    }
    if (normalizedName.present) {
      map['normalized_name'] = Variable<String>(normalizedName.value);
    }
    if (parentId.present) {
      map['parent_id'] = Variable<String>(parentId.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (errorMessage.present) {
      map['error_message'] = Variable<String>(errorMessage.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('PendingCatalogCreatesCompanion(')
          ..write('tempId: $tempId, ')
          ..write('ownerId: $ownerId, ')
          ..write('entityType: $entityType, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('normalizedName: $normalizedName, ')
          ..write('parentId: $parentId, ')
          ..write('createdAt: $createdAt, ')
          ..write('errorMessage: $errorMessage, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class CatalogIdMappings extends Table
    with TableInfo<CatalogIdMappings, CatalogIdMapping> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  CatalogIdMappings(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _tempIdMeta = const VerificationMeta('tempId');
  late final GeneratedColumn<String> tempId = GeneratedColumn<String>(
    'temp_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _ownerIdMeta = const VerificationMeta(
    'ownerId',
  );
  late final GeneratedColumn<String> ownerId = GeneratedColumn<String>(
    'owner_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _serverIdMeta = const VerificationMeta(
    'serverId',
  );
  late final GeneratedColumn<String> serverId = GeneratedColumn<String>(
    'server_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _entityTypeMeta = const VerificationMeta(
    'entityType',
  );
  late final GeneratedColumn<String> entityType = GeneratedColumn<String>(
    'entity_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  @override
  List<GeneratedColumn> get $columns => [
    tempId,
    ownerId,
    serverId,
    entityType,
    createdAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'catalog_id_mappings';
  @override
  VerificationContext validateIntegrity(
    Insertable<CatalogIdMapping> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('temp_id')) {
      context.handle(
        _tempIdMeta,
        tempId.isAcceptableOrUnknown(data['temp_id']!, _tempIdMeta),
      );
    } else if (isInserting) {
      context.missing(_tempIdMeta);
    }
    if (data.containsKey('owner_id')) {
      context.handle(
        _ownerIdMeta,
        ownerId.isAcceptableOrUnknown(data['owner_id']!, _ownerIdMeta),
      );
    } else if (isInserting) {
      context.missing(_ownerIdMeta);
    }
    if (data.containsKey('server_id')) {
      context.handle(
        _serverIdMeta,
        serverId.isAcceptableOrUnknown(data['server_id']!, _serverIdMeta),
      );
    } else if (isInserting) {
      context.missing(_serverIdMeta);
    }
    if (data.containsKey('entity_type')) {
      context.handle(
        _entityTypeMeta,
        entityType.isAcceptableOrUnknown(data['entity_type']!, _entityTypeMeta),
      );
    } else if (isInserting) {
      context.missing(_entityTypeMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {tempId, ownerId};
  @override
  CatalogIdMapping map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CatalogIdMapping(
      tempId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}temp_id'],
      )!,
      ownerId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}owner_id'],
      )!,
      serverId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}server_id'],
      )!,
      entityType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}entity_type'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
    );
  }

  @override
  CatalogIdMappings createAlias(String alias) {
    return CatalogIdMappings(attachedDatabase, alias);
  }

  @override
  List<String> get customConstraints => const [
    'PRIMARY KEY(temp_id, owner_id)',
  ];
  @override
  bool get dontWriteConstraints => true;
}

class CatalogIdMapping extends DataClass
    implements Insertable<CatalogIdMapping> {
  final String tempId;
  final String ownerId;
  final String serverId;
  final String entityType;
  final int createdAt;
  const CatalogIdMapping({
    required this.tempId,
    required this.ownerId,
    required this.serverId,
    required this.entityType,
    required this.createdAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['temp_id'] = Variable<String>(tempId);
    map['owner_id'] = Variable<String>(ownerId);
    map['server_id'] = Variable<String>(serverId);
    map['entity_type'] = Variable<String>(entityType);
    map['created_at'] = Variable<int>(createdAt);
    return map;
  }

  CatalogIdMappingsCompanion toCompanion(bool nullToAbsent) {
    return CatalogIdMappingsCompanion(
      tempId: Value(tempId),
      ownerId: Value(ownerId),
      serverId: Value(serverId),
      entityType: Value(entityType),
      createdAt: Value(createdAt),
    );
  }

  factory CatalogIdMapping.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CatalogIdMapping(
      tempId: serializer.fromJson<String>(json['temp_id']),
      ownerId: serializer.fromJson<String>(json['owner_id']),
      serverId: serializer.fromJson<String>(json['server_id']),
      entityType: serializer.fromJson<String>(json['entity_type']),
      createdAt: serializer.fromJson<int>(json['created_at']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'temp_id': serializer.toJson<String>(tempId),
      'owner_id': serializer.toJson<String>(ownerId),
      'server_id': serializer.toJson<String>(serverId),
      'entity_type': serializer.toJson<String>(entityType),
      'created_at': serializer.toJson<int>(createdAt),
    };
  }

  CatalogIdMapping copyWith({
    String? tempId,
    String? ownerId,
    String? serverId,
    String? entityType,
    int? createdAt,
  }) => CatalogIdMapping(
    tempId: tempId ?? this.tempId,
    ownerId: ownerId ?? this.ownerId,
    serverId: serverId ?? this.serverId,
    entityType: entityType ?? this.entityType,
    createdAt: createdAt ?? this.createdAt,
  );
  CatalogIdMapping copyWithCompanion(CatalogIdMappingsCompanion data) {
    return CatalogIdMapping(
      tempId: data.tempId.present ? data.tempId.value : this.tempId,
      ownerId: data.ownerId.present ? data.ownerId.value : this.ownerId,
      serverId: data.serverId.present ? data.serverId.value : this.serverId,
      entityType: data.entityType.present
          ? data.entityType.value
          : this.entityType,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CatalogIdMapping(')
          ..write('tempId: $tempId, ')
          ..write('ownerId: $ownerId, ')
          ..write('serverId: $serverId, ')
          ..write('entityType: $entityType, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(tempId, ownerId, serverId, entityType, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CatalogIdMapping &&
          other.tempId == this.tempId &&
          other.ownerId == this.ownerId &&
          other.serverId == this.serverId &&
          other.entityType == this.entityType &&
          other.createdAt == this.createdAt);
}

class CatalogIdMappingsCompanion extends UpdateCompanion<CatalogIdMapping> {
  final Value<String> tempId;
  final Value<String> ownerId;
  final Value<String> serverId;
  final Value<String> entityType;
  final Value<int> createdAt;
  final Value<int> rowid;
  const CatalogIdMappingsCompanion({
    this.tempId = const Value.absent(),
    this.ownerId = const Value.absent(),
    this.serverId = const Value.absent(),
    this.entityType = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CatalogIdMappingsCompanion.insert({
    required String tempId,
    required String ownerId,
    required String serverId,
    required String entityType,
    required int createdAt,
    this.rowid = const Value.absent(),
  }) : tempId = Value(tempId),
       ownerId = Value(ownerId),
       serverId = Value(serverId),
       entityType = Value(entityType),
       createdAt = Value(createdAt);
  static Insertable<CatalogIdMapping> custom({
    Expression<String>? tempId,
    Expression<String>? ownerId,
    Expression<String>? serverId,
    Expression<String>? entityType,
    Expression<int>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (tempId != null) 'temp_id': tempId,
      if (ownerId != null) 'owner_id': ownerId,
      if (serverId != null) 'server_id': serverId,
      if (entityType != null) 'entity_type': entityType,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CatalogIdMappingsCompanion copyWith({
    Value<String>? tempId,
    Value<String>? ownerId,
    Value<String>? serverId,
    Value<String>? entityType,
    Value<int>? createdAt,
    Value<int>? rowid,
  }) {
    return CatalogIdMappingsCompanion(
      tempId: tempId ?? this.tempId,
      ownerId: ownerId ?? this.ownerId,
      serverId: serverId ?? this.serverId,
      entityType: entityType ?? this.entityType,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (tempId.present) {
      map['temp_id'] = Variable<String>(tempId.value);
    }
    if (ownerId.present) {
      map['owner_id'] = Variable<String>(ownerId.value);
    }
    if (serverId.present) {
      map['server_id'] = Variable<String>(serverId.value);
    }
    if (entityType.present) {
      map['entity_type'] = Variable<String>(entityType.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CatalogIdMappingsCompanion(')
          ..write('tempId: $tempId, ')
          ..write('ownerId: $ownerId, ')
          ..write('serverId: $serverId, ')
          ..write('entityType: $entityType, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final PendingUploads pendingUploads = PendingUploads(this);
  late final Index idxPendingUploadsOwnerStatus = Index(
    'idx_pending_uploads_owner_status',
    'CREATE INDEX idx_pending_uploads_owner_status ON pending_uploads (owner_id, status)',
  );
  late final CatalogProperties catalogProperties = CatalogProperties(this);
  late final Index idxCatalogPropertiesOwner = Index(
    'idx_catalog_properties_owner',
    'CREATE INDEX idx_catalog_properties_owner ON catalog_properties (owner_id)',
  );
  late final CatalogTalhoes catalogTalhoes = CatalogTalhoes(this);
  late final Index idxCatalogTalhoesOwner = Index(
    'idx_catalog_talhoes_owner',
    'CREATE INDEX idx_catalog_talhoes_owner ON catalog_talhoes (owner_id)',
  );
  late final CatalogCropTypes catalogCropTypes = CatalogCropTypes(this);
  late final Index idxCatalogCropTypesOwner = Index(
    'idx_catalog_crop_types_owner',
    'CREATE INDEX idx_catalog_crop_types_owner ON catalog_crop_types (owner_id)',
  );
  late final CatalogEstadios catalogEstadios = CatalogEstadios(this);
  late final Index idxCatalogEstadiosOwner = Index(
    'idx_catalog_estadios_owner',
    'CREATE INDEX idx_catalog_estadios_owner ON catalog_estadios (owner_id)',
  );
  late final PendingCatalogCreates pendingCatalogCreates =
      PendingCatalogCreates(this);
  late final Index idxPendingCatalogCreatesOwner = Index(
    'idx_pending_catalog_creates_owner',
    'CREATE INDEX idx_pending_catalog_creates_owner ON pending_catalog_creates (owner_id)',
  );
  late final CatalogIdMappings catalogIdMappings = CatalogIdMappings(this);
  late final Index idxCatalogIdMappingsOwner = Index(
    'idx_catalog_id_mappings_owner',
    'CREATE INDEX idx_catalog_id_mappings_owner ON catalog_id_mappings (owner_id)',
  );
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    pendingUploads,
    idxPendingUploadsOwnerStatus,
    catalogProperties,
    idxCatalogPropertiesOwner,
    catalogTalhoes,
    idxCatalogTalhoesOwner,
    catalogCropTypes,
    idxCatalogCropTypesOwner,
    catalogEstadios,
    idxCatalogEstadiosOwner,
    pendingCatalogCreates,
    idxPendingCatalogCreatesOwner,
    catalogIdMappings,
    idxCatalogIdMappingsOwner,
  ];
}

typedef $PendingUploadsCreateCompanionBuilder =
    PendingUploadsCompanion Function({
      required String id,
      required String ownerId,
      required String imagesJson,
      required int createdAt,
      required int activityDate,
      required String status,
      Value<String?> errorMessage,
      Value<String?> propertyId,
      Value<String?> talhaoId,
      Value<String?> cropTypeId,
      Value<String?> estadioId,
      Value<String?> source,
      Value<String?> backendUploadId,
      Value<String?> backendStatus,
      Value<String?> backendError,
      Value<String?> syncErrorCode,
      Value<int> syncAttemptCount,
      Value<int?> lastSyncAttemptAt,
      Value<int> rowid,
    });
typedef $PendingUploadsUpdateCompanionBuilder =
    PendingUploadsCompanion Function({
      Value<String> id,
      Value<String> ownerId,
      Value<String> imagesJson,
      Value<int> createdAt,
      Value<int> activityDate,
      Value<String> status,
      Value<String?> errorMessage,
      Value<String?> propertyId,
      Value<String?> talhaoId,
      Value<String?> cropTypeId,
      Value<String?> estadioId,
      Value<String?> source,
      Value<String?> backendUploadId,
      Value<String?> backendStatus,
      Value<String?> backendError,
      Value<String?> syncErrorCode,
      Value<int> syncAttemptCount,
      Value<int?> lastSyncAttemptAt,
      Value<int> rowid,
    });

class $PendingUploadsFilterComposer
    extends Composer<_$AppDatabase, PendingUploads> {
  $PendingUploadsFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get ownerId => $composableBuilder(
    column: $table.ownerId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get imagesJson => $composableBuilder(
    column: $table.imagesJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get activityDate => $composableBuilder(
    column: $table.activityDate,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get errorMessage => $composableBuilder(
    column: $table.errorMessage,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get propertyId => $composableBuilder(
    column: $table.propertyId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get talhaoId => $composableBuilder(
    column: $table.talhaoId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get cropTypeId => $composableBuilder(
    column: $table.cropTypeId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get estadioId => $composableBuilder(
    column: $table.estadioId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get source => $composableBuilder(
    column: $table.source,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get backendUploadId => $composableBuilder(
    column: $table.backendUploadId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get backendStatus => $composableBuilder(
    column: $table.backendStatus,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get backendError => $composableBuilder(
    column: $table.backendError,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get syncErrorCode => $composableBuilder(
    column: $table.syncErrorCode,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get syncAttemptCount => $composableBuilder(
    column: $table.syncAttemptCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get lastSyncAttemptAt => $composableBuilder(
    column: $table.lastSyncAttemptAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $PendingUploadsOrderingComposer
    extends Composer<_$AppDatabase, PendingUploads> {
  $PendingUploadsOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get ownerId => $composableBuilder(
    column: $table.ownerId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get imagesJson => $composableBuilder(
    column: $table.imagesJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get activityDate => $composableBuilder(
    column: $table.activityDate,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get errorMessage => $composableBuilder(
    column: $table.errorMessage,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get propertyId => $composableBuilder(
    column: $table.propertyId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get talhaoId => $composableBuilder(
    column: $table.talhaoId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get cropTypeId => $composableBuilder(
    column: $table.cropTypeId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get estadioId => $composableBuilder(
    column: $table.estadioId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get source => $composableBuilder(
    column: $table.source,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get backendUploadId => $composableBuilder(
    column: $table.backendUploadId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get backendStatus => $composableBuilder(
    column: $table.backendStatus,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get backendError => $composableBuilder(
    column: $table.backendError,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get syncErrorCode => $composableBuilder(
    column: $table.syncErrorCode,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get syncAttemptCount => $composableBuilder(
    column: $table.syncAttemptCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get lastSyncAttemptAt => $composableBuilder(
    column: $table.lastSyncAttemptAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $PendingUploadsAnnotationComposer
    extends Composer<_$AppDatabase, PendingUploads> {
  $PendingUploadsAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get ownerId =>
      $composableBuilder(column: $table.ownerId, builder: (column) => column);

  GeneratedColumn<String> get imagesJson => $composableBuilder(
    column: $table.imagesJson,
    builder: (column) => column,
  );

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<int> get activityDate => $composableBuilder(
    column: $table.activityDate,
    builder: (column) => column,
  );

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<String> get errorMessage => $composableBuilder(
    column: $table.errorMessage,
    builder: (column) => column,
  );

  GeneratedColumn<String> get propertyId => $composableBuilder(
    column: $table.propertyId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get talhaoId =>
      $composableBuilder(column: $table.talhaoId, builder: (column) => column);

  GeneratedColumn<String> get cropTypeId => $composableBuilder(
    column: $table.cropTypeId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get estadioId =>
      $composableBuilder(column: $table.estadioId, builder: (column) => column);

  GeneratedColumn<String> get source =>
      $composableBuilder(column: $table.source, builder: (column) => column);

  GeneratedColumn<String> get backendUploadId => $composableBuilder(
    column: $table.backendUploadId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get backendStatus => $composableBuilder(
    column: $table.backendStatus,
    builder: (column) => column,
  );

  GeneratedColumn<String> get backendError => $composableBuilder(
    column: $table.backendError,
    builder: (column) => column,
  );

  GeneratedColumn<String> get syncErrorCode => $composableBuilder(
    column: $table.syncErrorCode,
    builder: (column) => column,
  );

  GeneratedColumn<int> get syncAttemptCount => $composableBuilder(
    column: $table.syncAttemptCount,
    builder: (column) => column,
  );

  GeneratedColumn<int> get lastSyncAttemptAt => $composableBuilder(
    column: $table.lastSyncAttemptAt,
    builder: (column) => column,
  );
}

class $PendingUploadsTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          PendingUploads,
          PendingUpload,
          $PendingUploadsFilterComposer,
          $PendingUploadsOrderingComposer,
          $PendingUploadsAnnotationComposer,
          $PendingUploadsCreateCompanionBuilder,
          $PendingUploadsUpdateCompanionBuilder,
          (
            PendingUpload,
            BaseReferences<_$AppDatabase, PendingUploads, PendingUpload>,
          ),
          PendingUpload,
          PrefetchHooks Function()
        > {
  $PendingUploadsTableManager(_$AppDatabase db, PendingUploads table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $PendingUploadsFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $PendingUploadsOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $PendingUploadsAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> ownerId = const Value.absent(),
                Value<String> imagesJson = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> activityDate = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<String?> errorMessage = const Value.absent(),
                Value<String?> propertyId = const Value.absent(),
                Value<String?> talhaoId = const Value.absent(),
                Value<String?> cropTypeId = const Value.absent(),
                Value<String?> estadioId = const Value.absent(),
                Value<String?> source = const Value.absent(),
                Value<String?> backendUploadId = const Value.absent(),
                Value<String?> backendStatus = const Value.absent(),
                Value<String?> backendError = const Value.absent(),
                Value<String?> syncErrorCode = const Value.absent(),
                Value<int> syncAttemptCount = const Value.absent(),
                Value<int?> lastSyncAttemptAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PendingUploadsCompanion(
                id: id,
                ownerId: ownerId,
                imagesJson: imagesJson,
                createdAt: createdAt,
                activityDate: activityDate,
                status: status,
                errorMessage: errorMessage,
                propertyId: propertyId,
                talhaoId: talhaoId,
                cropTypeId: cropTypeId,
                estadioId: estadioId,
                source: source,
                backendUploadId: backendUploadId,
                backendStatus: backendStatus,
                backendError: backendError,
                syncErrorCode: syncErrorCode,
                syncAttemptCount: syncAttemptCount,
                lastSyncAttemptAt: lastSyncAttemptAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String ownerId,
                required String imagesJson,
                required int createdAt,
                required int activityDate,
                required String status,
                Value<String?> errorMessage = const Value.absent(),
                Value<String?> propertyId = const Value.absent(),
                Value<String?> talhaoId = const Value.absent(),
                Value<String?> cropTypeId = const Value.absent(),
                Value<String?> estadioId = const Value.absent(),
                Value<String?> source = const Value.absent(),
                Value<String?> backendUploadId = const Value.absent(),
                Value<String?> backendStatus = const Value.absent(),
                Value<String?> backendError = const Value.absent(),
                Value<String?> syncErrorCode = const Value.absent(),
                Value<int> syncAttemptCount = const Value.absent(),
                Value<int?> lastSyncAttemptAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PendingUploadsCompanion.insert(
                id: id,
                ownerId: ownerId,
                imagesJson: imagesJson,
                createdAt: createdAt,
                activityDate: activityDate,
                status: status,
                errorMessage: errorMessage,
                propertyId: propertyId,
                talhaoId: talhaoId,
                cropTypeId: cropTypeId,
                estadioId: estadioId,
                source: source,
                backendUploadId: backendUploadId,
                backendStatus: backendStatus,
                backendError: backendError,
                syncErrorCode: syncErrorCode,
                syncAttemptCount: syncAttemptCount,
                lastSyncAttemptAt: lastSyncAttemptAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<PendingUploads, PendingUpload>(table),
                  BaseReferences<_$AppDatabase, PendingUploads, PendingUpload>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $PendingUploadsProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      PendingUploads,
      PendingUpload,
      $PendingUploadsFilterComposer,
      $PendingUploadsOrderingComposer,
      $PendingUploadsAnnotationComposer,
      $PendingUploadsCreateCompanionBuilder,
      $PendingUploadsUpdateCompanionBuilder,
      (
        PendingUpload,
        BaseReferences<_$AppDatabase, PendingUploads, PendingUpload>,
      ),
      PendingUpload,
      PrefetchHooks Function()
    >;
typedef $CatalogPropertiesCreateCompanionBuilder =
    CatalogPropertiesCompanion Function({
      required String id,
      required String ownerId,
      required String data,
      required int cachedAt,
      Value<int> isPendingSync,
      Value<String?> syncError,
      Value<int> rowid,
    });
typedef $CatalogPropertiesUpdateCompanionBuilder =
    CatalogPropertiesCompanion Function({
      Value<String> id,
      Value<String> ownerId,
      Value<String> data,
      Value<int> cachedAt,
      Value<int> isPendingSync,
      Value<String?> syncError,
      Value<int> rowid,
    });

class $CatalogPropertiesFilterComposer
    extends Composer<_$AppDatabase, CatalogProperties> {
  $CatalogPropertiesFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get ownerId => $composableBuilder(
    column: $table.ownerId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get data => $composableBuilder(
    column: $table.data,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get cachedAt => $composableBuilder(
    column: $table.cachedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get isPendingSync => $composableBuilder(
    column: $table.isPendingSync,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get syncError => $composableBuilder(
    column: $table.syncError,
    builder: (column) => ColumnFilters(column),
  );
}

class $CatalogPropertiesOrderingComposer
    extends Composer<_$AppDatabase, CatalogProperties> {
  $CatalogPropertiesOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get ownerId => $composableBuilder(
    column: $table.ownerId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get data => $composableBuilder(
    column: $table.data,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get cachedAt => $composableBuilder(
    column: $table.cachedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get isPendingSync => $composableBuilder(
    column: $table.isPendingSync,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get syncError => $composableBuilder(
    column: $table.syncError,
    builder: (column) => ColumnOrderings(column),
  );
}

class $CatalogPropertiesAnnotationComposer
    extends Composer<_$AppDatabase, CatalogProperties> {
  $CatalogPropertiesAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get ownerId =>
      $composableBuilder(column: $table.ownerId, builder: (column) => column);

  GeneratedColumn<String> get data =>
      $composableBuilder(column: $table.data, builder: (column) => column);

  GeneratedColumn<int> get cachedAt =>
      $composableBuilder(column: $table.cachedAt, builder: (column) => column);

  GeneratedColumn<int> get isPendingSync => $composableBuilder(
    column: $table.isPendingSync,
    builder: (column) => column,
  );

  GeneratedColumn<String> get syncError =>
      $composableBuilder(column: $table.syncError, builder: (column) => column);
}

class $CatalogPropertiesTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          CatalogProperties,
          CatalogProperty,
          $CatalogPropertiesFilterComposer,
          $CatalogPropertiesOrderingComposer,
          $CatalogPropertiesAnnotationComposer,
          $CatalogPropertiesCreateCompanionBuilder,
          $CatalogPropertiesUpdateCompanionBuilder,
          (
            CatalogProperty,
            BaseReferences<_$AppDatabase, CatalogProperties, CatalogProperty>,
          ),
          CatalogProperty,
          PrefetchHooks Function()
        > {
  $CatalogPropertiesTableManager(_$AppDatabase db, CatalogProperties table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $CatalogPropertiesFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $CatalogPropertiesOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $CatalogPropertiesAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> ownerId = const Value.absent(),
                Value<String> data = const Value.absent(),
                Value<int> cachedAt = const Value.absent(),
                Value<int> isPendingSync = const Value.absent(),
                Value<String?> syncError = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CatalogPropertiesCompanion(
                id: id,
                ownerId: ownerId,
                data: data,
                cachedAt: cachedAt,
                isPendingSync: isPendingSync,
                syncError: syncError,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String ownerId,
                required String data,
                required int cachedAt,
                Value<int> isPendingSync = const Value.absent(),
                Value<String?> syncError = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CatalogPropertiesCompanion.insert(
                id: id,
                ownerId: ownerId,
                data: data,
                cachedAt: cachedAt,
                isPendingSync: isPendingSync,
                syncError: syncError,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<CatalogProperties, CatalogProperty>(table),
                  BaseReferences<
                    _$AppDatabase,
                    CatalogProperties,
                    CatalogProperty
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $CatalogPropertiesProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      CatalogProperties,
      CatalogProperty,
      $CatalogPropertiesFilterComposer,
      $CatalogPropertiesOrderingComposer,
      $CatalogPropertiesAnnotationComposer,
      $CatalogPropertiesCreateCompanionBuilder,
      $CatalogPropertiesUpdateCompanionBuilder,
      (
        CatalogProperty,
        BaseReferences<_$AppDatabase, CatalogProperties, CatalogProperty>,
      ),
      CatalogProperty,
      PrefetchHooks Function()
    >;
typedef $CatalogTalhoesCreateCompanionBuilder =
    CatalogTalhoesCompanion Function({
      required String id,
      required String ownerId,
      required String data,
      required int cachedAt,
      Value<int> isPendingSync,
      Value<String?> syncError,
      Value<int> rowid,
    });
typedef $CatalogTalhoesUpdateCompanionBuilder =
    CatalogTalhoesCompanion Function({
      Value<String> id,
      Value<String> ownerId,
      Value<String> data,
      Value<int> cachedAt,
      Value<int> isPendingSync,
      Value<String?> syncError,
      Value<int> rowid,
    });

class $CatalogTalhoesFilterComposer
    extends Composer<_$AppDatabase, CatalogTalhoes> {
  $CatalogTalhoesFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get ownerId => $composableBuilder(
    column: $table.ownerId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get data => $composableBuilder(
    column: $table.data,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get cachedAt => $composableBuilder(
    column: $table.cachedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get isPendingSync => $composableBuilder(
    column: $table.isPendingSync,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get syncError => $composableBuilder(
    column: $table.syncError,
    builder: (column) => ColumnFilters(column),
  );
}

class $CatalogTalhoesOrderingComposer
    extends Composer<_$AppDatabase, CatalogTalhoes> {
  $CatalogTalhoesOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get ownerId => $composableBuilder(
    column: $table.ownerId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get data => $composableBuilder(
    column: $table.data,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get cachedAt => $composableBuilder(
    column: $table.cachedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get isPendingSync => $composableBuilder(
    column: $table.isPendingSync,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get syncError => $composableBuilder(
    column: $table.syncError,
    builder: (column) => ColumnOrderings(column),
  );
}

class $CatalogTalhoesAnnotationComposer
    extends Composer<_$AppDatabase, CatalogTalhoes> {
  $CatalogTalhoesAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get ownerId =>
      $composableBuilder(column: $table.ownerId, builder: (column) => column);

  GeneratedColumn<String> get data =>
      $composableBuilder(column: $table.data, builder: (column) => column);

  GeneratedColumn<int> get cachedAt =>
      $composableBuilder(column: $table.cachedAt, builder: (column) => column);

  GeneratedColumn<int> get isPendingSync => $composableBuilder(
    column: $table.isPendingSync,
    builder: (column) => column,
  );

  GeneratedColumn<String> get syncError =>
      $composableBuilder(column: $table.syncError, builder: (column) => column);
}

class $CatalogTalhoesTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          CatalogTalhoes,
          CatalogTalhoe,
          $CatalogTalhoesFilterComposer,
          $CatalogTalhoesOrderingComposer,
          $CatalogTalhoesAnnotationComposer,
          $CatalogTalhoesCreateCompanionBuilder,
          $CatalogTalhoesUpdateCompanionBuilder,
          (
            CatalogTalhoe,
            BaseReferences<_$AppDatabase, CatalogTalhoes, CatalogTalhoe>,
          ),
          CatalogTalhoe,
          PrefetchHooks Function()
        > {
  $CatalogTalhoesTableManager(_$AppDatabase db, CatalogTalhoes table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $CatalogTalhoesFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $CatalogTalhoesOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $CatalogTalhoesAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> ownerId = const Value.absent(),
                Value<String> data = const Value.absent(),
                Value<int> cachedAt = const Value.absent(),
                Value<int> isPendingSync = const Value.absent(),
                Value<String?> syncError = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CatalogTalhoesCompanion(
                id: id,
                ownerId: ownerId,
                data: data,
                cachedAt: cachedAt,
                isPendingSync: isPendingSync,
                syncError: syncError,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String ownerId,
                required String data,
                required int cachedAt,
                Value<int> isPendingSync = const Value.absent(),
                Value<String?> syncError = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CatalogTalhoesCompanion.insert(
                id: id,
                ownerId: ownerId,
                data: data,
                cachedAt: cachedAt,
                isPendingSync: isPendingSync,
                syncError: syncError,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<CatalogTalhoes, CatalogTalhoe>(table),
                  BaseReferences<_$AppDatabase, CatalogTalhoes, CatalogTalhoe>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $CatalogTalhoesProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      CatalogTalhoes,
      CatalogTalhoe,
      $CatalogTalhoesFilterComposer,
      $CatalogTalhoesOrderingComposer,
      $CatalogTalhoesAnnotationComposer,
      $CatalogTalhoesCreateCompanionBuilder,
      $CatalogTalhoesUpdateCompanionBuilder,
      (
        CatalogTalhoe,
        BaseReferences<_$AppDatabase, CatalogTalhoes, CatalogTalhoe>,
      ),
      CatalogTalhoe,
      PrefetchHooks Function()
    >;
typedef $CatalogCropTypesCreateCompanionBuilder =
    CatalogCropTypesCompanion Function({
      required String id,
      required String ownerId,
      required String data,
      required int cachedAt,
      Value<int> isPendingSync,
      Value<String?> syncError,
      Value<int> rowid,
    });
typedef $CatalogCropTypesUpdateCompanionBuilder =
    CatalogCropTypesCompanion Function({
      Value<String> id,
      Value<String> ownerId,
      Value<String> data,
      Value<int> cachedAt,
      Value<int> isPendingSync,
      Value<String?> syncError,
      Value<int> rowid,
    });

class $CatalogCropTypesFilterComposer
    extends Composer<_$AppDatabase, CatalogCropTypes> {
  $CatalogCropTypesFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get ownerId => $composableBuilder(
    column: $table.ownerId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get data => $composableBuilder(
    column: $table.data,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get cachedAt => $composableBuilder(
    column: $table.cachedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get isPendingSync => $composableBuilder(
    column: $table.isPendingSync,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get syncError => $composableBuilder(
    column: $table.syncError,
    builder: (column) => ColumnFilters(column),
  );
}

class $CatalogCropTypesOrderingComposer
    extends Composer<_$AppDatabase, CatalogCropTypes> {
  $CatalogCropTypesOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get ownerId => $composableBuilder(
    column: $table.ownerId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get data => $composableBuilder(
    column: $table.data,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get cachedAt => $composableBuilder(
    column: $table.cachedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get isPendingSync => $composableBuilder(
    column: $table.isPendingSync,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get syncError => $composableBuilder(
    column: $table.syncError,
    builder: (column) => ColumnOrderings(column),
  );
}

class $CatalogCropTypesAnnotationComposer
    extends Composer<_$AppDatabase, CatalogCropTypes> {
  $CatalogCropTypesAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get ownerId =>
      $composableBuilder(column: $table.ownerId, builder: (column) => column);

  GeneratedColumn<String> get data =>
      $composableBuilder(column: $table.data, builder: (column) => column);

  GeneratedColumn<int> get cachedAt =>
      $composableBuilder(column: $table.cachedAt, builder: (column) => column);

  GeneratedColumn<int> get isPendingSync => $composableBuilder(
    column: $table.isPendingSync,
    builder: (column) => column,
  );

  GeneratedColumn<String> get syncError =>
      $composableBuilder(column: $table.syncError, builder: (column) => column);
}

class $CatalogCropTypesTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          CatalogCropTypes,
          CatalogCropType,
          $CatalogCropTypesFilterComposer,
          $CatalogCropTypesOrderingComposer,
          $CatalogCropTypesAnnotationComposer,
          $CatalogCropTypesCreateCompanionBuilder,
          $CatalogCropTypesUpdateCompanionBuilder,
          (
            CatalogCropType,
            BaseReferences<_$AppDatabase, CatalogCropTypes, CatalogCropType>,
          ),
          CatalogCropType,
          PrefetchHooks Function()
        > {
  $CatalogCropTypesTableManager(_$AppDatabase db, CatalogCropTypes table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $CatalogCropTypesFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $CatalogCropTypesOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $CatalogCropTypesAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> ownerId = const Value.absent(),
                Value<String> data = const Value.absent(),
                Value<int> cachedAt = const Value.absent(),
                Value<int> isPendingSync = const Value.absent(),
                Value<String?> syncError = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CatalogCropTypesCompanion(
                id: id,
                ownerId: ownerId,
                data: data,
                cachedAt: cachedAt,
                isPendingSync: isPendingSync,
                syncError: syncError,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String ownerId,
                required String data,
                required int cachedAt,
                Value<int> isPendingSync = const Value.absent(),
                Value<String?> syncError = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CatalogCropTypesCompanion.insert(
                id: id,
                ownerId: ownerId,
                data: data,
                cachedAt: cachedAt,
                isPendingSync: isPendingSync,
                syncError: syncError,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<CatalogCropTypes, CatalogCropType>(table),
                  BaseReferences<
                    _$AppDatabase,
                    CatalogCropTypes,
                    CatalogCropType
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $CatalogCropTypesProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      CatalogCropTypes,
      CatalogCropType,
      $CatalogCropTypesFilterComposer,
      $CatalogCropTypesOrderingComposer,
      $CatalogCropTypesAnnotationComposer,
      $CatalogCropTypesCreateCompanionBuilder,
      $CatalogCropTypesUpdateCompanionBuilder,
      (
        CatalogCropType,
        BaseReferences<_$AppDatabase, CatalogCropTypes, CatalogCropType>,
      ),
      CatalogCropType,
      PrefetchHooks Function()
    >;
typedef $CatalogEstadiosCreateCompanionBuilder =
    CatalogEstadiosCompanion Function({
      required String id,
      required String ownerId,
      required String data,
      required int cachedAt,
      Value<int> isPendingSync,
      Value<String?> syncError,
      Value<int> rowid,
    });
typedef $CatalogEstadiosUpdateCompanionBuilder =
    CatalogEstadiosCompanion Function({
      Value<String> id,
      Value<String> ownerId,
      Value<String> data,
      Value<int> cachedAt,
      Value<int> isPendingSync,
      Value<String?> syncError,
      Value<int> rowid,
    });

class $CatalogEstadiosFilterComposer
    extends Composer<_$AppDatabase, CatalogEstadios> {
  $CatalogEstadiosFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get ownerId => $composableBuilder(
    column: $table.ownerId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get data => $composableBuilder(
    column: $table.data,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get cachedAt => $composableBuilder(
    column: $table.cachedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get isPendingSync => $composableBuilder(
    column: $table.isPendingSync,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get syncError => $composableBuilder(
    column: $table.syncError,
    builder: (column) => ColumnFilters(column),
  );
}

class $CatalogEstadiosOrderingComposer
    extends Composer<_$AppDatabase, CatalogEstadios> {
  $CatalogEstadiosOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get ownerId => $composableBuilder(
    column: $table.ownerId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get data => $composableBuilder(
    column: $table.data,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get cachedAt => $composableBuilder(
    column: $table.cachedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get isPendingSync => $composableBuilder(
    column: $table.isPendingSync,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get syncError => $composableBuilder(
    column: $table.syncError,
    builder: (column) => ColumnOrderings(column),
  );
}

class $CatalogEstadiosAnnotationComposer
    extends Composer<_$AppDatabase, CatalogEstadios> {
  $CatalogEstadiosAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get ownerId =>
      $composableBuilder(column: $table.ownerId, builder: (column) => column);

  GeneratedColumn<String> get data =>
      $composableBuilder(column: $table.data, builder: (column) => column);

  GeneratedColumn<int> get cachedAt =>
      $composableBuilder(column: $table.cachedAt, builder: (column) => column);

  GeneratedColumn<int> get isPendingSync => $composableBuilder(
    column: $table.isPendingSync,
    builder: (column) => column,
  );

  GeneratedColumn<String> get syncError =>
      $composableBuilder(column: $table.syncError, builder: (column) => column);
}

class $CatalogEstadiosTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          CatalogEstadios,
          CatalogEstadio,
          $CatalogEstadiosFilterComposer,
          $CatalogEstadiosOrderingComposer,
          $CatalogEstadiosAnnotationComposer,
          $CatalogEstadiosCreateCompanionBuilder,
          $CatalogEstadiosUpdateCompanionBuilder,
          (
            CatalogEstadio,
            BaseReferences<_$AppDatabase, CatalogEstadios, CatalogEstadio>,
          ),
          CatalogEstadio,
          PrefetchHooks Function()
        > {
  $CatalogEstadiosTableManager(_$AppDatabase db, CatalogEstadios table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $CatalogEstadiosFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $CatalogEstadiosOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $CatalogEstadiosAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> ownerId = const Value.absent(),
                Value<String> data = const Value.absent(),
                Value<int> cachedAt = const Value.absent(),
                Value<int> isPendingSync = const Value.absent(),
                Value<String?> syncError = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CatalogEstadiosCompanion(
                id: id,
                ownerId: ownerId,
                data: data,
                cachedAt: cachedAt,
                isPendingSync: isPendingSync,
                syncError: syncError,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String ownerId,
                required String data,
                required int cachedAt,
                Value<int> isPendingSync = const Value.absent(),
                Value<String?> syncError = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CatalogEstadiosCompanion.insert(
                id: id,
                ownerId: ownerId,
                data: data,
                cachedAt: cachedAt,
                isPendingSync: isPendingSync,
                syncError: syncError,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<CatalogEstadios, CatalogEstadio>(table),
                  BaseReferences<
                    _$AppDatabase,
                    CatalogEstadios,
                    CatalogEstadio
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $CatalogEstadiosProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      CatalogEstadios,
      CatalogEstadio,
      $CatalogEstadiosFilterComposer,
      $CatalogEstadiosOrderingComposer,
      $CatalogEstadiosAnnotationComposer,
      $CatalogEstadiosCreateCompanionBuilder,
      $CatalogEstadiosUpdateCompanionBuilder,
      (
        CatalogEstadio,
        BaseReferences<_$AppDatabase, CatalogEstadios, CatalogEstadio>,
      ),
      CatalogEstadio,
      PrefetchHooks Function()
    >;
typedef $PendingCatalogCreatesCreateCompanionBuilder =
    PendingCatalogCreatesCompanion Function({
      required String tempId,
      required String ownerId,
      required String entityType,
      required String payloadJson,
      required String normalizedName,
      Value<String?> parentId,
      required int createdAt,
      Value<String?> errorMessage,
      Value<int> rowid,
    });
typedef $PendingCatalogCreatesUpdateCompanionBuilder =
    PendingCatalogCreatesCompanion Function({
      Value<String> tempId,
      Value<String> ownerId,
      Value<String> entityType,
      Value<String> payloadJson,
      Value<String> normalizedName,
      Value<String?> parentId,
      Value<int> createdAt,
      Value<String?> errorMessage,
      Value<int> rowid,
    });

class $PendingCatalogCreatesFilterComposer
    extends Composer<_$AppDatabase, PendingCatalogCreates> {
  $PendingCatalogCreatesFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get tempId => $composableBuilder(
    column: $table.tempId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get ownerId => $composableBuilder(
    column: $table.ownerId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get entityType => $composableBuilder(
    column: $table.entityType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get normalizedName => $composableBuilder(
    column: $table.normalizedName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get parentId => $composableBuilder(
    column: $table.parentId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get errorMessage => $composableBuilder(
    column: $table.errorMessage,
    builder: (column) => ColumnFilters(column),
  );
}

class $PendingCatalogCreatesOrderingComposer
    extends Composer<_$AppDatabase, PendingCatalogCreates> {
  $PendingCatalogCreatesOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get tempId => $composableBuilder(
    column: $table.tempId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get ownerId => $composableBuilder(
    column: $table.ownerId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get entityType => $composableBuilder(
    column: $table.entityType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get normalizedName => $composableBuilder(
    column: $table.normalizedName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get parentId => $composableBuilder(
    column: $table.parentId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get errorMessage => $composableBuilder(
    column: $table.errorMessage,
    builder: (column) => ColumnOrderings(column),
  );
}

class $PendingCatalogCreatesAnnotationComposer
    extends Composer<_$AppDatabase, PendingCatalogCreates> {
  $PendingCatalogCreatesAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get tempId =>
      $composableBuilder(column: $table.tempId, builder: (column) => column);

  GeneratedColumn<String> get ownerId =>
      $composableBuilder(column: $table.ownerId, builder: (column) => column);

  GeneratedColumn<String> get entityType => $composableBuilder(
    column: $table.entityType,
    builder: (column) => column,
  );

  GeneratedColumn<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => column,
  );

  GeneratedColumn<String> get normalizedName => $composableBuilder(
    column: $table.normalizedName,
    builder: (column) => column,
  );

  GeneratedColumn<String> get parentId =>
      $composableBuilder(column: $table.parentId, builder: (column) => column);

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<String> get errorMessage => $composableBuilder(
    column: $table.errorMessage,
    builder: (column) => column,
  );
}

class $PendingCatalogCreatesTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          PendingCatalogCreates,
          PendingCatalogCreate,
          $PendingCatalogCreatesFilterComposer,
          $PendingCatalogCreatesOrderingComposer,
          $PendingCatalogCreatesAnnotationComposer,
          $PendingCatalogCreatesCreateCompanionBuilder,
          $PendingCatalogCreatesUpdateCompanionBuilder,
          (
            PendingCatalogCreate,
            BaseReferences<
              _$AppDatabase,
              PendingCatalogCreates,
              PendingCatalogCreate
            >,
          ),
          PendingCatalogCreate,
          PrefetchHooks Function()
        > {
  $PendingCatalogCreatesTableManager(
    _$AppDatabase db,
    PendingCatalogCreates table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $PendingCatalogCreatesFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $PendingCatalogCreatesOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $PendingCatalogCreatesAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> tempId = const Value.absent(),
                Value<String> ownerId = const Value.absent(),
                Value<String> entityType = const Value.absent(),
                Value<String> payloadJson = const Value.absent(),
                Value<String> normalizedName = const Value.absent(),
                Value<String?> parentId = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<String?> errorMessage = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PendingCatalogCreatesCompanion(
                tempId: tempId,
                ownerId: ownerId,
                entityType: entityType,
                payloadJson: payloadJson,
                normalizedName: normalizedName,
                parentId: parentId,
                createdAt: createdAt,
                errorMessage: errorMessage,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String tempId,
                required String ownerId,
                required String entityType,
                required String payloadJson,
                required String normalizedName,
                Value<String?> parentId = const Value.absent(),
                required int createdAt,
                Value<String?> errorMessage = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PendingCatalogCreatesCompanion.insert(
                tempId: tempId,
                ownerId: ownerId,
                entityType: entityType,
                payloadJson: payloadJson,
                normalizedName: normalizedName,
                parentId: parentId,
                createdAt: createdAt,
                errorMessage: errorMessage,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<PendingCatalogCreates, PendingCatalogCreate>(
                    table,
                  ),
                  BaseReferences<
                    _$AppDatabase,
                    PendingCatalogCreates,
                    PendingCatalogCreate
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $PendingCatalogCreatesProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      PendingCatalogCreates,
      PendingCatalogCreate,
      $PendingCatalogCreatesFilterComposer,
      $PendingCatalogCreatesOrderingComposer,
      $PendingCatalogCreatesAnnotationComposer,
      $PendingCatalogCreatesCreateCompanionBuilder,
      $PendingCatalogCreatesUpdateCompanionBuilder,
      (
        PendingCatalogCreate,
        BaseReferences<
          _$AppDatabase,
          PendingCatalogCreates,
          PendingCatalogCreate
        >,
      ),
      PendingCatalogCreate,
      PrefetchHooks Function()
    >;
typedef $CatalogIdMappingsCreateCompanionBuilder =
    CatalogIdMappingsCompanion Function({
      required String tempId,
      required String ownerId,
      required String serverId,
      required String entityType,
      required int createdAt,
      Value<int> rowid,
    });
typedef $CatalogIdMappingsUpdateCompanionBuilder =
    CatalogIdMappingsCompanion Function({
      Value<String> tempId,
      Value<String> ownerId,
      Value<String> serverId,
      Value<String> entityType,
      Value<int> createdAt,
      Value<int> rowid,
    });

class $CatalogIdMappingsFilterComposer
    extends Composer<_$AppDatabase, CatalogIdMappings> {
  $CatalogIdMappingsFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get tempId => $composableBuilder(
    column: $table.tempId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get ownerId => $composableBuilder(
    column: $table.ownerId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get serverId => $composableBuilder(
    column: $table.serverId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get entityType => $composableBuilder(
    column: $table.entityType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $CatalogIdMappingsOrderingComposer
    extends Composer<_$AppDatabase, CatalogIdMappings> {
  $CatalogIdMappingsOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get tempId => $composableBuilder(
    column: $table.tempId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get ownerId => $composableBuilder(
    column: $table.ownerId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get serverId => $composableBuilder(
    column: $table.serverId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get entityType => $composableBuilder(
    column: $table.entityType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $CatalogIdMappingsAnnotationComposer
    extends Composer<_$AppDatabase, CatalogIdMappings> {
  $CatalogIdMappingsAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get tempId =>
      $composableBuilder(column: $table.tempId, builder: (column) => column);

  GeneratedColumn<String> get ownerId =>
      $composableBuilder(column: $table.ownerId, builder: (column) => column);

  GeneratedColumn<String> get serverId =>
      $composableBuilder(column: $table.serverId, builder: (column) => column);

  GeneratedColumn<String> get entityType => $composableBuilder(
    column: $table.entityType,
    builder: (column) => column,
  );

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $CatalogIdMappingsTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          CatalogIdMappings,
          CatalogIdMapping,
          $CatalogIdMappingsFilterComposer,
          $CatalogIdMappingsOrderingComposer,
          $CatalogIdMappingsAnnotationComposer,
          $CatalogIdMappingsCreateCompanionBuilder,
          $CatalogIdMappingsUpdateCompanionBuilder,
          (
            CatalogIdMapping,
            BaseReferences<_$AppDatabase, CatalogIdMappings, CatalogIdMapping>,
          ),
          CatalogIdMapping,
          PrefetchHooks Function()
        > {
  $CatalogIdMappingsTableManager(_$AppDatabase db, CatalogIdMappings table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $CatalogIdMappingsFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $CatalogIdMappingsOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $CatalogIdMappingsAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> tempId = const Value.absent(),
                Value<String> ownerId = const Value.absent(),
                Value<String> serverId = const Value.absent(),
                Value<String> entityType = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CatalogIdMappingsCompanion(
                tempId: tempId,
                ownerId: ownerId,
                serverId: serverId,
                entityType: entityType,
                createdAt: createdAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String tempId,
                required String ownerId,
                required String serverId,
                required String entityType,
                required int createdAt,
                Value<int> rowid = const Value.absent(),
              }) => CatalogIdMappingsCompanion.insert(
                tempId: tempId,
                ownerId: ownerId,
                serverId: serverId,
                entityType: entityType,
                createdAt: createdAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<CatalogIdMappings, CatalogIdMapping>(table),
                  BaseReferences<
                    _$AppDatabase,
                    CatalogIdMappings,
                    CatalogIdMapping
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $CatalogIdMappingsProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      CatalogIdMappings,
      CatalogIdMapping,
      $CatalogIdMappingsFilterComposer,
      $CatalogIdMappingsOrderingComposer,
      $CatalogIdMappingsAnnotationComposer,
      $CatalogIdMappingsCreateCompanionBuilder,
      $CatalogIdMappingsUpdateCompanionBuilder,
      (
        CatalogIdMapping,
        BaseReferences<_$AppDatabase, CatalogIdMappings, CatalogIdMapping>,
      ),
      CatalogIdMapping,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $PendingUploadsTableManager get pendingUploads =>
      $PendingUploadsTableManager(_db, _db.pendingUploads);
  $CatalogPropertiesTableManager get catalogProperties =>
      $CatalogPropertiesTableManager(_db, _db.catalogProperties);
  $CatalogTalhoesTableManager get catalogTalhoes =>
      $CatalogTalhoesTableManager(_db, _db.catalogTalhoes);
  $CatalogCropTypesTableManager get catalogCropTypes =>
      $CatalogCropTypesTableManager(_db, _db.catalogCropTypes);
  $CatalogEstadiosTableManager get catalogEstadios =>
      $CatalogEstadiosTableManager(_db, _db.catalogEstadios);
  $PendingCatalogCreatesTableManager get pendingCatalogCreates =>
      $PendingCatalogCreatesTableManager(_db, _db.pendingCatalogCreates);
  $CatalogIdMappingsTableManager get catalogIdMappings =>
      $CatalogIdMappingsTableManager(_db, _db.catalogIdMappings);
}
