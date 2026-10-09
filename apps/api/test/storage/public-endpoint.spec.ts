import { ConfigService } from '@nestjs/config';
import { StorageService } from '../../src/storage/storage.service';

describe('public S3 endpoints (real SDK signing, no network)', () => {
  it.each(['https://app.example.com:8443', 'https://s3.example.com'])(
    'preserves the origin and path for %s',
    async (endpoint) => {
      const service = new StorageService(
        new ConfigService({
          S3_ENDPOINT: 'http://garage:3900',
          S3_PUBLIC_ENDPOINT: endpoint,
          S3_ACCESS_KEY: 'test-key',
          S3_SECRET_KEY: 'test-secret',
          S3_BUCKET: 'agrolens',
          S3_REGION: 'garage',
          S3_FORCE_PATH_STYLE: true,
        }),
      );
      try {
        const put = await service.getPresignedPutUrl(
          'staging/uploads/image.jpg',
          'image/jpeg',
          900,
        );
        const get = await service.getPresignedGetUrl('staging/uploads/image.jpg', 900);
        for (const result of [put, get]) {
          const url = new URL(result.url);
          expect(url.origin).toBe(endpoint);
          expect(url.pathname).toBe('/agrolens/staging/uploads/image.jpg');
          expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('host');
          expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
        }
      } finally {
        service.onApplicationShutdown();
      }
    },
  );
});
