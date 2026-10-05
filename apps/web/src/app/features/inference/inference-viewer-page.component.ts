import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DatePipe, NgStyle } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';

import { InferenceService } from '../../core/services/inference.service';
import { ExportService } from '../../core/services/export.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  Detection,
  InferenceJobDetail,
  InferenceJobImageResult,
  InferenceJobImageSummary,
} from '@agrolens/contracts';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';

// The image uses object-fit: contain, so detection boxes must be mapped onto the
// actually-rendered content rect (centered within the container), not the full
// container box. Mirrors image-canvas.component.ts computeContentRect math.
export interface ContentRect {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  containerWidth: number;
  containerHeight: number;
}

export function boxStyle(d: Detection, rect: ContentRect): Record<string, string> {
  const left =
    ((rect.offsetX + (d.xCenter - d.width / 2) * rect.width) / rect.containerWidth) * 100;
  const top =
    ((rect.offsetY + (d.yCenter - d.height / 2) * rect.height) / rect.containerHeight) * 100;
  const width = ((d.width * rect.width) / rect.containerWidth) * 100;
  const height = ((d.height * rect.height) / rect.containerHeight) * 100;
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
  };
}

export function classColor(className: string): string {
  let hash = 0;
  for (let i = 0; i < className.length; i++) hash = (hash << 5) - hash + className.charCodeAt(i);
  return `hsl(${Math.abs(hash) % 360}, 70%, 50%)`;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed']);

@Component({
  selector: 'app-inference-viewer-page',
  standalone: true,
  imports: [
    MatSnackBarModule,
    FormsModule,
    DatePipe,
    NgStyle,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatDividerModule,
    MatIconModule,
    MatListModule,
    MatSliderModule,
    MatTooltipModule,
    PageHeaderComponent,
    LoadingStateComponent,
  ],
  template: `
    <section class="viewer-page">
      <app-page-header
        eyebrow="Inferência"
        title="Visualização da execução"
        [subtitle]="job()?.id || ''"
      />

      @if (loadingJob()) {
        <app-loading-state message="Carregando execução..." />
      } @else if (jobError()) {
        <div class="error-banner">{{ jobError() }}</div>
      } @else {
        @if (job(); as jobDetail) {
          <!-- Status bar -->
          <div class="status-bar">
            <span class="cell-badge" [class]="statusBadgeClass(jobDetail.status)">
              {{ statusLabel(jobDetail.status) }}
            </span>
            <span class="status-info">
              {{ jobDetail.completedCount }} / {{ jobDetail.imageCount }} concluídas
              @if (jobDetail.failedCount > 0) {
                ({{ jobDetail.failedCount }} falhas)
              }
            </span>
            @if (jobDetail.expiresAt) {
              <span class="expiry-notice">
                <mat-icon class="expiry-icon">schedule</mat-icon>
                Expira em {{ jobDetail.expiresAt | date: 'dd/MM/yyyy HH:mm' }}
              </span>
            }
          </div>

          <div class="viewer-layout">
            <!-- Left sidebar: image navigator -->
            <div class="sidebar-left">
              <div class="sidebar-left__header">
                <h3>{{ jobDetail.images.length }} imagens</h3>
              </div>
              <div class="image-list">
                @for (img of jobDetail.images; track img.id; let i = $index) {
                  <button
                    type="button"
                    class="image-list-item"
                    [class.selected]="selectedImageId() === img.id"
                    (click)="loadImage(img)"
                  >
                    <span class="image-index">{{ img.imageIndex + 1 }}</span>
                    <div class="image-info">
                      <span class="image-filename">{{ img.fileName }}</span>
                      <span class="image-sub">
                        {{ img.detectionCount }} detecções
                        @if (img.inferenceMs) {
                          · {{ img.inferenceMs }}ms
                        }
                      </span>
                      <span class="image-status-badge" [class]="statusBadgeClass(img.status)">{{
                        statusLabel(img.status)
                      }}</span>
                    </div>
                  </button>
                }
              </div>
            </div>

            <!-- Center: image display -->
            <div class="center-panel">
              @if (!selectedImageId()) {
                <div class="center-empty">
                  <mat-icon>photo_library</mat-icon>
                  <span>Selecione uma imagem ao lado para visualizar.</span>
                </div>
              } @else if (loadingImage()) {
                <app-loading-state message="Carregando imagem..." />
              } @else if (imageError()) {
                <div class="error-banner">{{ imageError() }}</div>
              } @else {
                @if (imageResult(); as imgResult) {
                  <div class="image-scroll">
                    <div
                      class="image-container"
                      [style.width.%]="zoom() * 100"
                      [style.height.%]="zoom() * 100"
                    >
                      <img
                        #viewerImage
                        [src]="imgResult.imageUrl"
                        [alt]="imgResult.fileName"
                        class="viewer-image"
                        draggable="false"
                        (load)="onImageLoad()"
                      />

                      <!-- Detection overlay -->
                      <div class="detection-overlay">
                        @for (det of visibleDetections(); track $index) {
                          <div
                            class="detection-box"
                            [style.border-color]="classColor(det.className)"
                            [style.background-color]="classColor(det.className) + '1A'"
                            [style.--det-color]="classColor(det.className)"
                            [ngStyle]="boxStyle(det, contentRect())"
                          >
                            <span class="detection-tag">
                              {{ det.className }} ({{ (det.confidence * 100).toFixed(0) }}%)
                            </span>
                          </div>
                        }
                      </div>
                    </div>
                  </div>

                  @if (jobDetail.images.length > 1) {
                    <!-- Image navigation -->
                    <div class="image-nav">
                      @if (hasPrevImage()) {
                        <button mat-stroked-button class="image-nav-prev" (click)="prevImage()">
                          <mat-icon>arrow_back</mat-icon>
                          Anterior
                        </button>
                      }
                      <span class="image-nav-info">
                        Imagem {{ currentImageIndex() + 1 }} de {{ jobDetail.images.length }}
                      </span>
                      @if (hasNextImage()) {
                        <button mat-stroked-button class="image-nav-next" (click)="nextImage()">
                          Próximo
                          <mat-icon>arrow_forward</mat-icon>
                        </button>
                      }
                    </div>
                  }

                  <!-- Zoom controls -->
                  <div class="zoom-controls">
                    <button
                      mat-icon-button
                      (click)="zoomOut()"
                      [disabled]="zoom() <= zoomMin"
                      title="Reduzir zoom"
                    >
                      <mat-icon>zoom_out</mat-icon>
                    </button>
                    <span class="zoom-value">{{ (zoom() * 100).toFixed(0) }}%</span>
                    <button
                      mat-icon-button
                      (click)="zoomIn()"
                      [disabled]="zoom() >= zoomMax"
                      title="Aumentar zoom"
                    >
                      <mat-icon>zoom_in</mat-icon>
                    </button>
                    <button
                      mat-stroked-button
                      (click)="zoomReset()"
                      class="btn-zoom-reset"
                      title="Zoom original"
                    >
                      <mat-icon>zoom_out_map</mat-icon>
                      Ajustar
                    </button>
                  </div>
                }
              }
            </div>

            <!-- Right sidebar -->
            <div class="sidebar-right">
              <!-- Summary -->
              <mat-card class="sidebar-card">
                <div class="sidebar-card__header">
                  <mat-icon>analytics</mat-icon>
                  <span>Resumo</span>
                </div>
                <div class="sidebar-card__body">
                  <div class="summary-section">
                    <p class="summary-label">Detecções nesta imagem</p>
                    <div class="class-counts">
                      @for (entry of currentImageClassCounts(); track entry[0]) {
                        <div class="class-count-row">
                          <span
                            class="class-color-swatch"
                            [style.background-color]="classColor(entry[0])"
                          ></span>
                          <span class="class-count-name">{{ entry[0] }}</span>
                          <span class="class-count-value">{{ entry[1] }}</span>
                        </div>
                      }
                      @if (currentImageClassCounts().length === 0) {
                        <span class="no-data">Nenhuma detecção</span>
                      }
                    </div>
                  </div>

                  <mat-divider />

                  <div class="summary-section">
                    <p class="summary-label">Total nas imagens carregadas</p>
                    <div class="class-counts">
                      @for (entry of jobClassTotals(); track entry[0]) {
                        <div class="class-count-row">
                          <span
                            class="class-color-swatch"
                            [style.background-color]="classColor(entry[0])"
                          ></span>
                          <span class="class-count-name">{{ entry[0] }}</span>
                          <span class="class-count-value">{{ entry[1] }}</span>
                        </div>
                      }
                    </div>
                  </div>
                </div>
              </mat-card>

              <!-- Filters -->
              <mat-card class="sidebar-card">
                <div class="sidebar-card__header">
                  <mat-icon>filter_alt</mat-icon>
                  <span>Filtros</span>
                </div>
                <div class="sidebar-card__body">
                  <div class="toggle-all-row">
                    <button mat-stroked-button (click)="toggleAllDetections()">
                      {{ showAllDetections() ? 'Ocultar todas' : 'Mostrar todas' }}
                    </button>
                  </div>

                  <p class="filter-label">Classes</p>
                  <div class="class-filter-list">
                    @for (entry of classFilterList(); track entry[0]) {
                      <mat-checkbox
                        [checked]="entry[1]"
                        (change)="toggleClassFilter(entry[0], $event.checked)"
                      >
                        <span class="class-filter-label">
                          <span
                            class="class-color-swatch"
                            [style.background-color]="classColor(entry[0])"
                          ></span>
                          {{ entry[0] }}
                        </span>
                      </mat-checkbox>
                    }
                  </div>

                  <p class="filter-label">
                    Confiança mínima: {{ (minConfidence() * 100).toFixed(0) }}%
                  </p>
                  <mat-slider [min]="0.25" [max]="1" [step]="0.05" discrete>
                    <input
                      matSliderThumb
                      [ngModel]="minConfidence()"
                      (ngModelChange)="minConfidence.set($event)"
                    />
                  </mat-slider>

                  <p class="filter-label">Exportar</p>
                  <div class="export-row">
                    <button mat-stroked-button (click)="exportJson()">
                      <mat-icon>code</mat-icon>
                      JSON
                    </button>
                    <button mat-stroked-button (click)="exportCsv()">
                      <mat-icon>description</mat-icon>
                      CSV
                    </button>
                  </div>
                </div>
              </mat-card>
            </div>
          </div>
        }
      }
    </section>
  `,
  styles: `
    .viewer-page {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      min-height: 100%;
    }

    /* ── Status bar ── */
    .status-bar {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem 1rem;
      background: var(--agri-surface-raised);
      border-radius: 12px;
      border: 1px solid var(--agri-border);
    }

    .status-info {
      font-size: 0.85rem;
      color: var(--agri-text);
    }

    .expiry-notice {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.78rem;
      color: #8a7a3a;
    }

    .expiry-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
    }

    /* ── Layout ── */
    .viewer-layout {
      display: grid;
      grid-template-columns: 240px 1fr 280px;
      gap: 1rem;
      height: calc(100vh - 220px);
      min-height: 500px;
    }

    @media (max-width: 1100px) {
      .viewer-layout {
        grid-template-columns: 1fr;
        grid-template-rows: auto 1fr auto;
        height: auto;
      }
    }

    /* ── Left sidebar ── */
    .sidebar-left {
      background: var(--agri-surface-raised);
      border-radius: 18px;
      border: 1px solid var(--agri-border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sidebar-left__header {
      padding: 0.75rem 1rem;
      background: var(--agri-fill-subtle);
      border-bottom: 1px solid var(--agri-border);

      h3 {
        margin: 0;
        font-size: 0.85rem;
        color: var(--agri-accent-dark);
      }
    }

    .image-list {
      flex: 1;
      overflow-y: auto;
    }

    .image-list-item {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.6rem 1rem;
      border: none;
      background: none;
      cursor: pointer;
      width: 100%;
      text-align: left;
      border-bottom: 1px solid var(--agri-fill-hover);
      transition: background 0.15s;

      &:hover {
        background: var(--agri-fill);
      }

      &.selected {
        background: var(--agri-fill);
        border-left: 3px solid var(--agri-accent);
      }
    }

    .image-index {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: var(--agri-fill-subtle);
      display: grid;
      place-items: center;
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--agri-accent-dark);
      flex-shrink: 0;
    }

    .image-info {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      min-width: 0;
    }

    .image-filename {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--agri-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .image-sub {
      font-size: 0.7rem;
      color: var(--agri-text-muted);
    }

    .image-status-badge {
      font-size: 0.62rem;
      font-weight: 600;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      align-self: flex-start;
    }

    /* ── Center panel ── */
    .center-panel {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      align-items: center;
      justify-content: center;
      background: #1a1a1a;
      border-radius: 18px;
      border: 1px solid var(--agri-border);
      overflow: hidden;
      position: relative;
    }

    .center-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.9rem;
    }

    .image-scroll {
      width: 100%;
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
    }

    .image-container {
      position: relative;
      min-width: 100%;
      min-height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .viewer-image {
      width: 100%;
      height: 100%;
      object-fit: contain;
      user-select: none;
    }

    .detection-overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;

      > * {
        pointer-events: auto;
      }
    }

    .detection-box {
      position: absolute;
      border: 2px solid;
      border-radius: 2px;
    }

    .detection-tag {
      position: absolute;
      top: 0;
      left: 0;
      background: var(--det-color);
      color: #fff;
      padding: 1px 6px;
      border-bottom-right-radius: 6px;
      font-weight: 600;
      font-size: 10px;
      letter-spacing: 0.3px;
      line-height: 1.4;
      white-space: nowrap;
    }

    /* ── Image nav ── */
    .image-nav {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 0.75rem;
      padding: 0.25rem 0;
      width: min(100%, 460px);
      flex: 0 0 auto;
    }

    .image-nav-prev {
      grid-column: 1;
      justify-self: start;
    }

    .image-nav-next {
      grid-column: 3;
      justify-self: end;
    }

    .image-nav-info {
      grid-column: 2;
      font-size: 0.82rem;
      color: var(--agri-text-muted);
      font-weight: 500;
    }

    /* ── Zoom controls ── */
    .zoom-controls {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.25rem 0.4rem;
      flex: 0 0 auto;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 10px;
      background: rgba(20, 20, 20, 0.82);
      backdrop-filter: blur(6px);
    }

    .zoom-value {
      font-size: 0.78rem;
      color: var(--agri-text-muted);
      min-width: 3rem;
      text-align: center;
    }

    .btn-zoom-reset {
      margin-left: 0.5rem;
      height: 2rem;
      font-size: 0.75rem;
      border-radius: 8px;
    }

    /* ── Right sidebar ── */
    .sidebar-right {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      overflow-y: auto;
    }

    .sidebar-card {
      background-color: var(--agri-surface-raised);
      border-radius: 18px;
      border: 1px solid var(--agri-border);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
      overflow: hidden;
    }

    .sidebar-card__header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.7rem 1rem;
      background: var(--agri-fill-subtle);
      border-bottom: 1px solid var(--agri-border);
      font-weight: 700;
      font-size: 0.8rem;
      color: var(--agri-accent-dark);
      text-transform: uppercase;
      letter-spacing: 0.04em;

      mat-icon {
        font-size: 1rem;
        width: 1rem;
        height: 1rem;
        color: var(--agri-accent);
      }
    }

    .sidebar-card__body {
      padding: 0.75rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .summary-section {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }

    .summary-label {
      margin: 0;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--agri-text-muted);
      font-weight: 600;
    }

    .class-counts {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .class-count-row {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.78rem;
    }

    .class-color-swatch {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      flex-shrink: 0;
    }

    .class-count-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--agri-text);
    }

    .class-count-value {
      font-weight: 600;
      color: var(--agri-accent-dark);
    }

    .no-data {
      font-size: 0.75rem;
      color: var(--agri-text-muted);
      font-style: italic;
    }

    .toggle-all-row {
      margin-bottom: 0.25rem;
    }

    .filter-label {
      margin: 0;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--agri-text-muted);
      font-weight: 600;
    }

    .class-filter-list {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      max-height: 200px;
      overflow-y: auto;
    }

    .class-filter-label {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8rem;
    }

    .export-row {
      display: flex;
      gap: 0.5rem;
    }

    /* ── Shared badges ── */
    .cell-badge {
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 600;
      padding: 0.2rem 0.55rem;
      border-radius: 6px;
      background-color: var(--agri-chip-bg);
      color: var(--agri-chip-text);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .badge-blue {
      background-color: #e3f2fd;
      color: #1565c0;
    }

    .badge-amber {
      background-color: #fff8e1;
      color: #e65100;
    }

    .badge-green {
      background-color: #e8f5e9;
      color: #2e7d32;
    }

    .badge-red {
      background-color: #fdecea;
      color: #c62828;
    }

    /* ── Error ── */
    .error-banner {
      color: #c62828;
      background: #fdecea;
      border: 1px solid #f5c6cb;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-size: 0.9rem;
      width: 100%;
    }
  `,
})
export class InferenceViewerPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly inferenceService = inject(InferenceService);
  private readonly exportService = inject(ExportService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  // Job
  readonly job = signal<InferenceJobDetail | null>(null);
  readonly loadingJob = signal(true);
  readonly jobError = signal('');

  // Current image
  readonly selectedImageId = signal<string | null>(null);
  readonly imageResult = signal<InferenceJobImageResult | null>(null);
  readonly loadingImage = signal(false);
  readonly imageError = signal('');

  // Zoom
  readonly zoom = signal(1);
  readonly zoomMin = 0.25;
  readonly zoomMax = 3;
  readonly zoomStep = 0.25;

  // Filters
  readonly showAllDetections = signal(true);
  readonly minConfidence = signal(0.25);
  readonly enabledClasses = signal<Set<string>>(new Set());
  // Class filters are keyed by name and initially enable every class in the image.

  // Detections from images visited in this viewer.
  private allDetectionsCache = signal<Map<string, Detection[]>>(new Map());

  // Polling
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private imageRequest = 0;

  // Expose helpers
  readonly boxStyle = boxStyle;
  readonly classColor = classColor;

  // Image element + letterbox content rect (in container pixels)
  readonly imageEl = viewChild<ElementRef<HTMLImageElement>>('viewerImage');
  readonly contentRect = signal<ContentRect>({
    offsetX: 0,
    offsetY: 0,
    width: 100,
    height: 100,
    containerWidth: 100,
    containerHeight: 100,
  });

  private resizeObserver: ResizeObserver | null = null;

  readonly STATUS_BADGE: Record<string, string> = {
    queued: 'badge-blue',
    uploading: 'badge-blue',
    running: 'badge-amber',
    completed: 'badge-green',
    failed: 'badge-red',
  };
  readonly STATUS_LABEL: Record<string, string> = {
    queued: 'Na fila',
    uploading: 'Enviando',
    running: 'Executando',
    completed: 'Concluído',
    failed: 'Falhou',
  };

  readonly statusBadgeClass = (status: string) => this.STATUS_BADGE[status] || '';
  readonly statusLabel = (status: string) => this.STATUS_LABEL[status] || status;

  readonly currentImageIndex = signal(0);
  readonly hasPrevImage = signal(false);
  readonly hasNextImage = signal(false);

  // Derived: current image class counts
  readonly currentImageClassCounts = signal<[string, number][]>([]);

  // Derived: per-class totals for the loaded images.
  readonly jobClassTotals = computed(() => {
    const totals = new Map<string, number>();
    for (const detections of this.allDetectionsCache().values()) {
      for (const detection of detections) {
        totals.set(detection.className, (totals.get(detection.className) ?? 0) + 1);
      }
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  });

  // Derived: class filter list with toggles
  readonly classFilterList = signal<[string, boolean][]>([]);

  // Derived: visible detections based on filters
  readonly visibleDetections = computed(() => {
    if (!this.showAllDetections()) return [];
    const classes = this.enabledClasses();
    const confidence = this.minConfidence();
    return (this.imageResult()?.detections ?? []).filter(
      (detection) => classes.has(detection.className) && detection.confidence >= confidence,
    );
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.pollTimer !== null) {
        clearTimeout(this.pollTimer);
      }
      this.detachResizeObserver();
    });
  }

  async ngOnInit(): Promise<void> {
    const jobId = this.route.snapshot.paramMap.get('jobId');
    if (!jobId) {
      this.jobError.set('ID da execução não encontrado.');
      this.loadingJob.set(false);
      return;
    }

    await this.loadJob(jobId);
  }

  async loadImage(img: InferenceJobImageSummary, refresh = false): Promise<void> {
    if (this.destroyRef.destroyed) return;
    const sameImage = this.selectedImageId() === img.id;
    if (sameImage && !refresh && this.imageResult()) return;
    const request = ++this.imageRequest;
    this.selectedImageId.set(img.id);
    if (!sameImage || !this.imageResult()) {
      this.loadingImage.set(true);
      this.imageResult.set(null);
      this.zoomReset();
    }
    this.imageError.set('');

    try {
      const jobDetail = this.job();
      if (!jobDetail) return;

      const result = await this.inferenceService.getImage(jobDetail.id, img.id);
      if (request !== this.imageRequest || this.destroyRef.destroyed) return;
      this.imageResult.set(result);

      // Cache detections
      this.allDetectionsCache.update((map) => {
        const next = new Map(map);
        next.set(img.id, result.detections ?? []);
        return next;
      });

      // Update current image index
      const idx = jobDetail.images.findIndex((i) => i.id === img.id);
      this.currentImageIndex.set(idx >= 0 ? idx : 0);
      this.updateImageNav();

      // Update class counts for current image
      this.updateCurrentImageClassCounts(result.detections ?? []);

      // Update class filters (all enabled initially)
      if (!sameImage || !this.classFilterList().length) {
        this.updateClassFilters(result.detections ?? []);
      }
    } catch (err: unknown) {
      if (request !== this.imageRequest || this.destroyRef.destroyed) return;
      const msg = err instanceof Error ? err.message : 'Erro ao carregar imagem';
      this.imageError.set(msg);
      this.imageResult.set(null);
    } finally {
      if (request === this.imageRequest) this.loadingImage.set(false);
    }
  }

  prevImage(): void {
    const jobDetail = this.job();
    if (!jobDetail) return;
    const idx = this.currentImageIndex();
    if (idx <= 0) return;
    const prev = jobDetail.images[idx - 1];
    void this.loadImage(prev);
  }

  nextImage(): void {
    const jobDetail = this.job();
    if (!jobDetail) return;
    const idx = this.currentImageIndex();
    if (idx >= jobDetail.images.length - 1) return;
    const next = jobDetail.images[idx + 1];
    void this.loadImage(next);
  }

  zoomIn(): void {
    this.zoom.update((z) => Math.min(z + this.zoomStep, this.zoomMax));
  }

  zoomOut(): void {
    this.zoom.update((z) => Math.max(z - this.zoomStep, this.zoomMin));
  }

  zoomReset(): void {
    this.zoom.set(1);
  }

  toggleAllDetections(): void {
    this.showAllDetections.update((v) => !v);
  }

  toggleClassFilter(className: string, enabled: boolean): void {
    this.enabledClasses.update((set) => {
      const next = new Set(set);
      if (enabled) next.add(className);
      else next.delete(className);
      return next;
    });

    this.classFilterList.update((list) =>
      list.map(([name, _]) => [name, this.enabledClasses().has(name)]),
    );
  }

  // Recompute the letterbox content rect once the image is decoded and wire up
  // a ResizeObserver so container/image resizes keep the overlay aligned.
  onImageLoad(): void {
    const imgRef = this.imageEl();
    if (!imgRef) return;
    const img = imgRef.nativeElement;
    this.attachResizeObserver(img);
    this.computeContentRect();
  }

  private computeContentRect(): void {
    const imgRef = this.imageEl();
    if (!imgRef) return;
    const img = imgRef.nativeElement;
    const containerWidth = img.clientWidth;
    const containerHeight = img.clientHeight;
    if (!containerWidth || !containerHeight || !img.naturalWidth || !img.naturalHeight) return;
    const scale =
      Math.min(containerWidth / img.naturalWidth, containerHeight / img.naturalHeight) || 1;
    const contentWidth = img.naturalWidth * scale;
    const contentHeight = img.naturalHeight * scale;
    const offsetX = (containerWidth - contentWidth) / 2;
    const offsetY = (containerHeight - contentHeight) / 2;
    this.contentRect.set({
      offsetX,
      offsetY,
      width: contentWidth,
      height: contentHeight,
      containerWidth,
      containerHeight,
    });
  }

  private attachResizeObserver(img: HTMLImageElement): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.detachResizeObserver();
    this.resizeObserver = new ResizeObserver(() => this.computeContentRect());
    this.resizeObserver.observe(img);
  }

  private detachResizeObserver(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  async exportJson(): Promise<void> {
    const jobDetail = this.job();
    if (!jobDetail) return;

    try {
      this.snackBar.open('Exportando JSON...', 'Fechar', { duration: 4000 });
      // Fetch all images
      const imageResults: InferenceJobImageResult[] = [];
      for (const img of jobDetail.images) {
        imageResults.push(await this.inferenceService.getImage(jobDetail.id, img.id));
      }

      const output = {
        job: jobDetail,
        images: imageResults,
        exportedAt: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(output, null, 2)], {
        type: 'application/json',
      });
      this.exportService.downloadBlob(blob, `inference-${jobDetail.id}.json`);
      this.snackBar.open('JSON exportado com sucesso.', 'Fechar', { duration: 4000 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao exportar JSON';
      this.snackBar.open(msg, 'Fechar', { duration: 6000 });
    }
  }

  async exportCsv(): Promise<void> {
    const jobDetail = this.job();
    if (!jobDetail) return;

    try {
      this.snackBar.open('Exportando CSV...', 'Fechar', { duration: 4000 });
      const rows: Record<string, unknown>[] = [];

      for (const img of jobDetail.images) {
        const { detections } = await this.inferenceService.getImage(jobDetail.id, img.id);

        for (const det of detections ?? []) {
          rows.push({
            image_index: img.imageIndex,
            file_name: img.fileName,
            class_id: det.classId,
            class_name: det.className,
            confidence: det.confidence,
            x_center: det.xCenter,
            y_center: det.yCenter,
            width: det.width,
            height: det.height,
          });
        }
      }

      const headers = [
        'image_index',
        'file_name',
        'class_id',
        'class_name',
        'confidence',
        'x_center',
        'y_center',
        'width',
        'height',
      ];
      this.exportService.exportGenericCsv(rows, `inference-${jobDetail.id}`, headers);
      this.snackBar.open('CSV exportado com sucesso.', 'Fechar', { duration: 4000 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao exportar CSV';
      this.snackBar.open(msg, 'Fechar', { duration: 6000 });
    }
  }

  // ─── Private ────────────────────────────────────────────────

  private async loadJob(jobId: string): Promise<void> {
    if (this.destroyRef.destroyed) return;
    this.loadingJob.set(!this.job());
    this.jobError.set('');
    try {
      const jobDetail = await this.inferenceService.getJob(jobId);
      if (this.destroyRef.destroyed) return;
      this.job.set(jobDetail);

      const selected =
        jobDetail.images.find((image) => image.id === this.selectedImageId()) ??
        jobDetail.images[0];
      if (selected) await this.loadImage(selected, true);
    } catch (err: unknown) {
      if (this.destroyRef.destroyed) return;
      const msg = err instanceof Error ? err.message : 'Erro ao carregar a execução.';
      this.jobError.set(msg);
      this.snackBar.open(msg, 'Fechar', { duration: 6000 });
    } finally {
      this.loadingJob.set(false);
      const job = this.job();
      if (job) this.scheduleJobPoll(job);
    }
  }

  private updateCurrentImageClassCounts(detections: Detection[]): void {
    const counts = new Map<string, number>();
    for (const det of detections) {
      counts.set(det.className, (counts.get(det.className) || 0) + 1);
    }
    this.currentImageClassCounts.set([...counts.entries()].sort((a, b) => b[1] - a[1]));
  }

  private updateClassFilters(detections: Detection[]): void {
    const uniqueClasses = [...new Set(detections.map((d) => d.className))].sort();
    this.enabledClasses.set(new Set(uniqueClasses));
    this.classFilterList.set(uniqueClasses.map((name) => [name, true]));
  }

  private updateImageNav(): void {
    const jobDetail = this.job();
    if (!jobDetail) return;
    const idx = this.currentImageIndex();
    this.hasPrevImage.set(idx > 0);
    this.hasNextImage.set(idx < jobDetail.images.length - 1);
  }

  private scheduleJobPoll(jobDetail: InferenceJobDetail): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.destroyRef.destroyed || TERMINAL_STATUSES.has(jobDetail.status)) return;

    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.loadJob(jobDetail.id);
    }, 5000);
  }
}
