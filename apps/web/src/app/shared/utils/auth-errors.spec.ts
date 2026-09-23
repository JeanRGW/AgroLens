import { HttpErrorResponse } from '@angular/common/http';

import {
  ACCOUNT_DISABLED_CODE,
  isAccountDisabledError,
  LOGIN_REASON_DISABLED,
  LOGIN_REASON_PARAM,
} from './auth-errors';

function disabledResponse() {
  return new HttpErrorResponse({
    status: 401,
    error: {
      message: 'User account is disabled',
      code: 'account_disabled',
      error: 'Unauthorized',
      statusCode: 401,
    },
  });
}

describe('auth-errors', () => {
  it('exposes the contract code and login reason', () => {
    expect(ACCOUNT_DISABLED_CODE).toBe('account_disabled');
    expect(LOGIN_REASON_PARAM).toBe('reason');
    expect(LOGIN_REASON_DISABLED).toBe('disabled');
  });

  it('matches a 401 carrying the disabled code', () => {
    expect(isAccountDisabledError(disabledResponse())).toBeTrue();
  });

  it('rejects a 401 without the code', () => {
    expect(
      isAccountDisabledError(new HttpErrorResponse({ status: 401, error: 'Unauthorized' })),
    ).toBeFalse();
  });

  it('rejects a 401 with an unrelated code', () => {
    expect(
      isAccountDisabledError(
        new HttpErrorResponse({ status: 401, error: { code: 'token_expired' } }),
      ),
    ).toBeFalse();
  });

  it('rejects non-401 statuses even with the code', () => {
    expect(
      isAccountDisabledError(
        new HttpErrorResponse({ status: 403, error: { code: 'account_disabled' } }),
      ),
    ).toBeFalse();
  });

  it('rejects non-HTTP errors', () => {
    expect(isAccountDisabledError(new Error('account_disabled'))).toBeFalse();
    expect(isAccountDisabledError(null)).toBeFalse();
    expect(isAccountDisabledError(undefined)).toBeFalse();
  });
});
