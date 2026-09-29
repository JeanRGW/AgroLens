import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-class-palette',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule],
  template: `
    <div class="class-palette">
      <div class="palette-header">
        <span class="palette-title">Classes</span>
        <span class="palette-hint">
          {{ classes().length }} {{ classes().length === 1 ? 'classe' : 'classes' }} — atalhos 1–9
        </span>
      </div>

      <div class="chip-list">
        @for (className of classes(); track className) {
          <button
            type="button"
            class="class-chip"
            [class.selected]="className === selectedClass()"
            [style.--chip-color]="classColors().get(className) || '#666'"
            (click)="selectClass.emit(className)"
          >
            <span
              class="chip-swatch"
              [style.background-color]="classColors().get(className) || '#666'"
            ></span>
            <span class="chip-label">{{ className }}</span>
            @if (classes().length > 1) {
              <span
                class="chip-remove"
                (click)="onRemoveClass($event, className)"
                tabindex="0"
                role="button"
                aria-label="Remover classe"
              >
                <mat-icon>cancel</mat-icon>
              </span>
            }
          </button>
        }
      </div>

      <div class="add-class-row">
        <mat-form-field appearance="outline" class="add-class-field" subscriptSizing="dynamic">
          <mat-label>Nova classe</mat-label>
          <input matInput [(ngModel)]="newClassName" (keydown.enter)="onAddClass()" />
        </mat-form-field>
        <button
          mat-icon-button
          color="primary"
          (click)="onAddClass()"
          [disabled]="!newClassName().trim()"
          aria-label="Adicionar classe"
        >
          <mat-icon>add</mat-icon>
        </button>
      </div>
    </div>
  `,
  styles: `
    .class-palette {
      background: var(--agri-surface);
      border: 1px solid var(--agri-border);
      border-radius: 12px;
      padding: 8px 12px;
    }

    .palette-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .palette-title {
      font-weight: 600;
      font-size: 0.9375rem;
      color: var(--agri-text);
    }

    .palette-hint {
      font-size: 12px;
      color: var(--agri-muted-text);
    }

    .chip-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 10px;
    }

    .class-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 20px;
      border: 1px solid var(--agri-border);
      background: var(--agri-surface-raised);
      color: var(--agri-text);
      cursor: pointer;
      font-size: 0.875rem;
      line-height: 1;
      transition:
        border-color 0.15s,
        background 0.15s,
        box-shadow 0.15s;
    }

    .class-chip:hover {
      border-color: var(--chip-color);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
    }

    .class-chip.selected {
      border-color: var(--chip-color);
      background: color-mix(in srgb, var(--chip-color) 14%, white);
      color: var(--agri-accent-dark);
      font-weight: 600;
    }

    .chip-swatch {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }

    .chip-label {
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chip-remove {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--agri-muted-text);
      cursor: pointer;
      transition: color 0.15s;
    }

    .chip-remove:hover {
      color: #d32f2f;
    }

    .chip-remove mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .add-class-row {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .add-class-field {
      flex: 1;

      ::ng-deep .mat-mdc-form-field-infix {
        min-height: 48px;
        padding-top: 8px;
        padding-bottom: 8px;
      }

      ::ng-deep .mat-mdc-floating-label {
        top: 50%;
        transform: translateY(-50%);
      }
    }
  `,
})
export class ClassPaletteComponent {
  classes = input<string[]>([]);
  selectedClass = input<string>('objeto');
  classColors = input<Map<string, string>>(new Map());

  selectClass = output<string>();
  addClass = output<string>();
  removeClass = output<string>();

  readonly newClassName = signal('');

  onAddClass(): void {
    const name = this.newClassName().trim();
    if (name && !this.classes().includes(name)) {
      this.addClass.emit(name);
      this.newClassName.set('');
    }
  }

  onRemoveClass(event: MouseEvent, className: string): void {
    event.stopPropagation();
    this.removeClass.emit(className);
  }
}
