import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { ImageProcessingService } from '../../src/image-processing/image-processing.service';

describe('ImageProcessingService', () => {
  const service = new ImageProcessingService();
  const image = () => sharp({ create: { width: 4, height: 3, channels: 3, background: 'white' } });
  const xmp =
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:drone-dji="http://www.uav.com/drone-dji/1.0/" drone-dji:GpsLatitude="-25.4" drone-dji:GpsLongitude="-51.4"/></rdf:RDF></x:xmpmeta>';
  it.each(['jpeg', 'png', 'webp'] as const)(
    'reads DJI GPS from %s and preserves original bytes',
    async (format) => {
      const buffer = await image().withXmp(xmp).toFormat(format).toBuffer();
      const original = Buffer.from(buffer);
      const probe = await service.probeImage(buffer);
      expect(probe).toMatchObject({ contentType: `image/${format}`, format, width: 4, height: 3 });
      expect(probe.location?.coordinates).toEqual({
        latitude: -25.4,
        longitude: -51.4,
        source: 'dji-xmp',
      });
      const preview = await service.generatePreview(buffer);
      expect(preview).toMatchObject({ width: 4, height: 3, contentType: 'image/jpeg' });
      expect(buffer).toEqual(original);
    },
  );
  it.each(['jpeg', 'png', 'webp'] as const)(
    'reads EXIF hemisphere references from %s',
    async (format) => {
      const buffer = await image()
        .withExif({
          IFD3: {
            GPSLatitude: '25/1 24/1 0/1',
            GPSLatitudeRef: 'S',
            GPSLongitude: '51/1 24/1 0/1',
            GPSLongitudeRef: 'W',
          },
        })
        .toFormat(format)
        .toBuffer();
      expect((await service.probeImage(buffer)).location?.coordinates).toEqual({
        latitude: -25.4,
        longitude: -51.4,
        source: 'exif',
      });
    },
  );
  it('uses XMP even when the WebP EXIF segment is unreadable', async () => {
    const buffer = await image()
      .withExif({ IFD0: { Model: 'test' } })
      .withXmp(xmp)
      .webp()
      .toBuffer();
    const offset = buffer.indexOf(Buffer.from('Exif\0\0'));
    expect(offset).toBeGreaterThan(0);
    // Damage only the TIFF signature, leaving the WebP and XMP intact.
    buffer.fill(0, offset + 6, offset + 10);
    const probe = await service.probeImage(buffer);
    expect(probe.location?.coordinates?.source).toBe('dji-xmp');
    expect(probe.location?.warnings).toContain('metadata-unreadable');
  });
  it('allows images without location and tolerates invalid optional GPS', async () => {
    expect(
      (await service.probeImage(await image().jpeg().toBuffer())).location?.coordinates,
    ).toBeNull();
    const probe = await service.probeImage(
      await image().withXmp(xmp.replace('-25.4', 'invalid')).jpeg().toBuffer(),
    );
    expect(probe.location?.warnings).toContain('invalid-gps');
  });
  it('rejects TIFF containers instead of accepting DNG thumbnails', async () => {
    await expect(service.probeImage(await image().tiff().toBuffer())).rejects.toThrow(
      'TIFF and DNG',
    );
  });
  it('rejects recognizable DJI R-JPEG payloads', async () => {
    const jpeg = await image()
      .withExif({ IFD0: { Model: 'M4T' } })
      .jpeg()
      .toBuffer();
    // Visible-light photos from the same thermal-capable drone remain supported.
    expect((await service.probeImage(jpeg)).contentType).toBe('image/jpeg');
    const buffer = Buffer.concat([
      jpeg.subarray(0, 2),
      Buffer.from([255, 228, 0, 4, 0, 0]),
      jpeg.subarray(2),
    ]);
    await expect(service.probeImage(buffer)).rejects.toThrow('R-JPEG');
  });
  it.each([Buffer.alloc(0), Buffer.from('not an image'), Buffer.from([255, 216, 255, 224, 0, 1])])(
    'rejects invalid image bytes',
    async (buffer) => {
      await expect(service.probeImage(buffer)).rejects.toThrow(BadRequestException);
      await expect(service.generatePreview(buffer)).rejects.toThrow();
    },
  );
  it('honors configured pixel bounds', async () => {
    const config = { get: jest.fn().mockReturnValue(0) };
    const bounded = new ImageProcessingService(
      config as unknown as import('@nestjs/config').ConfigService,
    );
    const buffer = await image().png().toBuffer();
    await expect(bounded.probeImage(buffer)).rejects.toThrow();
    await expect(bounded.generatePreview(buffer)).rejects.toThrow();
    expect(config.get).toHaveBeenCalledWith('IMAGE_MAX_INPUT_PIXELS', 120000000);
  });
  it('fits previews within 1200 pixels', async () => {
    const buffer = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: 'white' },
    })
      .jpeg()
      .toBuffer();
    expect(await service.generatePreview(buffer)).toMatchObject({ width: 1200, height: 600 });
  });
});
