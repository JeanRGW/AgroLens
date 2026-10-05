# AgroLens Mobile

Flutter field app for offline image capture, metadata collection, and backend sync.

## Setup

`API_BASE_URL` is compile-time configuration; production defaults to `https://app.agrolens.rgw.app/api`.

Upload validation defaults to 100 files per batch and 100 MiB per file, matching
the backend defaults. If deployment limits differ, use the same values for
`--dart-define=UPLOAD_MAX_FILES=...` and
`--dart-define=UPLOAD_MAX_FILE_SIZE_BYTES=...` when building the app.
Original bytes must be JPEG, PNG, or WebP. HEIC/HEIF is rejected, not renamed or
transcoded; export those photos to a supported format before selecting them.

From `apps/mobile`:

```bash
flutter pub get
dart run build_runner build
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api
```

## Features

- Field photo capture with property, talhão, culture, estadio metadata
- Drift SQLite queue with connectivity-aware sync on all platforms
- Presigned S3 upload pipeline shared with the backend contract
- Secure token storage (never plain preferences)
- Map-based coordinate picker (OpenStreetMap)

## Local networking

`localhost` refers to the device running Flutter. Use a host address reachable by both the device and your development machine:

- Android emulator: `API_BASE_URL=http://10.0.2.2:3000/api`; set the backend's `S3_PUBLIC_ENDPOINT=http://10.0.2.2:3900` for emulator uploads.
- Physical device: use the development machine's LAN IP for both URLs, for example `http://192.168.1.20:3000/api` and `http://192.168.1.20:3900`. Both devices must be on a reachable network.
- iOS simulator on the same Mac: localhost normally reaches the Mac's services.

Restart/recreate the backend after changing `S3_PUBLIC_ENDPOINT`. A LAN address is useful when testing web and mobile together because both must resolve the signed storage URLs. GPS and the installed Flutter PWA require HTTPS or localhost.

## Web PWA

The app also builds as an installable PWA served by the API under `/m/`
(`https://app.agrolens.rgw.app/m/`), so iOS users can install it from Safari
(Share → "Adicionar à Tela de Início") without App Store distribution.

```bash
# Regenerate after SQLite dependency changes (assets are committed under web/).
# Compiles Drift's worker and downloads the locked sqlite3 WASM version.
bash tool/setup_web_sqlite.sh

# build the PWA bundle (self-hosted CanvasKit; offline caching via web/sw.js)
flutter build web --release --base-href /m/ --no-web-resources-cdn
```

The API serves `apps/mobile/build/web` in dev (`WEB_MOBILE_DIST_PATH` override) and
`./apps/api/web-mobile` in the production image (see `apps/api/Dockerfile`). Without
`--dart-define=API_BASE_URL`, web builds call same-origin `/api`, so no CORS setup is
needed.

Web-specific behavior (parity with mobile otherwise):

- Offline app shell and asset caching come from `web/sw.js` (Flutter's generated
  service worker is deprecated); `/api` requests are never cached.
- Tokens use `flutter_secure_storage_web` (browser storage) with the same
  `clientType: 'mobile'` auth contract; the API is unchanged.
- Login/logout invalidates other PWA tabs without deleting their queues. Sync
  verifies the access token's account identity, including after refresh.
- Pending originals are blobs in IndexedDB (`agrolens-image-blobs`) instead of files,
  and Drift uses `sqlite3.wasm` + `drift_worker.js` (OPFS or IndexedDB-backed).
- Browser Web Locks coordinate token rotation and image saves/orphan cleanup
  across tabs; the PWA requires a browser supporting Web Locks in a secure context.
- Camera capture goes through the system camera (file input); `retrieveLostData`
  recovery is Android-only. Signed downloads open in a browser tab.
- Only one PWA instance may access the local database at a time. Memory-only
  storage is rejected; close other AgroLens tabs if local storage is unavailable.
- The app requests persistent storage and warns when protection or offline
  preparation is unavailable. Browser storage can still be lost through device
  failure, storage pressure, clearing site data, or removing the app. iOS home-screen
  apps are not subject to a blanket seven-day Safari-tab deletion rule.
- Camera/GPS require HTTPS (the secure context is guaranteed on the production host).

Before a field release, manually check an installed iPhone PWA and Android Chrome:
online preparation followed by airplane-mode cold startup, restoring a draft after
closing the app, interrupted upload recovery, camera return, and denied GPS access.
Desktop browser tests do not replace these device checks.

## Offline data and retries

Photos are autosaved as account-owned local drafts as soon as the picker returns.
Metadata changes are saved progressively. Reopen the app and choose
"Continuar coleta não finalizada" to restore a draft. Only finalizing the batch makes
it eligible for synchronization; leaving or logging out retains it unless you
explicitly discard it. The saved indicator appears only after local commits finish.
Camera handoff interruption before the photo returns and browser data deletion
cannot be recovered. Keep original photos until server confirmation, and keep the
app open during synchronization.

This test branch starts with a fresh Drift schema (version 1). There are no sqflite migrations or historical API response aliases. Synchronize old queues and clear app/site storage manually before switching; backend Drizzle migrations remain unchanged.

Schema source: `lib/services/app_database.drift`. After schema edits run `dart run build_runner build`; after Drift/SQLite dependency updates also run `bash tool/setup_web_sqlite.sh` and bump the shell cache version in `web/sw.js`.

Catalogs are cached in SQLite. Offline catalog creation queues temporary local IDs; synchronization creates or matches server entities and resolves parent IDs before uploads are initialized. Updates/deletions of existing server catalogs require connectivity.

Uploads retain a stable client ID through network retries. The pipeline initializes the server upload, PUTs missing originals, completes it, and polls finalization. Original local files are retained until server readiness is confirmed. Pending processing remains recoverable on the next attempt. Local queue ownership and session coordination prevent another account from sending the original user's batch.

See the [architecture guide](../../docs/architecture.md) for server states and the current web/mobile capability matrix.

## Validation

```bash
dart format --set-exit-if-changed .
flutter analyze
flutter test
flutter test --platform chrome test/web/storage_browser_test.dart
node --test test/web/pwa_assets_test.mjs
flutter build apk --debug --no-pub
flutter build web --release --base-href /m/ --no-web-resources-cdn
```

Cross-app E2E with web is opt-in; see `../../docs/testing/cross-app-e2e.md`. Never commit the credential-bearing artifact.

## Release Readiness

This section is the release gate. Owner/legal choices (bundle ID, team, signing identity, store metadata) stay outside the repo.

- Confirm `version` in `pubspec.yaml` (`marketing+build`); never reuse an App Store build number.
- Confirm Android `applicationId` and versions with the release owner.
- Production endpoint verified via `--dart-define=API_BASE_URL=<production-api>`.

### iOS

1. On macOS with the pinned Flutter version: `flutter pub get`, then `flutter build ios --release --no-codesign --dart-define=API_BASE_URL=<production-api>`.
2. Open `ios/Runner.xcworkspace`, set the approved bundle ID/team, certificate, and provisioning profile from the external secret manager.
3. Archive, validate, export via the approved App Store method; verify bundle ID, version, entitlements, symbols, and endpoint.
4. Upload to App Store Connect, finish approved privacy/export/age-rating answers, test via TestFlight before review.

### Android

- Configure `android/key.properties` or `ANDROID_*` env; never commit signing material.
- `flutter build appbundle --release --dart-define=API_BASE_URL=<production-api>`; verify signed AAB, symbols, version, package, endpoint.

### Checklist

- [ ] Bundle ID, team, signing, and provisioning owner-approved
- [ ] Unique version/build numbers recorded
- [ ] Production API verified
- [ ] Permission strings match actual UX
- [ ] Privacy, data-safety, export, and age-rating answers approved
- [ ] TestFlight / Play internal testing passed
- [ ] Symbols and checksums archived privately

CI stays Linux-only; the manual iOS unsigned-build job performs no signing and is not distributability evidence.
