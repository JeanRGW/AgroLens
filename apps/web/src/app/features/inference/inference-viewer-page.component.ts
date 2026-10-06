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
  Detection,
  InferenceJobDetail,
  InferenceJobImageResult,
  InferenceJobImageSummary,
} from '@agrolens/contracts';
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

export function boxStyle(d: Detection, rect: ContentRect): Record<string, string> {
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
  ],
  templateUrl: './inference-viewer-page.component.html',
  styleUrl: './inference-viewer-page.component.scss',
})
export class InferenceViewerPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly inferenceService = inject(InferenceService);
  private readonly exportService = inject(ExportService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

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
  private readonly allDetectionsCache = signal<Map<string, Detection[]>>(new Map());
  readonly visitedImageCount = computed(() => this.allDetectionsCache().size);
  readonly jobClassTotals = computed(() => {
    const totals = new Map<string, number>();
    for (const detections of this.allDetectionsCache().values()) {
      for (const d of detections) totals.set(d.className, (totals.get(d.className) ?? 0) + 1);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  });
  readonly currentImageClassCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const d of this.imageResult()?.detections ?? [])
      counts.set(d.className, (counts.get(d.className) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  });
  readonly visibleDetections = computed(() => {
    if (!this.showAllDetections()) return [];
    return (this.imageResult()?.detections ?? []).filter(
      (d) => this.enabledClasses().has(d.className) && d.confidence >= this.minConfidence(),
    );
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
    if (this.destroyRef.destroyed) return;
    const sameImage = this.selectedImageId() === img.id;
    const hadDetections = !!this.imageResult()?.detections?.length;
    if (sameImage && !refresh && this.imageResult()) return;
    const request = ++this.imageRequest;
    this.selectedImageId.set(img.id);
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
      this.allDetectionsCache.update((map) => new Map(map).set(img.id, result.detections ?? []));
      if (!sameImage || !hadDetections) {
        this.enabledClasses.set(new Set((result.detections ?? []).map((d) => d.className)));
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
    this.enabledClasses.set(new Set(this.currentImageClassCounts().map(([name]) => name)));
  }

  async exportJson(): Promise<void> {
    const detail = this.job();
    if (!detail || this.exporting()) return;
    this.exporting.set(true);
    try {
      const images: InferenceJobImageResult[] = [];
      for (const img of detail.images)
        images.push(await this.inferenceService.getImage(detail.id, img.id));
      const blob = new Blob(
        [JSON.stringify({ job: detail, images, exportedAt: new Date().toISOString() }, null, 2)],
        { type: 'application/json' },
      );
      this.exportService.downloadBlob(blob, `inference-${detail.id}.json`);
      this.snackBar.open('JSON exportado com sucesso.', 'Fechar', { duration: 4000 });
    } catch (err: unknown) {
      this.snackBar.open(err instanceof Error ? err.message : 'Erro ao exportar JSON.', 'Fechar', {
        duration: 6000,
      });
    } finally {
      this.exporting.set(false);
    }
  }

  async exportCsv(): Promise<void> {
    const detail = this.job();
    if (!detail || this.exporting()) return;
    this.exporting.set(true);
    try {
      const rows: Record<string, unknown>[] = [];
      for (const img of detail.images) {
        const { detections } = await this.inferenceService.getImage(detail.id, img.id);
        for (const det of detections ?? [])
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
      this.exportService.exportGenericCsv(rows, `inference-${detail.id}`, [
        'image_index',
        'file_name',
        'class_id',
        'class_name',
        'confidence',
        'x_center',
        'y_center',
        'width',
        'height',
      ]);
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
