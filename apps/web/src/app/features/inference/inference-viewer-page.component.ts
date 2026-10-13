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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, NgStyle } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  InferenceJobDetail,
  InferenceJobImageResult,
  InferenceJobImageSummary,
  ReviewedDetection,
  InferenceModelClass,
  filterDetections,
  reviewedDetectionSchema,
} from '@agrolens/contracts';
import { DetectionEditorComponent } from './detection-editor.component';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { uploadErrorMessage } from '../../shared/utils/upload-validation';
import { InferenceService } from '../../core/services/inference.service';
import { ExportService } from '../../core/services/export.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';

export interface ContentRect {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  containerWidth: number;
  containerHeight: number;
}

export function boxStyle(d: ReviewedDetection, rect: ContentRect): Record<string, string> {
  return {
    left: `${((rect.offsetX + (d.xCenter - d.width / 2) * rect.width) / rect.containerWidth) * 100}%`,
    top: `${((rect.offsetY + (d.yCenter - d.height / 2) * rect.height) / rect.containerHeight) * 100}%`,
    width: `${((d.width * rect.width) / rect.containerWidth) * 100}%`,
    height: `${((d.height * rect.height) / rect.containerHeight) * 100}%`,
  };
}

// A spaced palette avoids near-identical hash-derived hues for adjacent classes.
const DETECTION_COLORS = ['#007f91', '#a34d00', '#624ac4', '#b43162', '#287b39', '#3465a4'];
export function classColor(className: string): string {
  let hash = 0;
  for (let i = 0; i < className.length; i++) hash = (hash << 5) - hash + className.charCodeAt(i);
  return DETECTION_COLORS[Math.abs(hash) % DETECTION_COLORS.length];
}

export function fitImageScale(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (!width || !height || !viewportWidth || !viewportHeight) return 1;
  return Math.min(viewportWidth / width, viewportHeight / height);
}

const TERMINAL_STATUSES = new Set(['completed', 'failed']);

@Component({
  selector: 'app-inference-viewer-page',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    DatePipe,
    NgStyle,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatMenuModule,
    MatSliderModule,
    MatTooltipModule,
    MatSnackBarModule,
    PageHeaderComponent,
    DetectionEditorComponent,
    MatDialogModule,
  ],
  templateUrl: './inference-viewer-page.component.html',
  styleUrl: './inference-viewer-page.component.scss',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class InferenceViewerPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly inferenceService = inject(InferenceService);
  private readonly exportService = inject(ExportService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);

  readonly job = signal<InferenceJobDetail | null>(null);
  readonly loadingJob = signal(true);
  readonly jobError = signal('');
  readonly selectedImageId = signal<string | null>(null);
  readonly imageResult = signal<InferenceJobImageResult | null>(null);
  readonly loadingImage = signal(false);
  readonly imageError = signal('');
  readonly imageDecoded = signal(false);
  readonly exporting = signal(false);

  readonly zoom = signal(1);
  readonly fitMode = signal(true);
  readonly zoomMin = 0.25;
  readonly zoomMax = 3;
  readonly zoomStep = 0.25;
  readonly naturalSize = signal({ width: 0, height: 0 });
  readonly viewportSize = signal({ width: 0, height: 0 });
  readonly renderedSize = computed(() => ({
    width: this.naturalSize().width * this.zoom(),
    height: this.naturalSize().height * this.zoom(),
  }));
  readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));

  readonly showAllDetections = signal(true);
  readonly minConfidence = signal(0.25);
  readonly enabledClasses = signal<Set<string>>(new Set());
  readonly suppressOverlaps = signal(false);
  readonly iouThreshold = signal(0.5);
  readonly showOriginal = signal(false);
  readonly editing = signal(false);
  readonly savingReview = signal(false);
  readonly reviewError = signal('');
  readonly draft = signal<ReviewedDetection[]>([]);
  readonly selectedBox = signal<number | null>(null);
  readonly addingBox = signal(false);
  readonly addClassId = signal<number | null>(null);
  readonly undoHistory = signal<ReviewedDetection[][]>([]);
  private initialDraft = '';
  private draftExpectedUpdatedAt: string | null = null;
  readonly reviewDirty = computed(
    () => this.editing() && JSON.stringify(this.draft()) !== this.initialDraft,
  );
  readonly usingReview = computed(
    () => !this.showOriginal() && this.imageResult()?.reviewedDetections != null,
  );
  readonly filterOptions = computed(() => ({
    minConfidence: this.minConfidence(),
    suppressOverlaps: this.suppressOverlaps(),
    iouThreshold: this.iouThreshold(),
  }));
  readonly modelClasses = computed<InferenceModelClass[]>(() => {
    const classes = this.job()?.modelSnapshot.classes;
    return Array.isArray(classes)
      ? classes.filter(
          (value): value is InferenceModelClass =>
            typeof value?.id === 'number' && typeof value?.name === 'string',
        )
      : [];
  });
  readonly addClass = computed(
    () => this.modelClasses().find((cls) => cls.id === this.addClassId()) ?? null,
  );
  private readonly allDetectionsCache = signal<Map<string, InferenceJobImageResult>>(new Map());
  private processedResult(
    result: InferenceJobImageResult,
    original = this.showOriginal(),
  ): ReviewedDetection[] {
    return !original && result.reviewedDetections != null
      ? result.reviewedDetections
      : filterDetections(result.detections ?? [], this.filterOptions());
  }
  readonly processedDetections = computed(() =>
    this.editing()
      ? this.draft()
      : this.imageResult()
        ? this.processedResult(this.imageResult()!)
        : [],
  );
  readonly selectedDetections = computed(() =>
    this.editing()
      ? this.draft()
      : this.processedDetections().filter((box) => this.enabledClasses().has(box.className)),
  );
  readonly visitedImageCount = computed(() => this.allDetectionsCache().size);
  readonly jobClassTotals = computed(() => {
    const totals = new Map<string, number>();
    for (const result of this.allDetectionsCache().values()) {
      for (const d of this.processedResult(result))
        totals.set(d.className, (totals.get(d.className) ?? 0) + 1);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  });
  readonly currentImageClassCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const d of [
      ...(this.imageResult()?.detections ?? []),
      ...(this.imageResult()?.reviewedDetections ?? []),
      ...this.draft(),
    ])
      counts.set(d.className, 0);
    for (const d of this.processedDetections())
      counts.set(d.className, (counts.get(d.className) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  });
  readonly visibleDetections = computed(() => {
    if (!this.showAllDetections()) return [];
    return this.selectedDetections();
  });
  readonly currentImageIndex = computed(() =>
    Math.max(0, this.job()?.images.findIndex((i) => i.id === this.selectedImageId()) ?? 0),
  );
  readonly hasPrevImage = computed(() => this.currentImageIndex() > 0);
  readonly hasNextImage = computed(
    () => this.currentImageIndex() < (this.job()?.images.length ?? 0) - 1,
  );

  readonly boxStyle = boxStyle;
  readonly classColor = classColor;
  readonly imageEl = viewChild<ElementRef<HTMLImageElement>>('viewerImage');
  readonly viewportEl = viewChild<ElementRef<HTMLDivElement>>('viewport');
  // Image and overlay share an explicitly sized plane, with no letterboxing inside it.
  readonly contentRect: ContentRect = {
    offsetX: 0,
    offsetY: 0,
    width: 100,
    height: 100,
    containerWidth: 100,
    containerHeight: 100,
  };
  private resizeObserver: ResizeObserver | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private imageRequest = 0;

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

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.pollTimer !== null) clearTimeout(this.pollTimer);
      this.resizeObserver?.disconnect();
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

  async retryJob(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('jobId');
    if (id) await this.loadJob(id);
  }

  async loadImage(img: InferenceJobImageSummary, refresh = false): Promise<void> {
    if (this.destroyRef.destroyed || this.savingReview()) return;
    const sameImage = this.selectedImageId() === img.id;
    if (this.editing()) {
      if (sameImage) return;
      if (!(await this.discardReview())) return;
    }
    const hadDetections = !!this.imageResult()?.detections?.length;
    if (sameImage && !refresh && this.imageResult()) return;
    const request = ++this.imageRequest;
    this.selectedImageId.set(img.id);
    if (!sameImage) {
      this.showOriginal.set(false);
      this.reviewError.set('');
      this.draft.set([]);
    }
    if (!sameImage || !this.imageResult() || this.imageError()) {
      this.loadingImage.set(true);
      this.imageResult.set(null);
      this.imageDecoded.set(false);
      this.naturalSize.set({ width: 0, height: 0 });
      this.zoomReset();
    }
    this.imageError.set('');
    try {
      const detail = this.job();
      if (!detail) return;
      const result = await this.inferenceService.getImage(detail.id, img.id);
      if (request !== this.imageRequest || this.destroyRef.destroyed) return;
      this.imageResult.set(result);
      this.allDetectionsCache.update((map) => new Map(map).set(img.id, result));
      if (!sameImage || !hadDetections) {
        this.enabledClasses.set(
          new Set(
            [...(result.detections ?? []), ...(result.reviewedDetections ?? [])].map(
              (d) => d.className,
            ),
          ),
        );
      }
    } catch (err: unknown) {
      if (request !== this.imageRequest || this.destroyRef.destroyed) return;
      this.imageError.set(err instanceof Error ? err.message : 'Erro ao carregar imagem.');
      this.imageResult.set(null);
    } finally {
      if (request === this.imageRequest) this.loadingImage.set(false);
    }
  }

  retryImage(): void {
    const image = this.job()?.images.find((i) => i.id === this.selectedImageId());
    if (image) void this.loadImage(image, true);
  }

  prevImage(): void {
    const image = this.job()?.images[this.currentImageIndex() - 1];
    if (image) void this.loadImage(image);
  }

  nextImage(): void {
    const image = this.job()?.images[this.currentImageIndex() + 1];
    if (image) void this.loadImage(image);
  }

  zoomIn(): void {
    this.setZoom(
      Math.min((Math.floor(this.zoom() / this.zoomStep) + 1) * this.zoomStep, this.zoomMax),
    );
  }
  zoomOut(): void {
    this.setZoom(
      Math.max((Math.ceil(this.zoom() / this.zoomStep) - 1) * this.zoomStep, this.zoomMin),
    );
  }
  zoomNative(): void {
    this.setZoom(1);
  }

  private setZoom(value: number): void {
    this.fitMode.set(false);
    this.zoom.set(Math.max(this.zoomMin, Math.min(value, this.zoomMax)));
  }

  zoomReset(): void {
    this.fitMode.set(true);
    this.updateFit();
    const viewport = this.viewportEl()?.nativeElement;
    if (viewport) {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    }
  }

  private updateFit(): void {
    if (!this.fitMode()) return;
    const natural = this.naturalSize();
    const viewport = this.viewportSize();
    this.zoom.set(fitImageScale(natural.width, natural.height, viewport.width, viewport.height));
  }

  onImageLoad(): void {
    const img = this.imageEl()?.nativeElement;
    const viewport = this.viewportEl()?.nativeElement;
    if (!img || !viewport) return;
    this.naturalSize.set({ width: img.naturalWidth, height: img.naturalHeight });
    this.imageDecoded.set(true);
    const measure = () => {
      this.viewportSize.set({ width: viewport.clientWidth, height: viewport.clientHeight });
      this.updateFit();
    };
    measure();
    this.resizeObserver?.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(measure);
      this.resizeObserver.observe(viewport);
    }
  }

  onImageError(): void {
    this.imageDecoded.set(false);
    this.imageError.set('Não foi possível abrir a imagem. Tente carregá-la novamente.');
  }

  toggleAllDetections(): void {
    this.showAllDetections.update((value) => !value);
  }
  toggleClassFilter(className: string, enabled: boolean): void {
    this.enabledClasses.update((set) => {
      const next = new Set(set);
      if (enabled) next.add(className);
      else next.delete(className);
      return next;
    });
  }
  resetFilters(): void {
    this.showAllDetections.set(true);
    this.minConfidence.set(0.25);
    this.suppressOverlaps.set(false);
    this.iouThreshold.set(0.5);
    this.enabledClasses.set(new Set(this.currentImageClassCounts().map(([name]) => name)));
  }

  toggleOriginal(): void {
    this.showOriginal.set(!this.showOriginal());
    this.resetFilters();
  }

  private async confirm(message: string): Promise<boolean> {
    return !!(await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            title: 'Revisão da inferência',
            message,
            confirmText: 'Confirmar',
            cancelText: 'Voltar',
          },
        })
        .afterClosed(),
    ));
  }
  async canDeactivate(): Promise<boolean> {
    if (this.savingReview()) return false;
    return !this.reviewDirty() || this.confirm('Descartar alterações não salvas?');
  }
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.reviewDirty() || this.savingReview()) event.preventDefault();
  }
  async discardReview(): Promise<boolean> {
    if (
      this.savingReview() ||
      (this.reviewDirty() && !(await this.confirm('Descartar alterações não salvas?')))
    )
      return false;
    this.editing.set(false);
    this.draftExpectedUpdatedAt = null;
    this.draft.set([]);
    this.selectedBox.set(null);
    this.addingBox.set(false);
    this.reviewError.set('');
    return true;
  }
  beginReview(): void {
    const result = this.imageResult();
    if (!result || result.status !== 'completed' || this.savingReview() || this.editing()) return;
    // Fence refreshes already in flight, and bind the draft to the revision it was copied from.
    this.imageRequest++;
    this.loadingImage.set(false);
    this.draftExpectedUpdatedAt = new Date(result.updatedAt).toISOString();
    // Seed all classes, not just boxes currently visible on the overlay.
    const draft = this.processedDetections().map((box) => ({ ...box }));
    this.initialDraft = JSON.stringify(draft);
    this.draft.set(draft);
    this.undoHistory.set([]);
    this.selectedBox.set(null);
    this.addClassId.set(this.modelClasses()[0]?.id ?? null);
    this.showAllDetections.set(true);
    this.reviewError.set('');
    this.editing.set(true);
  }
  changeDraft(boxes: ReviewedDetection[]): void {
    if (this.savingReview() || !this.editing()) return;
    if (
      boxes.length > 1000 ||
      boxes.some((box) => !reviewedDetectionSchema.safeParse(box).success)
    ) {
      this.reviewError.set('Use caixas válidas dentro da imagem (máximo 1000).');
      return;
    }
    this.undoHistory.update((history) => [...history.slice(-49), this.draft()]);
    this.draft.set(boxes);
    this.reviewError.set('');
  }
  undoReview(): void {
    const history = this.undoHistory();
    if (!history.length || this.savingReview()) return;
    this.draft.set(history[history.length - 1]);
    this.undoHistory.set(history.slice(0, -1));
    this.selectedBox.set(null);
  }
  deleteBox(): void {
    const index = this.selectedBox();
    if (index === null) return;
    this.changeDraft(this.draft().filter((_, i) => i !== index));
    this.selectedBox.set(null);
  }
  updateBox(field: 'xCenter' | 'yCenter' | 'width' | 'height', value: number): void {
    const index = this.selectedBox();
    if (index === null) return;
    this.changeDraft(
      this.draft().map((box, i) =>
        i === index ? { ...box, [field]: Number(value), confidence: null } : box,
      ),
    );
  }
  changeBoxClass(id: number): void {
    const index = this.selectedBox(),
      cls = this.modelClasses().find((cls) => cls.id === Number(id));
    if (index === null || !cls) return;
    this.changeDraft(
      this.draft().map((box, i) =>
        i === index ? { ...box, classId: cls.id, className: cls.name, confidence: null } : box,
      ),
    );
  }
  async saveReview(restore = false): Promise<void> {
    const result = this.imageResult(),
      job = this.job();
    if (!result || !job || this.savingReview() || result.status !== 'completed') return;
    if (!restore && (!this.editing() || this.draftExpectedUpdatedAt === null)) return;
    const expectedUpdatedAt = restore
      ? new Date(result.updatedAt).toISOString()
      : this.draftExpectedUpdatedAt!;
    if (
      restore &&
      !(await this.confirm('Restaurar o resultado original e remover a revisão salva?'))
    )
      return;
    this.savingReview.set(true);
    this.reviewError.set('');
    try {
      const saved = await this.inferenceService.saveReview(
        job.id,
        result.id,
        restore ? null : this.draft(),
        expectedUpdatedAt,
      );
      if (this.destroyRef.destroyed) return;
      const next = { ...result, ...saved };
      this.imageResult.set(next);
      this.allDetectionsCache.update((cache) => new Map(cache).set(result.id, next));
      this.editing.set(false);
      this.draftExpectedUpdatedAt = null;
      this.draft.set([]);
      this.selectedBox.set(null);
      this.addingBox.set(false);
      this.showOriginal.set(false);
      this.enabledClasses.set(
        new Set(
          [...(next.detections ?? []), ...(next.reviewedDetections ?? [])].map(
            (box) => box.className,
          ),
        ),
      );
      this.snackBar.open(restore ? 'Resultado original restaurado.' : 'Revisão salva.', 'Fechar', {
        duration: 4000,
      });
    } catch (error) {
      this.reviewError.set(uploadErrorMessage(error));
    } finally {
      this.savingReview.set(false);
    }
  }

  private exportSettings() {
    return {
      filters: this.filterOptions(),
      showOriginal: this.showOriginal(),
      excludedClasses: this.currentImageClassCounts()
        .map(([name]) => name)
        .filter((name) => !this.enabledClasses().has(name)),
    };
  }
  private exportDetections(
    result: InferenceJobImageResult,
    original: boolean,
    settings: ReturnType<InferenceViewerPageComponent['exportSettings']>,
  ): ReviewedDetection[] {
    if (original) return result.detections ?? [];
    const boxes =
      !settings.showOriginal && result.reviewedDetections != null
        ? result.reviewedDetections
        : filterDetections(result.detections ?? [], settings.filters);
    return boxes.filter((box) => !settings.excludedClasses.includes(box.className));
  }

  async exportJson(original = false): Promise<void> {
    const detail = this.job();
    const settings = this.exportSettings();
    if (!detail || this.exporting() || this.editing()) return;
    this.exporting.set(true);
    try {
      const images: InferenceJobImageResult[] = [];
      for (const img of detail.images.filter((image) => image.status === 'completed'))
        images.push(await this.inferenceService.getImage(detail.id, img.id));
      const blob = new Blob(
        [
          JSON.stringify(
            {
              job: detail,
              mode: original ? 'original' : 'current',
              settings: original ? null : settings,
              images: images.map((result) => ({
                ...result,
                detections: this.exportDetections(result, original, settings),
              })),
              exportedAt: new Date().toISOString(),
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      );
      this.exportService.downloadBlob(
        blob,
        `inference-${detail.id}-${original ? 'original' : 'current'}.json`,
      );
      this.snackBar.open('JSON exportado com sucesso.', 'Fechar', { duration: 4000 });
    } catch (err: unknown) {
      this.snackBar.open(err instanceof Error ? err.message : 'Erro ao exportar JSON.', 'Fechar', {
        duration: 6000,
      });
    } finally {
      this.exporting.set(false);
    }
  }

  async exportCsv(original = false): Promise<void> {
    const detail = this.job();
    const settings = this.exportSettings();
    if (!detail || this.exporting() || this.editing()) return;
    this.exporting.set(true);
    try {
      const rows: Record<string, unknown>[] = [];
      for (const img of detail.images.filter((image) => image.status === 'completed')) {
        const result = await this.inferenceService.getImage(detail.id, img.id);
        for (const det of this.exportDetections(result, original, settings))
          rows.push({
            image_index: img.imageIndex,
            file_name: img.fileName,
            class_id: det.classId,
            class_name: det.className,
            confidence: det.confidence ?? '',
            x_center: det.xCenter,
            y_center: det.yCenter,
            width: det.width,
            height: det.height,
            result_mode: original
              ? 'original'
              : !settings.showOriginal && result.reviewedDetections != null
                ? 'reviewed'
                : 'filtered',
            min_confidence:
              original || (!settings.showOriginal && result.reviewedDetections != null)
                ? ''
                : settings.filters.minConfidence,
            overlap_iou:
              !original &&
              (settings.showOriginal || result.reviewedDetections == null) &&
              settings.filters.suppressOverlaps
                ? settings.filters.iouThreshold
                : '',
            excluded_classes: original ? '[]' : JSON.stringify(settings.excludedClasses),
          });
      }
      this.exportService.exportGenericCsv(
        rows,
        `inference-${detail.id}-${original ? 'original' : 'current'}`,
        [
          'image_index',
          'file_name',
          'class_id',
          'class_name',
          'confidence',
          'x_center',
          'y_center',
          'width',
          'height',
          'result_mode',
          'min_confidence',
          'overlap_iou',
          'excluded_classes',
        ],
      );
      this.snackBar.open('CSV exportado com sucesso.', 'Fechar', { duration: 4000 });
    } catch (err: unknown) {
      this.snackBar.open(err instanceof Error ? err.message : 'Erro ao exportar CSV.', 'Fechar', {
        duration: 6000,
      });
    } finally {
      this.exporting.set(false);
    }
  }

  private async loadJob(jobId: string): Promise<void> {
    if (this.destroyRef.destroyed) return;
    this.loadingJob.set(!this.job());
    this.jobError.set('');
    try {
      const detail = await this.inferenceService.getJob(jobId);
      if (this.destroyRef.destroyed) return;
      this.job.set(detail);
      const selected =
        detail.images.find((i) => i.id === this.selectedImageId()) ?? detail.images[0];
      if (selected) await this.loadImage(selected, true);
    } catch (err: unknown) {
      if (this.destroyRef.destroyed) return;
      this.jobError.set(err instanceof Error ? err.message : 'Erro ao carregar a execução.');
    } finally {
      this.loadingJob.set(false);
      const detail = this.job();
      if (detail) this.scheduleJobPoll(detail);
    }
  }

  private scheduleJobPoll(detail: InferenceJobDetail): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.destroyRef.destroyed || TERMINAL_STATUSES.has(detail.status)) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.loadJob(detail.id);
    }, 5000);
  }
}
