import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Clipboard } from '@angular/cdk/clipboard';
import { UploadsListPageComponent } from './uploads-list-page.component';
import { UploadsService } from '../../core/services/uploads.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { UsersService } from '../../core/services/users.service';
import { AnnotationsService } from '../../core/services/annotations.service';
import { ExportService } from '../../core/services/export.service';
import { UploadPageResult } from '../../shared/models/upload-record';

describe('UploadsListPageComponent pagination', () => {
  let component: UploadsListPageComponent;
  let uploads: jasmine.SpyObj<UploadsService>;

  beforeEach(() => {
    uploads = jasmine.createSpyObj('UploadsService', ['listUploads']);
    uploads.listUploads.and.resolveTo({ records: [], total: 100 });
    TestBed.configureTestingModule({
      providers: [
        { provide: UploadsService, useValue: uploads },
        ...[
          CatalogsService,
          UsersService,
          AnnotationsService,
          ExportService,
          MatDialog,
          Clipboard,
        ].map((provide) => ({ provide, useValue: {} })),
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
});
