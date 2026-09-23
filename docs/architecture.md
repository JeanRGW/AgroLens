# Architecture and client responsibilities

AgroLens collects field images, processes originals and previews, supports annotation and inference, and exports YOLO datasets. The production deployment runs one NestJS HTTP/worker process, PostgreSQL, Garage object storage, and an optional CPU-only inference service. Angular assets are served by the backend.

## Domain model

- A **property** contains **talhões** (plots).
- A **crop type** contains **estádios** (growth stages).
- An **upload** belongs to a user and references a property, plot, crop type, and optional growth stage. It records source, activity time, and coordinates.
- An upload has **files** identified by image index and variant: original or server-generated preview.
- **Annotations** store normalized bounding boxes and class names for each image.
- **Inference models** are admin-uploaded detection models. Jobs retain their model snapshot and per-image results.

Schema source: [`apps/api/src/database/schema.ts`](../apps/api/src/database/schema.ts). Generate migrations from this file using the backend's Drizzle workflow.

## Upload lifecycle

```mermaid
sequenceDiagram
    participant C as Web / mobile
    participant A as API
    participant S as Garage
    participant W as Worker
    C->>C: Save offline batch and stable client ID
    C->>A: POST /uploads/init
    A-->>C: Draft ID and signed PUT instructions
    C->>S: PUT original bytes into staging
    C->>A: POST /uploads/:id/complete
    A->>A: Seal observed files and enqueue finalization atomically
    A-->>C: finalizing
    W->>S: Validate staged bytes; publish originals and previews
    W->>W: Mark upload ready or failed
    C->>A: Poll upload status
    A-->>C: ready
    C->>C: Release local image copies
```

The server states are `draft`, `finalizing`, `ready`, and `failed`. A failed upload can be retried when its metadata and file descriptors still match. `(userId, clientUploadId)` identifies retries, preventing duplicate server batches. Re-initializing a draft renews its activity and issues URLs for missing objects; `ready`/`finalizing` responses do not require new PUTs. Metadata changes need a new client upload ID.

The API validates metadata, ownership, file declarations, and storage seals. The worker validates actual image content, creates previews, publishes server-owned originals, and processes queued deletion. Staging cleanup waits out issued PUT URLs. Database locks and job leases protect against duplicate or stale workers.

The worker soft-deletes expired drafts and failed uploads and enqueues their objects for removal. Object deletion is asynchronous: a stopped worker or dead deletion job can leave objects in Garage. Monitor and retry dead jobs before treating database cleanup as reclaimed storage.

Offline clients retain originals through interrupted transfers and processing. Only a server `ready` result authorizes successful-sync cleanup; deleting a local batch explicitly is a separate user action. A server upload already sent may still finish after local deletion.

## Ownership and access

Authenticated users can read the shared catalogs. Owners and admins manage catalog resources; child creation validates the parent rather than requiring parent ownership. Upload reads/downloads allow the owner, an admin, or a user with an active grant on the upload or its associated property, plot, crop type, or stage. A read grant does not confer deletion rights.

Grant listing lets admins see all grants, including revoked ones. Other users see active grants on live resources they own. Ownership filters, count, and pagination run in PostgreSQL, ordered by grant time and ID. Grants are evaluated against current database state.

Upload deletion is soft deletion with delayed object cleanup. Catalog deletion may cascade to child resources and uploads. Security and administrative mutations (including access grants, role changes, and upload deletion) record audits in the same transaction; URL-access events are best-effort telemetry, not a complete access history.

## Client responsibilities

| Capability                             | Web / PWA                                          | Flutter                                                      |
| -------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| Offline capture, GPS, queued originals | IndexedDB and service worker                       | SQLite and local files                                       |
| Offline catalogs                       | Per-user snapshot of existing catalogs             | Cached catalogs plus queued local creation and ID resolution |
| Sync                                   | Foreground/reconnect, retains original batch owner | Connectivity-aware queue with account/session coordination   |
| Review, annotation, YOLO export        | Primary operator interface                         | Field capture and upload review                              |
| User/access/model administration       | Primary administration interface                   | Field-oriented catalog management                            |

Both clients currently support offline collection. Whether both should receive every future capture feature is an open product decision. Specify the target client when adding a feature; this matrix records current scope, not a promise of full parity.

The embedded web bundle and backend are released together; web response types use the current API's exact envelopes. Flutter is distributed independently and still accepts historical response aliases. Removing those aliases requires a defined supported mobile/backend version window; none is currently specified. Do not add new compatibility branches without a supported version that needs them.

## Network boundaries

- Browsers/devices call `/api` and upload/download directly through signed URLs using `S3_PUBLIC_ENDPOINT`.
- The API/worker accesses storage through `S3_ENDPOINT`.
- The worker calls `INFERENCE_SERVICE_URL`; model download URLs also use `S3_ENDPOINT`. The inference origin allowlist must include that origin.
- Inference serializes model loading and prediction in background threads, keeping the event loop available for health checks. It caches one prediction model by checksum.

## Source map

| Concern                             | Entry point                                                          |
| ----------------------------------- | -------------------------------------------------------------------- |
| HTTP startup and runtime migrations | `apps/api/src/main.ts`                                               |
| Background loops and shutdown       | `apps/api/src/worker/worker-runtime.ts`                              |
| Upload orchestration and SQL        | `apps/api/src/uploads/`, `apps/api/src/database/repositories/`       |
| Web routes and client API mappings  | `apps/web/src/app/app.routes.ts`, `apps/web/src/app/core/services/`  |
| Mobile offline catalog resolution   | `apps/mobile/lib/services/catalog_repository.dart`                   |
| Mobile upload steps and scheduling  | `apps/mobile/lib/services/upload_pipeline.dart`, `sync_service.dart` |
| Detection and model inspection      | `services/inference/app.py`                                          |

For setup, use the project READMEs. For validation, use [Contributing](../CONTRIBUTING.md). For deployment, use the [production runbook](../deploy/production/README.md).
