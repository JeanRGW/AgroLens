import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-reset-password-page',
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
  templateUrl: './reset-password-page.component.html',
  styleUrl: './reset-password-page.component.scss',
})
export class ResetPasswordPageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);

  readonly loading = signal(false);
  readonly hidePassword = signal(true);
  readonly hideConfirmPassword = signal(true);
  readonly token = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
    confirmPassword: ['', Validators.required],
  });

  ngOnInit(): void {
    const rawToken = this.route.snapshot.queryParamMap.get('token');
    this.token.set(rawToken);
  }

  togglePasswordVisibility(): void {
    this.hidePassword.update((v) => !v);
  }

  toggleConfirmPasswordVisibility(): void {
    this.hideConfirmPassword.update((v) => !v);
  }

  async submit(): Promise<void> {
    const token = this.token();
    if (!token) {
      this.snackBar.open('Link inválido. Solicite um novo email de redefinição.', 'Fechar', {
        duration: 4500,
      });
      return;
    }

    const { newPassword, confirmPassword } = this.form.getRawValue();
    if (newPassword !== confirmPassword) {
      this.form.controls.confirmPassword.setErrors({ mismatch: true });
      this.form.markAllAsTouched();
      return;
    }
    this.form.controls.confirmPassword.setErrors(null);

    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    try {
      await this.authService.resetPassword(token, newPassword);
      this.snackBar.open('Senha redefinida. Faça login com a nova senha.', 'Fechar', {
        duration: 4500,
      });
      await this.router.navigate(['/login']);
    } catch (error) {
      const message =
        error instanceof HttpErrorResponse && error.status === 400
          ? 'Link inválido, expirado ou já utilizado. Solicite um novo email.'
          : error instanceof HttpErrorResponse && error.status === 429
            ? 'Muitas tentativas. Tente novamente mais tarde.'
            : 'Não foi possível redefinir a senha. Tente novamente.';
      this.snackBar.open(message, 'Fechar', { duration: 4500 });
    } finally {
      this.loading.set(false);
    }
  }
}
