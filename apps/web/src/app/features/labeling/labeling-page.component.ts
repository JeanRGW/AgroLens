import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AnnotationsService } from '../../core/services/annotations.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { ExportService } from '../../core/services/export.service';
import { UploadsService } from '../../core/services/uploads.service';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { CropTypeRecord, EstadioRecord, PropertyRecord, TalhaoRecord } from '@agrolens/contracts';
import { UploadDetail, UploadFilters, UploadRecord } from '../../shared/models/upload-record';
import { ImageAnnotation, SaveAnnotationInput, YoloLabel } from '@agrolens/contracts';
import { extractAnnotationClasses, extractYoloLabels } from '../../shared/utils/record-utils';
import { compareImageIds } from '../../shared/utils/upload-utils';

import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { UploadSidebarComponent } from './components/upload-sidebar.component';
import { ClassPaletteComponent } from './components/class-palette.component';
import { ImageCanvasComponent, LabelCreateEvent } from './components/image-canvas.component';
import { LabelListPanelComponent } from './components/label-list-panel.component';
import {
  ImageClassInfo,
  UploadLinkRef,
  YoloExportDialogComponent,
  YoloExportDialogData,
} from '../uploads/yolo-export-dialog/yolo-export-dialog.component';

export interface UploadImageItem {
  index: number;
  imageId: string;
  imageUrl: string;
  fileId: string;
  thumbUrl?: string;
}

interface AnnotationSnapshot {
  classes: string[];
  labels: YoloLabel[];
}

const CLASS_COLOR_PALETTE = [
  '#E53935',
  '#43A047',
  '#1E88E5',
  '#FDD835',
  '#8E24AA',
  '#FB8C00',
  '#00ACC1',
  '#D81B60',
  '#3949AB',
  '#7CB342',
  '#5D4037',
  '#F4511E',
];

@Component({
  selector: 'app-labeling-page',
  standalone: true,
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTooltipModule,
    PageHeaderComponent,
    UploadSidebarComponent,
    ClassPaletteComponent,
    ImageCanvasComponent,
    LabelListPanelComponent,
  ],
  host: {
    '(document:keydown)': 'onKeyDown($event)',
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
  templateUrl: './labeling-page.component.html',
  styleUrl: './labeling-page.component.scss',
})
export class LabelingPageComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly uploadsService = inject(UploadsService);
  private readonly catalogsService = inject(CatalogsService);
  private readonly annotationsService = inject(AnnotationsService);
  private readonly exportService = inject(ExportService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly loadingUploads = signal(true);
  readonly loadingAnnotation = signal(false);
  readonly annotationLoadError = signal(false);
  readonly loadingImage = signal(false);
  readonly savingAnnotation = signal(false);
  readonly exportingYolo = signal(false);
  readonly showShortcuts = signal(false);

  readonly uploads = signal<UploadRecord[]>([]);
  readonly hasMoreUploads = signal(false);
  readonly selectedUploadId = signal<string | null>(null);
  readonly selectedImageIndex = signal(0);
  private uploadsOffset = 0;
  private uploadsGeneration = 0;

  readonly filterPropertyId = signal('');
  readonly filterTalhaoId = signal('');
  readonly filterCropTypeId = signal('');
  readonly filterEstadioId = signal('');

  readonly properties = signal<PropertyRecord[]>([]);
  readonly talhoes = signal<TalhaoRecord[]>([]);
  readonly cropTypes = signal<CropTypeRecord[]>([]);
  readonly estadios = signal<EstadioRecord[]>([]);

  readonly classes = signal<string[]>(['objeto']);
  readonly selectedClass = signal('objeto');
  readonly labels = signal<YoloLabel[]>([]);
  readonly selectedLabelIndex = signal<number | null>(null);

  imageNaturalWidth = 0;
  imageNaturalHeight = 0;

  private readonly history = signal<AnnotationSnapshot[]>([{ classes: ['objeto'], labels: [] }]);
  private readonly historyIndex = signal(0);

  private uploadDetailCache = new Map<string, UploadDetail>();
  private readonly imageUrlCache = signal(new Map<string, string>());
  private readonly thumbUrlCache = signal(new Map<string, string>());
  private currentUploadDetail = signal<UploadDetail | null>(null);
  private selectionGeneration = 0;
  private initialUploadHandled = false;
  private readonly retriedImageUrls = new Set<string>();
  private readonly savedAnnotation = signal<string | null>(null);
  readonly hasUnsavedChanges = computed(() => {
    const saved = this.savedAnnotation();
    return saved !== null && saved !== this.annotationSnapshot();
  });

  private annotationSnapshot(): string {
    return JSON.stringify({ classes: this.classes(), labels: this.labels() });
  }

  async canDeactivate(): Promise<boolean> {
    if (this.savingAnnotation()) return false;
    if (!this.hasUnsavedChanges()) return true;
    return !!(await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            title: 'Descartar alterações?',
            message: 'Os rótulos ainda não foram salvos. Deseja sair sem salvar?',
            confirmText: 'Descartar',
          },
        })
        .afterClosed(),
    ));
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges() || this.savingAnnotation()) event.preventDefault();
  }

  readonly filteredTalhoes = computed(() => {
    const pid = this.filterPropertyId();
    return pid ? this.talhoes().filter((t) => t.propertyId === pid) : this.talhoes();
  });

  readonly filteredEstadios = computed(() => {
    const ctid = this.filterCropTypeId();
    return ctid ? this.estadios().filter((e) => e.cropTypeId === ctid) : this.estadios();
  });

  readonly annotatedIndexes = signal<Set<string>>(new Set());

  readonly selectedUpload = computed(() => {
    const id = this.selectedUploadId();
    return id ? (this.uploads().find((u) => u.id === id) ?? null) : null;
  });

  readonly selectedUploadImages = computed<UploadImageItem[]>(() => {
    const detail = this.currentUploadDetail();
    if (!detail) {
      return [];
    }
    const urlCache = this.imageUrlCache();
    const thumbCache = this.thumbUrlCache();
    const previewByImageId = new Map<string, string>();
    for (const f of detail.files) {
      if (f.variant === 'preview') {
        const url = thumbCache.get(f.id);
        if (url) {
          previewByImageId.set(f.imageId, url);
        }
      }
    }
    return detail.files
      .filter((f) => f.variant === 'original')
      .sort((a, b) => compareImageIds(a.imageId, b.imageId))
      .map((f, index) => ({
        index,
        imageId: f.imageId,
        imageUrl: urlCache.get(f.id) ?? '',
        fileId: f.id,
        thumbUrl: previewByImageId.get(f.imageId),
      }));
  });

  readonly selectedImage = computed(() => {
    const images = this.selectedUploadImages();
    return images.find((i) => i.index === this.selectedImageIndex()) ?? null;
  });

  readonly selectedImageUrl = computed(() => this.selectedImage()?.imageUrl ?? null);

  readonly classColors = computed(() => {
    const map = new Map<string, string>();
    this.classes().forEach((c, i) => {
      map.set(c, CLASS_COLOR_PALETTE[i % CLASS_COLOR_PALETTE.length]);
    });
    return map;
  });

  readonly canUndo = computed(() => this.historyIndex() > 0);
  readonly canRedo = computed(() => this.historyIndex() < this.history().length - 1);

  ngOnInit(): void {
    void this.loadMetadataCatalogs();
    void this.loadUploads();
  }

  async loadUploads(reset = true): Promise<void> {
    if (reset && !(await this.canDeactivate())) return;
    if (reset && this.hasUnsavedChanges()) {
      const saved = JSON.parse(this.savedAnnotation()!) as {
        classes: string[];
        labels: YoloLabel[];
      };
      this.classes.set(saved.classes);
      this.labels.set(saved.labels);
      this.history.set([saved]);
      this.historyIndex.set(0);
      this.selectedLabelIndex.set(null);
    }
    const generation = ++this.uploadsGeneration;
    if (reset) {
      this.uploadsOffset = 0;
    }
    this.loadingUploads.set(true);
    try {
      const filters = this.buildUploadFilters();
      const result = await this.uploadsService.listUploads(filters, 50, this.uploadsOffset);
      if (generation !== this.uploadsGeneration) return;
      if (reset) {
        this.uploads.set(result.records);
        if (
          this.selectedUploadId() &&
          !result.records.some((upload) => upload.id === this.selectedUploadId())
        ) {
          this.selectionGeneration++;
          this.selectedUploadId.set(null);
          this.currentUploadDetail.set(null);
          this.clearStateAndHistory();
        }
      } else {
        this.uploads.update((existing) => {
          const ids = new Set(existing.map((upload) => upload.id));
          return [...existing, ...result.records.filter((upload) => !ids.has(upload.id))];
        });
      }
      const newOffset = this.uploadsOffset + result.records.length;
      this.hasMoreUploads.set(newOffset < result.total);
      this.uploadsOffset = newOffset;

      if (reset && !this.selectedUploadId()) {
        const targetId = this.initialUploadHandled
          ? null
          : this.route.snapshot.queryParamMap.get('uploadId');
        this.initialUploadHandled = true;
        let target = targetId ? result.records.find((u) => u.id === targetId) : undefined;
        if (targetId && !target) {
          const detail = await this.uploadsService.getUpload(targetId);
          if (generation !== this.uploadsGeneration) return;
          if (
            detail.status !== 'ready' ||
            (!this.authService.isAdmin() && detail.userId !== this.authService.user()?.id)
          ) {
            throw new Error('Upload indisponível para rotulagem.');
          }
          target = {
            ...detail,
            fileCount: detail.files.filter((file) => file.variant === 'original').length,
          };
          this.uploadDetailCache.set(targetId, detail);
          this.uploads.update((records) => [target!, ...records]);
        }
        const selected = target ?? result.records[0];
        if (selected) await this.selectUpload(selected);
      }
    } catch (e) {
      if (generation !== this.uploadsGeneration) return;
      console.error(e);
      this.snackBar.open('Falha ao carregar uploads para rotulagem.', 'Fechar', { duration: 3000 });
    } finally {
      if (generation === this.uploadsGeneration) {
        this.loadingUploads.set(false);
      }
    }
  }

  onFilterChange(): void {
    void this.loadUploads(true);
  }

  async loadMoreUploads(): Promise<void> {
    await this.loadUploads(false);
  }

  onPropertyChange(propertyId: string): void {
    this.filterPropertyId.set(propertyId);
    const talhaoStillValid =
      !propertyId ||
      !this.filterTalhaoId() ||
      this.talhoes().some((t) => t.id === this.filterTalhaoId() && t.propertyId === propertyId);
    if (!talhaoStillValid) {
      this.filterTalhaoId.set('');
    }
    this.onFilterChange();
  }

  onCropTypeChange(cropTypeId: string): void {
    this.filterCropTypeId.set(cropTypeId);
    const estadioStillValid =
      !cropTypeId ||
      !this.filterEstadioId() ||
      this.estadios().some((e) => e.id === this.filterEstadioId() && e.cropTypeId === cropTypeId);
    if (!estadioStillValid) {
      this.filterEstadioId.set('');
    }
    this.onFilterChange();
  }

  private async loadMetadataCatalogs(): Promise<void> {
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
      this.properties.set([]);
      this.talhoes.set([]);
      this.cropTypes.set([]);
      this.estadios.set([]);
    }
  }

  private buildUploadFilters(): UploadFilters {
    return {
      userId: this.authService.isAdmin() ? undefined : this.authService.user()?.id,
      propertyId: this.filterPropertyId() || undefined,
      talhaoId: this.filterTalhaoId() || undefined,
      cropTypeId: this.filterCropTypeId() || undefined,
      estadioId: this.filterEstadioId() || undefined,
    };
  }

  async selectUpload(upload: UploadRecord): Promise<void> {
    if (this.selectedUploadId() === upload.id) {
      return;
    }
    if (!(await this.canDeactivate())) return;
    const generation = ++this.selectionGeneration;
    this.selectedUploadId.set(upload.id);
    this.selectedImageIndex.set(0);
    this.currentUploadDetail.set(null);
    this.retriedImageUrls.clear();
    this.annotatedIndexes.set(new Set());
    this.clearStateAndHistory();
    this.annotationLoadError.set(false);
    this.loadingAnnotation.set(true);
    await this.loadUploadDetail(upload.id, generation);
    if (generation !== this.selectionGeneration) return;
    await this.loadUploadAnnotations(upload.id, generation);
    if (generation !== this.selectionGeneration) return;
    await this.loadCurrentAnnotation(generation);
  }

  private async loadUploadDetail(uploadId: string, generation: number): Promise<void> {
    try {
      let detail = this.uploadDetailCache.get(uploadId);
      if (!detail) {
        detail = await this.uploadsService.getUpload(uploadId);
        this.uploadDetailCache.set(uploadId, detail);
      }
      if (generation !== this.selectionGeneration) return;
      this.currentUploadDetail.set(detail);

      // Load signed URLs for all original images
      const originalFiles = detail.files.filter((f) => f.variant === 'original');
      const urlEntries = await Promise.all(
        originalFiles.map(async (file) => {
          try {
            const { downloadUrl } = await this.uploadsService.getDownloadUrl(uploadId, file.id);
            return [file.id, downloadUrl] as const;
          } catch {
            // Image URL will be empty — handled gracefully by canvas
            return null;
          }
        }),
      );
      // Build new map with all resolved URLs to trigger reactive update
      const newMap = new Map(this.imageUrlCache());
      for (const entry of urlEntries) {
        if (entry) {
          newMap.set(entry[0], entry[1]);
        }
      }
      if (generation !== this.selectionGeneration) return;
      this.imageUrlCache.set(newMap);

      // Load signed URLs for preview files (used as thumbnails)
      const previewFiles = detail.files.filter((f) => f.variant === 'preview');
      if (previewFiles.length > 0) {
        const thumbEntries = await Promise.all(
          previewFiles.map(async (file) => {
            try {
              const resp = await this.uploadsService.getPreviewUrl(uploadId, file.id);
              return [file.id, resp.downloadUrl] as const;
            } catch {
              return null;
            }
          }),
        );
        const newThumbMap = new Map(this.thumbUrlCache());
        for (const entry of thumbEntries) {
          if (entry) {
            newThumbMap.set(entry[0], entry[1]);
          }
        }
        if (generation === this.selectionGeneration) {
          this.thumbUrlCache.set(newThumbMap);
        }
      }
    } catch {
      if (generation !== this.selectionGeneration) return;
      this.currentUploadDetail.set(null);
      this.snackBar.open('Falha ao carregar detalhes do upload.', 'Fechar', { duration: 3000 });
    }
  }

  private async loadUploadAnnotations(uploadId: string, generation: number): Promise<void> {
    try {
      const annotations = await this.annotationsService.listUploadAnnotations(uploadId);
      if (generation === this.selectionGeneration) {
        this.annotatedIndexes.set(new Set(annotations.map((a) => a.imageId)));
      }
    } catch {
      if (generation === this.selectionGeneration) {
        this.annotatedIndexes.set(new Set());
      }
    }
  }

  async selectImage(index: number): Promise<void> {
    if (this.selectedImageIndex() === index) {
      return;
    }
    if (!(await this.canDeactivate())) return;
    const generation = ++this.selectionGeneration;
    this.selectedImageIndex.set(index);
    this.clearStateAndHistory();
    this.annotationLoadError.set(false);
    await this.loadCurrentAnnotation(generation);
  }

  async goToPrevImage(): Promise<void> {
    const idx = this.selectedImageIndex();
    if (idx > 0) {
      await this.selectImage(idx - 1);
    }
  }

  async goToNextImage(): Promise<void> {
    const idx = this.selectedImageIndex();
    const max = this.selectedUploadImages().length - 1;
    if (idx < max) {
      await this.selectImage(idx + 1);
    }
  }

  onImageLoad(imageElement: HTMLImageElement): void {
    this.retriedImageUrls.delete(`false:${this.selectedImage()?.fileId}`);
    this.imageNaturalWidth = imageElement.naturalWidth || 0;
    this.imageNaturalHeight = imageElement.naturalHeight || 0;
  }

  async refreshImageUrl(fileId = this.selectedImage()?.fileId, preview = false): Promise<void> {
    const uploadId = this.selectedUploadId();
    const key = `${preview}:${fileId}`;
    if (!uploadId || !fileId || this.retriedImageUrls.has(key)) return;
    this.retriedImageUrls.add(key);
    const generation = this.selectionGeneration;
    try {
      const { downloadUrl } = preview
        ? await this.uploadsService.getPreviewUrl(uploadId, fileId)
        : await this.uploadsService.getDownloadUrl(uploadId, fileId);
      if (generation !== this.selectionGeneration) return;
      const cache = preview ? this.thumbUrlCache : this.imageUrlCache;
      cache.update((urls) => new Map(urls).set(fileId, downloadUrl));
    } catch {
      if (generation !== this.selectionGeneration) return;
      this.snackBar.open('Não foi possível recarregar a imagem.', 'Fechar', { duration: 3000 });
    }
  }

  refreshThumbnail(index: number): void {
    const file = this.currentUploadDetail()?.files.find(
      (file) =>
        file.variant === 'preview' && file.imageId === this.selectedUploadImages()[index]?.imageId,
    );
    if (file) void this.refreshImageUrl(file.id, true);
  }

  onLabelCreate(event: LabelCreateEvent): void {
    this.commitLabels([
      ...this.labels(),
      {
        classId: event.classId,
        className: event.className,
        xCenter: event.xCenter,
        yCenter: event.yCenter,
        width: event.width,
        height: event.height,
      },
    ]);
  }

  onPickLabel(index: number): void {
    if (index === -1) {
      this.selectedLabelIndex.set(null);
    } else {
      this.selectedLabelIndex.set(index);
    }
  }

  removeSelectedLabel(): void {
    const idx = this.selectedLabelIndex();
    if (idx === null) {
      return;
    }
    this.removeLabelAt(idx);
  }

  removeLabelAt(index: number): void {
    this.commitLabels(this.labels().filter((_, i) => i !== index));
    this.selectedLabelIndex.set(null);
  }

  clearLabels(): void {
    this.commitLabels([]);
    this.selectedLabelIndex.set(null);
  }

  undo(): void {
    if (!this.canUndo()) {
      return;
    }
    const nextIndex = this.historyIndex() - 1;
    this.historyIndex.set(nextIndex);
    this.restoreSnapshot(this.history()[nextIndex]);
    this.selectedLabelIndex.set(null);
  }

  redo(): void {
    if (!this.canRedo()) {
      return;
    }
    const nextIndex = this.historyIndex() + 1;
    this.historyIndex.set(nextIndex);
    this.restoreSnapshot(this.history()[nextIndex]);
    this.selectedLabelIndex.set(null);
  }

  private restoreSnapshot(snapshot: AnnotationSnapshot): void {
    this.classes.set([...snapshot.classes]);
    this.labels.set([...snapshot.labels]);
    if (!snapshot.classes.includes(this.selectedClass())) {
      this.selectedClass.set(snapshot.classes[0]);
    }
  }

  private commitLabels(nextLabels: YoloLabel[], classes = this.classes()): void {
    const currentHistory = this.history().slice(0, this.historyIndex() + 1);
    currentHistory.push({ classes: [...classes], labels: [...nextLabels] });
    if (currentHistory.length > 50) {
      currentHistory.shift();
    }
    this.history.set(currentHistory);
    this.historyIndex.set(currentHistory.length - 1);
    this.labels.set([...nextLabels]);
    this.classes.set([...classes]);
  }

  private clearStateAndHistory(): void {
    this.savedAnnotation.set(null);
    this.labels.set([]);
    this.selectedLabelIndex.set(null);
    this.history.set([{ classes: [...this.classes()], labels: [] }]);
    this.historyIndex.set(0);
  }

  onSelectClass(className: string): void {
    this.selectedClass.set(className);
  }

  onAddClass(className: string): void {
    if (this.classes().includes(className)) {
      return;
    }
    this.commitLabels(this.labels(), [...this.classes(), className]);
    this.selectedClass.set(className);
  }

  onRemoveClass(className: string): void {
    const current = this.classes();
    if (current.length <= 1) {
      return;
    }
    const next = current.filter((c) => c !== className);
    if (this.selectedClass() === className) {
      this.selectedClass.set(next[0]);
    }
    this.commitLabels(
      this.labels().map((label) => {
        const name = label.className === className ? next[0] : label.className;
        const classId = next.indexOf(name);
        return {
          ...label,
          className: name,
          classId: classId >= 0 ? classId : 0,
        };
      }),
      next,
    );
  }

  async saveCurrentAnnotation(): Promise<void> {
    const upload = this.selectedUpload();
    const image = this.selectedImage();
    if (
      !upload ||
      !image ||
      this.savingAnnotation() ||
      this.loadingAnnotation() ||
      this.annotationLoadError()
    ) {
      return;
    }
    const generation = this.selectionGeneration;
    const snapshot = this.annotationSnapshot();
    this.savingAnnotation.set(true);
    try {
      const input: SaveAnnotationInput = {
        imageId: image.imageId,
        imageWidth: this.imageNaturalWidth,
        imageHeight: this.imageNaturalHeight,
        classes: this.classes(),
        labels: this.labels(),
      };
      await this.annotationsService.upsertAnnotation(upload.id, input);
      if (generation !== this.selectionGeneration) return;
      this.savedAnnotation.set(snapshot);
      this.annotatedIndexes.update((set) => {
        const next = new Set(set);
        next.add(image.imageId);
        return next;
      });
      this.snackBar.open('Rótulos salvos com sucesso.', 'Fechar', { duration: 2400 });
    } catch {
      this.snackBar.open('Não foi possível salvar os rótulos.', 'Fechar', { duration: 3000 });
    } finally {
      this.savingAnnotation.set(false);
    }
  }

  async loadCurrentAnnotation(generation = this.selectionGeneration): Promise<void> {
    const upload = this.selectedUpload();
    const image = this.selectedImage();
    if (!upload || !image || generation !== this.selectionGeneration) {
      if (generation === this.selectionGeneration) {
        this.loadingAnnotation.set(false);
      }
      return;
    }
    this.loadingAnnotation.set(true);
    this.annotationLoadError.set(false);
    try {
      const annotation = await this.annotationsService.getAnnotation(upload.id, image.imageId);
      if (generation !== this.selectionGeneration) return;
      if (!annotation) {
        this.clearStateAndHistory();
        this.savedAnnotation.set(this.annotationSnapshot());
        return;
      }
      this.classes.set(this.buildClassesFromAnnotation(annotation));
      this.labels.set(extractYoloLabels(annotation));
      this.history.set([{ classes: [...this.classes()], labels: [...this.labels()] }]);
      this.historyIndex.set(0);
      this.savedAnnotation.set(this.annotationSnapshot());
      if (!this.classes().includes(this.selectedClass())) {
        this.selectedClass.set(this.classes()[0]);
      }
    } catch {
      if (generation !== this.selectionGeneration) return;
      this.annotationLoadError.set(true);
      this.snackBar.open('Falha ao carregar a anotação da imagem.', 'Fechar', { duration: 3000 });
    } finally {
      if (generation === this.selectionGeneration) {
        this.loadingAnnotation.set(false);
      }
    }
  }

  private buildClassesFromAnnotation(annotation: ImageAnnotation): string[] {
    if (annotation.classes.length > 0) {
      return annotation.classes;
    }
    const byIndex = new Map<number, string>();
    for (const label of extractYoloLabels(annotation)) {
      byIndex.set(label.classId, label.className || `classe-${label.classId}`);
    }
    if (byIndex.size === 0) {
      return ['objeto'];
    }
    return [...byIndex.entries()]
      .sort((left, right) => left[0] - right[0])
      .map((entry) => entry[1]);
  }

  onKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.removeSelectedLabel();
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      void this.goToPrevImage();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      void this.goToNextImage();
      return;
    }

    const num = parseInt(event.key, 10);
    if (!isNaN(num) && num >= 1 && num <= 9) {
      const className = this.classes()[num - 1];
      if (className) {
        this.selectedClass.set(className);
      }
    }
  }

  async exportSelectedUploadYolo(): Promise<void> {
    const upload = this.selectedUpload();
    if (!upload) {
      return;
    }

    this.exportingYolo.set(true);
    try {
      const annotations = await this.annotationsService.listUploadAnnotations(upload.id);
      if (annotations.length === 0) {
        this.snackBar.open('Não existem rótulos salvos para este upload.', 'Fechar', {
          duration: 2800,
        });
        return;
      }

      // Build dialog data for single upload
      const allClasses = new Set<string>();
      const perImageClasses: ImageClassInfo[] = [];
      let annotatedImages = 0;
      let unannotatedImages = 0;

      for (const cls of extractAnnotationClasses(annotations)) {
        allClasses.add(cls);
      }

      const annotationByImageId = new Map(annotations.map((a) => [a.imageId, a]));
      for (const image of this.selectedUploadImages()) {
        const ann = annotationByImageId.get(image.imageId);
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

      const dialogData: YoloExportDialogData = {
        uploadCount: 1,
        totalImages: upload.fileCount,
        annotatedImages,
        unannotatedImages,
        globalClasses: [...allClasses].sort(),
        classMismatchDetails: [],
        unannotatedUploads:
          annotations.length === 0
            ? [{ docId: upload.id, displayName: upload.id } as UploadLinkRef]
            : [],
        perImageClasses,
      };

      this.exportingYolo.set(false);

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
      const annotationsMap = new Map<string, ImageAnnotation[]>([[upload.id, annotations]]);

      const result = await this.exportService.exportYoloDataset([upload], options, annotationsMap);

      const message =
        result.skipped > 0
          ? `Conjunto de dados exportado: ${result.downloaded} ${result.downloaded === 1 ? 'imagem' : 'imagens'} (treino: ${result.trainCount}, validação: ${result.valCount}), ${result.skipped} ${result.skipped === 1 ? 'imagem ignorada' : 'imagens ignoradas'}.`
          : `Conjunto de dados exportado: ${result.downloaded} ${result.downloaded === 1 ? 'imagem' : 'imagens'} (treino: ${result.trainCount}, validação: ${result.valCount}).`;

      this.snackBar.open(message, 'Fechar', { duration: 3000 });
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      this.snackBar.open(
        `Erro ao exportar conjunto de dados${detail ? `: ${detail}` : ''}.`,
        'Fechar',
        {
          duration: 3000,
        },
      );
    } finally {
      this.exportingYolo.set(false);
    }
  }
}
