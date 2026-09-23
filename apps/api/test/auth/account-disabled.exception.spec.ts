import { HttpStatus } from '@nestjs/common';
import {
  ACCOUNT_DISABLED_CODE,
  AccountDisabledException,
} from '../../src/auth/account-disabled.exception';

describe('AccountDisabledException', () => {
  it('exposes a stable machine-readable code', () => {
    expect(ACCOUNT_DISABLED_CODE).toBe('account_disabled');
  });

  it('keeps the default Unauthorized shape with code added', () => {
    const response = new AccountDisabledException().getResponse();

    expect(response).toEqual({
      message: 'User account is disabled',
      code: 'account_disabled',
      error: 'Unauthorized',
      statusCode: 401,
    });
  });

  it('preserves a custom message', () => {
    const response = new AccountDisabledException('Account is disabled').getResponse();

    expect(response).toEqual({
      message: 'Account is disabled',
      code: 'account_disabled',
      error: 'Unauthorized',
      statusCode: 401,
    });
  });

  it('has status 401', () => {
    expect(new AccountDisabledException().getStatus()).toBe(HttpStatus.UNAUTHORIZED);
  });
});
