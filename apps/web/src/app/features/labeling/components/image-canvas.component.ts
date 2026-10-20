import { NgStyle } from '@angular/common';
import {
  Component,
  ElementRef,
  computed,
  effect,
  input,
  OnDestroy,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { ReviewedDetection, YoloLabel } from '@agrolens/contracts';
import { DetectionEditorComponent } from '../../inference/detection-editor.component';

export type LabelCreateEvent = YoloLabel;

@Component({
  selector: 'app-image-canvas',
  standalone: true,
  imports: [NgStyle, MatIconModule, DetectionEditorComponent],
  template: `
    <div class="canvas-tools" role="group" aria-label="Ferramentas da imagem">
      <div class="tool-group">
        <button
          type="button"
          (click)="setMode('draw')"
          aria-label="Rotular"
          [attr.aria-pressed]="mode() === 'draw'"
          title="Desenhar e ajustar caixas"
        >
          <mat-icon>edit</mat-icon><span>Rotular</span>
        </button>
        <button
          type="button"
          (click)="setMode('pan')"
          aria-label="Mover"
          [attr.aria-pressed]="mode() === 'pan'"
          title="Arrastar a imagem"
        >
          <mat-icon>pan_tool</mat-icon><span>Mover</span>
        </button>
      </div>
      <div class="tool-group">
        <button
          type="button"
          aria-label="Diminuir zoom"
          (click)="zoomBy(1 / 1.25)"
          [disabled]="!ready() || zoom() <= 1"
        >
          <mat-icon>remove</mat-icon>
        </button>
        <output aria-label="Zoom atual">{{ zoomPercent() }}%</output>
        <button
          type="button"
          aria-label="Aumentar zoom"
          (click)="zoomBy(1.25)"
          [disabled]="!ready() || zoom() >= 8"
        >
          <mat-icon>add</mat-icon>
        </button>
        <button
          type="button"
          aria-label="Ajustar"
          (click)="fit()"
          [disabled]="!ready()"
          title="Ajustar imagem à área"
        >
          <mat-icon>fit_screen</mat-icon><span>Ajustar</span>
        </button>
      </div>
    </div>
    <div
      #viewport
      class="canvas-host"
      [class.panning]="mode() === 'pan' || navigating()"
      (pointerdown)="pointerDown($event)"
      (pointermove)="pointerMove($event)"
      (pointerup)="pointerEnd($event)"
      (pointercancel)="pointerEnd($event, true)"
      (lostpointercapture)="pointerLost($event)"
      (wheel)="onWheel($event)"
    >
      @if (loadingImage()) {
        <div class="canvas-state">
          <mat-icon>hourglass_empty</mat-icon><span>Carregando imagem...</span>
        </div>
      } @else if (imageUrl()) {
        <div
          class="image-stage"
          [style.transform]="transform()"
          [style.visibility]="ready() ? 'visible' : 'hidden'"
        >
          <img
            #labelImage
            class="label-image"
            [src]="imageUrl()"
            alt="Imagem para rotulagem"
            (load)="onImageLoad()"
            (error)="onImageError()"
            draggable="false"
          />
          <div class="overlay" [ngStyle]="planeStyle()">
            @for (label of previewLabels(); track $index) {
              <div
                class="suggestion"
                [style.left.%]="(label.xCenter - label.width / 2) * 100"
                [style.top.%]="(label.yCenter - label.height / 2) * 100"
                [style.width.%]="label.width * 100"
                [style.height.%]="label.height * 100"
              >
                <span>IA · {{ label.className }}</span>
              </div>
            }
            @if (planeStyle()) {
              <app-detection-editor
                [boxes]="editorBoxes()"
                [selectedIndex]="selectedLabelIndex()"
                [adding]="true"
                [addClass]="addClass()"
                [selectWhileAdding]="true"
                [disabled]="disabled() || mode() === 'pan' || navigating() || !ready()"
                [classColors]="classColors()"
                [showClassNames]="true"
                [viewportScale]="zoom()"
                (selectedIndexChange)="labelPick.emit($event ?? -1)"
                (boxesChange)="onBoxesChange($event)"
              />
            }
          </div>
        </div>
        @if (failed()) {
          <div class="canvas-state" role="alert">
            <mat-icon>broken_image</mat-icon><span>Não foi possível carregar a imagem.</span
            ><button type="button" (click)="retry()">Tentar novamente</button>
          </div>
        } @else if (!ready()) {
          <div class="canvas-state" role="status">
            <mat-icon>hourglass_empty</mat-icon><span>Carregando imagem...</span>
          </div>
        }
      } @else {
        <div class="canvas-state">
          <mat-icon>image</mat-icon><span>Selecione uma imagem para iniciar.</span>
        </div>
      }
    </div>
    <p class="canvas-hint">
      <mat-icon>touch_app</mat-icon>Arraste para rotular. Use dois dedos para ampliar e mover, ou
      escolha Mover.
    </p>
  `,
  styles: `
    .canvas-host {
      position: relative;
      width: 100%;
      height: 60vh;
      min-height: 320px;
      background: #182724;
      border-radius: 0 0 10px 10px;
      overflow: hidden;
      touch-action: none;
      isolation: isolate;
    }
    .image-stage {
      position: absolute;
      inset: 0;
      transform-origin: center;
    }
    .panning,
    .panning .overlay {
      cursor: grab;
    }
    .panning app-detection-editor {
      pointer-events: none;
    }
    .canvas-tools {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 8px;
      padding: 8px;
      border-bottom: 1px solid var(--agri-border);
      background: var(--agri-surface-raised);
      border-radius: 10px 10px 0 0;
    }
    .tool-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-width: 44px;
      min-height: 44px;
      padding: 8px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: var(--agri-text);
      cursor: pointer;
      font: inherit;
      font-size: 12px;
    }
    button:hover:not(:disabled),
    button[aria-pressed='true'] {
      background: var(--agri-fill);
      border-color: var(--agri-accent);
    }
    button:focus-visible {
      outline: 2px solid var(--agri-accent);
      outline-offset: 2px;
    }
    button:disabled {
      opacity: 0.4;
      cursor: default;
    }
    output {
      min-width: 48px;
      text-align: center;
      font: 12px var(--agri-mono, monospace);
      color: var(--agri-text);
    }
    .canvas-hint {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 10px 0 0;
      font-size: 12px;
      color: var(--agri-text-muted);
    }
    .canvas-hint mat-icon {
      flex-shrink: 0;
    }
    .canvas-state button {
      background: var(--agri-surface);
    }
    @media (max-width: 600px) {
      .canvas-host {
        height: 55dvh;
        min-height: 300px;
      }
      .canvas-tools {
        gap: 4px;
      }
      .tool-group {
        gap: 0;
      }
      button {
        padding: 6px;
      }
      .tool-group span {
        display: none;
      }
    }
    .label-image {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      user-select: none;
    }
    .overlay {
      position: absolute;
      cursor: crosshair;
      z-index: 1;
    }
    .suggestion {
      position: absolute;
      border: 2px dashed #fdd835;
      background: #fdd8350d;
      pointer-events: none;
      box-sizing: border-box;
    }
    .suggestion span {
      background: #fdd835;
      color: #202616;
      font-size: 10px;
      padding: 1px 4px;
    }
    .canvas-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 10px;
      color: rgba(255, 255, 255, 0.6);
    }
    .canvas-state mat-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
    }
  `,
})
export class ImageCanvasComponent implements OnDestroy {
  readonly imageUrl = input<string | null>(null);
  readonly labels = input<YoloLabel[]>([]);
  readonly previewLabels = input<YoloLabel[]>([]);
  readonly selectedLabelIndex = input<number | null>(null);
  readonly classColors = input<Map<string, string>>(new Map());
  readonly classes = input<string[]>([]);
  readonly selectedClass = input('objeto');
  readonly loadingImage = input(false);
  readonly disabled = input(false);
  readonly imageLoad = output<HTMLImageElement>();
  readonly imageError = output<void>();
  readonly imageRetry = output<void>();
  readonly labelPick = output<number>();
  readonly labelCreate = output<LabelCreateEvent>();
  readonly labelsChange = output<YoloLabel[]>();
  readonly imageEl = viewChild<ElementRef<HTMLImageElement>>('labelImage');
  readonly viewport = viewChild.required<ElementRef<HTMLDivElement>>('viewport');
  readonly editor = viewChild(DetectionEditorComponent);
  readonly mode = signal<'draw' | 'pan'>('draw');
  readonly zoom = signal(1);
  readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));
  readonly offset = signal({ x: 0, y: 0 });
  readonly transform = computed(
    () => `translate(${this.offset().x}px, ${this.offset().y}px) scale(${this.zoom()})`,
  );
  readonly ready = signal(false);
  readonly failed = signal(false);
  readonly navigating = signal(false);
  private readonly pointers = new Map<number, { x: number; y: number }>();
  readonly planeStyle = signal<Record<string, string> | null>(null);
  readonly editorBoxes = computed<ReviewedDetection[]>(() =>
    this.labels().map((label) => ({ ...label, confidence: null })),
  );
  readonly addClass = computed(() => ({
    id: Math.max(0, this.classes().indexOf(this.selectedClass())),
    name: this.selectedClass(),
  }));
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    effect(() => {
      this.imageUrl();
      untracked(() => {
        this.resetGestures();
        this.ready.set(false);
        this.failed.set(false);
        this.planeStyle.set(null);
        this.zoom.set(1);
        this.offset.set({ x: 0, y: 0 });
      });
    });
  }

  setMode(mode: 'draw' | 'pan'): void {
    this.resetGestures();
    this.mode.set(mode);
  }

  fit(): void {
    this.resetGestures();
    this.zoom.set(1);
    this.offset.set({ x: 0, y: 0 });
  }

  zoomBy(factor: number, anchor = { x: 0, y: 0 }): void {
    if (!this.ready()) return;
    this.editor()?.cancel();
    const previous = this.zoom();
    const next = Math.max(1, Math.min(8, previous * factor));
    const offset = this.offset();
    this.zoom.set(next);
    this.offset.set(
      this.clampOffset({
        x: anchor.x - ((anchor.x - offset.x) * next) / previous,
        y: anchor.y - ((anchor.y - offset.y) * next) / previous,
      }),
    );
  }

  private clampOffset(offset: { x: number; y: number }): { x: number; y: number } {
    const host = this.viewport().nativeElement;
    const style = this.planeStyle();
    const maxX = Math.max(
      0,
      (parseFloat(style?.['width'] ?? '0') * this.zoom() - host.clientWidth) / 2,
    );
    const maxY = Math.max(
      0,
      (parseFloat(style?.['height'] ?? '0') * this.zoom() - host.clientHeight) / 2,
    );
    return {
      x: Math.max(-maxX, Math.min(maxX, offset.x)),
      y: Math.max(-maxY, Math.min(maxY, offset.y)),
    };
  }

  pointerDown(event: PointerEvent): void {
    if (!this.ready() || event.button !== 0) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.mode() === 'pan' || this.pointers.size > 1) {
      this.editor()?.cancel();
      this.navigating.set(true);
      for (const id of this.pointers.keys()) this.viewport().nativeElement.setPointerCapture(id);
      event.preventDefault();
    }
  }

  pointerMove(event: PointerEvent): void {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const before = [...this.pointers.values()];
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!this.navigating()) return;
    event.preventDefault();
    const after = [...this.pointers.values()];
    const center = (points: { x: number; y: number }[]) => ({
      x: points.reduce((n, p) => n + p.x, 0) / points.length,
      y: points.reduce((n, p) => n + p.y, 0) / points.length,
    });
    const a = center(before),
      b = center(after);
    if (before.length === 2) {
      const distance = (points: { x: number; y: number }[]) =>
        Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const bounds = this.viewport().nativeElement.getBoundingClientRect();
      const initialDistance = distance(before);
      if (initialDistance > 0)
        this.zoomBy(distance(after) / initialDistance, {
          x: a.x - bounds.left - bounds.width / 2,
          y: a.y - bounds.top - bounds.height / 2,
        });
    }
    const offset = this.offset();
    this.offset.set(this.clampOffset({ x: offset.x + b.x - a.x, y: offset.y + b.y - a.y }));
  }

  pointerEnd(event: PointerEvent, cancelled = false): void {
    if (cancelled) this.editor()?.cancel();
    this.pointers.delete(event.pointerId);
    if (!this.pointers.size) this.navigating.set(false);
  }

  pointerLost(event: PointerEvent): void {
    // A pinch transfers capture from the editor to the viewport.
    if (event.target === this.viewport().nativeElement) this.pointerEnd(event, true);
  }

  onWheel(event: WheelEvent): void {
    if (!this.ready() || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    const bounds = this.viewport().nativeElement.getBoundingClientRect();
    this.zoomBy(Math.exp(-event.deltaY * 0.01), {
      x: event.clientX - bounds.left - bounds.width / 2,
      y: event.clientY - bounds.top - bounds.height / 2,
    });
  }

  private resetGestures(): void {
    this.editor()?.cancel();
    const ids = [...this.pointers.keys()];
    this.pointers.clear();
    this.navigating.set(false);
    for (const id of ids) {
      const host = this.viewport().nativeElement;
      if (host.hasPointerCapture(id)) host.releasePointerCapture(id);
    }
  }

  onImageError(): void {
    this.resetGestures();
    this.ready.set(false);
    this.failed.set(true);
    this.imageError.emit();
  }

  retry(): void {
    this.imageRetry.emit();
    const image = this.imageEl()?.nativeElement;
    // Reload even when renewing the signed URL returns the same string.
    if (image && this.imageUrl()) image.src = this.imageUrl()!;
  }

  onImageLoad(): void {
    const image = this.imageEl()?.nativeElement;
    if (!image) return;
    this.ready.set(true);
    this.failed.set(false);
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.computeContentRect());
    this.resizeObserver.observe(image);
    this.computeContentRect();
    this.imageLoad.emit(image);
  }

  private computeContentRect(): void {
    const image = this.imageEl()?.nativeElement;
    if (!image?.naturalWidth || !image.naturalHeight) return;
    const scale = Math.min(
      image.clientWidth / image.naturalWidth,
      image.clientHeight / image.naturalHeight,
    );
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    this.planeStyle.set({
      left: `${(image.clientWidth - width) / 2}px`,
      top: `${(image.clientHeight - height) / 2}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
    this.editor()?.cancel();
    this.offset.set(this.clampOffset(this.offset()));
  }

  onBoxesChange(boxes: ReviewedDetection[]): void {
    if (this.disabled() || !this.ready() || this.navigating() || this.mode() === 'pan') return;
    const labels = boxes.map(({ classId, className, xCenter, yCenter, width, height }) => ({
      classId,
      className,
      xCenter,
      yCenter,
      width,
      height,
    }));
    if (labels.length === this.labels().length + 1)
      this.labelCreate.emit(labels[labels.length - 1]);
    else this.labelsChange.emit(labels);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }
}
