import { ComponentFixture, fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import {
  boxStyle,
  classColor,
  ContentRect,
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
    it('should produce a valid HSL color string', () => {
      const color = classColor('weevil');
      expect(color).toMatch(/^hsl\(\d{1,3}, 70%, 50%\)$/);
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
      inference = jasmine.createSpyObj('InferenceService', ['getJob', 'getImage']);
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

    afterEach(() => fixture.destroy());

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
});
