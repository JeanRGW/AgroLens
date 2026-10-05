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

## Online operator UI

Angular provides online uploads, review, annotation, export, and administration.
It does not install a PWA, cache catalogs/identity, or persist an offline queue.
Selected images and retry IDs remain in memory only while the upload page is open.

Offline field collection and installation belong to the [Flutter PWA](../mobile/README.md#web-pwa), served at `/m/` on the API origin. GPS requires HTTPS or localhost.

Testers must synchronize old queues, unregister old Angular service workers, and clear site storage themselves before switching to this branch. No retirement or data-migration code is shipped.

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
pnpm --filter @agrolens/web test --include='src/**/file.spec.ts'
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

## Features

- Auth with session refresh
- Dashboard and uploads list/detail
- Properties, talhões, cultures, estadios management
- Admin users, access grants, audit + CSV export
- Canvas annotation editor with undo/redo and class palette
- YOLO export dialog and ZIP download
- Inference viewer
