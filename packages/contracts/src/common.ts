import { z } from "zod";

/**
 * Standard page params schema normalized across all endpoints.
 * Limit defaults to 20, max 100. Offset defaults to 0.
 */
export const pageParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PageParams = z.infer<typeof pageParamsSchema>;

/**
 * Generic paginated list container.
 */
export interface Paginated<T> {
  items: T[];
  total: number;
}

/**
 * Schema factory for paginated response envelopes { items: T[], total: number }.
 */
export function paginatedResponseSchema<ItemType extends z.ZodTypeAny>(
  itemSchema: ItemType,
) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number().int().min(0),
  });
}

/**
 * Standard API error structure.
 */
export const apiErrorSchema = z.object({
  statusCode: z.number().int().optional(),
  message: z.string(),
  error: z.string().optional(),
  errors: z.array(z.string()).optional(),
  code: z.string().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/**
 * Standard generic message response.
 */
export const messageResponseSchema = z.object({
  message: z.string(),
});

export type MessageResponse = z.infer<typeof messageResponseSchema>;

/**
 * Timezone-qualified ISO-8601 regex pattern.
 */
export const TIMEZONE_QUALIFIED_ISO_REGEX =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

/**
 * Validates timezone-qualified ISO-8601 strings.
 */
export const timestampStringSchema = z
  .string()
  .regex(
    TIMEZONE_QUALIFIED_ISO_REGEX,
    "Must be a timezone-qualified ISO 8601 timestamp",
  )
  .refine(
    (value) => !Number.isNaN(new Date(value).getTime()),
    "Must be a valid ISO 8601 timestamp",
  );

export type TimestampString = z.infer<typeof timestampStringSchema>;

/**
 * Validates and transforms a timezone-qualified ISO-8601 string into a Date object.
 */
export const timestampDateSchema = timestampStringSchema.transform(
  (val) => new Date(val),
);

export type TimestampDate = z.infer<typeof timestampDateSchema>;

/**
 * UUID validator schema.
 */
export const uuidSchema = z.string().uuid("Invalid UUID");

export type Uuid = z.infer<typeof uuidSchema>;

/**
 * Tolerant limit/offset input: accepts normalized `limit`/`offset` and
 * legacy `page`/`pageSize`. Explicit limit/offset wins; otherwise page/pageSize
 * is converted; otherwise the default limit with offset 0 applies.
 * Single home for the logic used by list-query DTO transforms and services
 * (services also receive raw DTOs in unit tests, so they resolve again).
 */
export interface LimitOffsetInput {
  limit?: number;
  offset?: number;
  page?: number;
  pageSize?: number;
}

export function resolveLimitOffset(
  query: LimitOffsetInput | undefined,
  defaultLimit: number,
): { limit: number; offset: number } {
  const hasLimitOffset =
    query?.limit !== undefined || query?.offset !== undefined;
  const limit = hasLimitOffset
    ? (query?.limit ?? defaultLimit)
    : (query?.pageSize ?? defaultLimit);
  const offset = hasLimitOffset
    ? (query?.offset ?? (query?.page ? (query.page - 1) * limit : 0))
    : query?.page
      ? (query.page - 1) * limit
      : 0;
  return { limit, offset };
}
