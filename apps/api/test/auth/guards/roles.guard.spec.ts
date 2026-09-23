import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../../src/auth/guards/roles.guard';
import { ROLES_KEY } from '../../../src/auth/decorators/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  function createMockContext(requiredRoles: string[] | undefined, userRole: string) {
    // We set the metadata via reflector.get
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredRoles);

    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { role: userRole },
        }),
      }),
    } as any;
  }

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  describe('canActivate', () => {
    it('should allow access when no roles are required (no decorator)', () => {
      const context = createMockContext(undefined, 'user');
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when required roles is empty array', () => {
      const context = createMockContext([], 'user');
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when user has one of the required roles', () => {
      const context = createMockContext(['admin'], 'admin');
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when user has one of multiple required roles', () => {
      const context = createMockContext(['admin', 'manager'], 'manager');
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should throw ForbiddenException when user does not have required role', () => {
      const context = createMockContext(['admin'], 'user');
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user is not authenticated (no request.user)', () => {
      const context = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => ({}),
        }),
      } as any;
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException with message "Insufficient role"', () => {
      const context = createMockContext(['admin'], 'user');
      expect(() => guard.canActivate(context)).toThrow('Insufficient role');
    });

    it('should use ROLES_KEY from decorator constants', () => {
      const context = createMockContext(['admin'], 'user');
      try {
        guard.canActivate(context);
      } catch {
        /* expected to throw */
      }
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    });
  });
});
