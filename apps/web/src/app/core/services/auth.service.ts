import { HttpContext, HttpErrorResponse } from '@angular/common/http';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';

import { AuthResponse, MeResponse, UserPublic } from '@agrolens/contracts';
import { isUserRole } from '../../shared/labels';
import {
  isAccountDisabledError,
  LOGIN_REASON_DISABLED,
  LOGIN_REASON_PARAM,
} from '../../shared/utils/auth-errors';
import { ApiService } from './api.service';
import { SessionService } from './session.service';
import { AUTH_TOKEN_OVERRIDE, SessionIdentityError } from '../interceptors/auth-context';
import { withBrowserLock } from '../../shared/utils/browser-lock';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private static readonly sessionChangeKey = 'agrolens:session-change';
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  private readonly userState = signal<UserPublic | null>(null);
  readonly user = this.userState.asReadonly();

  private readonly loadingState = signal(true);
  readonly loading = this.loadingState.asReadonly();
  /** Set when the backend reports the account suspended (`account_disabled`). */
  readonly accountDisabled = signal(false);

  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isAdmin = computed(() => this.user()?.role === 'admin');

  private initialized = false;
  private initializePromise: Promise<UserPublic | null> | null = null;
  private identityRevision = 0;

  constructor() {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== AuthService.sessionChangeKey) return;
      this.identityRevision++;
      this.session.clear();
      this.userState.set(null);
      this.initialized = false;
      void this.router.navigate(['/login']);
    };
    window.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', onStorage));
  }

  /** Restore the access token from the httpOnly refresh cookie, then load /auth/me. */
  async initialize(): Promise<UserPublic | null> {
    if (this.initialized) {
      return this.user();
    }
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = this.doInitialize();
    try {
      return await this.initializePromise;
    } finally {
      this.initializePromise = null;
    }
  }

  private async doInitialize(): Promise<UserPublic | null> {
    const revision = this.identityRevision;
    try {
      const refreshed = await this.refreshSession();
      this.initialized = true;
      this.loadingState.set(false);
      return refreshed ? this.user() : null;
    } catch (error) {
      this.initialized = true;
      this.loadingState.set(false);
      if (revision !== this.identityRevision) return this.user();
      if (!this.isExpectedUnauthenticatedError(error)) {
        throw error;
      }
      // Not authenticated — expected on first load.
    }
    this.initialized = true;
    this.loadingState.set(false);
    return null;
  }

  private isExpectedUnauthenticatedError(error: unknown): boolean {
    return error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403);
  }

  async login(email: string, password: string): Promise<UserPublic> {
    const revision = ++this.identityRevision;
    const res = await firstValueFrom(
      this.api.post<AuthResponse>('/auth/login', { email, password, clientType: 'web' }),
    );
    if (revision !== this.identityRevision) throw new SessionIdentityError();
    this.session.setToken(res.accessToken);
    const user: UserPublic = {
      id: res.user.id,
      fullName: res.user.fullName,
      role: isUserRole(res.user.role) ? res.user.role : 'user',
      email: res.user.email,
      phone: res.user.phone,
      createdAt: res.user.createdAt,
    };
    this.setUser(user);
    this.notifySessionChange();
    this.loadingState.set(false);
    return user;
  }

  async register(
    email: string,
    fullName: string,
    password: string,
    phone: string,
  ): Promise<UserPublic> {
    const revision = ++this.identityRevision;
    const res = await firstValueFrom(
      this.api.post<AuthResponse>('/auth/register', {
        email,
        fullName,
        password,
        phone,
        clientType: 'web',
      }),
    );
    if (revision !== this.identityRevision) throw new SessionIdentityError();
    this.session.setToken(res.accessToken);
    const user: UserPublic = {
      id: res.user.id,
      fullName: res.user.fullName,
      role: isUserRole(res.user.role) ? res.user.role : 'user',
      email: res.user.email,
      phone: res.user.phone,
      createdAt: res.user.createdAt,
    };
    this.setUser(user);
    this.notifySessionChange();
    this.loadingState.set(false);
    return user;
  }

  async refreshSession(expectedUserId = this.user()?.id): Promise<string | null> {
    const existingRefresh = this.session.getRefreshPromise();
    if (existingRefresh) {
      const token = await existingRefresh;
      if (token && expectedUserId) this.assertIdentity(expectedUserId);
      return token;
    }

    const revision = this.identityRevision;
    const refreshPromise = withBrowserLock('agrolens-session-refresh', () => {
      if (revision !== this.identityRevision) throw new SessionIdentityError();
      return this.executeRefreshSession(expectedUserId);
    });
    this.session.setRefreshPromise(refreshPromise);
    try {
      return await refreshPromise;
    } finally {
      if (this.session.getRefreshPromise() === refreshPromise) {
        this.session.setRefreshPromise(null);
      }
    }
  }

  async ensureSession(userId: string): Promise<string | null> {
    if (this.session.token) {
      this.assertIdentity(userId);
      return this.session.token;
    }
    return this.refreshSession(userId);
  }

  private async executeRefreshSession(expectedUserId?: string): Promise<string | null> {
    const revision = this.identityRevision;
    try {
      const res = await firstValueFrom(
        this.api
          .post<{ accessToken: string }>('/auth/refresh', { clientType: 'web' })
          .pipe(timeout(10000)),
      );
      // Validate /me before exposing the refreshed token to other requests.
      const user = await this.loadCurrentUser(res.accessToken, expectedUserId, revision);
      if (!user) return null;
      if (revision !== this.identityRevision) throw new SessionIdentityError();
      this.session.setToken(res.accessToken);
      return res.accessToken;
    } catch (error) {
      if (revision !== this.identityRevision) throw new SessionIdentityError();
      this.session.clear();
      this.clearUser();
      if (this.isExpectedUnauthenticatedError(error)) {
        if (isAccountDisabledError(error)) {
          this.terminateDisabledSession();
        }
        return null;
      }
      throw error;
    }
  }

  async loadCurrentUser(
    accessToken?: string,
    expectedUserId = this.user()?.id,
    revision = this.identityRevision,
  ): Promise<UserPublic | null> {
    try {
      const request = accessToken
        ? this.api.get<MeResponse>(
            '/auth/me',
            undefined,
            new HttpContext().set(AUTH_TOKEN_OVERRIDE, accessToken),
          )
        : this.api.get<MeResponse>('/auth/me');
      const response = await firstValueFrom(request.pipe(timeout(10000)));
      if (revision !== this.identityRevision) throw new SessionIdentityError();
      const me = response.user;
      if (me && isUserRole(me.role)) {
        if (expectedUserId && me.id !== expectedUserId) throw new SessionIdentityError();
        const user: UserPublic = {
          id: me.id,
          fullName: me.fullName,
          role: me.role,
          email: me.email,
          phone: me.phone,
          createdAt: me.createdAt,
        };
        this.setUser(user);
        return user;
      }
      throw new Error('Resposta de autenticação inválida.');
    } catch (error) {
      if (revision !== this.identityRevision) throw new SessionIdentityError();
      if (error instanceof SessionIdentityError) {
        this.session.clear();
        this.clearUser();
      }
      if (!this.isExpectedUnauthenticatedError(error)) {
        throw error;
      }
      if (isAccountDisabledError(error)) {
        this.terminateDisabledSession();
      } else {
        this.session.clear();
        this.clearUser();
      }
    }
    return null;
  }

  async logout(): Promise<void> {
    this.identityRevision++;
    this.session.clear();
    this.clearUser();
    this.notifySessionChange();
    try {
      await firstValueFrom(
        this.api.post<void>('/auth/logout', { clientType: 'web' }).pipe(timeout(5000)),
      );
    } catch {
      // Best-effort server-side logout
    }
    this.router.navigate(['/login']);
  }

  /** Ends the local session and displays the suspension reason on login. */
  private terminateDisabledSession(): void {
    this.session.clear();
    this.clearUser();
    this.accountDisabled.set(true);
    const currentUrl: unknown = this.router.url;
    if (typeof currentUrl !== 'string' || !currentUrl.startsWith('/login')) {
      void this.router.navigate(['/login'], {
        queryParams: { [LOGIN_REASON_PARAM]: LOGIN_REASON_DISABLED },
      });
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    await firstValueFrom(this.api.post<void>('/auth/forgot-password', { email }));
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await firstValueFrom(this.api.post<void>('/auth/reset-password', { token, newPassword }));
  }

  async refreshClaims(): Promise<boolean> {
    const user = await this.loadCurrentUser();
    return user?.role === 'admin';
  }

  private setUser(user: UserPublic): void {
    this.userState.set(user);
    this.accountDisabled.set(false);
  }

  assertIdentity(userId: string): void {
    if (this.user()?.id !== userId || !this.session.token) {
      throw new SessionIdentityError();
    }
  }

  private clearUser(): void {
    this.userState.set(null);
    this.accountDisabled.set(false);
  }

  private notifySessionChange(): void {
    try {
      // Notify other Angular tabs without persisting identity or tokens.
      localStorage.setItem(AuthService.sessionChangeKey, crypto.randomUUID());
    } catch {
      // Storage may be disabled; server-side identity checks still apply.
    }
  }
}
