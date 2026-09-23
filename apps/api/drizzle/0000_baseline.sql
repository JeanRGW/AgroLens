CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE TABLE "access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_user_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"actions" text[] DEFAULT ARRAY['read']::text[] NOT NULL,
	"granted_by_user_id" uuid NOT NULL,
	"reason" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "access_grants_resource_type_check" CHECK ("access_grants"."resource_type" in ('upload', 'property', 'talhao', 'crop_type', 'estadio'))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"actor_user_id" uuid,
	"target_user_id" uuid,
	"resource_type" text,
	"resource_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"ip_address" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crop_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "estadios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"crop_type_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "estadios_id_crop_type_unique" UNIQUE("id","crop_type_id")
);
--> statement-breakpoint
CREATE TABLE "image_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_id" uuid NOT NULL,
	"image_index" integer NOT NULL,
	"image_width" integer NOT NULL,
	"image_height" integer NOT NULL,
	"classes" text[] NOT NULL,
	"labels" jsonb NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inference_job_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"image_index" integer NOT NULL,
	"file_name" text NOT NULL,
	"source_object_key" text NOT NULL,
	"observed_etag" text,
	"width" integer,
	"height" integer,
	"status" text DEFAULT 'queued' NOT NULL,
	"detections" jsonb,
	"inference_ms" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"retry_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inference_job_images_status_check" CHECK ("inference_job_images"."status" in ('queued', 'running', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "inference_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"model_snapshot" jsonb NOT NULL,
	"source_type" text NOT NULL,
	"upload_id" uuid,
	"status" text DEFAULT 'uploading' NOT NULL,
	"image_count" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "inference_jobs_status_check" CHECK ("inference_jobs"."status" in ('uploading', 'queued', 'running', 'completed', 'failed')),
	CONSTRAINT "inference_jobs_source_type_check" CHECK ("inference_jobs"."source_type" in ('upload', 'temporary'))
);
--> statement-breakpoint
CREATE TABLE "inference_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"description" text,
	"object_key" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text,
	"status" text DEFAULT 'uploading' NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"task" text,
	"classes" jsonb,
	"validation_attempts" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "inference_models_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "inference_models_status_check" CHECK ("inference_models"."status" in ('uploading', 'validating', 'ready', 'invalid'))
);
--> statement-breakpoint
CREATE TABLE "object_deletion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_key" text NOT NULL,
	"upload_id" uuid,
	"run_after" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"lock_token" uuid,
	"retry_after" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "object_deletion_jobs_status_check" CHECK ("object_deletion_jobs"."status" IN ('pending', 'running', 'completed', 'dead'))
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"owner" text NOT NULL,
	"user_id" uuid NOT NULL,
	"address" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"family_id" uuid NOT NULL,
	"user_agent" text,
	"ip_address" "inet",
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talhoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"property_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "upload_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_id" uuid NOT NULL,
	"image_index" integer NOT NULL,
	"variant" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint,
	"observed_etag" text,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upload_files_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "upload_files_variant_check" CHECK ("upload_files"."variant" in ('original', 'preview'))
);
--> statement-breakpoint
CREATE TABLE "upload_finalization_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"lock_token" uuid,
	"retry_after" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upload_finalization_jobs_status_check" CHECK ("upload_finalization_jobs"."status" IN ('pending', 'running', 'completed', 'dead'))
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_upload_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"talhao_id" uuid NOT NULL,
	"crop_type_id" uuid NOT NULL,
	"estadio_id" uuid,
	"source" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"activity_date" timestamp with time zone NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "uploads_source_check" CHECK ("uploads"."source" in ('drone', 'phone', 'mixed')),
	CONSTRAINT "uploads_status_check" CHECK ("uploads"."status" in ('draft', 'finalizing', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"role" text DEFAULT 'user' NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('admin', 'user'))
);
--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crop_types" ADD CONSTRAINT "crop_types_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estadios" ADD CONSTRAINT "estadios_crop_type_id_crop_types_id_fk" FOREIGN KEY ("crop_type_id") REFERENCES "public"."crop_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estadios" ADD CONSTRAINT "estadios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_annotations" ADD CONSTRAINT "image_annotations_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_annotations" ADD CONSTRAINT "image_annotations_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inference_job_images" ADD CONSTRAINT "inference_job_images_job_id_inference_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."inference_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inference_jobs" ADD CONSTRAINT "inference_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inference_jobs" ADD CONSTRAINT "inference_jobs_model_id_inference_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."inference_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inference_jobs" ADD CONSTRAINT "inference_jobs_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inference_models" ADD CONSTRAINT "inference_models_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_deletion_jobs" ADD CONSTRAINT "object_deletion_jobs_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talhoes" ADD CONSTRAINT "talhoes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talhoes" ADD CONSTRAINT "talhoes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_files" ADD CONSTRAINT "upload_files_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_finalization_jobs" ADD CONSTRAINT "upload_finalization_jobs_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_talhao_id_talhoes_id_fk" FOREIGN KEY ("talhao_id") REFERENCES "public"."talhoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_crop_type_id_crop_types_id_fk" FOREIGN KEY ("crop_type_id") REFERENCES "public"."crop_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_estadio_crop_type_fk" FOREIGN KEY ("estadio_id","crop_type_id") REFERENCES "public"."estadios"("id","crop_type_id") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "access_grants_active_unique" ON "access_grants" USING btree ("subject_user_id","resource_type","resource_id") WHERE "access_grants"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "access_grants_subject_idx" ON "access_grants" USING btree ("subject_user_id","granted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "access_grants_resource_idx" ON "access_grants" USING btree ("resource_type","resource_id","granted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "access_grants_granted_by_idx" ON "access_grants" USING btree ("granted_by_user_id");--> statement-breakpoint
CREATE INDEX "audit_actor_created_idx" ON "audit_events" USING btree ("actor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_resource_created_idx" ON "audit_events" USING btree ("resource_type","resource_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_target_user_created_idx" ON "audit_events" USING btree ("target_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_event_type_created_idx" ON "audit_events" USING btree ("event_type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "crop_types_user_normalized_name_idx" ON "crop_types" USING btree ("user_id","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "estadios_crop_type_normalized_name_idx" ON "estadios" USING btree ("crop_type_id","normalized_name");--> statement-breakpoint
CREATE INDEX "estadios_user_idx" ON "estadios" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "image_annotations_upload_image_idx" ON "image_annotations" USING btree ("upload_id","image_index");--> statement-breakpoint
CREATE UNIQUE INDEX "inference_job_images_job_image_idx" ON "inference_job_images" USING btree ("job_id","image_index");--> statement-breakpoint
CREATE INDEX "inference_job_images_queue_idx" ON "inference_job_images" USING btree ("job_id","status","created_at") WHERE "inference_job_images"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "inference_jobs_queue_idx" ON "inference_jobs" USING btree ("status","created_at") WHERE "inference_jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "inference_jobs_user_created_idx" ON "inference_jobs" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "inference_jobs_expires_at_idx" ON "inference_jobs" USING btree ("expires_at") WHERE "inference_jobs"."expires_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "inference_jobs_model_idx" ON "inference_jobs" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "inference_jobs_upload_idx" ON "inference_jobs" USING btree ("upload_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inference_models_name_version_non_deleted_idx" ON "inference_models" USING btree ("name","version") WHERE "inference_models"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "inference_models_validating_idx" ON "inference_models" USING btree ("status","validation_attempts") WHERE "inference_models"."status" = 'validating';--> statement-breakpoint
CREATE INDEX "inference_models_created_by_user_idx" ON "inference_models" USING btree ("created_by_user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "object_deletion_jobs_claim_idx" ON "object_deletion_jobs" USING btree ("status","retry_after","run_after","created_at");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_hash_idx" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_expires_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_user_normalized_name_idx" ON "properties" USING btree ("user_id","normalized_name");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "talhoes_property_normalized_name_idx" ON "talhoes" USING btree ("property_id","normalized_name");--> statement-breakpoint
CREATE INDEX "talhoes_user_idx" ON "talhoes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "upload_files_upload_image_variant_idx" ON "upload_files" USING btree ("upload_id","image_index","variant");--> statement-breakpoint
CREATE INDEX "upload_finalization_jobs_claim_idx" ON "upload_finalization_jobs" USING btree ("status","retry_after","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "upload_finalization_jobs_active_upload_idx" ON "upload_finalization_jobs" USING btree ("upload_id") WHERE "upload_finalization_jobs"."status" IN ('pending', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "uploads_user_client_upload_id_idx" ON "uploads" USING btree ("user_id","client_upload_id");--> statement-breakpoint
CREATE INDEX "uploads_ready_created_idx" ON "uploads" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "uploads"."status" = 'ready';--> statement-breakpoint
CREATE INDEX "uploads_cleanup_status_updated_idx" ON "uploads" USING btree ("status","updated_at","id");--> statement-breakpoint
CREATE INDEX "uploads_cleanup_status_created_idx" ON "uploads" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "uploads_cleanup_deleted_status_updated_idx" ON "uploads" USING btree ("deleted_at","status","updated_at","id");--> statement-breakpoint
CREATE INDEX "uploads_user_created_idx" ON "uploads" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "uploads_talhao_created_idx" ON "uploads" USING btree ("talhao_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "uploads_crop_created_idx" ON "uploads" USING btree ("crop_type_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "uploads_estadio_created_idx" ON "uploads" USING btree ("estadio_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);