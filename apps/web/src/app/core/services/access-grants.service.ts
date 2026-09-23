import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AccessGrant, AccessGrantInput } from '@agrolens/contracts';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root',
})
export class AccessGrantsService {
  private readonly api = inject(ApiService);

  listGrants(params?: {
    subjectUserId?: string;
    resourceType?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ grants: AccessGrant[]; total: number }> {
    const queryParams: Record<string, string | number | boolean | undefined> = {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 50,
    };
    if (params?.subjectUserId) queryParams['subjectUserId'] = params.subjectUserId;
    if (params?.resourceType) queryParams['resourceType'] = params.resourceType;
    return this.api
      .getJson<{ items: AccessGrant[]; total: number }>('/access-grants', queryParams)
      .then((res) => ({ grants: res?.items ?? [], total: res?.total ?? 0 }));
  }

  createGrant(input: AccessGrantInput): Promise<AccessGrant> {
    return firstValueFrom(this.api.post<{ grant: AccessGrant }>('/access-grants', input)).then(
      (response) => response.grant,
    );
  }

  revokeGrant(id: string): Promise<void> {
    return firstValueFrom(this.api.delete<void>(`/access-grants/${id}`));
  }
}
