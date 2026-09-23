# AgroLens Mobile

Flutter field app for offline image capture, metadata collection, and backend sync.

## Setup

`API_BASE_URL` is compile-time configuration; production defaults to `https://app.agrolens.rgw.app/api`.

Upload validation defaults to 100 files per batch and 100 MiB per file, matching
the backend defaults. If deployment limits differ, use the same values for
`--dart-define=UPLOAD_MAX_FILES=...` and
`--dart-define=UPLOAD_MAX_FILE_SIZE_BYTES=...` when building the app.

From `apps/mobile`:

```bash
flutter pub get
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api
```

## Features

- Field photo capture with property, talhão, culture, estadio metadata
- Offline SQLite queue with connectivity-aware sync
- Presigned S3 upload pipeline shared with the backend contract
- Secure token storage (never plain preferences)
- Map-based coordinate picker (OpenStreetMap)

## Local networking

`localhost` refers to the device running Flutter. Use a host address reachable by both the device and your development machine:

- Android emulator: `API_BASE_URL=http://10.0.2.2:3000/api`; set the backend's `S3_PUBLIC_ENDPOINT=http://10.0.2.2:3900` for emulator uploads.
- Physical device: use the development machine's LAN IP for both URLs, for example `http://192.168.1.20:3000/api` and `http://192.168.1.20:3900`. Both devices must be on a reachable network.
- iOS simulator on the same Mac: localhost normally reaches the Mac's services.

Restart/recreate the backend after changing `S3_PUBLIC_ENDPOINT`. A LAN address is useful when testing web and mobile together because both must resolve the signed storage URLs. GPS and the installed web PWA have additional secure-context requirements; see the web guide.

## Offline data and retries

Catalogs are cached in SQLite. Offline catalog creation queues temporary local IDs; synchronization creates or matches server entities and resolves parent IDs before uploads are initialized. Updates/deletions of existing server catalogs require connectivity.

Uploads retain a stable client ID through network retries. The pipeline initializes the server upload, PUTs missing originals, completes it, and polls finalization. Original local files are retained until server readiness is confirmed. Pending processing remains recoverable on the next attempt. Local queue ownership and session coordination prevent another account from sending the original user's batch.

See the [architecture guide](../../docs/architecture.md) for server states and the current web/mobile capability matrix.

## Validation

```bash
dart format --set-exit-if-changed .
flutter analyze
flutter test
flutter build apk --debug --no-pub
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
