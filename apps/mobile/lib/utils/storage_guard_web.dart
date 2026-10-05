import 'dart:async';
import 'dart:js_interop';
import 'package:web/web.dart' as web;

class StorageGuard {
  final _released = Completer<void>();
  Future<void>? _requestFinished;

  Future<void> acquire() async {
    final acquired = Completer<void>();
    try {
      _requestFinished = web.window.navigator.locks
          .request(
            'agrolens-mobile-database',
            web.LockOptions(ifAvailable: true),
            ((web.Lock? lock) => (() async {
              if (lock == null) {
                acquired.completeError(
                  StateError(
                    'Feche a outra aba do AgroLens e abra o aplicativo novamente.',
                  ),
                );
                return;
              }
              acquired.complete();
              await _released.future;
            })().toJS).toJS,
          )
          .toDart
          .then<void>((_) {})
          .catchError((Object error) {
            if (!acquired.isCompleted) acquired.completeError(error);
          });
    } catch (error) {
      acquired.completeError(
        StateError(
          'Armazenamento indisponível. Use HTTPS e um navegador com suporte a Web Locks.',
        ),
      );
    }
    await acquired.future;
  }

  Future<void> release() async {
    if (!_released.isCompleted) _released.complete();
    await _requestFinished;
  }
}
