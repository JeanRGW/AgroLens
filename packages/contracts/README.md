# @agrolens/contracts

Shared TypeScript contracts, Data Transfer Objects (DTOs), and Zod validation schemas for the AgroLens monorepo.

## Response Envelope Standard

All AgroLens API responses adhere to the following convention:

1. **Individual Resources:**
   - Single entities are returned directly (bare resources) or keyed under the singular noun (e.g. `{ user: User }`, `{ property: Property }`, `{ upload: Upload }`).
   - Mutations return the updated entity (e.g. `{ grant: AccessGrant }`, `{ message: string }`).

2. **Collections & Lists:**
   - All paginated collection endpoints return a standardized envelope containing:
     ```json
     {
       "items": [...],
       "total": 42
     }
     ```
   - Legacy endpoint envelopes (such as `{ uploads: [...], total, limit, offset }`) are typed for backward compatibility during transition.

3. **Pagination Parameters:**
   - All list endpoints normalize pagination to `limit` and `offset`:
     - `limit`: defaults to `20`, minimum `1`, maximum `100` (or `500` for audit logs).
     - `offset`: defaults to `0`, minimum `0`.
   - Legacy query inputs using `page` and `pageSize` are coerced to `limit` and `offset`.

## Modules

- `common`: `pageParamsSchema`, `paginatedResponseSchema`, `apiErrorSchema`, `timestampSchema`, `Paginated<T>`.
- `auth`: Credentials, token rotation, password recovery, session schemas and DTOs.
- `catalog`: Properties, talhões, crop types, and growth stages (estádios).
- `uploads`: File descriptor schemas, upload initialization, filtering, and S3 display/download contracts.
- `annotations`: YOLO labels, bounding boxes, and annotation payload schemas.
- `access`: Role-based and fine-grained resource access grants.
- `audit`: System audit events and filter queries.
- `inference`: Model registration, status transitions, detection payloads, and inference jobs.
- `users`: User lifecycle, administration, role mutation, and lookup queries.
- `health`: Service liveness, database, storage, and worker queue diagnostics.
