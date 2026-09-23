/**
 * E2E spec — upload creation via the full UI form flow.
 *
 * Exercises the /uploads/new page end-to-end:
 *   - Catalog dropdowns (property → talhão, crop type → estádio)
 *   - Activity date via calendar picker
 *   - GPS coordinates via manual input
 *   - File selection via Playwright setInputFiles
 *   - Local queue save followed by immediate online sync
 *   - Full upload pipeline: init → presigned PUT → complete → poll
 *   - Completion card with link to detail
 *
 * Requires backend + worker running.  Uses the same provisioned data
 * as real-backend.spec.ts (global-setup.ts).
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loginAsBrowser, stubMapTiles } from './helpers';

// ── Load provisioned data ───────────────────────────────────────────────

interface ProvisionedData {
  ownerEmail: string;
  ownerPassword: string;
  adminEmail: string;
  adminPassword: string;
  ownerIsAdmin: boolean;
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

// ── Minimal 2×2 red PNG (same as helpers.ts) ───────────────────────────

const MINIMAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVQImWP4z8DwnwGM/zMwAAAf7gP9qS/A4gAAAABJRU5ErkJggg==';

// ── Tests ───────────────────────────────────────────────────────────────

test.describe('Upload creation via UI', () => {
  // Full pipeline: init → presigned PUT → complete → poll ready.
  // Worker must be running; generous timeout for finalization.
  test('create upload through the full form flow', async ({ page }) => {
    test.setTimeout(180_000);

    await stubMapTiles(page);
    await loginAsBrowser(page, data.ownerEmail, data.ownerPassword);

    // Navigate to the upload creation page
    await page.goto('/uploads/new');

    // Wait for the two-column form layout to appear (catalogs loaded)
    await page.locator('.upload-create__layout').waitFor({ timeout: 20_000 });

    // ── Select Property ─────────────────────────────────────────────
    await page.locator('mat-select[name="propertyId"]').click();
    await page
      .locator('.mat-mdc-select-panel mat-option')
      .filter({ hasText: 'E2E Farm' })
      .first()
      .click();

    // ── Select Talhão (filtered by selected property) ───────────────
    await page.locator('mat-select[name="talhaoId"]').click();
    await page
      .locator('.mat-mdc-select-panel mat-option')
      .filter({ hasText: 'Talhao' })
      .first()
      .click();

    // ── Select Crop Type ────────────────────────────────────────────
    await page.locator('mat-select[name="cropTypeId"]').click();
    await page
      .locator('.mat-mdc-select-panel mat-option')
      .filter({ hasText: 'Soja' })
      .first()
      .click();

    // ── Select Estádio (optional — gracefully skip if unavailable) ──
    try {
      await page.locator('mat-select[name="estadioId"]').click();
      const estadioPanel = page.locator('.mat-mdc-select-panel');
      await estadioPanel.waitFor({ state: 'visible', timeout: 3_000 });
      const v1Option = estadioPanel.locator('mat-option').filter({ hasText: 'V1' });
      if ((await v1Option.count()) > 0) {
        await v1Option.first().click();
      } else {
        await page.keyboard.press('Escape');
      }
    } catch {
      // Estádio is optional — continue without it
    }

    // ── Source: default is 'phone' (Celular) — no change needed ─────

    // ── Activity date ────────────────────────────────────────────────
    // Fill the Material datepicker input directly. The NativeDateAdapter
    // parses date strings via Date.parse(); the M/d/yyyy format is
    // reliably parsed in Chromium's en-US locale.
    const dateInput = page.locator('input[name="activityDate"]');
    await dateInput.click();
    const today = new Date();
    const dateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
    await dateInput.fill(dateStr);
    // Trigger ngModelChange by pressing Tab (blur)
    await dateInput.press('Tab');
    // Confirm the input received the value
    await expect(dateInput).not.toBeEmpty({ timeout: 3_000 });

    // ── GPS coordinates via map click ────────────────────────────────
    // The Leaflet map is initialized in ngAfterViewInit with a delay.
    // Wait for the .leaflet-container class that Leaflet adds when ready.
    await page.waitForSelector('.leaflet-container', { timeout: 10_000 });
    await page.waitForTimeout(500); // let the map finish rendering tiles

    // Click the center of the map to drop a marker and emit locationSelected.
    const mapEl = page.locator('.location-picker__map');
    const mapBox = await mapEl.boundingBox();
    if (!mapBox) {
      throw new Error('Location picker map not found');
    }
    await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);

    // Wait for the coordinates badge that the LocationPicker shows
    // once a location has been selected.
    await expect(page.locator('.coordinates')).toBeVisible({
      timeout: 5_000,
    });

    // ── File upload via hidden file input ────────────────────────────
    const fileInput = page.locator('input[type="file"][accept*="image"]');
    await fileInput.setInputFiles({
      name: 'e2e-test.png',
      mimeType: 'image/png',
      buffer: Buffer.from(MINIMAL_PNG_BASE64, 'base64'),
    });

    // Verify the file count label updated
    await expect(page.getByText('1 imagem(ns) selecionada(s)')).toBeVisible({ timeout: 5_000 });

    // Preview thumbnail should appear
    await expect(page.locator('.preview-item').first()).toBeVisible({
      timeout: 5_000,
    });

    // ── Submit ───────────────────────────────────────────────────────
    const submitBtn = page.getByRole('button', { name: /Criar Upload/ });
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // Progress card should appear (file upload / finalization phases).
    // If onSubmit() returned early (missing date/location), no progress card
    // will appear and the test will fail here with a clear timeout message.
    await expect(page.locator('.progress-card')).toBeVisible({
      timeout: 15_000,
    });

    // Wait for the completion card — requires worker to finalize the upload
    await expect(page.locator('.completion-card')).toBeVisible({
      timeout: 150_000,
    });

    // Verify success text (appears in both the toast and the card heading)
    await expect(page.getByText('Upload criado com sucesso!').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Ver detalhes do upload/ })).toBeVisible();
  });
});
