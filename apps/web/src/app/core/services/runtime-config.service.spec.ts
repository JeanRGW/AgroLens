import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { RuntimeConfigService } from './runtime-config.service';
import { environment } from '../../../environments/environment';

describe('RuntimeConfigService', () => {
  let service: RuntimeConfigService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RuntimeConfigService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    environment.apiBaseUrl = '/api';
    http.verify();
  });

  it('loads feature flags from the configured remote API', async () => {
    environment.apiBaseUrl = 'https://api.agrolens.rgw.app/api';
    const promise = service.load();
    http
      .expectOne('https://api.agrolens.rgw.app/api/health/config')
      .flush({ inferenceEnabled: true });
    await promise;
    expect(service.config().inferenceEnabled).toBeTrue();
  });

  it('loads the public runtime configuration', async () => {
    const promise = service.load();
    const request = http.expectOne('/api/health/config');
    expect(request.request.method).toBe('GET');
    request.flush({ inferenceEnabled: true });

    await promise;
    expect(service.config()).toEqual({ inferenceEnabled: true });
  });

  it('fails closed on malformed runtime configuration', async () => {
    const promise = service.load();
    http.expectOne('/api/health/config').flush({ inferenceEnabled: 'yes' });

    await promise;
    expect(service.config().inferenceEnabled).toBe(false);
  });

  it('fails closed without blocking application startup when unavailable', async () => {
    const promise = service.load();
    http.expectOne('/api/health/config').error(new ProgressEvent('error'));

    await promise;
    expect(service.config().inferenceEnabled).toBe(false);
  });
});
