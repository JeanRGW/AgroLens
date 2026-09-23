import 'dart:convert';
import 'dart:async';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:sqflite/sqflite.dart';
import 'package:uuid/uuid.dart';
import '../models/catalog.dart';
import '../models/pending_catalog_create.dart';
import '../utils/app_logger.dart';
import 'api_client.dart';
import 'app_database.dart';
import 'auth_service.dart';

/// Typed entity descriptor used by the shared cache mechanics.
class _CatalogStrategy<T extends CatalogItem> {
  final PendingCatalogEntityType entityType;
  final String table;
  final String label;
  final T Function(Map<String, dynamic>) fromJson;
  final Map<String, dynamic> Function(T item) toJson;
  final Future<List<Map<String, dynamic>>> Function(String token) fetch;
  final Future<T> Function(String token, Map<String, dynamic> payload) create;
  final Future<T> Function(
    String token,
    String id,
    Map<String, dynamic> payload,
  )
  update;
  final Future<void> Function(String token, String id) delete;
  final Future<T> Function(Map<String, dynamic> payload) createLocal;
  final Future<T?> Function(Map<String, dynamic> payload) findMatch;
  final String? parentField;
  final bool relinksChildren;

  const _CatalogStrategy({
    required this.entityType,
    required this.table,
    required this.label,
    required this.fromJson,
    required this.toJson,
    required this.fetch,
    required this.create,
    required this.update,
    required this.delete,
    required this.createLocal,
    required this.findMatch,
    this.parentField,
    this.relinksChildren = false,
  });
}

/// Catalog cache/repository for properties, talhoes, crop types, and estadios.
class CatalogRepository {
  final AppDatabase appDatabase;
  final ApiClient apiClient;
  final AuthService authService;
  final Uuid _uuid = const Uuid();
  late final _CatalogStrategy<Property> _propertyStrategy = _CatalogStrategy(
    entityType: PendingCatalogEntityType.property,
    table: 'catalog_properties',
    label: 'propriedade',
    fromJson: Property.fromJson,
    toJson: (item) => item.toJson(),
    fetch: (token) => apiClient.getProperties(accessToken: token),
    update: (token, id, payload) => apiClient.updateProperty(
      accessToken: token,
      propertyId: id,
      name: payload['name'] as String?,
      owner: payload['owner'] as String?,
      address: payload['address'] as String?,
      latitude: (payload['latitude'] as num?)?.toDouble(),
      longitude: (payload['longitude'] as num?)?.toDouble(),
      userId: payload['userId'] as String?,
    ),
    delete: (token, id) =>
        apiClient.deleteProperty(accessToken: token, propertyId: id),
    create: (token, payload) => apiClient.createProperty(
      accessToken: token,
      name: payload['name'] as String,
      owner: payload['owner'] as String,
      address: payload['address'] as String,
      latitude: (payload['latitude'] as num).toDouble(),
      longitude: (payload['longitude'] as num).toDouble(),
    ),
    createLocal: (payload) => _createLocalProperty(
      name: payload['name'] as String,
      owner: payload['owner'] as String,
      address: payload['address'] as String,
      latitude: (payload['latitude'] as num).toDouble(),
      longitude: (payload['longitude'] as num).toDouble(),
    ),
    findMatch: _findMatchingProperty,
    relinksChildren: true,
  );
  late final _CatalogStrategy<Talhao> _talhaoStrategy = _CatalogStrategy(
    entityType: PendingCatalogEntityType.talhao,
    table: 'catalog_talhoes',
    label: 'talhão',
    fromJson: Talhao.fromJson,
    toJson: (item) => item.toJson(),
    fetch: (token) => apiClient.getTalhoes(accessToken: token),
    update: (token, id, payload) => apiClient.updateTalhao(
      accessToken: token,
      talhaoId: id,
      name: payload['name'] as String,
      propertyId: payload['propertyId'] as String?,
      userId: payload['userId'] as String?,
    ),
    delete: (token, id) =>
        apiClient.deleteTalhao(accessToken: token, talhaoId: id),
    create: (token, payload) => apiClient.createTalhao(
      accessToken: token,
      name: payload['name'] as String,
      propertyId: payload['propertyId'] as String,
    ),
    createLocal: (payload) => _createLocalTalhao(
      name: payload['name'] as String,
      propertyId: payload['propertyId'] as String,
    ),
    findMatch: (payload) => _findMatchingTalhao(
      payload['name'] as String,
      payload['propertyId'] as String,
    ),
    parentField: 'propertyId',
  );
  late final _CatalogStrategy<CropType> _cropTypeStrategy = _CatalogStrategy(
    entityType: PendingCatalogEntityType.cropType,
    table: 'catalog_crop_types',
    label: 'cultura',
    fromJson: CropType.fromJson,
    toJson: (item) => item.toJson(),
    fetch: (token) => apiClient.getCropTypes(accessToken: token),
    update: (token, id, payload) => apiClient.updateCropType(
      accessToken: token,
      cropTypeId: id,
      name: payload['name'] as String,
      userId: payload['userId'] as String?,
    ),
    delete: (token, id) =>
        apiClient.deleteCropType(accessToken: token, cropTypeId: id),
    create: (token, payload) => apiClient.createCropType(
      accessToken: token,
      name: payload['name'] as String,
    ),
    createLocal: (payload) =>
        _createLocalCropType(name: payload['name'] as String),
    findMatch: (payload) => _findMatchingCropType(payload['name'] as String),
    relinksChildren: true,
  );
  late final _CatalogStrategy<Estadio> _estadioStrategy = _CatalogStrategy(
    entityType: PendingCatalogEntityType.estadio,
    table: 'catalog_estadios',
    label: 'estádio',
    fromJson: Estadio.fromJson,
    toJson: (item) => item.toJson(),
    fetch: (token) => apiClient.getEstadios(accessToken: token),
    update: (token, id, payload) => apiClient.updateEstadio(
      accessToken: token,
      estadioId: id,
      name: payload['name'] as String,
      cropTypeId: payload['cropTypeId'] as String?,
      userId: payload['userId'] as String?,
    ),
    delete: (token, id) =>
        apiClient.deleteEstadio(accessToken: token, estadioId: id),
    create: (token, payload) => apiClient.createEstadio(
      accessToken: token,
      name: payload['name'] as String,
      cropTypeId: payload['cropTypeId'] as String,
    ),
    createLocal: (payload) => _createLocalEstadio(
      name: payload['name'] as String,
      cropTypeId: payload['cropTypeId'] as String,
    ),
    findMatch: (payload) => _findMatchingEstadio(
      payload['name'] as String,
      payload['cropTypeId'] as String,
    ),
    parentField: 'cropTypeId',
  );

  static const String _tablePendingCatalogCreates = 'pending_catalog_creates';
  static const String _tableCatalogIdMappings = 'catalog_id_mappings';

  CatalogRepository({
    required this.appDatabase,
    required this.apiClient,
    required this.authService,
  });

  String? get currentUserId => authService.currentUser?.id;
  bool get currentUserIsAdmin => authService.currentUser?.role == 'admin';

  ({String ownerId, int generation}) _session() =>
      (ownerId: _ownerId(), generation: authService.sessionGeneration);

  void _ensureSession(({String ownerId, int generation}) session) {
    if (currentUserId != session.ownerId ||
        authService.sessionGeneration != session.generation) {
      throw const ApiException(401, 'Session changed');
    }
  }

  Future<Database> get database => appDatabase.database;

  Future<void> close() async {
    await appDatabase.close();
  }

  Future<List<Property>> getProperties({bool forceRefresh = false}) =>
      _getCatalogItems(_propertyStrategy, forceRefresh: forceRefresh);

  Future<Property> createProperty({
    required String name,
    required String owner,
    required String address,
    required double latitude,
    required double longitude,
  }) => _createCatalogItem(_propertyStrategy, {
    'name': name,
    'owner': owner,
    'address': address,
    'latitude': latitude,
    'longitude': longitude,
  });

  Future<Property> updateProperty({
    required String propertyId,
    String? name,
    String? owner,
    String? address,
    double? latitude,
    double? longitude,
    String? userId,
  }) => _updateCatalogItem(_propertyStrategy, propertyId, 'propriedade', {
    'name': name,
    'owner': owner,
    'address': address,
    'latitude': latitude,
    'longitude': longitude,
    'userId': ?userId,
  });

  Future<void> deleteProperty({required String propertyId}) =>
      _deleteCatalogItem(_propertyStrategy, propertyId, 'propriedade');

  // ── Talhoes ───────────────────────────────────────────────────────

  Future<List<Talhao>> getTalhoes({bool forceRefresh = false}) =>
      _getCatalogItems(_talhaoStrategy, forceRefresh: forceRefresh);

  Future<Talhao> createTalhao({
    required String name,
    required String propertyId,
  }) => _createCatalogItem(_talhaoStrategy, {
    'name': name,
    'propertyId': propertyId,
  });

  Future<Talhao> updateTalhao({
    required String talhaoId,
    required String name,
    String? propertyId,
    String? userId,
  }) => _updateCatalogItem(_talhaoStrategy, talhaoId, 'talhão', {
    'name': name,
    'propertyId': ?propertyId,
    'userId': ?userId,
  });

  Future<void> deleteTalhao({required String talhaoId}) =>
      _deleteCatalogItem(_talhaoStrategy, talhaoId, 'talhão');

  // ── Crop Types ────────────────────────────────────────────────────

  Future<List<CropType>> getCropTypes({bool forceRefresh = false}) =>
      _getCatalogItems(_cropTypeStrategy, forceRefresh: forceRefresh);

  Future<CropType> createCropType({required String name}) =>
      _createCatalogItem(_cropTypeStrategy, {'name': name});

  Future<CropType> updateCropType({
    required String cropTypeId,
    required String name,
    String? userId,
  }) => _updateCatalogItem(_cropTypeStrategy, cropTypeId, 'cultura', {
    'name': name,
    'userId': ?userId,
  });

  Future<void> deleteCropType({required String cropTypeId}) =>
      _deleteCatalogItem(_cropTypeStrategy, cropTypeId, 'cultura');

  // ── Estadios ──────────────────────────────────────────────────────

  Future<List<Estadio>> getEstadios({bool forceRefresh = false}) =>
      _getCatalogItems(_estadioStrategy, forceRefresh: forceRefresh);

  Future<Estadio> createEstadio({
    required String name,
    required String cropTypeId,
  }) => _createCatalogItem(_estadioStrategy, {
    'name': name,
    'cropTypeId': cropTypeId,
  });

  Future<Estadio> updateEstadio({
    required String estadioId,
    required String name,
    String? cropTypeId,
    String? userId,
  }) => _updateCatalogItem(_estadioStrategy, estadioId, 'estádio', {
    'name': name,
    'cropTypeId': ?cropTypeId,
    'userId': ?userId,
  });

  Future<void> deleteEstadio({required String estadioId}) =>
      _deleteCatalogItem(_estadioStrategy, estadioId, 'estádio');

  // ── Offline create sync ────────────────────────────────────────────

  Future<void> syncPendingCatalogCreates() async {
    final session = _session();
    await _syncPendingCatalogCreatesForTypes([
      _propertyStrategy,
      _cropTypeStrategy,
    ], session);
    _ensureSession(session);
    await _syncPendingCatalogCreatesForTypes([
      _talhaoStrategy,
      _estadioStrategy,
    ], session);
  }

  Future<void> _syncPendingCatalogCreatesForTypes(
    List<_CatalogStrategy> strategies,
    ({String ownerId, int generation}) session,
  ) async {
    final pending = await _getPendingCatalogCreates();
    _ensureSession(session);
    for (final strategy in strategies) {
      for (final item in pending.where(
        (entry) => entry.entityType == strategy.entityType,
      )) {
        _ensureSession(session);
        final parentId = item.parentId;
        final payload = {...item.payload};
        if (strategy.parentField != null && parentId != null) {
          final resolvedParent = await resolveCatalogId(parentId);
          _ensureSession(session);
          if (resolvedParent == null) continue;
          payload[strategy.parentField!] = resolvedParent;
          if (resolvedParent != parentId) {
            await _updatePendingCatalogCreateParent(
              item.tempId,
              resolvedParent,
            );
            _ensureSession(session);
          }
        }
        _ensureSession(session);
        await _syncCatalogCreate(strategy, item, payload, session);
      }
    }
  }

  Future<void> _syncCatalogCreate<T extends CatalogItem>(
    _CatalogStrategy<T> strategy,
    PendingCatalogCreate item,
    Map<String, dynamic> payload,
    ({String ownerId, int generation}) session,
  ) async {
    try {
      final token = await _getAccessTokenOrThrow();
      _ensureSession(session);
      final created = await strategy.create(token, payload);
      _ensureSession(session);
      await _promotePendingCatalogCreate(item, created, strategy.table);
      _ensureSession(session);
      if (strategy.relinksChildren) {
        await _relinkPendingChildrenAfterParentSync(
          parentType: strategy.entityType,
          oldParentId: item.tempId,
          newParentId: created.id,
        );
      }
    } on ApiException catch (e) {
      _ensureSession(session);
      if (e.statusCode == 409) {
        final match = await strategy.findMatch(payload);
        _ensureSession(session);
        if (match != null) {
          await _promotePendingCatalogCreate(item, match, strategy.table);
          _ensureSession(session);
          if (strategy.relinksChildren) {
            await _relinkPendingChildrenAfterParentSync(
              parentType: strategy.entityType,
              oldParentId: item.tempId,
              newParentId: match.id,
            );
          }
          return;
        }
      }
      await _markPendingCreateError(strategy, item.tempId, e.message);
    } on SocketException catch (e) {
      _ensureSession(session);
      await _markPendingCreateError(strategy, item.tempId, e.message);
    } on TimeoutException catch (e) {
      _ensureSession(session);
      await _markPendingCreateError(strategy, item.tempId, e.message);
    } on http.ClientException catch (e) {
      _ensureSession(session);
      await _markPendingCreateError(strategy, item.tempId, e.message);
    }
  }

  Future<T> _updateCatalogItem<T extends CatalogItem>(
    _CatalogStrategy<T> strategy,
    String id,
    String label,
    Map<String, dynamic> payload,
  ) async {
    final session = _session();
    await _ensureNotPending(strategy.table, id, label);
    final token = await _getAccessTokenOrThrow();
    _ensureSession(session);
    final item = await strategy.update(token, id, payload);
    _ensureSession(session);
    await _saveCatalogItem(strategy.table, item);
    return item;
  }

  Future<void> _deleteCatalogItem(
    _CatalogStrategy strategy,
    String id,
    String label,
  ) async {
    final session = _session();
    await _ensureNotPending(strategy.table, id, label);
    final token = await _getAccessTokenOrThrow();
    _ensureSession(session);
    await strategy.delete(token, id);
    _ensureSession(session);
    await _deleteServerCatalogItem(strategy.table, id);
  }

  Future<void> _promotePendingCatalogCreate(
    PendingCatalogCreate item,
    CatalogItem serverItem,
    String table,
  ) async {
    final ownerId = _ownerId();
    final db = await database;
    final now = DateTime.now().millisecondsSinceEpoch;
    final batch = db.batch();
    batch.delete(
      table,
      where: 'id = ? AND owner_id = ?',
      whereArgs: [item.tempId, ownerId],
    );
    batch.delete(
      _tablePendingCatalogCreates,
      where: 'temp_id = ? AND owner_id = ?',
      whereArgs: [item.tempId, ownerId],
    );
    batch.insert(table, {
      'id': serverItem.id,
      'owner_id': ownerId,
      'data': jsonEncode(serverItem.toJson()),
      'cached_at': now,
      'is_pending_sync': 0,
      'sync_error': null,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
    batch.insert(_tableCatalogIdMappings, {
      'temp_id': item.tempId,
      'owner_id': ownerId,
      'server_id': serverItem.id,
      'entity_type': item.entityType.name,
      'created_at': now,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
    await batch.commit(noResult: true);
  }

  Future<void> _markPendingCreateError(
    _CatalogStrategy strategy,
    String tempId,
    String? message,
  ) async {
    final ownerId = _ownerId();
    final db = await database;
    final safeMessage = message ?? '';
    await db.update(
      _tablePendingCatalogCreates,
      {'error_message': safeMessage},
      where: 'temp_id = ? AND owner_id = ?',
      whereArgs: [tempId, ownerId],
    );
    final rows = await db.query(
      strategy.table,
      where: 'id = ? AND owner_id = ? AND is_pending_sync = 1',
      whereArgs: [tempId, ownerId],
      limit: 1,
    );
    if (rows.isEmpty) return;
    final data =
        jsonDecode(rows.first['data'] as String) as Map<String, dynamic>;
    data['syncError'] = safeMessage;
    await db.update(
      strategy.table,
      {'data': jsonEncode(data), 'sync_error': safeMessage},
      where: 'id = ? AND owner_id = ?',
      whereArgs: [tempId, ownerId],
    );
  }

  Future<void> _updatePendingCatalogCreateParent(
    String tempId,
    String parentId,
  ) async {
    final ownerId = _ownerId();
    final db = await database;
    final rows = await db.query(
      _tablePendingCatalogCreates,
      where: 'temp_id = ? AND owner_id = ?',
      whereArgs: [tempId, ownerId],
      limit: 1,
    );
    if (rows.isEmpty) return;
    final item = PendingCatalogCreate.fromSqliteRow(rows.first);
    final payload = item.payload;
    if (item.entityType == PendingCatalogEntityType.talhao) {
      payload['propertyId'] = parentId;
    } else if (item.entityType == PendingCatalogEntityType.estadio) {
      payload['cropTypeId'] = parentId;
    }
    await db.update(
      _tablePendingCatalogCreates,
      {'parent_id': parentId, 'payload_json': jsonEncode(payload)},
      where: 'temp_id = ? AND owner_id = ?',
      whereArgs: [tempId, ownerId],
    );
    final table = item.entityType == PendingCatalogEntityType.talhao
        ? 'catalog_talhoes'
        : 'catalog_estadios';
    final field = item.entityType == PendingCatalogEntityType.talhao
        ? 'propertyId'
        : 'cropTypeId';
    final rowsToUpdate = await db.query(
      table,
      where: 'id = ? AND owner_id = ? AND is_pending_sync = 1',
      whereArgs: [tempId, ownerId],
      limit: 1,
    );
    if (rowsToUpdate.isNotEmpty) {
      final data =
          jsonDecode(rowsToUpdate.first['data'] as String)
              as Map<String, dynamic>;
      data[field] = parentId;
      await db.update(
        table,
        {'data': jsonEncode(data)},
        where: 'id = ? AND owner_id = ?',
        whereArgs: [tempId, ownerId],
      );
    }
  }

  Future<void> _relinkPendingChildrenAfterParentSync({
    required PendingCatalogEntityType parentType,
    required String oldParentId,
    required String newParentId,
  }) async {
    final ownerId = _ownerId();
    final db = await database;
    final childTable = parentType == PendingCatalogEntityType.property
        ? 'catalog_talhoes'
        : 'catalog_estadios';
    final childField = parentType == PendingCatalogEntityType.property
        ? 'propertyId'
        : 'cropTypeId';
    final queueRows = await db.query(
      _tablePendingCatalogCreates,
      where: 'parent_id = ? AND owner_id = ?',
      whereArgs: [oldParentId, ownerId],
    );
    for (final row in queueRows) {
      final item = PendingCatalogCreate.fromSqliteRow(row);
      if ((parentType == PendingCatalogEntityType.property &&
              item.entityType != PendingCatalogEntityType.talhao) ||
          (parentType == PendingCatalogEntityType.cropType &&
              item.entityType != PendingCatalogEntityType.estadio)) {
        continue;
      }
      final payload = item.payload;
      payload[childField] = newParentId;
      await db.update(
        _tablePendingCatalogCreates,
        {'parent_id': newParentId, 'payload_json': jsonEncode(payload)},
        where: 'temp_id = ? AND owner_id = ?',
        whereArgs: [item.tempId, ownerId],
      );
    }
    final cacheRows = await db.query(
      childTable,
      where: 'owner_id = ? AND is_pending_sync = 1',
      whereArgs: [ownerId],
    );
    for (final row in cacheRows) {
      final data = jsonDecode(row['data'] as String) as Map<String, dynamic>;
      if (data[childField] == oldParentId) {
        data[childField] = newParentId;
        await db.update(
          childTable,
          {'data': jsonEncode(data)},
          where: 'id = ? AND owner_id = ?',
          whereArgs: [row['id'], ownerId],
        );
      }
    }
  }

  Future<T?> _findMatching<T extends CatalogItem>(
    _CatalogStrategy<T> strategy,
    Map<String, dynamic> payload,
  ) async {
    final items = await _fetchAndCache(strategy);
    final normalizedName = _normalizeText(payload['name'] as String? ?? '');
    for (final item in items.where((i) => !i.isPendingSync)) {
      if (_normalizeText(item.name) != normalizedName) continue;
      final match = _matchesParent(strategy, item, payload);
      if (match) return item;
    }
    return null;
  }

  bool _matchesParent<T extends CatalogItem>(
    _CatalogStrategy<T> strategy,
    T item,
    Map<String, dynamic> payload,
  ) {
    switch (strategy.entityType) {
      case PendingCatalogEntityType.property:
        return _normalizeText((item as Property).owner) ==
                _normalizeText(payload['owner'] as String? ?? '') &&
            _normalizeText(item.address) ==
                _normalizeText(payload['address'] as String? ?? '');
      case PendingCatalogEntityType.talhao:
        return (item as Talhao).propertyId == payload['propertyId'];
      case PendingCatalogEntityType.estadio:
        return (item as Estadio).cropTypeId == payload['cropTypeId'];
      case PendingCatalogEntityType.cropType:
        return true;
    }
  }

  Future<Property?> _findMatchingProperty(Map<String, dynamic> payload) =>
      _findMatching(_propertyStrategy, payload);

  Future<CropType?> _findMatchingCropType(String name) =>
      _findMatching(_cropTypeStrategy, {'name': name});

  Future<Talhao?> _findMatchingTalhao(String name, String propertyId) =>
      _findMatching(_talhaoStrategy, {'name': name, 'propertyId': propertyId});

  Future<Estadio?> _findMatchingEstadio(String name, String cropTypeId) =>
      _findMatching(_estadioStrategy, {'name': name, 'cropTypeId': cropTypeId});

  Future<T> _createCatalogItem<T extends CatalogItem>(
    _CatalogStrategy<T> strategy,
    Map<String, dynamic> payload,
  ) async {
    final session = _session();
    try {
      final token = await _getAccessTokenOrThrow();
      _ensureSession(session);
      final item = await strategy.create(token, payload);
      _ensureSession(session);
      await _saveCatalogItem(strategy.table, item);
      return item;
    } on SocketException {
      _ensureSession(session);
      return strategy.createLocal(payload);
    } on TimeoutException {
      _ensureSession(session);
      return strategy.createLocal(payload);
    } on HttpException {
      _ensureSession(session);
      return strategy.createLocal(payload);
    } on http.ClientException {
      _ensureSession(session);
      // package:http signals transport failures (connection reset/closed,
      // malformed URL) with ClientException, not SocketException.
      return strategy.createLocal(payload);
    } on ApiException catch (error) {
      _ensureSession(session);
      // Server-side rejections (5xx) are retryable: the create can complete
      // once connectivity/server recovers. Client errors (4xx) mean the
      // payload itself is invalid — syncing it later would never succeed.
      if (error.statusCode >= 500) {
        return strategy.createLocal(payload);
      }
      rethrow;
    }
  }

  Future<List<T>> _getCatalogItems<T extends CatalogItem>(
    _CatalogStrategy<T> strategy, {
    required bool forceRefresh,
  }) async {
    final session = _session();
    final cached = await _getCachedList(strategy);
    _ensureSession(session);
    if (!forceRefresh && cached.isNotEmpty) return cached;
    try {
      return await _fetchAndCache(strategy);
    } catch (error) {
      _ensureSession(session);
      // A failed refresh must never wipe valid cached data from the screen;
      // stale data beats an error state. Rethrow only when there is nothing
      // to show so first-load failures are still surfaced.
      if (cached.isNotEmpty) {
        AppLogger.warning(
          'Catalog refresh failed for ${strategy.table}; serving stale cache',
          error,
        );
        return cached;
      }
      rethrow;
    }
  }

  Future<List<T>> _fetchAndCache<T extends CatalogItem>(
    _CatalogStrategy<T> strategy,
  ) async {
    final session = _session();
    final token = await _getAccessTokenOrThrow();
    _ensureSession(session);
    final raw = await strategy.fetch(token);
    _ensureSession(session);
    await _replaceServerCache(
      strategy.table,
      raw.map(strategy.fromJson).map(strategy.toJson).toList(),
    );
    _ensureSession(session);
    return _getCachedList(strategy);
  }

  String _ownerId() =>
      authService.currentUser?.id ??
      (throw StateError('Authenticated owner is required'));

  Future<void> _saveCatalogItem(String table, CatalogItem item) async {
    final ownerId = _ownerId();
    final db = await database;
    await db.insert(table, {
      'id': item.id,
      'owner_id': ownerId,
      'data': jsonEncode(item.toJson()),
      'cached_at': DateTime.now().millisecondsSinceEpoch,
      'is_pending_sync': item.isPendingSync ? 1 : 0,
      'sync_error': item.syncError,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<void> _replaceServerCache(
    String table,
    List<Map<String, dynamic>> items,
  ) async {
    final ownerId = _ownerId();
    final db = await database;
    final now = DateTime.now().millisecondsSinceEpoch;
    final batch = db.batch();
    batch.delete(
      table,
      where: 'owner_id = ? AND is_pending_sync = 0',
      whereArgs: [ownerId],
    );
    for (final item in items) {
      batch.insert(table, {
        'id': item['id'],
        'owner_id': ownerId,
        'data': jsonEncode(item),
        'cached_at': now,
        'is_pending_sync': 0,
        'sync_error': null,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await batch.commit(noResult: true);
  }

  Future<void> _deleteServerCatalogItem(String table, String id) async {
    final ownerId = _ownerId();
    final db = await database;
    await db.delete(
      table,
      where: 'id = ? AND owner_id = ? AND is_pending_sync = 0',
      whereArgs: [id, ownerId],
    );
  }

  Future<List<T>> _getCachedList<T extends CatalogItem>(
    _CatalogStrategy<T> strategy,
  ) async {
    final ownerId = _ownerId();
    final db = await database;
    final rows = await db.query(
      strategy.table,
      where: 'owner_id = ?',
      whereArgs: [ownerId],
      orderBy: 'is_pending_sync DESC, cached_at DESC',
    );
    return rows.map((row) {
      final data = jsonDecode(row['data'] as String) as Map<String, dynamic>;
      return strategy.fromJson(data);
    }).toList();
  }

  Future<List<PendingCatalogCreate>> _getPendingCatalogCreates() async {
    final ownerId = _ownerId();
    final db = await database;
    final rows = await db.query(
      _tablePendingCatalogCreates,
      where: 'owner_id = ?',
      whereArgs: [ownerId],
      orderBy: 'created_at ASC',
    );
    return rows.map(PendingCatalogCreate.fromSqliteRow).toList();
  }

  Future<String?> resolveCatalogId(String id) async {
    final ownerId = _ownerId();
    final db = await database;
    final mapping = await db.query(
      _tableCatalogIdMappings,
      where: 'temp_id = ? AND owner_id = ?',
      whereArgs: [id, ownerId],
      limit: 1,
    );
    if (mapping.isNotEmpty) {
      return mapping.first['server_id'] as String;
    }
    for (final table in const [
      'catalog_properties',
      'catalog_talhoes',
      'catalog_crop_types',
      'catalog_estadios',
    ]) {
      final rows = await db.query(
        table,
        where: 'id = ? AND owner_id = ?',
        whereArgs: [id, ownerId],
        limit: 1,
      );
      if (rows.isNotEmpty) {
        final pending = (rows.first['is_pending_sync'] as int? ?? 0) == 1;
        return pending ? null : id;
      }
    }
    // Manual IDs are not necessarily cached. Only known local entries need
    // to wait for promotion; let the backend validate other UUIDs.
    return Uuid.isValidUUID(fromString: id) ? id : null;
  }

  Future<String> _getAccessTokenOrThrow() async {
    final token = await authService.getValidAccessToken();
    if (token == null) throw const ApiException(401, 'Not authenticated');
    return token;
  }

  Future<void> _ensureNotPending(String table, String id, String label) async {
    final ownerId = _ownerId();
    final db = await database;
    final rows = await db.query(
      table,
      where: 'id = ? AND owner_id = ? AND is_pending_sync = 1',
      whereArgs: [id, ownerId],
      limit: 1,
    );
    if (rows.isNotEmpty) {
      throw ApiException(
        409,
        'Registro local pendente de sincronização. Edição/exclusão de $label indisponível.',
      );
    }
  }

  String _normalizeText(String value) {
    return value.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
  }

  Future<T> _createLocalItem<T extends CatalogItem>({
    required _CatalogStrategy<T> strategy,
    required Map<String, dynamic> payload,
    required T Function(String id, String userId, DateTime now) buildItem,
    String? parentId,
  }) async {
    final now = DateTime.now();
    final userId = _ownerId();
    final item = buildItem(_uuid.v4(), userId, now);
    final pending = PendingCatalogCreate(
      tempId: item.id,
      entityType: strategy.entityType,
      payloadJson: jsonEncode(payload),
      normalizedName: _normalizeText(item.name),
      parentId: parentId,
      createdAt: now,
    );
    final db = await database;
    await db.transaction((txn) async {
      await txn.insert(strategy.table, {
        'id': item.id,
        'owner_id': userId,
        'data': jsonEncode(item.toJson()),
        'cached_at': now.millisecondsSinceEpoch,
        'is_pending_sync': 1,
        'sync_error': item.syncError,
      });
      await txn.insert(
        _tablePendingCatalogCreates,
        pending.toSqliteRow()..['owner_id'] = userId,
      );
    });
    return item;
  }

  Future<Property> _createLocalProperty({
    required String name,
    required String owner,
    required String address,
    required double latitude,
    required double longitude,
  }) => _createLocalItem(
    strategy: _propertyStrategy,
    payload: {
      'name': name,
      'owner': owner,
      'address': address,
      'latitude': latitude,
      'longitude': longitude,
    },
    buildItem: (id, userId, now) => Property(
      id: id,
      name: name,
      userId: userId,
      createdAt: now,
      updatedAt: now,
      owner: owner,
      address: address,
      latitude: latitude,
      longitude: longitude,
      isPendingSync: true,
      syncError: 'Pendente de sincronização',
    ),
  );

  Future<Talhao> _createLocalTalhao({
    required String name,
    required String propertyId,
  }) => _createLocalItem(
    strategy: _talhaoStrategy,
    parentId: propertyId,
    payload: {'name': name, 'propertyId': propertyId},
    buildItem: (id, userId, now) => Talhao(
      id: id,
      name: name,
      userId: userId,
      createdAt: now,
      updatedAt: now,
      propertyId: propertyId,
      isPendingSync: true,
      syncError: 'Pendente de sincronização',
    ),
  );

  Future<CropType> _createLocalCropType({required String name}) =>
      _createLocalItem(
        strategy: _cropTypeStrategy,
        payload: {'name': name},
        buildItem: (id, userId, now) => CropType(
          id: id,
          name: name,
          userId: userId,
          createdAt: now,
          updatedAt: now,
          isPendingSync: true,
          syncError: 'Pendente de sincronização',
        ),
      );

  Future<Estadio> _createLocalEstadio({
    required String name,
    required String cropTypeId,
  }) => _createLocalItem(
    strategy: _estadioStrategy,
    parentId: cropTypeId,
    payload: {'name': name, 'cropTypeId': cropTypeId},
    buildItem: (id, userId, now) => Estadio(
      id: id,
      name: name,
      userId: userId,
      createdAt: now,
      updatedAt: now,
      cropTypeId: cropTypeId,
      isPendingSync: true,
      syncError: 'Pendente de sincronização',
    ),
  );
}
