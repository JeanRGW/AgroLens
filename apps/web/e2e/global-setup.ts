/**
 * Playwright global setup for real-backend E2E tests.
 *
 * Supports two modes:
 *
 * **Self-provisioning mode** (default):
 *   Provisions test data via the backend API:
 *   1. Health check — fail fast with clear message if backend is down
 *   2. Register unique owner and viewer users
 *   3. Promote owner to admin (via seeded admin)
 *   4. Create catalog entries (property, talhão, crop type, estádio)
 *   5. Create a ready upload (init → presigned PUT → complete → poll)
 *   6. Grant viewer access to the upload
 *   7. Save provisioned data for test consumption
 *
 * **Cross-app artifact mode** (CROSS_APP_ARTIFACT_PATH set):
 *   Uses a JSON artifact produced by the mobile integration test:
 *   1. Load artifact (upload ID, owner credentials, catalog IDs)
 *   2. Health check against the artifact's backend URL
 *   3. Login as the mobile owner, fetch profile
 *   4. Register a fresh viewer user
 *   5. Try admin promotion + viewer grant (skip gracefully if admin unavailable)
 *   6. Save provisioned data in the same format as self-provisioning mode
 *
 * Prerequisites:
 *   - Backend API at E2E_API_URL (default http://localhost:3000/api)
 *   - Backend worker running (for upload finalization)
 *   - Seeded admin at E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 */

import type { FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import {
  checkBackendHealth,
  registerUser,
  loginUser,
  getCurrentUser,
  promoteToAdmin,
  createProperty,
  createTalhao,
  createCropType,
  createEstadio,
  createReadyUpload,
  createAccessGrant,
} from './helpers';

const AUTH_DIR = path.join(__dirname, '.auth');
const PROVISIONED_PATH = path.join(AUTH_DIR, 'provisioned.json');

/** Shape of the cross-app artifact written by the mobile integration test. */
interface CrossAppArtifact {
  backendBaseUrl: string;
  ownerEmail: string;
  ownerPassword: string;
  uploadId: string;
  clientUploadId: string;
  propertyId: string;
  talhaoId: string;
  cropTypeId: string;
  estadioId: string;
  createdAt: string;
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  // ── Cross-app artifact mode ──────────────────────────────────────
  // If CROSS_APP_ARTIFACT_PATH is set, use the mobile-created upload
  // instead of self-provisioning a new one.
  const crossAppArtifactPath = process.env['CROSS_APP_ARTIFACT_PATH'];
  if (crossAppArtifactPath) {
    return crossAppSetup(crossAppArtifactPath);
  }

  // ── Normal self-provisioning mode ────────────────────────────────
  return selfProvisionSetup();
}

// ── Cross-app setup (uses mobile artifact) ───────────────────────────

async function crossAppSetup(artifactPath: string): Promise<void> {
  console.log(`[E2E Setup] Cross-app mode: loading artifact from ${artifactPath}`);

  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `[E2E] Cross-app artifact not found at ${artifactPath}.\n` +
        'Run the mobile integration test first with CROSS_APP_ARTIFACT_PATH set.',
    );
  }

  const artifact: CrossAppArtifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));

  // Use the artifact's backend URL for all API calls
  process.env['E2E_API_URL'] = artifact.backendBaseUrl;
  const apiUrl = artifact.backendBaseUrl;

  // ── 1. Health check ─────────────────────────────────────────────
  console.log(`[E2E Setup] Checking backend health at ${apiUrl}...`);
  const health = await checkBackendHealth();
  if (!health.ok) {
    throw new Error(
      `[E2E] Backend health check failed: ${health.message}\n` +
        'The backend must be the same one used by the mobile integration test.',
    );
  }
  console.log('[E2E Setup] Backend is healthy.');

  // ── 2. Login as mobile owner to verify credentials ──────────────
  console.log(`[E2E Setup] Logging in as mobile owner: ${artifact.ownerEmail}...`);
  const ownerLogin = await loginUser(artifact.ownerEmail, artifact.ownerPassword);
  const ownerProfile = await getCurrentUser(ownerLogin.accessToken);
  console.log(`[E2E Setup] Owner logged in: ${ownerProfile.fullName} (${ownerProfile.userId})`);

  // ── 3. Register a fresh viewer user ─────────────────────────────
  const uuid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const viewerEmail = `e2e-viewer-${uuid}@test.local`;
  const viewerPassword = randomBytes(18).toString('base64url');

  console.log('[E2E Setup] Registering viewer user...');
  const viewer = await registerUser(viewerEmail, viewerPassword, 'E2E Viewer');
  console.log(`[E2E Setup] Viewer registered: ${viewer.userId}`);

  // ── 4. Try admin promotion + viewer grant ───────────────────────
  const adminEmail = process.env['E2E_ADMIN_EMAIL'] || 'admin@example.com';
  const adminPassword = process.env['E2E_ADMIN_PASSWORD'];
  if (!adminPassword) {
    throw new Error(
      'E2E_ADMIN_PASSWORD environment variable is required for E2E setup (not hardcoded in this public repo).',
    );
  }
  let viewerCanSeeUpload = false;

  try {
    console.log('[E2E Setup] Logging in as seeded admin...');
    const admin = await loginUser(adminEmail, adminPassword);
    console.log('[E2E Setup] Promoting owner to admin...');
    await promoteToAdmin(admin.accessToken, ownerProfile.userId);

    // Re-login owner to get a token with the admin role claim
    const ownerRelogin = await loginUser(artifact.ownerEmail, artifact.ownerPassword);
    ownerLogin.accessToken = ownerRelogin.accessToken;

    console.log('[E2E Setup] Granting viewer access to mobile-created upload...');
    await createAccessGrant(ownerLogin.accessToken, {
      subjectUserId: viewer.userId,
      resourceType: 'upload',
      resourceId: artifact.uploadId,
      reason: 'Cross-app E2E test grant',
    });
    viewerCanSeeUpload = true;
    console.log('[E2E Setup] Access grant created.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[E2E Setup] Admin/grant flow skipped: ${msg}\n` +
        'Owner UI tests will still run. Viewer access test will be skipped.\n' +
        'To enable: seed the admin and ensure admin credentials are correct.',
    );
  }

  // ── 5. Save provisioned data (same format as self-provision mode) ─
  const provisioned = {
    ownerEmail: artifact.ownerEmail,
    ownerPassword: artifact.ownerPassword,
    viewerEmail,
    viewerPassword,
    propertyId: artifact.propertyId,
    talhaoId: artifact.talhaoId,
    cropTypeId: artifact.cropTypeId,
    estadioId: artifact.estadioId,
    uploadId: artifact.uploadId,
    adminEmail,
    adminPassword,
    ownerIsAdmin: viewerCanSeeUpload,
    viewerCanSeeUpload,
  };
  fs.writeFileSync(PROVISIONED_PATH, JSON.stringify(provisioned, null, 2));
  console.log('[E2E Setup] Cross-app provisioned data saved to', PROVISIONED_PATH);
  console.log('[E2E Setup] Done (cross-app mode).');
}

// ── Self-provisioning mode (original flow) ───────────────────────────

async function selfProvisionSetup(): Promise<void> {
  const apiUrl = process.env['E2E_API_URL'] || 'http://localhost:3000/api';

  // ── 1. Health check ─────────────────────────────────────────────────
  console.log(`[E2E Setup] Checking backend health at ${apiUrl}...`);
  const health = await checkBackendHealth();
  if (!health.ok) {
    throw new Error(
      `[E2E] Backend health check failed: ${health.message}\n` +
        'Start the backend first:\n' +
        '  cd ../backend && docker compose up -d\n' +
        '  # Ensure worker is also running for upload finalization.',
    );
  }
  console.log('[E2E Setup] Backend is healthy (API + DB + storage).');

  // ── 2. Generate unique identifiers ──────────────────────────────────
  const uuid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const ownerEmail = `e2e-owner-${uuid}@test.local`;
  const ownerPassword = randomBytes(18).toString('base64url');
  const viewerEmail = `e2e-viewer-${uuid}@test.local`;
  const viewerPassword = randomBytes(18).toString('base64url');

  // ── 3. Register users ───────────────────────────────────────────────
  console.log('[E2E Setup] Registering owner user...');
  const owner = await registerUser(ownerEmail, ownerPassword, 'E2E Owner');
  console.log(`[E2E Setup] Owner registered: ${owner.userId}`);

  console.log('[E2E Setup] Registering viewer user...');
  const viewer = await registerUser(viewerEmail, viewerPassword, 'E2E Viewer');
  console.log(`[E2E Setup] Viewer registered: ${viewer.userId}`);

  // ── 4. Promote owner to admin ───────────────────────────────────────
  const adminEmail = process.env['E2E_ADMIN_EMAIL'] || 'admin@example.com';
  const adminPassword = process.env['E2E_ADMIN_PASSWORD'];
  if (!adminPassword) {
    throw new Error(
      'E2E_ADMIN_PASSWORD environment variable is required for E2E setup (not hardcoded in this public repo).',
    );
  }
  let ownerIsAdmin = false;

  try {
    console.log('[E2E Setup] Logging in as seeded admin...');
    const admin = await loginUser(adminEmail, adminPassword);
    console.log('[E2E Setup] Promoting owner to admin...');
    await promoteToAdmin(admin.accessToken, owner.userId);
    // Re-login owner to get a token with the admin role claim
    const ownerRelogin = await loginUser(ownerEmail, ownerPassword);
    owner.accessToken = ownerRelogin.accessToken;
    ownerIsAdmin = true;
    console.log('[E2E Setup] Owner promoted to admin.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[E2E Setup] Could not promote owner to admin: ${msg}\n` +
        'Admin-dependent tests will be skipped.\n' +
        'Ensure the admin is seeded: cd ../backend && npm run db:seed:first-admin',
    );
  }

  // ── 5. Create catalogs ──────────────────────────────────────────────
  console.log('[E2E Setup] Creating catalogs...');
  const propertyId = await createProperty(owner.accessToken, {
    name: `E2E Farm ${uuid}`,
    owner: 'E2E Owner',
    address: 'E2E Address 123',
    latitude: -22.9,
    longitude: -43.1,
  });
  const talhaoId = await createTalhao(owner.accessToken, `Talhao ${uuid}`, propertyId);
  const cropTypeId = await createCropType(owner.accessToken, `Soja ${uuid}`);
  const estadioId = await createEstadio(owner.accessToken, `V1 ${uuid}`, cropTypeId);
  console.log('[E2E Setup] Catalogs created.');

  // ── 6. Create a ready upload ────────────────────────────────────────
  console.log('[E2E Setup] Creating upload (requires worker)...');
  const uploadId = await createReadyUpload(owner.accessToken, {
    propertyId,
    talhaoId,
    cropTypeId,
    estadioId,
  });
  console.log(`[E2E Setup] Upload ready: ${uploadId}`);

  // ── 7. Grant viewer access to the upload ────────────────────────────
  let viewerCanSeeUpload = false;
  if (ownerIsAdmin) {
    try {
      console.log('[E2E Setup] Creating access grant for viewer...');
      await createAccessGrant(owner.accessToken, {
        subjectUserId: viewer.userId,
        resourceType: 'upload',
        resourceId: uploadId,
        reason: 'E2E test grant',
      });
      viewerCanSeeUpload = true;
      console.log('[E2E Setup] Access grant created.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[E2E Setup] Could not create access grant: ${msg}`);
    }
  } else {
    console.warn('[E2E Setup] Skipping access grant — owner is not admin.');
  }

  // ── 8. Save provisioned data ────────────────────────────────────────
  const provisioned = {
    ownerEmail,
    ownerPassword,
    viewerEmail,
    viewerPassword,
    propertyId,
    talhaoId,
    cropTypeId,
    estadioId,
    uploadId,
    adminEmail,
    adminPassword,
    ownerIsAdmin,
    viewerCanSeeUpload,
  };
  fs.writeFileSync(PROVISIONED_PATH, JSON.stringify(provisioned, null, 2));
  console.log('[E2E Setup] Provisioned data saved to', PROVISIONED_PATH);
  console.log('[E2E Setup] Done.');
}
