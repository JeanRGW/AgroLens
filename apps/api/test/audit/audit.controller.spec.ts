import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from '../../src/audit/audit.controller';
import { AuditService } from '../../src/audit/audit.service';
import { AuditRepository } from '../../src/database/repositories';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/auth/guards/roles.guard';

function makeAuditEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'audit-uuid-1',
    eventType: 'role_change',
    actorUserId: 'actor-uuid',
    targetUserId: 'target-uuid',
    resourceType: null,
    resourceId: null,
    before: null,
    after: { role: 'admin' },
    metadata: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date('2025-06-30'),
    ...overrides,
  };
}

describe('AuditController', () => {
  let controller: AuditController;

  const mockAuditService = {
    listEvents: jest.fn(),
  };

  // Mock guards to always pass (we test auth in integration/e2e)
  const mockJwtGuard = { canActivate: jest.fn(() => true) };
  const mockRolesGuard = { canActivate: jest.fn(() => true) };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        { provide: AuditService, useValue: mockAuditService },
        { provide: AuditRepository, useValue: { findMany: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    controller = module.get<AuditController>(AuditController);
  });

  describe('listEvents', () => {
    it('should return events and total wrapped in object', async () => {
      const events = [makeAuditEvent()];
      mockAuditService.listEvents.mockResolvedValue({
        items: events,
        total: 1,
        limit: 100,
        offset: 0,
      });

      const result = await controller.listEvents({
        actorUserId: undefined,
        targetUserId: undefined,
        resourceType: undefined,
        resourceId: undefined,
        eventType: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        limit: 100,
        offset: 0,
        page: 1,
        pageSize: 100,
      });

      expect(result).toEqual({ items: events, total: 1, limit: 100, offset: 0 });
    });

    it('should pass query parameters to service', async () => {
      mockAuditService.listEvents.mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 });

      await controller.listEvents({
        actorUserId: 'actor-uuid',
        targetUserId: undefined,
        resourceType: undefined,
        resourceId: undefined,
        eventType: 'access_grant',
        dateFrom: undefined,
        dateTo: undefined,
        limit: 50,
        offset: 10,
        page: 1,
        pageSize: 50,
      });

      expect(mockAuditService.listEvents).toHaveBeenCalledWith({
        actorUserId: 'actor-uuid',
        targetUserId: undefined,
        resourceType: undefined,
        resourceId: undefined,
        eventType: 'access_grant',
        dateFrom: undefined,
        dateTo: undefined,
        limit: 50,
        offset: 10,
        page: 1,
        pageSize: 50,
      });
    });

    it('should use default limit and offset when not provided', async () => {
      // ZodValidationPipe applies defaults before reaching controller
      mockAuditService.listEvents.mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 });

      await controller.listEvents({
        actorUserId: undefined,
        targetUserId: undefined,
        resourceType: undefined,
        resourceId: undefined,
        eventType: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        limit: 100,
        offset: 0,
        page: 1,
        pageSize: 100,
      });

      expect(mockAuditService.listEvents).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100, offset: 0 }),
      );
    });
  });
});
