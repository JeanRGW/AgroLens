import { NgStyle } from '@angular/common';
import { Component, ElementRef, input, OnDestroy, output, signal, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { YoloLabel } from '@agrolens/contracts';

export interface LabelCreateEvent {
  classId: number;
  className: string;
  xCenter: number;
  yCenter: number;
  width: number;
  height: number;
}

@Component({
  selector: 'app-image-canvas',
  standalone: true,
  imports: [NgStyle, MatIconModule],
  template: `
    <div class="canvas-host">
      @if (loadingImage()) {
        <div class="canvas-loading">
          <mat-icon>hourglass_empty</mat-icon>
          <span>Carregando imagem...</span>
        </div>
      } @else if (imageUrl()) {
        <img
          #labelImage
          class="label-image"
          [src]="imageUrl()"
          alt="Imagem para rotulagem"
          (load)="onImageLoad()"
          (error)="imageError.emit()"
          draggable="false"
        />

        <div class="overlay" (mousedown)="startDrawing($event)">
          @for (label of labels(); track $index) {
            <button
              type="button"
              class="label-box"
              [class.selected]="selectedLabelIndex() === $index"
              [style.border-color]="getLabelColor(label)"
              [style.background-color]="getLabelColor(label) + '26'"
              [style.--label-color]="getLabelColor(label)"
              [ngStyle]="getLabelStyle(label)"
              (click)="pickLabel($index, $event)"
            >
              <span class="label-tag">{{ getLabelClassName(label) }}</span>
            </button>
          }

          @if (draftRect()) {
            <div class="draft-box" [ngStyle]="getDraftStyle()"></div>
          }
        </div>
      } @else {
        <div class="canvas-empty">
          <mat-icon>image</mat-icon>
          <span>Selecione uma imagem para iniciar.</span>
        </div>
      }
    </div>
  `,
  styles: `
    .canvas-host {
      position: relative;
      width: 100%;
      height: 65vh;
      min-height: 320px;
      max-height: calc(100vh - 340px);
      background: #1a1a1a;
      border-radius: 12px;
      overflow: hidden;
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
      inset: 0;
      cursor: crosshair;
      overflow: hidden;
      z-index: 1;
    }

    .label-box {
      position: absolute;
      border: 2px solid;
      border-radius: 2px;
      color: #fff;
      font-size: 11px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      padding: 0;
      text-align: left;
      background: transparent;
      cursor: pointer;
      transition: box-shadow 0.15s;
    }

    .label-box:hover {
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5);
    }

    .label-box.selected {
      box-shadow:
        0 0 0 3px #fff,
        0 0 0 5px var(--label-color);
      z-index: 2;
    }

    .label-tag {
      position: absolute;
      top: 0;
      left: 0;
      background: var(--label-color);
      color: #fff;
      padding: 1px 6px;
      border-bottom-right-radius: 6px;
      font-weight: 600;
      font-size: 10px;
      letter-spacing: 0.3px;
      line-height: 1.4;
    }

    .draft-box {
      position: absolute;
      border: 2px dashed #90caf9;
      background: rgba(144, 202, 249, 0.2);
      border-radius: 2px;
      pointer-events: none;
    }

    .canvas-loading,
    .canvas-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 10px;
      color: rgba(255, 255, 255, 0.6);
    }

    .canvas-loading mat-icon,
    .canvas-empty mat-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
    }
  `,
})
export class ImageCanvasComponent implements OnDestroy {
  imageUrl = input<string | null>(null);
  labels = input<YoloLabel[]>([]);
  selectedLabelIndex = input<number | null>(null);
  classColors = input<Map<string, string>>(new Map());
  classes = input<string[]>([]);
  selectedClass = input<string>('objeto');
  loadingImage = input<boolean>(false);

  imageLoad = output<HTMLImageElement>();
  imageError = output<void>();
  labelPick = output<number>();
  labelCreate = output<LabelCreateEvent>();

  readonly imageEl = viewChild<ElementRef<HTMLImageElement>>('labelImage');

  readonly draftRect = signal<{ x: number; y: number; width: number; height: number } | null>(null);

  private drawStartPoint: { x: number; y: number } | null = null;

  private imageNaturalWidth = 0;
  private imageNaturalHeight = 0;
  private contentOffsetX = 0;
  private contentOffsetY = 0;
  private contentWidth = 0;
  private contentHeight = 0;
  private containerWidth = 0;
  private containerHeight = 0;

  ngOnDestroy(): void {
    this.cancelDrawing();
  }

  getLabelStyle(label: YoloLabel): Record<string, string> {
    const halfW = label.width / 2;
    const halfH = label.height / 2;
    const safeX = Math.max(halfW, Math.min(1 - halfW, label.xCenter));
    const safeY = Math.max(halfH, Math.min(1 - halfH, label.yCenter));
    const left =
      ((this.contentOffsetX + (safeX - halfW) * this.contentWidth) / this.containerWidth) * 100;
    const top =
      ((this.contentOffsetY + (safeY - halfH) * this.contentHeight) / this.containerHeight) * 100;
    const w = ((label.width * this.contentWidth) / this.containerWidth) * 100;
    const h = ((label.height * this.contentHeight) / this.containerHeight) * 100;
    return { left: `${left}%`, top: `${top}%`, width: `${w}%`, height: `${h}%` };
  }

  getLabelClassName(label: YoloLabel): string {
    return this.classes()[label.classId] || label.className || 'objeto';
  }

  getLabelColor(label: YoloLabel): string {
    const name = this.getLabelClassName(label);
    return this.classColors().get(name) || '#666';
  }

  getDraftStyle(): Record<string, string> {
    const draft = this.draftRect();
    if (!draft) {
      return {};
    }
    return {
      left: `${this.contentOffsetX + draft.x}px`,
      top: `${this.contentOffsetY + draft.y}px`,
      width: `${draft.width}px`,
      height: `${draft.height}px`,
    };
  }

  onImageLoad(): void {
    const imgRef = this.imageEl();
    if (!imgRef) return;
    const img = imgRef.nativeElement;
    this.imageNaturalWidth = img.naturalWidth;
    this.imageNaturalHeight = img.naturalHeight;
    this.computeContentRect();
    this.imageLoad.emit(img);
  }

  private computeContentRect(): void {
    const imgRef = this.imageEl();
    if (!imgRef) return;
    const img = imgRef.nativeElement;
    this.containerWidth = img.clientWidth;
    this.containerHeight = img.clientHeight;
    const scale =
      Math.min(
        this.containerWidth / this.imageNaturalWidth,
        this.containerHeight / this.imageNaturalHeight,
      ) || 1;
    this.contentWidth = this.imageNaturalWidth * scale;
    this.contentHeight = this.imageNaturalHeight * scale;
    this.contentOffsetX = (this.containerWidth - this.contentWidth) / 2;
    this.contentOffsetY = (this.containerHeight - this.contentHeight) / 2;
  }

  startDrawing(event: MouseEvent): void {
    if (event.button !== 0) {
      return;
    }
    this.computeContentRect();
    const point = this.getRelativePoint(event);
    this.drawStartPoint = point;
    this.labelPick.emit(-1);
    this.draftRect.set({ x: point.x, y: point.y, width: 0, height: 0 });

    document.addEventListener('mousemove', this.onDragMove);
    document.addEventListener('mouseup', this.onDragEnd);
  }

  private onDragMove = (event: MouseEvent): void => {
    if (!this.drawStartPoint) {
      return;
    }
    const point = this.getRelativePoint(event);
    const x = Math.min(this.drawStartPoint.x, point.x);
    const y = Math.min(this.drawStartPoint.y, point.y);
    const width = Math.abs(point.x - this.drawStartPoint.x);
    const height = Math.abs(point.y - this.drawStartPoint.y);
    this.draftRect.set({ x, y, width, height });
  };

  private onDragEnd = (): void => {
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.onDragEnd);

    if (!this.drawStartPoint) {
      return;
    }
    const draft = this.draftRect();
    this.drawStartPoint = null;
    this.draftRect.set(null);

    if (!draft || draft.width < 8 || draft.height < 8) {
      return;
    }

    const className = this.selectedClass();
    const classId = this.getClassIndex(className);

    const xCenter = this.clampNormalized((draft.x + draft.width / 2) / this.contentWidth);
    const yCenter = this.clampNormalized((draft.y + draft.height / 2) / this.contentHeight);
    const width = this.clampNormalized(draft.width / this.contentWidth);
    const height = this.clampNormalized(draft.height / this.contentHeight);

    const safeXCenter = this.clampCenterWithinBounds(xCenter, width);
    const safeYCenter = this.clampCenterWithinBounds(yCenter, height);

    this.labelCreate.emit({
      classId,
      className,
      xCenter: safeXCenter,
      yCenter: safeYCenter,
      width,
      height,
    });
  };

  cancelDrawing(): void {
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.onDragEnd);
    this.drawStartPoint = null;
    this.draftRect.set(null);
  }

  pickLabel(index: number, event: MouseEvent): void {
    event.stopPropagation();
    this.labelPick.emit(index);
  }

  private getClassIndex(className: string): number {
    const cls = this.classes();
    const existing = cls.indexOf(className);
    return existing >= 0 ? existing : 0;
  }

  private getRelativePoint(event: MouseEvent): { x: number; y: number } {
    const imgRef = this.imageEl();
    if (!imgRef) return { x: 0, y: 0 };
    const rect = imgRef.nativeElement.getBoundingClientRect();
    const x = this.clampWithin(
      event.clientX - rect.left - this.contentOffsetX,
      0,
      this.contentWidth,
    );
    const y = this.clampWithin(
      event.clientY - rect.top - this.contentOffsetY,
      0,
      this.contentHeight,
    );
    return { x, y };
  }

  private clampWithin(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private clampNormalized(value: number): number {
    return Math.min(Math.max(value, 0), 1);
  }

  private clampCenterWithinBounds(center: number, size: number): number {
    const half = size / 2;
    return this.clampWithin(center, half, 1 - half);
  }
}
