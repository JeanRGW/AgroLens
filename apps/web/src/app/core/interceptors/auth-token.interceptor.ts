import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { from, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';
import { SessionService } from '../services/session.service';
import {
  isAccountDisabledError,
  LOGIN_REASON_DISABLED,
  LOGIN_REASON_PARAM,
} from '../../shared/utils/auth-errors';
import { AUTH_TOKEN_OVERRIDE, EXPECTED_USER_ID, SessionIdentityError } from './auth-context';

/**
 * Endpoints that MUST NOT trigger a 401 → refresh → retry cycle.
 * Refreshing these would cause infinite loops or pointless retries.
 */
const SKIP_RETRY_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/me',
  '/auth/logout',
  '/auth/change-password',
];

export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const sessionService = inject(SessionService);
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = req.context.get(AUTH_TOKEN_OVERRIDE) ?? sessionService.token;
  const expectedUserId = req.context.get(EXPECTED_USER_ID) ?? authService.user()?.id;
  const base = new URL(environment.apiBaseUrl, window.location.origin);
  const request = new URL(req.url, window.location.origin);
  const isApiRequest =
    request.origin === base.origin &&
    (request.pathname === base.pathname || request.pathname.startsWith(`${base.pathname}/`));
  if (expectedUserId && req.context.get(EXPECTED_USER_ID) && isApiRequest) {
    try {
      authService.assertIdentity(expectedUserId);
    } catch (error) {
      return throwError(() => error);
    }
  }

  // Attach bearer token when we have one and it's an API request
  let authReq = req;
  if (token && isApiRequest) {
    authReq = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Only attempt refresh-retry for:
      //   - 401 responses
      //   - API requests that actually had a bearer token
      //   - Non-auth endpoints (prevent recursion)
      if (
        error.status !== 401 ||
        !token ||
        !isApiRequest ||
        SKIP_RETRY_PATHS.some((p) => req.url.includes(p))
      ) {
        return throwError(() => error);
      }

      if (expectedUserId && authService.user()?.id !== expectedUserId) {
        return throwError(() => new SessionIdentityError());
      }

      // Attempt a single refresh; refreshSession() internally coordinates
      // concurrent calls so multiple 401s share one refresh request.
      return from(authService.refreshSession(expectedUserId ?? undefined)).pipe(
        mergeMap((newToken) => {
          if (!newToken) {
            // Refresh failed and the session is gone. A suspended account was
            // already force-logged-out; repeat the login navigation with the
            // reason so the message survives.
            if (authService.accountDisabled() || isAccountDisabledError(error)) {
              void router.navigate(['/login'], {
                queryParams: { [LOGIN_REASON_PARAM]: LOGIN_REASON_DISABLED },
              });
            } else if (!authService.user()) {
              void router.navigate(['/login']);
            }
            return throwError(() => error);
          }
          if (expectedUserId) authService.assertIdentity(expectedUserId);
          // Retry the original request with the fresh access token.
          const retryReq = req.clone({
            setHeaders: { Authorization: `Bearer ${newToken}` },
          });
          return next(retryReq);
        }),
        // Preserve the original 401 when the refresh cookie is simply expired,
        // but surface network/server failures so they are not mistaken for logout.
        catchError((refreshError: unknown) => throwError(() => refreshError)),
      );
    }),
  );
};
