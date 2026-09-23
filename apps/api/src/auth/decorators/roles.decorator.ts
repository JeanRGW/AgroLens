import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Method decorator that assigns required roles to a route handler.
 * Used in conjunction with RolesGuard.
 *
 * Usage:
 *   @Roles('admin')
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   async adminOnlyEndpoint() { ... }
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
