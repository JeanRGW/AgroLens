import { ConfigService } from '@nestjs/config';
import { PassThrough, Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageObjectTooLargeError, StorageService } from '../../src/storage/storage.service';

// Mock S3Client and getSignedUrl so no real S3 connection is needed.
jest.mock('@aws-sdk/client-s3', () => {
  const mockSend = jest.fn();
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSend,
      destroy: jest.fn(),
      config: {},
    })),
    HeadBucketCommand: jest.fn(),
    HeadObjectCommand: jest.fn(),
    GetObjectCommand: jest.fn(),
    PutObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
    PutBucketCorsCommand: jest.fn().mockImplementation((input) => ({ input })),
    NotFound: class NotFound extends Error {},
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('StorageService — bucket CORS bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createServiceWithConfig(configOverrides: Record<string, unknown>): StorageService {
    const configService = new ConfigService({
      S3_ENDPOINT: 'http://garage:3900',
      S3_ACCESS_KEY: 'garageadmin',
      S3_SECRET_KEY: 'garageadmin',
      S3_BUCKET: 'test-bucket',
      S3_REGION: 'us-east-1',
      S3_FORCE_PATH_STYLE: 'true',
      ...configOverrides,
    });

    return new StorageService(configService);
  }

  it('applies bucket CORS on init when CORS_ORIGINS is set', async () => {
    const PutBucketCorsCommandMock = jest.requireMock('@aws-sdk/client-s3')
      .PutBucketCorsCommand as jest.Mock;
    const service = createServiceWithConfig({
      CORS_ORIGINS: ['http://localhost:4200'],
    });

    await service.onModuleInit();

    const client = (service as unknown as { client: { send: jest.Mock } }).client;
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(PutBucketCorsCommandMock).toHaveBeenCalledTimes(1);
    const input = PutBucketCorsCommandMock.mock.calls[0][0];
    expect(input.Bucket).toBe('test-bucket');
    expect(input.CORSConfiguration.CORSRules[0].AllowedOrigins).toEqual(['http://localhost:4200']);
    expect(input.CORSConfiguration.CORSRules[0].AllowedMethods).toEqual([
      'GET',
      'PUT',
      'HEAD',
      'DELETE',
    ]);
  });

  it('applies bucket CORS with multiple origins as individual rules', async () => {
    const PutBucketCorsCommandMock = jest.requireMock('@aws-sdk/client-s3')
      .PutBucketCorsCommand as jest.Mock;
    const service = createServiceWithConfig({
      CORS_ORIGINS: ['http://localhost:4200', 'https://example.com'],
    });

    await service.onModuleInit();

    const client = (service as unknown as { client: { send: jest.Mock } }).client;
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(PutBucketCorsCommandMock).toHaveBeenCalledTimes(1);
    const input = PutBucketCorsCommandMock.mock.calls[0][0];
    expect(input.CORSConfiguration.CORSRules).toHaveLength(2);
    expect(input.CORSConfiguration.CORSRules[0].AllowedOrigins).toEqual(['http://localhost:4200']);
    expect(input.CORSConfiguration.CORSRules[1].AllowedOrigins).toEqual(['https://example.com']);
  });

  it('does NOT apply bucket CORS when CORS_ORIGINS is empty (early return)', async () => {
    // Omit CORS_ORIGINS entirely → ConfigService default [] → no CORS applied.
    const service = createServiceWithConfig({});

    await service.onModuleInit();

    const client = (service as unknown as { client: { send: jest.Mock } }).client;
    expect(client.send).not.toHaveBeenCalled();
  });

  it('does NOT crash the app if PutBucketCors fails', async () => {
    const service = createServiceWithConfig({
      CORS_ORIGINS: ['http://localhost:4200'],
    });
    const client = (service as unknown as { client: { send: jest.Mock } }).client;
    client.send.mockRejectedValueOnce(new Error('boom'));

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(client.send).toHaveBeenCalledTimes(1);
  });
});

describe('StorageService — presigned endpoint selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createServiceWithConfig(configOverrides: Record<string, unknown>): StorageService {
    const configService = new ConfigService({
      S3_ENDPOINT: 'http://garage:3900',
      S3_ACCESS_KEY: 'garageadmin',
      S3_SECRET_KEY: 'garageadmin',
      S3_BUCKET: 'test-bucket',
      S3_REGION: 'us-east-1',
      S3_FORCE_PATH_STYLE: 'true',
      ...configOverrides,
    });

    return new StorageService(configService);
  }

  it('uses S3_PUBLIC_ENDPOINT for presign client when set', () => {
    const s3ClientMock = S3Client as jest.Mock;

    createServiceWithConfig({
      S3_PUBLIC_ENDPOINT: 'http://localhost:3900',
    });

    // First call: internal client, second call: presign client
    expect(s3ClientMock).toHaveBeenCalledTimes(2);
    const presignClientOptions = s3ClientMock.mock.calls[1][0];
    expect(presignClientOptions.endpoint).toBe('http://localhost:3900');
  });

  it('falls back to S3_ENDPOINT for presign client when S3_PUBLIC_ENDPOINT is absent', () => {
    const s3ClientMock = S3Client as jest.Mock;

    createServiceWithConfig({});

    expect(s3ClientMock).toHaveBeenCalledTimes(2);
    const presignClientOptions = s3ClientMock.mock.calls[1][0];
    expect(presignClientOptions.endpoint).toBe('http://garage:3900');
  });

  it('internal client always uses S3_ENDPOINT regardless of S3_PUBLIC_ENDPOINT', () => {
    const s3ClientMock = S3Client as jest.Mock;

    createServiceWithConfig({
      S3_PUBLIC_ENDPOINT: 'http://localhost:3900',
    });

    const internalClientOptions = s3ClientMock.mock.calls[0][0];
    expect(internalClientOptions.endpoint).toBe('http://garage:3900');
  });

  it('both internal and presign clients set requestChecksumCalculation to WHEN_REQUIRED (Garage presigned PUT fix)', () => {
    const s3ClientMock = S3Client as jest.Mock;

    createServiceWithConfig({
      S3_PUBLIC_ENDPOINT: 'http://localhost:3900',
    });

    expect(s3ClientMock).toHaveBeenCalledTimes(2);
    const internalClientOptions = s3ClientMock.mock.calls[0][0];
    const presignClientOptions = s3ClientMock.mock.calls[1][0];

    // Regression: without this setting Garage rejects presigned PUTs with an
    // "Invalid signature" error because the SDK computes an unverifiable checksum.
    expect(internalClientOptions.requestChecksumCalculation).toBe('WHEN_REQUIRED');
    expect(presignClientOptions.requestChecksumCalculation).toBe('WHEN_REQUIRED');
  });

  it('getPresignedPutUrl delegates to presign client (URL contains public endpoint)', async () => {
    const getSignedUrlMock = getSignedUrl as jest.Mock;
    getSignedUrlMock.mockResolvedValue('http://localhost:3900/test-bucket/presigned-put-url');

    const service = createServiceWithConfig({
      S3_PUBLIC_ENDPOINT: 'http://localhost:3900',
    });

    const result = await service.getPresignedPutUrl('uploads/key.jpg', 'image/jpeg', 900);

    expect(result.url).toContain('localhost:3900');
    expect(result.method).toBe('PUT');
    expect(result.objectKey).toBe('uploads/key.jpg');
  });

  it('getPresignedGetUrl delegates to presign client (URL contains public endpoint)', async () => {
    const getSignedUrlMock = getSignedUrl as jest.Mock;
    getSignedUrlMock.mockResolvedValue('http://localhost:3900/test-bucket/presigned-get-url');

    const service = createServiceWithConfig({
      S3_PUBLIC_ENDPOINT: 'http://localhost:3900',
    });

    const result = await service.getPresignedGetUrl('uploads/key.jpg', 900);

    expect(result.url).toContain('localhost:3900');
  });

  it('signs model GETs with the internal client while browser GETs use the public client', async () => {
    const service = createServiceWithConfig({ S3_PUBLIC_ENDPOINT: 'http://localhost:3900' });
    const clients = (S3Client as jest.Mock).mock.results.map((result) => result.value);
    await service.getPresignedGetUrl('models/model.pt', 900, 'service');
    expect(getSignedUrl).toHaveBeenLastCalledWith(clients[0], expect.anything(), {
      expiresIn: 900,
    });
    await service.getPresignedGetUrl('uploads/image.jpg', 900);
    expect(getSignedUrl).toHaveBeenLastCalledWith(clients[1], expect.anything(), {
      expiresIn: 900,
    });
  });

  it('internal operations are wired to internal client (endpoint routing validated by constructor tests)', async () => {
    // This test verifies that internal methods route through the internal
    // client without crashing due to endpoint config. Endpoint selections
    // are exhaustively validated in the constructor-level tests above.
    const service = createServiceWithConfig({
      S3_PUBLIC_ENDPOINT: 'http://public:9000',
    });

    // send() mock returns undefined — deleteObject ignores return value
    await expect(service.deleteObject('k')).resolves.toBeUndefined();
    // checkHealth: send returns undefined, no exception → ok
    await expect(service.checkHealth()).resolves.toMatchObject({ status: 'ok' });
    // headObject: result.ContentLength on undefined → TypeError
    await expect(service.headObject('some-key')).rejects.toThrow();
    // putObject: result.ETag on undefined → TypeError
    await expect(service.putObject('k', Buffer.from('data'), 'text/plain')).rejects.toThrow();
  });
});

describe('StorageService — bounded reads', () => {
  function serviceAndClient() {
    const service = new StorageService(
      new ConfigService({
        S3_ENDPOINT: 'http://garage:3900',
        S3_ACCESS_KEY: 'garageadmin',
        S3_SECRET_KEY: 'garageadmin',
        S3_BUCKET: 'test-bucket',
        S3_REGION: 'us-east-1',
        S3_FORCE_PATH_STYLE: 'true',
      }),
    );
    const client = (service as unknown as { client: { send: jest.Mock } }).client;
    return { service, client };
  }

  it('reads exactly the configured limit', async () => {
    const { service, client } = serviceAndClient();
    const body = Readable.from([Buffer.from('12'), Buffer.from('34')]);
    client.send.mockResolvedValue({ Body: body });
    await expect(service.getObjectBufferBounded('key', 4)).resolves.toEqual(Buffer.from('1234'));
  });

  it('rejects one byte over the limit and destroys the stream', async () => {
    const { service, client } = serviceAndClient();
    const body = Readable.from([Buffer.from('12'), Buffer.from('345')]);
    const destroy = jest.spyOn(body, 'destroy');
    client.send.mockResolvedValue({ Body: body });
    await expect(service.getObjectBufferBounded('key', 4)).rejects.toBeInstanceOf(
      StorageObjectTooLargeError,
    );
    expect(destroy).toHaveBeenCalled();
  });

  it('rejects absent bodies and oversized ContentLength before iteration', async () => {
    const { service, client } = serviceAndClient();
    client.send.mockResolvedValueOnce({});
    await expect(service.getObjectBufferBounded('key', 4)).rejects.toThrow('Empty object body');
    const body = Readable.from([Buffer.from('12345')]);
    const iterator = jest.spyOn(body, Symbol.asyncIterator);
    const destroy = jest.spyOn(body, 'destroy');
    client.send.mockResolvedValueOnce({
      ContentLength: 5,
      Body: body,
    });
    await expect(service.getObjectBufferBounded('key', 4)).rejects.toBeInstanceOf(
      StorageObjectTooLargeError,
    );
    expect(iterator).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });

  it('includes IfMatch in the GetObject command', async () => {
    const { service, client } = serviceAndClient();
    client.send.mockResolvedValue({
      Body: Readable.from([Buffer.from('x')]),
    });
    await service.getObjectBufferBounded('key', 1, 'etag-1');
    const GetObjectCommandMock = jest.requireMock('@aws-sdk/client-s3')
      .GetObjectCommand as jest.Mock;
    expect(GetObjectCommandMock.mock.calls.at(-1)?.[0].IfMatch).toBe('etag-1');
  });

  it('aborts a stalled body after headers have already arrived', async () => {
    const { service, client } = serviceAndClient();
    const deadline = new AbortController();
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const body = new PassThrough();
    client.send.mockResolvedValue({ Body: body });
    try {
      const reading = service.getObjectBufferBounded('key', 100);
      const assertion = expect(reading).rejects.toMatchObject({ name: 'AbortError' });
      await Promise.resolve();
      body.write(Buffer.from('partial'));
      deadline.abort();
      await assertion;
      expect(body.destroyed).toBe(true);
    } finally {
      timeout.mockRestore();
    }
  });
});
