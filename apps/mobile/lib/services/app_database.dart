import 'dart:async';
import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';
import '../utils/storage_guard.dart';

part 'app_database.g.dart';

@DriftDatabase(include: {'app_database.drift'})
class AppDatabase extends _$AppDatabase {
  AppDatabase({QueryExecutor? executor}) : this._(executor, StorageGuard());

  AppDatabase._(QueryExecutor? executor, this._guard)
    : super(
        executor ??
            LazyDatabase(() async {
              await _guard.acquire();
              return driftDatabase(
                name: 'agrolens',
                web: DriftWebOptions(
                  sqlite3Wasm: Uri.parse('sqlite3.wasm'),
                  driftWorker: Uri.parse('drift_worker.js'),
                  onResult: (result) {
                    try {
                      requireDurableStorage(result.chosenImplementation.name);
                    } catch (_) {
                      unawaited(result.resolvedExecutor.close());
                      rethrow;
                    }
                  },
                ),
              );
            }),
      );

  final StorageGuard _guard;

  @override
  Future<void> close() async {
    try {
      await super.close();
    } finally {
      _guard.release();
    }
  }

  @override
  int get schemaVersion => 1;

  Future<List<Map<String, dynamic>>> readRows(
    String sql, [
    List<Object?> arguments = const [],
  ]) async => (await customSelect(
    sql,
    variables: arguments.map(Variable.new).toList(),
  ).get()).map((row) => row.data).toList();

  Future<int> saveRow(String table, Map<String, Object?> row) => customInsert(
    'INSERT OR REPLACE INTO $table (${row.keys.join(', ')}) VALUES (${List.filled(row.length, '?').join(', ')})',
    variables: row.values.map(Variable.new).toList(),
  );

  Future<int> updateRow(
    String table,
    Map<String, Object?> row,
    String where,
    List<Object?> arguments,
  ) => customUpdate(
    'UPDATE $table SET ${row.keys.map((key) => '$key = ?').join(', ')} WHERE $where',
    variables: [...row.values, ...arguments].map(Variable.new).toList(),
  );

  Future<int> deleteRows(String table, String where, List<Object?> arguments) =>
      customUpdate(
        'DELETE FROM $table WHERE $where',
        variables: arguments.map(Variable.new).toList(),
      );
}
