import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { AccessService } from '../../src/access/access.service';
import {
  AccessRepository,
  UsersRepository,
  UploadsRepository,
  CatalogRepository,
  AuditRepository,
} from '../../src/database/repositories';
import type { Upload, AccessGrant } from '../../src/database/repositories';
import type { AuthenticatedUser } from '../../src/auth/guards/jwt-auth.guard';
import { createGrantSchema, type CreateGrantDto } from '../../src/access/dto/create-grant.dto';

// ── Helpers ──────────────────────────────────────────────────────────

function makeAdminUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    sub: 'admin-uuid',
    email: 'admin@example.com',
    role: 'admin',
    userRecord: {
      id: 'admin-uuid',
      email: 'admin@example.com',
      fullName: 'Admin',
      phone: null,
      role: 'admin',
      disabledAt: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    },
    ...overrides,
  };
}

function makeOwnerUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    sub: 'owner-uuid',
    email: 'owner@example.com',
    role: 'user',
    userRecord: {
      id: 'owner-uuid',
      email: 'owner@example.com',
      fullName: 'Owner',
      phone: null,
      role: 'user',
      disabledAt: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    },
    ...overrides,
  };
}

function makeUpload(overrides: Partial<Upload> = {}): Upload {
  return {
    id: 'upload-uuid-1',
    clientUploadId: 'client-1',
    userId: 'owner-uuid',
    propertyId: 'prop-uuid-1',
    talhaoId: 'talhao-uuid-1',
    cropTypeId: 'crop-uuid-1',
    estadioId: null,
    source: 'phone',
    status: 'ready',
    activityDate: new Date('2025-06-15'),
    errorMessage: null,
    createdAt: new Date('2025-06-15'),
    updatedAt: new Date('2025-06-15'),
    deletedAt: null,
    ...overrides,
  };
}

function makeGrant(overrides: Partial<AccessGrant> = {}): AccessGrant {
  return {
    id: 'grant-uuid-1',
    subjectUserId: 'subject-uuid',
    resourceType: 'upload',
    resourceId: 'upload-uuid-1',
    actions: ['read'],
    grantedByUserId: 'admin-uuid',
    reason: null,
    grantedAt: new Date('2025-06-15'),
    revokedAt: null,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('AccessService', () => {
  it('accepts the default read action and rejects unsupported actions', () => {
    const base = {
      subjectUserId: '00000000-0000-0000-0000-000000000001',
      resourceType: 'upload',
      resourceId: '00000000-0000-0000-0000-000000000002',
    };

    expect(createGrantSchema.parse(base).actions).toEqual(['read']);
    expect(() => createGrantSchema.parse({ ...base, actions: [] })).toThrow();
    expect(() => createGrantSchema.parse({ ...base, actions: ['write'] })).toThrow();
  });

  let service: AccessService;

  const mockAccessRepository = {
    createGrant: jest.fn(),
    findGrantById: jest.fn(),
    findActiveGrant: jest.fn(),
    listFilteredAndCount: jest.fn(),
    revokeGrant: jest.fn(),
  };

  const mockUsersRepository = {
    findById: jest.fn(),
  };

  const mockUploadsRepository = {
    findById: jest.fn(),
    findByIdAnyStatus: jest.fn(),
    listByUserId: jest.fn(),
  };

  const mockCatalogRepository = {
    findPropertyById: jest.fn(),
    findTalhaoById: jest.fn(),
    findCropTypeById: jest.fn(),
    findEstadioById: jest.fn(),
    listProperties: jest.fn(),
    listTalhoes: jest.fn(),
    listCropTypes: jest.fn(),
    listEstadios: jest.fn(),
  };

  const mockAuditRepository = {
    create: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCatalogRepository.listEstadios.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessService,
        { provide: AccessRepository, useValue: mockAccessRepository },
        { provide: UsersRepository, useValue: mockUsersRepository },
        { provide: UploadsRepository, useValue: mockUploadsRepository },
        { provide: CatalogRepository, useValue: mockCatalogRepository },
        { provide: AuditRepository, useValue: mockAuditRepository },
      ],
    }).compile();

    service = module.get<AccessService>(AccessService);
  });

  // ── listGrants ─────────────────────────────────────────────────────

  describe('listGrants', () => {
    it('should return all grants for admin with pagination', async () => {
      const grants = [makeGrant(), makeGrant({ id: 'grant-2' })];
      mockAccessRepository.listFilteredAndCount.mockResolvedValue([grants, 2]);

      const result = await service.listGrants(makeAdminUser());

      expect(result.items).toEqual(grants);
      expect(result.total).toBe(2);
      expect(mockAccessRepository.listFilteredAndCount).toHaveBeenCalledWith({
        ownerUserId: undefined,
        subjectUserId: undefined,
        resourceType: undefined,
        resourceId: undefined,
        limit: 50,
        offset: 0,
      });
    });

    it('should pass subjectUserId and resourceType filters for admin', async () => {
      mockAccessRepository.listFilteredAndCount.mockResolvedValue([[], 0]);

      const result = await service.listGrants(makeAdminUser(), {
        subjectUserId: 'subject-uuid',
        resourceType: 'upload',
        page: 1,
        pageSize: 10,
      });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(mockAccessRepository.listFilteredAndCount).toHaveBeenCalledWith({
        ownerUserId: undefined,
        subjectUserId: 'subject-uuid',
        resourceType: 'upload',
        resourceId: undefined,
        limit: 10,
        offset: 0,
      });
    });

    it('should return owned resource grants for non-admin', async () => {
      const owner = makeOwnerUser();
      const propGrant = makeGrant({
        id: 'prop-grant',
        resourceType: 'property',
        resourceId: 'prop-uuid-1',
      });

      mockAccessRepository.listFilteredAndCount.mockResolvedValue([[propGrant], 1]);

      const result = await service.listGrants(owner);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('prop-grant');
      expect(result.total).toBe(1);
      expect(mockAccessRepository.listFilteredAndCount).toHaveBeenCalledWith({
        ownerUserId: owner.sub,
        subjectUserId: undefined,
        resourceType: undefined,
        resourceId: undefined,
        limit: 50,
        offset: 0,
      });
      expect(mockCatalogRepository.listProperties).not.toHaveBeenCalled();
      expect(mockUploadsRepository.listByUserId).not.toHaveBeenCalled();
    });

    it('passes owner scope, filters and pagination together', async () => {
      const owner = makeOwnerUser();
      const grants = [makeGrant()];
      mockAccessRepository.listFilteredAndCount.mockResolvedValue([grants, 3]);
      const result = await service.listGrants(owner, {
        subjectUserId: 'subject-uuid',
        resourceType: 'upload',
        page: 2,
        pageSize: 1,
      });
      expect(result.items).toEqual(grants);
      expect(result.total).toBe(3);
      expect(mockAccessRepository.listFilteredAndCount).toHaveBeenCalledWith({
        ownerUserId: owner.sub,
        subjectUserId: 'subject-uuid',
        resourceType: 'upload',
        resourceId: undefined,
        limit: 1,
        offset: 1,
      });
    });

    it('should return empty array for non-admin with no owned resources', async () => {
      const owner = makeOwnerUser();

      mockUploadsRepository.listByUserId.mockResolvedValue([]);
      mockCatalogRepository.listProperties.mockResolvedValue([]);
      mockCatalogRepository.listTalhoes.mockResolvedValue([]);
      mockCatalogRepository.listCropTypes.mockResolvedValue([]);
      mockAccessRepository.listFilteredAndCount.mockResolvedValue([[], 0]);

      const result = await service.listGrants(owner);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ── createGrant ────────────────────────────────────────────────────

  describe('createGrant', () => {
    const validDto: CreateGrantDto = {
      subjectUserId: 'subject-uuid',
      resourceType: 'upload' as const,
      resourceId: 'upload-uuid-1',
      actions: ['read'],
      reason: 'test grant',
    };

    it('should create grant for admin on any resource', async () => {
      const admin = makeAdminUser();
      const upload = makeUpload();

      mockUsersRepository.findById.mockResolvedValue({ id: 'subject-uuid' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockAccessRepository.findActiveGrant.mockResolvedValue(undefined);
      mockAccessRepository.createGrant.mockResolvedValue(makeGrant());

      const result = await service.createGrant(validDto, admin);

      expect(result).toBeDefined();
      expect(mockAccessRepository.createGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          subjectUserId: 'subject-uuid',
          resourceType: 'upload',
          resourceId: 'upload-uuid-1',
        }),
        { actorUserId: admin.sub },
      );
    });

    it('should create grant for owner on own upload', async () => {
      const owner = makeOwnerUser();
      const upload = makeUpload(); // owner-uuid owns this

      mockUsersRepository.findById.mockResolvedValue({ id: 'subject-uuid' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockAccessRepository.findActiveGrant.mockResolvedValue(undefined);
      mockAccessRepository.createGrant.mockResolvedValue(makeGrant());

      await service.createGrant(validDto, owner);

      expect(mockAccessRepository.createGrant).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when non-admin tries to grant on resource they do not own', async () => {
      const otherUser = makeOwnerUser({ sub: 'other-uuid', email: 'other@example.com' });
      const upload = makeUpload({ userId: 'not-other-uuid' });

      mockUsersRepository.findById.mockResolvedValue({ id: 'subject-uuid' });
      mockUploadsRepository.findById.mockResolvedValue(upload);

      await expect(service.createGrant(validDto, otherUser)).rejects.toThrow(ForbiddenException);
      expect(mockAccessRepository.createGrant).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when subject user does not exist', async () => {
      mockUsersRepository.findById.mockResolvedValue(undefined);

      await expect(service.createGrant(validDto, makeAdminUser())).rejects.toThrow(
        NotFoundException,
      );
      expect(mockAccessRepository.createGrant).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when resource does not exist', async () => {
      mockUsersRepository.findById.mockResolvedValue({ id: 'subject-uuid' });
      mockUploadsRepository.findById.mockResolvedValue(undefined);

      await expect(service.createGrant(validDto, makeAdminUser())).rejects.toThrow(
        NotFoundException,
      );
      expect(mockAccessRepository.createGrant).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when duplicate active grant exists', async () => {
      mockUsersRepository.findById.mockResolvedValue({ id: 'subject-uuid' });
      mockUploadsRepository.findById.mockResolvedValue(makeUpload());
      mockAccessRepository.findActiveGrant.mockResolvedValue(makeGrant());

      await expect(service.createGrant(validDto, makeAdminUser())).rejects.toThrow(
        ConflictException,
      );
      expect(mockAccessRepository.createGrant).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when grant creation loses the unique-index race', async () => {
      mockUsersRepository.findById.mockResolvedValue({ id: 'subject-uuid' });
      mockUploadsRepository.findById.mockResolvedValue(makeUpload());
      mockAccessRepository.findActiveGrant.mockResolvedValue(undefined);
      mockAccessRepository.createGrant.mockRejectedValue({ code: '23505' });

      await expect(service.createGrant(validDto, makeAdminUser())).rejects.toThrow(
        ConflictException,
      );
    });

    it('should propagate non-unique grant creation errors', async () => {
      const error = new Error('DB error');
      mockUsersRepository.findById.mockResolvedValue({ id: 'subject-uuid' });
      mockUploadsRepository.findById.mockResolvedValue(makeUpload());
      mockAccessRepository.findActiveGrant.mockResolvedValue(undefined);
      mockAccessRepository.createGrant.mockRejectedValue(error);

      await expect(service.createGrant(validDto, makeAdminUser())).rejects.toBe(error);
    });

    it('should still create grant when audit fails (non-blocking)', async () => {
      mockUsersRepository.findById.mockResolvedValue({ id: 'subject-uuid' });
      mockUploadsRepository.findById.mockResolvedValue(makeUpload());
      mockAccessRepository.findActiveGrant.mockResolvedValue(undefined);
      mockAccessRepository.createGrant.mockResolvedValue(makeGrant());
      mockAuditRepository.create.mockRejectedValue(new Error('DB error'));

      const result = await service.createGrant(validDto, makeAdminUser());

      expect(result).toBeDefined();
      expect(mockAccessRepository.createGrant).toHaveBeenCalled();
    });

    it('should allow admin to grant on a property owned by someone else', async () => {
      const dto: CreateGrantDto = {
        subjectUserId: 'subject-uuid',
        resourceType: 'property' as const,
        resourceId: 'somebody-elses-prop',
        actions: ['read'],
      };

      mockUsersRepository.findById.mockResolvedValue({ id: 'subject-uuid' });
      mockCatalogRepository.findPropertyById.mockResolvedValue({
        id: 'somebody-elses-prop',
        userId: 'other-user',
      });
      mockAccessRepository.findActiveGrant.mockResolvedValue(undefined);
      mockAccessRepository.createGrant.mockResolvedValue(
        makeGrant({ resourceType: 'property', resourceId: 'somebody-elses-prop' }),
      );
      mockAuditRepository.create.mockResolvedValue({});

      const result = await service.createGrant(dto, makeAdminUser());

      expect(result).toBeDefined();
      expect(mockAccessRepository.createGrant).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when non-admin tries to grant on property they do not own', async () => {
      const dto: CreateGrantDto = {
        subjectUserId: 'subject-uuid',
        resourceType: 'property' as const,
        resourceId: 'not-my-prop',
        actions: ['read'],
      };

      mockUsersRepository.findById.mockResolvedValue({ id: 'subject-uuid' });
      mockCatalogRepository.findPropertyById.mockResolvedValue({
        id: 'not-my-prop',
        userId: 'other-owner',
      });

      await expect(service.createGrant(dto, makeOwnerUser())).rejects.toThrow(ForbiddenException);
      expect(mockAccessRepository.createGrant).not.toHaveBeenCalled();
    });
  });

  // ── revokeGrant ────────────────────────────────────────────────────

  describe('revokeGrant', () => {
    it('should revoke grant for admin', async () => {
      const grant = makeGrant();
      mockAccessRepository.findGrantById.mockResolvedValue(grant);
      mockAccessRepository.revokeGrant.mockResolvedValue(undefined);
      mockAuditRepository.create.mockResolvedValue({});

      await service.revokeGrant('grant-uuid-1', makeAdminUser());

      expect(mockAccessRepository.revokeGrant).toHaveBeenCalledWith(
        'grant-uuid-1',
        expect.objectContaining({ actorUserId: 'admin-uuid' }),
      );
    });

    it('should allow owner to revoke grant on own upload', async () => {
      const upload = makeUpload(); // owner-uuid owns this
      const grant = makeGrant({ resourceType: 'upload', resourceId: upload.id });
      const owner = makeOwnerUser();

      mockAccessRepository.findGrantById.mockResolvedValue(grant);
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockAccessRepository.revokeGrant.mockResolvedValue(undefined);
      mockAuditRepository.create.mockResolvedValue({});

      await service.revokeGrant('grant-uuid-1', owner);

      expect(mockAccessRepository.revokeGrant).toHaveBeenCalledWith(
        'grant-uuid-1',
        expect.objectContaining({ actorUserId: 'owner-uuid' }),
      );
    });

    it('should throw ForbiddenException when non-admin tries to revoke grant on resource not their own', async () => {
      const grant = makeGrant({ resourceType: 'upload', resourceId: 'upload-uuid-1' });
      const otherUser = makeOwnerUser({ sub: 'other-uuid' });
      // Upload is owned by owner-uuid, but current user is other-uuid => mismatch
      const upload = makeUpload({ userId: 'owner-uuid' });

      mockAccessRepository.findGrantById.mockResolvedValue(grant);
      mockUploadsRepository.findById.mockResolvedValue(upload);

      await expect(service.revokeGrant('grant-uuid-1', otherUser)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockAccessRepository.revokeGrant).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when grant does not exist', async () => {
      mockAccessRepository.findGrantById.mockResolvedValue(undefined);

      await expect(service.revokeGrant('nonexistent', makeAdminUser())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should be a no-op if grant already revoked', async () => {
      mockAccessRepository.findGrantById.mockResolvedValue(makeGrant({ revokedAt: new Date() }));

      await service.revokeGrant('grant-uuid-1', makeAdminUser());

      expect(mockAccessRepository.revokeGrant).not.toHaveBeenCalled();
      expect(mockAuditRepository.create).not.toHaveBeenCalled();
    });

    it('should still revoke when audit fails (non-blocking)', async () => {
      const grant = makeGrant();
      mockAccessRepository.findGrantById.mockResolvedValue(grant);
      mockUploadsRepository.findById.mockResolvedValue(makeUpload());
      mockAccessRepository.revokeGrant.mockResolvedValue(undefined);
      mockAuditRepository.create.mockRejectedValue(new Error('DB error'));

      await service.revokeGrant('grant-uuid-1', makeAdminUser());

      expect(mockAccessRepository.revokeGrant).toHaveBeenCalled();
    });
  });
});
