/**
 * E2E spec — annotation save and YOLO export flow.
 *
 * Exercises the labeling page (/labeling) end-to-end:
 *   - Canvas loads with provisioned upload image
 *   - Draw bounding box via mouse drag on canvas overlay
 *   - Save annotation → success snackbar
 *   - Open YOLO export dialog → verify content → close
 *   - Full YOLO ZIP download + content verification (classes.txt,
 *     data.yaml, images, labels with YOLO numeric format)
 *
 * Canvas drawing uses Playwright mouse APIs on the overlay div
 * (.canvas-area .overlay) which hosts the mousedown handler.
 * The image must be fully loaded for the overlay's content-rect
 * computation to produce a valid bounding box.
 *
 * Requires backend running (for signed URLs and annotation save).
 * Uses the same provisioned data as real-backend.spec.ts.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { loginUser, saveAnnotation, loginAsBrowser } from './helpers';

// ── Load provisioned data ───────────────────────────────────────────────

interface ProvisionedData {
  ownerEmail: string;
  ownerPassword: string;
  uploadId: string;
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

test.describe('Annotation save and export flow', () => {
  /**
   * Full annotation cycle:
   *   1. Navigate to labeling page with provisioned upload
   *   2. Wait for canvas image to load
   *   3. Draw a bounding box via mouse drag
   *   4. Save → success snackbar
   *   5. Open YOLO export dialog → verify content → close
   */
  test('draw annotation on canvas, save, and open YOLO export dialog', async ({ page }) => {
    test.setTimeout(120_000);

    await loginAsBrowser(page, data.ownerEmail, data.ownerPassword);

    // Navigate to labeling page with the provisioned upload pre-selected
    await page.goto(`/labeling?uploadId=${data.uploadId}`);

    // Wait for the canvas area to render (upload auto-selected by query param)
    await page.locator('.canvas-area').waitFor({ timeout: 30_000 });

    // Wait for the image to appear inside the canvas
    const labelImage = page.locator('.canvas-area .label-image');
    await labelImage.waitFor({ state: 'visible', timeout: 30_000 });

    // Wait for the image to be fully decoded so the overlay can compute its
    // content rect (image-canvas.component.ts: computeContentRect).
    await page.waitForFunction(
      () => {
        const img = document.querySelector('.canvas-area .label-image') as HTMLImageElement | null;
        return img != null && img.complete && img.naturalWidth > 0;
      },
      { timeout: 15_000 },
    );

    // Extra settle time for the overlay to recompute after image load
    await page.waitForTimeout(500);

    // ── Draw a bounding box on the canvas overlay ────────────────────
    // The overlay div listens for (mousedown)="startDrawing($event)"
    // and then document-level mousemove/mouseup to finish the rect.
    // Raw mouse events need viewport coordinates: scroll the canvas into
    // view first (the page content above it can push it below the fold).
    const overlay = page.locator('.canvas-area .overlay');
    await overlay.scrollIntoViewIfNeeded();
    const box = await overlay.boundingBox();
    if (!box) {
      throw new Error(
        'Canvas overlay bounding box not found. ' +
          'The image may not have loaded or the overlay is hidden.',
      );
    }

    // Draw from 25% to 75% of the overlay — comfortably above the 8px minimum.
    const startX = box.x + box.width * 0.25;
    const startY = box.y + box.height * 0.25;
    const endX = box.x + box.width * 0.75;
    const endY = box.y + box.height * 0.75;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Multiple steps so the component's mousemove handler fires reliably
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();

    // Verify a label-box element appeared on the canvas overlay
    await expect(page.locator('.canvas-area .label-box').first()).toBeVisible({
      timeout: 5_000,
    });

    // The label should carry the default class "objeto"
    await expect(page.locator('.canvas-area .label-tag').first()).toContainText('objeto');

    // ── Save the annotation ──────────────────────────────────────────
    const saveBtn = page.getByRole('button', { name: /Salvar/ }).first();
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    // Wait for the success snackbar from saveCurrentAnnotation()
    await expect(page.getByText('Rótulos salvos com sucesso.')).toBeVisible({ timeout: 15_000 });

    // ── Open YOLO export dialog ──────────────────────────────────────
    // The button fetches annotations from the API and opens the dialog
    // only if at least one annotation exists (which we just saved).
    const exportBtn = page.getByRole('button', { name: /Exportar YOLO/ });
    await expect(exportBtn).toBeEnabled({ timeout: 5_000 });
    await exportBtn.click();

    // Verify the YOLO export dialog opens
    const dialog = page.locator('mat-dialog-container');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Dialog title
    await expect(dialog.getByText('Exportar Dataset YOLO')).toBeVisible();

    // Summary section
    await expect(dialog.getByText('Resumo')).toBeVisible();

    // The "Exportar Dataset" confirm button should be present.
    // NOTE: With only 1 annotated image the train/val split yields trainCount=0,
    // which disables the button.  We verify the button exists and the dialog
    // rendered correctly without asserting enabled state.
    const confirmBtn = dialog.getByRole('button', {
      name: /Exportar Dataset/,
    });
    await expect(confirmBtn).toBeVisible();

    // Close the dialog via Cancelar
    await dialog.getByRole('button', { name: /Cancelar/ }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });

  /**
   * Smoke-level test: labeling page loads for the provisioned upload,
   * verify the YOLO export button is visible and the annotation state
   * indicators are present.  Does NOT draw or save — useful when the
   * canvas interaction test is flaky.
   */
  test('labeling page shows export controls and annotation state', async ({ page }) => {
    test.setTimeout(60_000);

    await loginAsBrowser(page, data.ownerEmail, data.ownerPassword);

    await page.goto(`/labeling?uploadId=${data.uploadId}`);

    // Canvas area renders
    await page.locator('.canvas-area').waitFor({ timeout: 30_000 });

    // Save and Export buttons visible
    await expect(page.getByRole('button', { name: /Salvar/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Exportar YOLO/ })).toBeVisible();

    // Upload sidebar shows the provisioned upload
    await expect(page.locator('.upload-item-title').first()).toContainText(uploadIdPrefix);

    // Class palette with default class
    await expect(page.getByText('objeto').first()).toBeVisible();

    // Toolbar buttons (undo, redo, clear, remove)
    await expect(page.getByRole('button', { name: /Desfazer/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Refazer/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Limpar/ })).toBeVisible();
  });

  /**
   * Full YOLO ZIP download and content verification.
   *
   * This test is self-contained: it saves annotations for both images
   * via the API before opening the export dialog, guaranteeing
   * effectiveImageCount=2 with default settings (trainCount=1, valCount=1).
   *
   * Verifies:
   * - Downloaded file is a valid ZIP
   * - Contains dataset/classes.txt with 'objeto'
   * - Contains dataset/data.yaml with expected YOLO config
   * - Contains at least one image under dataset/images/{train,val}/
   * - Contains at least one label under dataset/labels/{train,val}/
   * - Label file has YOLO-format numeric row (class xCenter yCenter w h)
   */
  test('download YOLO ZIP and verify contents', async ({ page }) => {
    test.setTimeout(120_000);

    // ── Self-contained setup: save annotations via API ────────────────
    // This eliminates dependency on the "draw annotation" test.
    const { accessToken } = await loginUser(data.ownerEmail, data.ownerPassword);

    // Save annotation for image 0 (with a bounding box label)
    await saveAnnotation(accessToken, data.uploadId, {
      imageIndex: 0,
      imageWidth: 640,
      imageHeight: 480,
      classes: ['objeto'],
      labels: [
        {
          classId: 0,
          className: 'objeto',
          xCenter: 0.5,
          yCenter: 0.5,
          width: 0.3,
          height: 0.3,
        },
      ],
    });

    // Save annotation for image 1 (with a bounding box label)
    await saveAnnotation(accessToken, data.uploadId, {
      imageIndex: 1,
      imageWidth: 640,
      imageHeight: 480,
      classes: ['objeto'],
      labels: [
        {
          classId: 0,
          className: 'objeto',
          xCenter: 0.4,
          yCenter: 0.6,
          width: 0.25,
          height: 0.25,
        },
      ],
    });

    // ── Browser login and navigate ───────────────────────────────────
    await loginAsBrowser(page, data.ownerEmail, data.ownerPassword);

    // Navigate to labeling page with the provisioned upload pre-selected.
    await page.goto(`/labeling?uploadId=${data.uploadId}`);

    // Wait for the canvas area to render (upload auto-selected by query param)
    await page.locator('.canvas-area').waitFor({ timeout: 30_000 });

    // Wait for the image to appear inside the canvas
    const labelImage = page.locator('.canvas-area .label-image');
    await labelImage.waitFor({ state: 'visible', timeout: 30_000 });

    // Wait for image to be fully decoded
    await page.waitForFunction(
      () => {
        const img = document.querySelector('.canvas-area .label-image') as HTMLImageElement | null;
        return img != null && img.complete && img.naturalWidth > 0;
      },
      { timeout: 15_000 },
    );

    // Wait for any existing annotation to load from the backend
    await page.waitForTimeout(1000);

    // ── Open YOLO export dialog ──────────────────────────────────────
    const exportBtn = page.getByRole('button', { name: /Exportar YOLO/ });
    await expect(exportBtn).toBeEnabled({ timeout: 5_000 });
    await exportBtn.click();

    // Verify the YOLO export dialog opens
    const dialog = page.locator('mat-dialog-container');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Dialog title
    await expect(dialog.getByText('Exportar Dataset YOLO')).toBeVisible();

    // With both images annotated (annotatedImages=2, totalImages=2),
    // the default 'exclude' mode gives effectiveImageCount=2,
    // trainCount=1, valCount=1 → Exportar Dataset button is enabled.
    const confirmBtn = dialog.getByRole('button', {
      name: /Exportar Dataset/,
    });
    await expect(confirmBtn).toBeVisible();
    await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });

    // ── Set up download listener BEFORE clicking confirm ─────────────
    const downloadPromise = page.waitForEvent('download', {
      timeout: 60_000,
    });

    // Click "Exportar Dataset" to trigger the YOLO export
    await confirmBtn.click();

    // Wait for dialog to close
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // Wait for the browser download to be triggered by downloadBlob()
    const download = await downloadPromise;

    // Verify download filename matches the expected YOLO pattern
    const suggestedFilename = download.suggestedFilename();
    expect(suggestedFilename).toMatch(/^yolo-dataset-.*\.zip$/);

    // Save the downloaded file to a temp path
    const downloadPath = path.join(__dirname, '.auth', 'yolo-export.zip');
    await download.saveAs(downloadPath);

    // ── Read and verify ZIP contents ─────────────────────────────────
    const zipBuffer = fs.readFileSync(downloadPath);
    const zip = await JSZip.loadAsync(zipBuffer);

    // Collect all entry paths
    const entryPaths = Object.keys(zip.files);
    expect(entryPaths.length).toBeGreaterThan(0);

    // 1. classes.txt must exist and contain 'objeto'
    const classesEntry = zip.file('dataset/classes.txt');
    expect(classesEntry).not.toBeNull();
    const classesContent = await classesEntry!.async('string');
    expect(classesContent).toContain('objeto');

    // 2. data.yaml must exist with expected YOLO structure
    const dataYamlEntry = zip.file('dataset/data.yaml');
    expect(dataYamlEntry).not.toBeNull();
    const dataYamlContent = await dataYamlEntry!.async('string');
    expect(dataYamlContent).toContain('train: images/train');
    expect(dataYamlContent).toContain('val: images/val');
    expect(dataYamlContent).toContain('nc:');
    expect(dataYamlContent).toContain("'objeto'");

    // 3. At least one image file under images/train or images/val
    const imageEntries = entryPaths.filter(
      (p) => p.startsWith('dataset/images/') && !p.endsWith('/'),
    );
    expect(imageEntries.length).toBeGreaterThanOrEqual(1);

    // Verify at least one image entry has reasonable content type/size
    for (const imgPath of imageEntries) {
      const imgEntry = zip.file(imgPath)!;
      const imgBuffer = await imgEntry.async('nodebuffer');
      // Images should be at least a few bytes (not empty)
      expect(imgBuffer.length).toBeGreaterThan(0);
    }

    // 4. At least one label file under labels/train or labels/val
    const labelEntries = entryPaths.filter(
      (p) => p.startsWith('dataset/labels/') && p.endsWith('.txt'),
    );
    expect(labelEntries.length).toBeGreaterThanOrEqual(1);

    // 5. Verify label file has YOLO-format content:
    //    Each non-empty line: "<classIndex> <xCenter> <yCenter> <width> <height>"
    const yoloLineRegex = /^\d+ \d+\.\d{6} \d+\.\d{6} \d+\.\d{6} \d+\.\d{6}$/;

    // Find the non-empty label (the annotated image's label)
    let foundNonEmptyLabel = false;
    for (const labelPath of labelEntries) {
      const labelEntry = zip.file(labelPath)!;
      const labelContent = await labelEntry.async('string');
      const lines = labelContent
        .trim()
        .split('\n')
        .filter((l) => l.length > 0);
      if (lines.length > 0) {
        foundNonEmptyLabel = true;
        for (const line of lines) {
          expect(line).toMatch(yoloLineRegex);
          // Class index should be 0 (first class = 'objeto')
          const classIndex = parseInt(line.split(' ')[0], 10);
          expect(classIndex).toBe(0);
        }
      }
    }
    expect(foundNonEmptyLabel).toBe(true);

    // Clean up
    fs.unlinkSync(downloadPath);
  });
});
