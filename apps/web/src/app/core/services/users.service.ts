import { inject, Injectable } from '@angular/core';

import { UserLookup, UserPublic, UserRole } from '@agrolens/contracts';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root',
})
export class UsersService {
  private readonly api = inject(ApiService);
  private readonly userCache = new Map<string, UserLookup | UserPublic>();

  listUsers(params?: {
    search?: string;
    role?: UserRole;
    page?: number;
    pageSize?: number;
  }): Promise<{ users: UserPublic[]; total: number }> {
    const queryParams: Record<string, string | number | boolean | undefined> = {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 50,
    };
    if (params?.search) queryParams['search'] = params.search;
    if (params?.role) queryParams['role'] = params.role;
    return this.api
      .getJson<{ items: UserPublic[]; total: number }>('/users', queryParams)
      .then((res) => {
        const users = res?.items ?? [];
        for (const u of users) {
          if (u.id) this.userCache.set(u.id, u);
        }
        return { users, total: res?.total ?? 0 };
      });
  }

  lookupUsers(search: string): Promise<UserLookup[]> {
    return this.api.getJson<{ users: UserLookup[] }>('/users/lookup', { search }).then((res) => {
      const list = res.users;
      for (const u of list) {
        if (u.id) this.userCache.set(u.id, u);
      }
      return list;
    });
  }

  getUserById(userId: string): Promise<UserPublic | UserLookup | null> {
    return this.api
      .getJson<{ user: UserPublic | UserLookup }>(`/users/${userId}`)
      .then((res) => {
        if (res?.user?.id) {
          this.userCache.set(res.user.id, res.user);
        }
        return res?.user ?? null;
      })
      .catch(() => null);
  }

  async resolveUser(userId: string): Promise<UserLookup | UserPublic | null> {
    if (!userId) return null;
    const cached = this.userCache.get(userId);
    if (cached) return cached;
    return this.getUserById(userId);
  }

  updateProfile(data: { fullName?: string; phone?: string | null }): Promise<UserPublic> {
    return this.api
      .patchJson<{ user: UserPublic }>('/users/me', data)
      .then((response) => response.user);
  }

  /** Change the current user's password; the backend revokes all refresh sessions. */
  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return this.api.postJson<void>('/auth/change-password', { currentPassword, newPassword });
  }

  // Admin-only
  /** Admin resets a user's password; the backend revokes all of the user's sessions. */
  resetUserPassword(userId: string, newPassword: string): Promise<UserPublic> {
    return this.api
      .postJson<{ user: UserPublic }>(`/admin/users/${userId}/reset-password`, {
        newPassword,
      })
      .then((response) => response.user);
  }

  // Admin-only
  createUser(data: {
    email: string;
    fullName: string;
    password: string;
    role: UserRole;
    phone?: string;
  }): Promise<UserPublic> {
    return this.api
      .postJson<{ user: UserPublic }>('/admin/users', data)
      .then((response) => response.user);
  }

  setUserRole(userId: string, role: UserRole): Promise<void> {
    return this.api.patchJson<void>(`/admin/users/${userId}/role`, { role });
  }

  /**
   * Admin suspends or reactivates a user. Disabling revokes all of the
   * user's sessions; after re-enable the user must sign in again.
   */
  setUserDisabled(userId: string, disabled: boolean): Promise<UserPublic> {
    return this.api
      .patchJson<{ user: UserPublic }>(`/admin/users/${userId}/disabled`, { disabled })
      .then((response) => response.user);
  }
}
