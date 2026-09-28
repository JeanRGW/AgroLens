import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  signal,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import * as L from 'leaflet';

// Default: Guarapuava, PR
export const DEFAULT_LATITUDE = -25.3905;
export const DEFAULT_LONGITUDE = -51.4541;

@Component({
  selector: 'app-location-picker',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <div class="location-picker">
      <div class="location-picker__toolbar">
        <button
          mat-stroked-button
          type="button"
          class="locate-btn"
          (click)="locateUser()"
          [disabled]="locating()"
        >
          <mat-icon>{{ locating() ? 'hourglass_empty' : 'my_location' }}</mat-icon>
          {{ locating() ? 'Localizando...' : 'Minha localização' }}
        </button>

        @if (selectedLat() !== null && selectedLng() !== null) {
          <span class="coordinates">
            {{ selectedLat()!.toFixed(6) }}, {{ selectedLng()!.toFixed(6) }}
          </span>
        }
      </div>

      @if (accuracy() !== null) {
        <span class="location-picker__hint"
          >Precisão informada pelo dispositivo: {{ accuracy()!.toFixed(0) }} m</span
        >
      }
      @if (locationError()) {
        <p class="location-picker__error" role="alert">{{ locationError() }}</p>
      }
      <button
        mat-button
        type="button"
        (click)="toggleMap()"
        [disabled]="!online()"
        [attr.aria-expanded]="mapVisible()"
      >
        <mat-icon>map</mat-icon>{{ mapVisible() ? 'Ocultar mapa' : 'Mostrar mapa (opcional)' }}
      </button>
      @if (!online()) {
        <p class="location-picker__hint">
          Mapa indisponível offline. Use Minha localização para obter o GPS.
        </p>
      }

      <div
        #mapContainer
        class="location-picker__map"
        [hidden]="!mapVisible()"
        [style.height]="height"
      ></div>

      <button
        mat-button
        type="button"
        class="manual-toggle"
        [attr.aria-expanded]="showManualCoordinates()"
        (click)="toggleManualCoordinates()"
      >
        <mat-icon>edit_location_alt</mat-icon>
        {{
          showManualCoordinates()
            ? 'Ocultar coordenadas manuais'
            : 'Informar coordenadas manualmente'
        }}
      </button>

      @if (showManualCoordinates()) {
        <div class="location-picker__manual">
          <mat-form-field appearance="outline" class="coord-field">
            <mat-label>Latitude</mat-label>
            <input
              matInput
              type="number"
              step="any"
              [(ngModel)]="manualLat"
              name="manualLat"
              placeholder="-25.3905"
              (ngModelChange)="onManualCoordChange()"
            />
          </mat-form-field>

          <mat-form-field appearance="outline" class="coord-field">
            <mat-label>Longitude</mat-label>
            <input
              matInput
              type="number"
              step="any"
              [(ngModel)]="manualLng"
              name="manualLng"
              placeholder="-51.4541"
              (ngModelChange)="onManualCoordChange()"
            />
          </mat-form-field>
        </div>
      }

      <p class="location-picker__hint">
        Use o GPS, clique no mapa ou insira coordenadas manualmente.
      </p>
    </div>
  `,
  styles: `
    .location-picker {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
    }

    .location-picker__toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;

      .locate-btn mat-icon {
        margin-right: 4px;
      }

      .coordinates {
        font-family: var(--agri-mono);
        font-size: 0.82rem;
        color: var(--agri-text-secondary);
        background: var(--agri-fill-subtle);
        padding: 4px 10px;
        border-radius: 6px;
      }
    }

    .location-picker__map {
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
      border-radius: 12px;
      border: 1px solid var(--agri-border);
    }

    .location-picker__manual {
      display: flex;
      gap: 0.75rem;

      .coord-field {
        flex: 1;
      }
    }

    .manual-toggle {
      align-self: flex-start;
      color: var(--agri-accent-dark);

      mat-icon {
        margin-right: 0.35rem;
      }
    }

    .location-picker__hint {
      margin: 0;
      font-size: 0.8rem;
      color: var(--agri-text-muted);
      text-align: center;
    }
    .location-picker__error {
      margin: 0;
      color: #b3261e;
      font-size: 0.85rem;
    }

    @media (max-width: 480px) {
      .location-picker__manual {
        flex-direction: column;
      }
    }
  `,
})
export class LocationPickerComponent implements AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('mapContainer') mapContainer!: ElementRef<HTMLDivElement>;

  @Input() latitude: number | null = null;
  @Input() longitude: number | null = null;
  @Input() height = '400px';
  @Input() initialZoom = 10;

  @Output() locationSelected = new EventEmitter<{
    latitude: number;
    longitude: number;
  }>();
  @Output() locatingChange = new EventEmitter<boolean>();

  private map: L.Map | null = null;
  private marker: L.CircleMarker | null = null;
  private locationTimer: ReturnType<typeof setTimeout> | null = null;
  private locationRequest = 0;
  private destroyed = false;

  private initTimerId: ReturnType<typeof setTimeout> | null = null;
  private invalidateTimerId: ReturnType<typeof setTimeout> | null = null;

  readonly selectedLat = signal<number | null>(null);
  readonly selectedLng = signal<number | null>(null);
  readonly locating = signal(false);
  readonly showManualCoordinates = signal(false);
  readonly accuracy = signal<number | null>(null);
  readonly locationError = signal('');
  readonly online = signal(navigator.onLine);
  readonly mapVisible = signal(navigator.onLine);
  private readonly updateOnline = () => {
    this.online.set(navigator.onLine);
    if (!navigator.onLine) this.mapVisible.set(false);
  };

  manualLat: number | null = null;
  manualLng: number | null = null;

  toggleManualCoordinates(): void {
    this.showManualCoordinates.update((shown) => !shown);
  }

  ngAfterViewInit(): void {
    window.addEventListener('online', this.updateOnline);
    window.addEventListener('offline', this.updateOnline);
    this.initTimerId = setTimeout(() => this.initMap(), 100);
  }

  toggleMap(): void {
    this.mapVisible.update((visible) => !visible);
    if (this.mapVisible()) this.initTimerId = setTimeout(() => this.initMap(), 0);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.locationRequest++;
    if (this.locating()) {
      this.locating.set(false);
      this.locatingChange.emit(false);
    }
    if (this.locationTimer) clearTimeout(this.locationTimer);
    window.removeEventListener('online', this.updateOnline);
    window.removeEventListener('offline', this.updateOnline);
    if (this.initTimerId !== null) {
      clearTimeout(this.initTimerId);
    }
    if (this.invalidateTimerId !== null) {
      clearTimeout(this.invalidateTimerId);
    }
    this.map?.remove();
    this.map = null;
  }

  ngOnChanges(_changes: SimpleChanges): void {
    const lat = this.latitude;
    const lng = this.longitude;

    if (lat != null && lng != null) {
      this.manualLat = lat;
      this.manualLng = lng;
      if (this.selectedLat() !== lat || this.selectedLng() !== lng) {
        this.setMarker(lat, lng);
        this.map?.setView([lat, lng], 14);
      }
    } else {
      this.manualLat = null;
      this.manualLng = null;
      if (this.marker) {
        this.marker.remove();
        this.marker = null;
        this.selectedLat.set(null);
        this.selectedLng.set(null);
      }
      this.selectedLat.set(null);
      this.selectedLng.set(null);
    }
  }

  onManualCoordChange(): void {
    this.accuracy.set(null);
    if (validCoordinates(this.manualLat, this.manualLng)) {
      this.locationError.set('');
      this.setMarker(this.manualLat!, this.manualLng!);
      this.map?.setView([this.manualLat!, this.manualLng!], 14);
      this.locationSelected.emit({
        latitude: this.manualLat!,
        longitude: this.manualLng!,
      });
    } else {
      this.locationError.set('Informe latitude entre -90 e 90 e longitude entre -180 e 180.');
    }
  }

  private initMap(): void {
    if (!this.mapVisible() || this.destroyed) return;
    if (this.map) {
      this.map.invalidateSize();
      return;
    }
    const lat = this.selectedLat() ?? this.latitude ?? DEFAULT_LATITUDE;
    const lng = this.selectedLng() ?? this.longitude ?? DEFAULT_LONGITUDE;
    const container = this.mapContainer?.nativeElement;

    if (!container) return;

    container.style.height = this.height;

    this.map = L.map(container, {
      center: [lat, lng],
      zoom: this.latitude != null ? 14 : this.initialZoom,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19,
    }).addTo(this.map);

    if (this.selectedLat() != null && this.selectedLng() != null) {
      this.setMarker(this.selectedLat()!, this.selectedLng()!);
    }

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.accuracy.set(null);
      this.locationError.set('');
      this.setMarker(e.latlng.lat, e.latlng.lng);
      this.manualLat = Math.round(e.latlng.lat * 1e6) / 1e6;
      this.manualLng = Math.round(e.latlng.lng * 1e6) / 1e6;
      this.locationSelected.emit({
        latitude: e.latlng.lat,
        longitude: e.latlng.lng,
      });
    });

    this.invalidateTimerId = setTimeout(() => this.map?.invalidateSize(), 200);
  }

  private setMarker(lat: number, lng: number): void {
    this.selectedLat.set(lat);
    this.selectedLng.set(lng);
    if (!this.map) return;
    if (this.marker) {
      this.marker.setLatLng([lat, lng]);
    } else {
      this.marker = L.circleMarker([lat, lng], {
        radius: 8,
        color: '#fff',
        weight: 3,
        fillColor: '#264b2f',
        fillOpacity: 1,
      }).addTo(this.map);
    }
  }

  locateUser(): void {
    if (!navigator.geolocation) {
      this.locationError.set(
        'GPS indisponível. Abra o aplicativo em HTTPS e habilite a localização do dispositivo.',
      );
      return;
    }
    if (this.locating()) return;
    const request = ++this.locationRequest;
    const active = () => !this.destroyed && request === this.locationRequest;
    const fail = (message: string) => {
      if (!active()) return;
      this.locationRequest++;
      if (this.locationTimer) clearTimeout(this.locationTimer);
      this.locationError.set(message);
      this.locating.set(false);
      this.locatingChange.emit(false);
    };
    this.locationError.set('');
    this.locating.set(true);
    this.locatingChange.emit(true);
    this.locationTimer = setTimeout(
      () => fail('O GPS demorou demais. Vá para uma área aberta e tente novamente.'),
      25000,
    );
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!active()) return;
        const { latitude, longitude } = position.coords;
        if (!validCoordinates(latitude, longitude)) {
          fail('O dispositivo retornou uma localização inválida. Tente novamente.');
          return;
        }
        if (this.locationTimer) clearTimeout(this.locationTimer);
        this.accuracy.set(position.coords.accuracy);
        this.manualLat = Math.round(latitude * 1e6) / 1e6;
        this.manualLng = Math.round(longitude * 1e6) / 1e6;
        this.locationSelected.emit({ latitude, longitude });
        this.setMarker(latitude, longitude);
        this.map?.setView([latitude, longitude], 14);
        this.locating.set(false);
        this.locatingChange.emit(false);
      },
      (error) => {
        fail(
          error.code === 1
            ? 'Permita o acesso à localização nas configurações do navegador e do dispositivo e tente novamente.'
            : error.code === 3
              ? 'O GPS demorou demais. Vá para uma área aberta e tente novamente.'
              : 'Localização indisponível. Verifique se o GPS está ativado e tente novamente em uma área aberta.',
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }
}

function validCoordinates(lat: number | null, lng: number | null): boolean {
  return (
    lat !== null &&
    lng !== null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
