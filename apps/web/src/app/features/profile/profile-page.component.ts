import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { combineLatest } from 'rxjs';
import { CopyIdButtonComponent } from '../../shared/components/copy-id-button.component';

import { AuthService } from '../../core/services/auth.service';
import { UsersService } from '../../core/services/users.service';
import { UserRole } from '@agrolens/contracts';
import { isUserRole, ROLE_LABELS } from '../../shared/labels';
import { PHONE_PATTERN } from '../../shared/utils/record-utils';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { PhoneMaskDirective } from '../../shared/directives/phone-mask.directive';

@Component({
  selector: 'app-profile-page',
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
    CopyIdButtonComponent,
    PageHeaderComponent,
    PhoneMaskDirective,
  ],
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.scss',
})
export class ProfilePageComponent {
  private readonly authService = inject(AuthService);
  private readonly usersService = inject(UsersService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly user = this.authService.user;
  readonly saving = signal(false);
  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', [Validators.pattern(PHONE_PATTERN)]],
  });

  readonly passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
    confirmPassword: ['', [Validators.required]],
  });

  readonly passwordSaving = signal(false);
  readonly hideCurrent = signal(true);
  readonly hideNew = signal(true);
  readonly hideConfirm = signal(true);

  readonly userInitial = computed(() => {
    const base = this.user()?.fullName || this.user()?.email || 'U';
    return base.trim().charAt(0).toUpperCase();
  });

  readonly roleLabel = computed(() => {
    const role = this.user()?.role;
    if (role && isUserRole(role)) return ROLE_LABELS[role];
    return role || '-';
  });

  readonly isAdmin = computed(() => this.user()?.role === 'admin');

  readonly memberSince = computed(() => {
    const raw = this.user()?.createdAt;
    if (!raw) return '-';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
      .format(date)
      .replace(/\./g, '');
  });

  constructor() {
    effect(() => {
      const nextName = this.user()?.fullName || '';
      this.form.patchValue({ fullName: nextName }, { emitEvent: false });
    });

    effect(() => {
      const nextPhone = this.user()?.phone || '';
      this.form.patchValue({ phone: nextPhone }, { emitEvent: false });
    });

    // Mirror the password-mismatch state onto the confirm control so its
    // <mat-error> can render: a group-level error alone never marks the
    // control invalid, which is what mat-form-field uses for display.
    combineLatest([
      this.passwordForm.controls.newPassword.valueChanges,
      this.passwordForm.controls.confirmPassword.valueChanges,
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncPasswordMismatch());
    this.syncPasswordMismatch();
  }

  private syncPasswordMismatch(): void {
    const password = this.passwordForm.controls.newPassword;
    const confirm = this.passwordForm.controls.confirmPassword;
    const mismatch = password.value !== confirm.value;

    if (mismatch) {
      confirm.setErrors({ ...confirm.errors, mismatch: true });
    } else {
      const errors = { ...(confirm.errors ?? {}) };
      delete errors['mismatch'];
      confirm.setErrors(Object.keys(errors).length ? errors : null);
    }
  }

  async saveProfile(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    try {
      this.saving.set(true);
      const { fullName, phone } = this.form.getRawValue();
      await this.usersService.updateProfile({
        fullName: fullName.trim(),
        phone: phone.trim() || null,
      });
      await this.authService.loadCurrentUser();
      this.snackBar.open('Perfil atualizado com sucesso.', 'Fechar', {
        duration: 3000,
      });
    } catch {
      this.snackBar.open('Não foi possível atualizar o perfil agora.', 'Fechar', {
        duration: 4200,
      });
    } finally {
      this.saving.set(false);
    }
  }

  async changePassword(): Promise<void> {
    if (this.passwordForm.invalid || this.passwordSaving()) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.passwordSaving.set(true);
    try {
      const { currentPassword, newPassword } = this.passwordForm.getRawValue();
      await this.usersService.changePassword(currentPassword, newPassword);
      this.passwordForm.reset();
      await this.authService.logout();
      this.snackBar.open('Senha alterada. Entre novamente com a nova senha.', 'Fechar', {
        duration: 4000,
      });
    } catch {
      this.snackBar.open('Não foi possível alterar a senha. Verifique a senha atual.', 'Fechar', {
        duration: 4200,
      });
    } finally {
      this.passwordSaving.set(false);
    }
  }
}
