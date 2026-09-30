import 'dart:async';
import 'dart:js_interop';
import 'dart:typed_data';

import 'package:image_picker/image_picker.dart';
import 'package:web/web.dart' as web;

import 'local_image_store_base.dart';

export 'local_image_store_base.dart';

const _dbName = 'agrolens-image-blobs';
const _storeName = 'images';
const _keyPrefix = 'pending_images/';

/// IndexedDB-backed [LocalImageStore] for web builds (PWA offline queue).
class WebLocalImageStore implements LocalImageStore {
  final Future<web.IDBDatabase> Function() _openDatabase;
  Future<web.IDBDatabase>? _db;

  WebLocalImageStore({Future<web.IDBDatabase> Function()? openDatabase})
    : _openDatabase = openDatabase ?? _openDefault;

  Future<web.IDBDatabase> _database() => _db ??= _openDatabase();

  static Future<web.IDBDatabase> _openDefault() {
    final completer = Completer<web.IDBDatabase>();
    final request = web.window.indexedDB.open(_dbName, 1);
    request.onupgradeneeded = ((web.Event _) {
      final db = request.result! as web.IDBDatabase;
      if (!db.objectStoreNames.contains(_storeName)) {
        db.createObjectStore(_storeName);
      }
    }).toJS;
    request.onsuccess = ((web.Event _) {
      completer.complete(request.result! as web.IDBDatabase);
    }).toJS;
    request.onerror = ((web.Event _) {
      completer.completeError(
        StateError('Failed to open the local image store'),
      );
    }).toJS;
    return completer.future;
  }

  Future<T> _withStore<T>(
    String mode,
    Future<T> Function(web.IDBObjectStore store) action,
  ) async {
    final db = await _database();
    final txn = db.transaction(_storeName.toJS, mode);
    final done = Completer<void>();
    txn.oncomplete = ((web.Event _) {
      if (!done.isCompleted) done.complete();
    }).toJS;
    txn.onerror = ((web.Event _) {
      if (!done.isCompleted) {
        done.completeError(StateError('Image store transaction failed'));
      }
    }).toJS;
    txn.onabort = ((web.Event _) {
      if (!done.isCompleted) {
        done.completeError(StateError('Image store transaction aborted'));
      }
    }).toJS;
    try {
      // Observe both futures immediately, including errors raised before commit.
      final results = await Future.wait<Object?>([
        Future<T>.sync(() => action(txn.objectStore(_storeName))),
        done.future,
      ], eagerError: true);
      return results.first as T;
    } catch (_) {
      try {
        txn.abort();
      } catch (_) {
        // The transaction may already have finished or aborted.
      }
      rethrow;
    }
  }

  Future<JSAny?> _run(web.IDBRequest request) {
    final completer = Completer<JSAny?>();
    request.onsuccess = ((web.Event _) {
      completer.complete(request.result);
    }).toJS;
    request.onerror = ((web.Event _) {
      completer.completeError(StateError('Image store request failed'));
    }).toJS;
    return completer.future;
  }

  @override
  Future<String> saveImage({
    required XFile file,
    required String fileName,
  }) async {
    final bytes = await file.readAsBytes();
    final key = '$_keyPrefix$fileName';
    await _withStore('readwrite', (store) async {
      await _run(store.put(bytes.toJS, key.toJS));
    });
    return key;
  }

  @override
  Future<bool> exists(String path) {
    return _withStore('readonly', (store) async {
      return await _run(store.get(path.toJS)) != null;
    });
  }

  @override
  Future<int> length(String path) async => (await readBytes(path)).length;

  @override
  Stream<List<int>> openRead(String path) => readBytes(path).asStream();

  @override
  Future<Uint8List> readBytes(String path) {
    return _withStore('readonly', (store) async {
      final raw = await _run(store.get(path.toJS));
      if (raw == null) {
        throw StateError('Local image not found: $path');
      }
      return (raw as JSUint8Array).toDart;
    });
  }

  @override
  Future<void> deleteImage(String path) async {
    await _withStore('readwrite', (store) async {
      await _run(store.delete(path.toJS));
    });
  }

  @override
  String comparisonKey(String path) => path;

  @override
  Future<List<String>> listPaths() {
    return _withStore('readonly', (store) async {
      final raw = await _run(store.getAllKeys());
      if (raw == null) return const <String>[];
      return (raw as JSArray<JSString>).toDart
          .map((key) => key.toDart)
          .toList();
    });
  }
}

LocalImageStore createLocalImageStore() => WebLocalImageStore();
