import { Component, inject, Input } from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

export function shortId(value: string): string {
  if (!value) return '-';
  return value.length > 13 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

@Component({
  selector: 'app-copy-id-button',
  standalone: true,
  imports: [MatIconModule, MatSnackBarModule],
  template: `
    <button
      type="button"
      class="uid-copy"
      (click)="copy()"
      [disabled]="!id"
      [attr.aria-label]="'Copiar ID: ' + (id || '')"
      [attr.title]="id || ''"
    >
      <span class="uid-label">{{ label }}</span>
      <mat-icon aria-hidden="true">content_copy</mat-icon>
    </button>
  `,
  styles: `
    .uid-copy {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      margin-left: -0.4rem;
      padding: 0.15rem 0.4rem;
      border: 0;
      border-radius: 8px;
      background: transparent;
      cursor: pointer;
      font-family: var(--agri-mono);
      font-size: 0.8rem;
      color: var(--agri-accent-dark);
      max-width: 220px;
      max-width: 100%;

      .uid-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      mat-icon {
        width: 0.95rem;
        height: 0.95rem;
        font-size: 0.95rem;
        opacity: 0.55;
      }

      &:hover {
        background: var(--agri-fill-hover);
      }

      &:hover mat-icon {
        opacity: 1;
      }

      &:focus-visible {
        outline: 2px solid var(--agri-accent);
        outline-offset: 2px;
      }

      &:disabled {
        cursor: default;
      }
    }
  `,
})
export class CopyIdButtonComponent {
  @Input({ required: true }) id = '';
  @Input() copiedMessage = 'ID copiado.';
  /** Optional display override (e.g. a user name); the raw id is still copied. */
  @Input() displayText = '';
  /** Optional `Tipo: …` prefix rendered before the display text. */
  @Input() prefix = '';

  private readonly clipboard = inject(Clipboard);
  private readonly snackBar = inject(MatSnackBar);

  get short(): string {
    return shortId(this.id);
  }

  get label(): string {
    const text = this.displayText || this.short;
    return this.prefix ? `${this.prefix}: ${text}` : text;
  }

  copy(): void {
    if (!this.id) return;
    const copied = this.clipboard.copy(this.id);
    this.snackBar.open(copied ? this.copiedMessage : 'Não foi possível copiar o ID.', 'Fechar', {
      duration: 2500,
    });
  }
}
