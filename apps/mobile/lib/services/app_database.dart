import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';

/// Single SQLite database manager for local storage and catalog caching.
///
/// Merges pending upload queue and offline catalog caches into a single
/// database file with greenfield v1 schema and foreign keys enabled.
class AppDatabase {
  static const String dbName = 'agrolens.db';
  static const int dbVersion = 1;

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
        onConfigure: (db) async {
          await db.execute('PRAGMA foreign_keys = ON');
        },
      ),
    );
    return _db!;
  }

  Future<void> _onCreate(Database db, int version) async {
    await db.execute('''
      CREATE TABLE pending_uploads (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        image_paths TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
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

  /// Close the underlying SQLite database connection if open.
  Future<void> close() async {
    final db = _db;
    _db = null;
    if (db != null && db.isOpen) {
      await db.close();
    }
  }
}
