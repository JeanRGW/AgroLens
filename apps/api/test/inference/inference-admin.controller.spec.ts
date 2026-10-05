import { Test, TestingModule } from '@nestjs/testing';
import { InferenceAdminController } from '../../src/inference/inference-admin.controller';
import { InferenceModelService } from '../../src/inference/inference-model.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/auth/guards/roles.guard';
import type { AuthenticatedUser } from '../../src/auth/guards/jwt-auth.guard';

function makeAdminUser(): AuthenticatedUser {
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
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

describe('InferenceAdminController', () => {
  let controller: InferenceAdminController;

  const mockInferenceModelService = {
    initModel: jest.fn(),
    completeModel: jest.fn(),
    listModels: jest.fn(),
    updateModel: jest.fn(),
    setActiveModel: jest.fn(),
    deleteModel: jest.fn(),
  };

  const mockJwtGuard = { canActivate: jest.fn(() => true) };
  const mockRolesGuard = { canActivate: jest.fn(() => true) };

  const adminUser = makeAdminUser();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InferenceAdminController],
      providers: [{ provide: InferenceModelService, useValue: mockInferenceModelService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    controller = module.get<InferenceAdminController>(InferenceAdminController);
  });

  describe('initModel', () => {
    it('should delegate to service', async () => {
      const dto = { name: 'My Model', description: 'test' };
      const expected = {
        modelId: 'm1',
        status: 'uploading',
        presignedUrl: 'https://...',
        objectKey: 'key',
        expiresAt: new Date(),
      };
      mockInferenceModelService.initModel.mockResolvedValue(expected);

      const result = await controller.initModel(dto, adminUser);
      expect(result).toEqual(expected);
    });
  });

  describe('completeModel', () => {
    it('should delegate to service', async () => {
      const expected = { id: 'm1', status: 'validating' };
      mockInferenceModelService.completeModel.mockResolvedValue(expected as any);

      const result = await controller.completeModel('model-uuid-1', adminUser);
      expect(result).toEqual(expected);
    });
  });

  describe('listModels', () => {
    it('should delegate to service', async () => {
      const expected = [{ id: 'm1' }];
      mockInferenceModelService.listModels.mockResolvedValue(expected as any);

      const result = await controller.listModels(adminUser);
      expect(result).toEqual(expected);
    });
  });

  describe('updateModel', () => {
    it('should delegate to service', async () => {
      const dto = { name: 'New Name' };
      const expected = { id: 'm1', name: 'New Name' };
      mockInferenceModelService.updateModel.mockResolvedValue(expected as any);

      const result = await controller.updateModel('model-uuid-1', dto, adminUser);
      expect(result).toEqual(expected);
    });
  });

  describe('setActiveModel', () => {
    it('should delegate to service', async () => {
      const dto = { active: true };
      const expected = { id: 'm1', active: true };
      mockInferenceModelService.setActiveModel.mockResolvedValue(expected as any);

      const result = await controller.setActiveModel('model-uuid-1', dto, adminUser);
      expect(result).toEqual(expected);
    });
  });

  describe('deleteModel', () => {
    it('should delegate to service', async () => {
      const expected = { id: 'm1', status: 'ready' };
      mockInferenceModelService.deleteModel.mockResolvedValue(expected as any);

      const result = await controller.deleteModel('model-uuid-1', adminUser);
      expect(result).toEqual(expected);
    });
  });
});
