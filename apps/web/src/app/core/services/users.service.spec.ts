import { TestBed } from '@angular/core/testing';

import { UsersService } from './users.service';
import { ApiService } from './api.service';
import { UserPublic, UserRole } from '@agrolens/contracts';

describe('UsersService', () => {
  let service: UsersService;
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        UsersService,
        {
          provide: ApiService,
          useValue: jasmine.createSpyObj('ApiService', [
            'get',
            'post',
            'patch',
            'getJson',
            'postJson',
            'patchJson',
          ]),
        },
      ],
    });

    service = TestBed.inject(UsersService);
    api = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('listUsers', () => {
    it('calls GET /users with default page params', async () => {
      api.getJson.and.resolveTo({ items: [], total: 0 });
      await service.listUsers();
      expect(api.getJson).toHaveBeenCalledWith('/users', { page: 1, pageSize: 50 });
    });

    it('passes search param', async () => {
      api.getJson.and.resolveTo({ items: [], total: 0 });
      await service.listUsers({ search: 'joao' });
      expect(api.getJson).toHaveBeenCalledWith('/users', {
        page: 1,
        pageSize: 50,
        search: 'joao',
      });
    });
  });

  describe('lookupUsers', () => {
    it('calls GET /users/lookup with search', async () => {
      api.getJson.and.resolveTo({ users: [] });
      await service.lookupUsers('maria');
      expect(api.getJson).toHaveBeenCalledWith('/users/lookup', { search: 'maria' });
    });

    it('unwraps users array when API returns { users: [...] }', async () => {
      const users: UserPublic[] = [{ id: 'u2', fullName: 'Jean', email: 'j@j.com', role: 'user' }];
      api.getJson.and.resolveTo({ users, total: 1 });
      const result = await service.lookupUsers('jean');
      expect(result).toEqual(users);
    });

    it('returns an empty users list', async () => {
      api.getJson.and.resolveTo({ users: [] });
      const result = await service.lookupUsers('test');
      expect(result).toEqual([]);
    });
  });

  describe('createUser', () => {
    it('returns the user from POST /admin/users', async () => {
      const user: UserPublic = {
        id: 'u1',
        fullName: 'Novo',
        email: 'n@n.com',
        role: 'user',
      };
      api.postJson.and.resolveTo({ user });
      const result = await service.createUser({
        email: 'n@n.com',
        fullName: 'Novo',
        password: '12345678',
        role: 'user',
      });
      expect(result).toEqual(user);
      expect(api.postJson).toHaveBeenCalledWith('/admin/users', {
        email: 'n@n.com',
        fullName: 'Novo',
        password: '12345678',
        role: 'user',
      });
    });
  });

  describe('setUserRole', () => {
    it('calls PATCH /admin/users/:id/role', async () => {
      api.patchJson.and.resolveTo(undefined);
      await service.setUserRole('u1', 'admin');
      expect(api.patchJson).toHaveBeenCalledWith('/admin/users/u1/role', { role: 'admin' });
    });
  });

  describe('setUserDisabled', () => {
    it('calls PATCH /admin/users/:id/disabled and returns the user', async () => {
      const user: UserPublic = {
        id: 'u1',
        fullName: 'Suspenso',
        email: 's@s.com',
        role: 'user',
        disabledAt: '2026-09-21T00:00:00.000Z',
      };
      api.patchJson.and.resolveTo({ user });
      const result = await service.setUserDisabled('u1', true);
      expect(api.patchJson).toHaveBeenCalledWith('/admin/users/u1/disabled', { disabled: true });
      expect(result).toEqual(user);
    });
  });

  describe('updateProfile', () => {
    it('calls PATCH /users/me with fullName and phone', async () => {
      api.patchJson.and.resolveTo({
        user: { id: 'u1', fullName: 'Updated', email: 'u@u.com', role: 'user' },
      });
      const result = await service.updateProfile({ fullName: 'Updated', phone: '11999999999' });
      expect(api.patchJson).toHaveBeenCalledWith('/users/me', {
        fullName: 'Updated',
        phone: '11999999999',
      });
      expect(result.fullName).toBe('Updated');
    });

    it('calls PATCH /users/me with only fullName', async () => {
      api.patchJson.and.resolveTo({
        user: { id: 'u1', fullName: 'Name Only', email: 'u@u.com', role: 'user' },
      });
      await service.updateProfile({ fullName: 'Name Only' });
      expect(api.patchJson).toHaveBeenCalledWith('/users/me', { fullName: 'Name Only' });
    });
  });

  describe('getUserById and resolveUser', () => {
    it('calls GET /users/:id and caches result', async () => {
      const user: UserPublic = {
        id: 'u-10',
        fullName: 'User 10',
        email: 'u10@example.com',
        role: 'user',
      };
      api.getJson.and.resolveTo({ user });

      const result = await service.getUserById('u-10');
      expect(result).toEqual(user);
      expect(api.getJson).toHaveBeenCalledWith('/users/u-10');

      // Second call via resolveUser should hit cache
      const cached = await service.resolveUser('u-10');
      expect(cached).toEqual(user);
      expect(api.getJson.calls.count()).toBe(1);
    });

    it('returns null if getUserById fails', async () => {
      api.getJson.and.rejectWith(new Error('404 Not Found'));

      const result = await service.getUserById('u-missing');
      expect(result).toBeNull();
    });

    it('resolveUser returns null for empty userId', async () => {
      const result = await service.resolveUser('');
      expect(result).toBeNull();
      expect(api.getJson).not.toHaveBeenCalled();
    });
  });
});
