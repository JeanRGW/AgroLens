import { TestBed } from '@angular/core/testing';
import { DetectionEditorComponent } from './detection-editor.component';
describe('DetectionEditorComponent gestures', () => {
  const box = {
    classId: 0,
    className: 'corn',
    confidence: 0.9,
    xCenter: 0.5,
    yCenter: 0.5,
    width: 0.2,
    height: 0.2,
  };
  function setup(adding = false) {
    const fixture = TestBed.createComponent(DetectionEditorComponent);
    fixture.componentRef.setInput('boxes', [box]);
    fixture.componentRef.setInput('selectedIndex', 0);
    fixture.componentRef.setInput('adding', adding);
    fixture.componentRef.setInput('addClass', { id: 0, name: 'corn' });
    fixture.detectChanges();
    const plane = fixture.nativeElement.querySelector('.editor-plane') as HTMLElement;
    spyOn(plane, 'getBoundingClientRect').and.returnValue(new DOMRect(0, 0, 1000, 1000));
    spyOn(plane, 'setPointerCapture');
    spyOn(plane, 'hasPointerCapture').and.returnValue(false);
    const changed = jasmine.createSpy('changed');
    fixture.componentInstance.boxesChange.subscribe(changed);
    const pointer = (target: Element, type: string, x: number, y: number) =>
      target.dispatchEvent(
        new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: y }),
      );
    return { fixture, plane, changed, pointer };
  }
  it('moves a box within image bounds and clears model confidence', () => {
    const { fixture, plane, changed, pointer } = setup();
    pointer(fixture.nativeElement.querySelector('.box'), 'pointerdown', 500, 500);
    pointer(plane, 'pointermove', 1200, 1200);
    pointer(plane, 'pointerup', 1200, 1200);
    expect(changed).toHaveBeenCalledOnceWith([
      jasmine.objectContaining({ xCenter: 0.9, yCenter: 0.9, confidence: null }),
    ]);
    expect(fixture.componentInstance.boxes()[0].confidence).toBe(0.9);
  });
  it('resizes from a corner and preserves the opposite corner', () => {
    const { fixture, plane, changed, pointer } = setup();
    pointer(fixture.nativeElement.querySelector('.nw'), 'pointerdown', 400, 400);
    pointer(plane, 'pointermove', 200, 200);
    pointer(plane, 'pointerup', 200, 200);
    const result = changed.calls.mostRecent().args[0][0];
    expect(result.xCenter).toBeCloseTo(0.4);
    expect(result.width).toBeCloseTo(0.4);
    expect(result.confidence).toBeNull();
  });
  it('draws a manual box and does not invent confidence', () => {
    const { plane, changed, pointer } = setup(true);
    pointer(plane, 'pointerdown', 100, 100);
    pointer(plane, 'pointermove', 300, 400);
    pointer(plane, 'pointerup', 300, 400);
    const result = changed.calls.mostRecent().args[0];
    expect(result.length).toBe(2);
    expect(result[1].confidence).toBeNull();
    expect(result[1].width).toBeCloseTo(0.2);
  });
  it('does not change boxes on click or cancelled gestures', () => {
    const { fixture, plane, changed, pointer } = setup();
    pointer(fixture.nativeElement.querySelector('.box'), 'pointerdown', 500, 500);
    pointer(plane, 'pointerup', 500, 500);
    expect(changed).not.toHaveBeenCalled();
    pointer(fixture.nativeElement.querySelector('.box'), 'pointerdown', 500, 500);
    pointer(plane, 'pointermove', 600, 600);
    pointer(plane, 'pointercancel', 600, 600);
    expect(changed).not.toHaveBeenCalled();
  });
});
