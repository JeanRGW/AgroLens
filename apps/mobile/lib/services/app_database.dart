import 'dart:convert';

import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';
import 'package:uuid/uuid.dart';

/// Single SQLite database manager for local storage and catalog caching.
///
/// Merges pending upload queue and offline catalog caches into a single
/// database file with foreign keys enabled.
class AppDatabase {
  static const String dbName = 'agrolens.db';
  static const int dbVersion = 3;

  Database? _db;
  final DatabaseFactory? factory;
  final String? path;

  AppDatabase({this.factory, this.path});

  /// Lazy database getter opening SQLite on first access.
  Future<Database> get database async {
    if (_db != null && _db!.isOpen) return _db!;
    final dbFactory = factory ?? databaseFactory;
    final dbPath = path ?? join(await getDatabasesPath(), dbName);
    _db = await dbFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: dbVersion,
        onCreate: _onCreate,
        onUpgrade: _onUpgrade,
        onConfigure: (db) async {
          await db.execute('PRAGMA foreign_keys = ON');
        },
      ),
    );
    return _db!;
  }

  Future<void> _onCreate(Database db, int version) async {
    await _createPendingUploads(db);
    for (final table in const [
      'catalog_properties',
      'catalog_talhoes',
      'catalog_crop_types',
      'catalog_estadios',
    ]) {
      await db.execute('''
        CREATE TABLE $table (
          id TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          data TEXT NOT NULL,
          cached_at INTEGER NOT NULL,
          is_pending_sync INTEGER NOT NULL DEFAULT 0,
          sync_error TEXT,
          PRIMARY KEY (id, owner_id)
        )
      ''');
      await db.execute('''
        CREATE INDEX IF NOT EXISTS idx_${table}_owner
        ON $table(owner_id)
      ''');
    }

    await db.execute('''
      CREATE TABLE pending_catalog_creates (
        temp_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        parent_id TEXT,
        created_at INTEGER NOT NULL,
        error_message TEXT,
        PRIMARY KEY (temp_id, owner_id)
      )
    ''');
    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_pending_catalog_creates_owner
      ON pending_catalog_creates(owner_id)
    ''');

    await db.execute('''
      CREATE TABLE catalog_id_mappings (
        temp_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        server_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (temp_id, owner_id)
      )
    ''');
    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_catalog_id_mappings_owner
      ON catalog_id_mappings(owner_id)
    ''');
  }

  Future<void> _createPendingUploads(Database db) async {
    await db.execute('''
      CREATE TABLE pending_uploads (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        images_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        activity_date INTEGER NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        property_id TEXT,
        talhao_id TEXT,
        crop_type_id TEXT,
        estadio_id TEXT,
        source TEXT,
        backend_upload_id TEXT,
        backend_status TEXT,
        backend_error TEXT,
        sync_error_code TEXT,
        sync_attempt_count INTEGER NOT NULL DEFAULT 0,
        last_sync_attempt_at INTEGER
      )
    ''');
    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_pending_uploads_owner_status
      ON pending_uploads(owner_id, status)
    ''');
  }

  Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    if (oldVersion < 2) {
      await db.execute(
        'ALTER TABLE pending_uploads RENAME TO pending_uploads_old',
      );
      await db.execute('DROP INDEX IF EXISTS idx_pending_uploads_owner_status');
      await _createPendingUploads(db);
      final rows = await db.query('pending_uploads_old');
      for (final row in rows) {
        final paths =
            (jsonDecode(row['image_paths'] as String) as List<dynamic>)
                .cast<String>();
        final images = paths
            .map(
              (path) => {
                'path': path,
                'latitude': row['latitude'],
                'longitude': row['longitude'],
                'origin': 'gallery',
              },
            )
            .toList();
        await db.insert('pending_uploads', {
          for (final entry in row.entries)
            if (!const {
              'image_paths',
              'latitude',
              'longitude',
            }.contains(entry.key))
              entry.key: entry.value,
          'images_json': jsonEncode(images),
        });
      }
      await db.execute('DROP TABLE pending_uploads_old');
    }
    if (oldVersion < 3) {
      final rows = await db.query(
        'pending_uploads',
        columns: ['id', 'images_json'],
      );
      for (final row in rows) {
        final images =
            (jsonDecode(row['images_json'] as String) as List<dynamic>)
                .cast<Map<String, dynamic>>();
        final updated = images
            .map(
              (image) => {
                ...image,
                'imageId': image['imageId'] ?? const Uuid().v4(),
              },
            )
            .toList();
        await db.update(
          'pending_uploads',
          {'images_json': jsonEncode(updated)},
          where: 'id = ?',
          whereArgs: [row['id']],
        );
      }
    }
  }

  /// Close the underlying SQLite database connection if open.
  Future<void> close() async {
    final db = _db;
    _db = null;
    if (db != null && db.isOpen) {
      await db.close();
    }
  }
}
