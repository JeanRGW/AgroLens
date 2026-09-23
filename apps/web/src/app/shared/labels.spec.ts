import { USER_ROLES, type UserRole } from '@agrolens/contracts';

import { isResourceType, isUserRole, ROLE_LABELS, RESOURCE_LABELS } from './labels';

describe('labels', () => {
  it('validates admin role', () => {
    expect(isUserRole('admin')).toBeTrue();
    expect(isUserRole('user')).toBeTrue();
  });

  it('rejects invalid roles', () => {
    expect(isUserRole('superadmin')).toBeFalse();
    expect(isUserRole('')).toBeFalse();
    expect(isUserRole(null)).toBeFalse();
    expect(isUserRole(undefined)).toBeFalse();
  });

  it('labels every user role', () => {
    for (const role of USER_ROLES) {
      expect(ROLE_LABELS[role as UserRole]).toBeTruthy();
    }
  });

  it('validates resource types', () => {
    expect(isResourceType('upload')).toBeTrue();
    expect(isResourceType('property')).toBeTrue();
    expect(isResourceType('talhao')).toBeTrue();
    expect(isResourceType('crop_type')).toBeTrue();
    expect(isResourceType('estadio')).toBeTrue();
  });

  it('rejects invalid resource types', () => {
    expect(isResourceType('invalid')).toBeFalse();
    expect(isResourceType('')).toBeFalse();
  });

  it('labels every grant resource type', () => {
    for (const type of ['upload', 'property', 'talhao', 'crop_type', 'estadio']) {
      expect(RESOURCE_LABELS[type]).toBeTruthy();
    }
  });
});
