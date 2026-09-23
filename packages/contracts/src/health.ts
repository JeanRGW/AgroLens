import { z } from "zod";

export const healthStatusSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string(),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const dbHealthStatusSchema = z.object({
  status: z.enum(["ok", "error"]),
  message: z.string(),
  latencyMs: z.number(),
});

export type DbHealthStatus = z.infer<typeof dbHealthStatusSchema>;

export const storageHealthResultSchema = z.object({
  status: z.enum(["ok", "error", "not_configured"]),
  message: z.string(),
  endpoint: z.string().optional(),
  bucket: z.string().optional(),
});

export type StorageHealthResult = z.infer<typeof storageHealthResultSchema>;

export const workerQueueHealthSchema = z.object({
  queue: z.string(),
  depth: z.number(),
  dead_count: z.number(),
  max_attempts: z.number(),
  oldest_pending_age_ms: z.number(),
  last_error: z.string().nullable(),
});

export type WorkerQueueHealth = z.infer<typeof workerQueueHealthSchema>;

export const workerHealthResultSchema = z.object({
  status: z.enum(["ok", "unhealthy"]),
  queues: z.array(workerQueueHealthSchema),
});

export type WorkerHealthResult = z.infer<typeof workerHealthResultSchema>;

export const runtimeConfigSchema = z.object({
  inferenceEnabled: z.boolean(),
  mailEnabled: z.boolean(),
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

export const DEAD_JOB_QUEUES = [
  "upload_finalization",
  "object_deletion",
] as const;
export const deadJobQueueSchema = z.enum(DEAD_JOB_QUEUES);
export type DeadJobQueue = z.infer<typeof deadJobQueueSchema>;

export interface DeadJob {
  id: string;
  queue: DeadJobQueue;
  payload: unknown;
  attempts: number;
  lastError: string | null;
  createdAt: Date | string;
}

export interface ListDeadJobsResponse {
  jobs: DeadJob[];
}
