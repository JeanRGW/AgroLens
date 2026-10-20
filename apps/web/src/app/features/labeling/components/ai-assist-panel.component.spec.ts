import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialogRef } from '@angular/material/dialog';
import type { InferenceJobDetail, InferenceJobImageResult } from '@agrolens/contracts';
import { InferenceService } from '../../../core/services/inference.service';
import { AnnotationsService } from '../../../core/services/annotations.service';
import { AiAssistPanelComponent } from './ai-assist-panel.component';

describe('AiAssistPanelComponent', () => {
  let inference: jasmine.SpyObj<InferenceService>;
  let annotations: jasmine.SpyObj<AnnotationsService>;
  const job: InferenceJobDetail = {
    id: 'job-1',
    modelId: 'model-1',
    uploadId: 'upload-1',
    sourceType: 'upload',
    modelSnapshot: {
      id: 'model-1',
      name: 'Weeds',
      task: 'detect',
      classes: [{ id: 7, name: 'weed' }],
    },
    status: 'completed',
    imageCount: 2,
    completedCount: 1,
    failedCount: 1,
    errorMessage: null,
    createdAt: '2026-10-14T00:00:00Z',
    updatedAt: '2026-10-14T00:00:00Z',
    startedAt: null,
    completedAt: null,
    expiresAt: null,
    images: [
      {
        id: 'result-1',
        imageIndex: 0,
        uploadImageId: 'image-0',
        fileName: 'one.jpg',
        status: 'completed',
        detectionCount: 1,
        inferenceMs: 10,
      },
      {
        id: 'result-2',
        imageIndex: 1,
        uploadImageId: 'image-1',
        fileName: 'two.jpg',
        status: 'failed',
        detectionCount: 0,
        inferenceMs: null,
      },
    ],
  };
  const result: InferenceJobImageResult = {
    id: 'result-1',
    imageIndex: 0,
    uploadImageId: 'image-0',
    fileName: 'one.jpg',
    status: 'completed',
    width: 100,
    height: 80,
    imageUrl: 'image-url',
    inferenceMs: 10,
    errorMessage: null,
    reviewedDetections: null,
    updatedAt: '2026-10-14T00:00:00Z',
    detections: [
      {
        classId: 7,
        className: 'weed',
        confidence: 0.9,
        xCenter: 0.5,
        yCenter: 0.5,
        width: 0.2,
        height: 0.2,
      },
    ],
  };

  beforeEach(() => {
    inference = jasmine.createSpyObj('InferenceService', [
      'listActiveModels',
      'listJobs',
      'createUploadJob',
      'getJob',
      'getImage',
    ]);
    inference.listActiveModels.and.resolveTo([
      { id: 'model-1', name: 'Weeds', task: 'detect', classes: [{ id: 7, name: 'weed' }] },
    ]);
    inference.listJobs.and.resolveTo({ jobs: [], total: 0, limit: 20, offset: 0 });
    inference.createUploadJob.and.resolveTo({ id: job.id, status: 'queued', imageCount: 2 });
    inference.getJob.and.resolveTo(job);
    inference.getImage.and.resolveTo(result);
    annotations = jasmine.createSpyObj('AnnotationsService', ['listUploadAnnotations']);
    annotations.listUploadAnnotations.and.resolveTo([]);
    TestBed.configureTestingModule({
      imports: [AiAssistPanelComponent],
      providers: [
        provideNoopAnimations(),
        { provide: InferenceService, useValue: inference },
        { provide: AnnotationsService, useValue: annotations },
      ],
    });
  });

  function setup() {
    const fixture = TestBed.createComponent(AiAssistPanelComponent);
    fixture.componentRef.setInput('uploadId', 'upload-1');
    fixture.componentRef.setInput('imageId', 'image-0');
    fixture.componentRef.setInput('imageIds', ['image-0', 'image-1']);
    fixture.detectChanges();
    flushMicrotasks();
    fixture.detectChanges();
    fixture.componentInstance.modelId.set('model-1');
    return { fixture, panel: fixture.componentInstance };
  }

  it('runs only the selected image and loads successful results despite another image failure', fakeAsync(() => {
    const { fixture, panel } = setup();
    const apply = jasmine.createSpy('apply');
    panel.apply.subscribe(apply);
    void panel.start();
    flushMicrotasks();
    fixture.detectChanges();
    flushMicrotasks();
    fixture.detectChanges();
    expect(inference.createUploadJob).toHaveBeenCalledWith('model-1', 'upload-1', ['image-0']);
    expect(panel.starting()).toBeFalse();
    expect(panel.predictions().length).toBe(1);
    expect(apply).not.toHaveBeenCalled();
    panel.applyPredictions('append');
    expect(apply).toHaveBeenCalledWith(
      jasmine.objectContaining({
        imageId: 'image-0',
        mode: 'append',
        detections: result.detections,
      }),
    );
    fixture.destroy();
  }));

  it('runs all images or excludes every saved annotation, including saved negatives', fakeAsync(() => {
    const { fixture, panel } = setup();
    panel.scope.set('all');
    void panel.start();
    flushMicrotasks();
    fixture.detectChanges();
    flushMicrotasks();
    expect(inference.createUploadJob).toHaveBeenCalledWith('model-1', 'upload-1', [
      'image-0',
      'image-1',
    ]);
    annotations.listUploadAnnotations.and.resolveTo([
      { imageId: 'image-0', imageWidth: 100, imageHeight: 80, classes: [], labels: [] },
    ]);
    panel.scope.set('unannotated');
    void panel.start();
    flushMicrotasks();
    fixture.detectChanges();
    flushMicrotasks();
    expect(inference.createUploadJob).toHaveBeenCalledWith('model-1', 'upload-1', ['image-1']);
    fixture.destroy();
  }));

  it('never sends an empty image selection which would otherwise mean the whole upload', fakeAsync(() => {
    const { fixture, panel } = setup();
    fixture.componentRef.setInput('imageIds', []);
    panel.scope.set('all');
    void panel.start();
    flushMicrotasks();
    expect(inference.createUploadJob).not.toHaveBeenCalled();
    expect(panel.error()).toContain('Nenhuma imagem');
    fixture.destroy();
  }));

  it('filters previews without modifying raw predictions and never applies an empty result', fakeAsync(() => {
    const { fixture, panel } = setup();
    panel.result.set(result);
    panel.minConfidence.set(0.95);
    const apply = jasmine.createSpy('apply');
    panel.apply.subscribe(apply);
    panel.applyPredictions('replace');
    expect(panel.predictions()).toEqual([]);
    expect(panel.result()?.detections).toEqual(result.detections);
    expect(apply).not.toHaveBeenCalled();
    fixture.destroy();
  }));

  it('emits apply once and closes the dialog without a duplicate payload', fakeAsync(() => {
    const close = jasmine.createSpy('close');
    TestBed.overrideProvider(MatDialogRef, { useValue: { close } });
    const { fixture, panel } = setup();
    panel.result.set(result);
    const apply = jasmine.createSpy('apply');
    panel.apply.subscribe(apply);
    panel.applyPredictions('append');
    expect(apply).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith();
    fixture.destroy();
  }));

  it('ignores late image results when the selected image changes', fakeAsync(() => {
    const { fixture, panel } = setup();
    let resolve!: (value: InferenceJobImageResult) => void;
    inference.getImage.and.returnValue(
      new Promise((res) => {
        resolve = res;
      }),
    );
    void panel.openRun('job-1');
    flushMicrotasks();
    fixture.detectChanges();
    fixture.componentRef.setInput('imageId', 'image-1');
    fixture.detectChanges();
    resolve(result);
    flushMicrotasks();
    fixture.detectChanges();
    expect(panel.result()).toBeNull();
    expect(panel.loadingResult()).toBeFalse();
    fixture.destroy();
  }));

  it('polls queued jobs and stops after destruction', fakeAsync(() => {
    const { fixture, panel } = setup();
    inference.getJob.and.resolveTo({ ...job, status: 'running' });
    void panel.openRun('job-1');
    flushMicrotasks();
    fixture.detectChanges();
    tick(2500);
    flushMicrotasks();
    expect(inference.getJob).toHaveBeenCalledTimes(2);
    fixture.destroy();
    tick(5000);
    expect(inference.getJob).toHaveBeenCalledTimes(2);
  }));

  it('does not select a historical run automatically and rejects expired or unrelated runs', fakeAsync(() => {
    const { fixture, panel } = setup();
    expect(inference.listJobs).toHaveBeenCalledWith(20, 0, 'upload-1');
    expect(inference.getJob).not.toHaveBeenCalled();
    inference.getJob.and.resolveTo({ ...job, uploadId: 'upload-2' });
    void panel.openRun('job-1');
    flushMicrotasks();
    expect(panel.job()).toBeNull();
    inference.getJob.and.resolveTo({ ...job, expiresAt: '2020-01-01T00:00:00Z' });
    void panel.openRun('job-1');
    flushMicrotasks();
    expect(panel.job()).toBeNull();
    expect(panel.error()).toContain('expirou');
    fixture.destroy();
  }));

  it('handles disabled inference without touching annotations', fakeAsync(() => {
    inference.listActiveModels.and.rejectWith(new HttpErrorResponse({ status: 503 }));
    const { fixture, panel } = setup();
    expect(panel.error()).toContain('indisponível');
    expect(inference.createUploadJob).not.toHaveBeenCalled();
    expect(annotations.listUploadAnnotations).not.toHaveBeenCalled();
    fixture.destroy();
  }));
});
