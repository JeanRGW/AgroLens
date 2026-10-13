import { ImageMetadataService } from './image-metadata.service';

describe('ImageMetadataService', () => {
  const xml =
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:drone-dji="http://www.uav.com/drone-dji/1.0/" drone-dji:GpsLatitude="-25.4" drone-dji:GpsLongitude="-51.4"/></rdf:RDF></x:xmpmeta>';
  const encode = (value: string) => new TextEncoder().encode(value);
  function exifGps(): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(128);
    const view = new DataView(bytes.buffer);
    bytes.set([0x49, 0x49, 42, 0]);
    view.setUint32(4, 8, true);
    view.setUint16(8, 1, true);
    const entry = (offset: number, tag: number, type: number, count: number, value: number) => {
      view.setUint16(offset, tag, true);
      view.setUint16(offset + 2, type, true);
      view.setUint32(offset + 4, count, true);
      view.setUint32(offset + 8, value, true);
    };
    entry(10, 0x8825, 4, 1, 26);
    view.setUint16(26, 4, true);
    entry(28, 1, 2, 2, 83);
    entry(40, 2, 5, 3, 80);
    entry(52, 3, 2, 2, 87);
    entry(64, 4, 5, 3, 104);
    [25, 24, 0, 51, 24, 0].forEach((value, index) => {
      view.setUint32(80 + index * 8, value, true);
      view.setUint32(84 + index * 8, 1, true);
    });
    return bytes;
  }
  function chunk(
    type: string,
    payload: Uint8Array<ArrayBuffer>,
    webp: boolean,
  ): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(8 + payload.length + (webp ? payload.length % 2 : 4));
    bytes.set(encode(type), webp ? 0 : 4);
    new DataView(bytes.buffer).setUint32(webp ? 4 : 0, payload.length, webp);
    bytes.set(payload, 8);
    return bytes;
  }
  function file(format: string, ...chunks: Uint8Array<ArrayBuffer>[]): File {
    const header =
      format === 'png'
        ? new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
        : encode('RIFF\0\0\0\0WEBP');
    if (format === 'webp')
      new DataView(header.buffer).setUint32(
        4,
        4 + chunks.reduce((sum, bytes) => sum + bytes.length, 0),
        true,
      );
    return new File([header, ...chunks], `capture.${format}`, { type: `image/${format}` });
  }
  for (const format of ['jpeg', 'png', 'webp']) {
    for (const source of ['exif', 'dji-xmp']) {
      it(`reads ${source} GPS from ${format}`, async () => {
        const exif = new Uint8Array([...encode('Exif\0\0'), ...exifGps()]);
        let image: File;
        if (format === 'jpeg') {
          const payload = source === 'exif' ? exif : encode('http://ns.adobe.com/xap/1.0/\0' + xml);
          const length = payload.length + 2;
          image = new File(
            [
              new Uint8Array([255, 216, 255, 225, length >> 8, length & 255]),
              payload,
              new Uint8Array([255, 217]),
            ],
            'capture.jpg',
          );
        } else {
          const webp = format === 'webp';
          const payload =
            source === 'exif'
              ? webp
                ? exif
                : exifGps()
              : encode(webp ? xml : 'XML:com.adobe.xmp\0\0\0\0\0' + xml);
          image = file(
            format,
            chunk(
              source === 'exif' ? (webp ? 'EXIF' : 'eXIf') : webp ? 'XMP ' : 'iTXt',
              payload,
              webp,
            ),
          );
        }
        expect((await new ImageMetadataService().extract(image)).coordinates).toEqual({
          latitude: -25.4,
          longitude: -51.4,
          source: source as 'exif' | 'dji-xmp',
        });
      });
    }
  }
  it('retains XMP GPS when WebP EXIF is malformed and skips odd-length image chunks', async () => {
    const image = file(
      'webp',
      chunk('VP8 ', new Uint8Array([0]), true),
      chunk('EXIF', encode('broken'), true),
      chunk('XMP ', encode(xml), true),
    );
    const location = await new ImageMetadataService().extract(image);
    expect(location.coordinates?.source).toBe('dji-xmp');
    expect(location.warnings).toContain('metadata-unreadable');
  });
  it('reads compressed PNG XMP and ignores unrelated text', async () => {
    const compressed = new Uint8Array(
      await new Response(
        new Blob([xml]).stream().pipeThrough(new CompressionStream('deflate')),
      ).arrayBuffer(),
    );
    const payload = new Uint8Array([...encode('XML:com.adobe.xmp\0'), 1, 0, 0, 0, ...compressed]);
    const image = file(
      'png',
      chunk('iTXt', encode('Author\0\0\0\0\0not GPS'), false),
      chunk('iTXt', payload, false),
    );
    expect((await new ImageMetadataService().extract(image)).coordinates?.source).toBe('dji-xmp');
  });
  it('treats truncated container chunks as a warning', async () => {
    const bytes = chunk('EXIF', exifGps(), true).subarray(0, 10);
    const location = await new ImageMetadataService().extract(file('webp', bytes));
    expect(location.coordinates).toBeNull();
    expect(location.warnings).toContain('metadata-unreadable');
  });
  it('reads DJI capture coordinates from a local JPEG XMP segment', async () => {
    const xml =
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:drone-dji="http://www.uav.com/drone-dji/1.0/" drone-dji:GpsLatitude="-25.4" drone-dji:GpsLongitude="-51.4"/></rdf:RDF></x:xmpmeta>';
    const data = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0' + xml);
    const length = data.length + 2;
    const bytes = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xe1,
      length >> 8,
      length & 255,
      ...data,
      0xff,
      0xd9,
    ]);
    const metadata = await new ImageMetadataService().extract(
      new File([bytes], 'capture.jpg', { type: 'image/jpeg' }),
    );
    expect(metadata.coordinates).toEqual({ latitude: -25.4, longitude: -51.4, source: 'dji-xmp' });
  });

  it('treats unparseable metadata as a warning rather than rejecting the selection', async () => {
    const metadata = await new ImageMetadataService().extract(new File(['invalid'], 'capture.jpg'));
    expect(metadata.coordinates).toBeNull();
    expect(metadata.warnings).toContain('metadata-unreadable');
  });
});
