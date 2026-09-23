import { HttpErrorResponse } from '@angular/common/http';

/** Must match ACCOUNT_DISABLED_CODE in backend/src/auth/account-disabled.exception.ts. */
export const ACCOUNT_DISABLED_CODE = 'account_disabled';

/** Query param carrying a forced-logout reason into the login page. */
export const LOGIN_REASON_PARAM = 'reason';
export const LOGIN_REASON_DISABLED = 'disabled';

/**
 * Whether an HTTP failure reports a suspended account.
 *
 * Matches only on the machine-readable `code` in a 401 body — never on
 * human-readable text — so backend copy can change without breaking
 * forced-logout behavior.
 */
export function isAccountDisabledError(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse) || error.status !== 401) return false;
  const body: unknown = error.error;
  return (
    !!body &&
    typeof body === 'object' &&
    'code' in body &&
    (body as { code?: unknown }).code === ACCOUNT_DISABLED_CODE
  );
}
