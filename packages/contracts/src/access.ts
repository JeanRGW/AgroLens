import { z } from "zod";
import { resolveLimitOffset } from "./common";

export const RESOURCE_TYPES = [
  "upload",
  "property",
  "talhao",
  "crop_type",
  "estadio",
] as const;
export const resourceTypeSchema = z.enum(RESOURCE_TYPES);
export type ResourceType = z.infer<typeof resourceTypeSchema>;

export const createGrantSchema = z.object({
  subjectUserId: z.string().uuid("Invalid subject user ID"),
  resourceType: z.enum(RESOURCE_TYPES, {
    errorMap: () => ({ message: "Invalid resource type" }),
  }),
  resourceId: z.string().uuid("Invalid resource ID"),
  actions: z
    .array(z.literal("read"))
    .min(1)
    .max(1)
    .optional()
    .default(["read"]),
  reason: z.string().max(500).optional(),
});

export type CreateGrantDto = z.infer<typeof createGrantSchema>;

/**
 * Access grants query. Accepts normalized limit/offset and legacy page/pageSize
 * (explicit limit/offset wins). Default limit 50.
 */
export const listGrantsQuerySchema = z
  .object({
    subjectUserId: z.string().uuid().optional(),
    resourceType: z.string().max(50).optional(),
    resourceId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((raw) => {
    const { limit, offset } = resolveLimitOffset(raw, 50);
    const page = raw.page ?? (limit > 0 ? Math.floor(offset / limit) + 1 : 1);
    return {
      limit,
      offset,
      page,
      pageSize: limit,
      subjectUserId: raw.subjectUserId,
      resourceType: raw.resourceType,
      resourceId: raw.resourceId,
    };
  });

export type ListGrantsQueryDto = z.infer<typeof listGrantsQuerySchema>;

/** Pre-validation input: all fields optional (HTTP query + unit-test raw objects). */
export type ListGrantsQueryInput = z.input<typeof listGrantsQuerySchema>;

export interface AccessGrant {
  id: string;
  subjectUserId: string;
  subjectName?: string;
  resourceType: ResourceType | string;
  resourceId: string;
  resourceName?: string;
  grantedByUserId: string;
  grantedByName?: string;
  reason?: string;
  grantedAt: Date | string;
  revokedAt?: Date | string | null;
}

export interface AccessGrantInput {
  subjectUserId: string;
  resourceType: ResourceType;
  resourceId: string;
  reason?: string;
}

export interface AccessGrantResponse {
  grant: AccessGrant;
}

export interface AccessGrantsListResponse {
  items: AccessGrant[];
  total: number;
}
