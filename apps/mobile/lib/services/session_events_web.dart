import 'dart:async';
import 'dart:js_interop';

import 'package:uuid/uuid.dart';
import 'package:web/web.dart' as web;

import 'session_events_base.dart';

const _sessionKey = 'agrolens:mobile-session';

class _BrowserSessionEvents implements SessionEvents {
  final _changes = StreamController<void>.broadcast(sync: true);
  late final JSFunction _listener;

  _BrowserSessionEvents() {
    _listener = ((web.StorageEvent event) {
      if (event.key == null || event.key == _sessionKey) _changes.add(null);
    }).toJS;
    web.window.addEventListener('storage', _listener);
  }

  @override
  String? get revision => web.window.localStorage.getItem(_sessionKey);

  @override
  Stream<void> get changes => _changes.stream;

  @override
  void notifyChange() =>
      web.window.localStorage.setItem(_sessionKey, const Uuid().v4());

  @override
  void dispose() {
    web.window.removeEventListener('storage', _listener);
    _changes.close();
  }
}

SessionEvents createSessionEvents() => _BrowserSessionEvents();
