import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { UsersService } from '../../core/services/users.service';
import { TalhoesPageComponent } from './talhoes-page.component';
import { EstadiosPageComponent } from './estadios-page.component';
import { CropsPageComponent } from './crops-page.component';
import { PropertiesPageComponent } from './properties-page.component';

describe('Catalog page backend contracts', () => {
  const userId = '9c8d44ac-b18d-4b0b-a8b8-6a67097a1551';
  const base = { id: 'record', name: 'Existing', userId, createdAt: '2026-09-08T00:00:00Z' };
  let catalogs: jasmine.SpyObj<CatalogsService>;

  beforeEach(() => {
    catalogs = jasmine.createSpyObj('CatalogsService', [
      'listProperties',
      'listCropTypes',
      'listTalhoes',
      'listEstadios',
      'updateTalhao',
      'updateEstadio',
      'deleteProperty',
      'deleteCropType',
      'deleteTalhao',
      'deleteEstadio',
    ]);
    for (const method of [
      'listProperties',
      'listCropTypes',
      'listTalhoes',
      'listEstadios',
    ] as const) {
      catalogs[method].and.resolveTo([]);
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: CatalogsService, useValue: catalogs },
        {
          provide: AuthService,
          useValue: { user: signal({ id: userId, fullName: 'Owner' }), isAdmin: signal(true) },
        },
        { provide: UsersService, useValue: {} },
        { provide: MatSnackBar, useValue: jasmine.createSpyObj('MatSnackBar', ['open']) },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(true) }) } },
      ],
    });
  });

  it('allows talhao parent editing and removes deleted rows', async () => {
    const page = TestBed.runInInjectionContext(() => new TalhoesPageComponent());
    const record = { ...base, propertyId: 'property' };
    page.talhoes.set([record]);
    await page.editTalhao(record);
    expect(page.form.controls.propertyId.enabled).toBeTrue();
    await page.saveTalhao();
    expect(catalogs.updateTalhao).toHaveBeenCalledWith('record', {
      name: 'Existing',
      propertyId: 'property',
    });
    expect(page.form.controls.propertyId.enabled).toBeTrue();
    page.talhoes.set([record]);
    await page.deleteTalhao(record);
    expect(page.talhoes()).toEqual([]);
  });

  it('allows estadio parent editing and removes deleted rows', async () => {
    const page = TestBed.runInInjectionContext(() => new EstadiosPageComponent());
    const record = { ...base, cropTypeId: 'crop' };
    page.estadios.set([record]);
    await page.editEstadio(record);
    expect(page.form.controls.cropTypeId.enabled).toBeTrue();
    await page.saveEstadio();
    expect(catalogs.updateEstadio).toHaveBeenCalledWith('record', {
      name: 'Existing',
      cropTypeId: 'crop',
    });
    expect(page.form.controls.cropTypeId.enabled).toBeTrue();
    page.estadios.set([record]);
    await page.deleteEstadio(record);
    expect(page.estadios()).toEqual([]);
  });

  it('removes deleted properties and crop types from their lists', async () => {
    const crops = TestBed.runInInjectionContext(() => new CropsPageComponent());
    crops.crops.set([base]);
    await crops.deleteCrop(base);
    expect(crops.crops()).toEqual([]);
    const properties = TestBed.runInInjectionContext(() => new PropertiesPageComponent());
    const property = { ...base, owner: 'Owner', address: 'Address', latitude: 0, longitude: 0 };
    properties.properties.set([property]);
    await properties.deleteProperty(property);
    expect(properties.properties()).toEqual([]);
  });
  it('validates ownership only during admin editing', async () => {
    const page = TestBed.runInInjectionContext(() => new CropsPageComponent());
    page.form.controls.name.setValue('New crop');
    expect(page.form.valid).toBeTrue();
    await page.editCrop(base);
    page.form.controls.userId.setValue('admin-123');
    expect(page.form.invalid).toBeTrue();
    page.cancelEdit();
    expect(page.form.controls.userId.disabled).toBeTrue();
  });
});
