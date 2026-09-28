import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Clipboard } from '@angular/cdk/clipboard';
import { of } from 'rxjs';
import { UploadsListPageComponent } from './uploads-list-page.component';
import { UploadsService } from '../../core/services/uploads.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { UsersService } from '../../core/services/users.service';
import { AnnotationsService } from '../../core/services/annotations.service';
import { ExportService } from '../../core/services/export.service';
import { UploadPageResult, UploadRecord } from '../../shared/models/upload-record';
import { YoloExportDialogComponent } from './yolo-export-dialog/yolo-export-dialog.component';

describe('UploadsListPageComponent pagination', () => {
  let component: UploadsListPageComponent;
  let uploads: jasmine.SpyObj<UploadsService>;
  let annotations: jasmine.SpyObj<AnnotationsService>;
  let exports: jasmine.SpyObj<ExportService>;
  let dialog: jasmine.SpyObj<MatDialog>;

  const upload = {
    id: 'upload-1',
    fileCount: 3,
    userId: 'user-1',
    propertyId: 'property-1',
    talhaoId: 'talhao-1',
    cropTypeId: 'crop-1',
    source: 'phone',
    status: 'ready',
    activityDate: '',
    createdAt: '',
    updatedAt: '',
  } satisfies UploadRecord;
  const annotation = {
    imageId: 'image-1',
    imageWidth: 100,
    imageHeight: 100,
    classes: ['weed'],
    labels: [
      { classId: 0, className: 'weed', xCenter: 0.5, yCenter: 0.5, width: 0.2, height: 0.2 },
    ],
  };

  beforeEach(() => {
    uploads = jasmine.createSpyObj('UploadsService', ['listUploads']);
    uploads.listUploads.and.resolveTo({ records: [], total: 100 });
    annotations = jasmine.createSpyObj('AnnotationsService', ['listUploadAnnotationsBatch']);
    exports = jasmine.createSpyObj('ExportService', ['getExportUrls', 'exportYoloDataset']);
    dialog = jasmine.createSpyObj('MatDialog', ['open']);
    TestBed.configureTestingModule({
      providers: [
        { provide: UploadsService, useValue: uploads },
        { provide: AnnotationsService, useValue: annotations },
        { provide: ExportService, useValue: exports },
        { provide: MatDialog, useValue: dialog },
        ...[CatalogsService, UsersService, Clipboard].map((provide) => ({ provide, useValue: {} })),
        { provide: MatSnackBar, useValue: jasmine.createSpyObj('MatSnackBar', ['open']) },
      ],
    });
    component = TestBed.runInInjectionContext(() => new UploadsListPageComponent());
  });

  it('paginates using the applied size until edits are applied', async () => {
    await component.load();
    component.pageSize = 100;
    component.nextPage();
    expect(uploads.listUploads).toHaveBeenCalledWith(undefined, 25, 25);
    await Promise.resolve();
    component.applyFilters();
    expect(uploads.listUploads).toHaveBeenCalledWith(undefined, 100, 0);
  });

  it('ignores an older response after clearing filters starts a new request', async () => {
    let resolveOld!: (value: UploadPageResult) => void;
    uploads.listUploads.and.returnValue(new Promise((resolve) => (resolveOld = resolve)));
    const oldRequest = component.load();
    uploads.listUploads.and.resolveTo({ records: [], total: 42 });
    component.clearFilters();
    await Promise.resolve();
    resolveOld({ records: [], total: 7 });
    await oldRequest;
    expect(component.result()?.total).toBe(42);
    expect(component.loading()).toBeFalse();
  });

  it('uses file counts and annotation labels to preview the YOLO split', () => {
    const emptyAnnotation = { ...annotation, imageId: 'image-2', classes: ['crop'], labels: [] };
    const data = component['buildYoloDialogData'](
      [upload],
      new Map([['upload-1', [annotation, emptyAnnotation]]]),
    );
    expect(data.totalImages).toBe(3);
    expect(data.annotatedImages).toBe(1);
    expect(data.unannotatedImages).toBe(2);
    expect(data.perImageClasses).toEqual([
      { classes: ['weed'], hasAnnotation: true },
      { classes: ['crop'], hasAnnotation: false },
      { classes: [], hasAnnotation: false },
    ]);
  });

  it('does not sign image URLs when the YOLO dialog is canceled', async () => {
    component.result.set({ records: [upload], total: 1 });
    component.selectedIds.set(new Set([upload.id]));
    annotations.listUploadAnnotationsBatch.and.resolveTo(new Map([[upload.id, [annotation]]]));
    dialog.open.and.returnValue({ afterClosed: () => of(undefined) } as ReturnType<
      MatDialog['open']
    >);

    await component.exportSelectedAsYolo();

    expect(dialog.open).toHaveBeenCalledWith(
      YoloExportDialogComponent,
      jasmine.objectContaining({
        data: jasmine.objectContaining({
          totalImages: 3,
          annotatedImages: 1,
          unannotatedImages: 2,
        }),
      }),
    );
    expect(exports.getExportUrls).not.toHaveBeenCalled();
    expect(exports.exportYoloDataset).not.toHaveBeenCalled();
  });

  it('rejects non-ready uploads before opening the YOLO dialog', async () => {
    const draft = { ...upload, status: 'draft' as const };
    component.result.set({ records: [draft], total: 1 });
    component.selectedIds.set(new Set([draft.id]));

    await component.exportSelectedAsYolo();

    expect(dialog.open).not.toHaveBeenCalled();
    expect(annotations.listUploadAnnotationsBatch).not.toHaveBeenCalled();
    expect(exports.getExportUrls).not.toHaveBeenCalled();
  });

  it('requests the ZIP only after confirming the YOLO dialog', async () => {
    component.result.set({ records: [upload], total: 1 });
    component.selectedIds.set(new Set([upload.id]));
    const annotationsMap = new Map([[upload.id, [annotation]]]);
    annotations.listUploadAnnotationsBatch.and.resolveTo(annotationsMap);
    const options = {
      trainRatio: 0.5,
      includeUnannotated: 'empty-labels' as const,
      enabledClasses: ['weed'],
    };
    dialog.open.and.returnValue({ afterClosed: () => of(options) } as ReturnType<
      MatDialog['open']
    >);
    exports.exportYoloDataset.and.resolveTo({
      downloaded: 3,
      skipped: 0,
      trainCount: 1,
      valCount: 2,
    });

    await component.exportSelectedAsYolo();

    expect(exports.getExportUrls).not.toHaveBeenCalled();
    expect(exports.exportYoloDataset).toHaveBeenCalledOnceWith(
      [upload],
      options,
      annotationsMap,
      jasmine.any(Function),
    );
  });
});
