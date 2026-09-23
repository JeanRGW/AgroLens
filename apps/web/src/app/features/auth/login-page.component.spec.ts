import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';

import { LoginPageComponent } from './login-page.component';
import { AuthService } from '../../core/services/auth.service';
import { UserRole } from '@agrolens/contracts';

describe('LoginPageComponent', () => {
  let fixture: ComponentFixture<LoginPageComponent>;
  let component: LoginPageComponent;
  let authService: jasmine.SpyObj<AuthService>;
  let router: Router;
  let snackBar: jasmine.SpyObj<MatSnackBar>;
  const route = { snapshot: { queryParamMap: convertToParamMap({}) } };

  beforeEach(async () => {
    route.snapshot.queryParamMap = convertToParamMap({});
    authService = jasmine.createSpyObj('AuthService', ['login']);
    snackBar = jasmine.createSpyObj('MatSnackBar', ['open']);

    TestBed.configureTestingModule({
      imports: [LoginPageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: ActivatedRoute, useValue: route },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    });
    // The component imports MatSnackBarModule, whose own MatSnackBar provider
    // would shadow the stub above. An override wins over module providers.
    TestBed.overrideProvider(MatSnackBar, { useValue: snackBar });
    await TestBed.compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    fixture = TestBed.createComponent(LoginPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create without a suspension notice', () => {
    expect(component).toBeTruthy();
    expect(component.suspendedNotice()).toBeFalse();
  });

  it('should flag the suspension notice with reason=disabled', () => {
    route.snapshot.queryParamMap = convertToParamMap({ reason: 'disabled' });

    const suspendedFixture = TestBed.createComponent(LoginPageComponent);
    suspendedFixture.detectChanges();

    expect(suspendedFixture.componentInstance.suspendedNotice()).toBeTrue();
  });

  it('should log in and navigate on success', async () => {
    authService.login.and.resolveTo({
      id: 'u1',
      fullName: 'U',
      email: 'u@test',
      role: 'user',
    });
    component.form.setValue({ email: 'u@test', password: 'password123' });

    await component.login();

    expect(authService.login).toHaveBeenCalledWith('u@test', 'password123');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('should show the suspension message when login reports a disabled account', async () => {
    authService.login.and.callFake(() =>
      Promise.reject(
        new HttpErrorResponse({
          status: 401,
          error: { message: 'Account is disabled', code: 'account_disabled' },
        }),
      ),
    );
    component.form.setValue({ email: 'u@test', password: 'password123' });

    await component.login();

    expect(authService.login).toHaveBeenCalled();
    expect(snackBar.open).toHaveBeenCalledWith(
      'Conta suspensa. Fale com um administrador.',
      'Fechar',
      { duration: 4500 },
    );
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('should show the generic message for other login failures', async () => {
    authService.login.and.callFake(() =>
      Promise.reject(new HttpErrorResponse({ status: 401, error: 'Unauthorized' })),
    );
    component.form.setValue({ email: 'u@test', password: 'password123' });

    await component.login();

    expect(snackBar.open).toHaveBeenCalledWith(
      'Falha no login. Verifique email e senha.',
      'Fechar',
      { duration: 4500 },
    );
  });
});
