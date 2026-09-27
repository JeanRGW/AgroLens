import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatSliderModule } from '@angular/material/slider';

import { UnannotatedImageHandling, YoloExportOptions } from '../../../shared/models/upload-record';

/** Reference to an upload that can be linked to the labeling page. */
export interface UploadLinkRef {
  docId: string;
  displayName: string;
}

/** Per-class breakdown of which uploads are missing/contain the class. */
export interface ClassMismatchDetail {
  className: string;
  missingFrom: UploadLinkRef[];
  presentIn: UploadLinkRef[];
}

/** Per-image class info for reactive filtering in the dialog. */
export interface ImageClassInfo {
  classes: string[];
  hasAnnotation: boolean;
}

export interface YoloExportDialogData {
  uploadCount: number;
  totalImages: number;
  annotatedImages: number;
  unannotatedImages: number;
  globalClasses: string[];
  classMismatchDetails: ClassMismatchDetail[];
  unannotatedUploads: UploadLinkRef[];
  perImageClasses: ImageClassInfo[];
}

@Component({
  selector: 'app-yolo-export-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSliderModule,
    MatRadioModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>science</mat-icon>
      Exportar conjunto de dados YOLO
    </h2>

    <mat-dialog-content>
      <!-- Summary -->
      <div class="summary-section">
        <h3>Resumo</h3>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="summary-label">Uploads</span>
            <span class="summary-value">{{ data.uploadCount }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Imagens</span>
            <span class="summary-value">{{ data.totalImages }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Anotadas</span>
            <span class="summary-value annotated">{{ effectiveAnnotatedImages() }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Sem anotação</span>
            <span class="summary-value" [class.warning]="data.unannotatedImages > 0">
              {{ data.unannotatedImages }}
            </span>
          </div>
        </div>
      </div>

      <!-- Classes -->
      @if (data.globalClasses.length > 0) {
        <div class="classes-section">
          <div class="classes-header">
            <h3>Classes ({{ enabledClassCount() }}/{{ data.globalClasses.length }})</h3>
            <button
              mat-button
              class="toggle-all-btn"
              (click)="allClassesEnabled() ? deselectAllClasses() : selectAllClasses()"
            >
              {{ allClassesEnabled() ? 'Desmarcar todas' : 'Marcar todas' }}
            </button>
          </div>
          <div class="classes-list">
            @for (cls of data.globalClasses; track cls) {
              <span
                class="class-chip class-chip--toggle"
                [class.class-chip--off]="!isClassEnabled(cls)"
                (click)="toggleClass(cls)"
                role="button"
                tabindex="0"
                (keydown.enter)="toggleClass(cls)"
                (keydown.space)="$event.preventDefault(); toggleClass(cls)"
              >
                @if (isClassEnabled(cls)) {
                  <mat-icon class="toggle-icon">check_circle</mat-icon>
                } @else {
                  <mat-icon class="toggle-icon">cancel</mat-icon>
                }
                {{ cls }}
              </span>
            }
          </div>
        </div>
      }

      <!-- Warnings -->
      @if (hasWarnings()) {
        <div class="warnings-section">
          <h3>
            <mat-icon>warning</mat-icon>
            Avisos
          </h3>

          @if (visibleClassMismatches().length > 0) {
            <div class="warning-item">
              <p>Classes diferentes entre uploads:</p>
              @for (mismatch of visibleClassMismatches(); track mismatch.className) {
                <div class="mismatch-detail">
                  <span class="class-chip mismatch">{{ mismatch.className }}</span>
                  <div class="mismatch-breakdown">
                    <div class="mismatch-column">
                      <span class="mismatch-label">Ausente em:</span>
                      @for (upload of mismatch.missingFrom; track upload.docId) {
                        <span class="upload-link upload-link--small">
                          <mat-icon class="link-icon">open_in_new</mat-icon>
                          {{ upload.displayName }}
                        </span>
                      }
                    </div>
                    @if (mismatch.presentIn.length > 0) {
                      <div class="mismatch-column">
                        <span class="mismatch-label">Presente em:</span>
                        @for (upload of mismatch.presentIn; track upload.docId) {
                          <span class="upload-link upload-link--ok">
                            <mat-icon class="link-icon">open_in_new</mat-icon>
                            {{ upload.displayName }}
                          </span>
                        }
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          }

          @if (data.unannotatedUploads.length > 0) {
            <div class="warning-item">
              <p>Uploads sem anotação ({{ data.unannotatedUploads.length }}):</p>
              <ul class="upload-list">
                @for (upload of data.unannotatedUploads; track upload.docId) {
                  <li>
                    <span class="upload-link">
                      <mat-icon class="link-icon">open_in_new</mat-icon>
                      {{ upload.displayName }}
                    </span>
                  </li>
                }
              </ul>
            </div>
          }

          @if (disabledClassCount() > 0) {
            <div class="warning-item">
              <p>
                {{ disabledClassCount() }}
                {{ disabledClassCount() === 1 ? 'classe desabilitada' : 'classes desabilitadas' }} —
                imagens sem classes habilitadas serão ignoradas.
              </p>
            </div>
          }

          @if (
            data.unannotatedImages > 0 &&
            data.unannotatedUploads.length === 0 &&
            disabledClassCount() === 0
          ) {
            <div class="warning-item">
              <p>
                {{ data.unannotatedImages }}
                {{
                  data.unannotatedImages === 1
                    ? 'imagem sem anotação será incluída'
                    : 'imagens sem anotação serão incluídas'
                }} conforme a opção abaixo.
              </p>
            </div>
          }
        </div>
      }

      <!-- Options -->
      <div class="options-section">
        <h3>Opções</h3>

        <div class="option-group">
          <label>Divisão treino/validação</label>
          <div class="slider-row">
            <mat-slider min="50" max="95" step="5" discrete showTickMarks>
              <input matSliderThumb [(ngModel)]="trainRatio" />
            </mat-slider>
            <span class="ratio-display">{{ trainRatio() }}% / {{ 100 - trainRatio() }}%</span>
          </div>
          <span class="ratio-detail">{{ trainCount() }} treino / {{ valCount() }} validação</span>
        </div>

        <div class="option-group">
          <label>Imagens sem anotação</label>
          <mat-radio-group [(ngModel)]="includeUnannotated">
            <mat-radio-button value="exclude"> Excluir do conjunto de dados </mat-radio-button>
            <mat-radio-button value="empty-labels"> Incluir com arquivo .txt vazio </mat-radio-button>
            <mat-radio-button value="no-labels"> Incluir sem arquivo .txt </mat-radio-button>
          </mat-radio-group>
        </div>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button type="button" mat-button (click)="cancel()">Cancelar</button>
      <button
        type="button"
        mat-flat-button
        color="primary"
        (click)="confirm()"
        [disabled]="effectiveImageCount() === 0 || trainCount() === 0 || valCount() === 0"
      >
        <mat-icon>download</mat-icon>
        Exportar conjunto de dados
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    :host {
      display: block;
      min-width: 500px;
      max-width: 650px;
      padding: 16px;
    }

    mat-dialog-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1.25rem;
    }

    h3 {
      font-size: 0.95rem;
      font-weight: 600;
      margin: 0 0 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .summary-section {
      margin-bottom: 16px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      @media (max-width: 480px) {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    .summary-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 12px 8px;
      background: var(--agri-fill-subtle, #f5f5f5);
      border-radius: 8px;
    }

    .summary-label {
      font-size: 0.75rem;
      color: var(--agri-text-muted, #666);
      margin-bottom: 4px;
    }

    .summary-value {
      font-size: 1.5rem;
      font-weight: 600;
      &.annotated {
        color: #2e7d32;
      }
      &.warning {
        color: #ed6c02;
      }
    }

    .classes-section {
      margin-bottom: 16px;
    }

    .classes-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      h3 {
        margin: 0;
      }
    }

    .toggle-all-btn {
      font-size: 0.75rem;
      min-height: 28px;
      line-height: 28px;
      padding: 0 8px;
    }

    .classes-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .class-chip {
      display: inline-block;
      padding: 4px 10px;
      background: var(--agri-fill, #e3f2fd);
      color: var(--agri-accent-dark, #1565c0);
      border-radius: 16px;
      font-size: 0.8rem;
      font-weight: 500;

      &.mismatch {
        background: #fff3e0;
        color: #e65100;
      }

      &--toggle {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        user-select: none;
        transition:
          opacity 0.15s ease,
          background-color 0.15s ease;

        &:hover {
          opacity: 0.85;
        }
        &:focus-visible {
          outline: 2px solid var(--agri-accent, #1565c0);
          outline-offset: 2px;
        }
      }

      &--off {
        background: var(--agri-border, #e0e0e0);
        color: var(--agri-text-muted, #999);
        text-decoration: line-through;
      }

      .toggle-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }

    .warnings-section {
      margin-bottom: 16px;
      padding: 12px;
      background: #fff8e1;
      border-radius: 8px;
      border-left: 4px solid #ffa000;
      h3 {
        color: #e65100;
      }
    }

    .warning-item {
      margin-bottom: 12px;
      p {
        margin: 0 0 6px;
        font-size: 0.85rem;
      }
      &:last-child {
        margin-bottom: 0;
      }
    }

    .upload-list {
      margin: 0;
      padding-left: 0;
      list-style: none;
      font-size: 0.8rem;
      li {
        margin-bottom: 4px;
      }
    }

    .upload-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.8rem;
      color: #1565c0;
      user-select: none;

      &--small {
        font-size: 0.75rem;
        padding: 2px 6px;
      }
      &--ok {
        color: #2e7d32;
      }

      .link-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        opacity: 0.6;
      }
    }

    .mismatch-detail {
      margin-bottom: 12px;
      padding: 8px 10px;
      background: rgba(255, 243, 224, 0.5);
      border-radius: 8px;
      border-left: 3px solid #e65100;

      .class-chip.mismatch {
        margin-bottom: 8px;
      }
    }

    .mismatch-breakdown {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }

    .mismatch-column {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 120px;
    }

    .mismatch-label {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #999;
    }

    .options-section {
      margin-bottom: 8px;
    }

    .option-group {
      margin-bottom: 16px;
      > label {
        display: block;
        font-size: 0.85rem;
        font-weight: 500;
        margin-bottom: 8px;
        color: var(--agri-text, #333);
      }
    }

    .slider-row {
      display: flex;
      align-items: center;
      gap: 16px;
      mat-slider {
        flex: 1;
      }
    }

    .ratio-display {
      font-weight: 600;
      font-size: 0.9rem;
      min-width: 80px;
      text-align: right;
    }

    .ratio-detail {
      display: block;
      font-size: 0.75rem;
      color: var(--agri-text-muted, #666);
      margin-top: 4px;
    }

    mat-radio-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    mat-dialog-actions {
      padding: 16px 0 0;
    }
  `,
})
export class YoloExportDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<YoloExportDialogComponent>);
  readonly data: YoloExportDialogData = inject(MAT_DIALOG_DATA);

  private readonly allClassesSet = new Set(this.data.globalClasses);

  trainRatio = signal(80);
  includeUnannotated = signal<UnannotatedImageHandling>('exclude');
  readonly enabledClassSet = signal<Set<string>>(new Set(this.allClassesSet));

  readonly enabledClassCount = computed(() => this.enabledClassSet().size);
  readonly disabledClassCount = computed(
    () => this.data.globalClasses.length - this.enabledClassCount(),
  );
  readonly allClassesEnabled = computed(() => this.disabledClassCount() === 0);

  readonly effectiveAnnotatedImages = computed(() => {
    const enabled = this.enabledClassSet();
    if (this.allClassesEnabled()) return this.data.annotatedImages;
    return this.data.perImageClasses.filter(
      (img) => img.hasAnnotation && img.classes.some((c) => enabled.has(c)),
    ).length;
  });

  readonly effectiveImageCount = computed(() => {
    const enabled = this.enabledClassSet();
    if (this.allClassesEnabled()) {
      return this.includeUnannotated() === 'exclude'
        ? this.data.annotatedImages
        : this.data.totalImages;
    }
    return this.data.perImageClasses.filter((img) => {
      if (img.hasAnnotation) return img.classes.some((c) => enabled.has(c));
      return this.includeUnannotated() !== 'exclude';
    }).length;
  });

  readonly trainCount = computed(() => {
    const n = this.effectiveImageCount();
    return Math.min(Math.round(n * (this.trainRatio() / 100)), Math.max(n - 1, 0));
  });
  readonly valCount = computed(() => this.effectiveImageCount() - this.trainCount());

  readonly visibleClassMismatches = computed(() => {
    const enabled = this.enabledClassSet();
    return this.data.classMismatchDetails.filter((m) => enabled.has(m.className));
  });

  readonly hasWarnings = computed(
    () =>
      this.visibleClassMismatches().length > 0 ||
      this.data.unannotatedUploads.length > 0 ||
      this.data.unannotatedImages > 0 ||
      this.disabledClassCount() > 0,
  );

  isClassEnabled(cls: string): boolean {
    return this.enabledClassSet().has(cls);
  }

  toggleClass(cls: string): void {
    this.enabledClassSet.update((current) => {
      const next = new Set(current);
      if (current.has(cls)) {
        next.delete(cls);
      } else {
        next.add(cls);
      }
      return next;
    });
  }

  selectAllClasses(): void {
    this.enabledClassSet.set(new Set(this.allClassesSet));
  }

  deselectAllClasses(): void {
    this.enabledClassSet.set(new Set());
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  confirm(): void {
    const options: YoloExportOptions = {
      trainRatio: this.trainRatio() / 100,
      includeUnannotated: this.includeUnannotated(),
      enabledClasses: [...this.enabledClassSet()],
    };
    this.dialogRef.close(options);
  }
}
