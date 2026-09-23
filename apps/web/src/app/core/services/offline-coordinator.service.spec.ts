import { signal } from '@angular/core';
import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { OfflineCatalogCacheService } from './offline-catalog-cache.service';
import { OfflineCoordinatorService } from './offline-coordinator.service';
import { OfflinePreparationService } from './offline-preparation.service';
import { OfflineUploadStoreService } from './offline-upload-store.service';
import { OfflineUploadSyncService } from './offline-upload-sync.service';

describe('OfflineCoordinatorService lifecycle', () => {
  let coordinator: OfflineCoordinatorService;
  let sync: jasmine.SpyObj<OfflineUploadSyncService>;
  let catalogs: jasmine.SpyObj<OfflineCatalogCacheService>;
  let online: jasmine.Spy;
  const user = signal<{ id: string } | null>(null);
  const needsLogin = signal(false);

  beforeEach(() => {
    user.set(null);
    needsLogin.set(false);
    online = spyOnProperty(navigator, 'onLine', 'get').and.returnValue(true);
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    sync = jasmine.createSpyObj('Sync', ['syncAll']);
    sync.syncAll.and.resolveTo();
    catalogs = jasmine.createSpyObj('Catalogs', ['load', 'refresh', 'savedAt']);
    catalogs.savedAt.and.returnValue(null);
    catalogs.refresh.and.resolveTo({ properties: [], talhoes: [], cropTypes: [], estadios: [] });
    TestBed.configureTestingModule({
      providers: [
        OfflineCoordinatorService,
        {
          provide: AuthService,
          useValue: {
            user,
            offlineSession: () => false,
            reauthenticationRequired: needsLogin,
            ensureSession: async () => 'token',
            assertIdentity: () => undefined,
          },
        },
        { provide: OfflineUploadSyncService, useValue: sync },
        { provide: OfflineCatalogCacheService, useValue: catalogs },
        {
          provide: OfflinePreparationService,
          useValue: { prepare: async () => undefined, ready: () => false },
        },
        {
          provide: OfflineUploadStoreService,
          useValue: { changes: signal(0), count: async () => 0 },
        },
      ],
    });
    coordinator = TestBed.inject(OfflineCoordinatorService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('prepares catalogs and synchronizes after login without visiting an upload page', fakeAsync(() => {
    coordinator.start();
    flushMicrotasks();
    user.set({ id: 'owner' });
    TestBed.flushEffects();
    flushMicrotasks();
    expect(catalogs.refresh).toHaveBeenCalled();
    expect(sync.syncAll).toHaveBeenCalledWith('owner', undefined, true);
  }));

  it('synchronizes on reconnect and foreground resume from any route', fakeAsync(() => {
    user.set({ id: 'owner' });
    online.and.returnValue(false);
    coordinator.start();
    TestBed.flushEffects();
    flushMicrotasks();
    expect(sync.syncAll).not.toHaveBeenCalled();
    online.and.returnValue(true);
    window.dispatchEvent(new Event('online'));
    flushMicrotasks();
    expect(sync.syncAll).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('visibilitychange'));
    flushMicrotasks();
    expect(sync.syncAll).toHaveBeenCalledTimes(2);
  }));

  it('stops automatic synchronization until the original account reauthenticates', fakeAsync(() => {
    user.set({ id: 'owner' });
    needsLogin.set(true);
    coordinator.start();
    TestBed.flushEffects();
    flushMicrotasks();
    expect(sync.syncAll).not.toHaveBeenCalled();
    needsLogin.set(false);
    TestBed.flushEffects();
    flushMicrotasks();
    expect(sync.syncAll).toHaveBeenCalledTimes(1);
  }));

  it('handles reauthentication that arrives while offline preparation is still running', fakeAsync(() => {
    let prepared!: () => void;
    spyOn(TestBed.inject(OfflinePreparationService), 'prepare').and.returnValue(
      new Promise<void>((resolve) => (prepared = resolve)),
    );
    user.set({ id: 'owner' });
    needsLogin.set(true);
    coordinator.start();
    TestBed.flushEffects();
    flushMicrotasks();
    expect(sync.syncAll).not.toHaveBeenCalled();

    needsLogin.set(false);
    TestBed.flushEffects();
    prepared();
    flushMicrotasks();
    expect(sync.syncAll).toHaveBeenCalledWith('owner', undefined, true);
  }));
});
