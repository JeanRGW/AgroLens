import {
  AfterViewInit,
  Directive,
  ElementRef,
  NgZone,
  OnDestroy,
  Renderer2,
  inject,
} from '@angular/core';

@Directive({
  selector: '[appResizableColumns]',
})
export class ResizableColumnsDirective implements AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLTableElement>);
  private readonly renderer = inject(Renderer2);
  private readonly ngZone = inject(NgZone);

  private readonly cleanupCallbacks: Array<() => void> = [];
  private readonly minimumColumnWidth = 72;
  private activeMouseMoveCleanup: (() => void) | null = null;
  private activeMouseUpCleanup: (() => void) | null = null;

  ngAfterViewInit(): void {
    queueMicrotask(() => {
      this.ngZone.runOutsideAngular(() => {
        this.attachResizeHandles();
      });
    });
  }

  ngOnDestroy(): void {
    this.activeMouseMoveCleanup?.();
    this.activeMouseUpCleanup?.();
    this.activeMouseMoveCleanup = null;
    this.activeMouseUpCleanup = null;
    this.cleanupCallbacks.forEach((cleanup) => cleanup());
    this.cleanupCallbacks.length = 0;
  }

  private attachResizeHandles(): void {
    const tableElement = this.host.nativeElement as HTMLTableElement;
    const headerCells = Array.from(
      tableElement.querySelectorAll('th.mat-mdc-header-cell'),
    ) as HTMLElement[];

    headerCells.forEach((headerCell) => {
      if (headerCell.querySelector('.column-resize-handle')) {
        return;
      }

      const columnClass = (Array.from(headerCell.classList) as string[]).find((className) =>
        className.startsWith('mat-column-'),
      );

      if (!columnClass) {
        return;
      }

      this.renderer.setStyle(headerCell, 'position', 'relative');
      this.renderer.setStyle(headerCell, 'padding-right', '14px');

      const handle = this.renderer.createElement('div');
      this.renderer.addClass(handle, 'column-resize-handle');
      this.renderer.setStyle(handle, 'position', 'absolute');
      this.renderer.setStyle(handle, 'top', '0');
      this.renderer.setStyle(handle, 'right', '0');
      this.renderer.setStyle(handle, 'width', '8px');
      this.renderer.setStyle(handle, 'height', '100%');
      this.renderer.setStyle(handle, 'cursor', 'col-resize');
      this.renderer.setStyle(handle, 'z-index', '5');
      this.renderer.setStyle(handle, 'touch-action', 'none');
      this.renderer.setStyle(
        handle,
        'background',
        'linear-gradient(to right, transparent 0 3px, rgba(148, 163, 184, 0.5) 3px 4px, transparent 4px 100%)',
      );
      this.renderer.setStyle(handle, 'opacity', '0.85');

      this.renderer.appendChild(headerCell, handle);

      const removeMouseDown = this.renderer.listen(handle, 'mousedown', (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        const startX = event.pageX;
        const startWidth = headerCell.getBoundingClientRect().width;
        const columnCells = Array.from(
          tableElement.querySelectorAll(`.${columnClass}`),
        ) as HTMLElement[];

        const removeMouseMove = this.renderer.listen(
          'document',
          'mousemove',
          (moveEvent: MouseEvent) => {
            this.renderer.setStyle(
              handle,
              'background',
              'linear-gradient(to right, transparent 0 2px, rgba(100, 116, 139, 0.75) 2px 5px, transparent 5px 100%)',
            );
            const deltaX = moveEvent.pageX - startX;
            const nextWidth = Math.max(this.minimumColumnWidth, startWidth + deltaX);

            columnCells.forEach((cell) => {
              this.renderer.setStyle(cell, 'width', `${nextWidth}px`);
              this.renderer.setStyle(cell, 'min-width', `${nextWidth}px`);
              this.renderer.setStyle(cell, 'max-width', `${nextWidth}px`);
            });
          },
        );

        this.activeMouseMoveCleanup = removeMouseMove;

        const removeMouseUp = this.renderer.listen('document', 'mouseup', () => {
          this.renderer.setStyle(
            handle,
            'background',
            'linear-gradient(to right, transparent 0 3px, rgba(148, 163, 184, 0.5) 3px 4px, transparent 4px 100%)',
          );
          removeMouseMove();
          removeMouseUp();
          this.activeMouseMoveCleanup = null;
          this.activeMouseUpCleanup = null;
        });

        this.activeMouseUpCleanup = removeMouseUp;
      });

      const removeMouseEnter = this.renderer.listen(handle, 'mouseenter', () => {
        this.renderer.setStyle(
          handle,
          'background',
          'linear-gradient(to right, transparent 0 2px, rgba(107, 114, 128, 0.68) 2px 5px, transparent 5px 100%)',
        );
      });

      const removeMouseLeave = this.renderer.listen(handle, 'mouseleave', () => {
        this.renderer.setStyle(
          handle,
          'background',
          'linear-gradient(to right, transparent 0 3px, rgba(148, 163, 184, 0.5) 3px 4px, transparent 4px 100%)',
        );
      });

      this.cleanupCallbacks.push(removeMouseDown);
      this.cleanupCallbacks.push(removeMouseEnter);
      this.cleanupCallbacks.push(removeMouseLeave);
    });
  }
}
