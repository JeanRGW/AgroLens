import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from '../../src/users/users.controller';
import { UsersService } from '../../src/users/users.service';
import { ROLES_KEY } from '../../src/auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../src/auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/auth/guards/roles.guard';

function currentUser(role: 'admin' | 'user' = 'user'): AuthenticatedUser {
  return {
    sub: 'caller',
    email: 'caller@example.com',
    role,
    userRecord: {
      id: 'caller',
      email: 'caller@example.com',
      fullName: 'Caller',
      phone: null,
      role,
      disabledAt: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    },
  };
}

describe('UsersController (lookup authorization & privacy)', () => {
  let controller: UsersController;
  let usersService: {
    lookup: jest.Mock;
    getUserById: jest.Mock;
    adminSetDisabled: jest.Mock;
  };

  beforeEach(async () => {
    usersService = { lookup: jest.fn(), getUserById: jest.fn(), adminSetDisabled: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should not require the admin role for the lookup endpoint', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, UsersController.prototype.lookupUsers);
    expect(roles).toBeUndefined();
  });

  it('should return only { id, fullName } and never expose email/personal data', async () => {
    usersService.lookup.mockResolvedValue([{ id: 'u-1', fullName: 'Jane Doe' }]);

    const result = await controller.lookupUsers(currentUser(), { q: 'Jane', limit: 10 });

    expect(result).toEqual({ users: [{ id: 'u-1', fullName: 'Jane Doe' }] });
    const [first] = result.users;
    expect(Object.keys(first).sort()).toEqual(['fullName', 'id']);
  });

  it('should forward the query and limit to the service', async () => {
    usersService.lookup.mockResolvedValue([]);

    const caller = currentUser();
    await controller.lookupUsers(caller, { q: 'abc', limit: 5 });

    expect(usersService.lookup).toHaveBeenCalledWith(caller, 'abc', 5);
  });

  it('should require the admin role for the reset-password endpoint', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, UsersController.prototype.adminResetPassword);
    expect(roles).toEqual(['admin']);
  });

  it('should delegate the reset-password call to the service', async () => {
    (usersService as any).adminResetPassword = jest
      .fn()
      .mockResolvedValue({ id: 'u-1', email: 'a@b.com', fullName: 'A', role: 'user' });
    const caller = currentUser('admin');

    await controller.adminResetPassword('u-1', { newPassword: 'new-pass-123' }, caller);

    expect((usersService as any).adminResetPassword).toHaveBeenCalledWith(
      'u-1',
      { newPassword: 'new-pass-123' },
      caller,
    );
  });

  it('should not require the admin role for the getUserById endpoint', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, UsersController.prototype.getUserById);
    expect(roles).toBeUndefined();
  });

  it('should delegate getUserById call to service with currentUser', async () => {
    const expected = { id: 'u-1', fullName: 'Jane Doe' };
    usersService.getUserById.mockResolvedValue(expected);
    const caller = currentUser();

    const result = await controller.getUserById('u-1', caller);

    expect(result).toEqual({ user: expected });
    expect(usersService.getUserById).toHaveBeenCalledWith('u-1', caller);
  });

  it('should require the admin role for the disabled endpoint', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, UsersController.prototype.adminSetDisabled);
    expect(roles).toEqual(['admin']);
  });

  it('should delegate the disabled call to the service', async () => {
    usersService.adminSetDisabled.mockResolvedValue({
      id: 'u-1',
      email: 'a@b.com',
      fullName: 'A',
      role: 'user',
      disabledAt: new Date('2026-01-01'),
    });
    const caller = currentUser('admin');

    const result = await controller.adminSetDisabled('u-1', { disabled: true }, caller);

    expect(usersService.adminSetDisabled).toHaveBeenCalledWith('u-1', { disabled: true }, caller);
    expect(result).toEqual({ user: expect.objectContaining({ id: 'u-1' }) });
  });
});
