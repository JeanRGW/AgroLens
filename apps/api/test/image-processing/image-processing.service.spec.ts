import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { ImageProcessingService } from '../../src/image-processing/image-processing.service';

// 1x1 red PNG (base64-encoded minimal valid PNG)
const VALID_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

// 1x1 white JPEG (generated at module load time via sharp)
let VALID_JPEG_BUFFER: Buffer;
beforeAll(async () => {
  VALID_JPEG_BUFFER = await sharp({
    create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .jpeg()
    .toBuffer();
});

describe('ImageProcessingService', () => {
  let service: ImageProcessingService;

  beforeEach(() => {
    service = new ImageProcessingService();
  });

  it('passes configured limitInputPixels to Sharp for probe and preview', async () => {
    const config = { get: jest.fn().mockReturnValue(0) } as any;
    const configured = new ImageProcessingService(config);
    await expect(configured.probeImage(VALID_PNG_BUFFER)).rejects.toThrow(BadRequestException);
    await expect(configured.generatePreview(VALID_PNG_BUFFER)).rejects.toThrow();
    expect(config.get).toHaveBeenCalledWith('IMAGE_MAX_INPUT_PIXELS', 40000000);
  });

  describe('probeImage', () => {
    it('should reject empty buffer', async () => {
      await expect(service.probeImage(Buffer.alloc(0))).rejects.toThrow(BadRequestException);
    });

    it('should reject non-image buffer', async () => {
      const notAnImage = Buffer.from('this is not an image');
      await expect(service.probeImage(notAnImage)).rejects.toThrow(BadRequestException);
    });

    // For a real JPEG test, we'd need a minimal valid JPEG buffer
    // This tests that the service handles corrupt data gracefully
    it('should reject corrupt JPEG header', async () => {
      // Minimal invalid JPEG-like buffer
      const corruptJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01]);
      await expect(service.probeImage(corruptJpeg)).rejects.toThrow();
    });

    // ── Success path with valid small image buffers ─────────────────
    it('should successfully probe a valid PNG buffer', async () => {
      const result = await service.probeImage(VALID_PNG_BUFFER);
      expect(result.contentType).toBe('image/png');
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.format).toBe('png');
    });

    it('should successfully probe a valid JPEG buffer', async () => {
      const result = await service.probeImage(VALID_JPEG_BUFFER);
      expect(result.contentType).toBe('image/jpeg');
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.format).toBe('jpeg');
    });

    it('should return correct dimensions from probed image', async () => {
      const result = await service.probeImage(VALID_PNG_BUFFER);
      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
    });
  });

  describe('generatePreview', () => {
    it('should reject empty buffer', async () => {
      await expect(service.generatePreview(Buffer.alloc(0))).rejects.toThrow();
    });

    it('should reject non-image buffer', async () => {
      await expect(service.generatePreview(Buffer.from('not an image'))).rejects.toThrow();
    });

    // ── Success path ────────────────────────────────────────────────
    it('should generate a JPEG preview from valid PNG', async () => {
      const result = await service.generatePreview(VALID_PNG_BUFFER);
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.contentType).toBe('image/jpeg');
      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
    });

    it('should generate a JPEG preview from valid JPEG', async () => {
      const result = await service.generatePreview(VALID_JPEG_BUFFER);
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.contentType).toBe('image/jpeg');
    });

    it('should resize larger images to fit within max dimensions', async () => {
      // Create a 2000x1000 test image using sharp
      // This test verifies the resize behavior without external dependencies
      const largeBuffer = await sharp({
        create: {
          width: 2000,
          height: 1000,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .png()
        .toBuffer();

      const result = await service.generatePreview(largeBuffer);
      // Should be resized to fit within 1200x1200
      expect(result.width).toBeLessThanOrEqual(1200);
      expect(result.height).toBeLessThanOrEqual(1200);
      // Aspect ratio preserved: 2000:1000 = 2:1
      expect(result.width / result.height).toBeCloseTo(2, 0);
    });
  });
});
