# Repository Guide (AgroLens monorepo)

## Workspace boundaries

- This **is** a pnpm workspace + Turborepo repo. Run Node tasks from the root
  (`pnpm turbo run <task>`) or scoped (`pnpm --filter @agrolens/api <script>`).
  Do not run bare `npm` inside `apps/*/`.
- Node 22+ and pnpm 10 (`corepack enable`). Single `pnpm-lock.yaml` at root.
- `services/inference` (Python) and `apps/mobile` (Flutter) are **not** pnpm
  workspaces — `pnpm-workspace.yaml` lists only `apps/api`, `apps/web`, `packages/*`.
- `apps/api/src/main.ts` is the merged NestJS HTTP + worker entrypoint;
  `apps/api/src/worker/main.ts` is the emergency standalone worker.
- `packages/contracts` (`@agrolens/contracts`) is the single source of truth for
  API shapes: Zod schemas + inferred types. Backend validates with it; web imports
  types from it. Never hand-write a DTO mirror in `apps/web` — import from contracts.
- Mobile is Dart and cannot consume the TS package; its parsers follow the
  current API envelopes without historical aliases on this test branch.

## Commands

- Install: `pnpm install` (root). Contracts first: `pnpm --filter @agrolens/contracts build`.
- All-workspace CI order: `pnpm turbo run lint typecheck test build`
  (turbo guarantees contracts builds before dependents).
- API focused: `cd apps/api && pnpm test -- <file.spec.ts>`; e2e:
  `pnpm test:e2e -- <file.e2e-spec.ts>` (config `test/jest-e2e.json`, needs live
  postgres + garage). Drift check: `pnpm config:drift`.
- Web focused: `pnpm --filter @agrolens/web test --include='src/**/file.spec.ts'`
  (needs Chrome/Chromium); typecheck: `pnpm typecheck`; e2e: `pnpm e2e`
  (needs full local stack + seeded admin). Raise throttle limits for e2e runs
  (the browser suite logs in repeatedly and trips the dev defaults):
  `THROTTLE_DEFAULT_LIMIT=1000 THROTTLE_AUTH_LIMIT=1000 docker compose ... up -d`.
- Contracts: `pnpm --filter @agrolens/contracts test` (`node --test`).
- Mobile: `cd apps/mobile && dart format --set-exit-if-changed . && flutter analyze && flutter test`.
  Drift schema: `lib/services/app_database.drift`; generate with `dart run build_runner build`.
  Refresh web storage runtime after dependency updates: `bash tool/setup_web_sqlite.sh`.
  Web PWA build: `flutter build web --release --base-href /m/ --no-web-resources-cdn`
  (served by the API under `/m/`; SQLite wasm assets are committed under `apps/mobile/web/`).
- Inference: `cd services/inference && pip install -r test-requirements.txt && python -m pytest tests/ -v`.

## Local services

- Local PostgreSQL + Garage: `deploy/docker-compose.dev.yml`.
  API/worker E2E: `cd deploy && docker compose -f docker-compose.dev.yml up -d postgres garage api`.
- Seed admin: `cd apps/api && pnpm db:seed:first-admin` (set `ADMIN_*` in `.env` first;
  never commit `.env`).
- `S3_ENDPOINT` is server-side (may be `http://garage:3900` in Docker);
  `S3_PUBLIC_ENDPOINT` is embedded in presigned URLs (browser/device reachable).
- Production serves the web bundle from the API image; the static dir is
  `WEB_DIST_PATH` (Compose sets it to the copied browser bundle), falling back to
  the monorepo `apps/web/dist/agrolens-web/browser` path in dev.

## Database and deployment

- Schema source: `apps/api/src/database/schema.ts`; migrations in `apps/api/drizzle/`.
  After schema edits: `cd apps/api && pnpm db:generate`, inspect the new file, then
  `pnpm db:migrate` against the intended database.
- Production validates with:
  `cd deploy/production && docker compose -f docker-compose.prod.yml --env-file .env.example config --quiet`.
- Production image builds from repo root: `docker build -f apps/api/Dockerfile .`
  (web-builder → api-builder → production stages). Use `--target api-only` for split hosting.
- Never commit `.env` files, secrets, signing keys, generated builds, local auth
  state, or cross-app E2E credential artifacts.
