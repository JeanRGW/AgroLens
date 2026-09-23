import { planAdminUpdates, validateSeedAdminInputs } from '../../src/cli/seed-first-admin';

const validInputs = {
  email: 'admin@example.com',
  password: 'a-strong-generated-password',
  fullName: 'Admin User',
  phone: null,
};

describe('validateSeedAdminInputs', () => {
  it('accepts strong credentials', () => {
    expect(validateSeedAdminInputs(validInputs)).toBeNull();
  });

  it('rejects an invalid email', () => {
    const error = validateSeedAdminInputs({ ...validInputs, email: 'not-an-email' });
    expect(error).toMatch(/ADMIN_EMAIL/);
  });

  it('rejects short passwords', () => {
    const error = validateSeedAdminInputs({ ...validInputs, password: 'short' });
    expect(error).toMatch(/at least 8 characters/);
  });

  it.each([
    'CHANGE_ME_ADMIN_PASSWORD',
    'change-me-admin-password',
    'ReplaceMeStrongerPass1',
    'changeme123',
    'changeme',
    'CHANGEME',
    'Admin123',
  ])('rejects placeholder password %s', (password) => {
    expect(validateSeedAdminInputs({ ...validInputs, password })).toMatch(/placeholder value/);
  });

  it('rejects the short default admin password', () => {
    expect(validateSeedAdminInputs({ ...validInputs, password: 'admin' })).toMatch(
      /at least 8 characters|placeholder value/,
    );
  });

  it('accepts a legitimate password that merely contains the word admin', () => {
    expect(validateSeedAdminInputs({ ...validInputs, password: 'vN7$adminLq2xzp' })).toBeNull();
  });

  it('rejects an empty full name', () => {
    const error = validateSeedAdminInputs({ ...validInputs, fullName: '' });
    expect(error).toMatch(/ADMIN_FULL_NAME/);
  });
});

describe('planAdminUpdates', () => {
  const existing = { role: 'admin', fullName: 'Admin User', phone: null };

  it('plans nothing when the row already matches and no reset is requested', () => {
    expect(
      planAdminUpdates(existing, {
        fullName: 'Admin User',
        phone: null,
        newPasswordHash: null,
      }),
    ).toEqual({});
  });

  it('never touches the password without an explicit reset hash', () => {
    const updates = planAdminUpdates(
      { role: 'user', fullName: 'Old Name', phone: null },
      { fullName: 'Admin User', phone: '+5511999999999', newPasswordHash: null },
    );
    expect(updates).toEqual({
      role: 'admin',
      fullName: 'Admin User',
      phone: '+5511999999999',
    });
    expect(updates.passwordHash).toBeUndefined();
  });

  it('includes the password hash only when a reset hash is supplied', () => {
    const updates = planAdminUpdates(existing, {
      fullName: 'Admin User',
      phone: null,
      newPasswordHash: '$argon2id$new',
    });
    expect(updates).toEqual({ passwordHash: '$argon2id$new' });
  });

  it('preserves an empty existing phone over a null input phone', () => {
    const updates = planAdminUpdates(
      { role: 'admin', fullName: 'Admin User', phone: '+5511999999999' },
      { fullName: 'Admin User', phone: null, newPasswordHash: null },
    );
    expect(updates).toEqual({});
  });
});
