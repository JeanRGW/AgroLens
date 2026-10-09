# AgroLens Production Deployment

One Dockerfile, one Compose file, one Caddy configuration. The default deployment
still bundles Angular and the Flutter PWA (`/m/`) with the API.

## Deployment options

| | Single server | Single server, one DNS record | Pages + custom server |
| --- | --- | --- | --- |
| Web + `/m/` | Bundled with API | Bundled with API | Cloudflare Pages |
| API | `app.agrolens.rgw.app/api` | Same | `api.agrolens.rgw.app/api` |
| Storage | `s3.agrolens.rgw.app` | `app.agrolens.rgw.app:8443` | `s3.agrolens.rgw.app` |
| `API_BUILD_TARGET` in server `.env` | `production` (default) | `production` | `api-only` |

For **one DNS record**, set `S3_PUBLIC_ENDPOINT=https://app.agrolens.rgw.app:8443`
in server `.env`, and `S3_ADDRESS=https://app.agrolens.rgw.app:8443` in the host
Caddy service environment. Open TCP 80, 443 and 8443. Caddy preserves the Host
including its port so presigned S3 URLs remain valid. Do not proxy this record
through Cloudflare: large uploads can exceed its proxy limits.

For **split hosting**, set `API_BUILD_TARGET=api-only` in server `.env`, and
`API_HOST=api.agrolens.rgw.app` in the host Caddy service environment. Keep
`S3_PUBLIC_ENDPOINT=https://s3.agrolens.rgw.app` and
`CORS_ORIGINS=https://app.agrolens.rgw.app`. API/S3 DNS records should be DNS-only.
Leave `REFRESH_COOKIE_DOMAIN` empty and keep Secure cookies with SameSite=Lax.
Caddy does not inherit Compose's `.env`; configure its environment separately.

Angular's existing production environment defaults to `/api`; the Pages workflow
sets the remote API URL before compiling it. Flutter PWA/native
builds use `--dart-define=API_BASE_URL=...`. Keep the app hostname and `/m/` during
migration to preserve browser storage. Test login/refresh, signed uploads and
existing offline drafts before retiring the old endpoint.

**First release:** native builds default to `https://api.agrolens.rgw.app/api`.
Set `PUBLIC_API_URL` to that URL for Pages and Android releases. For single-host
Android deployments, explicitly override it with `https://app.agrolens.rgw.app/api`.
There is no existing production deployment requiring a legacy `/api` proxy.

**Future migration:** API URLs are compiled into installed Android/PWA builds.
Pages does not forward `/api`; changing `PUBLIC_API_URL` only fixes new builds.
Before moving an existing app hostname to Pages, require **all installed clients
using its old `/api` endpoint to upgrade**, or retain actual `/api` proxying on
that hostname. Otherwise defer the DNS switch. Keeping the browser origin alone
preserves storage, not API connectivity.

## Topology

| Domain                         | Service                           | Internal binding     |
| ------------------------------ | --------------------------------- | -------------------- |
| `https://app.agrolens.rgw.app` | Angular SPA + NestJS API + worker | `127.0.0.1:3000`     |
| `https://s3.agrolens.rgw.app`  | Garage S3 object storage          | `127.0.0.1:3900`     |
| Internal only                  | PostgreSQL 16                     | Docker network, 5432 |
| Internal only                  | FastAPI inference (profile `ai`)  | Docker network, 8000 |

The backend image embeds the Angular production bundle. Migrations run automatically on boot under a PostgreSQL advisory lock; the admin seed stays an explicit operator command.

## Initial Setup

### 1. Configure and reload Caddy

```bash
sudo install -m 0644 Caddyfile.example /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

### 2. Configure environment

```bash
cd deploy/production
cp .env.example .env
```

Set all secrets (`JWT_SECRET`, `S3_SECRET_KEY`, `DATABASE_URL`, `ADMIN_*`, `INFERENCE_API_KEY` when applicable). Never commit `.env`.

Keep Caddy's PUT limits in `Caddyfile.example` aligned with `UPLOAD_MAX_FILE_SIZE_BYTES` (100 MiB for staged uploads), `INFERENCE_TEMP_MAX_FILE_SIZE_BYTES` (25 MiB for inference images), and `INFERENCE_MODEL_MAX_SIZE_BYTES` (500 MiB for models). These path-style `/<bucket>/...` limits apply before Garage stores a body; requests that bypass host Caddy do not get them.

Worker model downloads use the internal `S3_ENDPOINT`, normally `http://garage:3900`. Set `INFERENCE_MODEL_DOWNLOAD_ORIGINS` to that origin. **When upgrading an existing deployment**, replace an allowlist containing only the public S3 origin before restarting backend and inference together. Browser/device signed URLs continue to use `S3_PUBLIC_ENDPOINT`.

### 3. Validate compose config

```bash
docker compose -f docker-compose.prod.yml --env-file .env.example config --quiet
```

### 4. Build and start

App-only (default):

```bash
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"
$COMPOSE build --pull backend
$COMPOSE up -d backend
```

With inference:

```bash
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"
$COMPOSE build --pull backend
INFERENCE_ENABLED=true $COMPOSE --profile ai up -d backend inference
```

### 5. Seed first admin

Creates the admin when missing; otherwise reconciles role/name/phone and keeps the password unless `ADMIN_RESET_PASSWORD=true` (which revokes sessions). Placeholder passwords are rejected.

```bash
set -a; . .env; set +a
$COMPOSE run --rm --no-deps \
  -e ADMIN_EMAIL -e ADMIN_PASSWORD -e ADMIN_FULL_NAME -e ADMIN_PHONE \
  backend node dist/cli/seed-first-admin.js
```

## Updates

API releases are manual over SSH. Use a dedicated repository clone on the server;
keep tracked files unchanged and secrets in `deploy/production/.env`. Select a
tested full commit SHA or release tag from protected `main` history. Tags are
optional and should never be moved after release. Deploy components independently;
a repository tag does not require releasing API, Pages and Android together.

After connecting to the server and entering the repository directory:

```bash
# Run in a subshell so a failed check stops the update without closing SSH.
(
set -e
REVISION=v0.2.0  # replace with your tested tag or full commit SHA
git diff --quiet && git diff --cached --quiet || { echo 'Tracked local changes; aborting update' >&2; exit 1; }
git fetch origin main --tags
if [[ "$REVISION" =~ ^[a-f0-9]{40}$ ]]; then
  COMMIT=$(git rev-parse --verify "$REVISION^{commit}")
else
  git check-ref-format "refs/tags/$REVISION"
  COMMIT=$(git rev-parse --verify "refs/tags/$REVISION^{commit}")
fi
git merge-base --is-ancestor "$COMMIT" origin/main
git switch --detach "$COMMIT"
cd deploy/production
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"
$COMPOSE config --quiet
$COMPOSE build --pull backend
$COMPOSE up -d --no-build --wait --wait-timeout 240 backend
echo "Deployed API revision $COMMIT"
)
```

Check public `/api/health` afterwards, using your API hostname. Keep the previous
revision for rollback: repeat the procedure with that revision. Builds consume
server resources and rebuilding is not an immutable-image rollback. Expect a
brief restart interruption. Database migrations are **not** reversed; use
backward-compatible migrations and APIs for older installed Android clients.
Operator review is the API approval gate; GitHub holds no server SSH credentials.

After Caddy changes:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## Health and Diagnostics

Public liveness and host-local readiness:

```bash
curl -fsS https://app.agrolens.rgw.app/api/health
curl -fsS http://127.0.0.1:3000/api/health/ready
```

The production Compose healthcheck uses `/api/health/ready`: it returns 503 if the database, Garage bucket, or embedded worker is unavailable. Host Caddy blocks external access with or without a trailing slash. The API also throttles readiness checks per IP (10/minute by default); keep that limit above the four checks/minute used by Compose. Public `/api/health` reports process liveness only.

Admin diagnostics (Bearer token):

```bash
TOKEN="your_admin_access_token"
curl -fsS -H "Authorization: Bearer $TOKEN" https://app.agrolens.rgw.app/api/health/db
curl -fsS -H "Authorization: Bearer $TOKEN" https://app.agrolens.rgw.app/api/health/storage
curl -fsS -H "Authorization: Bearer $TOKEN" https://app.agrolens.rgw.app/api/health/worker
curl -fsS -H "Authorization: Bearer $TOKEN" https://app.agrolens.rgw.app/api/admin/jobs/dead
```

The worker diagnostic includes queue depth, dead count, and oldest pending age. Inspect dead finalization/deletion jobs with `/api/admin/jobs/dead`, fix the underlying problem, then retry (`upload_finalization` or `object_deletion`):

```bash
QUEUE=upload_finalization
JOB_ID=<job_uuid>
curl -fsS -X POST -H "Authorization: Bearer $TOKEN" \
  "https://app.agrolens.rgw.app/api/admin/jobs/dead/$QUEUE/$JOB_ID/retry"
```

## Backups

```bash
sudo systemctl start agrolens-backup.service
sudo journalctl -u agrolens-backup.service -n 50
```

Full restore steps: [`docs/operations/backup-restore.md`](../../docs/operations/backup-restore.md).

## GitHub Actions delivery

Keep the existing CI checks required on protected `main`. Releases are explicit:
manual SSH for API, `Release Pages` workflow dispatch for web/PWA, and the existing
`Mobile` workflow on release-tag pushes for Android. Tags build Android binaries
and create draft Releases; API/Pages deployment and Play publication remain manual.
No registry or server credentials are needed in GitHub.

**Pages:** create a Direct Upload project with production branch `main`, attach
`app.agrolens.rgw.app`, and configure variables `PAGES_PROJECT`,
`CLOUDFLARE_ACCOUNT_ID`, `PUBLIC_API_URL=https://api.agrolens.rgw.app/api`, plus
secret `CLOUDFLARE_API_TOKEN` (Pages edit permission) in GitHub's `production`
environment. Allow branch `main` and tags `v*` in that environment's selected
deployment branches/tags, with required reviewers where supported by your GitHub
plan. The same environment protects Android signing; main-only rules would block
tag-triggered Android releases. Pages still requires dispatch from `main`.

Dispatch **Release Pages** from `main` with a tested release tag or full commit SHA.
It resolves and pins the commit, verifies membership in `main` history, builds
Angular and `/m/`, and uploads the production site. Verify CI passed for your
chosen revision before dispatching; membership alone does not prove CI success.
Production concurrency prevents overlapping releases; choosing an older revision
is an intentional release, not an automatic stale-CI deployment. The workflow
summary and Cloudflare deployment metadata record the released SHA. Roll back
using Cloudflare Pages' existing production deployment rollback in its dashboard.
Do not enable duplicate Cloudflare Git integration builds or
allow arbitrary preview origins into production CORS. Pages' per-file limit is
25 MiB; no Functions are needed.

**API:** follow [Updates](#updates). Use a dedicated SSH user and verified host
keys; Docker access is root-equivalent. The server needs read access to `origin`
if private. Set `API_BUILD_TARGET=api-only` in server `.env` for split hosting,
or leave the bundled default. No API job or SSH secrets are used in Actions.

## Google Play release

Push a new `vX.Y.Z` tag such as `v0.1.0` to trigger the existing `Mobile` workflow.
The tagged commit must belong to `main` history; version name comes from the tag
(`0.1.0`). Version code is automatically set to `github.run_number`, the increasing
Mobile workflow counter. Reruns keep that code; create a new tag/run for a new
release. Do not reset the workflow counter/numbering scheme after Play publication.
Publish releases in run-number order; Play updates require a higher version code.
It pins the tagged commit, runs the existing checks on that commit, requests
`production` approval, and builds the same commit into signed binaries. Configure
`PUBLIC_API_URL` and production secrets
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`. Enable Play App Signing and use an upload key in CI.

Every release also produces `direct-install-apks` containing signed
`arm64-v8a`, `armeabi-v7a`, and `x86_64` APKs for sideloading. The AAB is for
Play upload, not direct installation; Play generates device-specific APKs itself.
Both outputs share the source revision, version name, version code and API URL.

For APK builds, configure separate production secrets `ANDROID_APP_KEYSTORE_BASE64`,
`ANDROID_APP_KEYSTORE_PASSWORD`, `ANDROID_APP_KEY_ALIAS`, `ANDROID_APP_KEY_PASSWORD`.
These hold the **app-signing key**, not the upload key used by the AAB step.
Before first publication, supply that app-signing key when enrolling in Play App
Signing (rather than letting Google generate a different one). This permits
updates between direct APK and Play installs when package, signing identity and
version codes are compatible; upgrades must increase the version code. Back up
the app-signing key offline and restrict its CI access to approved releases.
You may configure the same key in both secret sets, but separate upload and
app-signing keys are safer; merely signing AAB/APK with one upload key does not
make Google's installed APK signatures match. Both secret sets are required
because every release builds both formats.

After building, the workflow creates a **draft GitHub Release** for the existing
tag and attaches the AAB and architecture APKs as individual downloads.
Review it under **GitHub → Releases**, then publish the draft manually. Workflow
artifacts (`play-store-bundle`, `direct-install-apks`) remain available as backup.
Only matching tag pushes trigger signing; branch pushes, PRs and manual dispatch
run CI without releases. Existing releases are not overwritten; if a failed upload
leaves a partial draft, review/remove that
draft before retrying. The tag is checked again before upload and must not move
after testing. Configure tag protection/rulesets to prevent release-tag changes.

For example, after choosing a tested commit:

```bash
git tag -a v0.1.0 <tested-commit-sha> -m 'AgroLens 0.1.0'
git push origin v0.1.0
```

Pushing this tag starts testing and queues the signing job for production approval.
No workflow inputs are needed. Only the approved signing/release job has release-write
permissions; ordinary CI remains read-only.

Download the AAB and upload it to Play Console's internal track.
Promote the same bundle to closed testing/production there. Publishing remains
manual deliberately: no Play service account, custom publisher, or extra release
workflow. Confirm application ID `app.rgw.agrolens.app` before first publication.

Personal accounts created after November 13, 2023 without production access
currently need 12 closed-test testers continuously opted in for 14 days before
applying for production access. Complete privacy policy, Data safety, permission
and target SDK requirements, account deletion where applicable, store listing,
and reviewer credentials before submission.
