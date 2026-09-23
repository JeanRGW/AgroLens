/**
 * API provisioning helpers for real-backend browser E2E tests.
 *
 * These helpers make direct HTTP calls to the running backend API
 * (using clientType: 'mobile' for token-based auth) to set up test data
 * before browser assertions.
 */

import { type Page } from '@playwright/test';

const API = process.env['E2E_API_URL'] || 'http://localhost:3000/api';

/** Return the API base URL, respecting any runtime override via env. */
function getApi(): string {
  return process.env['E2E_API_URL'] || API;
}

// ── Low-level fetch helpers ─────────────────────────────────────────────

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  return fetch(`${getApi()}${path}`, { ...options, headers });
}

async function apiFetchAuth(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(options.headers as Record<string, string> | undefined),
  };
  return apiFetch(path, { ...options, headers });
}

async function throwIfNotOk(res: Response, label: string): Promise<Response> {
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown');
    throw new Error(`${label} failed (${res.status}): ${text.slice(0, 500)}`);
  }
  return res;
}

// ── Health check ────────────────────────────────────────────────────────

export async function checkBackendHealth(): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await apiFetch('/health');
    if (!res.ok) return { ok: false, message: `Health endpoint returned ${res.status}` };
    const body = (await res.json()) as { status: string };
    if (body.status !== 'ok') return { ok: false, message: `Health status: ${body.status}` };
    return { ok: true };
  } catch {
    return { ok: false, message: 'Backend not reachable (connection refused)' };
  }
}

// ── Auth helpers ────────────────────────────────────────────────────────

export interface UserData {
  userId: string;
  email: string;
  password: string;
  fullName: string;
  accessToken: string;
}

export async function registerUser(
  email: string,
  password: string,
  fullName: string,
): Promise<UserData> {
  const res = await throwIfNotOk(
    await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName, clientType: 'mobile' }),
    }),
    'Register',
  );
  const body = (await res.json()) as {
    user: { id: string; email: string; fullName: string; role: string };
    accessToken: string;
  };
  return {
    userId: body.user.id,
    email,
    password,
    fullName,
    accessToken: body.accessToken,
  };
}

export async function loginUser(
  email: string,
  password: string,
): Promise<{ userId: string; accessToken: string }> {
  const res = await throwIfNotOk(
    await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, clientType: 'mobile' }),
    }),
    'Login',
  );
  const body = (await res.json()) as {
    accessToken: string;
    user?: { id: string };
  };
  let userId = body.user?.id ?? '';
  if (!userId) {
    const meRes = await throwIfNotOk(
      await apiFetchAuth('/auth/me', body.accessToken),
      'Load current user',
    );
    const me = (await meRes.json()) as { id?: string; user?: { id: string } };
    userId = me.user?.id ?? me.id ?? '';
  }
  return { userId, accessToken: body.accessToken };
}

/** Fetch the current user profile from /auth/me using an existing token. */
export async function getCurrentUser(
  token: string,
): Promise<{ userId: string; fullName: string; email: string }> {
  const res = await throwIfNotOk(await apiFetchAuth('/auth/me', token), 'Get current user');
  const body = (await res.json()) as {
    id?: string;
    user?: { id: string; fullName: string; email: string };
    fullName?: string;
    email?: string;
  };
  const userId = body.user?.id ?? body.id ?? '';
  const fullName = body.user?.fullName ?? body.fullName ?? 'Owner';
  const email = body.user?.email ?? body.email ?? '';
  return { userId, fullName, email };
}

export async function promoteToAdmin(adminToken: string, userId: string): Promise<void> {
  await throwIfNotOk(
    await apiFetchAuth(`/admin/users/${userId}/role`, adminToken, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'admin' }),
    }),
    'Promote to admin',
  );
}

// ── Catalog helpers ─────────────────────────────────────────────────────

export async function createProperty(
  token: string,
  data: {
    name: string;
    owner: string;
    address: string;
    latitude: number;
    longitude: number;
  },
): Promise<string> {
  const res = await throwIfNotOk(
    await apiFetchAuth('/properties', token, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    'Create property',
  );
  const body = (await res.json()) as { property?: { id: string }; id?: string };
  return body.property?.id ?? body.id!;
}

export async function createTalhao(
  token: string,
  name: string,
  propertyId: string,
): Promise<string> {
  const res = await throwIfNotOk(
    await apiFetchAuth('/talhoes', token, {
      method: 'POST',
      body: JSON.stringify({ name, propertyId }),
    }),
    'Create talhao',
  );
  const body = (await res.json()) as { talhao?: { id: string }; id?: string };
  return body.talhao?.id ?? body.id!;
}

export async function createCropType(token: string, name: string): Promise<string> {
  const res = await throwIfNotOk(
    await apiFetchAuth('/crop-types', token, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
    'Create crop type',
  );
  const body = (await res.json()) as {
    cropType?: { id: string };
    id?: string;
  };
  return body.cropType?.id ?? body.id!;
}

export async function createEstadio(
  token: string,
  name: string,
  cropTypeId: string,
): Promise<string> {
  const res = await throwIfNotOk(
    await apiFetchAuth('/estadios', token, {
      method: 'POST',
      body: JSON.stringify({ name, cropTypeId }),
    }),
    'Create estadio',
  );
  const body = (await res.json()) as {
    estadio?: { id: string };
    id?: string;
  };
  return body.estadio?.id ?? body.id!;
}

// ── Upload helpers ──────────────────────────────────────────────────────

/** Minimal valid 2×2 red PNG (same as backend e2e-helpers.ts). */
const MINIMAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVQImWP4z8DwnwGM/zMwAAAf7gP9qS/A4gAAAABJRU5ErkJggg==';

/**
 * Run the full upload pipeline: init → presigned PUT → complete → poll.
 *
 * Requires the backend worker to be running for finalization.
 * Times out after ~60 seconds if the upload never reaches 'ready'.
 */
export async function createReadyUpload(
  token: string,
  catalogs: {
    propertyId: string;
    talhaoId: string;
    cropTypeId: string;
    estadioId: string;
  },
): Promise<string> {
  const clientUploadId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const imageBuffer = Buffer.from(MINIMAL_PNG_BASE64, 'base64');

  // 1. Init upload with 2 files so YOLO train/val split has >=2 images.
  const initRes = await throwIfNotOk(
    await apiFetchAuth('/uploads/init', token, {
      method: 'POST',
      body: JSON.stringify({
        clientUploadId,
        propertyId: catalogs.propertyId,
        talhaoId: catalogs.talhaoId,
        cropTypeId: catalogs.cropTypeId,
        estadioId: catalogs.estadioId,
        source: 'phone',
        activityDate: new Date().toISOString(),
        latitude: -22.9,
        longitude: -43.1,
        files: [
          {
            imageIndex: 0,
            contentType: 'image/png',
            fileName: 'e2e-test-0.png',
            sizeBytes: imageBuffer.length,
          },
          {
            imageIndex: 1,
            contentType: 'image/png',
            fileName: 'e2e-test-1.png',
            sizeBytes: imageBuffer.length,
          },
        ],
      }),
    }),
    'Init upload',
  );
  const initBody = (await initRes.json()) as {
    uploadId: string;
    id?: string;
    files: Array<{ imageIndex: number; uploadUrl: string; url?: string }>;
    presignedUrls?: Array<{ imageIndex: number; url: string }>;
  };

  // Handle both backend response formats
  const uploadId = initBody.uploadId ?? initBody.id!;

  // 2. Upload image bytes to all presigned URLs
  const fileEntries = initBody.files ?? [];
  const presignedUrls =
    fileEntries.length > 0
      ? fileEntries.map((f) => f.uploadUrl ?? f.url)
      : (initBody.presignedUrls ?? []).map((p) => p.url);

  for (let idx = 0; idx < presignedUrls.length; idx++) {
    const url = presignedUrls[idx];
    if (!url) {
      throw new Error(`Init upload response missing presigned URL for file index ${idx}`);
    }
    const putRes = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: new Uint8Array(imageBuffer),
    });
    if (!putRes.ok) {
      const text = await putRes.text().catch(() => 'unknown');
      throw new Error(
        `Presigned PUT failed for file ${idx} (${putRes.status}): ${text.slice(0, 300)}`,
      );
    }
  }

  // 3. Complete upload (triggers finalization)
  await throwIfNotOk(
    await apiFetchAuth(`/uploads/${uploadId}/complete`, token, {
      method: 'POST',
    }),
    'Complete upload',
  );

  // 4. Poll until ready (worker must be running)
  const MAX_ATTEMPTS = 20;
  const POLL_INTERVAL_MS = 3000;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const detailRes = await apiFetchAuth(`/uploads/${uploadId}`, token);
    if (!detailRes.ok) continue;
    const detail = (await detailRes.json()) as { status: string };
    if (detail.status === 'ready') return uploadId;
    if (detail.status === 'failed') {
      throw new Error('Upload finalization failed. Check backend worker logs.');
    }
  }
  throw new Error(
    `Upload not ready after ${MAX_ATTEMPTS} polling attempts (~${(MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s). ` +
      'Ensure the backend worker is running (docker compose up worker).',
  );
}

// ── Annotation helpers ────────────────────────────────────────────────

/** Save (upsert) an annotation for a specific image via the backend API. */
export async function saveAnnotation(
  token: string,
  uploadId: string,
  annotation: {
    imageIndex: number;
    imageWidth: number;
    imageHeight: number;
    classes: string[];
    labels: Array<{
      classId: number;
      className: string;
      xCenter: number;
      yCenter: number;
      width: number;
      height: number;
    }>;
  },
): Promise<void> {
  await throwIfNotOk(
    await apiFetchAuth(`/uploads/${uploadId}/annotations/${annotation.imageIndex}`, token, {
      method: 'PUT',
      body: JSON.stringify({ uploadId, ...annotation }),
    }),
    'Save annotation',
  );
}

// ── Access grant helper ─────────────────────────────────────────────────

export async function createAccessGrant(
  token: string,
  data: {
    subjectUserId: string;
    resourceType: string;
    resourceId: string;
    reason?: string;
  },
): Promise<void> {
  await throwIfNotOk(
    await apiFetchAuth('/access-grants', token, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    'Create access grant',
  );
}

// ── Browser login helper (E2E specs) ──────────────────────────────────────

/**
 * Login via the Angular Material login form.
 *
 * Uses formControlName attribute for Angular reactive form inputs.
 * Waits for the app shell to appear after successful login.
 * Retries once on failure with a longer timeout.
 */
export async function loginAsBrowser(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');

  // If session is already valid, Angular may redirect to dashboard automatically.
  if (page.url().includes('/dashboard')) {
    return;
  }

  // Wait for the login form card to be visible (Angular may restore session first)
  await page.locator('.login-card').waitFor({ state: 'visible', timeout: 15_000 });

  // If the session restore redirected us while waiting, we're done
  if (page.url().includes('/dashboard')) {
    return;
  }

  // Fill email and trigger Angular change detection
  const emailInput = page.locator('input[formcontrolname="email"]');
  await emailInput.click();
  await emailInput.fill(email);

  // Fill password and trigger Angular change detection
  const passwordInput = page.locator('input[formcontrolname="password"]');
  await passwordInput.click();
  await passwordInput.fill(password);

  // Click the submit button (type="submit" on the form)
  const submitBtn = page.locator('button[type="submit"]');
  await submitBtn.click();

  // Wait for either: successful login (shell appears) or failed login (error snackbar).
  // If login fails, retry once by clearing and refilling the form.
  try {
    await page.locator('.shell-container').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
  } catch {
    // Login may have failed (snackbar error) — retry once
    await page.locator('input[formcontrolname="email"]').fill('');
    await page.locator('input[formcontrolname="email"]').fill(email);
    await page.locator('input[formcontrolname="password"]').fill('');
    await page.locator('input[formcontrolname="password"]').fill(password);
    await submitBtn.click();
    await page.locator('.shell-container').waitFor({
      state: 'visible',
      timeout: 30_000,
    });
  }
}
