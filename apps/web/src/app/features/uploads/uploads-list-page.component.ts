import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Clipboard } from '@angular/cdk/clipboard';
import { firstValueFrom } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { UploadsService } from '../../core/services/uploads.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { UsersService } from '../../core/services/users.service';
import { AnnotationsService } from '../../core/services/annotations.service';
import { ExportService } from '../../core/services/export.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  UploadFilters,
  UploadPageResult,
  UploadRecord,
  UploadStatus,
} from '../../shared/models/upload-record';
import type { ImageAnnotation } from '@agrolens/contracts';
import { extractAnnotationClasses, extractYoloLabels } from '../../shared/utils/record-utils';
import { getSourceLabel, toUtcIsoOrNull } from '../../shared/utils/upload-utils';
import {
  ClassMismatchDetail,
  ImageClassInfo,
  UploadLinkRef,
  YoloExportDialogComponent,
  YoloExportDialogData,
} from './yolo-export-dialog/yolo-export-dialog.component';
import { UploadDetailDialogComponent } from './upload-detail-dialog/upload-detail-dialog.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { AutocompleteFieldComponent } from '../../shared/components/autocomplete-field/autocomplete-field.component';
import { AutocompleteOption } from '../../shared/models/autocomplete-option';
import { CropTypeRecord, EstadioRecord, PropertyRecord, TalhaoRecord } from '@agrolens/contracts';

const DEFAULT_LIMIT = 25;

const STATUS_LABELS: Record<UploadStatus, string> = {
  draft: 'Rascunho',
  finalizing: 'Finalizando',
  ready: 'Pronto',
  failed: 'Falhou',
};

function statusLabel(status: UploadStatus): string {
  return STATUS_LABELS[status] ?? status;
}

@Component({
  selector: 'app-uploads-list-page',
  standalone: true,
  imports: [
    MatSnackBarModule,
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    MatTooltipModule,
    PageHeaderComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    AutocompleteFieldComponent,
  ],
  templateUrl: './uploads-list-page.component.html',
  styleUrl: './uploads-list-page.component.scss',
})
export class UploadsListPageComponent implements OnInit {
  private readonly uploadsService = inject(UploadsService);
  private readonly catalogsService = inject(CatalogsService);
  private readonly usersService = inject(UsersService);
  private readonly annotationsService = inject(AnnotationsService);
  private readonly exportService = inject(ExportService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly clipboard = inject(Clipboard);

  protected readonly Math = Math;

  readonly result = signal<UploadPageResult | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly offset = signal(0);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly viewMode = signal<'table' | 'grid'>('table');
  readonly downloadingImages = signal(false);
  readonly downloadProgress = signal(0);
  readonly preparingYolo = signal(false);
  readonly exportingYolo = signal(false);
  readonly properties = signal<PropertyRecord[]>([]);
  readonly talhoes = signal<TalhaoRecord[]>([]);
  readonly cropTypes = signal<CropTypeRecord[]>([]);
  readonly estadios = signal<EstadioRecord[]>([]);

  readonly userSearchControl = new FormControl('', { nonNullable: true });
  readonly userIdControl = new FormControl('', { nonNullable: true });

  readonly searchUserOptions = async (term: string): Promise<AutocompleteOption[]> => {
    const users = await this.usersService.lookupUsers(term);
    return users.map((user) => ({
      value: user.id,
      label: user.fullName,
      selectionText: user.fullName,
    }));
  };

  /** In-memory cache of preview signed URLs keyed by "uploadId:fileId". */
  private readonly previewCache = signal<Map<string, string>>(new Map());

  /** Set of keys for which a preview URL fetch is already in flight. */
  private readonly inflightPreviews = new Set<string>();

  pageSize = DEFAULT_LIMIT;
  protected appliedPageSize = DEFAULT_LIMIT;
  private appliedFilters: UploadFilters | undefined;
  private loadGeneration = 0;
  readonly pageSizes = [10, 25, 50, 100];

  protected filters: UploadFilters = {};

  readonly records = computed(() => this.result()?.records ?? []);

  filteredTalhoes(): TalhaoRecord[] {
    const propertyId = this.filters.propertyId;
    return propertyId
      ? this.talhoes().filter((item) => item.propertyId === propertyId)
      : this.talhoes();
  }

  filteredEstadios(): EstadioRecord[] {
    const cropTypeId = this.filters.cropTypeId;
    return cropTypeId
      ? this.estadios().filter((item) => item.cropTypeId === cropTypeId)
      : this.estadios();
  }

  onPropertyChange(): void {
    this.filters.talhaoId = undefined;
  }

  onCropTypeChange(): void {
    this.filters.estadioId = undefined;
  }

  readonly isAllSelected = computed(() => {
    const recs = this.records();
    const sel = this.selectedIds();
    return recs.length > 0 && sel.size === recs.length;
  });

  readonly displayedColumns = [
    'select',
    'preview',
    'uploadId',
    'user',
    'property',
    'talhao',
    'cropType',
    'estadio',
    'source',
    'status',
    'fileCount',
    'date',
    'actions',
  ];

  readonly getSourceLabel = getSourceLabel;
  readonly getStatusLabel = statusLabel;

  ngOnInit(): void {
    void this.loadCatalogs();
    void this.load();
  }

  private async loadCatalogs(): Promise<void> {
    try {
      const [properties, talhoes, cropTypes, estadios] = await Promise.all([
        this.catalogsService.listProperties(),
        this.catalogsService.listTalhoes(),
        this.catalogsService.listCropTypes(),
        this.catalogsService.listEstadios(),
      ]);
      this.properties.set(properties);
      this.talhoes.set(talhoes);
      this.cropTypes.set(cropTypes);
      this.estadios.set(estadios);
    } catch {
      this.snackBar.open('Não foi possível carregar as opções dos filtros.', 'Fechar', {
        duration: 6000,
      });
    }
  }

  /**
   * Return the cached preview URL for a record, or null if not yet loaded.
   */
  previewUrl(record: UploadRecord): string | null {
    if (!record.previewFileId) return null;
    const key = `${record.id}:${record.previewFileId}`;
    return this.previewCache().get(key) ?? null;
  }

  /**
   * Called when a preview <img> fails to load. Removes the URL from cache
   * so the placeholder icon is shown instead.
   */
  onPreviewError(record: UploadRecord): void {
    if (!record.previewFileId) return;
    const key = `${record.id}:${record.previewFileId}`;
    this.previewCache.update((map) => {
      const next = new Map(map);
      next.delete(key);
      return next;
    });
  }

  async load(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.uploadsService.listUploads(
        this.appliedFilters,
        this.appliedPageSize,
        this.offset(),
      );
      if (generation !== this.loadGeneration) return;
      this.result.set(data);
      this.fetchPreviewUrls(data.records);
    } catch (err) {
      if (generation !== this.loadGeneration) return;
      const msg = err instanceof Error ? err.message : 'Erro ao carregar uploads';
      this.error.set(msg);
      this.snackBar.open(msg, 'Fechar', { duration: 6000 });
      this.result.set({ records: [], total: 0 });
    } finally {
      if (generation === this.loadGeneration) this.loading.set(false);
    }
  }

  /**
   * Fetch signed preview URLs for any visible rows that have a previewFileId
   * but are not yet in the cache. Runs fire-and-forget — the template
   * reactively picks up new URLs via the previewCache signal.
   */
  private fetchPreviewUrls(records: UploadRecord[]): void {
    const cache = this.previewCache();
    for (const record of records) {
      if (!record.previewFileId) continue;
      const key = `${record.id}:${record.previewFileId}`;
      if (cache.has(key) || this.inflightPreviews.has(key)) continue;
      this.inflightPreviews.add(key);
      this.uploadsService
        .getPreviewUrl(record.id, record.previewFileId)
        .then((res) => {
          this.previewCache.update((map) => {
            const next = new Map(map);
            next.set(key, res.downloadUrl);
            return next;
          });
        })
        .catch(() => {
          // Silently ignore — placeholder icon remains visible
        })
        .finally(() => {
          this.inflightPreviews.delete(key);
        });
    }
  }

  applyFilters(): void {
    this.filters.userId = this.userIdControl.value || undefined;
    this.appliedFilters = this.activeFilters();
    this.appliedPageSize = this.pageSize;
    this.offset.set(0);
    this.selectedIds.set(new Set());
    void this.load();
  }

  clearFilters(): void {
    this.filters = {};
    this.appliedFilters = undefined;
    this.appliedPageSize = this.pageSize;
    this.userSearchControl.setValue('', { emitEvent: false });
    this.userIdControl.setValue('', { emitEvent: false });
    this.offset.set(0);
    this.selectedIds.set(new Set());
    void this.load();
  }

  nextPage(): void {
    if (this.loading()) return;
    this.offset.update((o) => o + this.appliedPageSize);
    this.selectedIds.set(new Set());
    void this.load();
  }

  prevPage(): void {
    if (this.loading()) return;
    this.offset.update((o) => Math.max(0, o - this.appliedPageSize));
    this.selectedIds.set(new Set());
    void this.load();
  }

  toggleSelection(record: UploadRecord, selected: boolean): void {
    const set = new Set(this.selectedIds());
    if (selected) {
      set.add(record.id);
    } else {
      set.delete(record.id);
    }
    this.selectedIds.set(set);
  }

  isSelected(record: UploadRecord): boolean {
    return this.selectedIds().has(record.id);
  }

  toggleAll(selected: boolean): void {
    if (!selected) {
      this.selectedIds.set(new Set());
      return;
    }
    this.selectedIds.set(new Set(this.records().map((r) => r.id)));
  }

  toggleViewMode(): void {
    this.viewMode.set(this.viewMode() === 'table' ? 'grid' : 'table');
  }

  copyUploadId(uploadId: string): void {
    this.clipboard.copy(uploadId);
    this.snackBar.open('Upload ID copiado.', 'Fechar', { duration: 4000 });
  }

  openDetails(record: UploadRecord): void {
    this.dialog.open(UploadDetailDialogComponent, {
      width: '1100px',
      maxWidth: '96vw',
      data: { uploadId: record.id },
    });
  }

  copyUserId(userId: string): void {
    this.clipboard.copy(userId);
    this.snackBar.open('ID do usuario copiado.', 'Fechar', { duration: 4000 });
  }

  // ── Bulk export actions ──────────────────────────────────────────

  exportCsv(): void {
    const rows = this.getSelectedRecords();
    if (!rows.length) {
      this.snackBar.open('Selecione ao menos um upload para exportar.', 'Fechar', {
        duration: 6000,
      });
      return;
    }
    this.exportService.exportCsv(rows, `uploads-${Date.now()}`);
    this.snackBar.open('CSV exportado com sucesso.', 'Fechar', { duration: 4000 });
  }

  async downloadSelectedImages(): Promise<void> {
    const selectedRecords = this.getSelectedRecords();
    if (!selectedRecords.length) {
      this.snackBar.open('Selecione ao menos um upload para baixar.', 'Fechar', { duration: 6000 });
      return;
    }

    this.downloadingImages.set(true);
    this.downloadProgress.set(0);

    try {
      const result = await this.exportService.downloadStructuredImagesZip(
        selectedRecords,
        `uploads-images-${Date.now()}`,
        (progress) => {
          this.downloadProgress.set(progress.percent);
        },
      );

      const message =
        result.skipped > 0
          ? `Download concluido: ${result.downloaded} imagens baixadas, ${result.skipped} ignoradas.`
          : `Download concluido: ${result.downloaded} imagens baixadas.`;

      this.snackBar.open(message, 'Fechar', { duration: 4000 });
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      this.snackBar.open(
        `Nao foi possivel montar o arquivo de download${detail ? ` (${detail})` : ''}.`,
        'Fechar',
        { duration: 6000 },
      );
    } finally {
      this.downloadingImages.set(false);
      this.downloadProgress.set(0);
    }
  }

  async exportSelectedAsYolo(): Promise<void> {
    const selectedRecords = this.getSelectedRecords();
    if (!selectedRecords.length) {
      this.snackBar.open('Selecione ao menos um upload para exportar.', 'Fechar', {
        duration: 6000,
      });
      return;
    }

    this.preparingYolo.set(true);

    try {
      const recordIds = selectedRecords.map((r) => r.id);
      const annotationsMap = await this.annotationsService.listUploadAnnotationsBatch(recordIds);

      const dialogData = this.buildYoloDialogData(selectedRecords, annotationsMap);
      this.preparingYolo.set(false);

      const dialogRef = this.dialog.open(YoloExportDialogComponent, {
        width: '650px',
        maxWidth: '90vw',
        data: dialogData,
      });

      const options = await firstValueFrom(dialogRef.afterClosed());
      if (!options) {
        return;
      }

      this.exportingYolo.set(true);
      this.downloadProgress.set(0);

      const result = await this.exportService.exportYoloDataset(
        selectedRecords,
        options,
        annotationsMap,
        (progress) => {
          this.downloadProgress.set(progress.percent);
        },
      );

      const message =
        result.skipped > 0
          ? `Dataset exportado: ${result.downloaded} imagens (treino: ${result.trainCount}, validacao: ${result.valCount}), ${result.skipped} ignoradas.`
          : `Dataset exportado: ${result.downloaded} imagens (treino: ${result.trainCount}, validacao: ${result.valCount}).`;

      this.snackBar.open(message, 'Fechar', { duration: 4000 });
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      this.snackBar.open(`Erro ao exportar dataset${detail ? `: ${detail}` : ''}.`, 'Fechar', {
        duration: 6000,
      });
    } finally {
      this.preparingYolo.set(false);
      this.exportingYolo.set(false);
      this.downloadProgress.set(0);
    }
  }

  private buildYoloDialogData(
    selectedRecords: UploadRecord[],
    annotationsMap: Map<string, ImageAnnotation[]>,
  ): YoloExportDialogData {
    const allClasses = new Set<string>();
    const perUploadClasses = new Map<string, Set<string>>();
    const perImageClasses: ImageClassInfo[] = [];
    let totalImages = 0;
    let annotatedImages = 0;
    let unannotatedImages = 0;
    const unannotatedUploads: UploadLinkRef[] = [];

    for (const record of selectedRecords) {
      const annotations = annotationsMap.get(record.id) || [];

      const uploadClasses = extractAnnotationClasses(annotations);
      for (const cls of uploadClasses) {
        allClasses.add(cls);
      }
      perUploadClasses.set(record.id, new Set(uploadClasses));

      const annotationByIndex = new Map(annotations.map((a) => [a.imageIndex, a]));
      for (let i = 0; i < record.fileCount; i++) {
        totalImages++;
        const ann = annotationByIndex.get(i);
        const hasLabels = !!ann && extractYoloLabels(ann).length > 0;
        if (hasLabels) {
          annotatedImages++;
        } else {
          unannotatedImages++;
        }
        perImageClasses.push({
          classes: ann ? extractAnnotationClasses([ann]) : [],
          hasAnnotation: hasLabels,
        });
      }

      if (annotations.length === 0) {
        unannotatedUploads.push({
          docId: record.id,
          displayName: record.id,
        });
      }
    }

    const classMismatchDetails = this.buildClassMismatchDetails(
      selectedRecords,
      allClasses,
      perUploadClasses,
    );

    return {
      uploadCount: selectedRecords.length,
      totalImages,
      annotatedImages,
      unannotatedImages,
      globalClasses: [...allClasses].sort(),
      classMismatchDetails,
      unannotatedUploads,
      perImageClasses,
    };
  }

  private buildClassMismatchDetails(
    selectedRecords: UploadRecord[],
    allClasses: Set<string>,
    perUploadClasses: Map<string, Set<string>>,
  ): ClassMismatchDetail[] {
    if (perUploadClasses.size <= 1) return [];

    const details: ClassMismatchDetail[] = [];
    for (const cls of [...allClasses]) {
      const missingFrom: UploadLinkRef[] = [];
      const presentIn: UploadLinkRef[] = [];

      for (const record of selectedRecords) {
        const classes = perUploadClasses.get(record.id);
        const ref: UploadLinkRef = { docId: record.id, displayName: record.id };
        if (classes && classes.size > 0 && !classes.has(cls)) {
          missingFrom.push(ref);
        } else if (classes && classes.has(cls)) {
          presentIn.push(ref);
        }
      }

      if (missingFrom.length > 0) {
        details.push({ className: cls, missingFrom, presentIn });
      }
    }

    return details;
  }

  private getSelectedRecords(): UploadRecord[] {
    const selectedIds = this.selectedIds();
    return this.records().filter((r) => selectedIds.has(r.id));
  }

  private activeFilters(): UploadFilters | undefined {
    const filters: UploadFilters = { ...this.filters };
    // datetime-local inputs yield naive local strings ("2025-06-01T10:30");
    // the backend requires timezone-qualified ISO for date filters.
    filters.createdFrom = toUtcIsoOrNull(filters.createdFrom);
    filters.createdTo = toUtcIsoOrNull(filters.createdTo);
    filters.activityFrom = toUtcIsoOrNull(filters.activityFrom);
    filters.activityTo = toUtcIsoOrNull(filters.activityTo);

    const hasAny = Object.values(filters).some((v) => v !== undefined && v !== null && v !== '');
    return hasAny ? filters : undefined;
  }
}
