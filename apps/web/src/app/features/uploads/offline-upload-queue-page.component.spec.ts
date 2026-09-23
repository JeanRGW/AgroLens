import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../core/services/auth.service';
import { OfflineCoordinatorService } from '../../core/services/offline-coordinator.service';
import { OfflineUploadStoreService } from '../../core/services/offline-upload-store.service';
import { OfflineUploadSyncService } from '../../core/services/offline-upload-sync.service';
import { OfflineUpload } from '../../shared/models/offline-upload';
import { OfflineUploadQueuePageComponent } from './offline-upload-queue-page.component';
import { withBrowserLock } from '../../shared/utils/browser-lock';

describe('OfflineUploadQueuePageComponent', () => {
  const upload: OfflineUpload = {
    id: 'local-1',
    userId: 'owner',
    backendUploadId: 'server-1',
    status: 'failed',
    failureKind: 'validation',
    createdAt: '2026-09-01T12:00:00Z',
    updatedAt: '2026-09-01T12:01:00Z',
    request: {
      clientUploadId: 'client-1',
      propertyId: 'p',
      talhaoId: 't',
      cropTypeId: 'c',
      source: 'phone',
      activityDate: '2026-09-01T11:00:00Z',
      latitude: -25.4,
      longitude: -51.4,
      files: [{ fileName: 'photo.png', contentType: 'image/png', sizeBytes: 4 }],
    },
    files: [{ blob: new Blob(['data']), fileName: 'photo.png', contentType: 'image/png' }],
  };
  let fixture: ComponentFixture<OfflineUploadQueuePageComponent>;
  let store: jasmine.SpyObj<OfflineUploadStoreService>;
  let queued: OfflineUpload[];
  let syncing: WritableSignal<boolean>;
  let user: WritableSignal<{ id: string }>;

  beforeEach(async () => {
    queued = [upload];
    syncing = signal(false);
    user = signal({ id: upload.userId });
    store = jasmine.createSpyObj('OfflineUploadStoreService', ['list', 'get', 'delete', 'save'], {
      changes: signal(0),
    });
    store.list.and.callFake(async (userId) => queued.filter((item) => item.userId === userId));
    store.get.and.callFake(async (id) => queued.find((item) => item.id === id));
    store.delete.and.callFake(async (id) => {
      queued = queued.filter((item) => item.id !== id);
    });
    store.save.and.callFake(async (item) => {
      queued = [...queued.filter((current) => current.id !== item.id), item];
    });
    await TestBed.configureTestingModule({
      imports: [OfflineUploadQueuePageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user } },
        { provide: OfflineUploadStoreService, useValue: store },
        { provide: OfflineUploadSyncService, useValue: { syncing } },
        { provide: OfflineCoordinatorService, useValue: { online: signal(true) } },
        { provide: MatSnackBar, useValue: {} },
        { provide: MatDialog, useValue: {} },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(OfflineUploadQueuePageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('offers correction for validation failures even after the server upload was initialized', () => {
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'a[href="/uploads/new?localId=local-1"]',
    );
    expect(link?.textContent?.trim()).toBe('Corrigir lote');
  });

  it('lets the user delete an idle batch while another batch is synchronizing', async () => {
    syncing.set(true);
    spyOn(window, 'confirm').and.returnValue(true);
    fixture.detectChanges();
    const button = deleteButton();
    expect(button.disabled).toBeFalse();
    const remove = spyOn(fixture.componentInstance, 'remove').and.callThrough();

    button.click();
    await remove.calls.mostRecent().returnValue;
    await fixture.whenStable();

    expect(store.delete).toHaveBeenCalledOnceWith(upload.id);
    expect(fixture.componentInstance.uploads()).toEqual([]);
    expect(syncing()).toBeTrue();
  });

  for (const nativeLocks of [true, false]) {
    it(`queues deletion after a finalization attempt without resurrecting the batch (${nativeLocks ? 'Web Locks' : 'fallback'})`, async () => {
      if (!nativeLocks)
        spyOnProperty(navigator as { locks?: LockManager }, 'locks', 'get').and.returnValue(
          undefined,
        );
      syncing.set(true);
      const confirm = spyOn(window, 'confirm').and.returnValue(true);
      const { attempt, release } = await holdAttempt(async () => {
        await store.save({ ...upload, failureKind: 'network', errorMessage: 'timeout' });
      });
      const component = fixture.componentInstance;
      const removal = component.remove(upload);
      fixture.detectChanges();

      expect(deleteButton().disabled).toBeTrue();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'Excluindo lote local...',
      );
      expect(store.delete).not.toHaveBeenCalled();
      await component.remove(upload);
      expect(confirm).toHaveBeenCalledTimes(1);

      release();
      await attempt;
      await removal;

      expect(store.save).toHaveBeenCalledBefore(store.delete);
      expect(store.delete).toHaveBeenCalledOnceWith(upload.id);
      expect(queued).toEqual([]);
      expect(component.uploads()).toEqual([]);
      expect(component.removingIds().has(upload.id)).toBeFalse();
    });
  }

  it('rechecks the owner after waiting for an active attempt before deleting', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    const { attempt, release } = await holdAttempt(async () => undefined);
    const removal = fixture.componentInstance.remove(upload);
    user.set({ id: 'other-account' });
    release();
    await attempt;
    await removal;

    expect(store.delete).not.toHaveBeenCalled();
    expect(queued).toEqual([upload]);
    expect(fixture.componentInstance.removingIds().has(upload.id)).toBeFalse();
  });

  function deleteButton(): HTMLButtonElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Excluir lote local"]',
    )!;
  }

  async function holdAttempt(finish: () => Promise<void>) {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const acquired = new Promise<void>((resolve) => (started = resolve));
    const attempt = withBrowserLock(`agrolens-upload:${upload.id}`, async () => {
      started();
      await gate;
      await finish();
    });
    await acquired;
    return { attempt, release };
  }
});
