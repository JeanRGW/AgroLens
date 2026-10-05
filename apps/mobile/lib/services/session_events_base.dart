abstract class SessionEvents {
  String? get revision;
  Stream<void> get changes;
  void notifyChange();
  void dispose();
}
