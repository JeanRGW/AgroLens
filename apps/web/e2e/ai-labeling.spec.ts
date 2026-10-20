import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import {
  createJobSchema,
  saveAnnotationInputSchema,
  type ImageAnnotation,
  type InferenceJobDetail,
  type InferenceJobImageResult,
  type UploadDetailResponse,
} from '@agrolens/contracts';

// Exercise the real labeling UI and ZIP export without credentials, storage, or a model runtime.
const uploadId = '550e8400-e29b-41d4-a716-446655440000';
const userId = '550e8400-e29b-41d4-a716-446655440001';
const modelId = '550e8400-e29b-41d4-a716-446655440002';
const jobId = '550e8400-e29b-41d4-a716-446655440003';
const imageIds = ['550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440011'];
const resultIds = ['550e8400-e29b-41d4-a716-446655440020', '550e8400-e29b-41d4-a716-446655440021'];
const timestamp = '2026-10-14T10:00:00.000Z';
const classes = [
  { id: 7, name: 'weed' },
  { id: 11, name: 'crop' },
];
const detections = [
  {
    classId: 7,
    className: 'weed',
    confidence: 0.95,
    xCenter: 0.3,
    yCenter: 0.3,
    width: 0.2,
    height: 0.2,
  },
  {
    classId: 11,
    className: 'crop',
    confidence: 0.8,
    xCenter: 0.7,
    yCenter: 0.7,
    width: 0.2,
    height: 0.2,
  },
];

async function mockApi(page: Page) {
  const saved = new Map<string, ImageAnnotation>();
  const requests: unknown[] = [];
  let created = false;
  let conflict = false;
  const upload: UploadDetailResponse = {
    id: uploadId,
    userId,
    status: 'ready',
    source: 'phone',
    propertyId: uploadId,
    talhaoId: uploadId,
    cropTypeId: uploadId,
    clientUploadId: uploadId,
    createdAt: timestamp,
    updatedAt: timestamp,
    activityDate: timestamp,
    errorMessage: null,
    fileCount: 2,
    previewCount: 0,
    files: imageIds.map((imageId, index) => ({
      id: `file-${index}`,
      imageId,
      variant: 'original',
      objectKey: `${imageId}.png`,
      contentType: 'image/png',
      sizeBytes: 1024,
      width: 512,
      height: 512,
      createdAt: timestamp,
      latitude: null,
      longitude: null,
    })),
  };
  const job: InferenceJobDetail = {
    id: jobId,
    uploadId,
    modelId,
    sourceType: 'upload',
    status: 'completed',
    modelSnapshot: { id: modelId, name: 'Field detector', task: 'detect', classes },
    imageCount: 2,
    completedCount: 2,
    failedCount: 0,
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: timestamp,
    completedAt: timestamp,
    expiresAt: null,
    images: imageIds.map((uploadImageId, index) => ({
      id: resultIds[index],
      uploadImageId,
      imageIndex: index,
      fileName: `${index}.png`,
      status: 'completed',
      detectionCount: 2,
      inferenceMs: 50,
    })),
  };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (value: unknown, status = 200) => route.fulfill({ status, json: value });
    if (path === '/api/health/config') return json({ inferenceEnabled: true });
    if (path === '/api/auth/refresh') return json({ accessToken: 'mock-access-token' });
    if (path === '/api/auth/me')
      return json({
        user: {
          id: userId,
          fullName: 'Labeling operator',
          email: 'operator@example.test',
          phone: null,
          role: 'user',
          createdAt: timestamp,
        },
      });
    if (path === '/api/properties') return json({ properties: [] });
    if (path === '/api/talhoes') return json({ talhoes: [] });
    if (path === '/api/crop-types') return json({ cropTypes: [] });
    if (path === '/api/estadios') return json({ estadios: [] });
    if (path === '/api/uploads') return json({ uploads: [upload], total: 1, limit: 50, offset: 0 });
    if (path === `/api/uploads/${uploadId}`) return json(upload);
    if (path.endsWith('/download-url')) return json({ downloadUrl: '/icons/icon-512.png' });
    if (path === `/api/uploads/${uploadId}/annotations`) return json([...saved.values()]);
    if (path.startsWith(`/api/uploads/${uploadId}/annotations/`)) {
      const imageId = path.split('/').pop()!;
      if (request.method() === 'PUT') {
        const input = saveAnnotationInputSchema.parse(request.postDataJSON());
        if (conflict) return json({ message: 'Annotation changed' }, 409);
        const annotation = {
          ...input,
          updatedAt: new Date(Date.now()).toISOString(),
          updatedByUserId: userId,
        };
        saved.set(imageId, annotation);
        return json(annotation);
      }
      return saved.has(imageId)
        ? json(saved.get(imageId))
        : json({ message: 'Annotation not found' }, 404);
    }
    if (path === '/api/inference/models')
      return json([{ id: modelId, name: 'Field detector', task: 'detect', classes }]);
    if (path === '/api/inference/jobs') {
      if (request.method() === 'POST') {
        requests.push(createJobSchema.parse(request.postDataJSON()));
        created = true;
        return json({ id: jobId, status: 'queued', imageCount: 2 }, 201);
      }
      expect(url.searchParams.get('uploadId')).toBe(uploadId);
      return json({ jobs: created ? [job] : [], total: created ? 1 : 0, limit: 20, offset: 0 });
    }
    if (path === `/api/inference/jobs/${jobId}`) return json(job);
    if (path.startsWith(`/api/inference/jobs/${jobId}/images/`)) {
      const index = resultIds.indexOf(path.split('/').pop()!);
      const result: InferenceJobImageResult = {
        id: resultIds[index],
        uploadImageId: imageIds[index],
        imageIndex: index,
        fileName: `${index}.png`,
        width: 512,
        height: 512,
        imageUrl: '/icons/icon-512.png',
        status: 'completed',
        detections,
        reviewedDetections: null,
        updatedAt: timestamp,
        inferenceMs: 50,
        errorMessage: null,
      };
      return json(result);
    }
    if (path === '/api/uploads/export-download-urls')
      return json(
        upload.files.map((file) => ({
          uploadId,
          fileId: file.id,
          imageId: file.imageId,
          fileName: file.objectKey,
          contentType: 'image/png',
          sizeBytes: 1024,
          downloadUrl: '/icons/icon-512.png',
          expiresAt: '2099-01-01T00:00:00Z',
        })),
      );
    return json({ message: `Unmocked endpoint: ${path}` }, 404);
  });
  return {
    saved,
    requests,
    setConflict: () => {
      conflict = true;
    },
  };
}

async function generate(page: Page) {
  await page.goto(`/labeling?uploadId=${uploadId}`);
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Rotular com IA', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Rotular com IA' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Modelo', exact: true }).click();
  await page.getByRole('option', { name: 'Field detector' }).click();
  await page.getByRole('radio', { name: /Todas do upload/ }).check();
  await page.screenshot({ path: test.info().outputPath('ai-assist-setup.png') });
  await page.getByRole('button', { name: 'Gerar sugestões' }).click();
  await expect(page.locator('.preview-plane .suggestion')).toHaveCount(2);
  await page.locator('.review-section').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('ai-assist-preview.png') });
}

test('choose a model, generate drafts, edit, save, reload, and export the reviewed labels', async ({
  page,
}) => {
  const state = await mockApi(page);
  await generate(page);
  expect(state.requests).toEqual([{ modelId, uploadId, imageIds }]);
  expect(state.saved.size).toBe(0);
  await page.getByRole('button', { name: 'Usar sugestões' }).click();
  await expect(page.locator('.canvas-area .label-box')).toHaveCount(2);
  await page.getByRole('button', { name: /Desfazer/ }).click();
  await expect(page.locator('.canvas-area .label-box')).toHaveCount(0);
  await page.getByRole('button', { name: /Refazer/ }).click();
  await page.locator('.canvas-area .label-box').first().click();
  await page.getByRole('combobox', { name: 'Classe', exact: true }).selectOption('crop');
  await page.getByLabel('Largura', { exact: true }).fill('0.3');
  await page.getByRole('button', { name: 'Aplicar ajuste' }).click();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Rótulos salvos com sucesso.')).toBeVisible();
  expect(state.saved.get(imageIds[0])?.labels).toEqual([
    { classId: 2, className: 'crop', xCenter: 0.3, yCenter: 0.3, width: 0.3, height: 0.2 },
    { classId: 2, className: 'crop', xCenter: 0.7, yCenter: 0.7, width: 0.2, height: 0.2 },
  ]);
  expect(detections[0].className).toBe('weed');

  await page.getByRole('button', { name: 'Próxima imagem', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rotular com IA', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Rotular com IA', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Usar sugestões' })).toBeEnabled();
  await page.getByRole('button', { name: 'Usar sugestões' }).click();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect.poll(() => state.saved.size).toBe(2);
  await page.reload();
  await expect(page.locator('.canvas-area .label-box')).toHaveCount(2);
  await expect(page.locator('.canvas-area .label-tag').first()).toHaveText('crop');

  await page.getByRole('button', { name: 'Exportar YOLO' }).click();
  const dialog = page.locator('mat-dialog-container');
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Exportar conjunto de dados', exact: true }).click();
  const download = await downloadPromise;
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  const names = (await zip.file('dataset/classes.txt')!.async('string')).trim().split('\n');
  const labelFiles = Object.keys(zip.files).filter(
    (name) => name.includes('/labels/') && name.endsWith('.txt'),
  );
  expect(labelFiles).toHaveLength(2);
  const texts = await Promise.all(labelFiles.map((name) => zip.file(name)!.async('string')));
  expect(
    texts.some((text) =>
      text.includes(`${names.indexOf('crop')} 0.300000 0.300000 0.300000 0.200000`),
    ),
  ).toBe(true);
});

test('a save conflict preserves the generated and manually edited draft', async ({ page }) => {
  const state = await mockApi(page);
  await generate(page);
  await page.getByRole('button', { name: 'Usar sugestões' }).click();
  state.setConflict();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Recarregar anotação' })).toBeVisible();
  await expect(page.locator('.canvas-area .label-box')).toHaveCount(2);
  expect(state.saved.size).toBe(0);
});

test('on mobile, reopen an upload run and correct a label without generating another job', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mockApi(page);
  await generate(page);
  await page.reload();
  await page.getByRole('button', { name: 'Rotular com IA', exact: true }).click();
  await page.getByText('Retomar uma execução anterior').click();
  await page.getByRole('combobox', { name: 'Retomar execução deste upload' }).click();
  await page.getByRole('option', { name: /Field detector/ }).click();
  await expect(page.locator('.preview-plane .suggestion')).toHaveCount(2);
  await page.getByRole('button', { name: 'Usar sugestões' }).click();
  await page.getByRole('combobox', { name: 'Classe', exact: true }).selectOption('crop');
  await page.getByRole('button', { name: 'Aplicar ajuste' }).click();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect.poll(() => state.saved.size).toBe(1);
  expect(state.requests).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('Escape closes the popup, restores focus, and preserves unsaved labels', async ({ page }) => {
  const state = await mockApi(page);
  await generate(page);
  await page.getByRole('button', { name: 'Usar sugestões' }).click();
  const trigger = page.getByRole('button', { name: 'Rotular com IA', exact: true });
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Rotular com IA' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Rotular com IA' })).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator('.canvas-area .label-box')).toHaveCount(2);
  expect(state.saved.size).toBe(0);
});

test('touch drawing, pinch zoom, pan, and fit preserve normalized label geometry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mockApi(page);
  await page.goto(`/labeling?uploadId=${uploadId}`);
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeEnabled();
  const host = page.locator('.canvas-host');
  await host.scrollIntoViewIfNeeded();
  const plane = (await page.locator('.canvas-area .overlay').boundingBox())!;
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const touch = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: { x: number; y: number; id: number }[],
  ) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await touch('touchStart', [
    { id: 1, x: plane.x + plane.width * 0.2, y: plane.y + plane.height * 0.2 },
  ]);
  await touch('touchMove', [
    { id: 1, x: plane.x + plane.width * 0.4, y: plane.y + plane.height * 0.4 },
  ]);
  await touch('touchEnd', []);
  await expect(page.locator('.canvas-area .label-box')).toHaveCount(1);
  const bounds = (await host.boundingBox())!;
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2;
  await touch('touchStart', [
    { id: 1, x: x - 40, y },
    { id: 2, x: x + 40, y },
  ]);
  await touch('touchMove', [
    { id: 1, x: x - 80, y },
    { id: 2, x: x + 80, y },
  ]);
  await touch('touchEnd', []);
  await expect(page.getByLabel('Zoom atual')).toHaveText('200%');
  await expect(page.locator('.canvas-area .label-box')).toHaveCount(1);
  await page.getByRole('button', { name: 'Mover', exact: true }).click();
  await host.scrollIntoViewIfNeeded();
  const updated = (await host.boundingBox())!;
  await touch('touchStart', [{ id: 1, x: updated.x + 100, y: updated.y + 100 }]);
  await touch('touchMove', [{ id: 1, x: updated.x + 140, y: updated.y + 130 }]);
  await touch('touchEnd', []);
  await expect(page.locator('.image-stage')).not.toHaveCSS('transform', 'matrix(2, 0, 0, 2, 0, 0)');
  await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
  await expect(page.getByLabel('Zoom atual')).toHaveText('100%');
  await page.getByRole('button', { name: 'Rotular', exact: true }).click();
  await page.getByRole('button', { name: 'Aumentar zoom', exact: true }).click();
  await expect(page.getByLabel('Zoom atual')).toHaveText('125%');
  await host.scrollIntoViewIfNeeded();
  const handle = (await page.locator('.canvas-area .se').boundingBox())!;
  const fitted = (await page.locator('.canvas-area .overlay').boundingBox())!;
  const corner = { id: 1, x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  await touch('touchStart', [corner]);
  await touch('touchMove', [
    { ...corner, x: corner.x + fitted.width * 0.1, y: corner.y + fitted.height * 0.1 },
  ]);
  await touch('touchEnd', []);
  await page.screenshot({ path: test.info().outputPath('labeling-touch-workspace.png') });
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect.poll(() => state.saved.size).toBe(1);
  const label = state.saved.get(imageIds[0])!.labels as {
    width: number;
    height: number;
    xCenter: number;
  }[];
  expect(label).toHaveLength(1);
  expect(label[0].width).toBeCloseTo(0.3, 2);
  expect(label[0].height).toBeCloseTo(0.3, 2);
  expect(label[0].xCenter).toBeCloseTo(0.35, 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('failed image loads offer an explicit retry and recover editor readiness', async ({
  page,
}) => {
  await mockApi(page);
  await page.route('**/icons/icon-512.png', (route) => route.abort());
  await page.goto(`/labeling?uploadId=${uploadId}`);
  await expect(page.getByText('Não foi possível carregar a imagem.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeDisabled();
  await page.unroute('**/icons/icon-512.png');
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeEnabled();
  await expect(page.getByText('Não foi possível carregar a imagem.')).toHaveCount(0);
});
