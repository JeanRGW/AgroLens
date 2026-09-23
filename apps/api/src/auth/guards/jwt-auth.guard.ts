import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { TokenService, type AccessTokenPayload } from '../token.service';
import { UsersRepository } from '../../database/repositories';
import { AccountDisabledException } from '../account-disabled.exception';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  role: string;
  userRecord: {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    role: string;
    disabledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

/**
 * JWT authentication guard.
 *
 * Extracts the Bearer token from the Authorization header,
 * verifies it, loads the user record, checks the user is not disabled,
 * and attaches the decoded payload and user record to the request.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly usersRepository: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    let payload: AccessTokenPayload;
    try {
      payload = this.tokenService.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const user = await this.usersRepository.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.disabledAt) {
      throw new AccountDisabledException();
    }

    request.user = {
      sub: payload.sub,
      email: payload.email,
      role: user.role,
      userRecord: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        disabledAt: user.disabledAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    } satisfies AuthenticatedUser;

    return true;
  }

  private extractTokenFromHeader(request: {
    headers: Record<string, string | undefined>;
  }): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) return undefined;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
