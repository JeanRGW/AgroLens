import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  HeadBucketCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  PutBucketCorsCommand,
  NotFound,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { addAbortSignal, Readable } from 'node:stream';

const STORAGE_REQUEST_TIMEOUT_MS = 30_000;

export class StorageObjectTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Object exceeds maximum allowed size of ${maxBytes} bytes`);
    this.name = 'StorageObjectTooLargeError';
  }
}

export interface StorageHealthResult {
  status: 'ok' | 'error' | 'not_configured';
  message: string;
  endpoint?: string;
  bucket?: string;
}

export interface ObjectHeadResult {
  exists: boolean;
  contentLength?: number;
  contentType?: string;
  etag?: string;
}

export interface PresignedPutResult {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: Date;
  objectKey: string;
}

@Injectable()
export class StorageService implements OnApplicationShutdown, OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  /** S3Client used exclusively for generating presigned URLs. Uses
   *  S3_PUBLIC_ENDPOINT when configured, otherwise falls back to S3_ENDPOINT. */
  private readonly presignClient: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly publicEndpoint: string;
  private readonly corsOrigins: string[];

  constructor(private readonly configService: ConfigService) {
    this.endpoint = this.configService.getOrThrow<string>('S3_ENDPOINT');
    this.publicEndpoint = this.configService.get<string>('S3_PUBLIC_ENDPOINT') ?? this.endpoint;
    this.bucket = this.configService.getOrThrow<string>('S3_BUCKET');
    this.corsOrigins = this.configService.get<string[]>('CORS_ORIGINS', []);
    const region = this.configService.getOrThrow<string>('S3_REGION');
    const accessKeyId = this.configService.getOrThrow<string>('S3_ACCESS_KEY');
    const secretAccessKey = this.configService.getOrThrow<string>('S3_SECRET_KEY');
    const forcePathStyle = this.configService.get<boolean>('S3_FORCE_PATH_STYLE', true);

    const clientOptions = {
      region,
      endpoint: this.endpoint,
      forcePathStyle,
      requestHandler: {
        connectionTimeout: 5000,
        socketTimeout: STORAGE_REQUEST_TIMEOUT_MS,
        requestTimeout: STORAGE_REQUEST_TIMEOUT_MS,
        throwOnRequestTimeout: true,
      },
      // Garage (S3-compatible) rejects presigned PUTs when the SDK computes an
      // x-amz-checksum-* header that the server can't verify. Restrict checksum
      // calculation to cases the protocol actually requires (WHEN_REQUIRED).
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    };

    this.client = new S3Client(clientOptions);

    this.presignClient = new S3Client({
      ...clientOptions,
      endpoint: this.publicEndpoint,
    });
  }

  onApplicationShutdown() {
    this.client.destroy();
    this.presignClient.destroy();
  }

  // ── Bucket CORS bootstrap ────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    await this.ensureBucketCors();
  }

  /**
   * Apply bucket CORS on boot so the Angular dev server (and any other web
   * origin in CORS_ORIGINS) can use presigned URLs cross-origin.
   */
  private async ensureBucketCors(): Promise<void> {
    // The Garage app key owns the bucket so it can configure CORS on startup.
    if (this.corsOrigins.length === 0) {
      this.logger.warn('CORS_ORIGINS is empty; skipping bucket CORS configuration.');
      return;
    }

    try {
      await this.client.send(
        new PutBucketCorsCommand({
          Bucket: this.bucket,
          CORSConfiguration: {
            CORSRules: this.corsOrigins.map((origin) => ({
              AllowedOrigins: [origin],
              AllowedHeaders: ['*'],
              AllowedMethods: ['GET', 'PUT', 'HEAD', 'DELETE'],
              ExposeHeaders: ['ETag', 'Content-Length'],
              MaxAgeSeconds: 3000,
            })),
          },
        }),
        { abortSignal: AbortSignal.timeout(STORAGE_REQUEST_TIMEOUT_MS) },
      );
      this.logger.log(`Applied bucket CORS for origins: ${this.corsOrigins.join(', ')}`);
    } catch (error: unknown) {
      // Bucket health (checkHealth) is the real readiness signal; CORS apply
      // failing must NOT crash the app on boot.
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Bucket CORS configuration failed: ${message}`);
    }
  }

  // ── Health ─────────────────────────────────────────────────────────

  /**
   * Check if the configured bucket is reachable.
   * Returns a health result without leaking credentials.
   */
  async checkHealth(): Promise<StorageHealthResult> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), {
        abortSignal: AbortSignal.timeout(STORAGE_REQUEST_TIMEOUT_MS),
      });
      return {
        status: 'ok',
        message: `Bucket "${this.bucket}" is accessible`,
        endpoint: this.endpoint,
        bucket: this.bucket,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Storage health check failed: ${message}`);
      return {
        status: 'error',
        message: 'Cannot reach configured object storage',
        endpoint: this.endpoint,
        bucket: this.bucket,
      };
    }
  }

  // ── Object operations ──────────────────────────────────────────────

  /**
   * Check if an object exists and return its metadata.
   * Returns { exists: false } if the object is not found.
   */
  async headObject(objectKey: string): Promise<ObjectHeadResult> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        }),
        { abortSignal: AbortSignal.timeout(STORAGE_REQUEST_TIMEOUT_MS) },
      );
      return {
        exists: true,
        contentLength: result.ContentLength,
        contentType: result.ContentType,
        etag: result.ETag,
      };
    } catch (error: unknown) {
      if (error instanceof NotFound || (error instanceof Error && error.name === 'NotFound')) {
        return { exists: false };
      }
      throw error;
    }
  }

  /** Read an untrusted object with a hard streamed byte limit and optional ETag seal. */
  async getObjectBufferBounded(
    objectKey: string,
    maxBytes: number,
    ifMatch?: string,
    abortSignal?: AbortSignal,
  ): Promise<Buffer> {
    const signal = AbortSignal.any([
      AbortSignal.timeout(STORAGE_REQUEST_TIMEOUT_MS),
      ...(abortSignal ? [abortSignal] : []),
    ]);
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ...(ifMatch ? { IfMatch: ifMatch } : {}),
      }),
      { abortSignal: signal },
    );
    if (!result.Body) throw new Error(`Empty object body for key: ${objectKey}`);
    // The SDK resolves on response headers. Keep the same deadline attached
    // through body consumption, including a body that stops producing bytes.
    const stream = addAbortSignal(signal, result.Body as Readable);
    if (result.ContentLength !== undefined && result.ContentLength > maxBytes) {
      stream.destroy();
      throw new StorageObjectTooLargeError(maxBytes);
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        total += chunk.byteLength;
        if (total > maxBytes) {
          stream.destroy();
          throw new StorageObjectTooLargeError(maxBytes);
        }
        chunks.push(chunk);
      }
    } catch (error) {
      stream.destroy();
      throw error;
    }
    return Buffer.concat(chunks);
  }

  /**
   * Upload an object to S3.
   */
  async putObject(
    objectKey: string,
    body: Buffer,
    contentType: string,
  ): Promise<{ etag: string | undefined }> {
    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
      }),
      { abortSignal: AbortSignal.timeout(STORAGE_REQUEST_TIMEOUT_MS) },
    );
    return { etag: result.ETag };
  }

  /**
   * Generate a presigned PUT URL for direct client upload.
   * The client can use this URL to upload directly to S3 without proxying through the API.
   */
  async getPresignedPutUrl(
    objectKey: string,
    contentType: string,
    expiresIn: number,
  ): Promise<PresignedPutResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: contentType,
    });

    const url = await getSignedUrl(this.presignClient, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return {
      url,
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      expiresAt,
      objectKey,
    };
  }

  // ── Presigned GET (download) ────────────────────────────────────────

  /**
   * Sign against the client-visible endpoint by default. Internal services use
   * the server endpoint so downloads stay on the storage network.
   */
  async getPresignedGetUrl(
    objectKey: string,
    expiresIn: number,
    audience: 'client' | 'service' = 'client',
  ): Promise<{ url: string; expiresAt: Date }> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    });
    const url = await getSignedUrl(
      audience === 'service' ? this.client : this.presignClient,
      command,
      { expiresIn },
    );
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    return { url, expiresAt };
  }

  /**
   * Delete an object from S3.
   * Silently succeeds if the object does not exist.
   */
  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
      { abortSignal: AbortSignal.timeout(STORAGE_REQUEST_TIMEOUT_MS) },
    );
  }
}
