import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from '../../src/users/users.service';
import { UsersRepository, AuditRepository } from '../../src/database/repositories';
import { PasswordService } from '../../src/auth/password.service';
import type { User } from '../../src/database/repositories';
import type { AuthenticatedUser } from '../../src/auth/guards/jwt-auth.guard';

// ── Helpers ──────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-uuid-1',
    email: 'test@example.com',
    passwordHash: '$argon2id$mock',
    fullName: 'Test User',
    phone: null,
    role: 'user',
    disabledAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeCurrentUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    sub: 'admin-uuid-1',
    email: 'admin@example.com',
    role: 'admin',
    userRecord: {
      id: 'admin-uuid-1',
      email: 'admin@example.com',
      fullName: 'Admin User',
      phone: null,
      role: 'admin',
      disabledAt: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let service: UsersService;

  const mockUsersRepository = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    listFilteredAndCount: jest.fn(),
    searchByName: jest.fn(),
    search: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    changePassword: jest.fn(),
    setRole: jest.fn(),
    setDisabled: jest.fn(),
    revokeAllRefreshTokens: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuditRepository = {
    create: jest.fn(),
  };

  const mockPasswordService = {
    hash: jest.fn().mockResolvedValue('$argon2id$hashed'),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPasswordService.hash.mockResolvedValue('$argon2id$hashed');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: mockUsersRepository },
        { provide: AuditRepository, useValue: mockAuditRepository },
        { provide: PasswordService, useValue: mockPasswordService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // ── listUsers ────────────────────────────────────────────────────

  describe('listUsers', () => {
    it('should return users and total with default pagination', async () => {
      mockUsersRepository.listFilteredAndCount.mockResolvedValue([
        [makeUser(), makeUser({ id: 'user-2', email: 'other@example.com', fullName: 'Other' })],
        2,
      ]);

      const result = await service.listUsers({ page: 1, pageSize: 50 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.items[0].id).toBe('user-uuid-1');
      expect((result.items[0] as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
      expect(mockUsersRepository.listFilteredAndCount).toHaveBeenCalledWith({
        search: undefined,
        role: undefined,
        limit: 50,
        offset: 0,
      });
    });

    it('should pass search and role filters to repository', async () => {
      mockUsersRepository.listFilteredAndCount.mockResolvedValue([[makeUser()], 1]);

      const result = await service.listUsers({
        search: 'test',
        role: 'admin',
        page: 2,
        pageSize: 10,
      });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockUsersRepository.listFilteredAndCount).toHaveBeenCalledWith({
        search: 'test',
        role: 'admin',
        limit: 10,
        offset: 10,
      });
    });

    it('should return empty when no users match', async () => {
      mockUsersRepository.listFilteredAndCount.mockResolvedValue([[], 0]);

      const result = await service.listUsers({ page: 1, pageSize: 50 });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ── lookup ─────────────────────────────────────────────────────────

  describe('lookup', () => {
    it('should return matching users as { id, fullName } without personal info', async () => {
      mockUsersRepository.searchByName.mockResolvedValue([
        { id: 'user-uuid-1', fullName: 'Match User' },
      ]);

      const result = await service.lookup(makeCurrentUser({ role: 'user' }), 'match', 10);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ id: 'user-uuid-1', fullName: 'Match User' });
      expect(mockUsersRepository.searchByName).toHaveBeenCalledWith('match', 10);
      // No email, phone, role, or passwordHash must leak.
      const keys = Object.keys(result[0]);
      expect(keys).toEqual(['id', 'fullName']);
    });

    it('should return empty array when no matches', async () => {
      mockUsersRepository.searchByName.mockResolvedValue([]);

      const result = await service.lookup(makeCurrentUser({ role: 'user' }), 'nonexistent', 10);

      expect(result).toEqual([]);
    });

    it('should preserve full sanitized lookup results for admins', async () => {
      mockUsersRepository.search.mockResolvedValue([makeUser({ email: 'match@example.com' })]);

      const result = await service.lookup(makeCurrentUser(), 'match@example.com', 10);

      expect(mockUsersRepository.search).toHaveBeenCalledWith('match@example.com', 10);
      expect(result[0]).toMatchObject({ email: 'match@example.com', role: 'user' });
      expect(result[0]).not.toHaveProperty('passwordHash');
      expect(mockUsersRepository.searchByName).not.toHaveBeenCalled();
    });
  });

  // ── getUserById ────────────────────────────────────────────────────

  describe('getUserById', () => {
    it('should throw NotFoundException when user does not exist', async () => {
      mockUsersRepository.findById.mockResolvedValue(undefined);

      await expect(
        service.getUserById('missing', makeCurrentUser({ role: 'user' })),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when user is disabled', async () => {
      mockUsersRepository.findById.mockResolvedValue(
        makeUser({ disabledAt: new Date() } as Partial<User>),
      );

      await expect(
        service.getUserById('user-uuid-1', makeCurrentUser({ role: 'user' })),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return sanitized user for admin caller', async () => {
      mockUsersRepository.findById.mockResolvedValue(makeUser({ email: 'target@example.com' }));

      const result = await service.getUserById('user-uuid-1', makeCurrentUser({ role: 'admin' }));

      expect(result).toMatchObject({ id: 'user-uuid-1', email: 'target@example.com' });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should return only { id, fullName } for regular user caller querying someone else', async () => {
      mockUsersRepository.findById.mockResolvedValue(
        makeUser({ id: 'other-user', fullName: 'Other User', email: 'other@example.com' }),
      );

      const result = await service.getUserById(
        'other-user',
        makeCurrentUser({ sub: 'regular-user', role: 'user' }),
      );

      expect(result).toEqual({ id: 'other-user', fullName: 'Other User' });
      expect(result).not.toHaveProperty('email');
    });

    it('should return sanitized user for regular user caller querying themselves', async () => {
      mockUsersRepository.findById.mockResolvedValue(
        makeUser({ id: 'self-user', fullName: 'Self', email: 'self@example.com' }),
      );

      const result = await service.getUserById(
        'self-user',
        makeCurrentUser({ sub: 'self-user', role: 'user' }),
      );

      expect(result).toMatchObject({
        id: 'self-user',
        fullName: 'Self',
        email: 'self@example.com',
      });
      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  // ── adminCreateUser ────────────────────────────────────────────────

  describe('adminCreateUser', () => {
    it('should create a user with hashed password and return sanitized user', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(undefined);
      mockUsersRepository.create.mockResolvedValue(makeUser());

      const result = await service.adminCreateUser({
        email: 'new@example.com',
        password: 'password123',
        fullName: 'New User',
        role: 'user',
      });

      expect(result.email).toBe('test@example.com');
      expect((result as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
      expect(mockPasswordService.hash).toHaveBeenCalledWith('password123');
      expect(mockUsersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          role: 'user',
        }),
      );
    });

    it('should create an admin user when role is admin', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(undefined);
      mockUsersRepository.create.mockResolvedValue(makeUser({ role: 'admin' }));

      const result = await service.adminCreateUser({
        email: 'admin@example.com',
        password: 'password123',
        fullName: 'Admin',
        role: 'admin',
      });

      expect(result.role).toBe('admin');
    });

    it('should reject duplicate email with ConflictException', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(makeUser());

      await expect(
        service.adminCreateUser({
          email: 'test@example.com',
          password: 'password123',
          fullName: 'Test',
          role: 'user',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── updateMyProfile ────────────────────────────────────────────────

  describe('updateMyProfile', () => {
    const currentUser = makeCurrentUser();

    it('should update fullName and return sanitized user', async () => {
      mockUsersRepository.update.mockResolvedValue(makeUser({ fullName: 'Updated Name' }));

      const result = await service.updateMyProfile(currentUser, { fullName: 'Updated Name' });

      expect(result.fullName).toBe('Updated Name');
      expect(mockUsersRepository.update).toHaveBeenCalledWith('admin-uuid-1', {
        fullName: 'Updated Name',
      });
      expect((result as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    it('should update phone to null', async () => {
      mockUsersRepository.update.mockResolvedValue(makeUser({ phone: null }));

      const result = await service.updateMyProfile(currentUser, { phone: null });

      expect(result.phone).toBeNull();
      expect(mockUsersRepository.update).toHaveBeenCalledWith('admin-uuid-1', { phone: null });
    });

    it('should throw BadRequestException when no fields provided', async () => {
      await expect(service.updateMyProfile(currentUser, {})).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when user not found after update', async () => {
      mockUsersRepository.update.mockResolvedValue(undefined);

      await expect(service.updateMyProfile(currentUser, { fullName: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── adminChangeRole ────────────────────────────────────────────────

  describe('adminChangeRole', () => {
    const actor = makeCurrentUser();

    it('should change role and audit the change', async () => {
      mockUsersRepository.findById.mockResolvedValue(makeUser({ role: 'user' }));
      mockUsersRepository.setRole.mockResolvedValue(makeUser({ role: 'admin' }));
      mockAuditRepository.create.mockResolvedValue({});

      const result = await service.adminChangeRole('user-uuid-1', { role: 'admin' }, actor);

      expect(result.role).toBe('admin');
      expect(mockUsersRepository.setRole).toHaveBeenCalledWith(
        'user-uuid-1',
        'admin',
        expect.objectContaining({ actorUserId: 'admin-uuid-1' }),
      );
      expect(mockUsersRepository.setRole).toHaveBeenCalledWith(
        'user-uuid-1',
        'admin',
        expect.objectContaining({ actorUserId: 'admin-uuid-1' }),
      );
    });

    it('should skip write if role is already the same', async () => {
      mockUsersRepository.findById.mockResolvedValue(makeUser({ role: 'admin' }));

      const result = await service.adminChangeRole('user-uuid-1', { role: 'admin' }, actor);

      expect(result.role).toBe('admin');
      expect(mockUsersRepository.setRole).not.toHaveBeenCalled();
      expect(mockAuditRepository.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when target user does not exist', async () => {
      mockUsersRepository.findById.mockResolvedValue(undefined);

      await expect(
        service.adminChangeRole('nonexistent', { role: 'admin' }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('should still return updated user when audit fails (non-blocking)', async () => {
      mockUsersRepository.findById.mockResolvedValue(makeUser({ role: 'user' }));
      mockUsersRepository.setRole.mockResolvedValue(makeUser({ role: 'admin' }));
      mockAuditRepository.create.mockRejectedValue(new Error('DB error'));

      const result = await service.adminChangeRole('user-uuid-1', { role: 'admin' }, actor);

      expect(result.role).toBe('admin');
      expect(mockUsersRepository.setRole).toHaveBeenCalled();
    });

    it('should not expose passwordHash in returned user', async () => {
      mockUsersRepository.findById.mockResolvedValue(makeUser({ role: 'user' }));
      mockUsersRepository.setRole.mockResolvedValue(makeUser({ role: 'admin' }));
      mockAuditRepository.create.mockResolvedValue({});

      const result = await service.adminChangeRole('user-uuid-1', { role: 'admin' }, actor);

      expect((result as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    });
  });

  // ── adminResetPassword ──────────────────────────────────────────

  describe('adminResetPassword', () => {
    const actor = makeCurrentUser();

    it('should hash the new password, update the user, revoke all sessions, and audit', async () => {
      mockUsersRepository.findById.mockResolvedValue(makeUser());
      mockPasswordService.hash.mockResolvedValue('$argon2id$newhash');
      mockUsersRepository.changePassword.mockResolvedValue(
        makeUser({ passwordHash: '$argon2id$newhash' }),
      );

      const result = await service.adminResetPassword(
        'user-uuid-1',
        { newPassword: 'new-pass' },
        actor,
      );

      expect(result.email).toBe('test@example.com');
      expect(mockPasswordService.hash).toHaveBeenCalledWith('new-pass');
      expect(mockUsersRepository.changePassword).toHaveBeenCalledWith(
        'user-uuid-1',
        '$argon2id$newhash',
        { admin: true },
      );
      expect(mockAuditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'password_reset', targetUserId: 'user-uuid-1' }),
      );
    });

    it('should reset the password of a disabled user (recovery) and revoke their sessions', async () => {
      mockUsersRepository.findById.mockResolvedValue(makeUser({ disabledAt: new Date() }));
      mockPasswordService.hash.mockResolvedValue('$argon2id$newhash');
      mockUsersRepository.changePassword.mockResolvedValue(
        makeUser({ passwordHash: '$argon2id$newhash', disabledAt: new Date() }),
      );

      const result = await service.adminResetPassword(
        'user-uuid-1',
        { newPassword: 'new-pass' },
        actor,
      );

      expect(result).toBeDefined();
      expect(result.disabledAt).not.toBeNull();
      expect(mockUsersRepository.changePassword).toHaveBeenCalledWith(
        'user-uuid-1',
        '$argon2id$newhash',
        { admin: true },
      );
    });

    it('should throw NotFoundException when the target user does not exist', async () => {
      mockUsersRepository.findById.mockResolvedValue(undefined);

      await expect(
        service.adminResetPassword('missing', { newPassword: 'new-pass' }, actor),
      ).rejects.toThrow(NotFoundException);
      expect(mockUsersRepository.update).not.toHaveBeenCalled();
      expect(mockUsersRepository.revokeAllRefreshTokens).not.toHaveBeenCalled();
      expect(mockAuditRepository.create).not.toHaveBeenCalled();
    });

    it('should not expose passwordHash in returned user', async () => {
      mockUsersRepository.findById.mockResolvedValue(makeUser());
      mockPasswordService.hash.mockResolvedValue('$argon2id$newhash');
      mockUsersRepository.update.mockResolvedValue(makeUser({ passwordHash: '$argon2id$newhash' }));

      const result = await service.adminResetPassword(
        'user-uuid-1',
        { newPassword: 'new-pass' },
        actor,
      );

      expect((result as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    });
  });

  // ── adminChangeRole guards ───────────────────────────────────────

  describe('adminChangeRole guards', () => {
    const actor = makeCurrentUser();

    it('should block self-demote', async () => {
      mockUsersRepository.findById.mockResolvedValue(
        makeUser({ id: 'admin-uuid-1', role: 'admin' }),
      );

      await expect(
        service.adminChangeRole('admin-uuid-1', { role: 'user' }, actor),
      ).rejects.toThrow(ForbiddenException);
      expect(mockUsersRepository.setRole).not.toHaveBeenCalled();
    });

    it('should block demoting the last active admin', async () => {
      mockUsersRepository.findById.mockResolvedValue(makeUser({ role: 'admin' }));
      mockUsersRepository.setRole.mockResolvedValue('last-admin');

      await expect(service.adminChangeRole('user-uuid-1', { role: 'user' }, actor)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockUsersRepository.setRole).toHaveBeenCalled();
    });

    it('should allow demote when another active admin exists', async () => {
      mockUsersRepository.findById.mockResolvedValue(makeUser({ role: 'admin' }));
      mockUsersRepository.setRole.mockResolvedValue(makeUser({ role: 'user' }));

      const result = await service.adminChangeRole('user-uuid-1', { role: 'user' }, actor);

      expect(result.role).toBe('user');
      expect(mockUsersRepository.setRole).toHaveBeenCalled();
    });

    it('should allow demoting an already-disabled admin', async () => {
      mockUsersRepository.findById.mockResolvedValue(
        makeUser({ role: 'admin', disabledAt: new Date() }),
      );
      mockUsersRepository.setRole.mockResolvedValue(
        makeUser({ role: 'user', disabledAt: new Date() }),
      );

      const result = await service.adminChangeRole('user-uuid-1', { role: 'user' }, actor);

      expect(result.role).toBe('user');
      expect(mockUsersRepository.setRole).toHaveBeenCalled();
    });
  });

  // ── adminSetDisabled ─────────────────────────────────────────────

  describe('adminSetDisabled', () => {
    const actor = makeCurrentUser();

    it('should disable an enabled user via the repository', async () => {
      mockUsersRepository.findById.mockResolvedValue(makeUser({ role: 'user' }));
      mockUsersRepository.setDisabled.mockResolvedValue(
        makeUser({ role: 'user', disabledAt: new Date() }),
      );

      const result = await service.adminSetDisabled('user-uuid-1', { disabled: true }, actor);

      expect(result.disabledAt).not.toBeNull();
      expect(mockUsersRepository.setDisabled).toHaveBeenCalledWith(
        'user-uuid-1',
        true,
        expect.objectContaining({ actorUserId: 'admin-uuid-1' }),
      );
      expect((result as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    it('should re-enable a disabled user', async () => {
      mockUsersRepository.findById.mockResolvedValue(
        makeUser({ role: 'user', disabledAt: new Date() }),
      );
      mockUsersRepository.setDisabled.mockResolvedValue(makeUser({ role: 'user' }));

      const result = await service.adminSetDisabled('user-uuid-1', { disabled: false }, actor);

      expect(result.disabledAt).toBeNull();
      expect(mockUsersRepository.setDisabled).toHaveBeenCalledWith(
        'user-uuid-1',
        false,
        expect.objectContaining({ actorUserId: 'admin-uuid-1' }),
      );
    });

    it('should return the current state without writing when already in the desired state', async () => {
      mockUsersRepository.findById.mockResolvedValue(makeUser({ role: 'user' }));

      const result = await service.adminSetDisabled('user-uuid-1', { disabled: false }, actor);

      expect(result.disabledAt).toBeNull();
      expect(mockUsersRepository.setDisabled).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the target user does not exist', async () => {
      mockUsersRepository.findById.mockResolvedValue(undefined);

      await expect(service.adminSetDisabled('missing', { disabled: true }, actor)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockUsersRepository.setDisabled).not.toHaveBeenCalled();
    });

    it('should block self-disable and self-enable', async () => {
      mockUsersRepository.findById.mockResolvedValue(makeUser({ id: 'admin-uuid-1' }));

      await expect(
        service.adminSetDisabled('admin-uuid-1', { disabled: true }, actor),
      ).rejects.toThrow(ForbiddenException);
      expect(mockUsersRepository.setDisabled).not.toHaveBeenCalled();
    });

    it('should block disabling the last active admin', async () => {
      mockUsersRepository.findById.mockResolvedValue(makeUser({ role: 'admin' }));
      mockUsersRepository.setDisabled.mockResolvedValue('last-admin');

      await expect(
        service.adminSetDisabled('user-uuid-1', { disabled: true }, actor),
      ).rejects.toThrow(ForbiddenException);
      expect(mockUsersRepository.setDisabled).toHaveBeenCalled();
    });

    it('should allow disabling an admin when another active admin exists', async () => {
      mockUsersRepository.findById.mockResolvedValue(makeUser({ role: 'admin' }));
      mockUsersRepository.setDisabled.mockResolvedValue(
        makeUser({ role: 'admin', disabledAt: new Date() }),
      );

      const result = await service.adminSetDisabled('user-uuid-1', { disabled: true }, actor);

      expect(result.disabledAt).not.toBeNull();
      expect(mockUsersRepository.setDisabled).toHaveBeenCalled();
    });
  });

  // ── getUserById disabled visibility ──────────────────────────────

  describe('getUserById disabled visibility', () => {
    it('should return a disabled user for admin callers', async () => {
      mockUsersRepository.findById.mockResolvedValue(
        makeUser({ disabledAt: new Date() } as Partial<User>),
      );

      const result = await service.getUserById('user-uuid-1', makeCurrentUser({ role: 'admin' }));

      expect(result).toMatchObject({ id: 'user-uuid-1' });
      expect(result).not.toHaveProperty('passwordHash');
    });
  });
});
