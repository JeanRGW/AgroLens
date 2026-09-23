import { validateUploadImages } from './offline-errors';

describe('validateUploadImages', () => {
  it('resolves missing camera MIME types from supported filename extensions', () => {
    const files = ['capture.JPG', 'capture.jpeg', 'capture.PNG', 'capture.WebP'].map(
      (name) => new File(['image bytes'], name),
    );

    expect(files.every((file) => file.type === '')).toBeTrue();
    expect(validateUploadImages(files)).toEqual([
      'image/jpeg',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
  });

  it('preserves an explicitly supported MIME type even when the filename differs', () => {
    const converted = new File(['converted image'], 'capture.heic', { type: 'image/jpeg' });
    expect(validateUploadImages([converted])).toEqual(['image/jpeg']);
  });

  it('does not override an explicitly unsupported MIME type based on the extension', () => {
    const file = new File(['heic bytes'], 'capture.jpg', { type: 'image/heic' });
    expect(() => validateUploadImages([file])).toThrowError(/Converta fotos HEIC\/HEIF/);
  });

  it('identifies an untyped HEIC filename as requiring conversion', () => {
    expect(() => validateUploadImages([new File(['heic bytes'], 'capture.HEIC')])).toThrowError(
      /Converta fotos HEIC\/HEIF/,
    );
  });

  it('gives actionable format guidance for untyped files without a recognized extension', () => {
    for (const name of ['capture', 'capture.bin', 'jpg']) {
      expect(() => validateUploadImages([new File(['unknown bytes'], name)])).toThrowError(
        /O dispositivo não informou o formato.*\.jpg, \.jpeg, \.png ou \.webp/,
      );
    }
  });

  it('rejects an empty image even if its extension is supported', () => {
    expect(() => validateUploadImages([new File([], 'capture.jpg')])).toThrowError(/está vazia/);
  });
});
