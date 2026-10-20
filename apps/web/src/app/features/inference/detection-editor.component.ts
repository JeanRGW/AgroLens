import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import type { ReviewedDetection, InferenceModelClass } from '@agrolens/contracts';

type Point = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number };
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const rect = (box: ReviewedDetection): Rect => ({
  left: box.xCenter - box.width / 2,
  top: box.yCenter - box.height / 2,
  right: box.xCenter + box.width / 2,
  bottom: box.yCenter + box.height / 2,
});
const geometry = (r: Rect) => ({
  xCenter: (r.left + r.right) / 2,
  yCenter: (r.top + r.bottom) / 2,
  width: r.right - r.left,
  height: r.bottom - r.top,
});

@Component({
  selector: 'app-detection-editor',
  standalone: true,
  template: ` <div
    #plane
    class="editor-plane"
    [class.adding]="adding()"
    role="region"
    aria-label="Editor de caixas. Selecione uma caixa para mover ou redimensionar."
    (pointerdown)="start($event)"
    (pointermove)="move($event)"
    (pointerup)="finish($event)"
    (pointercancel)="cancel()"
  >
    @for (box of boxes(); track $index; let i = $index) {
      <button
        type="button"
        class="box label-box"
        [class.selected]="selectedIndex() === i"
        [attr.data-index]="i"
        [attr.aria-label]="'Selecionar caixa ' + (i + 1) + ': ' + box.className"
        [attr.aria-pressed]="selectedIndex() === i"
        [style.left.%]="(box.xCenter - box.width / 2) * 100"
        [style.top.%]="(box.yCenter - box.height / 2) * 100"
        [style.width.%]="box.width * 100"
        [style.height.%]="box.height * 100"
        [style.--box-color]="classColors().get(box.className) ?? '#007f91'"
        (click)="selectedIndexChange.emit(i)"
      >
        @if (showClassNames()) {
          <span class="box-name label-tag">{{ box.className }}</span>
        }
        @if (selectedIndex() === i) {
          @for (corner of corners; track corner) {
            <span class="handle" [class]="'handle ' + corner" [attr.data-mode]="corner"></span>
          }
        }
      </button>
    }
    @if (preview(); as r) {
      <div
        class="preview"
        [style.left.%]="r.left * 100"
        [style.top.%]="r.top * 100"
        [style.width.%]="(r.right - r.left) * 100"
        [style.height.%]="(r.bottom - r.top) * 100"
      ></div>
    }
  </div>`,
  styles: `
    :host,
    .editor-plane {
      position: absolute;
      inset: 0;
    }
    .editor-plane {
      touch-action: none;
    }
    .adding {
      cursor: crosshair;
    }
    .box {
      position: absolute;
      border: 2px solid var(--box-color, #007f91);
      background: #007f9110;
      padding: 0;
      cursor: move;
    }
    .box.selected {
      border-color: #fff;
      box-shadow: 0 0 0 2px #007f91;
      z-index: 1;
    }
    .box:focus-visible {
      outline: 3px solid #fff;
    }
    .box-name {
      color: #fff;
      background: #163d36;
      font-size: 11px;
      padding: 2px 4px;
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
    }
    .handle {
      position: absolute;
      width: 12px;
      height: 12px;
      background: #fff;
      border: 1px solid #007f91;
    }
    .nw {
      left: -6px;
      top: -6px;
      cursor: nwse-resize;
    }
    .ne {
      right: -6px;
      top: -6px;
      cursor: nesw-resize;
    }
    .sw {
      left: -6px;
      bottom: -6px;
      cursor: nesw-resize;
    }
    .se {
      right: -6px;
      bottom: -6px;
      cursor: nwse-resize;
    }
    .preview {
      position: absolute;
      border: 2px dashed #fff;
      background: #007f9120;
      pointer-events: none;
      z-index: 2;
    }
  `,
})
export class DetectionEditorComponent {
  readonly boxes = input.required<ReviewedDetection[]>();
  readonly selectedIndex = input<number | null>(null);
  readonly adding = input(false);
  readonly classColors = input<Map<string, string>>(new Map());
  readonly showClassNames = input(false);
  readonly selectWhileAdding = input(false);
  readonly disabled = input(false);
  readonly addClass = input<InferenceModelClass | null>(null);
  readonly boxesChange = output<ReviewedDetection[]>();
  readonly selectedIndexChange = output<number | null>();
  readonly added = output<void>();
  readonly preview = signal<Rect | null>(null);
  readonly plane = viewChild.required<ElementRef<HTMLDivElement>>('plane');
  readonly corners = ['nw', 'ne', 'sw', 'se'];
  private gesture: {
    pointerId: number;
    start: Point;
    index: number | null;
    mode: string;
    original: Rect | null;
  } | null = null;

  private point(event: PointerEvent): Point {
    const bounds = this.plane().nativeElement.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  }
  start(event: PointerEvent): void {
    if (event.button !== 0 || this.gesture || this.disabled()) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
    const index = target ? Number(target.dataset['index']) : null;
    if (!this.adding() && index === null) {
      this.selectedIndexChange.emit(null);
      return;
    }
    const adding = this.adding() && !(this.selectWhileAdding() && index !== null);
    if (adding && !this.addClass()) return;
    event.preventDefault();
    const mode = adding ? 'add' : ((event.target as HTMLElement).dataset['mode'] ?? 'move');
    this.gesture = {
      pointerId: event.pointerId,
      start: this.point(event),
      index: mode === 'add' ? null : index,
      mode,
      original: index === null ? null : rect(this.boxes()[index]),
    };
    if (mode !== 'add') this.selectedIndexChange.emit(index);
    this.plane().nativeElement.setPointerCapture(event.pointerId);
  }
  move(event: PointerEvent): void {
    const g = this.gesture;
    if (!g || event.pointerId !== g.pointerId) return;
    const p = this.point(event);
    if (g.mode === 'add') {
      this.preview.set({
        left: Math.min(p.x, g.start.x),
        top: Math.min(p.y, g.start.y),
        right: Math.max(p.x, g.start.x),
        bottom: Math.max(p.y, g.start.y),
      });
      return;
    }
    const r = { ...g.original! };
    const dx = p.x - g.start.x,
      dy = p.y - g.start.y;
    if (g.mode === 'move') {
      const width = r.right - r.left,
        height = r.bottom - r.top;
      r.left = clamp(r.left + dx, 0, 1 - width);
      r.top = clamp(r.top + dy, 0, 1 - height);
      r.right = r.left + width;
      r.bottom = r.top + height;
    } else {
      if (g.mode.includes('w')) r.left = clamp(r.left + dx, 0, r.right - 0.0001);
      if (g.mode.includes('e')) r.right = clamp(r.right + dx, r.left + 0.0001, 1);
      if (g.mode.includes('n')) r.top = clamp(r.top + dy, 0, r.bottom - 0.0001);
      if (g.mode.includes('s')) r.bottom = clamp(r.bottom + dy, r.top + 0.0001, 1);
    }
    this.preview.set(r);
  }
  finish(event: PointerEvent): void {
    const g = this.gesture;
    if (!g || event.pointerId !== g.pointerId) return;
    const r = this.preview();
    if (r && r.right - r.left > 0.00001 && r.bottom - r.top > 0.00001) {
      const boxes = this.boxes().map((box) => ({ ...box }));
      if (g.mode === 'add') {
        const cls = this.addClass()!;
        boxes.push({ ...geometry(r), classId: cls.id, className: cls.name, confidence: null });
        this.boxesChange.emit(boxes);
        this.selectedIndexChange.emit(boxes.length - 1);
        this.added.emit();
      } else if (JSON.stringify(r) !== JSON.stringify(g.original)) {
        boxes[g.index!] = { ...boxes[g.index!], ...geometry(r), confidence: null };
        this.boxesChange.emit(boxes);
      }
    }
    this.cancel();
  }
  cancel(): void {
    if (this.gesture && this.plane().nativeElement.hasPointerCapture(this.gesture.pointerId))
      this.plane().nativeElement.releasePointerCapture(this.gesture.pointerId);
    this.gesture = null;
    this.preview.set(null);
  }
}
