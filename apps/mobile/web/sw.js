// AgroLens mobile PWA service worker (scope: /m/).
//
// Flutter no longer generates an offline service worker, so this file owns
// offline behavior: a precached app shell plus runtime caching for anything
// else (About-screen logos, icons). API calls are never cached.
//
// The precache list must cover everything fetched before the first frame:
// a fresh page load is uncontrolled until this worker activates, so those
// requests would otherwise never reach the fetch handler below.
//
// Update strategy: navigations are network-first, other assets are
// stale-while-revalidate, so a fresh bundle is picked up within one reload.

const CACHE_PREFIX = "agrolens-m-";
const CACHE_NAME = `${CACHE_PREFIX}v4`;

// Boot-critical files: the app must start without a network round trip.
const REQUIRED_SHELL = [
  "./",
  "index.html",
  "manifest.json",
  "favicon.png",
  "main.dart.js",
  "flutter.js",
  "flutter_bootstrap.js",
  "register-sw.js",
  // SQLite wasm runtime (offline queue storage).
  "sqlite3.wasm",
  "drift_worker.js",
  // Asset metadata and UI fonts.
  "assets/AssetManifest.bin.json",
  "assets/FontManifest.json",
  "assets/fonts/MaterialIcons-Regular.otf",
  "assets/fonts/fallback/Roboto-Regular.ttf",
  // CanvasKit renderer (always present in the build).
  "canvaskit/canvaskit.js",
  "canvaskit/canvaskit.wasm",
];

// Renderer variants some browsers pick instead of the default CanvasKit,
// and the partner logos shown by the About screen. Absent files are ignored.
const OPTIONAL_SHELL = [
  "canvaskit/chromium/canvaskit.js",
  "canvaskit/chromium/canvaskit.wasm",
  "canvaskit/webparagraph/canvaskit.js",
  "canvaskit/webparagraph/canvaskit.wasm",
  "assets/assets/logo/agraria_logo.svg",
  "assets/assets/logo/agronomia_logo.png",
  "assets/assets/logo/BDA_logo.png",
  "assets/assets/logo/capes_logo.png",
  "assets/assets/logo/CC_logo.png",
  "assets/assets/logo/CNPq_logo.svg",
  "assets/assets/logo/FA_logo.png",
  "assets/assets/logo/main_logo.png",
  "assets/assets/logo/NMAP_logo.png",
  "assets/assets/logo/UNICENTRO_logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(REQUIRED_SHELL);
        await Promise.all(
          OPTIONAL_SHELL.map((url) => cache.add(url).catch(() => {})),
        );
        await cache.put(
          "offline-ready.json",
          new Response("{}", {
            headers: { "Content-Type": "application/json" },
          }),
        );
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname))
    return;

  // Dynamic, authenticated endpoints must always hit the network.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/docs")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put("index.html", response.clone());
    }
    return response;
  } catch (error) {
    const cached =
      (await caches.match(request)) ||
      (await caches.match("index.html")) ||
      (await caches.match("./"));
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const refreshed = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await refreshed) || Response.error();
}
