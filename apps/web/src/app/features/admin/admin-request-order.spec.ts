import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { UsersService } from '../../core/services/users.service';
import { AuditService } from '../../core/services/audit.service';
import { AccessGrantsService } from '../../core/services/access-grants.service';
import { UsersAdminPageComponent } from './users-admin-page.component';
import { AuditAdminPageComponent } from './audit-admin-page.component';
import { AccessAdminPageComponent } from './access-admin-page.component';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

describe('Admin request ordering', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsersAdminPageComponent, AuditAdminPageComponent, AccessAdminPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('keeps the latest user search results when an older request finishes last', async () => {
    const pending = deferred<Awaited<ReturnType<UsersService['listUsers']>>>();
    spyOn(TestBed.inject(UsersService), 'listUsers').and.returnValues(
      pending.promise,
      Promise.resolve({ users: [], total: 2 }),
    );
    const fixture = TestBed.createComponent(UsersAdminPageComponent);
    const component = fixture.componentInstance;
    const first = component.loadUsers();
    await component.loadUsers();
    pending.resolve({ users: [], total: 100 });
    await first;
    expect(component.total()).toBe(2);
    expect(component.loading()).toBeFalse();
    fixture.destroy();
  });

  it('keeps the latest audit page when an older request finishes last', async () => {
    const pending = deferred<Awaited<ReturnType<AuditService['listEvents']>>>();
    spyOn(TestBed.inject(AuditService), 'listEvents').and.returnValues(
      pending.promise,
      Promise.resolve({ events: [], total: 2 }),
    );
    const fixture = TestBed.createComponent(AuditAdminPageComponent);
    const component = fixture.componentInstance;
    const first = component.loadEvents();
    await component.loadEvents();
    pending.resolve({ events: [], total: 100 });
    await first;
    expect(component.total()).toBe(2);
    expect(component.loading()).toBeFalse();
    fixture.destroy();
  });

  it('discards grants belonging to the previously selected subject', async () => {
    const pending = deferred<Awaited<ReturnType<AccessGrantsService['listGrants']>>>();
    spyOn(TestBed.inject(AccessGrantsService), 'listGrants').and.returnValues(
      pending.promise,
      Promise.resolve({ grants: [], total: 2 }),
    );
    const fixture = TestBed.createComponent(AccessAdminPageComponent);
    const component = fixture.componentInstance;
    component.ngOnInit();
    component.form.controls.subjectUid.setValue('first-user');
    const first = component.loadUserGrants();
    component.chooseUser({ value: 'second-user', label: 'Second' });
    await component.loadUserGrants();
    pending.resolve({ grants: [], total: 100 });
    await first;
    expect(component.total()).toBe(2);
    component.form.controls.subjectUid.setValue('third-user');
    expect(component.grants()).toEqual([]);
    expect(component.total()).toBe(0);
    fixture.destroy();
  });
});
