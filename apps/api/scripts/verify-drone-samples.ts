import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ImageProcessingService } from '../src/image-processing/image-processing.service';
async function main(): Promise<void> {
  const directory = process.argv[2];
  if (!directory) throw new Error('Provide a sample directory');
  const service = new ImageProcessingService();
  const names = (await readdir(directory)).filter((name) =>
    /\.(jpe?g|png|webp|tiff?|dng)$/i.test(name),
  );
  if (!names.length) throw new Error('No image samples found');
  for (const name of names) {
    const buffer = await readFile(join(directory, name));
    const hash = createHash('sha256').update(buffer).digest('hex');
    if (/\.(tiff?|dng)$/i.test(name) || name.startsWith('m4t-')) {
      try {
        await service.probeImage(buffer);
      } catch (error) {
        if (!(error instanceof Error) || !/TIFF and DNG|R-JPEG/.test(error.message)) throw error;
        console.log(name, 'unsupported (expected)');
        continue;
      }
      throw new Error(`Unexpected acceptance: ${name}`);
    }
    const probe = await service.probeImage(buffer);
    if (process.argv.includes('--require-gps') && !probe.location?.coordinates) {
      throw new Error(`No capture GPS extracted: ${name}`);
    }
    const preview = await service.generatePreview(buffer);
    if (
      hash !== createHash('sha256').update(buffer).digest('hex') ||
      hash !==
        createHash('sha256')
          .update(await readFile(join(directory, name)))
          .digest('hex')
    )
      throw new Error('Original changed');
    console.log(
      JSON.stringify({
        name,
        sizeBytes: buffer.length,
        width: probe.width,
        height: probe.height,
        location: probe.location,
        previewWidth: preview.width,
        previewHeight: preview.height,
      }),
    );
  }
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
