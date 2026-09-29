import { inject, Injectable } from '@angular/core';
import JSZip from 'jszip';

import {
  DownloadProgress,
  UploadRecord,
  YoloExportOptions,
} from '../../shared/models/upload-record';
import type { DownloadUrlItem, ImageAnnotation } from '@agrolens/contracts';
import { extractAnnotationClasses, extractYoloLabels } from '../../shared/utils/record-utils';
import { UploadsService } from './uploads.service';

/**
 * Client-side ZIP/YOLO export service.
 *
 * Provides:
 * - Batched signed URL requests via the backend-audited endpoint.
 * - ZIP packaging of downloaded image bytes using `jszip`.
 * - Structured ZIP of original images organized by upload ID folder.
 * - YOLO dataset ZIP with train/val split, label files, data.yaml, and classes.txt.
 * - CSV export for upload metadata.
 * - Safe browser download helper.
 */
@Injectable({
  providedIn: 'root',
})
export class ExportService {
  private readonly uploadsService = inject(UploadsService);

  /**
   * Request signed download URLs for a batch of images/files.
   * Delegates to the backend-audited export endpoint.
   */
  async getExportUrls(
    items: {
      uploadId: string;
      fileId?: string;
    }[],
  ): Promise<DownloadUrlItem[]> {
    return this.uploadsService.getExportDownloadUrls(items);
  }

  /**
   * Download image bytes from a signed URL.
   * Returns the Blob and its inferred file extension.
   */
  async fetchImageBlob(url: string): Promise<{ blob: Blob; ext: string }> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: falha ao baixar imagem`);
    }
    const blob = await response.blob();
    const ext = this.blobExtension(blob.type) || 'jpg';
    return { blob, ext };
  }

  /**
   * Export upload metadata as CSV and trigger browser download.
   */
  exportCsv(records: UploadRecord[], fileName: string): void {
    const headers = [
      'id',
      'userId',
      'property',
      'talhao',
      'cropType',
      'estadio',
      'source',
      'status',
      'fileCount',
      'activityDate',
      'createdAt',
      'updatedAt',
    ];
    const rows = records.map((r) =>
      [
        r.id,
        r.userId,
        r.propertyName || r.propertyId,
        r.talhaoName || r.talhaoId,
        r.cropTypeName || r.cropTypeId,
        r.estadioName || r.estadioId || '',
        r.source,
        r.status,
        r.fileCount,
        r.activityDate,
        r.createdAt,
        r.updatedAt,
      ].map((v) => this.csvCell(v)),
    );

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    this.downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${fileName}.csv`);
  }

  /**
   * Export generic record data as CSV and trigger browser download.
   * Column headers are derived from the keys of the first record.
   */
  exportGenericCsv(
    records: Record<string, unknown>[],
    fileName: string,
    headers = Object.keys(records[0] ?? {}),
  ): void {
    if (!headers.length) return;
    const rows = records.map((r) => headers.map((h) => this.csvCell(r[h])));
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    this.downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${fileName}.csv`);
  }

  /**
   * Download a structured ZIP of original images for the given upload records.
   * Each upload becomes a folder named by upload ID.
   * Uses batch signed URL endpoint for efficiency.
   */
  async downloadStructuredImagesZip(
    records: UploadRecord[],
    fileName: string,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<{ downloaded: number; skipped: number }> {
    const uploadIds = [
      ...new Set(records.filter((record) => record.fileCount > 0).map((record) => record.id)),
    ];

    if (uploadIds.length === 0) {
      onProgress?.({ phase: 'done', processed: 0, total: 0, percent: 100 });
      return { downloaded: 0, skipped: 0 };
    }

    const urls = await this.getExportUrls(uploadIds.map((uploadId) => ({ uploadId })));

    const zip = new JSZip();
    let downloaded = 0;
    let skipped = 0;

    const BATCH_SIZE = 5;
    const processed = { count: 0 };

    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      const batch = urls.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (u) => {
          const { blob, ext } = await this.fetchImageBlob(u.downloadUrl);
          const safeId = this.sanitizeFileName(u.uploadId);
          zip.file(`${safeId}/${u.imageId}.${ext}`, blob);
          return true;
        }),
      );

      for (const r of results) {
        processed.count++;
        if (r.status === 'fulfilled') {
          downloaded++;
        } else {
          skipped++;
        }
        const percent = Math.round((processed.count / urls.length) * 95);
        onProgress?.({
          phase: 'downloading',
          processed: processed.count,
          total: urls.length,
          percent,
        });
      }
    }

    if (downloaded === 0) {
      throw new Error('Nenhuma imagem pôde ser baixada.');
    }

    onProgress?.({ phase: 'packaging', processed: urls.length, total: urls.length, percent: 96 });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    this.downloadBlob(zipBlob, `${this.sanitizeFileName(fileName)}.zip`);

    onProgress?.({ phase: 'done', processed: urls.length, total: urls.length, percent: 100 });

    return { downloaded, skipped };
  }

  /**
   * Generate and download a YOLO dataset ZIP.
   *
   * Fetches signed URLs for all files, downloads image bytes,
   * and packages them with YOLO label files, data.yaml, and classes.txt.
   * Accepts an optional pre-loaded annotations map; callers should
   * provide annotations fetched via AnnotationsService.
   */
  async exportYoloDataset(
    uploads: UploadRecord[],
    options: YoloExportOptions,
    annotationsMap?: Map<string, ImageAnnotation[]>,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<{ downloaded: number; skipped: number; trainCount: number; valCount: number }> {
    const allGlobalClasses = this.buildGlobalClasses(uploads, annotationsMap);
    const enabledClassSet = new Set(
      options.enabledClasses.length > 0 ? options.enabledClasses : allGlobalClasses,
    );
    const globalClasses = allGlobalClasses.filter((c) => enabledClassSet.has(c));

    if (globalClasses.length === 0) {
      globalClasses.push('unknown');
    }

    const classIndexMap = new Map(globalClasses.map((name, idx) => [name, idx]));

    const urlItems = await this.getExportUrls(uploads.map(({ id }) => ({ uploadId: id })));
    const allImages = this.buildImageItems(urlItems, annotationsMap, enabledClassSet, options);

    if (allImages.length === 0) {
      onProgress?.({ phase: 'done', processed: 0, total: 0, percent: 100 });
      return { downloaded: 0, skipped: 0, trainCount: 0, valCount: 0 };
    }

    // Seeded shuffle for reproducible train/val splits
    const shuffled = [...allImages];
    const random = this.seededRandom(42);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const trainCount = Math.min(
      Math.round(shuffled.length * options.trainRatio),
      Math.max(shuffled.length - 1, 0),
    );
    const trainImages = shuffled.slice(0, trainCount);
    const valImages = shuffled.slice(trainCount);

    // Request all signed URLs up front
    // Match files and annotations by stable image identity.
    const urlMap = new Map<string, (typeof urlItems)[0]>();
    for (const u of urlItems) {
      urlMap.set(u.imageId, u);
    }

    const zip = new JSZip();

    // Classes file
    zip.file('dataset/classes.txt', globalClasses.join('\n'));

    let processed = 0;
    let downloaded = 0;
    let skipped = 0;
    const splitCounts = { train: 0, val: 0 };

    const processImage = async (item: YoloImageItem, split: 'train' | 'val') => {
      const safeUploadId = this.sanitizeFileName(item.uploadId);
      const baseName = `${safeUploadId}_${item.imageId}`;
      const urlEntry = urlMap.get(item.imageId);

      if (!urlEntry) {
        skipped++;
        processed++;
        const percent = Math.round((processed / allImages.length) * 95);
        onProgress?.({ phase: 'downloading', processed, total: allImages.length, percent });
        return;
      }

      try {
        const { blob, ext } = await this.fetchImageBlob(urlEntry.downloadUrl);
        zip.file(`dataset/images/${split}/${baseName}.${ext}`, blob);
        downloaded++;
        splitCounts[split]++;

        if (item.hasEnabledAnnotation && item.annotation) {
          zip.file(
            `dataset/labels/${split}/${baseName}.txt`,
            this.formatYoloLabels(item.annotation, enabledClassSet, classIndexMap),
          );
        } else if (options.includeUnannotated === 'empty-labels') {
          zip.file(`dataset/labels/${split}/${baseName}.txt`, '');
        }
        // 'no-labels': no .txt file is written for this image
      } catch {
        skipped++;
      } finally {
        processed++;
        const percent = Math.round((processed / allImages.length) * 95);
        onProgress?.({ phase: 'downloading', processed, total: allImages.length, percent });
      }
    };

    const BATCH_SIZE = 5;
    for (let i = 0; i < trainImages.length; i += BATCH_SIZE) {
      await Promise.all(
        trainImages.slice(i, i + BATCH_SIZE).map((item) => processImage(item, 'train')),
      );
    }
    for (let i = 0; i < valImages.length; i += BATCH_SIZE) {
      await Promise.all(
        valImages.slice(i, i + BATCH_SIZE).map((item) => processImage(item, 'val')),
      );
    }

    if (downloaded === 0) {
      throw new Error('Nenhuma imagem pôde ser baixada.');
    }

    zip.file(
      'dataset/data.yaml',
      [
        'path: .',
        'train: images/train',
        'val: images/val',
        `nc: ${globalClasses.length}`,
        `names: [${globalClasses.map((c) => `'${c.replace(/'/g, "''")}'`).join(', ')}]`,
        '',
        `# Total images: ${downloaded} (train: ${splitCounts.train}, val: ${splitCounts.val})`,
      ].join('\n'),
    );

    onProgress?.({
      phase: 'packaging',
      processed: allImages.length,
      total: allImages.length,
      percent: 96,
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    this.downloadBlob(zipBlob, `yolo-dataset-${Date.now()}.zip`);

    onProgress?.({
      phase: 'done',
      processed: allImages.length,
      total: allImages.length,
      percent: 100,
    });

    return { downloaded, skipped, trainCount: splitCounts.train, valCount: splitCounts.val };
  }

  /**
   * Trigger a safe browser download of a Blob.
   */
  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private csvCell(value: unknown): string {
    let text = String(value ?? '');
    // CSV quoting alone does not stop spreadsheet formula evaluation.
    if (typeof value !== 'number' && (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))) {
      text = `'${text}`;
    }
    return `"${text.replace(/"/g, '""')}"`;
  }

  private buildGlobalClasses(
    uploads: UploadRecord[],
    annotationsMap?: Map<string, ImageAnnotation[]>,
  ): string[] {
    const classesSet = new Set<string>();
    if (!annotationsMap) return [];
    for (const upload of uploads) {
      const annotations = annotationsMap.get(upload.id) || [];
      for (const cls of extractAnnotationClasses(annotations)) {
        classesSet.add(cls);
      }
    }
    return [...classesSet].sort();
  }

  private buildImageItems(
    files: DownloadUrlItem[],
    annotationsMap: Map<string, ImageAnnotation[]> | undefined,
    enabledClassSet: Set<string>,
    options: YoloExportOptions,
  ): YoloImageItem[] {
    const images: YoloImageItem[] = [];
    for (const file of files) {
      const annotations = annotationsMap?.get(file.uploadId) || [];
      const annotation = annotations.find((ann) => ann.imageId === file.imageId);
      const hasAnnotation = !!annotation && extractYoloLabels(annotation).length > 0;
      const hasEnabledAnnotation =
        hasAnnotation &&
        extractYoloLabels(annotation!).some((label) =>
          enabledClassSet.has(label.className?.trim() || ''),
        );

      const effectivelyUnannotated = !hasAnnotation || !hasEnabledAnnotation;
      if (effectivelyUnannotated && options.includeUnannotated === 'exclude') continue;

      images.push({
        uploadId: file.uploadId,
        imageId: file.imageId,
        annotation,
        hasEnabledAnnotation,
      });
    }
    return images;
  }

  private formatYoloNumber(value: number): string {
    if (!Number.isFinite(value)) return '0.000000';
    return Math.min(Math.max(value, 0), 1).toFixed(6);
  }

  private seededRandom(seed: number): () => number {
    let s = seed | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private formatYoloLabels(
    annotation: ImageAnnotation,
    enabledClassSet: Set<string>,
    classIndexMap: Map<string, number>,
  ): string {
    return extractYoloLabels(annotation)
      .map((label) => {
        const trimmedName = label.className?.trim() || '';
        if (!enabledClassSet.has(trimmedName)) return null;

        const classId = classIndexMap.get(trimmedName);
        if (classId === undefined) return null;

        return [
          classId,
          this.formatYoloNumber(label.xCenter),
          this.formatYoloNumber(label.yCenter),
          this.formatYoloNumber(label.width),
          this.formatYoloNumber(label.height),
        ].join(' ');
      })
      .filter((line): line is string => line !== null)
      .join('\n');
  }

  private sanitizeFileName(name: string): string {
    // eslint-disable-next-line no-control-regex -- intentional: strip control characters from filenames
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\s+/g, '-') || 'export';
  }

  private blobExtension(mimeType: string): string | null {
    const t = mimeType.toLowerCase();
    if (t.includes('jpeg')) return 'jpg';
    if (t.includes('png')) return 'png';
    if (t.includes('webp')) return 'webp';
    return null;
  }
}

/** Internal type for tracking images during YOLO export. */
interface YoloImageItem {
  uploadId: string;
  imageId: string;
  annotation?: ImageAnnotation;
  hasEnabledAnnotation: boolean;
}
