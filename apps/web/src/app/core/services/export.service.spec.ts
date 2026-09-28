import { TestBed } from '@angular/core/testing';

import { ExportService } from './export.service';
import { UploadsService } from './uploads.service';
import JSZip from 'jszip';
import type { ImageAnnotation } from '@agrolens/contracts';

describe('ExportService', () => {
  let service: ExportService;
  let uploadsService: jasmine.SpyObj<UploadsService>;

  beforeEach(() => {
    const spy = jasmine.createSpyObj('UploadsService', ['getExportDownloadUrls']);

    TestBed.configureTestingModule({
      providers: [ExportService, { provide: UploadsService, useValue: spy }],
    });

    service = TestBed.inject(ExportService);
    uploadsService = TestBed.inject(UploadsService) as jasmine.SpyObj<UploadsService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getExportUrls', () => {
    it('should call uploadsService.getExportDownloadUrls', async () => {
      const mockResponse = [
        {
          uploadId: 'u1',
          fileId: 'f1',
          imageId: 'image-0',
          fileName: 'img.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 1024,
          downloadUrl: 'https://example.com/dl',
          expiresAt: '2025-01-01T00:00:00Z',
        },
      ];
      uploadsService.getExportDownloadUrls.and.returnValue(Promise.resolve(mockResponse));

      const result = await service.getExportUrls([{ uploadId: 'u1', fileId: 'f1' }]);
      expect(result.length).toBe(1);
      expect(result[0].downloadUrl).toBe('https://example.com/dl');
      expect(uploadsService.getExportDownloadUrls).toHaveBeenCalledWith([
        { uploadId: 'u1', fileId: 'f1' },
      ]);
    });
  });

  describe('image exports', () => {
    const record = { id: 'u1', fileCount: 2 } as any;

    beforeEach(() => {
      spyOn(service, 'fetchImageBlob').and.resolveTo({ blob: new Blob(['image']), ext: 'jpg' });
      spyOn(service, 'downloadBlob');
      uploadsService.getExportDownloadUrls.and.resolveTo([
        {
          uploadId: 'u1',
          fileId: 'f1',
          imageId: 'image-0',
          fileName: 'one.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 1,
          downloadUrl: 'https://example.com/one',
          expiresAt: '2025-01-01T00:00:00Z',
        },
        {
          uploadId: 'u1',
          fileId: 'f2',
          imageId: 'image-1',
          fileName: 'two.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 1,
          downloadUrl: 'https://example.com/two',
          expiresAt: '2025-01-01T00:00:00Z',
        },
      ]);
    });

    it('requests each upload once for structured ZIP exports', async () => {
      await service.downloadStructuredImagesZip([record], 'export-test');

      expect(uploadsService.getExportDownloadUrls).toHaveBeenCalledWith([{ uploadId: 'u1' }]);
      expect(uploadsService.getExportDownloadUrls).toHaveBeenCalledTimes(1);
    });

    it('requests each upload once for YOLO exports', async () => {
      await service.exportYoloDataset([record], {
        trainRatio: 0.5,
        includeUnannotated: 'no-labels',
        enabledClasses: [],
      });

      expect(uploadsService.getExportDownloadUrls).toHaveBeenCalledWith([{ uploadId: 'u1' }]);
      expect(uploadsService.getExportDownloadUrls).toHaveBeenCalledTimes(1);
    });

    it('reports and packages actual split counts after a partial download', async () => {
      (service.fetchImageBlob as jasmine.Spy).and.callFake(async (url: string) => {
        if (url.endsWith('one')) throw new Error('download failed');
        return { blob: new Blob(['image']), ext: 'jpg' };
      });
      const result = await service.exportYoloDataset([record], {
        trainRatio: 0.5,
        includeUnannotated: 'no-labels',
        enabledClasses: [],
      });
      const blob = (service.downloadBlob as jasmine.Spy).calls.mostRecent().args[0] as Blob;
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const train = Object.keys(zip.files).filter((name) =>
        /^dataset\/images\/train\/.*\.jpg$/.test(name),
      ).length;
      const val = Object.keys(zip.files).filter((name) =>
        /^dataset\/images\/val\/.*\.jpg$/.test(name),
      ).length;
      expect(result).toEqual({ downloaded: 1, skipped: 1, trainCount: train, valCount: val });
      expect(await zip.file('dataset/data.yaml')!.async('string')).toContain(
        `# Total images: 1 (train: ${train}, val: ${val})`,
      );
    });

    it('joins labels to the image ID', async () => {
      const annotation: ImageAnnotation = {
        imageId: 'image-1',
        imageWidth: 100,
        imageHeight: 100,
        classes: ['weed'],
        labels: [
          { classId: 0, className: 'weed', xCenter: 0.5, yCenter: 0.5, width: 0.2, height: 0.2 },
        ],
      };
      const result = await service.exportYoloDataset(
        [record],
        {
          trainRatio: 0.5,
          includeUnannotated: 'exclude',
          enabledClasses: ['weed'],
        },
        new Map([['u1', [annotation]]]),
      );
      const blob = (service.downloadBlob as jasmine.Spy).calls.mostRecent().args[0] as Blob;
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      expect(result.downloaded).toBe(1);
      expect(Object.keys(zip.files).some((name) => name.includes('u1_image-0.jpg'))).toBeFalse();
      expect(Object.keys(zip.files).some((name) => name.endsWith('u1_image-1.jpg'))).toBeTrue();
      expect(Object.keys(zip.files).some((name) => name.endsWith('u1_image-1.txt'))).toBeTrue();
    });
  });

  describe('exportCsv', () => {
    it('neutralizes text formulas while preserving numbers and CSV quoting', async () => {
      const download = spyOn(service, 'downloadBlob');
      service.exportGenericCsv(
        [
          { name: '=1+1', file: '  @SUM(1)', latitude: -15.5, note: 'a,"b"' },
          { name: '+1', file: '\tvalue', latitude: 0, note: '-2+3' },
        ],
        'safe',
      );
      const csv = await download.calls.mostRecent().args[0].text();
      expect(csv).toContain('"\'=1+1","\'  @SUM(1)","-15.5","a,""b"""');
      expect(csv).toContain('"\'+1","\'\tvalue","0","\'-2+3"');
    });

    it('exports headers for inference results with zero detections', async () => {
      const download = spyOn(service, 'downloadBlob');
      service.exportGenericCsv([], 'empty', ['image_index', 'class_name']);
      expect(await download.calls.mostRecent().args[0].text()).toBe('image_index,class_name');
    });
    it('should create a CSV blob and trigger download', () => {
      spyOn(service, 'downloadBlob');

      service.exportCsv(
        [
          {
            id: 'u1',
            userId: 'usr1',
            clientUploadId: 'c1',
            propertyId: 'p1',
            propertyName: 'Fazenda X',
            talhaoId: 't1',
            talhaoName: 'Talhão A',
            cropTypeId: 'ct1',
            cropTypeName: 'Soja',
            source: 'phone',
            status: 'ready',
            activityDate: '2025-06-01T12:00:00Z',
            latitude: -15.5,
            longitude: -47.5,
            createdAt: '2025-06-01T12:00:00Z',
            updatedAt: '2025-06-01T12:00:00Z',
            fileCount: 5,
          } as any,
        ],
        'export-test',
      );

      expect(service.downloadBlob).toHaveBeenCalledWith(jasmine.any(Blob), 'export-test.csv');
      const blob = (service.downloadBlob as jasmine.Spy).calls.mostRecent().args[0] as Blob;
      expect(blob.type).toBe('text/csv;charset=utf-8');
    });
  });

  describe('sanitizeFileName and blobExtension helpers', () => {
    it('should sanitize file names', () => {
      // Access private methods via prototype for unit testing purposes
      const sanitized = (service as any).sanitizeFileName('bad/file:name');
      expect(sanitized).toBe('bad-file-name');
    });

    it('should return null for unknown mime types', () => {
      const ext = (service as any).blobExtension('application/octet-stream');
      expect(ext).toBeNull();
    });

    it('should return jpg for jpeg mime', () => {
      expect((service as any).blobExtension('image/jpeg')).toBe('jpg');
    });
  });
});
