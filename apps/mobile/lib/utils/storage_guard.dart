export 'storage_guard_io.dart'
    if (dart.library.js_interop) 'storage_guard_web.dart';

void requireDurableStorage(String implementation) {
  if (implementation == 'inMemory') {
    throw StateError(
      'O navegador não oferece armazenamento durável. Use outro navegador ou o app nativo.',
    );
  }
}
