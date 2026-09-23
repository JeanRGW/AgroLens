import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';

/** Allowed image content types. Client content type is advisory only. */
export const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

/** Maps allowed content types to file extensions for object keys. */
export const CONTENT_TYPE_TO_EXTENSION: Record<AllowedContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Preview configuration */
const PREVIEW_MAX_WIDTH = 1200;
const PREVIEW_MAX_HEIGHT = 1200;
const PREVIEW_QUALITY = 80;
const PREVIEW_CONTENT_TYPE = 'image/jpeg';

export interface ImageProbeResult {
  /** Detected content type from actual bytes */
  contentType: AllowedContentType;
  width: number;
  height: number;
  format: string;
}

export interface PreviewResult {
  buffer: Buffer;
  contentType: typeof PREVIEW_CONTENT_TYPE;
  width: number;
  height: number;
}

@Injectable()
export class ImageProcessingService {
  private readonly maxInputPixels: number;

  constructor(configService?: ConfigService) {
    this.maxInputPixels =
      configService?.get<number>('IMAGE_MAX_INPUT_PIXELS', 40_000_000) ?? 40_000_000;
  }

  /**
   * Probe an image buffer to validate it is a supported image type
   * and extract its metadata.
   *
   * This decodes/inspects the actual bytes rather than trusting the
   * client-provided content type.
   *
   * @throws BadRequestException if the image is corrupt or unsupported
   */
  async probeImage(buffer: Buffer): Promise<ImageProbeResult> {
    let metadata: Awaited<ReturnType<typeof sharp.prototype.metadata>>;
    try {
      metadata = await sharp(buffer, { limitInputPixels: this.maxInputPixels }).metadata();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Failed to decode image: ${message}`);
    }

    if (!metadata.format) {
      throw new BadRequestException('Unable to determine image format');
    }

    const contentType = this.formatToContentType(metadata.format);
    if (!contentType) {
      throw new BadRequestException(
        `Unsupported image format: ${metadata.format}. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
      );
    }

    if (!metadata.width || !metadata.height) {
      throw new BadRequestException('Unable to determine image dimensions');
    }
    if (metadata.width * metadata.height > this.maxInputPixels || this.maxInputPixels <= 0) {
      throw new BadRequestException(`Image exceeds maximum pixel count of ${this.maxInputPixels}`);
    }

    return {
      contentType,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    };
  }

  /**
   * Generate a JPEG preview thumbnail from an image buffer.
   * Resizes to fit within PREVIEW_MAX_WIDTH x PREVIEW_MAX_HEIGHT
   * while preserving aspect ratio.
   */
  async generatePreview(buffer: Buffer): Promise<PreviewResult> {
    if (this.maxInputPixels <= 0) {
      throw new BadRequestException(`Image exceeds maximum pixel count of ${this.maxInputPixels}`);
    }
    const resized = await sharp(buffer, { limitInputPixels: this.maxInputPixels })
      .timeout({ seconds: 30 })
      .resize(PREVIEW_MAX_WIDTH, PREVIEW_MAX_HEIGHT, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: PREVIEW_QUALITY })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: resized.data,
      contentType: PREVIEW_CONTENT_TYPE,
      width: resized.info.width,
      height: resized.info.height,
    };
  }

  /**
   * Map sharp format string to our allowed content type.
   * Returns undefined for unsupported formats.
   */
  private formatToContentType(format: string): AllowedContentType | undefined {
    switch (format) {
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      default:
        return undefined;
    }
  }
}
