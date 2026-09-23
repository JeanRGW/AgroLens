import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { combineLatest } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { AuthService } from '../../core/services/auth.service';
import { PhoneMaskDirective } from '../../shared/directives/phone-mask.directive';
import { PHONE_PATTERN } from '../../shared/utils/record-utils';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    PhoneMaskDirective,
  ],
  templateUrl: './register-page.component.html',
  styleUrl: './register-page.component.scss',
})
export class RegisterPageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly hidePassword = signal(true);
  readonly hideConfirmPassword = signal(true);

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  });

  ngOnInit(): void {
    combineLatest([
      this.form.controls.password.valueChanges,
      this.form.controls.confirmPassword.valueChanges,
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncMismatchError());
    this.syncMismatchError();
  }

  private syncMismatchError(): void {
    const password = this.form.get('password')!;
    const confirm = this.form.get('confirmPassword')!;
    const mismatch = password.value !== confirm.value;

    if (mismatch) {
      confirm.setErrors({ ...confirm.errors, mismatch: true });
    } else {
      const errors = { ...(confirm.errors ?? {}) };
      delete errors['mismatch'];
      confirm.setErrors(Object.keys(errors).length ? errors : null);
    }
  }

  togglePasswordVisibility(): void {
    this.hidePassword.update((value) => !value);
  }

  toggleConfirmPasswordVisibility(): void {
    this.hideConfirmPassword.update((value) => !value);
  }

  async register(): Promise<void> {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);

    try {
      const { email, fullName, password, phone } = this.form.getRawValue();
      await this.authService.register(email, fullName, password, phone);
      await this.router.navigateByUrl('/dashboard');
    } catch (error) {
      const message =
        error instanceof HttpErrorResponse && error.status === 403
          ? 'O cadastro de novos usuários está temporariamente desativado. Solicite acesso a um administrador.'
          : 'Falha no registro. O email pode já estar em uso.';
      this.snackBar.open(message, 'Fechar', {
        duration: 4500,
      });
    } finally {
      this.loading.set(false);
    }
  }
}
