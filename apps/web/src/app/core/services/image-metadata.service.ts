import { Injectable } from '@angular/core';
import { parse, sidecar } from 'exifr';
import {
  IMAGE_METADATA_READ_OPTIONS,
  normalizeImageLocation,
  type ImageLocation,
} from '@agrolens/contracts';

@Injectable({ providedIn: 'root' })
export class ImageMetadataService {
  async extract(file: File): Promise<ImageLocation> {
    try {
      const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const webp =
        text(header.subarray(0, 4)) === 'RIFF' && text(header.subarray(8, 12)) === 'WEBP';
      const png = header[0] === 0x89 && text(header.subarray(1, 4)) === 'PNG';
      if (!webp && !png)
        return normalizeImageLocation(await parse(file, IMAGE_METADATA_READ_OPTIONS));
      const tags: Record<string, unknown> = {};
      let unreadable = false;
      let offset = webp ? 12 : 8;
      const end = webp
        ? Math.min(file.size, new DataView(header.buffer).getUint32(4, true) + 8)
        : file.size;
      while (offset + 8 <= end) {
        const chunk = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
        const length = new DataView(chunk.buffer).getUint32(webp ? 4 : 0, webp);
        const type = text(chunk.subarray(webp ? 0 : 4, webp ? 4 : 8));
        const next = offset + 8 + length + (webp ? length % 2 : 4);
        if (next > end) {
          unreadable = true;
          break;
        }
        if (['EXIF', 'XMP ', 'eXIf', 'iTXt'].includes(type)) {
          try {
            let bytes = new Uint8Array(
              await file.slice(offset + 8, offset + 8 + length).arrayBuffer(),
            );
            const exif = type === 'EXIF' || type === 'eXIf';
            if (type === 'iTXt') {
              const xmp = await pngXmp(bytes);
              if (!xmp) {
                offset = next;
                continue;
              }
              bytes = xmp;
            }
            // EXIF chunks may include the JPEG APP1 prefix instead of bare TIFF bytes.
            if (exif && text(bytes.subarray(0, 6)) === 'Exif\0\0') bytes = bytes.subarray(6);
            const parsed = exif
              ? await parse(bytes, { ...IMAGE_METADATA_READ_OPTIONS, xmp: false })
              : await sidecar(bytes, { mergeOutput: false }, 'xmp');
            Object.assign(tags, parsed);
            if (
              parsed &&
              'errors' in parsed &&
              Array.isArray(parsed.errors) &&
              parsed.errors.length
            )
              unreadable = true;
          } catch {
            unreadable = true;
          }
        }
        offset = next;
        if (!webp && type === 'IEND') break;
      }
      const location = normalizeImageLocation(tags);
      if (unreadable) location.warnings.push('metadata-unreadable');
      return location;
    } catch {
      const metadata = normalizeImageLocation(null);
      metadata.warnings.push('metadata-unreadable');
      return metadata;
    }
  }
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

async function pngXmp(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | null> {
  const keywordEnd = bytes.indexOf(0);
  if (text(bytes.subarray(0, keywordEnd)) !== 'XML:com.adobe.xmp') return null;
  const compressed = bytes[keywordEnd + 1];
  if (compressed > 1 || bytes[keywordEnd + 2] !== 0) throw new Error('Invalid XMP compression');
  const languageEnd = bytes.indexOf(0, keywordEnd + 3);
  const translatedEnd = bytes.indexOf(0, languageEnd + 1);
  if (languageEnd < 0 || translatedEnd < 0) throw new Error('Invalid XMP text chunk');
  const payload = bytes.subarray(translatedEnd + 1);
  if (!compressed) return payload;
  const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
