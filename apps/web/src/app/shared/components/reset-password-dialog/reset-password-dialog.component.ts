import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface ResetPasswordDialogData {
  fullName: string;
}

@Component({
  selector: 'app-reset-password-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
  template: `
    <h2 mat-dialog-title>Redefinir senha</h2>
    <mat-dialog-content style="min-width: 360px">
      <p>
        Defina uma nova senha para <strong>{{ data.fullName }}</strong
        >. Ao confirmar, todas as sessões ativas dessa conta serão desconectadas.
      </p>
      <form [formGroup]="form" class="reset-form">
        <mat-form-field appearance="outline" style="width: 100%">
          <mat-label>Nova senha</mat-label>
          <input
            matInput
            type="password"
            autocomplete="new-password"
            formControlName="newPassword"
          />
          @if (form.controls.newPassword.hasError('required')) {
            <mat-error>Nova senha é obrigatória</mat-error>
          } @else if (form.controls.newPassword.hasError('minlength')) {
            <mat-error>Mínimo de 8 caracteres</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" style="width: 100%">
          <mat-label>Confirmar nova senha</mat-label>
          <input
            matInput
            type="password"
            autocomplete="new-password"
            formControlName="confirmPassword"
          />
        </mat-form-field>
        @if (form.hasError('mismatch') && form.controls.confirmPassword.touched) {
          <div class="error-hint">As senhas não conferem.</div>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button
        mat-flat-button
        color="primary"
        [disabled]="!canSubmit()"
        [mat-dialog-close]="form.getRawValue().newPassword"
      >
        <mat-icon>password</mat-icon>
        Redefinir senha
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .error-hint {
      color: var(--mat-form-field-error-text-color, #f44336);
      font-size: 0.78rem;
      margin-top: -0.75rem;
      margin-bottom: 0.5rem;
    }
  `,
})
export class ResetPasswordDialogComponent {
  private readonly fb = inject(FormBuilder);
  readonly data = inject<ResetPasswordDialogData>(MAT_DIALOG_DATA);

  readonly form = this.fb.nonNullable.group(
    {
      newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
      confirmPassword: ['', [Validators.required]],
    },
    {
      validators: (g) =>
        g.value.newPassword === g.value.confirmPassword ? null : { mismatch: true },
    },
  );

  canSubmit(): boolean {
    return this.form.valid;
  }
}
