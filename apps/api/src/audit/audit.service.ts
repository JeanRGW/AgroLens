import { Injectable, Logger } from '@nestjs/common';
import { AuditRepository, type EnrichedAuditEvent } from '../database/repositories';
import type { ListAuditQueryInput } from './dto/list-audit-query.dto';
import { resolveLimitOffset } from '../shared/http/pagination';

export interface AuditEventWithNames extends EnrichedAuditEvent {
  resourceName: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditRepository: AuditRepository) {}

  /**
   * GET /audit-events — admin-only listing of audit events.
   * Supports optional filters, date ranges, and pagination.
   * Actor/target user names are joined; resource display names are resolved
   * in batch (null when the entity is gone or not nameable).
   * Returns the normalized list envelope { items, total, limit, offset }.
   */
  async listEvents(
    query: ListAuditQueryInput,
  ): Promise<{ items: AuditEventWithNames[]; total: number; limit: number; offset: number }> {
    const { limit, offset } = resolveLimitOffset(query, 100);

    const { actorUserId, targetUserId, resourceType, resourceId, eventType, dateFrom, dateTo } =
      query;

    this.logger.debug(`Listing audit events: filters=${JSON.stringify(query)}`);

    const [events, total] = await this.auditRepository.findMany({
      actorUserId,
      targetUserId,
      resourceType,
      resourceId,
      eventType,
      dateFrom,
      dateTo,
      limit,
      offset,
    });

    if (events.length === 0) {
      return { items: [], total, limit, offset };
    }

    const resourceNames = await this.auditRepository.findResourceNames(
      events.map((event) => ({ resourceType: event.resourceType, resourceId: event.resourceId })),
    );

    const enriched = events.map((event) => ({
      ...event,
      resourceName:
        event.resourceType && event.resourceId
          ? (resourceNames.get(`${event.resourceType}:${event.resourceId}`) ?? null)
          : null,
    }));

    return {
      items: enriched,
      total,
      limit,
      offset,
    };
  }
}
