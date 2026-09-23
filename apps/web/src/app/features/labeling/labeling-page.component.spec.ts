import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
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
      latitude: 0,
      longitude: 0,
      createdAt: '',
      updatedAt: '',
      fileCount: 2,
    } as any;
    component.uploads.set([upload]);
    component.selectedUploadId.set(upload.id);
    (component as any).currentUploadDetail.set({
      id: upload.id,
      files: [
        { id: 'file-0', imageIndex: 0, variant: 'original' },
        { id: 'file-1', imageIndex: 1, variant: 'original' },
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
});
