import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { AuthService } from '../../core/services/auth.service';
import {
  isAccountDisabledError,
  LOGIN_REASON_DISABLED,
  LOGIN_REASON_PARAM,
} from '../../shared/utils/auth-errors';

@Component({
  selector: 'app-login-page',
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
  ],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
})
export class LoginPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);

  readonly loading = signal(false);
  readonly hidePassword = signal(true);
  /** Shown when arriving from a forced logout of a suspended account. */
  readonly suspendedNotice = signal(
    this.route.snapshot.queryParamMap.get(LOGIN_REASON_PARAM) === LOGIN_REASON_DISABLED,
  );
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  togglePasswordVisibility(): void {
    this.hidePassword.update((value) => !value);
  }

  async login(): Promise<void> {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);

    try {
      const { email, password } = this.form.getRawValue();
      await this.authService.login(email, password);

      const redirect = this.getSafeRedirect(this.route.snapshot.queryParamMap.get('redirect'));
      await this.router.navigateByUrl(redirect);
    } catch (error) {
      this.snackBar.open(this.resolveLoginErrorMessage(error), 'Fechar', {
        duration: 4500,
      });
    } finally {
      this.loading.set(false);
    }
  }

  private resolveLoginErrorMessage(error: unknown): string {
    // The backend only reports suspension after a correct password, so
    // naming the state here does not help enumerate accounts.
    if (isAccountDisabledError(error)) {
      return 'Conta suspensa. Fale com um administrador.';
    }
    return 'Falha no login. Verifique o email e a senha.';
  }

  private getSafeRedirect(raw: string | null): string {
    if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('://')) {
      return '/dashboard';
    }
    return raw;
  }
}
