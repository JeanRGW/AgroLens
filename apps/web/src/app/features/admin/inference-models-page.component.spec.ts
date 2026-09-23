import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';

import { InferenceModelsPageComponent } from './inference-models-page.component';
import { InferenceModelsService } from '../../core/services/inference-models.service';
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
      version: '1',
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
      afterClosed: () => of({ name: 'Model', version: '1', description: '' }),
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
