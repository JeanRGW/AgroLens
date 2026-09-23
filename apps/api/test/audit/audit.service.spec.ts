import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../src/audit/audit.service';
import { AuditRepository } from '../../src/database/repositories';
import type { ListAuditQueryDto } from '../../src/audit/dto/list-audit-query.dto';

// ── Helpers ──────────────────────────────────────────────────────────

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

function makeQuery(overrides: Partial<ListAuditQueryDto> = {}): ListAuditQueryDto {
  return {
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
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('AuditService', () => {
  let service: AuditService;

  const mockAuditRepository = {
    create: jest.fn(),
    findById: jest.fn(),
    findMany: jest.fn(),
    findResourceNames: jest.fn().mockResolvedValue(new Map()),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: AuditRepository, useValue: mockAuditRepository }],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  describe('listEvents', () => {
    it('should return events and total when no filters are provided', async () => {
      const events = [makeAuditEvent(), makeAuditEvent({ id: 'audit-2' })];
      mockAuditRepository.findMany.mockResolvedValue([events, 2]);

      const result = await service.listEvents(makeQuery());

      expect(result.items).toEqual(events.map((event) => ({ ...event, resourceName: null })));
      expect(result.total).toBe(2);
      expect(mockAuditRepository.findMany).toHaveBeenCalledWith({
        actorUserId: undefined,
        targetUserId: undefined,
        resourceType: undefined,
        resourceId: undefined,
        eventType: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        limit: 100,
        offset: 0,
      });
    });

    it('should attach resolved resource names to events', async () => {
      const events = [
        makeAuditEvent({ resourceType: 'property', resourceId: 'prop-uuid' }),
        makeAuditEvent({ id: 'audit-2', resourceType: 'upload', resourceId: 'upload-uuid' }),
      ];
      mockAuditRepository.findMany.mockResolvedValue([events, 2]);
      mockAuditRepository.findResourceNames.mockResolvedValue(
        new Map([['property:prop-uuid', 'Fazenda Modelo']]),
      );

      const result = await service.listEvents(makeQuery());

      expect(mockAuditRepository.findResourceNames).toHaveBeenCalledWith([
        { resourceType: 'property', resourceId: 'prop-uuid' },
        { resourceType: 'upload', resourceId: 'upload-uuid' },
      ]);
      expect(result.items).toEqual([
        { ...events[0], resourceName: 'Fazenda Modelo' },
        { ...events[1], resourceName: null },
      ]);
    });

    it('should pass actorUserId filter to repository', async () => {
      const events = [makeAuditEvent()];
      mockAuditRepository.findMany.mockResolvedValue([events, 1]);

      const result = await service.listEvents(makeQuery({ actorUserId: 'actor-uuid' }));

      expect(result.items).toEqual(events.map((event) => ({ ...event, resourceName: null })));
      expect(result.total).toBe(1);
      expect(mockAuditRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ actorUserId: 'actor-uuid' }),
      );
    });

    it('should pass targetUserId filter to repository', async () => {
      mockAuditRepository.findMany.mockResolvedValue([[], 0]);

      const result = await service.listEvents(makeQuery({ targetUserId: 'target-uuid' }));

      expect(result.total).toBe(0);
      expect(mockAuditRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ targetUserId: 'target-uuid' }),
      );
    });

    it('should pass resourceType and resourceId filters to repository', async () => {
      mockAuditRepository.findMany.mockResolvedValue([[], 0]);

      await service.listEvents(makeQuery({ resourceType: 'upload', resourceId: 'res-uuid' }));

      expect(mockAuditRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ resourceType: 'upload', resourceId: 'res-uuid' }),
      );
    });

    it('should pass eventType filter to repository', async () => {
      mockAuditRepository.findMany.mockResolvedValue([[], 0]);

      await service.listEvents(makeQuery({ eventType: 'access_grant' }));

      expect(mockAuditRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'access_grant' }),
      );
    });

    it('should pass limit and offset to repository', async () => {
      mockAuditRepository.findMany.mockResolvedValue([[], 0]);

      await service.listEvents(makeQuery({ limit: 25, offset: 50 }));

      expect(mockAuditRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25, offset: 50 }),
      );
    });

    it('should combine multiple filters', async () => {
      mockAuditRepository.findMany.mockResolvedValue([[], 0]);

      await service.listEvents(
        makeQuery({
          actorUserId: 'actor-uuid',
          eventType: 'access_grant',
          resourceType: 'upload',
          limit: 10,
          offset: 0,
        }),
      );

      expect(mockAuditRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'actor-uuid',
          eventType: 'access_grant',
          resourceType: 'upload',
          limit: 10,
          offset: 0,
        }),
      );
    });

    it('should return empty array when no events match', async () => {
      mockAuditRepository.findMany.mockResolvedValue([[], 0]);

      const result = await service.listEvents(makeQuery({ actorUserId: 'nonexistent' }));

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(mockAuditRepository.findResourceNames).not.toHaveBeenCalled();
    });

    it('should pass dateFrom and dateTo to repository', async () => {
      const dateFrom = new Date('2025-01-01');
      const dateTo = new Date('2025-06-30');
      mockAuditRepository.findMany.mockResolvedValue([[], 0]);

      await service.listEvents(makeQuery({ dateFrom, dateTo }));

      expect(mockAuditRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ dateFrom, dateTo }),
      );
    });
  });
});
