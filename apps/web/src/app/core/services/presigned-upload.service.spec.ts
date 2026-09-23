import { TestBed } from '@angular/core/testing';
import { PresignedUploadService } from './presigned-upload.service';

describe('PresignedUploadService', () => {
  let service: PresignedUploadService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PresignedUploadService],
    });
    service = TestBed.inject(PresignedUploadService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('uploads using fetch when onProgress is omitted', async () => {
    spyOn(window, 'fetch').and.resolveTo(new Response(null, { status: 200 }));
    const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });

    const result = await service.putFile('https://example.com/upload', file, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
    });

    expect(result.ok).toBeTrue();
    expect(result.status).toBe(200);
    expect(window.fetch).toHaveBeenCalledWith(
      'https://example.com/upload',
      jasmine.objectContaining({
        method: 'PUT',
        body: file,
      }),
    );
  });
});
