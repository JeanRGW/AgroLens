DROP INDEX "inference_models_name_version_non_deleted_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "inference_models_name_non_deleted_idx" ON "inference_models" USING btree ("name") WHERE "inference_models"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "inference_models" DROP COLUMN "version";