import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  doublePrecision,
  timestamp,
  jsonb,
  inet,
  boolean,
  index,
  uniqueIndex,
  customType,
  check,
  foreignKey,
  unique,
} from 'drizzle-orm/pg-core';

// ── Custom column types ──────────────────────────────────────────────

/** PostgreSQL citext — case-insensitive text, used for emails. */
const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext';
  },
});

// ── Users & Auth ─────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: citext('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    role: text('role').notNull().default('user'),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('users_role_check', sql`${table.role} in ('admin', 'user')`)],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    familyId: uuid('family_id').notNull(),
    userAgent: text('user_agent'),
    ipAddress: inet('ip_address'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedByTokenId: uuid('replaced_by_token_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('refresh_tokens_user_id_idx').on(table.userId),
    index('refresh_tokens_family_id_idx').on(table.familyId),
    index('refresh_tokens_expires_at_idx').on(table.expiresAt),
    // Lookup key for refresh-token validation; uniqueness guards duplicates.
    uniqueIndex('refresh_tokens_token_hash_idx').on(table.tokenHash),
  ],
);

// ── Catalogs ─────────────────────────────────────────────────────────

export const properties = pgTable(
  'properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    owner: text('owner').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    address: text('address').notNull(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('properties_user_normalized_name_idx').on(table.userId, table.normalizedName),
  ],
);

export const talhoes = pgTable(
  'talhoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('talhoes_property_normalized_name_idx').on(table.propertyId, table.normalizedName),
    // Owner listing
    index('talhoes_user_idx').on(table.userId),
  ],
);

export const cropTypes = pgTable(
  'crop_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('crop_types_user_normalized_name_idx').on(table.userId, table.normalizedName),
  ],
);

export const estadios = pgTable(
  'estadios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    cropTypeId: uuid('crop_type_id')
      .notNull()
      .references(() => cropTypes.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('estadios_crop_type_normalized_name_idx').on(
      table.cropTypeId,
      table.normalizedName,
    ),
    // Owner listing
    index('estadios_user_idx').on(table.userId),
    unique('estadios_id_crop_type_unique').on(table.id, table.cropTypeId),
  ],
);

// ── Uploads & Files ──────────────────────────────────────────────────

export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientUploadId: text('client_upload_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    talhaoId: uuid('talhao_id')
      .notNull()
      .references(() => talhoes.id),
    cropTypeId: uuid('crop_type_id')
      .notNull()
      .references(() => cropTypes.id),
    estadioId: uuid('estadio_id'),
    source: text('source').notNull(),
    status: text('status').notNull().default('draft'),
    activityDate: timestamp('activity_date', { withTimezone: true }).notNull(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('uploads_user_client_upload_id_idx').on(table.userId, table.clientUploadId),
    foreignKey({
      name: 'uploads_estadio_crop_type_fk',
      columns: [table.estadioId, table.cropTypeId],
      foreignColumns: [estadios.id, estadios.cropTypeId],
    }).onUpdate('cascade'),
    check('uploads_source_check', sql`${table.source} in ('drone', 'phone', 'mixed')`),
    check(
      'uploads_status_check',
      sql`${table.status} in ('draft', 'finalizing', 'ready', 'failed')`,
    ),
    // Recommended query indexes
    index('uploads_ready_created_idx')
      .on(table.createdAt.desc(), table.id.desc())
      .where(sql`${table.status} = 'ready'`),
    index('uploads_cleanup_status_updated_idx').on(table.status, table.updatedAt, table.id),
    index('uploads_cleanup_status_created_idx').on(table.status, table.createdAt, table.id),
    index('uploads_cleanup_deleted_status_updated_idx').on(
      table.deletedAt,
      table.status,
      table.updatedAt,
      table.id,
    ),
    index('uploads_user_created_idx').on(table.userId, table.createdAt.desc(), table.id.desc()),
    index('uploads_talhao_created_idx').on(table.talhaoId, table.createdAt.desc(), table.id.desc()),
    index('uploads_crop_created_idx').on(table.cropTypeId, table.createdAt.desc(), table.id.desc()),
    index('uploads_estadio_created_idx').on(
      table.estadioId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const uploadImages = pgTable(
  'upload_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    uploadId: uuid('upload_id')
      .notNull()
      .references(() => uploads.id, { onDelete: 'cascade' }),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
  },
  (table) => [
    index('upload_images_upload_id_idx').on(table.uploadId, table.id),
    check(
      'upload_images_coordinates_check',
      sql`(${table.latitude} IS NULL AND ${table.longitude} IS NULL) OR (${table.latitude} IS NOT NULL AND ${table.longitude} IS NOT NULL AND ${table.latitude} BETWEEN -90 AND 90 AND ${table.longitude} BETWEEN -180 AND 180)`,
    ),
  ],
);

export const uploadFiles = pgTable(
  'upload_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    imageId: uuid('image_id')
      .notNull()
      .references(() => uploadImages.id, { onDelete: 'cascade' }),
    variant: text('variant').notNull(),
    objectKey: text('object_key').notNull().unique(),
    contentType: text('content_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    observedEtag: text('observed_etag').$type<string | null | undefined>(),
    width: integer('width'),
    height: integer('height'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('upload_files_image_variant_idx').on(table.imageId, table.variant),
    check('upload_files_variant_check', sql`${table.variant} in ('original', 'preview')`),
  ],
);

// ── Access Control ───────────────────────────────────────────────────

export const accessGrants = pgTable(
  'access_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectUserId: uuid('subject_user_id')
      .notNull()
      .references(() => users.id),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id').notNull(),
    actions: text('actions')
      .array()
      .notNull()
      .default(sql`ARRAY['read']::text[]`),
    grantedByUserId: uuid('granted_by_user_id')
      .notNull()
      .references(() => users.id),
    reason: text('reason'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'access_grants_resource_type_check',
      sql`${table.resourceType} in ('upload', 'property', 'talhao', 'crop_type', 'estadio')`,
    ),
    // Active-grant partial unique index: only one active grant per user/resource pair
    uniqueIndex('access_grants_active_unique')
      .on(table.subjectUserId, table.resourceType, table.resourceId)
      .where(sql`${table.revokedAt} IS NULL`),
    // Query indexes
    index('access_grants_subject_idx').on(table.subjectUserId, table.grantedAt.desc()),
    index('access_grants_resource_idx').on(
      table.resourceType,
      table.resourceId,
      table.grantedAt.desc(),
    ),
    // Audit of who granted access
    index('access_grants_granted_by_idx').on(table.grantedByUserId),
  ],
);

// ── Annotations ──────────────────────────────────────────────────────

export const imageAnnotations = pgTable(
  'image_annotations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    imageId: uuid('image_id')
      .notNull()
      .references(() => uploadImages.id, { onDelete: 'cascade' }),
    imageWidth: integer('image_width').notNull(),
    imageHeight: integer('image_height').notNull(),
    classes: text('classes').array().notNull(),
    labels: jsonb('labels').notNull(),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('image_annotations_image_idx').on(table.imageId)],
);

// ── Audit ────────────────────────────────────────────────────────────

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: text('event_type').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    targetUserId: uuid('target_user_id').references(() => users.id),
    resourceType: text('resource_type'),
    resourceId: uuid('resource_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    metadata: jsonb('metadata'),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_actor_created_idx').on(table.actorUserId, table.createdAt.desc()),
    index('audit_resource_created_idx').on(
      table.resourceType,
      table.resourceId,
      table.createdAt.desc(),
    ),
    index('audit_target_user_created_idx').on(table.targetUserId, table.createdAt.desc()),
    index('audit_event_type_created_idx').on(table.eventType, table.createdAt.desc()),
  ],
);

// ── Jobs ─────────────────────────────────────────────────────────────

const jobStatus = (name: string) => text(name).notNull().default('pending');

export const objectDeletionJobs = pgTable(
  'object_deletion_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    objectKey: text('object_key').notNull(),
    uploadId: uuid('upload_id').references(() => uploads.id),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull(),
    status: jobStatus('status'),
    attempts: integer('attempts').notNull().default(0),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    lockToken: uuid('lock_token'),
    retryAfter: timestamp('retry_after', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'object_deletion_jobs_status_check',
      sql`${table.status} IN ('pending', 'running', 'completed', 'dead')`,
    ),
    index('object_deletion_jobs_claim_idx').on(
      table.status,
      table.retryAfter,
      table.runAfter,
      table.createdAt,
    ),
  ],
);

export const uploadFinalizationJobs = pgTable(
  'upload_finalization_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    uploadId: uuid('upload_id')
      .notNull()
      .references(() => uploads.id),
    status: jobStatus('status'),
    attempts: integer('attempts').notNull().default(0),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    lockToken: uuid('lock_token'),
    retryAfter: timestamp('retry_after', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'upload_finalization_jobs_status_check',
      sql`${table.status} IN ('pending', 'running', 'completed', 'dead')`,
    ),
    index('upload_finalization_jobs_claim_idx').on(table.status, table.retryAfter, table.createdAt),
    uniqueIndex('upload_finalization_jobs_active_upload_idx')
      .on(table.uploadId)
      .where(sql`${table.status} IN ('pending', 'running')`),
  ],
);

// ── Inference ────────────────────────────────────────────────────────

export const inferenceModels = pgTable(
  'inference_models',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    version: text('version').notNull(),
    description: text('description'),
    objectKey: text('object_key').notNull().unique(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text('sha256'),
    status: text('status').notNull().default('uploading'),
    active: boolean('active').notNull().default(false),
    task: text('task'),
    classes: jsonb('classes'),
    validationAttempts: integer('validation_attempts').notNull().default(0),
    errorMessage: text('error_message'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('inference_models_name_version_non_deleted_idx')
      .on(table.name, table.version)
      // Allow names and versions from soft-deleted models to be reused.
      .where(sql`${table.deletedAt} IS NULL`),
    check(
      'inference_models_status_check',
      sql`${table.status} in ('uploading', 'validating', 'ready', 'invalid')`,
    ),
    // Supports reclaiming models left in validation.
    index('inference_models_validating_idx')
      .on(table.status, table.validationAttempts)
      .where(sql`${table.status} = 'validating'`),
    index('inference_models_created_by_user_idx').on(
      table.createdByUserId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const inferenceJobs = pgTable(
  'inference_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    modelId: uuid('model_id')
      .notNull()
      .references(() => inferenceModels.id),
    modelSnapshot: jsonb('model_snapshot').notNull(),
    sourceType: text('source_type').notNull(),
    uploadId: uuid('upload_id').references(() => uploads.id),
    status: text('status').notNull().default('uploading'),
    imageCount: integer('image_count').notNull().default(0),
    completedCount: integer('completed_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'inference_jobs_status_check',
      sql`${table.status} in ('uploading', 'queued', 'running', 'completed', 'failed')`,
    ),
    check('inference_jobs_source_type_check', sql`${table.sourceType} in ('upload', 'temporary')`),
    // Supports worker dispatch in creation order.
    index('inference_jobs_queue_idx')
      .on(table.status, table.createdAt)
      .where(sql`${table.status} in ('queued', 'running')`),
    // User listing
    index('inference_jobs_user_created_idx').on(
      table.userId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    // Expiry
    index('inference_jobs_expires_at_idx')
      .on(table.expiresAt)
      .where(sql`${table.expiresAt} IS NOT NULL`),
    // FK lookups (model views, upload-related cleanup)
    index('inference_jobs_model_idx').on(table.modelId),
    index('inference_jobs_upload_idx').on(table.uploadId),
  ],
);

export const inferenceJobImages = pgTable(
  'inference_job_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => inferenceJobs.id, { onDelete: 'cascade' }),
    uploadImageId: uuid('upload_image_id').references(() => uploadImages.id, {
      onDelete: 'set null',
    }),
    imageIndex: integer('image_index').notNull(),
    fileName: text('file_name').notNull(),
    sourceObjectKey: text('source_object_key').notNull(),
    observedEtag: text('observed_etag').$type<string | null | undefined>(),
    width: integer('width'),
    height: integer('height'),
    status: text('status').notNull().default('queued'),
    detections: jsonb('detections'),
    inferenceMs: integer('inference_ms'),
    attempts: integer('attempts').notNull().default(0),
    errorMessage: text('error_message'),
    // Prevent retries from being claimed before their backoff expires.
    retryAfter: timestamp('retry_after', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('inference_job_images_job_image_idx').on(table.jobId, table.imageIndex),
    check(
      'inference_job_images_status_check',
      sql`${table.status} in ('queued', 'running', 'completed', 'failed')`,
    ),
    // Supports atomic image claims in creation order.
    index('inference_job_images_queue_idx')
      .on(table.jobId, table.status, table.createdAt)
      .where(sql`${table.status} in ('queued', 'running')`),
  ],
);

// ── Password recovery ───────────────────────────────────────────────

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // SHA-256 hex of the raw token; the raw token is only ever emailed.
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('password_reset_tokens_hash_idx').on(table.tokenHash),
    index('password_reset_tokens_expires_idx').on(table.expiresAt),
  ],
);
