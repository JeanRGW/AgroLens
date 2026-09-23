import { z } from "zod";
import { resolveLimitOffset } from "./common";

export const AUDIT_EVENT_TYPES = [
  "access_grant",
  "access_revoke",
  "role_change",
  "display_urls_issued",
  "download_url_issued",
  "export_urls_issued",
  "upload_deleted",
  "model_init",
  "model_complete",
  "model_update",
  "model_activate",
  "model_deactivate",
  "model_delete",
  "job_create",
  "job_delete",
  "dead_job_retry",
  "password_changed",
  "password_reset",
] as const;

export const auditEventTypeSchema = z.enum(AUDIT_EVENT_TYPES);
export type AuditEventType = z.infer<typeof auditEventTypeSchema>;

/**
 * Audit listing query. Accepts normalized limit/offset and legacy page/pageSize
 * (explicit limit/offset wins). Default limit 100.
 */
export const listAuditQuerySchema = z
  .object({
    actorUserId: z.string().uuid().optional(),
    targetUserId: z.string().uuid().optional(),
    resourceType: z.string().max(50).optional(),
    resourceId: z.string().uuid().optional(),
    eventType: z.string().max(50).optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(500).optional(),
  })
  .transform((raw) => {
    const { limit, offset } = resolveLimitOffset(raw, 100);
    const page = raw.page ?? (limit > 0 ? Math.floor(offset / limit) + 1 : 1);
    return {
      actorUserId: raw.actorUserId,
      targetUserId: raw.targetUserId,
      resourceType: raw.resourceType,
      resourceId: raw.resourceId,
      eventType: raw.eventType,
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo,
      limit,
      offset,
      page,
      pageSize: limit,
    };
  });

export type ListAuditQueryDto = z.infer<typeof listAuditQuerySchema>;

/** Pre-validation input: all fields optional (HTTP query + unit-test raw objects). */
export type ListAuditQueryInput = z.input<typeof listAuditQuerySchema>;

export interface AuditEvent {
  id: string;
  eventType: AuditEventType | string;
  actorUserId: string;
  actorName?: string;
  targetUserId?: string | null;
  targetName?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  resourceName?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date | string;
}

export interface AuditFilters {
  eventType?: AuditEventType;
  actorUserId?: string;
  targetUserId?: string;
  resourceType?: string;
  resourceId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface AuditPageResult {
  items: AuditEvent[];
  total: number;
}
