import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { parse, sidecar } from 'exifr';
import {
  IMAGE_METADATA_READ_OPTIONS,
  normalizeImageLocation,
  type ImageLocation,
} from '@agrolens/contracts';

export const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];
export const CONTENT_TYPE_TO_EXTENSION: Record<AllowedContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
export interface ImageProbeResult {
  contentType: AllowedContentType;
  width: number;
  height: number;
  format: string;
  location?: ImageLocation;
}
export interface PreviewResult {
  buffer: Buffer;
  contentType: 'image/jpeg';
  width: number;
  height: number;
}

@Injectable()
export class ImageProcessingService {
  private readonly maxInputPixels: number;
  constructor(configService?: ConfigService) {
    this.maxInputPixels =
      configService?.get<number>('IMAGE_MAX_INPUT_PIXELS', 120_000_000) ?? 120_000_000;
  }
  async probeImage(buffer: Buffer): Promise<ImageProbeResult> {
    let metadata: Awaited<ReturnType<typeof sharp.prototype.metadata>>;
    try {
      metadata = await sharp(buffer, { limitInputPixels: this.maxInputPixels }).metadata();
    } catch {
      throw new BadRequestException('Invalid or unsupported image');
    }
    const format = metadata.format;
    const contentType =
      format === 'jpeg'
        ? 'image/jpeg'
        : format === 'png'
          ? 'image/png'
          : format === 'webp'
            ? 'image/webp'
            : null;
    if (!contentType)
      throw new BadRequestException('Use JPEG, PNG or WebP. TIFF and DNG are not supported.');
    const pixelLimit = this.pixelLimit(contentType);
    if (
      !metadata.width ||
      !metadata.height ||
      pixelLimit <= 0 ||
      metadata.width * metadata.height > pixelLimit
    ) {
      throw new BadRequestException(
        `Image exceeds maximum pixel count of ${pixelLimit} or has invalid dimensions`,
      );
    }
    const tags: Record<string, unknown> = {};
    let unreadable = false;
    for (const [kind, bytes] of [
      ['exif', metadata.exif],
      ['xmp', metadata.xmp],
    ] as const) {
      if (!bytes) continue;
      try {
        // JPEG/WebP EXIF may include the APP1 prefix; PNG exposes the TIFF payload directly.
        const parsed =
          kind === 'exif'
            ? await parse(
                bytes.subarray(bytes.subarray(0, 6).equals(Buffer.from('Exif\0\0')) ? 6 : 0),
                { ...IMAGE_METADATA_READ_OPTIONS, xmp: false },
              )
            : await sidecar(new Uint8Array(bytes), { mergeOutput: false }, 'xmp');
        Object.assign(tags, parsed);
        unreadable ||= Array.isArray(parsed?.errors) && parsed.errors.length > 0;
      } catch {
        unreadable = true;
      }
    }
    const location = normalizeImageLocation(tags);
    if (unreadable) location.warnings.push('metadata-unreadable');
    const model = String((tags.ifd0 as Record<string, unknown> | undefined)?.Model ?? '');
    if (/^(?:M4T|M3T|M3TD|M30T|ZH20T|ZH30T)$/i.test(model) && hasJpegApp4(buffer)) {
      throw new BadRequestException(
        'DJI radiometric R-JPEG is not supported. Use a visible-light photograph.',
      );
    }
    return {
      contentType,
      width: metadata.width,
      height: metadata.height,
      format: format!,
      location,
    };
  }
  private pixelLimit(contentType: AllowedContentType): number {
    return contentType === 'image/jpeg'
      ? this.maxInputPixels
      : Math.min(this.maxInputPixels, 40_000_000);
  }

  async generatePreview(buffer: Buffer, contentType?: AllowedContentType): Promise<PreviewResult> {
    if (this.maxInputPixels <= 0) throw new BadRequestException('Invalid pixel limit');
    const detectedType = contentType ?? (await this.probeImage(buffer)).contentType;
    const result = await sharp(buffer, { limitInputPixels: this.pixelLimit(detectedType) })
      .timeout({ seconds: 30 })
      .autoOrient()
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return {
      buffer: result.data,
      contentType: 'image/jpeg',
      width: result.info.width,
      height: result.info.height,
    };
  }
}
function hasJpegApp4(buffer: Buffer): boolean {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return false;
  let offset = 2;
  while (offset + 4 <= buffer.length && buffer[offset] === 0xff) {
    const marker = buffer[offset + 1];
    if (marker === 0xda || marker === 0xd9) return false;
    if (marker === 0xe4) return true;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return false;
    offset += length + 2;
  }
  return false;
}
