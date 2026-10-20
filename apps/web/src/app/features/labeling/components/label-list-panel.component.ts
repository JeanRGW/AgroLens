import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { reviewedDetectionSchema, type YoloLabel } from '@agrolens/contracts';

@Component({
  selector: 'app-label-list-panel',
  standalone: true,
  imports: [DecimalPipe, FormsModule, MatButtonModule, MatIconModule],
  template: `
    <div class="panel-card">
      <div class="panel-header">
        <span class="panel-title">Rótulos</span>
        <span class="panel-count">{{ labels().length }}</span>
      </div>

      @if (labels().length === 0) {
        <div class="empty-state">
          <mat-icon>label_off</mat-icon>
          <span>Nenhum rótulo desenhado.</span>
        </div>
      } @else {
        <div class="label-list">
          @for (label of labels(); track $index) {
            <div class="label-item" [class.selected]="selectedLabelIndex() === $index">
              <button
                type="button"
                class="select-label"
                (click)="selectLabel.emit($index)"
                [attr.aria-pressed]="selectedLabelIndex() === $index"
              >
                <span class="color-swatch" [style.background-color]="getColor(label)"></span>
                <div class="label-info">
                  <span class="label-name">{{ getClassName(label) }}</span>
                  <span class="label-coords">
                    {{ label.xCenter | number: '1.3-3' }}, {{ label.yCenter | number: '1.3-3' }} |
                    {{ label.width | number: '1.3-3' }} x
                    {{ label.height | number: '1.3-3' }}
                  </span>
                </div>
              </button>
              <button
                mat-icon-button
                class="remove-btn"
                (click)="removeLabel.emit($index); $event.stopPropagation()"
                aria-label="Remover rótulo"
                [disabled]="disabled()"
              >
                <mat-icon>delete_outline</mat-icon>
              </button>
            </div>
          }
        </div>
      }
      @if (draft(); as label) {
        <fieldset class="label-editor" [disabled]="disabled()">
          <legend>Ajustar rótulo selecionado</legend>
          <label
            >Classe
            <select [ngModel]="label.className" (ngModelChange)="changeClass($event)">
              @for (cls of classes(); track cls) {
                <option [value]="cls">{{ cls }}</option>
              }
            </select>
          </label>
          <div class="geometry-fields">
            <label
              >Centro X<input
                type="number"
                min="0"
                max="1"
                step="0.001"
                [ngModel]="label.xCenter"
                (ngModelChange)="changeGeometry('xCenter', $event)"
            /></label>
            <label
              >Centro Y<input
                type="number"
                min="0"
                max="1"
                step="0.001"
                [ngModel]="label.yCenter"
                (ngModelChange)="changeGeometry('yCenter', $event)"
            /></label>
            <label
              >Largura<input
                type="number"
                min="0.001"
                max="1"
                step="0.001"
                [ngModel]="label.width"
                (ngModelChange)="changeGeometry('width', $event)"
            /></label>
            <label
              >Altura<input
                type="number"
                min="0.001"
                max="1"
                step="0.001"
                [ngModel]="label.height"
                (ngModelChange)="changeGeometry('height', $event)"
            /></label>
          </div>
          @if (geometryError()) {
            <p role="alert">{{ geometryError() }}</p>
          }
          <button mat-stroked-button (click)="applyChanges()">Aplicar ajuste</button>
          <small
            >Coordenadas de 0 a 1. Você também pode mover a caixa e arrastar os cantos na
            imagem.</small
          >
        </fieldset>
      }
    </div>
  `,
  styles: `
    .panel-card {
      background: var(--agri-surface);
      border: 1px solid var(--agri-border);
      border-radius: 12px;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .panel-title {
      font-weight: 600;
      font-size: 0.9375rem;
      color: var(--agri-text);
    }

    .panel-count {
      font-size: 12px;
      color: var(--agri-muted-text);
      background: var(--agri-fill-subtle);
      padding: 2px 8px;
      border-radius: 12px;
    }

    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--agri-muted-text);
      min-height: 120px;
    }

    .empty-state mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
    }

    .label-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      overflow: auto;
    }

    .label-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid transparent;
      background: transparent;
      cursor: pointer;
      text-align: left;
      transition:
        background 0.15s,
        border-color 0.15s;
    }
    .select-label {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      text-align: left;
    }
    .label-editor {
      display: grid;
      gap: 10px;
      margin: 16px 0 0;
      padding: 12px;
      border: 1px solid var(--agri-border);
      border-radius: 8px;
    }
    .label-editor legend {
      font-size: 0.85rem;
    }
    .label-editor label {
      display: grid;
      gap: 4px;
      font-size: 0.75rem;
    }
    .label-editor input,
    .label-editor select {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      padding: 6px;
      color: var(--agri-text);
      background: var(--agri-surface);
      border: 1px solid var(--agri-border);
      border-radius: 4px;
    }
    .geometry-fields {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .label-editor small {
      color: var(--agri-text-muted);
      font-size: 0.7rem;
    }

    .label-item:hover {
      background: var(--agri-fill-subtle);
    }

    .label-item.selected {
      background: var(--agri-fill);
      border-color: var(--agri-accent);
    }

    .color-swatch {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .label-info {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }

    .label-name {
      font-weight: 500;
      font-size: 0.875rem;
      color: var(--agri-text);
    }

    .label-coords {
      font-size: 11px;
      color: var(--agri-muted-text);
      font-family: var(--agri-mono);
    }

    .remove-btn {
      width: 32px;
      height: 32px;
      line-height: 32px;
      color: var(--agri-text-muted);
    }
  `,
})
export class LabelListPanelComponent {
  labels = input<YoloLabel[]>([]);
  selectedLabelIndex = input<number | null>(null);
  classColors = input<Map<string, string>>(new Map());
  classes = input<string[]>([]);
  disabled = input(false);
  readonly selectedLabel = computed(() => {
    const index = this.selectedLabelIndex();
    return index === null ? null : (this.labels()[index] ?? null);
  });
  readonly draft = signal<YoloLabel | null>(null);
  readonly geometryError = signal('');
  private pendingChanges: Partial<YoloLabel> = {};
  private draftIndex: number | null = null;

  selectLabel = output<number>();
  removeLabel = output<number>();
  labelChange = output<{ index: number; label: YoloLabel }>();

  constructor() {
    effect(() => {
      const index = this.selectedLabelIndex();
      const label = this.selectedLabel();
      if (index !== this.draftIndex || !label) {
        this.pendingChanges = {};
        this.draftIndex = index;
        this.geometryError.set('');
      }
      this.draft.set(label ? { ...label, ...this.pendingChanges } : null);
      if (!Object.keys(this.pendingChanges).length) this.geometryError.set('');
    });
  }

  changeClass(className: string): void {
    const draft = this.draft();
    if (!draft) return;
    const changes = { className, classId: this.classes().indexOf(className) };
    this.pendingChanges = { ...this.pendingChanges, ...changes };
    this.draft.set({ ...draft, ...changes });
  }

  changeGeometry(key: 'xCenter' | 'yCenter' | 'width' | 'height', value: number | null): void {
    const draft = this.draft();
    if (!draft) return;
    const changes = { [key]: value ?? Number.NaN };
    this.pendingChanges = { ...this.pendingChanges, ...changes };
    this.draft.set({ ...draft, ...changes });
  }

  applyChanges(): void {
    const label = this.draft();
    const index = this.selectedLabelIndex();
    if (!label || index === null || this.disabled()) return;
    if (
      !reviewedDetectionSchema.safeParse({ ...label, confidence: null }).success ||
      this.classes()[label.classId] !== label.className
    ) {
      this.geometryError.set('A caixa deve ter dimensões positivas e permanecer dentro da imagem.');
      return;
    }
    this.geometryError.set('');
    this.pendingChanges = {};
    this.labelChange.emit({ index, label });
  }

  getClassName(label: YoloLabel): string {
    return this.classes()[label.classId] || label.className || 'objeto';
  }

  getColor(label: YoloLabel): string {
    return this.classColors().get(this.getClassName(label)) || '#666';
  }
}
