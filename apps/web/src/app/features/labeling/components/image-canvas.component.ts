import { NgStyle } from '@angular/common';
import {
  Component,
  ElementRef,
  computed,
  input,
  OnDestroy,
  output,
  signal,
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
    <div class="canvas-host">
      @if (loadingImage()) {
        <div class="canvas-state">
          <mat-icon>hourglass_empty</mat-icon><span>Carregando imagem...</span>
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
              [disabled]="disabled()"
              [classColors]="classColors()"
              [showClassNames]="true"
              (selectedIndexChange)="labelPick.emit($event ?? -1)"
              (boxesChange)="onBoxesChange($event)"
            />
          }
        </div>
      } @else {
        <div class="canvas-state">
          <mat-icon>image</mat-icon><span>Selecione uma imagem para iniciar.</span>
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
  readonly labelPick = output<number>();
  readonly labelCreate = output<LabelCreateEvent>();
  readonly labelsChange = output<YoloLabel[]>();
  readonly imageEl = viewChild<ElementRef<HTMLImageElement>>('labelImage');
  readonly planeStyle = signal<Record<string, string> | null>(null);
  readonly editorBoxes = computed<ReviewedDetection[]>(() =>
    this.labels().map((label) => ({ ...label, confidence: null })),
  );
  readonly addClass = computed(() => ({
    id: Math.max(0, this.classes().indexOf(this.selectedClass())),
    name: this.selectedClass(),
  }));
  private resizeObserver: ResizeObserver | null = null;

  onImageLoad(): void {
    const image = this.imageEl()?.nativeElement;
    if (!image) return;
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
  }

  onBoxesChange(boxes: ReviewedDetection[]): void {
    if (this.disabled()) return;
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
