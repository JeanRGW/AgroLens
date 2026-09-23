# AgroLens Web

Angular 20 operator UI for upload review, access management, labeling, and YOLO export.

## Stack

- Angular 20 standalone components + Angular Material
- Signals for local state
- Karma/Jasmine unit tests, Playwright browser E2E

Routes and lazy feature entrypoints live in `src/app/app.routes.ts`.

## Setup

From the repository root:

```bash
pnpm install
pnpm --filter @agrolens/contracts build
pnpm --filter @agrolens/web start
```

App: `http://localhost:4200`. `proxy.conf.json` forwards `/api` to `http://localhost:3000`.

## PWA

Production builds ship an installable manifest and service worker. The worker prefetches the app shell, lazy routes, and local UI icon font. Authenticated API responses are not cached by the worker. The app explicitly saves a per-user snapshot of properties, talhões, crop types, and estádios, plus the last collection identity. Image batches and their metadata are stored in IndexedDB.

Serve the production build over HTTPS (localhost is also a secure context). GPS and service workers require a secure context. `pnpm --filter @agrolens/web start` uses development mode, which disables the service worker.

### Offline collection

1. Install/open the app and sign in while connected. Wait for **Pronto para coleta offline** in the status panel. This verifies the prefetched app assets, local storage access, identity, and a complete catalog snapshot.
2. In **Novo Upload**, select property, talhão, crop type, and optionally estádio. All four selectors use saved catalogs offline.
3. Use **Minha localização** to obtain GPS independently of map tiles. Allow location access and keep device location services enabled. The picker reports accuracy and actionable positioning errors.
4. Select JPEG, PNG, or WebP images and save the batch. If a mobile capture omits its MIME type, the app infers it from a `.jpg`, `.jpeg`, `.png`, or `.webp` filename (case-insensitive) and saves that type with the image. HEIC/HEIF must be converted first. Local save must commit before the form releases its image files.
5. Pending batches synchronize on reconnect, app startup, or return to the foreground, from any route. Keep the app open to finish sending. Transient failures retry with backoff; the queue also has manual retry.

Expired server sessions retain the last offline identity and catalogs. Use **Entrar para sincronizar** to sign in as the same owner. Upload requests enforce the queued owner's identity, including after token refresh. Explicit sign-out clears the active offline identity; queued images remain associated with their original account.

The queue offers **Corrigir lote** for catalog, validation, and terminal server-processing failures, including failures after server initialization. Terminal processing failures stop automatic retries; manual retry remains available. Corrections restore the metadata and images so invalid files can be removed or replaced. Saving the correction keeps the local batch ID, creates a new client upload ID, and clears the previous server ID only after the local save commits. Ordinary network retries reuse the original client ID. Originals are removed locally only after the server confirms the batch is ready.

Use **Recarregar catálogos** in an open collection or correction form after reconnecting to update its selectors without discarding selected photos.

Each synchronization attempt polls server finalization for at most 30 seconds, including request latency; individual status requests have a 5-second timeout capped by the remaining budget. A processing batch stays saved and retries with the same client/server IDs. **Excluir lote local** is available during synchronization: confirmed deletion displays **Excluindo lote local...** while waiting for that batch's active attempt to release its lock. Other batches can be deleted independently. This removes the local copy; an upload already sent to the server may still finish processing there.

The backend worker reclaims the previous abandoned server upload: drafts expire after 24 hours without updates (`CLEANUP_DRAFT_EXPIRY_HOURS`) and failed uploads after 7 days without updates (`CLEANUP_FAILED_RETENTION_DAYS`) by default. Draft retries renew that timestamp. Cleanup soft-deletes those records and queues deletion of their stored objects. Corrections can be saved offline; reclamation runs independently in the backend worker.

**iOS:** preparation must finish inside the installed Home Screen app. Safari's catalog/IndexedDB storage is not copied into that installation. Background Sync is not supported by Safari; synchronization resumes with the app open. Persistent storage is requested where supported, but the browser controls the grant and device storage remains finite. The status panel reports storage readiness; failed local saves preserve the current selection.

### Device acceptance check (Android and iPhone)

- Prepare the installed production app online, then turn off both Wi-Fi and mobile data.
- Close and reopen the app. Confirm the last identity and queue are available.
- Create a batch with all four catalog selections, GPS, and several photos. Confirm GPS works with the map hidden.
- Close/reopen again while offline; inspect the batch and photos in **Fila offline**.
- Reconnect while viewing another screen. Confirm the batch reaches the server once and disappears from the local queue.
- Interrupt a transfer and reopen the app; verify retry does not duplicate the batch.
- Exercise denied GPS permission and a renewed login after session expiry. Confirm queued data remains available.

## Validation

From the repository root:

```bash
pnpm --filter @agrolens/web format:check
pnpm --filter @agrolens/contracts build
pnpm --filter @agrolens/web lint
pnpm --filter @agrolens/web typecheck
pnpm --filter @agrolens/web build
pnpm --filter @agrolens/web exec playwright install chromium
export CHROME_BIN="$(node -p "require('./apps/web/node_modules/@playwright/test').chromium.executablePath()")"
pnpm --filter @agrolens/web test
```

Unit tests need Chrome/Chromium (a system browser can also be used). Focus one spec:

```bash
pnpm --filter @agrolens/web test -- --include='src/**/file.spec.ts'
```

## E2E

Real-backend tests (not mocked UI). Requires API + worker + PostgreSQL + Garage + migrations + seeded admin:

From the repository root, set `ADMIN_*` in `apps/api/.env` and pass the same
admin credentials as `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` to Playwright.
Raise local auth limits for this suite's repeated logins:

```bash
THROTTLE_DEFAULT_LIMIT=1000 THROTTLE_AUTH_LIMIT=1000 \
  docker compose -f deploy/docker-compose.dev.yml up -d --build --wait postgres garage api
pnpm --filter @agrolens/api db:seed:first-admin
pnpm --filter @agrolens/web exec playwright install chromium
pnpm --filter @agrolens/web e2e
```

Cross-app mobile-to-web flow is opt-in; see `../../docs/testing/cross-app-e2e.md`. Never commit the credential-bearing artifact or local auth state.

### Production PWA regression

With the local API/worker, PostgreSQL, and Garage running and registration enabled:

```bash
pnpm --filter @agrolens/web exec playwright install chromium
pnpm --filter @agrolens/web e2e:pwa
```

This builds production assets, starts a local static server with a same-origin API proxy on port 4200, and runs Chromium with mobile viewport and service workers enabled. It provisions its own test account/catalogs and verifies offline cold launch, all catalog IDs, emulated GPS, IndexedDB survival across reloads, expired-session identity retention, and foreground sync to the real backend. Stop an existing server on port 4200 first. `E2E_API_URL` can select a different test API.

Browser GPS emulation verifies the app's handling of positions; physical-device checks are still needed for GPS reception, OS permissions, installed-app lifecycle, and iOS storage behavior.

## Features

- Auth with session refresh
- Dashboard and uploads list/detail
- Properties, talhões, cultures, estadios management
- Admin users, access grants, audit + CSV export
- Canvas annotation editor with undo/redo and class palette
- YOLO export dialog and ZIP download
- Inference viewer
