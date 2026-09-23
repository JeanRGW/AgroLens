import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { UploadsService } from '../../src/uploads/uploads.service';
import { UploadQueryService } from '../../src/uploads/upload-query.service';
import {
  UploadsRepository,
  CatalogRepository,
  AccessRepository,
  AuditRepository,
} from '../../src/database/repositories';
import type { Upload, UploadFile } from '../../src/database/repositories';
import type { AuthenticatedUser } from '../../src/auth/guards/jwt-auth.guard';
import { StorageService } from '../../src/storage/storage.service';
import { EXPORT_BATCH_MAX_SIZE } from '../../src/uploads/dto/export-download.dto';
import { uploadListSchema } from '../../src/uploads/dto/upload-list.dto';
import { buildUploadSearchCondition } from '../../src/uploads/uploads.service';

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

function makeUpload(overrides: Partial<Upload> = {}): Upload {
  return {
    id: 'upload-uuid-1',
    clientUploadId: 'client-upload-1',
    userId: 'user-uuid-1',
    propertyId: 'prop-uuid-1',
    talhaoId: 'talhao-uuid-1',
    cropTypeId: 'crop-uuid-1',
    estadioId: null,
    source: 'phone',
    status: 'draft',
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

function makeUploadFile(overrides: Partial<UploadFile> = {}): UploadFile {
  return {
    id: 'file-uuid-1',
    uploadId: 'upload-uuid-1',
    imageIndex: 0,
    variant: 'original',
    objectKey: 'uploads/user-uuid-1/upload-uuid-1/0/original.jpg',
    contentType: 'image/jpeg',
    sizeBytes: null,
    observedEtag: null,
    width: null,
    height: null,
    createdAt: new Date('2025-06-15'),
    ...overrides,
  };
}

function makeEnrichedRow(overrides: Record<string, any> = {}) {
  return {
    id: 'upload-uuid-1',
    status: 'ready',
    source: 'phone',
    activityDate: new Date('2025-06-15'),
    latitude: -22.9,
    longitude: -43.1,
    createdAt: new Date('2025-06-15'),
    updatedAt: new Date('2025-06-15'),
    userId: 'user-uuid-1',
    propertyId: 'prop-uuid-1',
    talhaoId: 'talhao-uuid-1',
    cropTypeId: 'crop-uuid-1',
    estadioId: null,
    userFullName: 'Test Owner',
    propertyName: 'Fazenda Teste',
    talhaoName: 'Talhao A',
    cropTypeName: 'Soja',
    estadioName: null,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('UploadsService', () => {
  let service: UploadsService;
  let queryService: UploadQueryService;

  const mockUploadsRepository = {
    findByClientUploadId: jest.fn(),
    findById: jest.fn(),
    findByIdAnyStatus: jest.fn(),
    findByIdEnriched: jest.fn(),
    findFileById: jest.fn(),
    listByIds: jest.fn(),
    create: jest.fn(),
    createWithFiles: jest.fn().mockImplementation(async (upload: unknown) => ({
      upload: { ...(upload as object), id: 'upload-uuid-1', status: 'draft' },
      created: true,
    })),
    renewDraft: jest.fn(),
    softDelete: jest.fn(),
    transitionToFinalizing: jest.fn(),
    sealAndTransitionToFinalizing: jest.fn(),
    softDeleteAndEnqueueObjects: jest.fn(),
    findFilesByUploadId: jest.fn(),
    findOriginalsByUploadIds: jest.fn().mockResolvedValue([]),
    countWhere: jest.fn(),
    countWhereEnriched: jest.fn(),
    listWhereEnriched: jest.fn(),
    countOriginalsByUploadIds: jest.fn(),
    countPreviewsByUploadIds: jest.fn().mockResolvedValue(new Map()),
    findFirstPreviewByUploadIds: jest.fn(),
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
    countProperties: jest.fn().mockResolvedValue(0),
    countTalhoes: jest.fn().mockResolvedValue(0),
    countCropTypes: jest.fn().mockResolvedValue(0),
    countEstadios: jest.fn().mockResolvedValue(0),
  };

  const mockAccessRepository = {
    hasAnyActiveGrantForUpload: jest.fn(),
  };

  const mockAuditRepository = {
    create: jest.fn(),
  };

  const mockStorageService = {
    getPresignedPutUrl: jest.fn(),
    getPresignedGetUrl: jest.fn(),
    headObject: jest.fn(),
    putObject: jest.fn(),
  };

  function resetMocks() {
    jest.clearAllMocks();
  }

  const owner = makeCurrentUser();
  const admin = makeAdminUser();
  const otherUser = makeCurrentUser({
    sub: 'other-user-uuid',
    email: 'other@example.com',
    role: 'user',
  });

  beforeEach(async () => {
    resetMocks();
    mockUploadsRepository.renewDraft.mockReset().mockResolvedValue(makeUpload());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        UploadQueryService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_key: string, def?: unknown) => def) },
        },
        { provide: UploadsRepository, useValue: mockUploadsRepository },
        { provide: CatalogRepository, useValue: mockCatalogRepository },
        { provide: AccessRepository, useValue: mockAccessRepository },
        { provide: AuditRepository, useValue: mockAuditRepository },
        { provide: StorageService, useValue: mockStorageService },
      ],
    }).compile();

    service = module.get<UploadsService>(UploadsService);
    queryService = module.get<UploadQueryService>(UploadQueryService);
  });

  // ── initUpload ─────────────────────────────────────────────────────

  describe('initUpload', () => {
    const validDto = {
      clientUploadId: 'client-upload-1',
      propertyId: '00000000-0000-0000-0000-000000000001',
      talhaoId: '00000000-0000-0000-0000-000000000002',
      cropTypeId: '00000000-0000-0000-0000-000000000003',
      source: 'phone' as const,
      activityDate: new Date('2025-06-15'),
      latitude: -22.9,
      longitude: -43.1,
      files: [{ contentType: 'image/jpeg' }, { contentType: 'image/png' }],
    };

    beforeEach(() => {
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([
        makeUploadFile(),
        makeUploadFile({ id: 'file-uuid-2', imageIndex: 1, contentType: 'image/png' }),
      ]);
      // Catalog references exist
      mockCatalogRepository.findPropertyById.mockResolvedValue({ id: validDto.propertyId });
      mockCatalogRepository.findTalhaoById.mockResolvedValue({
        id: validDto.talhaoId,
        propertyId: validDto.propertyId,
      });
      mockCatalogRepository.findCropTypeById.mockResolvedValue({ id: validDto.cropTypeId });
    });

    it('should create a new draft upload with presigned URLs', async () => {
      mockUploadsRepository.findByClientUploadId.mockResolvedValue(undefined);
      mockUploadsRepository.create.mockResolvedValue(makeUpload());
      mockStorageService.getPresignedPutUrl.mockResolvedValue({
        url: 'https://s3.example.com/presigned',
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        expiresAt: new Date(),
        objectKey: 'uploads/user-uuid-1/upload-uuid-1/0/original.jpg',
      });

      const result = await service.initUpload(validDto, owner);

      expect(result.uploadId).toBe('upload-uuid-1');
      expect(result.status).toBe('draft');
      expect(result.files).toHaveLength(2);
      expect(result.files[0].uploadUrl).toBe('https://s3.example.com/presigned');
      expect(result.files[0].method).toBe('PUT');
      expect(mockUploadsRepository.createWithFiles).toHaveBeenCalled();
    });

    it('should return conflict when a deleted clientUploadId is reused', async () => {
      mockUploadsRepository.findByClientUploadId.mockResolvedValue(undefined);
      const error = new Error('CLIENT_UPLOAD_ID_DELETED');
      error.name = 'CLIENT_UPLOAD_ID_DELETED';
      mockUploadsRepository.createWithFiles.mockRejectedValueOnce(error);

      await expect(service.initUpload(validDto, owner)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: {
          code: 'CLIENT_UPLOAD_ID_DELETED',
          message: expect.any(String),
        },
      });
    });

    it('should assign image indices when not provided', async () => {
      mockUploadsRepository.findByClientUploadId.mockResolvedValue(undefined);
      mockStorageService.getPresignedPutUrl.mockResolvedValue({
        url: 'https://s3.example.com/presigned',
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        expiresAt: new Date(),
        objectKey: 'key',
      });

      await service.initUpload(validDto, owner);

      expect(mockUploadsRepository.createWithFiles).toHaveBeenCalledWith(expect.any(Object), [
        expect.objectContaining({ imageIndex: 0 }),
        expect.objectContaining({ imageIndex: 1 }),
      ]);
    });

    it('should reject unsupported content types', async () => {
      const badDto = {
        ...validDto,
        files: [{ contentType: 'application/pdf' }],
      };

      await expect(service.initUpload(badDto, owner)).rejects.toThrow(BadRequestException);
    });

    it('should reject too many files', async () => {
      const manyFiles = Array.from({ length: 101 }, () => ({ contentType: 'image/jpeg' }));
      const badDto = { ...validDto, files: manyFiles };

      await expect(service.initUpload(badDto, owner)).rejects.toThrow(BadRequestException);
    });

    it('should reject files exceeding max size', async () => {
      const badDto = {
        ...validDto,
        files: [{ contentType: 'image/jpeg', sizeBytes: 200 * 1024 * 1024 }],
      };

      await expect(service.initUpload(badDto, owner)).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate image indices', async () => {
      const badDto = {
        ...validDto,
        files: [
          { imageIndex: 0, contentType: 'image/jpeg' },
          { imageIndex: 0, contentType: 'image/png' },
        ],
      };

      await expect(service.initUpload(badDto, owner)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when property does not exist', async () => {
      mockCatalogRepository.findPropertyById.mockResolvedValue(undefined);

      await expect(service.initUpload(validDto, owner)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when talhao does not exist', async () => {
      mockCatalogRepository.findTalhaoById.mockResolvedValue(undefined);

      await expect(service.initUpload(validDto, owner)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when talhao does not belong to property', async () => {
      mockCatalogRepository.findTalhaoById.mockResolvedValue({
        id: validDto.talhaoId,
        propertyId: 'different-property',
      });

      await expect(service.initUpload(validDto, owner)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when crop type does not exist', async () => {
      mockCatalogRepository.findCropTypeById.mockResolvedValue(undefined);

      await expect(service.initUpload(validDto, owner)).rejects.toThrow(NotFoundException);
    });

    it('should return existing upload for idempotent retry (finalizing)', async () => {
      const existing = makeUpload({ status: 'finalizing' });
      mockUploadsRepository.findByClientUploadId.mockResolvedValue(existing);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([makeUploadFile()]);

      const result = await service.initUpload(validDto, owner);

      expect(result.uploadId).toBe(existing.id);
      expect(result.status).toBe('finalizing');
    });

    it('should return existing upload for idempotent retry (ready)', async () => {
      const existing = makeUpload({ status: 'ready' });
      mockUploadsRepository.findByClientUploadId.mockResolvedValue(existing);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([makeUploadFile()]);

      const result = await service.initUpload(validDto, owner);

      expect(result.uploadId).toBe(existing.id);
      expect(result.status).toBe('ready');
    });

    it('should return a fresh URL when a pre-created file row has no object', async () => {
      const existing = makeUpload({
        propertyId: validDto.propertyId,
        talhaoId: validDto.talhaoId,
        cropTypeId: validDto.cropTypeId,
      });
      mockUploadsRepository.findByClientUploadId.mockResolvedValue(existing);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([
        makeUploadFile({ objectKey: 'staging/uploads/user-uuid-1/upload-uuid-1/0/original.jpg' }),
        makeUploadFile({
          id: 'file-uuid-2',
          imageIndex: 1,
          objectKey: 'staging/uploads/user-uuid-1/upload-uuid-1/1/original.png',
          contentType: 'image/png',
        }),
      ]);
      mockStorageService.headObject.mockResolvedValue({ exists: false });
      mockStorageService.getPresignedPutUrl.mockResolvedValue({
        url: 'https://s3.example.com/retry',
        headers: { 'Content-Type': 'image/jpeg' },
        expiresAt: new Date(),
        objectKey: 'staging/uploads/user-uuid-1/upload-uuid-1/0/original.jpg',
      });

      const result = await service.initUpload(validDto, owner);

      expect(result.files[0].uploadUrl).toBe('https://s3.example.com/retry');
      expect(mockStorageService.headObject).toHaveBeenCalledWith(
        'staging/uploads/user-uuid-1/upload-uuid-1/0/original.jpg',
      );
      expect(mockStorageService.getPresignedPutUrl).toHaveBeenCalled();
    });

    it('should accept a retry when worker normalization changed contentType', async () => {
      const existing = makeUpload({
        propertyId: validDto.propertyId,
        talhaoId: validDto.talhaoId,
        cropTypeId: validDto.cropTypeId,
      });
      mockUploadsRepository.findByClientUploadId.mockResolvedValue(existing);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([
        makeUploadFile({
          contentType: 'image/jpeg',
          objectKey: 'uploads/user-uuid-1/upload-uuid-1/0/original.png',
        }),
        makeUploadFile({
          id: 'file-uuid-2',
          imageIndex: 1,
          objectKey: 'uploads/user-uuid-1/upload-uuid-1/1/original.png',
          contentType: 'image/png',
        }),
      ]);
      mockStorageService.headObject.mockResolvedValue({ exists: true });
      mockStorageService.getPresignedPutUrl.mockResolvedValue({
        url: 'https://s3.example.com/retry',
        headers: {},
        expiresAt: new Date(),
        objectKey: 'uploads/user-uuid-1/upload-uuid-1/0/original.png',
      });

      await expect(
        service.initUpload(
          { ...validDto, files: [{ contentType: 'image/png' }, validDto.files[1]] },
          owner,
        ),
      ).resolves.toEqual(expect.objectContaining({ uploadId: existing.id }));
    });

    it('never issues a client PUT URL for a missing server-owned original on retry', async () => {
      const existing = makeUpload({
        status: 'failed',
        propertyId: validDto.propertyId,
        talhaoId: validDto.talhaoId,
        cropTypeId: validDto.cropTypeId,
      });
      mockUploadsRepository.findByClientUploadId.mockResolvedValue(existing);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([
        makeUploadFile(),
        makeUploadFile({
          id: 'file-uuid-2',
          imageIndex: 1,
          objectKey: 'uploads/user-uuid-1/upload-uuid-1/1/original.png',
          contentType: 'image/png',
        }),
      ]);
      mockStorageService.headObject.mockResolvedValue({ exists: false });
      await expect(service.initUpload(validDto, owner)).rejects.toThrow(ConflictException);
      expect(mockStorageService.getPresignedPutUrl).not.toHaveBeenCalled();
      expect(mockUploadsRepository.renewDraft).not.toHaveBeenCalled();
    });

    it('should initiate retry object checks concurrently in input order', async () => {
      const existing = makeUpload({
        propertyId: validDto.propertyId,
        talhaoId: validDto.talhaoId,
        cropTypeId: validDto.cropTypeId,
      });
      mockUploadsRepository.findByClientUploadId.mockResolvedValue(existing);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([
        makeUploadFile({ objectKey: 'staging/uploads/user-uuid-1/upload-uuid-1/0/original.jpg' }),
        makeUploadFile({
          id: 'file-uuid-2',
          imageIndex: 1,
          objectKey: 'staging/uploads/user-uuid-1/upload-uuid-1/1/original.png',
          contentType: 'image/png',
        }),
      ]);
      let started = 0;
      const releases: (() => void)[] = [];
      const allStarted = new Promise<void>((resolve) => {
        mockStorageService.headObject.mockImplementation(async () => {
          started += 1;
          if (started === 2) resolve();
          await new Promise<void>((resolveRelease) => releases.push(resolveRelease));
          return { exists: false };
        });
      });
      mockStorageService.getPresignedPutUrl.mockResolvedValue({
        url: 'https://s3.example.com/retry',
        headers: {},
        expiresAt: new Date(),
        objectKey: 'uploads/user-uuid-1/upload-uuid-1/0/original.jpg',
      });

      const resultPromise = service.initUpload(validDto, owner);
      await allStarted;
      expect(mockStorageService.headObject).toHaveBeenCalledTimes(2);
      releases.forEach((release) => release());
      const result = await resultPromise;
      expect(result.files.map((file) => file.imageIndex)).toEqual([0, 1]);
    });

    it('should skip upload when the corresponding object exists', async () => {
      const existing = makeUpload({
        propertyId: validDto.propertyId,
        talhaoId: validDto.talhaoId,
        cropTypeId: validDto.cropTypeId,
      });
      mockUploadsRepository.findByClientUploadId.mockResolvedValue(existing);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([
        makeUploadFile(),
        makeUploadFile({
          id: 'file-uuid-2',
          imageIndex: 1,
          objectKey: 'uploads/user-uuid-1/upload-uuid-1/1/original.png',
          contentType: 'image/png',
        }),
      ]);
      mockStorageService.headObject.mockResolvedValue({ exists: true });

      const result = await service.initUpload(validDto, owner);

      expect(result.files.map((file) => file.uploadUrl)).toEqual(['', '']);
      expect(mockStorageService.getPresignedPutUrl).not.toHaveBeenCalled();
    });

    it('should allow a retry without sizes when persisted file sizes are populated', async () => {
      const existing = makeUpload({
        propertyId: validDto.propertyId,
        talhaoId: validDto.talhaoId,
        cropTypeId: validDto.cropTypeId,
      });
      mockUploadsRepository.findByClientUploadId.mockResolvedValue(existing);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([
        makeUploadFile({
          sizeBytes: 100,
          objectKey: 'staging/uploads/user-uuid-1/upload-uuid-1/0/original.jpg',
        }),
        makeUploadFile({
          id: 'file-uuid-2',
          imageIndex: 1,
          objectKey: 'staging/uploads/user-uuid-1/upload-uuid-1/1/original.png',
          contentType: 'image/png',
          sizeBytes: 200,
        }),
      ]);
      mockStorageService.headObject.mockResolvedValue({ exists: false });
      mockStorageService.getPresignedPutUrl.mockResolvedValue({
        url: 'https://s3.example.com/retry',
        headers: { 'Content-Type': 'image/jpeg' },
        expiresAt: new Date(),
        objectKey: 'uploads/user-uuid-1/upload-uuid-1/0/original.jpg',
      });

      await expect(service.initUpload(validDto, owner)).resolves.toEqual(
        expect.objectContaining({ uploadId: existing.id }),
      );
    });

    it('should reset a failed upload and return draft instructions', async () => {
      mockUploadsRepository.renewDraft.mockResolvedValue(makeUpload());
      const existing = makeUpload({
        status: 'failed',
        propertyId: validDto.propertyId,
        talhaoId: validDto.talhaoId,
        cropTypeId: validDto.cropTypeId,
      });
      mockUploadsRepository.findByClientUploadId.mockResolvedValue(existing);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([
        makeUploadFile({ objectKey: 'staging/uploads/user-uuid-1/upload-uuid-1/0/original.jpg' }),
        makeUploadFile({
          id: 'file-uuid-2',
          imageIndex: 1,
          contentType: 'image/png',
          objectKey: 'staging/uploads/user-uuid-1/upload-uuid-1/1/original.png',
        }),
      ]);
      mockStorageService.headObject.mockResolvedValue({ exists: false });
      mockStorageService.getPresignedPutUrl.mockResolvedValue({
        url: 'https://s3.example.com/retry',
        headers: {},
        expiresAt: new Date(),
        objectKey: makeUploadFile().objectKey,
      });
      const result = await service.initUpload(validDto, owner);

      expect(result).toEqual(expect.objectContaining({ uploadId: existing.id, status: 'draft' }));
      expect(mockUploadsRepository.renewDraft).toHaveBeenCalledWith(existing.id);
    });

    it('should throw 409 when retry changes metadata for existing draft', async () => {
      const existing = makeUpload({ propertyId: 'different-property' });
      mockUploadsRepository.findByClientUploadId.mockResolvedValue(existing);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([]);

      await expect(service.initUpload(validDto, owner)).rejects.toThrow(ConflictException);
    });

    it('rejects a retry with a different activity date', async () => {
      mockUploadsRepository.findByClientUploadId.mockResolvedValue(
        makeUpload({
          propertyId: validDto.propertyId,
          talhaoId: validDto.talhaoId,
          cropTypeId: validDto.cropTypeId,
        }),
      );
      await expect(
        service.initUpload({ ...validDto, activityDate: new Date('2025-06-16') }, owner),
      ).rejects.toThrow(ConflictException);
      expect(mockStorageService.getPresignedPutUrl).not.toHaveBeenCalled();
    });

    it.each(['finalizing', 'ready'])(
      'returns the newer %s state when a failed reset loses a race',
      async (status) => {
        const existing = makeUpload({
          status: 'failed',
          propertyId: validDto.propertyId,
          talhaoId: validDto.talhaoId,
          cropTypeId: validDto.cropTypeId,
        });
        mockUploadsRepository.findByClientUploadId.mockResolvedValue(existing);
        mockUploadsRepository.findFilesByUploadId.mockResolvedValue([
          makeUploadFile(),
          makeUploadFile({ imageIndex: 1, objectKey: 'uploads/u/id/1/original.png' }),
        ]);
        mockStorageService.headObject.mockResolvedValue({ exists: true });
        mockUploadsRepository.renewDraft.mockResolvedValue(undefined);
        mockUploadsRepository.findById.mockResolvedValue({ ...existing, status });
        const result = await service.initUpload(validDto, owner);
        expect(result.status).toBe(status);
        expect(result.files.every((file) => file.uploadUrl === '')).toBe(true);
        expect(mockUploadsRepository.renewDraft).toHaveBeenCalledTimes(1);
      },
    );

    it('should throw 409 when retry changes file descriptors for existing draft', async () => {
      const existing = makeUpload();
      mockUploadsRepository.findByClientUploadId.mockResolvedValue(existing);
      // Existing has file at index 0, new request has files at index 0 and 1
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([makeUploadFile()]);

      const dtoWithExtra = {
        ...validDto,
        files: [{ contentType: 'image/jpeg' }, { contentType: 'image/png' }],
      };

      await expect(service.initUpload(dtoWithExtra, owner)).rejects.toThrow(ConflictException);
    });

    it.each([
      ['content type', { contentType: 'image/png' }],
      ['declared size', { contentType: 'image/jpeg', sizeBytes: 100 }],
    ])('should throw 409 when retry changes file %s', async (_field, changedFile) => {
      const existing = makeUpload({
        propertyId: validDto.propertyId,
        talhaoId: validDto.talhaoId,
        cropTypeId: validDto.cropTypeId,
      });
      mockUploadsRepository.findByClientUploadId.mockResolvedValue(existing);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([
        makeUploadFile(),
        makeUploadFile({ imageIndex: 1, contentType: 'image/png' }),
      ]);

      await expect(
        service.initUpload({ ...validDto, files: [changedFile, validDto.files[1]] }, owner),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── completeUpload ─────────────────────────────────────────────────

  describe('completeUpload', () => {
    it('should move draft to finalizing and enqueue job', async () => {
      const upload = makeUpload({ status: 'draft' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([makeUploadFile()]);
      mockStorageService.headObject.mockResolvedValue({
        exists: true,
        contentLength: 100,
        etag: 'etag-1',
      });
      mockUploadsRepository.sealAndTransitionToFinalizing.mockResolvedValue(true);
      mockUploadsRepository.findById.mockResolvedValueOnce(upload);
      mockUploadsRepository.findById.mockResolvedValueOnce(makeUpload({ status: 'finalizing' }));

      const result = await service.completeUpload('upload-uuid-1', owner);

      expect(result).toEqual({
        id: 'upload-uuid-1',
        clientUploadId: 'client-upload-1',
        userId: 'user-uuid-1',
        propertyId: 'prop-uuid-1',
        talhaoId: 'talhao-uuid-1',
        cropTypeId: 'crop-uuid-1',
        estadioId: null,
        source: 'phone',
        status: 'finalizing',
        activityDate: new Date('2025-06-15'),
        latitude: -22.9,
        longitude: -43.1,
        errorMessage: null,
        createdAt: new Date('2025-06-15'),
        updatedAt: new Date('2025-06-15'),
        deletedAt: null,
      });
      expect(() => JSON.stringify(result)).not.toThrow();

      expect(mockUploadsRepository.sealAndTransitionToFinalizing).toHaveBeenCalledWith(
        'upload-uuid-1',
        [{ id: 'file-uuid-1', observedEtag: 'etag-1', sizeBytes: 100 }],
      );
    });

    it('should throw NotFoundException when upload does not exist', async () => {
      mockUploadsRepository.findById.mockResolvedValue(undefined);

      await expect(service.completeUpload('nonexistent', owner)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-owner non-admin tries to complete', async () => {
      const upload = makeUpload({ userId: 'different-user' });
      mockUploadsRepository.findById.mockResolvedValue(upload);

      await expect(service.completeUpload('upload-uuid-1', owner)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow admin to complete any upload', async () => {
      const upload = makeUpload({ userId: 'different-user', status: 'draft' });
      mockUploadsRepository.findById.mockResolvedValueOnce(upload);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([makeUploadFile()]);
      mockStorageService.headObject.mockResolvedValue({
        exists: true,
        contentLength: 100,
        etag: 'etag-1',
      });
      mockUploadsRepository.sealAndTransitionToFinalizing.mockResolvedValue(true);
      mockUploadsRepository.findById.mockResolvedValueOnce(
        makeUpload({ userId: 'different-user', status: 'finalizing' }),
      );

      await service.completeUpload('upload-uuid-1', admin);

      expect(mockUploadsRepository.sealAndTransitionToFinalizing).toHaveBeenCalledWith(
        'upload-uuid-1',
        [{ id: 'file-uuid-1', observedEtag: 'etag-1', sizeBytes: 100 }],
      );
    });

    it('should complete a failed upload without an accounting reservation', async () => {
      const upload = makeUpload({ status: 'failed' });
      mockUploadsRepository.findById.mockResolvedValueOnce(upload);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([makeUploadFile()]);
      mockStorageService.headObject.mockResolvedValue({
        exists: true,
        contentLength: 100,
        etag: 'etag-1',
      });
      mockUploadsRepository.sealAndTransitionToFinalizing.mockResolvedValue(true);
      mockUploadsRepository.findById.mockResolvedValueOnce(makeUpload({ status: 'finalizing' }));

      await service.completeUpload('upload-uuid-1', owner);

      expect(mockUploadsRepository.sealAndTransitionToFinalizing).toHaveBeenCalled();
    });

    it('should throw ConflictException when upload is not in completable status', async () => {
      const upload = makeUpload({ status: 'ready' });
      mockUploadsRepository.findById.mockResolvedValue(upload);

      await expect(service.completeUpload('upload-uuid-1', owner)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException when the conditional transition loses a race', async () => {
      mockUploadsRepository.findById.mockResolvedValue(makeUpload({ status: 'draft' }));
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([makeUploadFile()]);
      mockUploadsRepository.sealAndTransitionToFinalizing.mockResolvedValue(false);

      await expect(service.completeUpload('upload-uuid-1', owner)).rejects.toThrow(
        ConflictException,
      );
      expect(mockUploadsRepository.sealAndTransitionToFinalizing).toHaveBeenCalledWith(
        'upload-uuid-1',
        [{ id: 'file-uuid-1', observedEtag: 'etag-1', sizeBytes: 100 }],
      );
    });

    it('should throw BadRequestException when no original files exist', async () => {
      const upload = makeUpload({ status: 'draft' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([]);

      await expect(service.completeUpload('upload-uuid-1', owner)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── getUploadDetail ────────────────────────────────────────────────

  describe('getUploadDetail', () => {
    it('should return upload detail with enriched display names for owner', async () => {
      const upload = makeUpload({ status: 'draft' });
      const enrichedRow = {
        ...makeEnrichedRow({ status: 'draft' }),
        clientUploadId: 'client-upload-1',
        errorMessage: null,
      };
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockUploadsRepository.findByIdEnriched.mockResolvedValue(enrichedRow);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([makeUploadFile()]);

      const result = await service.getUploadDetail('upload-uuid-1', owner);

      expect(result.id).toBe('upload-uuid-1');
      expect(result.files).toHaveLength(1);
      expect(result.user).toEqual({ id: 'user-uuid-1', fullName: 'Test Owner' });
      expect(result.propertyName).toBe('Fazenda Teste');
      expect(result.talhaoName).toBe('Talhao A');
      expect(result.cropTypeName).toBe('Soja');
      expect(result.estadioName).toBeNull();
      // IDs preserved
      expect(result.userId).toBe('user-uuid-1');
      expect(result.propertyId).toBe('prop-uuid-1');
      expect(result.talhaoId).toBe('talhao-uuid-1');
      expect(result.cropTypeId).toBe('crop-uuid-1');
      expect(result.estadioId).toBeNull();
    });

    it('should include fileCount, previewCount, and previewFileId', async () => {
      const upload = makeUpload({ status: 'ready' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockUploadsRepository.findByIdEnriched.mockResolvedValue(makeEnrichedRow());
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([
        makeUploadFile({ id: 'orig-0', imageIndex: 0, variant: 'original' }),
        makeUploadFile({ id: 'orig-1', imageIndex: 1, variant: 'original' }),
        makeUploadFile({ id: 'prev-1', imageIndex: 1, variant: 'preview' }),
        makeUploadFile({ id: 'prev-0', imageIndex: 0, variant: 'preview' }),
      ]);

      const result = await service.getUploadDetail('upload-uuid-1', owner);

      expect(result.fileCount).toBe(2);
      expect(result.previewCount).toBe(2);
      expect(result.previewFileId).toBe('prev-1');
    });

    it('should return null previewFileId and zero counts when there are no files', async () => {
      const upload = makeUpload({ status: 'draft' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockUploadsRepository.findByIdEnriched.mockResolvedValue(makeEnrichedRow());
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([]);

      const result = await service.getUploadDetail('upload-uuid-1', owner);

      expect(result.fileCount).toBe(0);
      expect(result.previewCount).toBe(0);
      expect(result.previewFileId).toBeNull();
    });

    it('should return upload detail for admin', async () => {
      const upload = makeUpload({ userId: 'different-user', status: 'draft' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockUploadsRepository.findByIdEnriched.mockResolvedValue(
        makeEnrichedRow({ userId: 'different-user', userFullName: 'Other User', status: 'draft' }),
      );
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([]);

      const result = await service.getUploadDetail('upload-uuid-1', admin);

      expect(result.id).toBe('upload-uuid-1');
      expect(result.user).toEqual({ id: 'different-user', fullName: 'Other User' });
    });

    it('should return ready upload for allowed non-owner', async () => {
      const upload = makeUpload({ userId: 'different-user', status: 'ready' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(true);
      mockUploadsRepository.findByIdEnriched.mockResolvedValue(
        makeEnrichedRow({ userId: 'different-user', userFullName: 'Other User' }),
      );
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([]);

      const result = await service.getUploadDetail('upload-uuid-1', otherUser);

      expect(result.id).toBe('upload-uuid-1');
      expect(result.user).toEqual({ id: 'different-user', fullName: 'Other User' });
    });

    it('should throw NotFoundException for non-ready upload accessed by non-owner', async () => {
      const upload = makeUpload({ userId: 'different-user', status: 'draft' });
      mockUploadsRepository.findById.mockResolvedValue(upload);

      await expect(service.getUploadDetail('upload-uuid-1', otherUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for ready upload accessed by ungranted user', async () => {
      const upload = makeUpload({ userId: 'different-user', status: 'ready' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);

      await expect(service.getUploadDetail('upload-uuid-1', otherUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when upload does not exist', async () => {
      mockUploadsRepository.findById.mockResolvedValue(undefined);

      await expect(service.getUploadDetail('nonexistent', owner)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should fall back gracefully when enriched query returns nothing', async () => {
      const upload = makeUpload({ status: 'draft' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockUploadsRepository.findByIdEnriched.mockResolvedValue(undefined);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([makeUploadFile()]);

      const result = await service.getUploadDetail('upload-uuid-1', owner);

      expect(result.id).toBe('upload-uuid-1');
      expect(result.user).toEqual({ id: 'user-uuid-1', fullName: null });
      expect(result.propertyName).toBeNull();
      expect(result.talhaoName).toBeNull();
      expect(result.cropTypeName).toBeNull();
      expect(result.estadioName).toBeNull();
    });

    it('should not trigger fallback lookups when enriched query returns all names', async () => {
      const upload = makeUpload({ status: 'draft' });
      const enrichedRow = {
        ...makeEnrichedRow({ status: 'draft' }),
        clientUploadId: 'client-upload-1',
        errorMessage: null,
      };
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(upload);
      mockUploadsRepository.findByIdEnriched.mockResolvedValue(enrichedRow);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([]);

      const result = await service.getUploadDetail('upload-uuid-1', owner);

      expect(result.user).toEqual({ id: 'user-uuid-1', fullName: 'Test Owner' });
      expect(result.propertyName).toBe('Fazenda Teste');
      expect(result.talhaoName).toBe('Talhao A');
      expect(result.cropTypeName).toBe('Soja');
    });
  });

  // ── getFileDownloadUrl ──────────────────────────────────────────────

  describe('getFileDownloadUrl', () => {
    const uploadId = 'upload-uuid-1';
    const fileId = 'file-uuid-1';

    it('should return a signed download URL for owner', async () => {
      const upload = makeUpload({ status: 'ready' });
      const file = makeUploadFile({
        id: fileId,
        objectKey: 'uploads/user-uuid-1/upload-uuid-1/0/original.jpg',
      });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://s3.example.com/download',
        expiresAt: new Date('2025-06-15T12:00:00Z'),
      });
      mockUploadsRepository.findFileById.mockResolvedValue(file);
      mockAuditRepository.create.mockResolvedValue({});

      const result = await service.getFileDownloadUrl(uploadId, fileId, owner);

      expect(result.uploadId).toBe(uploadId);
      expect(result.fileId).toBe(fileId);
      expect(result.downloadUrl).toBe('https://s3.example.com/download');
      expect(result.contentType).toBe('image/jpeg');
      expect(mockStorageService.getPresignedGetUrl).toHaveBeenCalledWith(
        'uploads/user-uuid-1/upload-uuid-1/0/original.jpg',
        expect.any(Number),
      );
      expect(mockAuditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'download_url_issued' }),
      );
    });

    it('continues and emits a safe warning when download audit fails', async () => {
      const upload = makeUpload({ status: 'ready' });
      const file = makeUploadFile({ id: fileId, uploadId, objectKey: 'PII/object-key' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockUploadsRepository.findFileById.mockResolvedValue(file);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://signed?token=secret',
        expiresAt: new Date(),
      });
      mockAuditRepository.create.mockRejectedValue(new Error('credential token=secret'));
      const warn = jest.spyOn(
        (queryService as unknown as { logger: { warn: jest.Mock } }).logger,
        'warn',
      );

      await expect(service.getFileDownloadUrl(uploadId, fileId, owner)).resolves.toMatchObject({
        fileId,
      });
      await Promise.resolve();
      const warning = String(warn.mock.calls.at(-1)?.[0]);
      expect(warning).toContain('download_url_issued');
      expect(warning).not.toContain('signed?token=secret');
      expect(warning).not.toContain('PII/object-key');
      expect(warning).not.toContain('credential');
    });

    it('should return a signed download URL for admin', async () => {
      const upload = makeUpload({ userId: 'different-user', status: 'ready' });
      const file = makeUploadFile({ id: fileId, uploadId, objectKey: 'k' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockUploadsRepository.findFileById.mockResolvedValue(file);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://s3.example.com/download',
        expiresAt: new Date(),
      });
      mockAuditRepository.create.mockResolvedValue({});

      const result = await service.getFileDownloadUrl(uploadId, fileId, admin);
      expect(result.downloadUrl).toBe('https://s3.example.com/download');
    });

    it('should return a signed download URL for allowed non-owner', async () => {
      const upload = makeUpload({ userId: 'different-user', status: 'ready' });
      const file = makeUploadFile({ id: fileId, uploadId, objectKey: 'k' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(true);
      mockUploadsRepository.findFileById.mockResolvedValue(file);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://s3.example.com/download',
        expiresAt: new Date(),
      });
      mockAuditRepository.create.mockResolvedValue({});

      const result = await service.getFileDownloadUrl(uploadId, fileId, otherUser);
      expect(result.downloadUrl).toBe('https://s3.example.com/download');
      expect(mockAccessRepository.hasAnyActiveGrantForUpload).toHaveBeenCalledWith(
        otherUser.sub,
        expect.objectContaining({ uploadId }),
      );
    });

    it('should throw NotFoundException when upload does not exist', async () => {
      mockUploadsRepository.findById.mockResolvedValue(undefined);
      await expect(service.getFileDownloadUrl(uploadId, fileId, owner)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when upload is not ready', async () => {
      mockUploadsRepository.findById.mockResolvedValue(makeUpload({ status: 'draft' }));
      await expect(service.getFileDownloadUrl(uploadId, fileId, owner)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when user is not authorized', async () => {
      const upload = makeUpload({ userId: 'different-user', status: 'ready' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);
      await expect(service.getFileDownloadUrl(uploadId, fileId, otherUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when file does not exist', async () => {
      mockUploadsRepository.findById.mockResolvedValue(makeUpload({ status: 'ready' }));
      mockUploadsRepository.findFileById.mockResolvedValue(undefined);
      await expect(service.getFileDownloadUrl(uploadId, fileId, owner)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when file belongs to different upload', async () => {
      mockUploadsRepository.findById.mockResolvedValue(makeUpload({ status: 'ready' }));
      mockUploadsRepository.findFileById.mockResolvedValue(
        makeUploadFile({ id: fileId, uploadId: 'other-upload' }),
      );
      await expect(service.getFileDownloadUrl(uploadId, fileId, owner)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── getFilePreviewUrl ──────────────────────────────────────────────

  describe('getFilePreviewUrl', () => {
    const uploadId = 'upload-uuid-1';
    const previewFileId = 'preview-file-uuid-1';

    it('should return a signed preview URL for owner', async () => {
      const upload = makeUpload({ status: 'ready' });
      const previewFile = makeUploadFile({
        id: previewFileId,
        uploadId,
        variant: 'preview',
        objectKey: 'uploads/user-uuid-1/upload-uuid-1/0/preview.webp',
      });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockUploadsRepository.findFileById.mockResolvedValue(previewFile);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://s3.example.com/preview',
        expiresAt: new Date('2025-06-15T12:00:00Z'),
      });
      mockAuditRepository.create.mockResolvedValue({});

      const result = await service.getFilePreviewUrl(uploadId, previewFileId, owner);

      expect(result.uploadId).toBe(uploadId);
      expect(result.fileId).toBe(previewFileId);
      expect(result.downloadUrl).toBe('https://s3.example.com/preview');
      expect(result.contentType).toBe('image/jpeg');
      expect(mockStorageService.getPresignedGetUrl).toHaveBeenCalledWith(
        'uploads/user-uuid-1/upload-uuid-1/0/preview.webp',
        expect.any(Number),
      );
      expect(mockAuditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'download_url_issued' }),
      );
    });

    it('should return a signed preview URL for admin', async () => {
      const upload = makeUpload({ userId: 'different-user', status: 'ready' });
      const previewFile = makeUploadFile({
        id: previewFileId,
        uploadId,
        variant: 'preview',
        objectKey: 'k',
      });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockUploadsRepository.findFileById.mockResolvedValue(previewFile);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://s3.example.com/preview',
        expiresAt: new Date(),
      });
      mockAuditRepository.create.mockResolvedValue({});

      const result = await service.getFilePreviewUrl(uploadId, previewFileId, admin);
      expect(result.downloadUrl).toBe('https://s3.example.com/preview');
    });

    it('should return a signed preview URL for allowed non-owner', async () => {
      const upload = makeUpload({ userId: 'different-user', status: 'ready' });
      const previewFile = makeUploadFile({
        id: previewFileId,
        uploadId,
        variant: 'preview',
        objectKey: 'k',
      });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(true);
      mockUploadsRepository.findFileById.mockResolvedValue(previewFile);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://s3.example.com/preview',
        expiresAt: new Date(),
      });
      mockAuditRepository.create.mockResolvedValue({});

      const result = await service.getFilePreviewUrl(uploadId, previewFileId, otherUser);
      expect(result.downloadUrl).toBe('https://s3.example.com/preview');
      expect(mockAccessRepository.hasAnyActiveGrantForUpload).toHaveBeenCalledWith(
        otherUser.sub,
        expect.objectContaining({ uploadId }),
      );
    });

    it('should throw NotFoundException when upload does not exist', async () => {
      mockUploadsRepository.findById.mockResolvedValue(undefined);
      await expect(service.getFilePreviewUrl(uploadId, previewFileId, owner)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when upload is not ready', async () => {
      mockUploadsRepository.findById.mockResolvedValue(makeUpload({ status: 'draft' }));
      await expect(service.getFilePreviewUrl(uploadId, previewFileId, owner)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when user is not authorized', async () => {
      const upload = makeUpload({ userId: 'different-user', status: 'ready' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);
      await expect(service.getFilePreviewUrl(uploadId, previewFileId, otherUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when file does not exist', async () => {
      mockUploadsRepository.findById.mockResolvedValue(makeUpload({ status: 'ready' }));
      mockUploadsRepository.findFileById.mockResolvedValue(undefined);
      await expect(service.getFilePreviewUrl(uploadId, previewFileId, owner)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when file is an original (not preview)', async () => {
      mockUploadsRepository.findById.mockResolvedValue(makeUpload({ status: 'ready' }));
      mockUploadsRepository.findFileById.mockResolvedValue(
        makeUploadFile({ id: previewFileId, uploadId, variant: 'original' }),
      );
      await expect(service.getFilePreviewUrl(uploadId, previewFileId, owner)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when file belongs to different upload', async () => {
      mockUploadsRepository.findById.mockResolvedValue(makeUpload({ status: 'ready' }));
      mockUploadsRepository.findFileById.mockResolvedValue(
        makeUploadFile({ id: previewFileId, uploadId: 'other-upload', variant: 'preview' }),
      );
      await expect(service.getFilePreviewUrl(uploadId, previewFileId, owner)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── resolveDisplayUrls ─────────────────────────────────────────────

  describe('resolveDisplayUrls', () => {
    const uploadId = 'upload-uuid-1';

    beforeEach(() => {
      mockAuditRepository.create.mockResolvedValue({});
    });

    it('should resolve signed URLs for originals and previews of an upload for owner', async () => {
      const upload = makeUpload({ status: 'ready' });
      const original = makeUploadFile({
        id: 'orig-1',
        uploadId,
        variant: 'original',
        imageIndex: 0,
        objectKey: 'uploads/user-uuid-1/upload-uuid-1/0/original.jpg',
      });
      const preview = makeUploadFile({
        id: 'prev-1',
        uploadId,
        variant: 'preview',
        imageIndex: 0,
        objectKey: 'uploads/user-uuid-1/upload-uuid-1/0/preview.webp',
      });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([original, preview]);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://s3.example.com/dl',
        expiresAt: new Date('2025-06-15T12:00:00Z'),
      });

      const result = await service.resolveDisplayUrls(uploadId, owner);

      expect(Object.keys(result.files)).toHaveLength(2);
      expect(result.files['orig-1'].variant).toBe('original');
      expect(result.files['prev-1'].variant).toBe('preview');
      expect(mockStorageService.getPresignedGetUrl).toHaveBeenCalledTimes(2);
      // Authorization validated exactly once.
      expect(mockAccessRepository.hasAnyActiveGrantForUpload).not.toHaveBeenCalled();
    });

    it('should allow admin to resolve any upload', async () => {
      const upload = makeUpload({ userId: 'different-user', status: 'ready' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([
        makeUploadFile({ id: 'orig-1', uploadId, variant: 'original', objectKey: 'k' }),
      ]);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://s3.example.com/dl',
        expiresAt: new Date(),
      });

      const result = await service.resolveDisplayUrls(uploadId, admin);
      expect(Object.keys(result.files)).toHaveLength(1);
    });

    it('should allow allowed non-owner to resolve', async () => {
      const upload = makeUpload({ userId: 'different-user', status: 'ready' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(true);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([
        makeUploadFile({ id: 'orig-1', uploadId, variant: 'original', objectKey: 'k' }),
      ]);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://s3.example.com/dl',
        expiresAt: new Date(),
      });

      const result = await service.resolveDisplayUrls(uploadId, otherUser);
      expect(Object.keys(result.files)).toHaveLength(1);
      expect(mockAccessRepository.hasAnyActiveGrantForUpload).toHaveBeenCalledWith(
        otherUser.sub,
        expect.objectContaining({ uploadId }),
      );
    });

    it('should throw NotFoundException when upload does not exist', async () => {
      mockUploadsRepository.findById.mockResolvedValue(undefined);
      await expect(service.resolveDisplayUrls(uploadId, owner)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when upload is not ready', async () => {
      mockUploadsRepository.findById.mockResolvedValue(makeUpload({ status: 'draft' }));
      await expect(service.resolveDisplayUrls(uploadId, owner)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when user is not authorized', async () => {
      const upload = makeUpload({ userId: 'different-user', status: 'ready' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);
      await expect(service.resolveDisplayUrls(uploadId, otherUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should fail when a file cannot be signed', async () => {
      const upload = makeUpload({ status: 'ready' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      const okFile = makeUploadFile({
        id: 'ok',
        uploadId,
        variant: 'original',
        imageIndex: 0,
        objectKey: 'ok-key',
      });
      const badFile = makeUploadFile({
        id: 'bad',
        uploadId,
        variant: 'preview',
        imageIndex: 1,
        objectKey: 'bad-key',
      });
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([okFile, badFile]);
      mockStorageService.getPresignedGetUrl.mockImplementation(async (key: string) => {
        if (key === 'bad-key') throw new Error('sign failed');
        return { url: 'https://s3.example.com/dl', expiresAt: new Date() };
      });

      await expect(service.resolveDisplayUrls(uploadId, owner)).rejects.toThrow('sign failed');
    });

    it('should skip files without an object key', async () => {
      const upload = makeUpload({ status: 'ready' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      const withKey = makeUploadFile({
        id: 'ok',
        uploadId,
        variant: 'original',
        imageIndex: 0,
        objectKey: 'k',
      });
      const withoutKey = makeUploadFile({
        id: 'nokey',
        uploadId,
        variant: 'original',
        imageIndex: 1,
        objectKey: '',
      });
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([withKey, withoutKey]);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://s3.example.com/dl',
        expiresAt: new Date(),
      });

      const result = await service.resolveDisplayUrls(uploadId, owner);

      expect(Object.keys(result.files)).toHaveLength(1);
      expect(Object.keys(result.files)).toContain('ok');
      expect(mockStorageService.getPresignedGetUrl).toHaveBeenCalledTimes(1);
    });

    it('continues and emits a safe warning when display audit fails', async () => {
      const upload = makeUpload({ status: 'ready' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([
        makeUploadFile({
          id: 'orig-1',
          uploadId,
          variant: 'original',
          objectKey: 'PII/object-key',
        }),
      ]);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://s3.example.com/signed?token=secret',
        expiresAt: new Date(),
      });
      mockAuditRepository.create.mockRejectedValue(new Error('database password token=secret'));
      const warn = jest.spyOn(
        (queryService as unknown as { logger: { warn: jest.Mock } }).logger,
        'warn',
      );

      const result = await service.resolveDisplayUrls(uploadId, owner);
      await Promise.resolve();

      expect(result.files['orig-1'].url).toContain('signed');
      const warning = String(warn.mock.calls.at(-1)?.[0]);
      expect(warning).toContain('display_urls_issued');
      expect(warning).not.toContain('signed?token=secret');
      expect(warning).not.toContain('PII/object-key');
      expect(warning).not.toContain('database password');
      expect(warning).not.toContain(owner.email);
    });

    it('should write an audit event for display resolution', async () => {
      const upload = makeUpload({ status: 'ready' });
      mockUploadsRepository.findById.mockResolvedValue(upload);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([
        makeUploadFile({ id: 'orig-1', uploadId, variant: 'original', objectKey: 'k' }),
      ]);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://s3.example.com/dl',
        expiresAt: new Date(),
      });

      await service.resolveDisplayUrls(uploadId, owner);

      expect(mockAuditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'display_urls_issued' }),
      );
    });
  });

  // ── getExportDownloadUrls ───────────────────────────────────────────

  describe('getExportDownloadUrls', () => {
    const uploadId1 = 'upload-uuid-1';
    const uploadId2 = 'upload-uuid-2';
    const fileId1 = 'file-uuid-1';
    const fileId2 = 'file-uuid-2';

    beforeEach(() => {
      mockUploadsRepository.listByIds.mockImplementation((ids: string[]) =>
        Promise.resolve(ids.map((id) => makeUpload({ id, status: 'ready' }))),
      );
      mockUploadsRepository.findOriginalsByUploadIds.mockResolvedValue([]);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://s3.example.com/dl',
        expiresAt: new Date('2025-06-15T12:00:00Z'),
      });
      mockAuditRepository.create.mockResolvedValue({});
    });

    it('continues and emits a safe warning when export audit fails', async () => {
      mockUploadsRepository.findOriginalsByUploadIds.mockResolvedValue([
        makeUploadFile({ id: fileId1, uploadId: uploadId1, objectKey: 'PII/object-key' }),
      ]);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://signed?token=secret',
        expiresAt: new Date(),
      });
      mockAuditRepository.create.mockRejectedValue(new Error('credential token=secret'));
      const warn = jest.spyOn(
        (queryService as unknown as { logger: { warn: jest.Mock } }).logger,
        'warn',
      );

      await expect(
        service.getExportDownloadUrls({ files: [{ uploadId: uploadId1, fileId: fileId1 }] }, owner),
      ).resolves.toHaveLength(1);
      await Promise.resolve();
      const warning = String(warn.mock.calls.at(-1)?.[0]);
      expect(warning).toContain('export_urls_issued');
      expect(warning).not.toContain('signed?token=secret');
      expect(warning).not.toContain('PII/object-key');
      expect(warning).not.toContain('credential');
    });

    it('should return signed URLs for specific fileIds', async () => {
      mockUploadsRepository.findOriginalsByUploadIds.mockResolvedValue([
        makeUploadFile({ id: fileId1, uploadId: uploadId1, objectKey: 'k1' }),
        makeUploadFile({ id: fileId2, uploadId: uploadId2, objectKey: 'k2' }),
      ]);

      const result = await service.getExportDownloadUrls(
        {
          files: [
            { uploadId: uploadId1, fileId: fileId1 },
            { uploadId: uploadId2, fileId: fileId2 },
          ],
        },
        owner,
      );

      expect(result).toHaveLength(2);
      expect(result[0].downloadUrl).toBe('https://s3.example.com/dl');
      expect(result[1].downloadUrl).toBe('https://s3.example.com/dl');
      expect(mockStorageService.getPresignedGetUrl).toHaveBeenCalledTimes(2);
    });

    it('should return signed URLs for all files when fileId is omitted', async () => {
      mockUploadsRepository.findOriginalsByUploadIds.mockResolvedValue([
        makeUploadFile({ id: 'f1', uploadId: uploadId1, imageIndex: 0, objectKey: 'k1' }),
        makeUploadFile({ id: 'f2', uploadId: uploadId1, imageIndex: 1, objectKey: 'k2' }),
      ]);

      const result = await service.getExportDownloadUrls(
        { files: [{ uploadId: uploadId1 }] },
        owner,
      );

      expect(result).toHaveLength(2);
      expect(mockStorageService.getPresignedGetUrl).toHaveBeenCalledTimes(2);
    });

    it('should allow admin to export any upload', async () => {
      mockUploadsRepository.listByIds.mockResolvedValue([
        makeUpload({ id: uploadId1, userId: 'other-user', status: 'ready' }),
      ]);
      mockUploadsRepository.findOriginalsByUploadIds.mockResolvedValue([
        makeUploadFile({ id: fileId1, uploadId: uploadId1, objectKey: 'k' }),
      ]);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://s3.example.com/dl',
        expiresAt: new Date(),
      });
      mockAuditRepository.create.mockResolvedValue({});

      const result = await service.getExportDownloadUrls(
        { files: [{ uploadId: uploadId1, fileId: fileId1 }] },
        admin,
      );

      // Admin bypasses owner/access-grant checks
      expect(result).toHaveLength(1);
      expect(mockUploadsRepository.listByIds).toHaveBeenCalled();
      // Should not call hasAnyActiveGrantForUpload for admin
    });

    it('should throw NotFoundException when upload is not ready', async () => {
      mockUploadsRepository.listByIds.mockResolvedValue([
        makeUpload({ id: uploadId1, status: 'draft' }),
      ]);

      await expect(
        service.getExportDownloadUrls({ files: [{ uploadId: uploadId1, fileId: fileId1 }] }, owner),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when user is not authorized for upload', async () => {
      mockUploadsRepository.listByIds.mockResolvedValue([
        makeUpload({ id: uploadId1, userId: 'other-user', status: 'ready' }),
      ]);
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);

      await expect(
        service.getExportDownloadUrls(
          { files: [{ uploadId: uploadId1, fileId: fileId1 }] },
          otherUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should write audit event for batch export', async () => {
      mockUploadsRepository.findOriginalsByUploadIds.mockResolvedValue([
        makeUploadFile({ id: fileId1, uploadId: uploadId1, objectKey: 'k' }),
      ]);

      await service.getExportDownloadUrls(
        { files: [{ uploadId: uploadId1, fileId: fileId1 }] },
        owner,
      );

      expect(mockAuditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'export_urls_issued' }),
      );
    });

    it('should throw BadRequestException when batch exceeds max uploads', async () => {
      const manyFiles = Array.from({ length: EXPORT_BATCH_MAX_SIZE + 1 }, (_, i) => ({
        uploadId: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
      }));

      await expect(service.getExportDownloadUrls({ files: manyFiles }, owner)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should accept batch exactly at max uploads limit', async () => {
      const manyUploads = Array.from({ length: EXPORT_BATCH_MAX_SIZE }, (_, i) =>
        makeUpload({
          id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
          status: 'ready',
        }),
      );
      mockUploadsRepository.listByIds.mockResolvedValue(manyUploads);
      mockUploadsRepository.findOriginalsByUploadIds.mockResolvedValue(
        manyUploads.map(({ id }) => makeUploadFile({ uploadId: id, id: `f-${id}` })),
      );
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://s3.example.com/dl',
        expiresAt: new Date(),
      });
      mockAuditRepository.create.mockResolvedValue({});

      const manyFiles = manyUploads.map((u) => ({ uploadId: u.id }));
      const result = await service.getExportDownloadUrls({ files: manyFiles }, owner);

      expect(result).toHaveLength(EXPORT_BATCH_MAX_SIZE);
    });

    it('rejects a requested file belonging to another upload before signing', async () => {
      mockUploadsRepository.findOriginalsByUploadIds.mockResolvedValue([
        makeUploadFile({ id: fileId1, uploadId: uploadId2 }),
      ]);
      await expect(
        service.getExportDownloadUrls(
          { files: [{ uploadId: uploadId1, fileId: fileId1 }, { uploadId: uploadId2 }] },
          owner,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(mockStorageService.getPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('preserves mixed request order and duplicate entries with one file query', async () => {
      mockUploadsRepository.findOriginalsByUploadIds.mockResolvedValue([
        makeUploadFile({ id: fileId1, uploadId: uploadId1 }),
        makeUploadFile({ id: fileId2, uploadId: uploadId2 }),
      ]);
      const result = await service.getExportDownloadUrls(
        {
          files: [
            { uploadId: uploadId2 },
            { uploadId: uploadId1, fileId: fileId1 },
            { uploadId: uploadId2, fileId: fileId2 },
          ],
        },
        owner,
      );
      expect(result.map((file) => file.fileId)).toEqual([fileId2, fileId1, fileId2]);
      expect(mockUploadsRepository.findOriginalsByUploadIds).toHaveBeenCalledTimes(1);
      expect(mockUploadsRepository.findOriginalsByUploadIds).toHaveBeenCalledWith([
        uploadId2,
        uploadId1,
      ]);
    });

    it('should return empty array when files array is empty', async () => {
      const result = await service.getExportDownloadUrls({ files: [] }, owner);

      expect(result).toEqual([]);
    });
  });

  // ── listUploads ──────────────────────────────────────────────────────

  describe('listUploads', () => {
    const ownerId = 'user-uuid-1';

    function queryHasParam(query: unknown, value: string): boolean {
      if (!query || typeof query !== 'object') return false;
      const candidate = query as { value?: unknown; queryChunks?: unknown[] };
      if (candidate.value === value) return true;
      return (candidate.queryChunks ?? []).some((chunk) => queryHasParam(chunk, value));
    }

    it('rejects unsupported upload list status values', () => {
      expect(() => uploadListSchema.parse({ status: 'processing' })).toThrow();
    });

    it('should return only ready, non-deleted uploads for owner', async () => {
      const enrichedRows = [makeEnrichedRow({ id: 'u1', userId: ownerId })];
      mockUploadsRepository.countWhere.mockResolvedValue(1);
      mockUploadsRepository.listWhereEnriched.mockResolvedValue(enrichedRows);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValue(new Map([['u1', 2]]));
      mockUploadsRepository.countPreviewsByUploadIds.mockResolvedValue(new Map());
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);

      const result = await service.listUploads({ limit: 20, offset: 0 }, owner);

      expect(result.uploads).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.uploads[0].id).toBe('u1');
      expect(result.uploads[0].status).toBe('ready');
      expect(result.uploads[0].fileCount).toBe(2);
      expect(result.uploads[0].userId).toBe(ownerId);
      expect(result.uploads[0].user).toEqual({ id: ownerId, fullName: 'Test Owner' });
      expect(result.uploads[0].propertyName).toBe('Fazenda Teste');
      expect(result.uploads[0].talhaoName).toBe('Talhao A');
      expect(result.uploads[0].cropTypeName).toBe('Soja');
      expect(result.uploads[0].estadioName).toBeNull();
    });

    it('should exclude non-ready uploads from results', async () => {
      mockUploadsRepository.countWhere.mockResolvedValue(0);
      mockUploadsRepository.listWhereEnriched.mockResolvedValue([]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValue(new Map());
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);

      const result = await service.listUploads({ limit: 20, offset: 0 }, owner);

      expect(result.total).toBe(0);
      expect(result.uploads).toHaveLength(0);
    });

    it('should include ready uploads granted via access projection', async () => {
      const enrichedRows = [
        makeEnrichedRow({ id: 'u1', userId: ownerId }),
        makeEnrichedRow({ id: 'u2', userId: 'other-uuid', userFullName: 'Other User' }),
      ];
      mockUploadsRepository.countWhere.mockResolvedValue(2);
      mockUploadsRepository.listWhereEnriched.mockResolvedValue(enrichedRows);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValue(
        new Map([
          ['u1', 1],
          ['u2', 1],
        ]),
      );
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(true);

      const result = await service.listUploads({ limit: 20, offset: 0 }, owner);

      expect(result.total).toBe(2);
      expect(result.uploads).toHaveLength(2);
    });

    it('should keep projected non-owner uploads restricted to ready status', async () => {
      mockUploadsRepository.countWhere.mockResolvedValue(0);
      mockUploadsRepository.listWhereEnriched.mockResolvedValue([]);
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(true);

      await service.listUploads({ limit: 20, offset: 0, status: 'draft' }, owner);

      const whereClause = mockUploadsRepository.countWhere.mock.calls[0][0];
      expect(queryHasParam(whereClause, 'draft')).toBe(true);
      expect(queryHasParam(whereClause, 'ready')).toBe(true);
    });

    it('should show all ready uploads for admin (no access filter)', async () => {
      const enrichedRows = [
        makeEnrichedRow({ id: 'u1', userId: 'other-uuid', userFullName: 'Other User' }),
        makeEnrichedRow({ id: 'u2', userId: 'yet-another-uuid', userFullName: 'Yet Another' }),
      ];
      mockUploadsRepository.countWhere.mockResolvedValue(2);
      mockUploadsRepository.listWhereEnriched.mockResolvedValue(enrichedRows);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValue(
        new Map([
          ['u1', 1],
          ['u2', 3],
        ]),
      );
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());

      const result = await service.listUploads({ limit: 20, offset: 0 }, admin);

      expect(result.total).toBe(2);
      expect(result.uploads).toHaveLength(2);
      // Admin should not call hasAnyActiveGrantForUpload
      expect(mockAccessRepository.hasAnyActiveGrantForUpload).not.toHaveBeenCalled();
    });

    it('should apply catalog filter (propertyId)', async () => {
      mockUploadsRepository.countWhere.mockResolvedValue(1);
      mockUploadsRepository.listWhereEnriched.mockResolvedValue([
        makeEnrichedRow({ id: 'u1', propertyId: 'prop-uuid-2' }),
      ]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValue(new Map([['u1', 1]]));
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);

      const result = await service.listUploads(
        { limit: 20, offset: 0, propertyId: 'prop-uuid-2' },
        owner,
      );

      expect(result.total).toBe(1);
      expect(result.uploads).toHaveLength(1);
    });

    it('should apply date filters (createdFrom/createdTo)', async () => {
      const fromDate = new Date('2025-01-01');
      mockUploadsRepository.countWhere.mockResolvedValue(0);
      mockUploadsRepository.listWhereEnriched.mockResolvedValue([]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValue(new Map());
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);

      const result = await service.listUploads(
        { limit: 20, offset: 0, createdFrom: fromDate, createdTo: new Date('2025-12-31') },
        owner,
      );

      expect(result.total).toBe(0);
    });

    it('should apply activity date filters', async () => {
      const fromDate = new Date('2025-06-01');
      const toDate = new Date('2025-06-30');
      mockUploadsRepository.countWhere.mockResolvedValue(1);
      mockUploadsRepository.listWhereEnriched.mockResolvedValue([makeEnrichedRow({ id: 'u1' })]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValue(new Map([['u1', 1]]));
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);

      const result = await service.listUploads(
        { limit: 20, offset: 0, activityFrom: fromDate, activityTo: toDate },
        owner,
      );

      expect(result.total).toBe(1);
    });

    it('should paginate with limit and offset', async () => {
      mockUploadsRepository.countWhere.mockResolvedValue(3);
      mockUploadsRepository.listWhereEnriched.mockResolvedValue([makeEnrichedRow({ id: 'u1' })]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValue(new Map([['u1', 1]]));
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);

      const result = await service.listUploads({ limit: 1, offset: 2 }, owner);

      expect(result.total).toBe(3);
      expect(result.uploads).toHaveLength(1);
      expect(result.limit).toBe(1);
      expect(result.offset).toBe(2);
    });

    it('should return empty list when no matching uploads exist', async () => {
      mockUploadsRepository.countWhere.mockResolvedValue(0);
      mockUploadsRepository.listWhereEnriched.mockResolvedValue([]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValue(new Map());
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);

      const result = await service.listUploads({ limit: 20, offset: 0 }, owner);

      expect(result.total).toBe(0);
      expect(result.uploads).toHaveLength(0);
    });

    it('should include previewFileId when a preview file exists', async () => {
      const enrichedRows = [makeEnrichedRow({ id: 'u1', userId: ownerId })];
      const previewFile = makeUploadFile({
        id: 'preview-file-1',
        uploadId: 'u1',
        variant: 'preview',
        imageIndex: 0,
      });
      mockUploadsRepository.countWhere.mockResolvedValue(1);
      mockUploadsRepository.listWhereEnriched.mockResolvedValue(enrichedRows);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValue(new Map([['u1', 2]]));
      mockUploadsRepository.countPreviewsByUploadIds.mockResolvedValue(new Map([['u1', 2]]));
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(
        new Map([['u1', previewFile]]),
      );
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);

      const result = await service.listUploads({ limit: 20, offset: 0 }, owner);

      expect(result.uploads[0].previewFileId).toBe('preview-file-1');
      expect(result.uploads[0].previewImageIndex).toBe(0);
      expect(result.uploads[0].previewCount).toBe(2);
    });

    it('should set previewFileId to null when no preview exists', async () => {
      const enrichedRows = [makeEnrichedRow({ id: 'u1', userId: ownerId })];
      mockUploadsRepository.countWhere.mockResolvedValue(1);
      mockUploadsRepository.listWhereEnriched.mockResolvedValue(enrichedRows);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValue(new Map([['u1', 2]]));
      mockUploadsRepository.countPreviewsByUploadIds.mockResolvedValue(new Map());
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);

      const result = await service.listUploads({ limit: 20, offset: 0 }, owner);

      expect(result.uploads[0].previewFileId).toBeNull();
      expect(result.uploads[0].previewImageIndex).toBeNull();
    });

    it('should apply userId filter', async () => {
      mockUploadsRepository.countWhere.mockResolvedValue(1);
      mockUploadsRepository.listWhereEnriched.mockResolvedValue([
        makeEnrichedRow({ id: 'u1', userId: 'target-user' }),
      ]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValue(new Map([['u1', 1]]));
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);

      const result = await service.listUploads(
        { limit: 20, offset: 0, userId: 'target-user' },
        admin,
      );

      expect(result.total).toBe(1);
    });

    it('should apply source filter', async () => {
      mockUploadsRepository.countWhere.mockResolvedValue(1);
      mockUploadsRepository.listWhereEnriched.mockResolvedValue([
        makeEnrichedRow({ id: 'u1', source: 'drone' }),
      ]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValue(new Map([['u1', 1]]));
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);

      const result = await service.listUploads({ limit: 20, offset: 0, source: 'drone' }, owner);

      expect(result.total).toBe(1);
      expect(result.uploads[0].source).toBe('drone');
    });

    it('should count through the enriched joins when searching', async () => {
      mockUploadsRepository.countWhereEnriched.mockResolvedValue(1);
      mockUploadsRepository.listWhereEnriched.mockResolvedValue([makeEnrichedRow({ id: 'u1' })]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValue(new Map([['u1', 1]]));
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);

      const result = await service.listUploads({ limit: 20, offset: 0, search: 'soja' }, owner);

      expect(result.total).toBe(1);
      expect(mockUploadsRepository.countWhereEnriched).toHaveBeenCalledTimes(1);
      expect(mockUploadsRepository.countWhere).not.toHaveBeenCalled();
    });

    it('should not use the enriched count without a search term', async () => {
      mockUploadsRepository.countWhere.mockResolvedValue(1);
      mockUploadsRepository.listWhereEnriched.mockResolvedValue([makeEnrichedRow({ id: 'u1' })]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValue(new Map([['u1', 1]]));
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);

      await service.listUploads({ limit: 20, offset: 0 }, owner);

      expect(mockUploadsRepository.countWhere).toHaveBeenCalledTimes(1);
      expect(mockUploadsRepository.countWhereEnriched).not.toHaveBeenCalled();
    });

    describe('buildUploadSearchCondition', () => {
      // Renders a drizzle SQL fragment roughly the way the pg driver would:
      // literal SQL text kept, driver params replaced with '?'.
      function render(value: unknown): string {
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return value.map(render).join('');
        if (value && typeof value === 'object') {
          const candidate = value as { queryChunks?: unknown[]; value?: unknown };
          if (Array.isArray(candidate.queryChunks)) {
            return candidate.queryChunks.map(render).join('');
          }
          if ('value' in candidate) {
            return render(candidate.value);
          }
        }
        return '?';
      }

      it('escapes LIKE metacharacters and matches case-insensitively', () => {
        const condition = buildUploadSearchCondition('Fazenda_50%\\a');
        const rendered = render(condition);

        expect(rendered).toContain('ilike');
        expect(rendered).toContain('%Fazenda\\_50\\%\\\\a%');
        expect(rendered).not.toContain('%Fazenda_50%\\a%');
      });
    });
  });

  // ── getDashboardSnapshot ──────────────────────────────────────────

  describe('getDashboardSnapshot', () => {
    const ownerId = 'user-uuid-1';

    it('should return dashboard counts for owner', async () => {
      // First listUploads call (recent): returns 3 uploads
      mockUploadsRepository.countWhere.mockResolvedValueOnce(3);
      mockUploadsRepository.listWhereEnriched.mockResolvedValueOnce([
        makeEnrichedRow({ id: 'u1', userId: ownerId, source: 'phone' }),
        makeEnrichedRow({ id: 'u2', userId: ownerId, source: 'phone' }),
        makeEnrichedRow({ id: 'u3', userId: ownerId, source: 'drone' }),
      ]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValueOnce(
        new Map([
          ['u1', 2],
          ['u2', 1],
          ['u3', 3],
        ]),
      );
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());
      // Second listUploads call (today): returns 1 upload
      mockUploadsRepository.countWhere.mockResolvedValueOnce(1);
      mockUploadsRepository.listWhereEnriched.mockResolvedValueOnce([
        makeEnrichedRow({ id: 'u1', userId: ownerId }),
      ]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValueOnce(new Map([['u1', 2]]));

      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);
      mockCatalogRepository.countProperties.mockResolvedValue(2);
      mockCatalogRepository.countTalhoes.mockResolvedValue(1);
      mockCatalogRepository.countCropTypes.mockResolvedValue(1);
      mockCatalogRepository.countEstadios.mockResolvedValue(0);

      const result = await service.getDashboardSnapshot(owner);

      expect(result.totalUploads).toBe(3);
      expect(result.uploadsToday).toBe(1);
      expect(result.sourceBreakdown).toEqual({ drone: 1, phone: 2, mixed: 0 });
      expect(result.recentUploads).toHaveLength(3);
      expect(result.recentUploads[0].imageCount).toBeGreaterThanOrEqual(1);
      expect(result.catalogCounts).toEqual({
        properties: 2,
        talhoes: 1,
        cropTypes: 1,
        estadios: 0,
      });
    });

    it('should show all uploads for admin (no access filter)', async () => {
      // Recent
      mockUploadsRepository.countWhere.mockResolvedValueOnce(5);
      mockUploadsRepository.listWhereEnriched.mockResolvedValueOnce([
        makeEnrichedRow({ id: 'u1', userId: 'other', source: 'drone', userFullName: 'Other' }),
      ]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValueOnce(new Map([['u1', 1]]));
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());
      // Today
      mockUploadsRepository.countWhere.mockResolvedValueOnce(0);
      mockUploadsRepository.listWhereEnriched.mockResolvedValueOnce([]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValueOnce(new Map());

      mockCatalogRepository.countProperties.mockResolvedValue(0);
      mockCatalogRepository.countTalhoes.mockResolvedValue(0);
      mockCatalogRepository.countCropTypes.mockResolvedValue(0);
      mockCatalogRepository.countEstadios.mockResolvedValue(0);

      const result = await service.getDashboardSnapshot(admin);

      expect(result.totalUploads).toBe(5);
      expect(mockAccessRepository.hasAnyActiveGrantForUpload).not.toHaveBeenCalled();
    });

    it('should return zero counts when uploads have not been created yet', async () => {
      // Recent
      mockUploadsRepository.countWhere.mockResolvedValueOnce(0);
      mockUploadsRepository.listWhereEnriched.mockResolvedValueOnce([]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValueOnce(new Map());
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());
      // Today
      mockUploadsRepository.countWhere.mockResolvedValueOnce(0);
      mockUploadsRepository.listWhereEnriched.mockResolvedValueOnce([]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValueOnce(new Map());

      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);
      mockCatalogRepository.countProperties.mockResolvedValue(0);
      mockCatalogRepository.countTalhoes.mockResolvedValue(0);
      mockCatalogRepository.countCropTypes.mockResolvedValue(0);
      mockCatalogRepository.countEstadios.mockResolvedValue(0);

      const result = await service.getDashboardSnapshot(owner);

      expect(result.totalUploads).toBe(0);
      expect(result.uploadsToday).toBe(0);
      expect(result.sourceBreakdown).toEqual({ drone: 0, phone: 0, mixed: 0 });
      expect(result.recentUploads).toHaveLength(0);
      expect(result.catalogCounts).toEqual({
        properties: 0,
        talhoes: 0,
        cropTypes: 0,
        estadios: 0,
      });
    });

    it('should compute uploadsToday using created_at >= today 00:00 semantics', async () => {
      // Recent
      mockUploadsRepository.countWhere.mockResolvedValueOnce(0);
      mockUploadsRepository.listWhereEnriched.mockResolvedValueOnce([]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValueOnce(new Map());
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());
      // Today
      mockUploadsRepository.countWhere.mockResolvedValueOnce(2);
      mockUploadsRepository.listWhereEnriched.mockResolvedValueOnce([
        makeEnrichedRow({ id: 'today1', userId: ownerId }),
        makeEnrichedRow({ id: 'today2', userId: ownerId }),
      ]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValueOnce(
        new Map([
          ['today1', 1],
          ['today2', 1],
        ]),
      );

      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);
      mockCatalogRepository.countProperties.mockResolvedValue(0);
      mockCatalogRepository.countTalhoes.mockResolvedValue(0);
      mockCatalogRepository.countCropTypes.mockResolvedValue(0);
      mockCatalogRepository.countEstadios.mockResolvedValue(0);

      const result = await service.getDashboardSnapshot(owner);

      expect(result.uploadsToday).toBe(2);
      expect(result.totalUploads).toBe(0);
    });

    it('should limit recentUploads to 5 items', async () => {
      const manyEnrichedRows = Array.from({ length: 10 }, (_, i) =>
        makeEnrichedRow({ id: `u${i}`, userId: ownerId }),
      );
      // Recent
      mockUploadsRepository.countWhere.mockResolvedValueOnce(10);
      mockUploadsRepository.listWhereEnriched.mockResolvedValueOnce(manyEnrichedRows);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValueOnce(
        new Map(manyEnrichedRows.map((u) => [u.id, 1])),
      );
      mockUploadsRepository.findFirstPreviewByUploadIds.mockResolvedValue(new Map());
      // Today
      mockUploadsRepository.countWhere.mockResolvedValueOnce(0);
      mockUploadsRepository.listWhereEnriched.mockResolvedValueOnce([]);
      mockUploadsRepository.countOriginalsByUploadIds.mockResolvedValueOnce(new Map());

      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(false);
      mockCatalogRepository.countProperties.mockResolvedValue(0);
      mockCatalogRepository.countTalhoes.mockResolvedValue(0);
      mockCatalogRepository.countCropTypes.mockResolvedValue(0);
      mockCatalogRepository.countEstadios.mockResolvedValue(0);

      const result = await service.getDashboardSnapshot(owner);

      expect(result.recentUploads).toHaveLength(5);
    });
  });

  // ── getExportDownloadUrls (batch-size/audit edge cases) ─────────

  describe('getExportDownloadUrls (edge cases)', () => {
    const uploadId1 = 'upload-uuid-1';
    const fileId1 = 'file-uuid-1';

    it('should write audit event with uploadIds and file count metadata', async () => {
      mockUploadsRepository.listByIds.mockResolvedValue([
        makeUpload({ id: uploadId1, status: 'ready' }),
      ]);
      mockUploadsRepository.findOriginalsByUploadIds.mockResolvedValue([
        makeUploadFile({ id: fileId1, uploadId: uploadId1, objectKey: 'k' }),
      ]);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://s3.example.com/dl',
        expiresAt: new Date('2025-06-15T12:00:00Z'),
      });
      mockAuditRepository.create.mockResolvedValue({});

      await service.getExportDownloadUrls(
        { files: [{ uploadId: uploadId1, fileId: fileId1 }] },
        owner,
      );

      expect(mockAuditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'export_urls_issued',
          resourceType: 'upload',
          metadata: expect.objectContaining({
            uploadIds: [uploadId1],
            fileIds: [fileId1],
            count: 1,
          }),
        }),
      );
    });

    it('should handle multiple uploads and count total files in audit metadata', async () => {
      mockUploadsRepository.listByIds.mockResolvedValue([
        makeUpload({ id: 'u1', status: 'ready' }),
        makeUpload({ id: 'u2', userId: 'other-user-uuid', status: 'ready' }),
      ]);
      mockAccessRepository.hasAnyActiveGrantForUpload.mockResolvedValue(true);
      mockUploadsRepository.findOriginalsByUploadIds.mockResolvedValue([
        makeUploadFile({ id: 'f1', uploadId: 'u1', objectKey: 'k1' }),
        makeUploadFile({ id: 'f2', uploadId: 'u2', objectKey: 'k2' }),
      ]);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://s3.example.com/dl',
        expiresAt: new Date(),
      });
      mockAuditRepository.create.mockResolvedValue({});

      const result = await service.getExportDownloadUrls(
        {
          files: [
            { uploadId: 'u1', fileId: 'f1' },
            { uploadId: 'u2', fileId: 'f2' },
          ],
        },
        otherUser,
      );

      expect(result).toHaveLength(2);
      expect(mockAuditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'export_urls_issued',
          metadata: expect.objectContaining({
            uploadIds: ['u1', 'u2'],
            count: 2,
          }),
        }),
      );
    });

    it('should fail open (return URLs) even when audit fails', async () => {
      mockUploadsRepository.listByIds.mockResolvedValue([
        makeUpload({ id: uploadId1, status: 'ready' }),
      ]);
      mockUploadsRepository.findOriginalsByUploadIds.mockResolvedValue([
        makeUploadFile({ id: fileId1, uploadId: uploadId1, objectKey: 'k' }),
      ]);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://s3.example.com/dl',
        expiresAt: new Date(),
      });
      mockAuditRepository.create.mockRejectedValue(new Error('Audit DB error'));

      const result = await service.getExportDownloadUrls(
        { files: [{ uploadId: uploadId1, fileId: fileId1 }] },
        owner,
      );

      // Should still return URLs even if audit fails
      expect(result).toHaveLength(1);
      expect(result[0].downloadUrl).toBeDefined();
    });
  });

  // ── deleteUpload ─────────────────────────────────────────────────────

  describe('deleteUpload', () => {
    const uploadId = 'upload-uuid-1';

    it('should soft-delete upload and enqueue deletion jobs', async () => {
      const upload = makeUpload({ status: 'ready' });
      const files = [
        makeUploadFile({ id: 'file-1', objectKey: 'key/original.jpg', variant: 'original' }),
        makeUploadFile({ id: 'file-2', objectKey: 'key/preview.jpg', variant: 'preview' }),
      ];
      mockUploadsRepository.findByIdAnyStatus
        .mockResolvedValueOnce(upload) // first call in deleteUpload
        .mockResolvedValueOnce({ ...upload, deletedAt: new Date() }); // after soft-delete
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue(files);
      mockUploadsRepository.softDeleteAndEnqueueObjects.mockResolvedValue({ deleted: true, files });
      mockAuditRepository.create.mockResolvedValue({});

      const result = await service.deleteUpload(uploadId, owner);

      expect(mockUploadsRepository.softDeleteAndEnqueueObjects).toHaveBeenCalledWith(
        uploadId,
        expect.any(Date),
        { actorUserId: owner.sub },
      );
      expect(result).toEqual({
        id: uploadId,
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
        deletedAt: expect.any(Date),
      });
      expect(() => JSON.stringify(result)).not.toThrow();
    });

    it('should allow admin to delete any upload', async () => {
      const upload = makeUpload({ userId: 'other-user', status: 'ready' });
      mockUploadsRepository.findByIdAnyStatus
        .mockResolvedValueOnce(upload)
        .mockResolvedValueOnce({ ...upload, deletedAt: new Date() });
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([]);
      mockUploadsRepository.softDeleteAndEnqueueObjects.mockResolvedValue({
        deleted: true,
        files: [],
      });
      mockAuditRepository.create.mockResolvedValue({});

      const result = await service.deleteUpload(uploadId, admin);
      expect(result).toEqual({
        id: uploadId,
        clientUploadId: 'client-upload-1',
        userId: 'other-user',
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
        deletedAt: expect.any(Date),
      });
      expect(() => JSON.stringify(result)).not.toThrow();
    });

    it('should throw NotFoundException when upload does not exist', async () => {
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(undefined);

      await expect(service.deleteUpload('nonexistent', owner)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when upload is already deleted', async () => {
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(
        makeUpload({ deletedAt: new Date() }),
      );

      await expect(service.deleteUpload(uploadId, owner)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when projected allowed user tries to delete', async () => {
      const upload = makeUpload({ userId: 'different-user', status: 'ready' });
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(upload);

      await expect(service.deleteUpload(uploadId, otherUser)).rejects.toThrow(ForbiddenException);
    });

    it('should handle upload with no files gracefully', async () => {
      const upload = makeUpload({ status: 'ready' });
      mockUploadsRepository.findByIdAnyStatus
        .mockResolvedValueOnce(upload)
        .mockResolvedValueOnce({ ...upload, deletedAt: new Date() });
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([]);
      mockUploadsRepository.softDeleteAndEnqueueObjects.mockResolvedValue({
        deleted: true,
        files: [],
      });
      mockAuditRepository.create.mockResolvedValue({});

      const result = await service.deleteUpload(uploadId, owner);
      expect(result).toEqual({
        id: uploadId,
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
        deletedAt: expect.any(Date),
      });
      expect(() => JSON.stringify(result)).not.toThrow();
    });
  });
});
