import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';

import {
  InferenceModelsPageComponent,
  UploadModelDialogComponent,
} from './inference-models-page.component';
import { InferenceModelsService } from '../../core/services/inference-models.service';
import { PresignedUploadService } from '../../core/services/presigned-upload.service';
import { InferenceModelAdmin } from '@agrolens/contracts';

describe('InferenceModelsPageComponent', () => {
  let component: InferenceModelsPageComponent;
  let fixture: ComponentFixture<InferenceModelsPageComponent>;
  let modelsService: jasmine.SpyObj<InferenceModelsService>;

  beforeEach(async () => {
    const modelsSpy = jasmine.createSpyObj('InferenceModelsService', [
      'listModels',
      'setModelActive',
      'deleteModel',
      'initModel',
      'completeModelUpload',
      'updateModel',
    ]);
    modelsSpy.listModels.and.resolveTo([]);

    await TestBed.configureTestingModule({
      imports: [InferenceModelsPageComponent, NoopAnimationsModule],
      providers: [
        { provide: InferenceModelsService, useValue: modelsSpy },
        MatDialog,
        {
          provide: MatSnackBar,
          useValue: jasmine.createSpyObj('MatSnackBar', ['open']),
        },
      ],
    }).compileComponents();

    modelsService = TestBed.inject(
      InferenceModelsService,
    ) as jasmine.SpyObj<InferenceModelsService>;
    fixture = TestBed.createComponent(InferenceModelsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call listModels on init', () => {
    expect(modelsService.listModels).toHaveBeenCalled();
  });

  it('should render page header', () => {
    const el: HTMLElement = fixture.nativeElement;
    const title = el.querySelector('h1');
    expect(title?.textContent?.trim()).toBe('Modelos de Inferência');
  });

  it('should send null when clearing a model description', async () => {
    const model: InferenceModelAdmin = {
      id: 'model-1',
      name: 'Model',
      description: 'Description',
      task: null,
      classes: [],
      status: 'ready',
      active: true,
      sha256: null,
      sizeBytes: null,
      errorMessage: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const dialog = (component as unknown as { dialog: MatDialog }).dialog;
    spyOn(dialog, 'open').and.returnValue({
      afterClosed: () => of({ name: 'Model', description: '' }),
    } as never);
    modelsService.updateModel.and.resolveTo(model);

    component.openEditDialog(model);
    await fixture.whenStable();

    expect(modelsService.updateModel).toHaveBeenCalledWith('model-1', {
      name: 'Model',
      description: null,
    });
  });
});

describe('UploadModelDialogComponent', () => {
  it('uploads a model with a name and no separate version field', async () => {
    const models = jasmine.createSpyObj<InferenceModelsService>('InferenceModelsService', [
      'initModel',
      'completeModelUpload',
    ]);
    const upload = jasmine.createSpyObj<PresignedUploadService>('PresignedUploadService', [
      'putFile',
    ]);
    const dialog = jasmine.createSpyObj('MatDialogRef', ['close']);
    const headers = { 'Content-Type': 'application/octet-stream' };
    models.initModel.and.resolveTo({
      id: 'model-1',
      uploadUrl: 'https://example.com/model',
      headers,
      objectKey: 'models/model-1/best.pt',
      expiresAt: '2026-01-01T00:00:00Z',
    });
    upload.putFile.and.resolveTo({ ok: true, status: 200, statusText: 'OK' });
    const completed: InferenceModelAdmin = {
      id: 'model-1',
      name: 'Weeds v2',
      description: null,
      task: null,
      classes: null,
      status: 'validating',
      active: false,
      sha256: null,
      sizeBytes: 5,
      errorMessage: null,
      createdAt: '',
      updatedAt: '',
    };
    models.completeModelUpload.and.resolveTo(completed);
    await TestBed.configureTestingModule({
      imports: [UploadModelDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: InferenceModelsService, useValue: models },
        { provide: PresignedUploadService, useValue: upload },
        { provide: MatDialogRef, useValue: dialog },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(UploadModelDialogComponent);
    const component = fixture.componentInstance;
    component.form.patchValue({ name: 'Weeds v2' });
    const file = new File(['model'], 'best.pt');
    component.selectedFile.set(file);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[formControlName="version"]')).toBeNull();

    await component.submit();

    expect(models.initModel).toHaveBeenCalledWith('Weeds v2', undefined);
    expect(upload.putFile).toHaveBeenCalledWith(
      'https://example.com/model',
      file,
      jasmine.objectContaining({ headers }),
    );
    expect(models.completeModelUpload).toHaveBeenCalledWith('model-1');
    expect(dialog.close).toHaveBeenCalledWith(completed);
  });
});
