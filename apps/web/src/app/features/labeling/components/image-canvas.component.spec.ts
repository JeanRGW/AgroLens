import { TestBed } from '@angular/core/testing';
import { ImageCanvasComponent } from './image-canvas.component';

describe('ImageCanvasComponent viewport', () => {
  function setup() {
    const fixture = TestBed.createComponent(ImageCanvasComponent);
    fixture.detectChanges();
    const canvas = fixture.componentInstance;
    const host = canvas.viewport().nativeElement;
    Object.defineProperty(host, 'clientWidth', { value: 400 });
    Object.defineProperty(host, 'clientHeight', { value: 400 });
    spyOn(host, 'getBoundingClientRect').and.returnValue(new DOMRect(0, 0, 400, 400));
    spyOn(host, 'setPointerCapture');
    canvas.planeStyle.set({ width: '400px', height: '400px' });
    canvas.ready.set(true);
    const point = (id: number, x: number, y: number) =>
      new PointerEvent('pointermove', {
        pointerId: id,
        clientX: x,
        clientY: y,
        button: 0,
        pointerType: 'touch',
      });
    return { fixture, canvas, point };
  }

  it('bounds zoom, keeps the anchor fixed, and restores fit without emitting labels', () => {
    const { fixture, canvas } = setup();
    const changed = jasmine.createSpy('changed');
    canvas.labelsChange.subscribe(changed);
    canvas.zoomBy(2, { x: 50, y: 0 });
    expect(canvas.zoom()).toBe(2);
    expect(canvas.offset().x).toBe(-50);
    canvas.zoomBy(100);
    expect(canvas.zoom()).toBe(8);
    canvas.fit();
    expect(canvas.zoom()).toBe(1);
    expect(canvas.offset()).toEqual({ x: 0, y: 0 });
    canvas.zoomBy(0.1);
    expect(canvas.zoom()).toBe(1);
    expect(changed).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('pinches and pans with two fingers without creating labels', () => {
    const { fixture, canvas, point } = setup();
    const created = jasmine.createSpy('created');
    canvas.labelCreate.subscribe(created);
    canvas.pointerDown(point(1, 100, 200));
    canvas.pointerDown(point(2, 300, 200));
    expect(canvas.navigating()).toBeTrue();
    canvas.pointerMove(point(2, 400, 200));
    expect(canvas.zoom()).toBe(1.5);
    canvas.pointerEnd(point(2, 400, 200));
    expect(canvas.navigating()).toBeTrue();
    canvas.pointerEnd(point(1, 100, 200));
    expect(canvas.navigating()).toBeFalse();
    expect(created).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('bounds one-finger pan and resets the viewport when the image changes', () => {
    const { fixture, canvas, point } = setup();
    canvas.zoomBy(2);
    canvas.setMode('pan');
    canvas.pointerDown(point(1, 200, 200));
    canvas.pointerMove(point(1, 2000, 2000));
    expect(canvas.offset()).toEqual({ x: 200, y: 200 });
    fixture.componentRef.setInput('imageUrl', '/new-image.png');
    fixture.detectChanges();
    expect(canvas.zoom()).toBe(1);
    expect(canvas.ready()).toBeFalse();
    expect(canvas.navigating()).toBeFalse();
    fixture.destroy();
  });

  it('shows a recoverable image error and blocks label updates', () => {
    const { fixture, canvas } = setup();
    fixture.componentRef.setInput('imageUrl', '/missing.png');
    fixture.detectChanges();
    canvas.onImageError();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Não foi possível',
    );
    const retry = jasmine.createSpy('retry');
    canvas.imageRetry.subscribe(retry);
    canvas.retry();
    expect(retry).toHaveBeenCalled();
    expect(canvas.ready()).toBeFalse();
    fixture.destroy();
  });
});
