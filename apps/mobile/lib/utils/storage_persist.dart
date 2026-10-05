import 'storage_persist_io.dart'
    if (dart.library.js_interop) 'storage_persist_web.dart'
    as platform;

/// True when protection is granted, false when denied, null when unavailable.
Future<bool?> requestPersistentStorage() => platform.requestPersistentStorage();
