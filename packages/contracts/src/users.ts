import { z } from "zod";
import { resolveLimitOffset } from "./common";

export const USER_ROLES = ["admin", "user"] as const;
export const userRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof userRoleSchema>;

export const createUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
  fullName: z.string().min(1, "Full name is required").max(200),
  phone: z.string().max(30).optional(),
  role: userRoleSchema.default("user"),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;

export const updateProfileSchema = z.object({
  fullName: z.string().min(1, "Full name is required").max(200).optional(),
  phone: z.string().max(30).optional().nullable(),
});

export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

export const updateRoleSchema = z.object({
  role: userRoleSchema,
});

export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;

export const setDisabledSchema = z.object({
  disabled: z.boolean(),
});

export type SetDisabledDto = z.infer<typeof setDisabledSchema>;

export const adminResetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .max(128, "New password must be at most 128 characters"),
});

export type AdminResetPasswordDto = z.infer<typeof adminResetPasswordSchema>;

/**
 * User listing query. Accepts normalized limit/offset and legacy page/pageSize
 * (explicit limit/offset wins). Default limit 50.
 */
export const listUsersQuerySchema = z
  .object({
    search: z.string().max(100).optional(),
    role: userRoleSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((raw) => {
    const { limit, offset } = resolveLimitOffset(raw, 50);
    const page = raw.page ?? (limit > 0 ? Math.floor(offset / limit) + 1 : 1);
    return {
      search: raw.search,
      role: raw.role,
      limit,
      offset,
      page,
      pageSize: limit,
    };
  });

export type ListUsersQueryDto = z.infer<typeof listUsersQuerySchema>;

/** Pre-validation input: all fields optional (HTTP query + unit-test raw objects). */
export type ListUsersQueryInput = z.input<typeof listUsersQuerySchema>;

export const lookupQuerySchema = z
  .object({
    q: z.string().min(1).max(100).optional(),
    search: z.string().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .transform((raw) => ({
    q: (raw.q ?? raw.search)!,
    limit: raw.limit,
  }))
  .refine((v) => !!v.q, {
    message: "Search query is required (provide q or search)",
  });

export type LookupQueryDto = z.infer<typeof lookupQuerySchema>;

export interface UserPublic {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone?: string | null;
  disabledAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface UserLookup {
  id: string;
  fullName: string;
  email?: string;
}

export interface UserSummary {
  id: string;
  fullName: string | null;
}
