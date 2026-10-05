import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { InferencePageComponent } from './inference-page.component';
import { InferenceService } from '../../core/services/inference.service';
import { UploadsService } from '../../core/services/uploads.service';

describe('InferencePageComponent', () => {
  let component: InferencePageComponent;
  let inferenceService: jasmine.SpyObj<InferenceService>;
  let uploadsService: jasmine.SpyObj<UploadsService>;
  let snackBar: jasmine.SpyObj<MatSnackBar>;

  beforeEach(async () => {
    const inferenceSpy = jasmine.createSpyObj<InferenceService>('InferenceService', [
      'listActiveModels',
      'listJobs',
      'createUploadJob',
      'createTempJob',
      'deleteJob',
    ]);
    inferenceSpy.listActiveModels.and.resolveTo([]);
    inferenceSpy.listJobs.and.resolveTo({ jobs: [], total: 0, limit: 20, offset: 0 });

    const uploadsSpy = jasmine.createSpyObj<UploadsService>('UploadsService', [
      'listUploads',
      'getUpload',
    ]);
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
    const dialogSpy = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    snackBar = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']);

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
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(InferencePageComponent);
    component = fixture.componentInstance;
    inferenceService = TestBed.inject(InferenceService) as jasmine.SpyObj<InferenceService>;
    uploadsService = TestBed.inject(UploadsService) as jasmine.SpyObj<UploadsService>;
    fixture.detectChanges();
    await fixture.whenStable();
    snackBar = component['snackBar'] as jasmine.SpyObj<MatSnackBar>;
    spyOn(snackBar, 'open').and.callThrough();
  });

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
});
