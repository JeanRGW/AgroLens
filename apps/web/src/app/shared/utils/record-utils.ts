import type { ImageAnnotation, YoloLabel } from '@agrolens/contracts';

export const PHONE_PATTERN = /^\(\d{2}\) \d{4,5}-\d{4}$/;

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function extractAnnotationClasses(annotations: ImageAnnotation[]): string[] {
  const classes = new Set<string>();
  for (const ann of annotations) {
    for (const cls of ann.classes) {
      const trimmed = cls.trim();
      if (trimmed) classes.add(trimmed);
    }
    for (const label of extractYoloLabels(ann)) {
      const cls = label.className?.trim();
      if (cls) classes.add(cls);
    }
  }
  return [...classes];
}

/**
 * Narrows an annotation's flexible labels payload (YOLO | COCO | custom) to
 * the YOLO boxes this app edits and exports. Non-array payloads yield [].
 */
export function extractYoloLabels(annotation: ImageAnnotation): YoloLabel[] {
  const labels = annotation.labels;
  if (!Array.isArray(labels)) return [];
  return labels as YoloLabel[];
}
