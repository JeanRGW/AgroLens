/**
 * Seed script: create or update the first admin user.
 *
 * Usage:
 *   npm run db:seed:first-admin
 *
 * Required environment variables:
 *   DATABASE_URL       — PostgreSQL connection string
 *   ADMIN_EMAIL        — Admin email address
 *   ADMIN_PASSWORD     — Admin password (min 8 characters; placeholders rejected)
 *   ADMIN_FULL_NAME    — Admin full name
 *
 * Optional:
 *   ADMIN_PHONE            — Admin phone number
 *   ADMIN_RESET_PASSWORD   — "true" to reset the password of an existing admin
 *                            (revokes that user's refresh sessions); without
 *                            it, an existing user only gets role/name/phone
 *                            reconciliation and keeps their password.
 *
 * The script is idempotent: it creates the admin when missing and otherwise
 * ensures the role is 'admin' and updates name/phone.
 */

import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import argon2 from 'argon2';
import * as schema from '../database/schema';
import { placeholderSecretPattern } from '../config/env.schema';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    console.error(`Error: ${key} environment variable is required.`);
    process.exit(1);
  }
  return value.trim();
}

export interface SeedAdminInputs {
  email: string;
  password: string;
  fullName: string;
  phone: string | null;
}

/**
 * Validate seed inputs. Returns an error message instead of exiting so the
 * rules stay unit-testable; main() turns a message into the CLI failure.
 */
export function validateSeedAdminInputs(inputs: SeedAdminInputs): string | null {
  if (!inputs.email.includes('@') || !inputs.email.includes('.')) {
    return 'ADMIN_EMAIL does not appear to be a valid email address.';
  }

  if (inputs.password.length < 8) {
    return 'ADMIN_PASSWORD must be at least 8 characters.';
  }

  // Reject documented placeholder passwords so a copied example file cannot
  // mint an admin account reachable with a publicly known credential.
  if (placeholderSecretPattern.test(inputs.password) || /^admin(123)?$/i.test(inputs.password)) {
    return (
      'ADMIN_PASSWORD is a placeholder value. Set a strong generated password ' +
      '(e.g. openssl rand -base64 24).'
    );
  }

  if (inputs.fullName.length < 1) {
    return 'ADMIN_FULL_NAME cannot be empty.';
  }

  return null;
}

export interface PlannedAdminUpdate {
  role?: string;
  fullName?: string;
  phone?: string | null;
  passwordHash?: string;
}

/**
 * Compute the update set for an existing admin row. `newPasswordHash` is the
 * Argon2id hash of the supplied ADMIN_PASSWORD on an explicit reset
 * (ADMIN_RESET_PASSWORD=true) and null otherwise, so re-running the seed
 * cannot rotate live credentials by accident.
 */
export function planAdminUpdates(
  existing: { role: string; fullName: string; phone: string | null },
  options: { fullName: string; phone: string | null; newPasswordHash: string | null },
): PlannedAdminUpdate {
  const updates: PlannedAdminUpdate = {};

  if (existing.role !== 'admin') {
    updates.role = 'admin';
  }

  if (existing.fullName !== options.fullName) {
    updates.fullName = options.fullName;
  }

  if (options.phone && existing.phone !== options.phone) {
    updates.phone = options.phone;
  }

  if (options.newPasswordHash) {
    updates.passwordHash = options.newPasswordHash;
  }

  return updates;
}

async function main() {
  const inputs: SeedAdminInputs = {
    email: requireEnv('ADMIN_EMAIL'),
    password: requireEnv('ADMIN_PASSWORD'),
    fullName: requireEnv('ADMIN_FULL_NAME'),
    phone: process.env.ADMIN_PHONE?.trim() || null,
  };

  const validationError = validateSeedAdminInputs(inputs);
  if (validationError) {
    console.error(`Error: ${validationError}`);
    process.exit(1);
  }

  const { email, password, fullName, phone } = inputs;
  const databaseUrl = requireEnv('DATABASE_URL');

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    // Check if user already exists
    const [existing] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (existing) {
      // Existing rows are never credential-touched by default so re-running
      // the seed (or an operator supplying placeholder credentials) cannot
      // rotate a live admin password by accident. ADMIN_RESET_PASSWORD=true is
      // the explicit, intentional reset path.
      const resetPassword = process.env.ADMIN_RESET_PASSWORD === 'true';
      const newPasswordHash = resetPassword
        ? await argon2.hash(password, { type: argon2.argon2id })
        : null;
      const updates = planAdminUpdates(existing, { fullName, phone, newPasswordHash });

      if (Object.keys(updates).length > 0) {
        await db.transaction(async (tx) => {
          await tx
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(eq(schema.users.id, existing.id))
            .for('update');
          await tx
            .update(schema.users)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(schema.users.id, existing.id));

          if (resetPassword) {
            await tx
              .update(schema.passwordResetTokens)
              .set({ consumedAt: new Date() })
              .where(eq(schema.passwordResetTokens.userId, existing.id));
            await tx
              .update(schema.refreshTokens)
              .set({ revokedAt: new Date() })
              .where(eq(schema.refreshTokens.userId, existing.id));
          }
        });
        if (resetPassword) {
          console.log(`Admin user "${email}" updated (role ensured, password reset).`);
        } else {
          console.log(`Admin user "${email}" updated (role ensured).`);
        }
      } else {
        console.log(`Admin user "${email}" already exists and is up to date.`);
      }
    } else {
      // Create new admin user
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

      await db.insert(schema.users).values({
        email,
        passwordHash,
        fullName,
        phone,
        role: 'admin',
      });

      console.log(`Admin user "${email}" created successfully.`);
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  void main().catch((err) => {
    console.error('Seed script failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
