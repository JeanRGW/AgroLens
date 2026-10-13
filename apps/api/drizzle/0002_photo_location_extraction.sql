-- Custom SQL migration file, put your code below! --
-- Custom migration: schema DDL matches the drizzle-kit generated snapshot;
-- data backfill classifies historical coordinates by convention.
ALTER TABLE "upload_images" ADD COLUMN "location_source" text;
--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "init_request_hash" text;
--> statement-breakpoint
ALTER TABLE "upload_images" ADD CONSTRAINT "upload_images_location_source_check"
CHECK ("location_source" IS NULL OR "location_source" IN ('file', 'device', 'manual', 'none'));
--> statement-breakpoint
UPDATE "upload_images"
SET "location_source" = CASE WHEN "latitude" IS NULL THEN 'none' ELSE 'device' END;
