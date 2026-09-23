import { inject, Injectable } from '@angular/core';

import { AuditEvent, AuditEventType } from '@agrolens/contracts';
import { ApiService } from './api.service';

export interface AuditFilters {
  eventType?: AuditEventType;
  actorUserId?: string;
  targetUserId?: string;
  resourceType?: string;
  resourceId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditPageResult {
  events: AuditEvent[];
  total: number;
}

@Injectable({
  providedIn: 'root',
})
export class AuditService {
  private readonly api = inject(ApiService);

  listEvents(filters?: AuditFilters): Promise<{ events: AuditEvent[]; total: number }> {
    const params: Record<string, string | number | boolean | undefined> = {
      page: filters?.page ?? 1,
      pageSize: filters?.pageSize ?? 50,
    };
    if (filters) {
      if (filters.eventType) params['eventType'] = filters.eventType;
      if (filters.actorUserId) params['actorUserId'] = filters.actorUserId;
      if (filters.targetUserId) params['targetUserId'] = filters.targetUserId;
      if (filters.resourceType) params['resourceType'] = filters.resourceType;
      if (filters.resourceId) params['resourceId'] = filters.resourceId;
      if (filters.dateFrom) params['dateFrom'] = filters.dateFrom;
      if (filters.dateTo) params['dateTo'] = filters.dateTo;
    }
    return this.api
      .getJson<{ items: AuditEvent[]; total: number }>('/audit-events', params)
      .then((res) => ({ events: res?.items ?? [], total: res?.total ?? 0 }));
  }
}
