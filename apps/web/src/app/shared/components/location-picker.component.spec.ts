import { Component } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { LocationPickerComponent } from './location-picker.component';

@Component({
  standalone: true,
  imports: [LocationPickerComponent],
  template: '<form (submit)="submissions = submissions + 1"><app-location-picker /></form>',
})
class FormHost {
  submissions = 0;
}

describe('LocationPickerComponent offline GPS', () => {
  let geolocation: jasmine.Spy;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LocationPickerComponent, FormHost],
      providers: [provideNoopAnimations()],
    });
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    geolocation = spyOn(navigator.geolocation, 'getCurrentPosition');
  });

  it('emits an offline GPS fix without creating a map', () => {
    const fixture = TestBed.createComponent(LocationPickerComponent);
    const picker = fixture.componentInstance;
    const selected = jasmine.createSpy('selected');
    picker.locationSelected.subscribe(selected);
    geolocation.and.callFake((success: PositionCallback) =>
      success({
        coords: { latitude: -25.4, longitude: -51.4, accuracy: 6 },
      } as GeolocationPosition),
    );
    picker.locateUser();
    expect(selected).toHaveBeenCalledWith({ latitude: -25.4, longitude: -51.4 });
    expect(picker.selectedLat()).toBe(-25.4);
    expect(picker.locating()).toBeFalse();
    expect(picker.mapVisible()).toBeFalse();
    expect(geolocation.calls.mostRecent().args[2]).toEqual({
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
  });

  it('reports denied permission and allows another attempt', () => {
    const picker = TestBed.createComponent(LocationPickerComponent).componentInstance;
    const locating = jasmine.createSpy('locating');
    picker.locatingChange.subscribe(locating);
    geolocation.and.callFake((_success: PositionCallback, error: PositionErrorCallback) =>
      error({ code: 1 } as GeolocationPositionError),
    );
    picker.locateUser();
    expect(picker.locationError()).toContain('Permita');
    expect(picker.locating()).toBeFalse();
    expect(locating.calls.allArgs()).toEqual([[true], [false]]);
    picker.locateUser();
    expect(geolocation).toHaveBeenCalledTimes(2);
  });

  it('bounds a stalled permission request and ignores late results', fakeAsync(() => {
    const picker = TestBed.createComponent(LocationPickerComponent).componentInstance;
    const selected = jasmine.createSpy('selected');
    const locating = jasmine.createSpy('locating');
    picker.locationSelected.subscribe(selected);
    picker.locatingChange.subscribe(locating);
    picker.locateUser();
    const callback: PositionCallback = geolocation.calls.mostRecent().args[0];
    tick(25000);
    expect(picker.locating()).toBeFalse();
    expect(locating.calls.allArgs()).toEqual([[true], [false]]);
    expect(picker.locationError()).toContain('demorou');
    callback({ coords: { latitude: 1, longitude: 2, accuracy: 3 } } as GeolocationPosition);
    expect(selected).not.toHaveBeenCalled();
  }));

  it('ignores position callbacks after navigating away', () => {
    const fixture = TestBed.createComponent(LocationPickerComponent);
    const selected = jasmine.createSpy('selected');
    fixture.componentInstance.locationSelected.subscribe(selected);
    fixture.componentInstance.locateUser();
    const callback: PositionCallback = geolocation.calls.mostRecent().args[0];
    fixture.destroy();
    callback({ coords: { latitude: 1, longitude: 2, accuracy: 3 } } as GeolocationPosition);
    expect(selected).not.toHaveBeenCalled();
  });

  it('does not submit the enclosing upload form when GPS is requested', () => {
    const fixture = TestBed.createComponent(FormHost);
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.locate-btn');
    button.click();
    expect(button.type).toBe('button');
    expect(fixture.componentInstance.submissions).toBe(0);
  });

  it('does not clear an existing point while manual coordinates are incomplete', () => {
    const picker = TestBed.createComponent(LocationPickerComponent).componentInstance;
    picker.latitude = -25.4;
    picker.longitude = -51.4;
    picker.ngOnChanges({});
    picker.manualLat = null;
    picker.onManualCoordChange();
    expect(picker.selectedLat()).toBe(-25.4);
    expect(picker.selectedLng()).toBe(-51.4);
  });
});
