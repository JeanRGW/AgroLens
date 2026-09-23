# AgroLens — Backend

NestJS API and background worker for auth, catalogs, uploads, annotations, access control, and inference orchestration.

## Stack

- Node.js 22+ (CI and production image use Node 22), NestJS 11
- Drizzle ORM + PostgreSQL
- S3-compatible object storage (Garage locally)
- Zod validation, Swagger/OpenAPI

## Prerequisites

- Node.js >= 22, pnpm 10 (from the workspace root)
- Docker + Docker Compose v2

## Quick Start

From the repository root:

```bash
pnpm install
pnpm --filter @agrolens/contracts build
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`: set `ADMIN_EMAIL`, `ADMIN_FULL_NAME`, and a generated `ADMIN_PASSWORD` (for example, generate one with `openssl rand -hex 24`). The example password cannot be used to seed an account.

```bash
docker compose -f deploy/docker-compose.dev.yml up -d --build --wait postgres garage api
pnpm --filter @agrolens/api db:seed:first-admin
```

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/docs` when `SWAGGER_ENABLED=true`

The `api` service runs the merged HTTP + worker entrypoint (`src/main.ts`) and applies runtime migrations under a PostgreSQL advisory lock before listening. `src/worker/main.ts` is an emergency standalone worker using the same module.

Upload finalization, object deletion, cleanup, and inference all require the worker runtime (`WORKER_ENABLED=true`).

Shutdown cancels idle worker waits and drains in-flight work before closing
PostgreSQL and S3 clients. Finalization stops between images; inference requests
still in flight after five minutes of draining are cancelled and left recoverable.
Storage requests (including response bodies), preview generation, and database
statements have 30-second limits. Failed inference polls wait for `WORKER_POLL_INTERVAL_MS`
before retrying. Model validations abandoned on their final attempt become
`invalid` after the 10-minute stale window; late worker results are ignored.

Client image PUT URLs target `staging/uploads/...`. Finalization reads the sealed
staging bytes, validates them, and stores originals at server-owned `uploads/...`
keys. Replaying a PUT URL cannot change a ready original. Staging deletion is
queued with the file transition and delayed until issued PUT URLs have expired.
Finalization holds the upload/job locks while publishing originals and previews,
so reclaimed workers cannot publish stale results. Catalog deletion uses the same
staging/original/preview cleanup key derivation as upload deletion.

Draft retries renew their activity timestamp. Abandoned-upload cleanup waits out
outstanding PUT URLs before deleting objects. Failed object-deletion jobs remain
available for admin retry; retention prunes only successful object deletions.
Worker queue age measures overdue eligible work, excluding scheduled future work.

Inference job/model deletion and its object-deletion jobs commit together. If
cleanup cannot be queued, deletion rolls back so the API or worker can retry.

## Full Stack

```bash
docker compose -f deploy/docker-compose.dev.yml up --build
```

With inference (AI profile):

```bash
INFERENCE_ENABLED=true docker compose -f deploy/docker-compose.dev.yml --profile ai up -d --build --wait
```

Both services receive the same `INFERENCE_API_KEY` from the Compose environment (or its development default). The worker calls `http://inference:8000`; inference downloads models from `http://garage:3900`. The profile starts the service, while `INFERENCE_ENABLED` enables backend inference processing. Models are uploaded and activated through the web admin UI.

### Backend hot reload

```bash
docker compose -f deploy/docker-compose.dev.yml stop api
docker compose -f deploy/docker-compose.dev.yml up -d --wait postgres garage
pnpm --filter @agrolens/api db:migrate
pnpm --filter @agrolens/api start:dev
```

The host-run API uses `DATABASE_URL` and `S3_ENDPOINT` from `apps/api/.env` (both localhost in the example). Set `WORKER_ENABLED=true` for upload processing. Unlike the Compose development environment, `apps/api/.env.example` disables registration; set `REGISTRATION_ENABLED=true` if needed. For a host-run inference service, follow its [local guide](../../services/inference/README.md#local-development).

## Environment

See `apps/api/.env.example` for the full list. Key settings:

| Variable                                                            | Purpose                                                        |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`                                                      | PostgreSQL connection string                                   |
| `S3_ENDPOINT`                                                       | Server-side Garage endpoint (`http://garage:3900` in Docker)   |
| `S3_PUBLIC_ENDPOINT`                                                | URL baked into presigned URLs; must be client-reachable        |
| `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY`       | Storage identity                                               |
| `JWT_SECRET`                                                        | Min 32 chars, required                                         |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_DAYS`                | Token TTLs                                                     |
| `REGISTRATION_ENABLED`                                              | Self-registration toggle                                       |
| `THROTTLE_DEFAULT_LIMIT` / `THROTTLE_AUTH_LIMIT`                    | Per-IP rate limits for general vs auth routes                  |
| `WORKER_ENABLED` / `WORKER_POLL_INTERVAL_MS` / `WORKER_LEASE_MS`    | Worker runtime                                                 |
| `RETENTION_DAYS`                                                    | Pruning window for refresh tokens, terminal jobs, audit events |
| `INFERENCE_ENABLED` / `INFERENCE_SERVICE_URL` / `INFERENCE_API_KEY` | Internal YOLO service                                          |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_FULL_NAME`                | First-admin seed                                               |

Endpoint distinction matters:

- `S3_ENDPOINT` is server-side; Docker-internal hostnames are fine.
- `S3_PUBLIC_ENDPOINT` is embedded in presigned URLs for browsers/devices; never use a Docker-internal hostname. Locally: `http://localhost:3900`.
- Worker-issued model download URLs use `S3_ENDPOINT`, which must be reachable from inference and allowed by `INFERENCE_MODEL_DOWNLOAD_ORIGINS`.

## API Surface

### Health

| Method | Path                  | Auth   |
| ------ | --------------------- | ------ |
| `GET`  | `/api/health`         | Public |
| `GET`  | `/api/health/config`  | Public |
| `GET`  | `/api/health/db`      | Admin  |
| `GET`  | `/api/health/storage` | Admin  |
| `GET`  | `/api/health/worker`  | Admin  |

### Auth

| Method | Path                        | Description                                |
| ------ | --------------------------- | ------------------------------------------ |
| `POST` | `/api/auth/register`        | Self-register (when enabled)               |
| `POST` | `/api/auth/login`           | Email/password login                       |
| `POST` | `/api/auth/refresh`         | Rotate refresh token                       |
| `POST` | `/api/auth/logout`          | Revoke current session                     |
| `GET`  | `/api/auth/me`              | Current profile (Bearer JWT)               |
| `POST` | `/api/auth/forgot-password` | Request password reset (when mail enabled) |
| `POST` | `/api/auth/reset-password`  | Set new password with reset token          |

`clientType: 'web'` uses an httpOnly refresh cookie; `clientType: 'mobile'` returns the refresh token in JSON. Refresh tokens rotate on use with reuse detection.

Uploads, catalogs, annotations, access grants, audit, users, and inference admin routes follow the same `/api` prefix; use Swagger locally for exact schemas.

## Scripts

Run these commands from the repository root:

| Command                                           | Purpose                                   |
| ------------------------------------------------- | ----------------------------------------- |
| `pnpm --filter @agrolens/api start:dev`           | API with hot reload                       |
| `pnpm --filter @agrolens/api start:prod`          | Merged API + worker (`node dist/main.js`) |
| `pnpm --filter @agrolens/api start:worker`        | Emergency standalone worker only          |
| `pnpm --filter @agrolens/api build`               | Compile TypeScript                        |
| `pnpm --filter @agrolens/api test`                | Unit tests (`test/**/*.spec.ts`)          |
| `pnpm --filter @agrolens/api test:e2e`            | API E2E (`test/jest-e2e.json`)            |
| `pnpm --filter @agrolens/api lint`                | Lint                                      |
| `pnpm --filter @agrolens/api typecheck`           | Typecheck                                 |
| `pnpm --filter @agrolens/api config:drift`        | Validate example/compose env coverage     |
| `pnpm --filter @agrolens/api db:generate`         | Generate migration from `schema.ts`       |
| `pnpm --filter @agrolens/api db:migrate`          | Apply migrations                          |
| `pnpm --filter @agrolens/api db:seed:first-admin` | Create or reconcile the first admin       |

Focused runs from `apps/api`: `pnpm test -- path/to/file.spec.ts`, `pnpm test:e2e -- path/to/file.e2e-spec.ts`.

## Docker Services

| Service     | Ports | Purpose                                                       |
| ----------- | ----- | ------------------------------------------------------------- |
| `api`       | 3000  | Merged API + worker, embedded Angular SPA, runtime migrations |
| `postgres`  | 5432  | PostgreSQL 16                                                 |
| `garage`    | 3900  | S3-compatible storage (single-node, auto bucket + key)        |
| `inference` | —     | FastAPI YOLO service, internal only (`--profile ai`)          |

Bucket CORS is applied on boot from `CORS_ORIGINS`.

## Database

Schema source: `src/database/schema.ts`. Migrations live in `drizzle/` — generate after schema edits, never hand-edit only the SQL.

| Group       | Tables                                                       |
| ----------- | ------------------------------------------------------------ |
| Auth        | `users`, `refresh_tokens`, `password_reset_tokens`           |
| Catalogs    | `properties`, `talhoes`, `crop_types`, `estadios`            |
| Uploads     | `uploads`, `upload_files`                                    |
| Access      | `access_grants` (evaluated live)                             |
| Annotations | `image_annotations`                                          |
| Audit       | `audit_events`                                               |
| Jobs        | `upload_finalization_jobs`, `object_deletion_jobs`           |
| Inference   | `inference_models`, `inference_jobs`, `inference_job_images` |

```bash
pnpm --filter @agrolens/api db:generate
pnpm --filter @agrolens/api db:migrate
```

### Seed First Admin

```bash
export ADMIN_EMAIL=admin@example.com
export ADMIN_PASSWORD="$(openssl rand -hex 24)"
export ADMIN_FULL_NAME="Admin User"
pnpm --filter @agrolens/api db:seed:first-admin
```

Idempotent: reconciles role/name/phone and keeps the password unless `ADMIN_RESET_PASSWORD=true` (which atomically revokes sessions and outstanding password-reset links). Placeholder passwords are rejected.

## Validation

```bash
pnpm --filter @agrolens/api format:check
pnpm --filter @agrolens/api config:drift
pnpm turbo run lint typecheck test build
```

## Troubleshooting

### Browser cannot resolve presigned host (`ERR_NAME_NOT_RESOLVED`)

Presigned URLs inherited a Docker-internal endpoint. Set a client-reachable URL:

```text
S3_PUBLIC_ENDPOINT=http://localhost:3900
```

`deploy/docker-compose.dev.yml` already sets this for the `api` service; host-run APIs need it in `apps/api/.env` too.
