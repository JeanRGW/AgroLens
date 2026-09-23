import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-crud-actions',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    @if (showEdit) {
      <button
        mat-icon-button
        color="primary"
        [matTooltip]="editTooltip"
        [attr.aria-label]="editTooltip"
        (click)="edit.emit()"
      >
        <mat-icon>edit</mat-icon>
      </button>
    }
    @if (showDelete) {
      <button
        mat-icon-button
        color="warn"
        [matTooltip]="deleteTooltip"
        [attr.aria-label]="deleteTooltip"
        (click)="delete.emit()"
      >
        <mat-icon>{{ deleteIcon }}</mat-icon>
      </button>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      gap: 0.15rem;
      white-space: nowrap;
    }

    button[mat-icon-button] {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      position: relative;
      transition:
        background-color 0.15s ease,
        transform 0.15s ease;

      &::before {
        content: '';
        position: absolute;
        inset: -2px;
        border-radius: 10px;
      }

      &:focus-visible {
        outline: 2px solid var(--agri-accent);
        outline-offset: 2px;
      }

      &:hover {
        transform: scale(1.08);
      }

      &:active {
        transform: scale(0.95);
      }

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }
  `,
})
export class CrudActionsComponent {
  @Input() showEdit = true;
  @Input() showDelete = true;
  @Input() editTooltip = 'Editar';
  @Input() deleteTooltip = 'Excluir';
  @Input() deleteIcon = 'delete';
  @Output() edit = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();
}
