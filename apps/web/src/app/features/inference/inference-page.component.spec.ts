import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { InferencePageComponent } from './inference-page.component';
import { InferenceService } from '../../core/services/inference.service';
import { UploadsService } from '../../core/services/uploads.service';
import { PresignedUploadService } from '../../core/services/presigned-upload.service';
import { InferenceJobListItem } from '@agrolens/contracts';

describe('InferencePageComponent', () => {
  let component: InferencePageComponent;
  let inferenceService: jasmine.SpyObj<InferenceService>;
  let uploadsService: jasmine.SpyObj<UploadsService>;
  let snackBar: jasmine.SpyObj<MatSnackBar>;
  let fixture: ComponentFixture<InferencePageComponent>;
  let presigned: jasmine.SpyObj<PresignedUploadService>;

  beforeEach(async () => {
    const inferenceSpy = jasmine.createSpyObj<InferenceService>('InferenceService', [
      'listActiveModels',
      'listJobs',
      'createUploadJob',
      'createTempJob',
      'completeTempJob',
      'deleteJob',
    ]);
    inferenceSpy.listActiveModels.and.resolveTo([]);
    inferenceSpy.listJobs.and.resolveTo({ jobs: [], total: 0, limit: 20, offset: 0 });

    const uploadsSpy = jasmine.createSpyObj<UploadsService>('UploadsService', [
      'listUploads',
      'getUpload',
      'getPreviewUrl',
      'getDisplayUrls',
    ]);
    uploadsSpy.getDisplayUrls.and.resolveTo({ files: {} });
    uploadsSpy.listUploads.and.resolveTo({
      records: [
        {
          id: 'upload-1',
          userId: 'user-1',
          propertyId: 'property-1',
          talhaoId: 'talhao-1',
          cropTypeId: 'crop-1',
          source: 'drone',
          status: 'ready',
          activityDate: '2026-01-01',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          fileCount: 2,
        },
      ],
      total: 1,
    });

    const routerSpy = jasmine.createSpyObj<Router>('Router', ['navigate']);
    routerSpy.navigate.and.resolveTo(true);
    const dialogSpy = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    snackBar = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']);
    presigned = jasmine.createSpyObj<PresignedUploadService>('PresignedUploadService', ['putFile']);
    presigned.putFile.and.resolveTo({ ok: true, status: 200, statusText: 'OK' });

    await TestBed.configureTestingModule({
      imports: [InferencePageComponent, NoopAnimationsModule],
      providers: [
        { provide: InferenceService, useValue: inferenceSpy },
        { provide: UploadsService, useValue: uploadsSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({ uploadId: 'upload-1', imageId: 'image-3' }),
            },
          },
        },
        { provide: MatDialog, useValue: dialogSpy },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: PresignedUploadService, useValue: presigned },
      ],
    })
      .overrideProvider(MatSnackBar, { useValue: snackBar })
      .compileComponents();

    fixture = TestBed.createComponent(InferencePageComponent);
    component = fixture.componentInstance;
    inferenceService = TestBed.inject(InferenceService) as jasmine.SpyObj<InferenceService>;
    uploadsService = TestBed.inject(UploadsService) as jasmine.SpyObj<UploadsService>;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => fixture.destroy());

  it('should create', () => {
    expect(component).toBeTruthy();
  });
  it('accepts supported images when the browser omits their MIME type', () => {
    const file = new File(['image bytes'], 'capture.webp', { type: '' });
    component.onTempFilesSelected({
      target: { files: [file], value: 'capture.webp' },
    } as unknown as Event);
    expect(component.tempFiles()).toEqual([file]);
  });

  it('loads a linked upload outside the first page', async () => {
    const upload = component.uploads()[0];
    uploadsService.listUploads.and.resolveTo({ records: [], total: 60 });
    const detail = {
      ...upload,
      clientUploadId: 'client-1',
      estadioId: null,
      errorMessage: null,
      files: [],
    };
    uploadsService.getUpload.and.resolveTo(detail);
    await component.ngOnInit();
    expect(uploadsService.getUpload).toHaveBeenCalledWith('upload-1');
    expect(component.selectedUploadId()).toBe('upload-1');
    expect(component.uploads()).toEqual([{ ...detail, fileCount: 0 }]);
  });

  it('does not create duplicate jobs while submitting', async () => {
    let finish!: (value: { id: string; status: string; imageCount: number }) => void;
    inferenceService.createUploadJob.and.returnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    component.selectedModelId.set('model-1');
    const first = component.submitInference();
    await component.submitInference();
    expect(inferenceService.createUploadJob).toHaveBeenCalledTimes(1);
    finish({ id: 'job-1', status: 'queued', imageCount: 1 });
    await first;
  });

  it('rejects unsupported image formats before creating a job', () => {
    const input = {
      files: [new File(['gif'], 'image.gif', { type: 'image/gif' })],
      value: 'image.gif',
    };
    component.onTempFilesSelected({ target: input } as unknown as Event);
    expect(component.tempFiles()).toEqual([]);
    expect(snackBar.open).toHaveBeenCalled();
  });

  it('should preselect an available upload from the query parameters', () => {
    expect(uploadsService.listUploads).toHaveBeenCalled();
    expect(component.selectedUploadId()).toBe('upload-1');
  });

  it('should show a snackbar when uploads fail to load', async () => {
    const error = new Error('Falha ao carregar uploads');
    uploadsService.listUploads.and.rejectWith(error);
    component.uploads.set([]);
    await component['loadUploads']();
    await Promise.resolve();

    expect(uploadsService.listUploads).toHaveBeenCalledWith(undefined, 50, 0);
    expect(component.uploads()).toEqual([]);
    expect(snackBar.open).toHaveBeenCalledWith(error.message, 'Fechar', { duration: 6000 });
  });

  it('should submit the image selected by the navigation query', async () => {
    inferenceService.createUploadJob.and.resolveTo({
      id: 'job-1',
      status: 'queued',
      imageCount: 1,
    });
    component.selectedModelId.set('model-1');

    await component.submitInference();

    expect(inferenceService.createUploadJob).toHaveBeenCalledWith('model-1', 'upload-1', [
      'image-3',
    ]);
  });

  it('should not reuse the query image ID after changing uploads', async () => {
    inferenceService.createUploadJob.and.resolveTo({
      id: 'job-1',
      status: 'queued',
      imageCount: 1,
    });
    component.selectedModelId.set('model-1');
    component.uploads.update((uploads) => [...uploads, { ...uploads[0], id: 'upload-2' }]);
    component.selectedUploadId.set('upload-2');

    await component.submitInference();

    expect(inferenceService.createUploadJob).toHaveBeenCalledWith('model-1', 'upload-2', undefined);
  });

  it('should not be submittable with no selections', () => {
    component.selectedModelId.set('');
    component.sourceType.set('upload');
    component.selectedUploadId.set('');
    component.tempFiles.set([]);
    expect(component.canSubmit()).toBe(false);
  });

  it('should become submittable when model and upload are selected', () => {
    component.selectedModelId.set('model-1');
    component.sourceType.set('upload');
    component.selectedUploadId.set('');
    expect(component.canSubmit()).toBe(false);

    component.selectedUploadId.set('upload-1');
    expect(component.canSubmit()).toBe(true);
  });

  it('should become submittable for temp source when files are present', () => {
    component.selectedModelId.set('model-1');
    component.sourceType.set('temp');
    component.selectedUploadId.set('');
    component.tempFiles.set([]);
    expect(component.canSubmit()).toBe(false);

    component.tempFiles.set([new File([], 'a.png')]);
    expect(component.canSubmit()).toBe(true);
  });

  it('should toggle submit eligibility reactively when switching source type', () => {
    component.selectedModelId.set('model-1');
    component.selectedUploadId.set('upload-1');
    component.tempFiles.set([new File([], 'a.png')]);

    component.sourceType.set('upload');
    expect(component.canSubmit()).toBe(true);

    component.sourceType.set('temp');
    expect(component.canSubmit()).toBe(true);

    component.tempFiles.set([]);
    expect(component.canSubmit()).toBe(false);
  });

  it('shows a local-file source by default when there is no linked upload', async () => {
    const route = TestBed.inject(ActivatedRoute);
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      value: convertToParamMap({}),
      configurable: true,
    });
    fixture.destroy();
    fixture = TestBed.createComponent(InferencePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.sourceType()).toBe('temp');
  });

  it('automatically selects a sole model and displays its supported classes', async () => {
    inferenceService.listActiveModels.and.resolveTo([
      { id: 'model-1', name: 'Pragas', task: 'detect', classes: [{ id: 0, name: 'weevil' }] },
    ]);
    await component['loadModels']();
    fixture.detectChanges();
    expect(component.selectedModelId()).toBe('model-1');
    expect(fixture.nativeElement.querySelector('.class-chips').textContent).toContain('weevil');
  });

  it('keeps both source selections when switching and preserves the linked image count', () => {
    const file = new File(['bytes'], 'a.jpg', { type: 'image/jpeg' });
    component.addTempFiles([file]);
    component.changeSource('temp');
    expect(component.selectedImageCount()).toBe(1);
    component.changeSource('upload');
    expect(component.selectedUploadId()).toBe('upload-1');
    expect(component.selectedImageCount()).toBe(1);
    component.changeSource('temp');
    expect(component.tempFiles()).toEqual([file]);
  });

  it('deduplicates files and frees preview URLs on removal, clearing and destruction', () => {
    spyOn(URL, 'createObjectURL').and.returnValues('blob:first', 'blob:second', 'blob:third');
    const revoke = spyOn(URL, 'revokeObjectURL');
    const first = new File(['bytes'], 'a.jpg', { type: 'image/jpeg', lastModified: 10 });
    const duplicate = new File(['bytes'], 'a.jpg', { type: 'image/jpeg', lastModified: 10 });
    const second = new File(['bytes'], 'b.jpg', { type: 'image/jpeg' });
    component.addTempFiles([first, duplicate, second]);
    expect(component.tempFiles()).toEqual([first, second]);
    expect(component.previewUrls().size).toBe(2);
    component.removeTempFile(0);
    expect(revoke).toHaveBeenCalledWith('blob:first');
    component.clearTempFiles();
    expect(revoke).toHaveBeenCalledWith('blob:second');
    component.addTempFiles([first]);
    fixture.destroy();
    expect(revoke).toHaveBeenCalledWith('blob:third');
  });

  it('rejects selections exceeding file count or size without discarding existing files', () => {
    const current = new File(['bytes'], 'existing.jpg', { type: 'image/jpeg' });
    component.addTempFiles([current]);
    component.addTempFiles(
      Array.from(
        { length: 20 },
        (_, index) => new File(['bytes'], `${index}.jpg`, { type: 'image/jpeg' }),
      ),
    );
    expect(component.tempFiles()).toEqual([current]);
    expect(component.selectionError()).toContain('20');
    const oversized = new File(['bytes'], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(oversized, 'size', { value: 25 * 1024 * 1024 + 1 });
    component.addTempFiles([oversized]);
    expect(component.tempFiles()).toEqual([current]);
    expect(component.selectionError()).toContain('25 MB');
  });

  it('uses the same validation for drag and drop and prevents browser navigation', () => {
    const preventDefault = jasmine.createSpy('preventDefault');
    const file = new File(['bytes'], 'a.png', { type: 'image/png' });
    component.dragActive.set(true);
    component.onDrop({ preventDefault, dataTransfer: { files: [file] } } as unknown as DragEvent);
    expect(preventDefault).toHaveBeenCalled();
    expect(component.dragActive()).toBeFalse();
    expect(component.tempFiles()).toEqual([file]);
  });

  it('locks selections while submitting and exposes upload stages', async () => {
    component.selectedModelId.set('model-1');
    component.changeSource('temp');
    const file = new File(['bytes'], 'a.png', { type: 'image/png' });
    component.addTempFiles([file]);
    inferenceService.createTempJob.and.resolveTo({
      id: 'job-1',
      status: 'uploading',
      imageCount: 1,
      files: [
        {
          imageIndex: 0,
          objectKey: 'image-1',
          expiresAt: '2026-10-06T00:00:00Z',
          uploadUrl: 'https://example.com/upload',
          headers: {},
        },
      ],
    });
    inferenceService.completeTempJob.and.resolveTo({ status: 'queued' });
    presigned.putFile.and.callFake(async () => {
      expect(component.submissionStage()).toBe('Enviando imagem 1 de 1…');
      component.clearTempFiles();
      component.removeTempFile(0);
      component.changeSource('upload');
      component.addTempFiles([new File(['bytes'], 'b.png', { type: 'image/png' })]);
      expect(component.tempFiles()).toEqual([file]);
      expect(component.sourceType()).toBe('temp');
      return { ok: true, status: 200, statusText: 'OK' };
    });
    await component.submitInference();
    expect(inferenceService.completeTempJob).toHaveBeenCalledWith('job-1');
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/inference', 'job-1']);
    expect(component.submitting()).toBeFalse();
  });

  it('retains selected files and reports a failed upload without starting inference', async () => {
    component.selectedModelId.set('model-1');
    component.changeSource('temp');
    component.addTempFiles([new File(['bytes'], 'a.png', { type: 'image/png' })]);
    inferenceService.createTempJob.and.resolveTo({
      id: 'job-1',
      status: 'uploading',
      imageCount: 1,
      files: [
        {
          imageIndex: 0,
          objectKey: 'image-1',
          expiresAt: '2026-10-06T00:00:00Z',
          uploadUrl: 'https://example.com/upload',
          headers: {},
        },
      ],
    });
    presigned.putFile.and.resolveTo({ ok: false, status: 500, statusText: 'Unavailable' });
    await component.submitInference();
    expect(inferenceService.completeTempJob).not.toHaveBeenCalled();
    expect(component.error()).toContain('a.png');
    expect(component.tempFiles().length).toBe(1);
    expect(component.submitting()).toBeFalse();
  });

  function historyJob(): InferenceJobListItem {
    return {
      id: 'job-1',
      status: 'completed',
      sourceType: 'temporary',
      imageCount: 3,
      completedCount: 3,
      failedCount: 0,
      modelSnapshot: { id: 'model-1', name: 'Pragas', task: 'detect', classes: [] },
      createdAt: '2026-10-05T12:00:00Z',
      updatedAt: '2026-10-05T12:00:00Z',
      completedAt: '2026-10-05T12:00:00Z',
      expiresAt: null,
    };
  }

  it('keeps history visible while refreshing and displays the model name', async () => {
    component.jobs.set([historyJob()]);
    component.jobsTotal.set(1);
    component.onTabChange(1);
    let resolve!: (value: {
      jobs: InferenceJobListItem[];
      total: number;
      limit: number;
      offset: number;
    }) => void;
    inferenceService.listJobs.and.returnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const refresh = component['loadJobs']();
    fixture.detectChanges();
    expect(component.loadingJobs()).toBeTrue();
    expect(fixture.nativeElement.querySelector('.job-identity').textContent).toContain('Pragas');
    expect(fixture.nativeElement.querySelector('.history-skeleton')).toBeNull();
    resolve({ jobs: [historyJob()], total: 1, limit: 20, offset: 0 });
    await refresh;
  });

  it('prevents pagination outside the available range', () => {
    component.jobsTotal.set(1);
    component.prevJobsPage();
    component.nextJobsPage();
    expect(component.jobsOffset()).toBe(0);
    expect(inferenceService.listJobs).toHaveBeenCalledTimes(1);
  });

  it('separates history load failures from an empty history', async () => {
    inferenceService.listJobs.and.rejectWith(new Error('Conexão indisponível'));
    await component['loadJobs']();
    expect(component.jobsError()).toBe('Conexão indisponível');
  });

  function preview(downloadUrl: string) {
    return {
      uploadId: 'upload-1',
      fileId: 'cover-1',
      imageId: 'image-1',
      fileName: 'cover.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 20,
      downloadUrl,
      expiresAt: '2026-10-06T00:00:00Z',
    };
  }

  it('loads the selected upload cover and keeps its placeholder until the image decodes', async () => {
    const url =
      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="640" height="480"/%3E';
    uploadsService.getPreviewUrl.and.resolveTo(preview(url));
    component.uploads.update((uploads) =>
      uploads.map((upload) => ({ ...upload, previewFileId: 'cover-1' })),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(uploadsService.getPreviewUrl).toHaveBeenCalledWith('upload-1', 'cover-1');
    expect(component.uploadCoverUrl()).toBe(url);
    const image = fixture.nativeElement.querySelector('.upload-cover img') as HTMLImageElement;
    expect(image.getAttribute('alt')).toContain('Capa do upload');
    component.onUploadCoverLoad(url);
    fixture.detectChanges();
    expect(component.loadingUploadCover()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.cover-loading')).toBeNull();
  });

  it('resolves a cover through display URLs when a linked upload has no preview file ID', async () => {
    uploadsService.getDisplayUrls.and.resolveTo({
      files: {
        first: { fileId: 'original', variant: 'original', url: 'original-url' },
        second: { fileId: 'preview', variant: 'preview', url: 'preview-url' },
      },
    });
    await component['loadUploadCover'](component.uploads()[0]);
    expect(component.uploadCoverUrl()).toBe('preview-url');
    expect(uploadsService.getPreviewUrl).not.toHaveBeenCalled();
  });

  it('ignores a late cover response after selecting a different upload', async () => {
    let resolve!: (value: ReturnType<typeof preview>) => void;
    uploadsService.getPreviewUrl.and.returnValues(
      new Promise((done) => {
        resolve = done;
      }),
      Promise.resolve(preview('second-url')),
    );
    const upload = { ...component.uploads()[0], previewFileId: 'cover-1' };
    const first = component['loadUploadCover'](upload);
    await component['loadUploadCover']({ ...upload, id: 'upload-2' });
    resolve(preview('first-url'));
    await first;
    expect(component.uploadCoverUrl()).toBe('second-url');
  });

  it('uses a non-blocking fallback when the cover request or image fails', async () => {
    uploadsService.getPreviewUrl.and.rejectWith(new Error('Preview unavailable'));
    await component['loadUploadCover']({ ...component.uploads()[0], previewFileId: 'cover-1' });
    expect(component.uploadCoverUrl()).toBe('');
    expect(component.loadingUploadCover()).toBeFalse();
    component.uploadCoverUrl.set('broken-url');
    component.loadingUploadCover.set(true);
    component.onUploadCoverError('broken-url');
    expect(component.uploadCoverUrl()).toBe('');
    expect(component.loadingUploadCover()).toBeFalse();
    component.selectedModelId.set('model-1');
    expect(component.canSubmit()).toBeTrue();
  });
});
