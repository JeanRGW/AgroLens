import { inject, Injectable } from '@angular/core';

import { CropTypeRecord, EstadioRecord, PropertyRecord, TalhaoRecord } from '@agrolens/contracts';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class CatalogsService {
  private readonly api = inject(ApiService);

  listProperties(): Promise<PropertyRecord[]> {
    return this.api
      .getJson<{ properties: PropertyRecord[] }>('/properties', undefined, undefined, 10000)
      .then((response) => response.properties);
  }
  getProperty(id: string): Promise<PropertyRecord> {
    return this.api
      .getJson<{ property: PropertyRecord }>(`/properties/${id}`)
      .then((response) => response.property);
  }
  createProperty(
    data: Omit<PropertyRecord, 'id' | 'createdAt' | 'userId'>,
  ): Promise<PropertyRecord> {
    return this.api
      .postJson<{ property: PropertyRecord }>('/properties', data)
      .then((response) => response.property);
  }
  updateProperty(id: string, data: Partial<PropertyRecord>): Promise<PropertyRecord> {
    return this.api
      .patchJson<{ property: PropertyRecord }>(`/properties/${id}`, data)
      .then((response) => response.property);
  }
  deleteProperty(id: string): Promise<void> {
    return this.api.deleteJson<void>(`/properties/${id}`);
  }

  listTalhoes(propertyId?: string): Promise<TalhaoRecord[]> {
    return this.api
      .getJson<{ talhoes: TalhaoRecord[] }>(
        '/talhoes',
        propertyId ? { propertyId } : {},
        undefined,
        10000,
      )
      .then((response) => response.talhoes);
  }
  getTalhao(id: string): Promise<TalhaoRecord> {
    return this.api
      .getJson<{ talhao: TalhaoRecord }>(`/talhoes/${id}`)
      .then((response) => response.talhao);
  }
  createTalhao(data: Omit<TalhaoRecord, 'id' | 'createdAt' | 'userId'>): Promise<TalhaoRecord> {
    return this.api
      .postJson<{ talhao: TalhaoRecord }>('/talhoes', data)
      .then((response) => response.talhao);
  }
  updateTalhao(id: string, data: Partial<TalhaoRecord>): Promise<TalhaoRecord> {
    return this.api
      .patchJson<{ talhao: TalhaoRecord }>(`/talhoes/${id}`, data)
      .then((response) => response.talhao);
  }
  deleteTalhao(id: string): Promise<void> {
    return this.api.deleteJson<void>(`/talhoes/${id}`);
  }

  listCropTypes(): Promise<CropTypeRecord[]> {
    return this.api
      .getJson<{ cropTypes: CropTypeRecord[] }>('/crop-types', undefined, undefined, 10000)
      .then((response) => response.cropTypes);
  }
  getCropType(id: string): Promise<CropTypeRecord> {
    return this.api
      .getJson<{ cropType: CropTypeRecord }>(`/crop-types/${id}`)
      .then((response) => response.cropType);
  }
  createCropType(
    data: Omit<CropTypeRecord, 'id' | 'createdAt' | 'userId'>,
  ): Promise<CropTypeRecord> {
    return this.api
      .postJson<{ cropType: CropTypeRecord }>('/crop-types', data)
      .then((response) => response.cropType);
  }
  updateCropType(id: string, data: Partial<CropTypeRecord>): Promise<CropTypeRecord> {
    return this.api
      .patchJson<{ cropType: CropTypeRecord }>(`/crop-types/${id}`, data)
      .then((response) => response.cropType);
  }
  deleteCropType(id: string): Promise<void> {
    return this.api.deleteJson<void>(`/crop-types/${id}`);
  }

  listEstadios(cropTypeId?: string): Promise<EstadioRecord[]> {
    return this.api
      .getJson<{ estadios: EstadioRecord[] }>(
        '/estadios',
        cropTypeId ? { cropTypeId } : {},
        undefined,
        10000,
      )
      .then((response) => response.estadios);
  }
  getEstadio(id: string): Promise<EstadioRecord> {
    return this.api
      .getJson<{ estadio: EstadioRecord }>(`/estadios/${id}`)
      .then((response) => response.estadio);
  }
  createEstadio(data: Omit<EstadioRecord, 'id' | 'createdAt' | 'userId'>): Promise<EstadioRecord> {
    return this.api
      .postJson<{ estadio: EstadioRecord }>('/estadios', data)
      .then((response) => response.estadio);
  }
  updateEstadio(id: string, data: Partial<EstadioRecord>): Promise<EstadioRecord> {
    return this.api
      .patchJson<{ estadio: EstadioRecord }>(`/estadios/${id}`, data)
      .then((response) => response.estadio);
  }
  deleteEstadio(id: string): Promise<void> {
    return this.api.deleteJson<void>(`/estadios/${id}`);
  }
}
