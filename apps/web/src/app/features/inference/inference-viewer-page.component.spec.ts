import { ComponentFixture, fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import {
  boxStyle,
  classColor,
  ContentRect,
  fitImageScale,
  InferenceViewerPageComponent,
} from './inference-viewer-page.component';
import { InferenceService } from '../../core/services/inference.service';
import { ExportService } from '../../core/services/export.service';
import { InferenceJobDetail, InferenceJobImageResult } from '@agrolens/contracts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function image(id: string, status = 'completed'): InferenceJobImageResult {
  return {
    id,
    imageIndex: id === 'a' ? 0 : 1,
    uploadImageId: null,
    fileName: `${id}.jpg`,
    width: 640,
    height: 480,
    status,
    detections: [],
    reviewedDetections: null,
    updatedAt: '2026-10-13T00:00:00.000Z',
    inferenceMs: 10,
    imageUrl: `https://example.com/${id}.jpg`,
    errorMessage: null,
  };
}

function job(status = 'completed'): InferenceJobDetail {
  return {
    id: 'job',
    modelId: 'model',
    modelSnapshot: { id: 'model', name: 'model', task: null, classes: [] },
    uploadId: null,
    sourceType: 'upload',
    status,
    imageCount: 2,
    completedCount: status === 'completed' ? 2 : 0,
    failedCount: 0,
    errorMessage: null,
    createdAt: '',
    updatedAt: '',
    startedAt: null,
    completedAt: null,
    expiresAt: null,
    images: ['a', 'b'].map((id, imageIndex) => ({
      id,
      imageIndex,
      uploadImageId: null,
      fileName: `${id}.jpg`,
      status,
      detectionCount: 0,
      inferenceMs: null,
    })),
  };
}

describe('InferenceViewerPageComponent', () => {
  describe('boxStyle', () => {
    const detection = {
      classId: 0,
      className: 'person',
      confidence: 0.9,
      xCenter: 0.5,
      yCenter: 0.5,
      width: 0.4,
      height: 0.3,
    };

    function rect(overrides: Partial<ContentRect> = {}): ContentRect {
      return {
        offsetX: 0,
        offsetY: 0,
        width: 1000,
        height: 800,
        containerWidth: 1000,
        containerHeight: 800,
        ...overrides,
      };
    }

    it('maps normalized coordinates directly when there is no letterboxing', () => {
      const style = boxStyle(detection, rect());
      expect(style['left']).toBe('30%');
      expect(style['top']).toBe('35%');
      expect(style['width']).toBe('40%');
      expect(style['height']).toBe('30%');
    });

    it('accounts for horizontal letterboxing', () => {
      const style = boxStyle(
        { ...detection, width: 0.5, height: 0.5 },
        rect({ offsetX: 100, width: 800 }),
      );
      expect(style['left']).toBe('30%');
      expect(style['top']).toBe('25%');
      expect(style['width']).toBe('40%');
      expect(style['height']).toBe('50%');
    });

    it('accounts for vertical letterboxing', () => {
      const style = boxStyle(
        { ...detection, width: 0.5, height: 0.5 },
        rect({ offsetY: 100, height: 600 }),
      );
      expect(style['left']).toBe('25%');
      expect(style['top']).toBe('31.25%');
      expect(style['width']).toBe('50%');
      expect(style['height']).toBe('37.5%');
    });
  });

  describe('classColor', () => {
    it('should produce a valid hex color string', () => {
      const color = classColor('weevil');
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('should be deterministic for same class name', () => {
      expect(classColor('weevil')).toBe(classColor('weevil'));
    });

    it('should produce different colors for different names', () => {
      const a = classColor('weevil');
      const b = classColor('aphid');
      // Extremely unlikely to collide with different hashes
      expect(a).not.toBe(b);
    });
  });

  describe('result lifecycle', () => {
    let fixture: ComponentFixture<InferenceViewerPageComponent>;
    let component: InferenceViewerPageComponent;
    let inference: jasmine.SpyObj<InferenceService>;
    let exports: jasmine.SpyObj<ExportService>;

    beforeEach(async () => {
      inference = jasmine.createSpyObj('InferenceService', ['getJob', 'getImage', 'saveReview']);
      exports = jasmine.createSpyObj('ExportService', ['downloadBlob', 'exportGenericCsv']);
      await TestBed.configureTestingModule({
        imports: [InferenceViewerPageComponent],
        providers: [
          provideRouter([]),
          { provide: InferenceService, useValue: inference },
          { provide: ExportService, useValue: exports },
        ],
      }).compileComponents();
      fixture = TestBed.createComponent(InferenceViewerPageComponent);
      component = fixture.componentInstance;
      component.job.set(job());
    });

    const corn = {
      classId: 0,
      className: 'corn',
      confidence: 0.9,
      xCenter: 0.5,
      yCenter: 0.5,
      width: 0.2,
      height: 0.2,
    };
    async function loadBoxes(boxes = [corn, { ...corn, confidence: 0.6 }]) {
      inference.getImage.and.resolveTo({ ...image('a'), detections: boxes });
      component.job.set({
        ...job(),
        modelSnapshot: {
          id: 'model',
          name: 'corn model',
          task: 'detect',
          classes: [
            { id: 0, name: 'corn' },
            { id: 1, name: 'weed' },
          ],
        },
      });
      await component.loadImage(component.job()!.images[0]);
    }
    it('uses NMS for counts without making overlay visibility a data filter', async () => {
      await loadBoxes();
      expect(component.selectedDetections().length).toBe(2);
      component.suppressOverlaps.set(true);
      expect(component.selectedDetections().length).toBe(1);
      expect(component.currentImageClassCounts()).toEqual([['corn', 1]]);
      component.toggleAllDetections();
      expect(component.visibleDetections()).toEqual([]);
      expect(component.selectedDetections().length).toBe(1);
      expect(component.imageResult()!.detections!.length).toBe(2);
    });
    it('seeds review from all processed classes even if a class is hidden', async () => {
      await loadBoxes([corn, { ...corn, classId: 1, className: 'weed' }]);
      component.toggleClassFilter('weed', false);
      component.beginReview();
      expect(component.draft().length).toBe(2);
      component.selectedBox.set(0);
      component.updateBox('xCenter', 0.6);
      expect(component.draft()[0].confidence).toBeNull();
      component.undoReview();
      expect(component.draft()[0].confidence).toBe(0.9);
      component.selectedBox.set(0);
      component.deleteBox();
      expect(component.draft().length).toBe(1);
      expect(component.imageResult()!.detections!.length).toBe(2);
    });
    it('saves empty reviews and does not refilter manual boxes', async () => {
      await loadBoxes();
      component.beginReview();
      component.changeDraft([]);
      inference.saveReview.and.resolveTo({
        reviewedDetections: [],
        updatedAt: '2026-10-13T00:00:01Z',
      });
      await component.saveReview();
      expect(inference.saveReview).toHaveBeenCalledWith('job', 'a', [], '2026-10-13T00:00:00.000Z');
      expect(component.usingReview()).toBeTrue();
      expect(component.selectedDetections()).toEqual([]);
      component.imageResult.set({
        ...image('a'),
        detections: [corn],
        reviewedDetections: [{ ...corn, confidence: null }],
      });
      component.minConfidence.set(1);
      component.suppressOverlaps.set(true);
      expect(component.processedDetections().length).toBe(1);
    });
    it('retains the draft on stale-save failure and protects unsaved navigation', async () => {
      await loadBoxes();
      component.beginReview();
      component.changeDraft([]);
      inference.saveReview.and.rejectWith(
        new Error('This result changed. Reload before saving your review.'),
      );
      await component.saveReview();
      expect(component.editing()).toBeTrue();
      expect(component.reviewError()).toContain('changed');
      const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
      component.onBeforeUnload(event);
      expect(event.defaultPrevented).toBeTrue();
      component.undoReview();
      expect(component.reviewDirty()).toBeFalse();
    });
    it('fences a pending polling refresh and saves the frozen draft revision on conflict', async () => {
      await loadBoxes([corn]);
      component.job.set({ ...component.job()!, status: 'running' });
      const original = component.imageResult();
      const refresh = deferred<InferenceJobImageResult>();
      inference.getImage.and.returnValue(refresh.promise);
      const pending = component.loadImage(component.job()!.images[0], true);
      component.beginReview();
      component.selectedBox.set(0);
      component.updateBox('xCenter', 0.6);
      const draft = component.draft();
      refresh.resolve({
        ...image('a'),
        reviewedDetections: [],
        updatedAt: '2026-10-13T00:00:01.000Z',
      });
      await pending;
      expect(component.imageResult()).toBe(original);
      expect(component.draft()).toBe(draft);
      expect(component.loadingImage()).toBeFalse();
      inference.saveReview.and.rejectWith(
        new HttpErrorResponse({
          status: 409,
          error: { message: 'This result changed. Reload before saving your review.' },
        }),
      );
      await component.saveReview();
      expect(inference.saveReview).toHaveBeenCalledWith(
        'job',
        'a',
        draft,
        '2026-10-13T00:00:00.000Z',
      );
      expect(component.editing()).toBeTrue();
      expect(component.draft()).toBe(draft);
      expect(component.reviewError()).toContain('changed');
    });
    it('ignores a late refresh rejection during editing', async () => {
      await loadBoxes([corn]);
      const original = component.imageResult();
      const refresh = deferred<InferenceJobImageResult>();
      inference.getImage.and.returnValue(refresh.promise);
      const pending = component.loadImage(component.job()!.images[0], true);
      component.beginReview();
      refresh.reject(new Error('late network failure'));
      await pending;
      expect(component.imageResult()).toBe(original);
      expect(component.imageError()).toBe('');
      expect(component.draft()).toEqual([corn]);
    });
    it('does not replace the draft revision from mutable image state and resets it for a new draft', async () => {
      await loadBoxes([corn]);
      component.beginReview();
      component.imageResult.set({
        ...component.imageResult()!,
        updatedAt: '2026-10-13T00:00:01.000Z',
      });
      inference.saveReview.and.rejectWith(new Error('conflict'));
      await component.saveReview();
      expect(inference.saveReview.calls.mostRecent().args[3]).toBe('2026-10-13T00:00:00.000Z');
      expect(await component.discardReview()).toBeTrue();
      inference.saveReview.calls.reset();
      await component.saveReview();
      expect(inference.saveReview).not.toHaveBeenCalled();
      component.beginReview();
      inference.saveReview.and.resolveTo({
        reviewedDetections: [corn],
        updatedAt: '2026-10-13T00:00:02.000Z',
      });
      await component.saveReview();
      expect(inference.saveReview.calls.mostRecent().args[3]).toBe('2026-10-13T00:00:01.000Z');
      component.beginReview();
      await component.saveReview();
      expect(inference.saveReview.calls.mostRecent().args[3]).toBe('2026-10-13T00:00:02.000Z');
    });
    it('exports current versus original results across all completed images', async () => {
      await loadBoxes();
      component.suppressOverlaps.set(true);
      component.showAllDetections.set(false);
      inference.getImage.and.callFake(async (_job, id) => ({
        ...image(id),
        detections: [corn, { ...corn, confidence: 0.6 }],
      }));
      await component.exportJson();
      const current = JSON.parse(await exports.downloadBlob.calls.mostRecent().args[0].text());
      expect(current.images.map((r: InferenceJobImageResult) => r.detections!.length)).toEqual([
        1, 1,
      ]);
      expect(current.settings.filters.suppressOverlaps).toBeTrue();
      await component.exportJson(true);
      const original = JSON.parse(await exports.downloadBlob.calls.mostRecent().args[0].text());
      expect(original.images.map((r: InferenceJobImageResult) => r.detections!.length)).toEqual([
        2, 2,
      ]);
    });

    afterEach(() => fixture.destroy());

    function renderViewer(): HTMLImageElement {
      fixture.detectChanges();
      component.jobError.set('');
      component.loadingJob.set(false);
      component.selectedImageId.set('a');
      component.imageResult.set({
        ...image('a'),
        imageUrl:
          'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="640" height="480"/%3E',
      });
      fixture.detectChanges();
      const img = fixture.nativeElement.querySelector('.image-plane img') as HTMLImageElement;
      Object.defineProperties(img, { naturalWidth: { value: 640 }, naturalHeight: { value: 480 } });
      component.onImageLoad();
      fixture.detectChanges();
      return img;
    }

    it('actually shrinks the rendered image from 100% to 75% and centers it', async () => {
      const img = renderViewer();
      const viewportElement = fixture.nativeElement.querySelector('.image-viewport') as HTMLElement;
      viewportElement.style.width = '700px';
      viewportElement.style.height = '500px';
      viewportElement.style.flex = 'none';
      component.zoomNative();
      fixture.detectChanges();
      expect(img.getBoundingClientRect().width).toBe(640);
      expect(img.getBoundingClientRect().height).toBe(480);
      component.zoomOut();
      fixture.detectChanges();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      expect(component.zoomPercent()).toBe(75);
      expect(component.fitMode()).toBeFalse();
      expect(img.getBoundingClientRect().width).toBe(480);
      expect(img.getBoundingClientRect().height).toBe(360);
      const viewport = viewportElement.getBoundingClientRect();
      const bounds = img.getBoundingClientRect();
      expect(
        Math.abs(bounds.left + bounds.width / 2 - viewport.left - viewportElement.clientWidth / 2),
      ).toBeLessThan(1);
    });

    it('keeps the image and detection overlay aligned below and above native size', () => {
      renderViewer();
      component.imageResult.set({
        ...image('a'),
        detections: [
          {
            classId: 0,
            className: 'weed',
            confidence: 0.9,
            xCenter: 0.5,
            yCenter: 0.5,
            width: 0.4,
            height: 0.3,
          },
        ],
      });
      component.enabledClasses.set(new Set(['weed']));
      for (const zoom of [0.25, 0.75, 1, 2, 3]) {
        component.fitMode.set(false);
        component.zoom.set(zoom);
        fixture.detectChanges();
        const plane = fixture.nativeElement.querySelector('.image-plane').getBoundingClientRect();
        const box = fixture.nativeElement.querySelector('.detection-box').getBoundingClientRect();
        expect(Math.abs(box.width - plane.width * 0.4)).toBeLessThan(1);
        expect(Math.abs(box.height - plane.height * 0.3)).toBeLessThan(1);
        expect(Math.abs(box.left - plane.left - plane.width * 0.3)).toBeLessThan(1);
      }
    });

    it('distinguishes fit from native size and recalculates fit on resize', () => {
      component.naturalSize.set({ width: 1600, height: 900 });
      component.viewportSize.set({ width: 800, height: 600 });
      component.zoomReset();
      expect(component.zoom()).toBe(0.5);
      expect(component.fitMode()).toBeTrue();
      component.viewportSize.set({ width: 400, height: 600 });
      component['updateFit']();
      expect(component.zoom()).toBe(0.25);
      component.zoomNative();
      component.viewportSize.set({ width: 800, height: 600 });
      component['updateFit']();
      expect(component.zoom()).toBe(1);
      expect(component.fitMode()).toBeFalse();
    });

    it('clamps manual zoom at both limits and returns to fit on image changes', async () => {
      component.zoomNative();
      for (let i = 0; i < 20; i++) component.zoomOut();
      expect(component.zoom()).toBe(0.25);
      for (let i = 0; i < 20; i++) component.zoomIn();
      expect(component.zoom()).toBe(3);
      inference.getImage.and.resolveTo(image('b'));
      await component.loadImage(job().images[1]);
      expect(component.fitMode()).toBeTrue();
    });

    it('preserves unchecked classes when the selected image refreshes', async () => {
      const result = {
        ...image('a'),
        detections: [
          {
            classId: 0,
            className: 'weed',
            confidence: 0.9,
            xCenter: 0.5,
            yCenter: 0.5,
            width: 0.2,
            height: 0.2,
          },
        ],
      };
      inference.getImage.and.resolveTo(result);
      await component.loadImage(job().images[0]);
      component.toggleClassFilter('weed', false);
      await component.loadImage(job().images[0], true);
      expect(component.visibleDetections()).toEqual([]);
      component.resetFilters();
      expect(component.visibleDetections().length).toBe(1);
    });

    it('leaves navigation buttons in place and disables them at boundaries', () => {
      renderViewer();
      const buttons = fixture.nativeElement.querySelectorAll('.image-nav button');
      expect(buttons.length).toBe(2);
      expect(buttons[0].disabled).toBeTrue();
      expect(buttons[1].disabled).toBeFalse();
      component.selectedImageId.set('b');
      fixture.detectChanges();
      expect(buttons[0].disabled).toBeFalse();
      expect(buttons[1].disabled).toBeTrue();
    });

    it('does not retry a failed URL while fetching a fresh image result', async () => {
      const failedImage = renderViewer();
      failedImage.dispatchEvent(new Event('error'));
      fixture.detectChanges();
      expect(component.imageError()).not.toBe('');

      const pending = deferred<InferenceJobImageResult>();
      inference.getImage.and.returnValue(pending.promise);
      const retryButton = fixture.nativeElement.querySelector(
        '.viewer-state button',
      ) as HTMLButtonElement;
      retryButton.click();
      fixture.detectChanges();

      expect(inference.getImage).toHaveBeenCalledWith('job', 'a');
      expect(component.loadingImage()).toBeTrue();
      expect(component.imageResult()).toBeNull();
      expect(component.imageDecoded()).toBeFalse();
      expect(component.naturalSize()).toEqual({ width: 0, height: 0 });
      const oldImage = fixture.nativeElement.querySelector(
        '.image-plane img',
      ) as HTMLImageElement | null;
      expect(oldImage).toBeNull();
      // A late failure must not reintroduce the error during the pending retry.
      (oldImage ?? failedImage).dispatchEvent(new Event('error'));
      expect(component.imageError()).toBe('');

      const fresh = {
        ...image('a'),
        imageUrl:
          'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="240"/%3E',
      };
      pending.resolve(fresh);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.imageError()).toBe('');
      expect(component.loadingImage()).toBeFalse();
      expect(component.imageResult()).toEqual(fresh);
      expect(fixture.nativeElement.querySelector('.image-plane img')?.getAttribute('src')).toBe(
        fresh.imageUrl,
      );
      expect(fixture.nativeElement.querySelector('.viewer-state')).toBeNull();
    });

    it('ignores an older image response and its loading state', async () => {
      const first = deferred<InferenceJobImageResult>();
      const second = deferred<InferenceJobImageResult>();
      inference.getImage.and.returnValues(first.promise, second.promise);
      const a = component.loadImage(job().images[0]);
      const b = component.loadImage(job().images[1]);
      first.resolve(image('a'));
      await a;
      expect(component.loadingImage()).toBeTrue();
      expect(component.imageResult()).toBeNull();
      second.resolve(image('b'));
      await b;
      expect(component.selectedImageId()).toBe('b');
      expect(component.imageResult()?.id).toBe('b');
    });

    it('ignores an older failure after the new image is displayed', async () => {
      const first = deferred<InferenceJobImageResult>();
      inference.getImage.and.returnValues(first.promise, Promise.resolve(image('b')));
      const a = component.loadImage(job().images[0]);
      await component.loadImage(job().images[1]);
      first.reject(new Error('old failure'));
      await a;
      expect(component.imageResult()?.id).toBe('b');
      expect(component.imageError()).toBe('');
    });

    it('refreshes the selected image when a running job completes without resetting selection or zoom', async () => {
      component.selectedImageId.set('b');
      component.imageResult.set(image('b', 'running'));
      component.zoom.set(2);
      inference.getJob.and.resolveTo(job());
      const completed = {
        ...image('b'),
        detections: [
          {
            classId: 0,
            className: 'weed',
            confidence: 0.8,
            xCenter: 0.5,
            yCenter: 0.5,
            width: 0.2,
            height: 0.2,
          },
        ],
      };
      inference.getImage.and.resolveTo(completed);
      await component['loadJob']('job');
      expect(inference.getImage).toHaveBeenCalledWith('job', 'b');
      expect(component.imageResult()).toEqual(completed);
      expect(component.zoom()).toBe(2);
      expect(component.visibleDetections().length).toBe(1);
      component.minConfidence.set(0.9);
      expect(component.visibleDetections()).toEqual([]);
      component.minConfidence.set(0.5);
      expect(component.visibleDetections().length).toBe(1);
    });

    it('does not restart polling when a request completes after destruction', fakeAsync(() => {
      const pending = deferred<InferenceJobDetail>();
      inference.getJob.and.returnValue(pending.promise);
      void component['loadJob']('job');
      fixture.destroy();
      pending.resolve(job('running'));
      flushMicrotasks();
      tick(10000);
      expect(inference.getJob).toHaveBeenCalledTimes(1);
      expect(inference.getImage).not.toHaveBeenCalled();
    }));

    for (const method of ['exportJson', 'exportCsv'] as const) {
      it(`does not report a partial ${method} download as successful`, async () => {
        inference.getImage.and.callFake(async (_job, id) => {
          if (id === 'b') throw new Error('image unavailable');
          return image(id);
        });
        await component[method]();
        expect(exports.downloadBlob).not.toHaveBeenCalled();
        expect(exports.exportGenericCsv).not.toHaveBeenCalled();
      });
    }
  });

  describe('component compilation', () => {
    it('should compile successfully', async () => {
      await TestBed.configureTestingModule({
        imports: [InferenceViewerPageComponent],
        providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
      }).compileComponents();

      const fixture = TestBed.createComponent(InferenceViewerPageComponent);
      expect(fixture.componentInstance).toBeTruthy();
      fixture.destroy();
    });
  });

  describe('fitImageScale', () => {
    it('fits landscape, portrait and square images without changing aspect ratio', () => {
      expect(fitImageScale(1600, 900, 800, 600)).toBe(0.5);
      expect(fitImageScale(900, 1600, 800, 600)).toBe(0.375);
      expect(fitImageScale(1000, 1000, 800, 600)).toBe(0.6);
    });
    it('handles dimensions that are not yet available', () => {
      expect(fitImageScale(0, 0, 800, 600)).toBe(1);
    });
  });
});
