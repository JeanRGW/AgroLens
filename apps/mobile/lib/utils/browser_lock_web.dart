import 'dart:js_interop';

import 'package:web/web.dart' as web;

Future<T> withBrowserLock<T>(String name, Future<T> Function() action) async {
  late T result;
  await web.window.navigator.locks
      .request(
        name,
        ((web.Lock? _) => (() async {
          result = await action();
        })().toJS).toJS,
      )
      .toDart;
  return result;
}
