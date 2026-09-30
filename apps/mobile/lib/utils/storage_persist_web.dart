import 'dart:js_interop';

import 'package:web/web.dart' as web;

Future<void> requestPersistentStorage() async {
  try {
    final storage = web.window.navigator.storage;
    final granted = await storage.persist().toDart;
    if (!granted.toDart) {
      // Browsers may decline (e.g. never-interacted origin); not an error.
      // ignore: avoid_print
      print('Persistent storage not granted; queue data may be evicted.');
    }
  } catch (_) {
    // Best effort only; the app must work without persistence.
  }
}
