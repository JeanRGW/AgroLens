import { Test, TestingModule } from '@nestjs/testing';
import { AdminJobsController } from '../../src/worker/admin-jobs.controller';
import { AdminJobsService } from '../../src/worker/admin-jobs.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/auth/guards/roles.guard';
import { ROLES_KEY } from '../../src/auth/decorators/roles.decorator';

describe('AdminJobsController', () => {
  let controller: AdminJobsController;

  const mockService = {
    listDeadJobs: jest.fn(),
    retryDeadJob: jest.fn(),
  };

  const mockGuard = { canActivate: jest.fn(() => true) };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminJobsController],
      providers: [{ provide: AdminJobsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<AdminJobsController>(AdminJobsController);
  });

  it('should require the admin role at the controller level', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminJobsController)).toEqual(['admin']);
  });

  it('should list dead jobs', async () => {
    mockService.listDeadJobs.mockResolvedValue([{ queue: 'upload_finalization', id: 'x' }]);

    const result = await controller.listDeadJobs();
    expect(result).toEqual({ jobs: [{ queue: 'upload_finalization', id: 'x' }] });
  });

  it('should retry a dead job with the acting admin', async () => {
    const admin = { sub: 'a1', role: 'admin' } as any;
    mockService.retryDeadJob.mockResolvedValue(undefined);

    const result = await controller.retryDeadJob('object_deletion' as any, 'abc-123-def', admin);

    expect(result).toEqual({ message: 'Job requeued for retry' });
    expect(mockService.retryDeadJob).toHaveBeenCalledWith('object_deletion', 'abc-123-def', admin);
  });
});
