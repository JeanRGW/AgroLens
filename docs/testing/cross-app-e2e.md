# Cross-App E2E

This smoke path verifies that data created through the Flutter mobile app can be consumed and managed through the Angular web app using the shared NestJS backend.

## Flow

1. The mobile integration test registers an owner user.
2. The test creates catalog data and uploads an image through the presigned upload flow.
3. The test writes a JSON artifact containing the backend URL, owner credentials, upload ID, and catalog IDs.
4. The web Playwright suite reads the artifact, logs in as the owner, provisions a viewer, verifies upload visibility, saves an annotation, and exercises export behavior.

## Temporary onboarding restriction

Public registration is disabled in production. New users must be created through the admin onboarding flow (`POST /admin/users`). Local development explicitly enables registration for this test flow.

## Prerequisites

- Backend infrastructure running locally: PostgreSQL and Garage.
- Merged backend API and worker available at `http://localhost:3000/api`.
- `S3_PUBLIC_ENDPOINT=http://localhost:3900` for local browser-accessible object URLs.
- Playwright Chromium installed in `apps/web/`.

## Run Mobile Artifact Producer

```bash
cd apps/mobile
flutter test test/integration/real_backend_sync_test.dart \
  --dart-define=REAL_BACKEND_BASE_URL=http://localhost:3000/api \
  --dart-define=CROSS_APP_ARTIFACT_PATH=/tmp/agrolens-cross-app-artifact.json
```

## Run Web Consumer

```bash
cd apps/web
CROSS_APP_ARTIFACT_PATH=/tmp/agrolens-cross-app-artifact.json \
  E2E_ADMIN_EMAIL=admin@example.com \
  E2E_ADMIN_PASSWORD=changeme123 \
  pnpm run e2e
```

The artifact contains test credentials. Write it only to a trusted temporary path and never commit it.
