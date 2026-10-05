import 'dart:js_interop';

import 'package:web/web.dart' as web;

Future<bool?> requestPersistentStorage() async {
  try {
    final storage = web.window.navigator.storage;
    if ((await storage.persisted().toDart).toDart) return true;
    return (await storage.persist().toDart).toDart;
  } catch (_) {
    return null;
  }
}
