import 'session_events_base.dart';

class _LocalSessionEvents implements SessionEvents {
  @override
  String? get revision => null;
  @override
  Stream<void> get changes => const Stream.empty();
  @override
  void notifyChange() {}
  @override
  void dispose() {}
}

SessionEvents createSessionEvents() => _LocalSessionEvents();
