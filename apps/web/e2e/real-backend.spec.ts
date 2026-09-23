/**
 * Real-backend browser E2E spec — critical flows.
 *
 * Tests core web behavior against a running backend:
 *   - Login through the web UI → dashboard visible
 *   - Shell sidebar navigation links present (including admin for admin users)
 *   - Upload list shows the provisioned ready upload
 *   - Upload detail page shows metadata and files
 *   - Upload detail dialog opens from list
 *   - Labeling page loads for a provisioned upload
 *   - Properties metadata page loads and shows provisioned property
 *   - Viewer access via admin-granted permission
 *   - Logout redirects to login
 *
 * Data is provisioned by global-setup.ts via direct API calls.
 * Each test uses a fresh browser context (independent login).
 *
 * Locators use role/text/label selectors where possible for stability
 * against markup changes, falling back to stable Angular Material
 * CSS classes (e.g. `.records-table`) only where role-based selectors
 * are ambiguous.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loginAsBrowser, stubMapTiles } from './helpers';

// ── Load provisioned data ───────────────────────────────────────────────

interface ProvisionedData {
  ownerEmail: string;
  ownerPassword: string;
  viewerEmail: string;
  viewerPassword: string;
  propertyId: string;
  talhaoId: string;
  cropTypeId: string;
  estadioId: string;
  uploadId: string;
  adminEmail: string;
  adminPassword: string;
  ownerIsAdmin: boolean;
  viewerCanSeeUpload: boolean;
}

function loadProvisioned(): ProvisionedData {
  const p = path.join(__dirname, '.auth', 'provisioned.json');
  if (!fs.existsSync(p)) {
    throw new Error(
      'Provisioned data not found at ' + p + '. Global setup may have failed. Run: npm run e2e',
    );
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

const data = loadProvisioned();
const uploadIdPrefix = data.uploadId.slice(0, 8);

// ── Tests ───────────────────────────────────────────────────────────────

test.describe('Real-backend critical flows', () => {
  // ── Login & Dashboard ────────────────────────────────────────────

  test('login as owner and see dashboard', async ({ page }) => {
    await loginAsBrowser(page, data.ownerEmail, data.ownerPassword);

    // Dashboard page title (rendered by PageHeaderComponent)
    await expect(page.getByText('Panorama de Uploads')).toBeVisible();

    // User name in the toolbar user-chip
    await expect(page.locator('.user-chip-name')).toContainText('E2E Owner');

    // At least one KPI card visible
    await expect(page.locator('.kpi-card').first()).toBeVisible();

    // KPI label "Total de Uploads" present
    await expect(page.getByText('Total de Uploads')).toBeVisible();
  });

  // ── Sidebar Navigation ───────────────────────────────────────────

  test('shell sidebar has expected navigation links', async ({ page }) => {
    await loginAsBrowser(page, data.ownerEmail, data.ownerPassword);

    // Brand
    await expect(page.getByText('AgroLens')).toBeVisible();

    // Main nav items (rendered as mat-list-item links)
    for (const label of ['Dashboard', 'Uploads', 'Novo Upload', 'Anotação']) {
      await expect(
        page.getByRole('link', { name: label }),
        `Nav link "${label}" should be visible`,
      ).toBeVisible();
    }

    // Management section
    for (const label of ['Propriedades', 'Talhões', 'Culturas', 'Estádios']) {
      await expect(
        page.getByRole('link', { name: label }),
        `Management link "${label}" should be visible`,
      ).toBeVisible();
    }

    // Admin section visible (owner was promoted to admin)
    if (data.ownerIsAdmin) {
      await expect(page.getByText('Administração')).toBeVisible();
      for (const label of ['Usuários', 'Acessos', 'Auditoria']) {
        await expect(
          page.getByRole('link', { name: label }),
          `Admin link "${label}" should be visible`,
        ).toBeVisible();
      }
    }
  });

  // ── Uploads List ─────────────────────────────────────────────────

  test('uploads list shows the provisioned ready upload', async ({ page }) => {
    await loginAsBrowser(page, data.ownerEmail, data.ownerPassword);

    await page.goto('/uploads');

    // Wait for the uploads table to load
    await page.locator('.records-table tbody tr').first().waitFor({ timeout: 15_000 });

    // The provisioned upload ID prefix should appear in the table
    const tableBody = page.locator('.records-table tbody');
    await expect(tableBody).toContainText(uploadIdPrefix);

    // Status should show the Portuguese label "Pronto" for ready uploads
    await expect(tableBody).toContainText('Pronto');
  });

  // ── Upload Detail Page ───────────────────────────────────────────

  test('upload detail page shows metadata and images', async ({ page }) => {
    await loginAsBrowser(page, data.ownerEmail, data.ownerPassword);

    await page.goto(`/uploads/${data.uploadId}`);

    // Wait for the detail layout to render
    await page.locator('.info-card').waitFor({ timeout: 15_000 });

    // Status badge shows the raw status value
    await expect(page.locator('.status-badge')).toContainText('ready');

    // Source badge
    await expect(page.locator('.source-badge').first()).toContainText('Celular');

    // Images section visible
    await expect(page.locator('.image-card')).toBeVisible();

    // Files table section visible (collapsed by default)
    await expect(page.getByText(/Arquivos \(\d+\)/)).toBeVisible();

    // "Anotar" action button visible (rendered as <button> with routerLink)
    await expect(page.getByRole('button', { name: /Anotar/ })).toBeVisible();
  });

  // ── Upload Detail Dialog (from list) ─────────────────────────────

  test('upload detail dialog opens from list click', async ({ page }) => {
    await loginAsBrowser(page, data.ownerEmail, data.ownerPassword);

    await page.goto('/uploads');

    // Wait for table rows
    await page.locator('.records-table tbody tr').first().waitFor({ timeout: 15_000 });

    // Click the "Ver detalhes" (eye icon) button on the row with our upload
    const row = page.locator('.records-table tbody tr').filter({ hasText: uploadIdPrefix });
    await row.locator('button[title*="Ver detalhes"]').click();

    // Dialog should open with upload info
    const dialog = page.locator('mat-dialog-container');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Dialog contains the info panel
    await expect(dialog).toContainText('Informacoes');

    // Source badge in dialog
    await expect(dialog.locator('.source-badge').first()).toContainText('Celular');

    // Close the dialog
    await dialog.getByRole('button', { name: /Fechar/ }).click();
    await expect(dialog).not.toBeVisible();
  });

  // ── Labeling Page Smoke ──────────────────────────────────────────

  test('labeling page loads for provisioned upload', async ({ page }) => {
    test.setTimeout(90_000);

    await loginAsBrowser(page, data.ownerEmail, data.ownerPassword);

    // Navigate to labeling with the upload pre-selected
    await page.goto(`/labeling?uploadId=${data.uploadId}`);

    // Wait for the canvas area to appear (upload auto-selected by query param)
    await page.locator('.canvas-area').waitFor({ timeout: 30_000 });

    // Canvas area visible
    await expect(page.locator('.canvas-area')).toBeVisible();

    // Save button visible
    await expect(page.getByRole('button', { name: /Salvar/ }).first()).toBeVisible();

    // Class palette visible (default class "objeto" present)
    await expect(page.getByText('objeto')).toBeVisible();

    // The upload sidebar should show the provisioned upload
    await expect(page.locator('.upload-item-title').first()).toContainText(uploadIdPrefix);
  });

  // ── Metadata Page Smoke (Properties) ─────────────────────────────

  test('properties page loads and shows provisioned property', async ({ page }) => {
    await stubMapTiles(page);
    await loginAsBrowser(page, data.ownerEmail, data.ownerPassword);

    await page.goto('/properties');

    // Wait for the table to load (not the loading spinner)
    await page.locator('table').waitFor({ timeout: 15_000 });

    // The provisioned property name should appear (E2E Farm <uuid>)
    await expect(page.locator('table')).toContainText('E2E Farm');
  });

  // ── Viewer Access via Grant ──────────────────────────────────────

  test('viewer can see the granted upload', async ({ page }) => {
    if (!data.viewerCanSeeUpload) {
      test.skip(
        true,
        'Access grant was not created (admin promotion failed). ' +
          'Seed the admin: cd ../backend && npm run db:seed:first-admin',
      );
      return;
    }

    await loginAsBrowser(page, data.viewerEmail, data.viewerPassword);

    await page.goto('/uploads');

    // Wait for the uploads table
    await page.locator('.records-table tbody').waitFor({ timeout: 15_000 });

    // The viewer should see the owner's upload via the grant
    const tableBody = page.locator('.records-table tbody');
    await expect(tableBody).toContainText(uploadIdPrefix);
    await expect(tableBody).toContainText('Pronto');
  });

  // ── Logout ───────────────────────────────────────────────────────

  test('logout redirects to login page', async ({ page }) => {
    await loginAsBrowser(page, data.ownerEmail, data.ownerPassword);

    // Click the "Sair" logout button in the toolbar
    await page.getByRole('button', { name: /Sair/ }).click();

    // Should redirect to login
    await page.waitForURL('**/login', { timeout: 10_000 });

    // Login card visible again
    await expect(page.locator('.login-card')).toBeVisible();
  });
});
