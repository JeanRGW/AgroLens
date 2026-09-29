import { UploadFileInfo, UploadSource } from '../models/upload-record';

export const SOURCE_LABELS: Record<string, string> = {
  drone: 'Drone',
  phone: 'Celular',
  mixed: 'Misto',
};

export function getSourceLabel(source: UploadSource | string): string {
  return SOURCE_LABELS[source] ?? source;
}

export function hasValidCoordinates(
  location?: { latitude?: number | null; longitude?: number | null } | null,
): boolean {
  return (
    !!location &&
    location.latitude != null &&
    location.longitude != null &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude)
  );
}

export function openMapCoordinates(latitude: number, longitude: number): void {
  window.open(
    `https://www.google.com/maps?q=${latitude},${longitude}`,
    '_blank',
    'noopener,noreferrer',
  );
}

export function formatFileSize(bytes?: number | null): string {
  if (bytes === undefined || bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Convert a datetime-local input value ("2025-06-01T10:30") to a
 * timezone-qualified UTC ISO string, as required by the backend date
 * filters. Already-qualified strings (e.g. "...Z") are passed through
 * unchanged, and empty/invalid input yields undefined.
 */
export function toUtcIsoOrNull(value?: string | null): string | undefined {
  if (!value || value.trim() === '') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function compareImageIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildDisplayEntries(files: UploadFileInfo[]): string[] {
  const previewByImageId = new Map<string, UploadFileInfo>();
  for (const f of files) {
    if (f.variant === 'preview') {
      previewByImageId.set(f.imageId, f);
    }
  }

  const entries: string[] = [];
  const originals = files
    .filter((f) => f.variant === 'original')
    .sort((a, b) => compareImageIds(a.imageId, b.imageId));
  for (const original of originals) {
    const preview = previewByImageId.get(original.imageId);
    if (preview) {
      entries.push(`preview:${preview.id}`);
    } else {
      entries.push(`original:${original.id}`);
    }
  }
  return entries;
}

export function findOriginalFileForIndex(
  files: UploadFileInfo[],
  index: number,
): UploadFileInfo | undefined {
  return files
    .filter((f) => f.variant === 'original')
    .sort((a, b) => compareImageIds(a.imageId, b.imageId))[index];
}

export function mapDisplayUrlsToResolvedMap(
  files: Record<string, { fileId: string; variant: string; url: string }>,
  existing?: Map<string, string>,
): Map<string, string> {
  const map = new Map<string, string>(existing);
  for (const file of Object.values(files)) {
    map.set(`${file.variant}:${file.fileId}`, file.url);
  }
  return map;
}
