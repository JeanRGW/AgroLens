import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

/**
 * Parameter decorator that extracts the authenticated user from the request.
 *
 * Usage:
 *   @CurrentUser() user: AuthenticatedUser
 *   @CurrentUser('id') userId: string
 *   @CurrentUser('userRecord') userRecord: User
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('No authenticated user');
    }
    return data ? user[data] : user;
  },
);
