import 'storage_persist_io.dart'
    if (dart.library.html) 'storage_persist_web.dart'
    as platform;

/// Best-effort request for persistent local storage so browsers (and iOS
/// PWAs) do not evict the offline queue and cached images.
Future<void> requestPersistentStorage() => platform.requestPersistentStorage();
