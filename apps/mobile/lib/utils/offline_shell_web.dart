import 'dart:js_interop';
import 'package:web/web.dart' as web;

Future<bool> isOfflineShellReady() async {
  try {
    final registration = await web.window.navigator.serviceWorker
        .getRegistration()
        .toDart;
    if (registration?.active == null) return false;
    final markerUrl = Uri.parse(
      registration!.scope,
    ).resolve('offline-ready.json').toString();
    final response = await web.window.caches.match(markerUrl.toJS).toDart;
    return response != null && response.ok;
  } catch (_) {
    return false;
  }
}
