import { TestBed } from '@angular/core/testing';
import { LabelListPanelComponent } from './label-list-panel.component';

describe('LabelListPanelComponent correction controls', () => {
  function setup() {
    const fixture = TestBed.createComponent(LabelListPanelComponent);
    const label = {
      classId: 0,
      className: 'weed',
      xCenter: 0.5,
      yCenter: 0.5,
      width: 0.2,
      height: 0.2,
    };
    fixture.componentRef.setInput('labels', [label]);
    fixture.componentRef.setInput('classes', ['weed', 'crop']);
    fixture.componentRef.setInput('selectedLabelIndex', 0);
    fixture.detectChanges();
    const changed = jasmine.createSpy('changed');
    fixture.componentInstance.labelChange.subscribe(changed);
    return { fixture, panel: fixture.componentInstance, label, changed };
  }

  it('applies class and geometry corrections together without mutating the source label', () => {
    const { fixture, panel, label, changed } = setup();
    panel.changeClass('crop');
    panel.changeGeometry('width', 0.3);
    expect(changed).not.toHaveBeenCalled();
    panel.applyChanges();
    expect(changed).toHaveBeenCalledWith({
      index: 0,
      label: { ...label, classId: 1, className: 'crop', width: 0.3 },
    });
    expect(label.className).toBe('weed');
    expect(label.width).toBe(0.2);
    fixture.destroy();
  });

  it('rejects empty, zero-sized, and out-of-bounds corrections', () => {
    const { fixture, panel, changed } = setup();
    panel.changeGeometry('width', null);
    panel.applyChanges();
    panel.changeGeometry('width', 0);
    panel.applyChanges();
    panel.changeGeometry('width', 0.2);
    panel.changeGeometry('xCenter', 0.95);
    panel.applyChanges();
    expect(changed).not.toHaveBeenCalled();
    expect(panel.geometryError()).toContain('dentro da imagem');
    fixture.destroy();
  });

  it('preserves pending width and class edits while refreshing untouched canvas geometry', () => {
    const { fixture, panel, label, changed } = setup();
    panel.changeGeometry('width', 0.3);
    panel.changeClass('crop');
    fixture.componentRef.setInput('labels', [{ ...label, xCenter: 0.6, height: 0.4 }]);
    fixture.detectChanges();
    expect(panel.draft()).toEqual({
      ...label,
      classId: 1,
      className: 'crop',
      width: 0.3,
      xCenter: 0.6,
      height: 0.4,
    });
    panel.applyChanges();
    expect(changed).toHaveBeenCalledWith({ index: 0, label: panel.draft() });
    fixture.componentRef.setInput('labels', [{ ...panel.draft()!, width: 0.4 }]);
    fixture.detectChanges();
    expect(panel.draft()?.width).toBe(0.4);
    fixture.destroy();
  });

  it('clears pending edits and validation errors when the selection changes or disappears', () => {
    const { fixture, panel, label } = setup();
    const second = { ...label, width: 0.4 };
    panel.changeGeometry('width', null);
    panel.applyChanges();
    fixture.componentRef.setInput('labels', [{ ...label }, second]);
    fixture.componentRef.setInput('selectedLabelIndex', 1);
    fixture.detectChanges();
    expect(panel.draft()).toEqual(second);
    expect(panel.geometryError()).toBe('');
    panel.changeGeometry('width', 0.3);
    fixture.componentRef.setInput('selectedLabelIndex', null);
    fixture.detectChanges();
    expect(panel.draft()).toBeNull();
    fixture.componentRef.setInput('selectedLabelIndex', 1);
    fixture.detectChanges();
    expect(panel.draft()).toEqual(second);
    fixture.destroy();
  });

  it('retains invalid pending input and its error across canvas updates', () => {
    const { fixture, panel, label, changed } = setup();
    panel.changeGeometry('width', null);
    panel.applyChanges();
    fixture.componentRef.setInput('labels', [{ ...label, xCenter: 0.6 }]);
    fixture.detectChanges();
    expect(panel.draft()?.width).toBeNaN();
    expect(panel.draft()?.xCenter).toBe(0.6);
    expect(panel.geometryError()).toContain('dentro da imagem');
    expect(changed).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('does not apply corrections while the editor is disabled', () => {
    const { fixture, panel, changed } = setup();
    fixture.componentRef.setInput('disabled', true);
    panel.changeClass('crop');
    panel.applyChanges();
    expect(changed).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
