import { randomBytes } from 'node:crypto';
import { test, expect, type Page, type CDPSession } from '@playwright/test';
import {
  registerUser,
  createProperty,
  createTalhao,
  createCropType,
  createEstadio,
  loginAsBrowser,
} from './helpers';
import type { OfflineUpload } from '../src/app/shared/models/offline-upload';
import type { UploadDetail, UploadRecord } from '../src/app/shared/models/upload-record';

const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVQImWP4z8DwnwGM/zMwAAAf7gP9qS/A4gAAAABJRU5ErkJggg==',
  'base64',
);

async function queue(page: Page): Promise<OfflineUpload[]> {
  return page.evaluate(
    () =>
      new Promise<OfflineUpload[]>((resolve, reject) => {
        const open = indexedDB.open('agrolens-offline', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const request = database.transaction('uploads').objectStore('uploads').getAll();
          request.onsuccess = () => {
            resolve(request.result);
            database.close();
          };
          request.onerror = () => {
            reject(request.error);
            database.close();
          };
        };
      }),
  );
}

async function choose(page: Page, name: string, label: string): Promise<void> {
  await page.locator(`mat-select[name="${name}"]`).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

const networkSessions = new WeakMap<Page, CDPSession>();

async function offlineState(page: Page, offline: boolean): Promise<void> {
  await page.context().setOffline(offline);
  // Chromium resets navigator.onLine during a SW-served navigation. Control its
  // DOM network state as well as request blocking, without mocking API responses.
  let session = networkSessions.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    networkSessions.set(page, session);
  }
  await session.send('Network.overrideNetworkState', {
    offline,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(!offline);
}

test('production PWA cold-starts offline, saves all catalogs and GPS, then resumes sync outside the queue', async ({
  page,
  context,
}) => {
  const suffix = randomBytes(6).toString('hex');
  const owner = await registerUser(
    `pwa-${suffix}@test.local`,
    randomBytes(18).toString('base64url'),
    'PWA Field Collector',
  );
  const names = {
    property: `PWA farm ${suffix}`,
    talhao: `PWA field ${suffix}`,
    crop: `PWA crop ${suffix}`,
    estadio: `PWA stage ${suffix}`,
  };
  const propertyId = await createProperty(owner.accessToken, {
    name: names.property,
    owner: 'PWA',
    address: 'Field',
    latitude: -25.4,
    longitude: -51.4,
  });
  const talhaoId = await createTalhao(owner.accessToken, names.talhao, propertyId);
  const cropTypeId = await createCropType(owner.accessToken, names.crop);
  const estadioId = await createEstadio(owner.accessToken, names.estadio, cropTypeId);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -25.4, longitude: -51.4, accuracy: 6 });
  await loginAsBrowser(page, owner.email, owner.password);

  // Preparation is required on the dashboard, before ever visiting the upload form.
  await expect(page.getByRole('button', { name: /Pronto para coleta offline/ })).toBeVisible({
    timeout: 60000,
  });
  await offlineState(page, true);
  await page.goto('/');
  await offlineState(page, true);
  await expect(page).toHaveURL(/\/uploads\/queue$/);
  await page.getByRole('link', { name: 'Novo lote' }).click();
  await choose(page, 'propertyId', names.property);
  await choose(page, 'talhaoId', names.talhao);
  await choose(page, 'cropTypeId', names.crop);
  await choose(page, 'estadioId', names.estadio);
  await page.getByRole('button', { name: 'Minha localização' }).click();
  await expect(page.locator('.coordinates')).toContainText('-25.400000, -51.400000');
  await expect(page.locator('.location-picker__map')).toBeHidden();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'field.png', mimeType: 'image/png', buffer: image });
  await page.getByRole('button', { name: 'Salvar na fila' }).click();
  await expect(page).toHaveURL(/\/uploads\/queue$/);
  await page.reload();
  await offlineState(page, true);
  await expect(page.getByText('1 imagem(ns)', { exact: true })).toBeVisible();
  const [saved] = await queue(page);
  expect(saved.userId).toBe(owner.userId);
  expect(saved.request).toMatchObject({
    propertyId,
    talhaoId,
    cropTypeId,
    estadioId,
    latitude: -25.4,
    longitude: -51.4,
  });
  expect(saved.files).toHaveLength(1);

  // Reconnect on another route. Revoking the cookie emulates a server-session expiry.
  await context.clearCookies();
  await page.getByRole('link', { name: 'Novo lote' }).click();
  await expect(page).toHaveURL(/\/uploads\/new$/);
  await offlineState(page, false);
  await page.locator('app-offline-status button').click();
  await expect(page.getByText(/A sessão online expirou ou mudou/)).toBeVisible({ timeout: 30000 });
  expect((await queue(page))[0].userId).toBe(owner.userId);
  await offlineState(page, true);
  await page.goto('/');
  await offlineState(page, true);
  await expect(page).toHaveURL(/\/uploads\/queue$/);
  await expect(page.getByText('1 imagem(ns)', { exact: true })).toBeVisible();

  await offlineState(page, false);
  await loginAsBrowser(page, owner.email, owner.password);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect.poll(async () => (await queue(page)).length, { timeout: 120000 }).toBe(0);
  const api = process.env['E2E_API_URL'] || 'http://localhost:3000/api';
  const headers = { Authorization: `Bearer ${owner.accessToken}` };
  const response = await fetch(`${api}/uploads?propertyId=${propertyId}`, { headers });
  expect(response.ok).toBeTruthy();
  const result = (await response.json()) as { uploads: UploadRecord[]; total: number };
  expect(result.total).toBe(1);
  expect(result.uploads).toHaveLength(1);
  const detailResponse = await fetch(`${api}/uploads/${result.uploads[0].id}`, { headers });
  expect(detailResponse.ok).toBeTruthy();
  const detail = (await detailResponse.json()) as UploadDetail;
  expect(detail).toMatchObject({
    clientUploadId: saved.request.clientUploadId,
    userId: owner.userId,
    status: 'ready',
    propertyId,
    talhaoId,
    cropTypeId,
    estadioId,
    latitude: -25.4,
    longitude: -51.4,
  });
});
