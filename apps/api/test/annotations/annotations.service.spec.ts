import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { AnnotationsService } from '../../src/annotations/annotations.service';
import {
  AnnotationsRepository,
  UploadsRepository,
  AccessRepository,
  type ImageAnnotation,
} from '../../src/database/repositories';
import type { AuthenticatedUser } from '../../src/auth/guards/jwt-auth.guard';

// ── Helpers ──────────────────────────────────────────────────────────

function makeCurrentUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    sub: 'user-uuid-1',
    email: 'owner@example.com',
    role: 'user',
    userRecord: {
      id: 'user-uuid-1',
      email: 'owner@example.com',
      fullName: 'Test Owner',
      phone: null,
      role: 'user',
      disabledAt: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    },
    ...overrides,
  };
}

function makeAdminUser(): AuthenticatedUser {
  return makeCurrentUser({
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
  });
}

function makeUpload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'upload-uuid-1',
    clientUploadId: 'client-upload-1',
    userId: 'user-uuid-1',
    propertyId: 'prop-uuid-1',
    talhaoId: 'talhao-uuid-1',
    cropTypeId: 'crop-uuid-1',
    estadioId: null,
    source: 'phone',
    status: 'ready',
    activityDate: new Date('2025-06-15'),
    latitude: -22.9,
    longitude: -43.1,
    errorMessage: null,
    createdAt: new Date('2025-06-15'),
    updatedAt: new Date('2025-06-15'),
    deletedAt: null,
    ...overrides,
  };
}

function makeAnnotation(overrides: Partial<ImageAnnotation> = {}): ImageAnnotation {
  return {
    id: 'annot-uuid-1',
    uploadId: 'upload-uuid-1',
    imageIndex: 0,
    imageWidth: 1920,
    imageHeight: 1080,
    classes: ['weed', 'crop'],
    labels: [{ label: 'weed', x: 100, y: 200, w: 50, h: 50 }] as unknown as Record<string, unknown>,
    updatedByUserId: 'user-uuid-1',
    updatedAt: new Date('2025-06-15T12:00:00Z'),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('AnnotationsService', () => {
  let service: AnnotationsService;

  const mockAnnotationsRepository = {
    findByUploadId: jest.fn(),
    findOne: jest.fn(),
    upsert: jest.fn(),
  };

  const mockUploadsRepository = {
    findById: jest.fn(),
    findByIdAnyStatus: jest.fn(),
  };

  const mockAccessRepository = {
    hasAnyActiveGrantForUpload: jest.fn(),
  };

  const owner = makeCurrentUser();
  const admin = makeAdminUser();
  const otherUser = makeCurrentUser({
    sub: 'other-user-uuid',
    email: 'other@example.com',
    role: 'user',
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnotationsService,
        { provide: AnnotationsRepository, useValue: mockAnnotationsRepository },
        { provide: UploadsRepository, useValue: mockUploadsRepository },
        { provide: AccessRepository, useValue: mockAccessRepository },
      ],
    }).compile();

    service = module.get<AnnotationsService>(AnnotationsService);
  });

  // ── listAnnotations ────────────────────────────────────────────────

  describe('listAnnotations', () => {
    it('should list annotations for owner', async () => {
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(makeUpload({ userId: owner.sub }));
      mockAnnotationsRepository.findByUploadId.mockResolvedValue([makeAnnotation()]);

      const result = await service.listAnnotations('upload-uuid-1', owner);

      expect(result).toHaveLength(1);
      expect(mockAnnotationsRepository.findByUploadId).toHaveBeenCalledWith('upload-uuid-1');
    });

    it('should list annotations for admin', async () => {
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(
        makeUpload({ userId: 'someone-else' }),
      );
      mockAnnotationsRepository.findByUploadId.mockResolvedValue([makeAnnotation()]);

      const result = await service.listAnnotations('upload-uuid-1', admin);

      expect(result).toHaveLength(1);
    });

    it('should list annotations for allowed non-owner on ready upload', async () => {
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(
        makeUpload({ userId: 'someone-else', status: 'ready' }),
      );
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(true);
      mockAnnotationsRepository.findByUploadId.mockResolvedValue([makeAnnotation()]);

      const result = await service.listAnnotations('upload-uuid-1', otherUser);

      expect(result).toHaveLength(1);
    });

    it('should throw NotFoundException when upload does not exist', async () => {
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(undefined);

      await expect(service.listAnnotations('nonexistent', owner)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for non-ready upload by non-owner', async () => {
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(
        makeUpload({ userId: 'someone-else', status: 'draft' }),
      );

      await expect(service.listAnnotations('upload-uuid-1', otherUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for ready upload by ungranted user', async () => {
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(
        makeUpload({ userId: 'someone-else', status: 'ready' }),
      );
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);

      await expect(service.listAnnotations('upload-uuid-1', otherUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return empty array when no annotations exist', async () => {
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(makeUpload({ userId: owner.sub }));
      mockAnnotationsRepository.findByUploadId.mockResolvedValue([]);

      const result = await service.listAnnotations('upload-uuid-1', owner);

      expect(result).toEqual([]);
    });
  });

  // ── getAnnotation ──────────────────────────────────────────────────

  describe('getAnnotation', () => {
    it('should return annotation for owner', async () => {
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(makeUpload({ userId: owner.sub }));
      mockAnnotationsRepository.findOne.mockResolvedValue(makeAnnotation());

      const result = await service.getAnnotation('upload-uuid-1', 0, owner);

      expect(result.imageIndex).toBe(0);
      expect(mockAnnotationsRepository.findOne).toHaveBeenCalledWith('upload-uuid-1', 0);
    });

    it('should throw NotFoundException when annotation does not exist', async () => {
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(makeUpload({ userId: owner.sub }));
      mockAnnotationsRepository.findOne.mockResolvedValue(undefined);

      await expect(service.getAnnotation('upload-uuid-1', 0, owner)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when upload does not exist', async () => {
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(undefined);

      await expect(service.getAnnotation('nonexistent', 0, owner)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── upsertAnnotation ───────────────────────────────────────────────

  describe('upsertAnnotation', () => {
    const validDto = {
      imageWidth: 1920,
      imageHeight: 1080,
      classes: ['weed', 'crop'],
      labels: { boxes: [{ label: 'weed', x: 100, y: 200 }] },
    };

    it('should upsert annotation for owner', async () => {
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(makeUpload({ userId: owner.sub }));
      mockAnnotationsRepository.upsert.mockResolvedValue(
        makeAnnotation({ labels: validDto.labels as unknown as Record<string, unknown> }),
      );

      const result = await service.upsertAnnotation('upload-uuid-1', 0, validDto, owner);

      expect(result.imageIndex).toBe(0);
      expect(mockAnnotationsRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadId: 'upload-uuid-1',
          imageIndex: 0,
          imageWidth: 1920,
          imageHeight: 1080,
          classes: ['weed', 'crop'],
          updatedByUserId: owner.sub,
        }),
      );
    });

    it('should upsert annotation for admin', async () => {
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(
        makeUpload({ userId: 'someone-else' }),
      );
      mockAnnotationsRepository.upsert.mockResolvedValue(makeAnnotation());

      const result = await service.upsertAnnotation('upload-uuid-1', 0, validDto, admin);

      expect(result).toBeDefined();
    });

    it('should overwrite existing annotation (last-write-wins)', async () => {
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(makeUpload({ userId: owner.sub }));
      const existing = makeAnnotation({
        classes: ['old-class'],
        labels: { old: 'data' } as unknown as Record<string, unknown>,
      });
      mockAnnotationsRepository.findOne.mockResolvedValueOnce(existing);
      mockAnnotationsRepository.upsert.mockResolvedValue(
        makeAnnotation({
          classes: ['weed', 'crop'],
          labels: validDto.labels as unknown as Record<string, unknown>,
        }),
      );

      const result = await service.upsertAnnotation('upload-uuid-1', 0, validDto, owner);

      expect(result.classes).toEqual(['weed', 'crop']);
      expect(mockAnnotationsRepository.upsert).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when non-owner non-admin tries to upsert', async () => {
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(
        makeUpload({ userId: 'someone-else' }),
      );
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(true);

      await expect(
        service.upsertAnnotation('upload-uuid-1', 0, validDto, otherUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when upload does not exist', async () => {
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(undefined);

      await expect(service.upsertAnnotation('nonexistent', 0, validDto, owner)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
