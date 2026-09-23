import { Injectable } from '@angular/core';

/**
 * In-memory session service that holds the current access token.
 * The token is never persisted to localStorage. On page reload the
 * client must call /auth/refresh to obtain a new access token via
 * the httpOnly refresh cookie.
 */
@Injectable({
  providedIn: 'root',
})
export class SessionService {
  private accessToken: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;

  get token(): string | null {
    return this.accessToken;
  }

  setToken(token: string | null): void {
    this.accessToken = token;
  }

  clear(): void {
    this.accessToken = null;
    this.refreshPromise = null;
  }

  setRefreshPromise(p: Promise<string | null> | null): void {
    this.refreshPromise = p;
  }

  getRefreshPromise(): Promise<string | null> | null {
    return this.refreshPromise;
  }
}
