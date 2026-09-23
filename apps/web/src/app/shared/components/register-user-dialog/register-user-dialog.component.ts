import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { USER_ROLES, UserRole } from '@agrolens/contracts';
import { ROLE_LABELS } from '../../labels';
import { UsersService } from '../../../core/services/users.service';
import { PhoneMaskDirective } from '../../directives/phone-mask.directive';
import { PHONE_PATTERN } from '../../utils/record-utils';

@Component({
  selector: 'app-register-user-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatSnackBarModule,
    MatTooltipModule,
    PhoneMaskDirective,
  ],
  templateUrl: './register-user-dialog.component.html',
  styleUrl: './register-user-dialog.component.scss',
})
export class RegisterUserDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<RegisterUserDialogComponent>);
  private readonly usersService = inject(UsersService);
  private readonly snackBar = inject(MatSnackBar);
  readonly creating = signal(false);
  readonly created = signal(false);
  readonly createdUserData = signal<{
    id: string;
    email: string;
    fullName: string;
    password: string;
    phone: string;
    role: UserRole;
  } | null>(null);

  readonly roleLabels = ROLE_LABELS;
  readonly roleOptions = USER_ROLES;

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
    role: ['user' as UserRole, Validators.required],
  });

  passwordsMatch(): boolean {
    const password = this.form.controls.password.value;
    const confirmPassword = this.form.controls.confirmPassword.value;
    return password === confirmPassword;
  }

  canSubmit(): boolean {
    return this.form.valid && this.passwordsMatch() && !this.creating();
  }

  generatePassword(): void {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    const random = crypto.getRandomValues(new Uint32Array(12));
    let password = '';
    for (let i = 0; i < random.length; i++) {
      password += chars.charAt(random[i] % chars.length);
    }

    this.form.patchValue({
      password,
      confirmPassword: password,
    });
  }

  async registerUser(): Promise<void> {
    if (!this.canSubmit() || this.created()) {
      return;
    }

    this.creating.set(true);

    try {
      const { email, fullName, password, phone, role } = this.form.getRawValue();

      const result = await this.usersService.createUser({
        email,
        fullName,
        password,
        role,
        phone,
      });

      this.createdUserData.set({
        id: result.id,
        email: result.email,
        fullName: result.fullName,
        password,
        phone: result.phone ?? phone,
        role: result.role,
      });
      this.created.set(true);
    } catch {
      this.snackBar.open('Erro ao criar usuário.', 'Fechar', {
        duration: 3500,
      });
    } finally {
      this.creating.set(false);
    }
  }

  copyAccessInfo(): void {
    const data = this.createdUserData();
    if (!data) return;

    const accessInfo = `
ID: ${data.id}
Email: ${data.email}
Telefone: ${data.phone}
Senha: ${data.password}
Perfil: ${this.roleLabels[data.role]}
    `.trim();

    navigator.clipboard.writeText(accessInfo).then(
      () => {
        this.snackBar.open(
          'Informações de acesso copiadas para a área de transferência!',
          'Fechar',
          { duration: 2600 },
        );
      },
      () => {
        this.snackBar.open('Falha ao copiar informações de acesso.', 'Fechar', { duration: 3000 });
      },
    );
  }

  close(): void {
    this.dialogRef.close();
  }

  closeAfterCreate(): void {
    this.dialogRef.close(this.createdUserData());
  }
}
