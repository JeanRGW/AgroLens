import { Test, TestingModule } from '@nestjs/testing';
import { UploadsController } from '../../src/uploads/uploads.controller';
import { UploadsService } from '../../src/uploads/uploads.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../src/auth/guards/jwt-auth.guard';

function makeCurrentUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    sub: 'user-uuid-1',
    email: 'owner@example.com',
    role: 'user',
    userRecord: {
      id: 'user-uuid-1',
      email: 'owner@example.com',
      fullName: 'Owner',
      phone: null,
      role: 'user',
      disabledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...overrides,
  };
}

describe('UploadsController', () => {
  let controller: UploadsController;

  const mockUploadsService = {
    initUpload: jest.fn(),
    completeUpload: jest.fn(),
    listUploads: jest.fn(),
    getDashboardSnapshot: jest.fn(),
    getUploadDetail: jest.fn(),
    getFileDownloadUrl: jest.fn(),
    getFilePreviewUrl: jest.fn(),
    getExportDownloadUrls: jest.fn(),
    resolveDisplayUrls: jest.fn(),
    deleteUpload: jest.fn(),
  };

  const mockJwtGuard = { canActivate: jest.fn(() => true) };

  const currentUser = makeCurrentUser();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [{ provide: UploadsService, useValue: mockUploadsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtGuard)
      .compile();

    controller = module.get<UploadsController>(UploadsController);
  });

  describe('initUpload', () => {
    it('should call service and return result directly', async () => {
      const expected = { uploadId: 'u1', status: 'draft', files: [] };
      mockUploadsService.initUpload.mockResolvedValue(expected);
      const dto = { clientUploadId: 'c1', propertyId: 'p1' } as any;

      const result = await controller.initUpload(dto, currentUser);
      expect(result).toEqual(expected);
      expect(mockUploadsService.initUpload).toHaveBeenCalledWith(dto, currentUser);
    });

    it('should pass Zod-validated DTO to service', async () => {
      const dto = { clientUploadId: 'c1', files: [{ contentType: 'image/jpeg' }] } as any;
      mockUploadsService.initUpload.mockResolvedValue({
        uploadId: 'u1',
        status: 'draft',
        files: [],
      });

      await controller.initUpload(dto, currentUser);
      expect(mockUploadsService.initUpload).toHaveBeenCalledWith(dto, currentUser);
    });
  });

  describe('completeUpload', () => {
    it('should call service and return upload wrapped in object', async () => {
      const upload = { id: 'u1', status: 'finalizing' };
      mockUploadsService.completeUpload.mockResolvedValue(upload);

      const result = await controller.completeUpload('u1', currentUser);
      expect(result).toEqual({ upload });
      expect(() => JSON.stringify(result)).not.toThrow();
      expect(mockUploadsService.completeUpload).toHaveBeenCalledWith('u1', currentUser);
    });
  });

  describe('listUploads', () => {
    it('should call service with Zod-validated query DTO', async () => {
      const expected = { uploads: [], total: 0, limit: 20, offset: 0 };
      mockUploadsService.listUploads.mockResolvedValue(expected);
      const dto = { limit: 20, offset: 0 } as any;

      const result = await controller.listUploads(dto, currentUser);
      expect(result).toEqual(expected);
      expect(mockUploadsService.listUploads).toHaveBeenCalledWith(dto, currentUser);
    });
  });

  describe('getDashboardSnapshot', () => {
    it('should call service and return dashboard snapshot', async () => {
      const expected = {
        totalUploads: 0,
        uploadsToday: 0,
        sourceBreakdown: { drone: 0, phone: 0, mixed: 0 },
        recentUploads: [],
        catalogCounts: { properties: 0, talhoes: 0, cropTypes: 0, estadios: 0 },
      };
      mockUploadsService.getDashboardSnapshot.mockResolvedValue(expected);

      const result = await controller.getDashboardSnapshot(currentUser);
      expect(result).toEqual(expected);
      expect(mockUploadsService.getDashboardSnapshot).toHaveBeenCalledWith(currentUser);
    });
  });

  describe('getUploadDetail', () => {
    it('should return service result directly', async () => {
      const detail = { id: 'u1', files: [] };
      mockUploadsService.getUploadDetail.mockResolvedValue(detail as any);

      const result = await controller.getUploadDetail('u1', currentUser);
      expect(result).toEqual(detail);
      expect(mockUploadsService.getUploadDetail).toHaveBeenCalledWith('u1', currentUser);
    });
  });

  describe('getFileDownloadUrl', () => {
    it('should call service with uploadId, fileId, and user', async () => {
      const expected = { downloadUrl: 'https://s3.example.com/dl', fileId: 'f1' };
      mockUploadsService.getFileDownloadUrl.mockResolvedValue(expected as any);

      const result = await controller.getFileDownloadUrl('u1', 'f1', currentUser);
      expect(result).toEqual(expected);
      expect(mockUploadsService.getFileDownloadUrl).toHaveBeenCalledWith('u1', 'f1', currentUser);
    });
  });

  describe('getFilePreviewUrl', () => {
    it('should call service with uploadId, fileId, and user', async () => {
      const expected = { downloadUrl: 'https://s3.example.com/preview', fileId: 'f1' };
      mockUploadsService.getFilePreviewUrl.mockResolvedValue(expected as any);

      const result = await controller.getFilePreviewUrl('u1', 'f1', currentUser);
      expect(result).toEqual(expected);
      expect(mockUploadsService.getFilePreviewUrl).toHaveBeenCalledWith('u1', 'f1', currentUser);
    });
  });

  describe('getExportDownloadUrls', () => {
    it('should call service with Zod-validated body and return result', async () => {
      const expected = [{ downloadUrl: 'https://s3.example.com/dl', fileId: 'f1' }];
      mockUploadsService.getExportDownloadUrls.mockResolvedValue(expected as any);
      const dto = { files: [{ uploadId: 'u1', fileId: 'f1' }] } as any;

      const result = await controller.getExportDownloadUrls(dto, currentUser);
      expect(result).toEqual(expected);
      expect(mockUploadsService.getExportDownloadUrls).toHaveBeenCalledWith(dto, currentUser);
    });
  });

  describe('deleteUpload', () => {
    it('should call service and return upload wrapped in object', async () => {
      const upload = { id: 'u1', status: 'ready' };
      mockUploadsService.deleteUpload.mockResolvedValue(upload);

      const result = await controller.deleteUpload('u1', currentUser);
      expect(result).toEqual({ upload });
      expect(() => JSON.stringify(result)).not.toThrow();
      expect(mockUploadsService.deleteUpload).toHaveBeenCalledWith('u1', currentUser);
    });
  });

  describe('getDisplayUrls', () => {
    it('should call service with uploadId and user and return result', async () => {
      const expected = {
        files: { f1: { fileId: 'f1', variant: 'original', url: 'https://s3.example.com/dl' } },
      };
      mockUploadsService.resolveDisplayUrls.mockResolvedValue(expected as any);

      const result = await controller.getDisplayUrls('u1', currentUser);
      expect(result).toEqual(expected);
      expect(mockUploadsService.resolveDisplayUrls).toHaveBeenCalledWith('u1', currentUser);
    });
  });
});
