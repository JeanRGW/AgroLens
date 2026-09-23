import { z } from "zod";
import { pageParamsSchema } from "./common";

export const ALLOWED_INFERENCE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const INFERENCE_MODEL_STATUSES = [
  "uploading",
  "validating",
  "ready",
  "invalid",
] as const;

export const INFERENCE_JOB_STATUSES = [
  "uploading",
  "queued",
  "running",
  "completed",
  "failed",
] as const;

export const initModelSchema = z.object({
  name: z.string().min(1).max(255),
  version: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
});

export type InitModelDto = z.infer<typeof initModelSchema>;

export const updateModelSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export type UpdateModelDto = z.infer<typeof updateModelSchema>;

export const setActiveModelSchema = z.object({
  active: z.boolean(),
});

export type SetActiveModelDto = z.infer<typeof setActiveModelSchema>;

export const listJobsQuerySchema = pageParamsSchema;
export type ListJobsQueryDto = z.infer<typeof listJobsQuerySchema>;

export interface InferenceJobListResponse {
  jobs: InferenceJobListItem[];
  total: number;
}

const jobFileDescriptorSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_INFERENCE_CONTENT_TYPES),
  sizeBytes: z.number().int().positive(),
});

export const createJobSchema = z
  .object({
    modelId: z.string().uuid(),
    uploadId: z.string().uuid().optional(),
    imageIndexes: z.array(z.number().int().min(0)).optional(),
    files: z.array(jobFileDescriptorSchema).min(1).optional(),
  })
  .refine((data) => (data.uploadId != null) !== (data.files != null), {
    message: "Exactly one of uploadId or files must be provided",
  });

export type CreateJobDto = z.infer<typeof createJobSchema>;

export const detectionSchema = z.object({
  classId: z.number().int().min(0),
  className: z.string(),
  confidence: z.number().min(0).max(1),
  xCenter: z.number().min(0).max(1),
  yCenter: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

export type Detection = z.infer<typeof detectionSchema>;

export interface InferenceModelClass {
  id: number;
  name: string;
}

export interface InferenceModelSummary {
  id: string;
  name: string;
  version: string;
  task: string | null;
  classes: InferenceModelClass[];
}

export interface InferenceModelAdmin extends InferenceModelSummary {
  description: string | null;
  status: (typeof INFERENCE_MODEL_STATUSES)[number] | string;
  active: boolean;
  sha256: string | null;
  sizeBytes: number | null;
  errorMessage: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface InferenceJobImageSummary {
  id: string;
  imageIndex: number;
  fileName: string;
  status: "queued" | "running" | "completed" | "failed" | string;
  detectionCount: number;
  inferenceMs: number | null;
}

export interface InferenceJobDetail {
  id: string;
  modelId: string;
  modelSnapshot: {
    id: string;
    name: string;
    version: string;
    task: string | null;
    classes: unknown;
  };
  sourceType: "upload" | "temporary" | string;
  status: (typeof INFERENCE_JOB_STATUSES)[number] | string;
  imageCount: number;
  completedCount: number;
  failedCount: number;
  errorMessage: string | null;
  createdAt: Date | string;
  expiresAt: Date | string | null;
  images: InferenceJobImageSummary[];
}

export interface InferenceJobListItem {
  id: string;
  status: (typeof INFERENCE_JOB_STATUSES)[number] | string;
  sourceType: "upload" | "temporary" | string;
  imageCount: number;
  completedCount: number;
  failedCount: number;
  createdAt: Date | string;
  expiresAt: Date | string | null;
}

export interface InferenceJobImageResult {
  id: string;
  imageIndex: number;
  fileName: string;
  width: number | null;
  height: number | null;
  status: string;
  detections: Detection[];
  inferenceMs: number | null;
  imageUrl: string;
  errorMessage: string | null;
}

export interface CreateJobResponse {
  id: string;
  status: string;
  files?: {
    imageIndex: number;
    uploadUrl: string;
    objectKey: string;
    headers: Record<string, string>;
    expiresAt: string;
  }[];
}
