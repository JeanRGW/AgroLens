import { DecimalPipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { YoloLabel } from '@agrolens/contracts';

@Component({
  selector: 'app-label-list-panel',
  standalone: true,
  imports: [DecimalPipe, MatButtonModule, MatIconModule],
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
            <button
              type="button"
              class="label-item"
              [class.selected]="selectedLabelIndex() === $index"
              (click)="selectLabel.emit($index)"
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
              <button
                mat-icon-button
                class="remove-btn"
                (click)="removeLabel.emit($index); $event.stopPropagation()"
                aria-label="Remover rotulo"
              >
                <mat-icon>delete_outline</mat-icon>
              </button>
            </button>
          }
        </div>
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

  selectLabel = output<number>();
  removeLabel = output<number>();

  getClassName(label: YoloLabel): string {
    return this.classes()[label.classId] || label.className || 'objeto';
  }

  getColor(label: YoloLabel): string {
    return this.classColors().get(this.getClassName(label)) || '#666';
  }
}
