import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password-page',
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
  templateUrl: './forgot-password-page.component.html',
  styleUrl: './forgot-password-page.component.scss',
})
export class ForgotPasswordPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);

  readonly loading = signal(false);
  readonly submitted = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    try {
      const { email } = this.form.getRawValue();
      await this.authService.requestPasswordReset(email);
      this.submitted.set(true);
      this.snackBar.open(
        'Se o email estiver cadastrado, enviamos um link de redefinição.',
        'Fechar',
        { duration: 5000 },
      );
    } catch (error) {
      const message =
        error instanceof HttpErrorResponse && error.status === 503
          ? 'Recuperação por email não configurada. Contate o administrador.'
          : error instanceof HttpErrorResponse && error.status === 429
            ? 'Muitas tentativas. Tente novamente mais tarde.'
            : 'Não foi possível enviar o email. Tente novamente.';
      this.snackBar.open(message, 'Fechar', { duration: 4500 });
    } finally {
      this.loading.set(false);
    }
  }
}
