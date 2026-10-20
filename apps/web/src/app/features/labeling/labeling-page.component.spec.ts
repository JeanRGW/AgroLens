import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import type { ApplyPredictions } from './components/ai-assist-panel.component';
import { AuthService } from '../../core/services/auth.service';
import { AnnotationsService } from '../../core/services/annotations.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { ExportService } from '../../core/services/export.service';
import { UploadsService } from '../../core/services/uploads.service';
import { LabelingPageComponent } from './labeling-page.component';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

describe('LabelingPageComponent', () => {
  let component: LabelingPageComponent;
  let annotations: jasmine.SpyObj<AnnotationsService>;
  let uploads: jasmine.SpyObj<UploadsService>;

  beforeEach(async () => {
    annotations = jasmine.createSpyObj('AnnotationsService', [
      'getAnnotation',
      'listUploadAnnotations',
      'upsertAnnotation',
    ]);
    uploads = jasmine.createSpyObj('UploadsService', [
      'getUpload',
      'getDownloadUrl',
      'getPreviewUrl',
      'listUploads',
    ]);
    uploads.listUploads.and.resolveTo({ records: [], total: 0 });

    await TestBed.configureTestingModule({
      imports: [LabelingPageComponent],
      providers: [
        {
          provide: AuthService,
          useValue: { isAdmin: () => false, user: () => ({ id: 'user-1' }) },
        },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: new Map() } } },
        { provide: AnnotationsService, useValue: annotations },
        { provide: UploadsService, useValue: uploads },
        {
          provide: CatalogsService,
          useValue: jasmine.createSpyObj('CatalogsService', [
            'listProperties',
            'listTalhoes',
            'listCropTypes',
            'listEstadios',
          ]),
        },
        {
          provide: ExportService,
          useValue: jasmine.createSpyObj('ExportService', ['exportYoloDataset']),
        },
      ],
    }).compileComponents();

    component = TestBed.createComponent(LabelingPageComponent).componentInstance;
    const upload = {
      id: 'upload-1',
      userId: 'user-1',
      propertyId: 'property-1',
      talhaoId: 'talhao-1',
      cropTypeId: 'crop-1',
      source: 'drone',
      status: 'ready',
      activityDate: '',
      createdAt: '',
      updatedAt: '',
      fileCount: 2,
    } as any;
    component.uploads.set([upload]);
    component.selectedUploadId.set(upload.id);
    component.imageNaturalWidth = 100;
    component.imageNaturalHeight = 80;
    component.imageReady.set(true);
    (component as any).currentUploadDetail.set({
      id: upload.id,
      files: [
        { id: 'file-0', imageId: 'image-0', variant: 'original' },
        { id: 'file-1', imageId: 'image-1', variant: 'original' },
      ],
    });
    (component as any).imageUrlCache.set(
      new Map([
        ['file-0', 'image-url'],
        ['file-1', 'image-url-1'],
      ]),
    );
  });

  it('preserves the current labels when an older annotation request resolves late', async () => {
    const oldRequest = deferred<any>();
    const newRequest = deferred<any>();
    annotations.getAnnotation.and.returnValues(oldRequest.promise, newRequest.promise);

    component.labels.set([
      { classId: 0, className: 'current', xCenter: 0.5, yCenter: 0.5, width: 0.1, height: 0.1 },
    ]);
    const oldLoad = component.loadCurrentAnnotation();
    const newLoad = component.selectImage(1);

    newRequest.resolve({ classes: ['new'], labels: [] });
    await newLoad;
    oldRequest.resolve({ classes: ['old'], labels: [] });
    await oldLoad;

    expect(component.classes()).toEqual(['new']);
    expect(component.labels()).toEqual([]);
    expect(component.loadingAnnotation()).toBeFalse();
  });

  it('preserves labels and disables saving after an annotation error', async () => {
    const error = Promise.reject(new Error('server error'));
    annotations.getAnnotation.and.returnValue(error);
    component.labels.set([
      { classId: 0, className: 'current', xCenter: 0.5, yCenter: 0.5, width: 0.1, height: 0.1 },
    ]);

    await component.loadCurrentAnnotation();

    expect(component.labels().length).toBe(1);
    expect(component.annotationLoadError()).toBeTrue();
    expect(component.loadingAnnotation()).toBeFalse();
  });

  it('clears stale images while loading another upload', async () => {
    const detailRequest = deferred<any>();
    uploads.getUpload.and.returnValue(detailRequest.promise);
    const nextUpload = { ...component.uploads()[0], id: 'upload-2' };

    void component.selectUpload(nextUpload);
    await Promise.resolve();

    expect(component.selectedUploadImages()).toEqual([]);
  });

  it('keeps unsaved labels when navigation is cancelled', async () => {
    annotations.getAnnotation.and.resolveTo(null);
    await component.loadCurrentAnnotation();
    component.onLabelCreate({
      classId: 0,
      className: 'objeto',
      xCenter: 0.5,
      yCenter: 0.5,
      width: 0.1,
      height: 0.1,
    });
    spyOn(component['dialog'], 'open').and.returnValue({
      afterClosed: () => of(false),
    } as never);
    await component.selectImage(1);
    expect(component.selectedImageIndex()).toBe(0);
    expect(component.labels().length).toBe(1);
    expect(component.hasUnsavedChanges()).toBeTrue();
  });

  it('keeps edits made during a save dirty', async () => {
    annotations.getAnnotation.and.resolveTo(null);
    await component.loadCurrentAnnotation();
    const save = deferred<never>();
    annotations.upsertAnnotation.and.returnValue(save.promise);
    const saving = component.saveCurrentAnnotation();
    component.onAddClass('new class');
    save.resolve(undefined as never);
    await saving;
    expect(component.hasUnsavedChanges()).toBeTrue();
  });
  it('honors discard when filtering keeps the selected upload', async () => {
    annotations.getAnnotation.and.resolveTo(null);
    await component.loadCurrentAnnotation();
    component.onAddClass('unsaved');
    uploads.listUploads.and.resolveTo({ records: component.uploads(), total: 1 });
    spyOn(component['dialog'], 'open').and.returnValue({ afterClosed: () => of(true) } as never);
    await component.loadUploads();
    expect(component.classes()).not.toContain('unsaved');
    expect(component.hasUnsavedChanges()).toBeFalse();
    expect(component.canUndo()).toBeFalse();
  });

  it('stops annotation loading when the selected upload has no image', async () => {
    (component as any).currentUploadDetail.set({ id: 'upload-1', files: [] });
    component.loadingAnnotation.set(true);

    await component.loadCurrentAnnotation();

    expect(component.loadingAnnotation()).toBeFalse();
  });

  it('restores classes and labels together through undo, redo, and save', async () => {
    annotations.getAnnotation.and.resolveTo(null);
    await component.loadCurrentAnnotation();
    component.onAddClass('weed');
    component.onLabelCreate({
      classId: 1,
      className: 'weed',
      xCenter: 0.5,
      yCenter: 0.5,
      width: 0.2,
      height: 0.2,
    });
    component.onRemoveClass('weed');
    expect(component.labels()[0].className).toBe('objeto');
    component.undo();
    expect(component.classes()).toEqual(['objeto', 'weed']);
    expect(component.labels()[0].classId).toBe(1);
    component.redo();
    expect(component.classes()).toEqual(['objeto']);
    expect(component.labels()[0].classId).toBe(0);
    component.undo();
    await component.saveCurrentAnnotation();
    const saved = annotations.upsertAnnotation.calls.mostRecent().args[1];
    expect(saved.classes[saved.labels[0].classId]).toBe(saved.labels[0].className);
  });

  it('opens the explicitly requested upload beyond the first page', async () => {
    const requested = { ...component.uploads()[0], id: 'older-upload' };
    spyOn(TestBed.inject(ActivatedRoute).snapshot.queryParamMap, 'get').and.returnValue(
      requested.id,
    );
    uploads.listUploads.and.resolveTo({ records: component.uploads(), total: 100 });
    uploads.getUpload.and.resolveTo({
      ...requested,
      clientUploadId: 'client-id',
      estadioId: null,
      errorMessage: null,
      files: component['currentUploadDetail']()!.files,
    });
    uploads.getDownloadUrl.and.resolveTo({ downloadUrl: 'fresh-url' });
    annotations.listUploadAnnotations.and.resolveTo([]);
    annotations.getAnnotation.and.resolveTo(null);
    component.selectedUploadId.set(null);

    await component.loadUploads();

    expect(component.selectedUploadId()).toBe(requested.id);
    expect(component.selectedUpload()?.id).toBe(requested.id);
    expect(component.hasMoreUploads()).toBeTrue();
    uploads.listUploads.and.resolveTo({ records: [requested], total: 2 });
    await component.loadMoreUploads();
    expect(component.uploads().filter((upload) => upload.id === requested.id).length).toBe(1);
  });

  it('does not silently select another upload when a requested upload is unavailable', async () => {
    spyOn(TestBed.inject(ActivatedRoute).snapshot.queryParamMap, 'get').and.returnValue('missing');
    uploads.listUploads.and.resolveTo({ records: component.uploads(), total: 1 });
    uploads.getUpload.and.rejectWith(new Error('not found'));
    component.selectedUploadId.set(null);
    await component.loadUploads();
    expect(component.selectedUploadId()).toBeNull();
  });

  it('refreshes a failed image URL once without discarding unsaved labels', async () => {
    annotations.getAnnotation.and.resolveTo(null);
    await component.loadCurrentAnnotation();
    component.onAddClass('unsaved');
    uploads.getDownloadUrl.and.resolveTo({ downloadUrl: 'renewed-url' });
    await component.refreshImageUrl();
    await component.refreshImageUrl();
    expect(component.selectedImageUrl()).toBe('renewed-url');
    expect(uploads.getDownloadUrl).toHaveBeenCalledTimes(1);
    expect(component.hasUnsavedChanges()).toBeTrue();
  });

  const prediction: ApplyPredictions = {
    uploadId: 'upload-1',
    imageId: 'image-0',
    width: 100,
    height: 80,
    mode: 'append',
    detections: [
      {
        classId: 9,
        className: 'weed',
        confidence: 0.9,
        xCenter: 0.5,
        yCenter: 0.5,
        width: 0.2,
        height: 0.2,
      },
    ],
  };

  it('applies predictions as one undoable draft change and saves only on explicit save', async () => {
    annotations.getAnnotation.and.resolveTo(null);
    await component.loadCurrentAnnotation();
    await component.applyPredictions(prediction);
    expect(component.classes()).toEqual(['objeto', 'weed']);
    expect(component.labels()[0].classId).toBe(1);
    expect(component.hasUnsavedChanges()).toBeTrue();
    expect(annotations.upsertAnnotation).not.toHaveBeenCalled();
    component.undo();
    expect(component.labels()).toEqual([]);
    expect(component.classes()).toEqual(['objeto']);
    component.redo();
    await component.saveCurrentAnnotation();
    expect(annotations.upsertAnnotation.calls.mostRecent().args[1].expectedUpdatedAt).toBeNull();
    expect(component.hasUnsavedChanges()).toBeFalse();
  });

  it('preserves existing labels when replacement is cancelled', async () => {
    await component.applyPredictions(prediction);
    spyOn(component['dialog'], 'open').and.returnValue({ afterClosed: () => of(false) } as never);
    await component.applyPredictions({
      ...prediction,
      mode: 'replace',
      detections: [{ ...prediction.detections[0], className: 'crop' }],
    });
    expect(component.labels()[0].className).toBe('weed');
    expect(component.classes()).not.toContain('crop');
  });

  it('does not apply predictions for a different image, mismatched dimensions, or zero detections', async () => {
    await component.applyPredictions({ ...prediction, imageId: 'image-1' });
    await component.applyPredictions({ ...prediction, width: 80, height: 100 });
    await component.applyPredictions({ ...prediction, detections: [] });
    expect(component.labels()).toEqual([]);
    expect(annotations.upsertAnnotation).not.toHaveBeenCalled();
  });

  it('keeps manual edits independent of changing prediction previews', async () => {
    await component.applyPredictions(prediction);
    component.onLabelsChange([{ ...component.labels()[0], xCenter: 0.6 }]);
    component.predictionPreview.set({ ...prediction, detections: [] });
    expect(component.labels()[0].xCenter).toBe(0.6);
    component.undo();
    expect(component.labels()[0].xCenter).toBe(0.5);
  });

  it('sends the loaded version and preserves the draft after a save conflict', async () => {
    annotations.getAnnotation.and.resolveTo({
      imageId: 'image-0',
      imageWidth: 100,
      imageHeight: 80,
      classes: ['crop'],
      labels: [],
      updatedAt: '2026-10-14T10:00:00.000Z',
    });
    await component.loadCurrentAnnotation();
    await component.applyPredictions(prediction);
    annotations.upsertAnnotation.and.rejectWith(new HttpErrorResponse({ status: 409 }));
    await component.saveCurrentAnnotation();
    expect(annotations.upsertAnnotation.calls.mostRecent().args[1].expectedUpdatedAt).toBe(
      '2026-10-14T10:00:00.000Z',
    );
    expect(component.annotationSaveConflict()).toBeTrue();
    expect(component.labels()[0].className).toBe('weed');
    expect(component.hasUnsavedChanges()).toBeTrue();
  });

  it('requires explicit confirmation before reloading a conflicted annotation', async () => {
    annotations.getAnnotation.and.resolveTo(null);
    await component.loadCurrentAnnotation();
    await component.applyPredictions(prediction);
    component.annotationSaveConflict.set(true);
    const dialog = spyOn(component['dialog'], 'open').and.returnValue({
      afterClosed: () => of(false),
    } as never);
    await component.reloadConflictedAnnotation();
    expect(component.labels()[0].className).toBe('weed');
    expect(component.annotationSaveConflict()).toBeTrue();
    expect(annotations.getAnnotation).toHaveBeenCalledTimes(1);
    dialog.and.returnValue({ afterClosed: () => of(true) } as never);
    await component.reloadConflictedAnnotation();
    expect(component.labels()).toEqual([]);
    expect(component.annotationSaveConflict()).toBeFalse();
    expect(component.hasUnsavedChanges()).toBeFalse();
  });

  it('does not leave stale suggestions visible when the assist panel is closed', () => {
    component.showAiAssist.set(true);
    component.predictionPreview.set(prediction);
    component.inferenceStates.set(new Map([['image-0', 'completed']]));
    component.toggleAiAssist();
    expect(component.predictionPreview()).toBeNull();
    expect(component.inferenceStates().size).toBe(0);
  });
});
