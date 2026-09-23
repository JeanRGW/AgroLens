import { HttpStatus, UnauthorizedException } from '@nestjs/common';

/**
 * Machine-readable code identifying account-suspension 401s.
 * Clients match on this instead of human-readable text so a suspended
 * session can be ended deterministically (full logout, no offline mode).
 */
export const ACCOUNT_DISABLED_CODE = 'account_disabled' as const;

/**
 * 401 raised when credentials are valid but the account is suspended.
 *
 * The object body passes through Nest's exception filter unchanged, so
 * `error`, `statusCode` and `message` are included explicitly to keep the
 * default Unauthorized response shape with `code` added.
 */
export class AccountDisabledException extends UnauthorizedException {
  constructor(message = 'User account is disabled') {
    super({
      message,
      code: ACCOUNT_DISABLED_CODE,
      error: 'Unauthorized',
      statusCode: HttpStatus.UNAUTHORIZED,
    });
  }
}
