import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { UsersRepository, AuditRepository } from '../database/repositories';
import { PasswordService } from '../auth/password.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import type { UpdateRoleDto } from './dto/update-role.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import type { SetDisabledDto } from './dto/set-disabled.dto';
import type { ListUsersQueryInput } from './dto/list-users-query.dto';
import type { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { sanitizeUser, type SafeUser } from '../auth/auth.service';
import { resolveLimitOffset } from '../shared/http/pagination';

/**
 * Users management service.
 *
 * Handles admin user listing, lookup, creation, profile updates, and role changes.
 * Exposes only sanitized user data — never password hashes or tokens.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly auditRepository: AuditRepository,
    private readonly passwordService: PasswordService,
  ) {}

  /**
   * GET /users — list users with optional filters and pagination (admin only).
   * Returns the normalized list envelope { items, total, limit, offset }.
   */
  async listUsers(
    query: ListUsersQueryInput,
  ): Promise<{ items: SafeUser[]; total: number; limit: number; offset: number }> {
    const { limit, offset } = resolveLimitOffset(query, 50);
    const [rows, total] = await this.usersRepository.listFilteredAndCount({
      search: query.search,
      role: query.role,
      limit,
      offset,
    });
    const sanitizedUsers = rows.map((u) => sanitizeUser(u));
    return { items: sanitizedUsers, total, limit, offset };
  }

  async lookup(
    currentUser: AuthenticatedUser,
    query: string,
    limit: number,
  ): Promise<SafeUser[] | { id: string; fullName: string }[]> {
    if (currentUser.role === 'admin') {
      const results = await this.usersRepository.search(query, limit);
      return results.map((user) => sanitizeUser(user));
    }

    return this.usersRepository.searchByName(query, limit);
  }

  async getUserById(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<SafeUser | { id: string; fullName: string }> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    // Disabled accounts stay invisible to non-admins so they cannot be
    // enumerated or contacted, but admins must be able to see them to
    // re-enable or audit a suspension.
    if (user.disabledAt && currentUser.role !== 'admin') {
      throw new NotFoundException('User not found');
    }

    if (currentUser.role === 'admin' || currentUser.sub === id) {
      return sanitizeUser(user);
    }

    return { id: user.id, fullName: user.fullName };
  }

  /**
   * POST /admin/users — admin creates a user with password hashing.
   */
  async adminCreateUser(dto: CreateUserDto): Promise<SafeUser> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const user = await this.usersRepository.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      phone: dto.phone ?? null,
      role: dto.role,
    });

    this.logger.log(`Admin created user: ${dto.email} with role ${dto.role}`);

    return sanitizeUser(user);
  }

  /**
   * PATCH /users/me — current user updates their own profile.
   */
  async updateMyProfile(currentUser: AuthenticatedUser, dto: UpdateProfileDto): Promise<SafeUser> {
    const payload: Record<string, string | null> = {};
    if (dto.fullName !== undefined) {
      payload.fullName = dto.fullName;
    }
    if (dto.phone !== undefined) {
      payload.phone = dto.phone;
    }

    if (Object.keys(payload).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const updated = await this.usersRepository.update(currentUser.sub, payload);
    if (!updated) {
      throw new NotFoundException('User not found');
    }

    return sanitizeUser(updated);
  }

  /**
   * PATCH /admin/users/:id/role — admin changes a user's role.
   * Audits role changes. Avoids unnecessary writes if role is already the same.
   * Blocks self-demote and demoting the last active admin.
   */
  async adminChangeRole(
    targetUserId: string,
    dto: UpdateRoleDto,
    actor: AuthenticatedUser,
  ): Promise<SafeUser> {
    const targetUser = await this.usersRepository.findById(targetUserId);
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // Avoid unnecessary write if role is unchanged
    if (targetUser.role === dto.role) {
      return sanitizeUser(targetUser);
    }

    const isDemote = targetUser.role === 'admin' && dto.role !== 'admin';
    if (isDemote && actor.sub === targetUserId) {
      throw new ForbiddenException('Cannot demote your own admin account');
    }

    const before = { role: targetUser.role };
    const after = { role: dto.role };

    // Last-active-admin protection is enforced atomically inside setRole
    // (locked admin-set count + mutation in one transaction), so a
    // concurrent demote/disable cannot slip between check and write.
    const updated = await this.usersRepository.setRole(targetUserId, dto.role, {
      actorUserId: actor.sub,
      before,
      after,
    });
    if (updated === 'last-admin') {
      throw new ForbiddenException('Cannot demote the last active admin');
    }
    if (!updated) {
      throw new NotFoundException('User not found');
    }

    this.logger.log(
      `Admin ${actor.email} changed role of ${targetUser.email} from ${before.role} to ${after.role}`,
    );

    return sanitizeUser(updated);
  }

  /**
   * PATCH /admin/users/:id/disabled — admin suspends or reactivates a user.
   *
   * Disabling sets `disabledAt` and revokes every active refresh-token
   * session in the same transaction (with audit), so the target is signed
   * out everywhere and cannot log in, refresh, or use existing access
   * tokens past their short TTL. Re-enabling clears `disabledAt`; the user
   * must sign in again. Self-disable and disabling the last active admin
   * are rejected to prevent operator lockout.
   */
  async adminSetDisabled(
    targetUserId: string,
    dto: SetDisabledDto,
    actor: AuthenticatedUser,
  ): Promise<SafeUser> {
    const targetUser = await this.usersRepository.findById(targetUserId);
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (actor.sub === targetUserId) {
      throw new ForbiddenException('Cannot change your own disabled status');
    }

    const currentlyDisabled = targetUser.disabledAt !== null;
    if (currentlyDisabled === dto.disabled) {
      return sanitizeUser(targetUser);
    }

    const before = { disabled: currentlyDisabled };
    const after = { disabled: dto.disabled };

    // Last-active-admin protection is enforced atomically inside setDisabled
    // (locked admin-set count + mutation in one transaction), so a
    // concurrent disable/demote cannot slip between check and write.
    const updated = await this.usersRepository.setDisabled(targetUserId, dto.disabled, {
      actorUserId: actor.sub,
      before,
      after,
    });
    if (updated === 'last-admin') {
      throw new ForbiddenException('Cannot disable the last active admin');
    }
    if (!updated) {
      throw new NotFoundException('User not found');
    }

    this.logger.log(
      `Admin ${actor.sub} ${dto.disabled ? 'disabled' : 're-enabled'} user ${targetUserId}`,
    );

    return sanitizeUser(updated);
  }

  /**
   * POST /admin/users/:id/reset-password — admin resets a user's password.
   *
   * Stores the new Argon2id hash and revokes every active refresh-token
   * session so the target user must sign in again with the new password.
   * Disabled users can also have their password reset (recovery), but they
   * remain disabled until an admin re-enables them.
   */
  async adminResetPassword(
    targetUserId: string,
    dto: ResetPasswordDto,
    actor: AuthenticatedUser,
  ): Promise<SafeUser> {
    const targetUser = await this.usersRepository.findById(targetUserId);
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const passwordHash = await this.passwordService.hash(dto.newPassword);
    const updated = await this.usersRepository.changePassword(targetUserId, passwordHash, {
      admin: true,
    });
    if (!updated) {
      throw new NotFoundException('User not found');
    }

    await this.auditRepository
      .create({
        eventType: 'password_reset',
        actorUserId: actor.sub,
        targetUserId,
      })
      .catch(() => {
        this.logger.warn(`Password-reset audit event failed for user ${targetUserId}`);
      });

    this.logger.log(`Admin ${actor.email} reset password of ${targetUser.email}`);
    return sanitizeUser(updated);
  }
}
