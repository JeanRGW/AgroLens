{{flutter_js}}
{{flutter_build_config}}

// No serviceWorkerSettings: web/sw.js (registered from index.html) owns
// offline behavior. Flutter's built-in service worker is deprecated and only
// unregisters itself, so it must never take over this scope.
_flutter.loader.load();
