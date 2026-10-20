import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import {
  filterDetections,
  type Detection,
  type InferenceJobDetail,
  type InferenceJobImageResult,
  type InferenceJobListItem,
  type InferenceModelSummary,
} from '@agrolens/contracts';
import { InferenceService } from '../../../core/services/inference.service';
import { AnnotationsService } from '../../../core/services/annotations.service';

export interface PredictionPreview {
  uploadId: string;
  imageId: string;
  detections: Detection[];
  width: number | null;
  height: number | null;
}
export interface ApplyPredictions extends PredictionPreview {
  mode: 'append' | 'replace';
}

export interface AiAssistDialogData {
  uploadId: string;
  imageId: string;
  imageIds: string[];
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  runId?: string;
}

@Component({
  selector: 'app-ai-assist-panel',
  standalone: true,
  imports: [
    FormsModule,
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatIconModule,
    MatProgressBarModule,
    MatDialogModule,
  ],
  templateUrl: './ai-assist-panel.component.html',
  styleUrl: './ai-assist-panel.component.scss',
})
export class AiAssistPanelComponent {
  private readonly inference = inject(InferenceService);
  private readonly annotations = inject(AnnotationsService);
  private readonly destroyRef = inject(DestroyRef);
  readonly dialogRef = inject<MatDialogRef<AiAssistPanelComponent>>(MatDialogRef, {
    optional: true,
  });
  readonly data = inject<AiAssistDialogData>(MAT_DIALOG_DATA, { optional: true });
  readonly uploadId = input<string>(this.data?.uploadId ?? '');
  readonly imageId = input<string | null>(this.data?.imageId ?? null);
  readonly imageIds = input<string[]>(this.data?.imageIds ?? []);
  readonly imageUrl = this.data?.imageUrl ?? '';
  readonly imageRatio = computed(
    () =>
      `${this.result()?.width ?? this.data?.imageWidth ?? 1} / ${this.result()?.height ?? this.data?.imageHeight ?? 1}`,
  );
  readonly applyMode = signal<'append' | 'replace'>('append');
  readonly scopes = [
    {
      value: 'current',
      icon: 'image',
      title: 'Imagem atual',
      description: 'Revise uma imagem por vez.',
    },
    {
      value: 'unannotated',
      icon: 'filter_frames',
      title: 'Sem anotação salva',
      description: 'Comece pelas imagens pendentes.',
    },
    {
      value: 'all',
      icon: 'collections',
      title: 'Todas do upload',
      description: 'Gere sugestões para o conjunto.',
    },
  ] as const;
  readonly disabled = input(false);
  readonly apply = output<ApplyPredictions>();
  readonly previewChange = output<PredictionPreview | null>();
  readonly statesChange = output<Map<string, string>>();

  readonly models = signal<InferenceModelSummary[]>([]);
  readonly loadingModels = signal(true);
  readonly modelId = signal('');
  readonly scope = signal<'current' | 'unannotated' | 'all'>('current');
  readonly runs = signal<InferenceJobListItem[]>([]);
  readonly loadingRuns = signal(false);
  readonly moreRuns = signal(false);
  readonly job = signal<InferenceJobDetail | null>(null);
  readonly loadingJob = signal(false);
  readonly starting = signal(false);
  readonly result = signal<InferenceJobImageResult | null>(null);
  readonly loadingResult = signal(false);
  readonly error = signal('');
  readonly minConfidence = signal(0.2);
  readonly suppressOverlaps = signal(false);
  readonly showPreview = signal(true);
  readonly selectedModel = computed(() => this.models().find((m) => m.id === this.modelId()));
  readonly active = computed(() => ['queued', 'running'].includes(this.job()?.status ?? ''));
  readonly predictions = computed(() =>
    filterDetections(this.result()?.detections ?? [], {
      minConfidence: this.minConfidence(),
      suppressOverlaps: this.suppressOverlaps(),
      iouThreshold: 0.5,
    }),
  );
  readonly currentImageStatus = computed(
    () =>
      this.job()?.images.find((image) => image.uploadImageId === this.imageId())?.status ?? null,
  );
  private generation = 0;
  private runRequest = 0;
  readonly selectedRunId = signal<string | null>(null);
  private imageRequest = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly cache = new Map<string, InferenceJobImageResult>();

  constructor() {
    void this.loadModels();
    effect(() => {
      const uploadId = this.uploadId();
      this.stopPolling();
      const generation = ++this.generation;
      ++this.runRequest;
      ++this.imageRequest;
      this.result.set(null);
      this.selectedRunId.set(null);
      this.job.set(null);
      this.runs.set([]);
      this.cache.clear();
      this.error.set('');
      this.starting.set(false);
      this.loadingJob.set(false);
      void this.loadRuns(uploadId, generation);
      if (this.data?.runId) void this.openRun(this.data.runId);
    });
    effect(() => {
      const job = this.job();
      const imageId = this.imageId();
      const image = job?.images.find((image) => image.uploadImageId === imageId);
      if (image?.status === 'completed' && untracked(this.result)?.id === image.id) return;
      const request = ++this.imageRequest;
      this.result.set(null);
      this.showPreview.set(true);
      this.loadingResult.set(false);
      if (job && image?.status === 'completed') void this.loadResult(job.id, image.id, request);
    });
    effect(() => {
      const result = this.result();
      const imageId = this.imageId();
      this.previewChange.emit(
        this.showPreview() && result && result.uploadImageId === imageId
          ? {
              uploadId: this.uploadId(),
              imageId: imageId!,
              detections: this.predictions(),
              width: result.width,
              height: result.height,
            }
          : null,
      );
    });
    effect(() => {
      this.statesChange.emit(
        new Map(
          this.job()?.images.flatMap((image) =>
            image.uploadImageId ? [[image.uploadImageId, image.status] as const] : [],
          ) ?? [],
        ),
      );
    });
    this.destroyRef.onDestroy(() => {
      ++this.generation;
      ++this.imageRequest;
      this.stopPolling();
    });
  }

  async loadModels(): Promise<void> {
    this.loadingModels.set(true);
    this.error.set('');
    try {
      const models = await this.inference.listActiveModels();
      if (this.destroyRef.destroyed) return;
      this.models.set(models.filter((model) => model.task === 'detect'));
      if (!this.models().some((model) => model.id === this.modelId())) this.modelId.set('');
    } catch (error) {
      if (!this.destroyRef.destroyed) this.error.set(this.errorMessage(error));
    } finally {
      if (!this.destroyRef.destroyed) this.loadingModels.set(false);
    }
  }

  async loadRuns(
    uploadId = this.uploadId(),
    generation = this.generation,
    append = false,
  ): Promise<void> {
    this.loadingRuns.set(true);
    try {
      const offset = append ? this.runs().length : 0;
      const response = await this.inference.listJobs(20, offset, uploadId);
      if (generation !== this.generation) return;
      this.runs.set(append ? [...this.runs(), ...response.jobs] : response.jobs);
      this.moreRuns.set(offset + response.jobs.length < response.total);
    } catch (error) {
      if (generation === this.generation) this.error.set(this.errorMessage(error));
    } finally {
      if (generation === this.generation) this.loadingRuns.set(false);
    }
  }

  async start(): Promise<void> {
    if (!this.modelId() || this.disabled() || this.starting() || this.active() || this.loadingJob())
      return;
    const uploadId = this.uploadId();
    const modelId = this.modelId();
    const generation = this.generation;
    const scope = this.scope();
    let imageIds =
      scope === 'current' ? [this.imageId()].filter((id): id is string => !!id) : this.imageIds();
    this.starting.set(true);
    this.error.set('');
    try {
      if (scope === 'unannotated') {
        const saved = new Set(
          (await this.annotations.listUploadAnnotations(uploadId)).map((a) => a.imageId),
        );
        imageIds = imageIds.filter((id) => !saved.has(id));
      }
      if (generation !== this.generation) return;
      if (!imageIds.length) {
        this.error.set('Nenhuma imagem disponível neste escopo. Escolha outro escopo.');
        return;
      }
      const created = await this.inference.createUploadJob(modelId, uploadId, imageIds);
      if (generation !== this.generation) return;
      await this.openRun(created.id);
      if (generation === this.generation) void this.loadRuns();
    } catch (error) {
      if (generation === this.generation) this.error.set(this.errorMessage(error));
    } finally {
      if (generation === this.generation) this.starting.set(false);
    }
  }

  async openRun(id: string): Promise<void> {
    this.stopPolling();
    const generation = this.generation;
    const request = ++this.runRequest;
    this.selectedRunId.set(id);
    ++this.imageRequest;
    this.result.set(null);
    this.loadingResult.set(false);
    this.job.set(null);
    this.loadingJob.set(true);
    this.error.set('');
    try {
      await this.refreshJob(id, generation, request);
    } finally {
      if (generation === this.generation && request === this.runRequest) this.loadingJob.set(false);
    }
  }

  async refreshJob(
    id = this.selectedRunId(),
    generation = this.generation,
    request = this.runRequest,
  ): Promise<void> {
    if (!id) return;
    this.stopPolling();
    this.error.set('');
    try {
      const job = await this.inference.getJob(id);
      if (generation !== this.generation || request !== this.runRequest) return;
      if (
        job.uploadId !== this.uploadId() ||
        (job.expiresAt && new Date(job.expiresAt) <= new Date())
      ) {
        this.job.set(null);
        this.error.set(
          'Esta execução expirou ou não pertence ao upload selecionado. Gere novas sugestões.',
        );
        return;
      }
      this.job.set(job);
      if (['queued', 'running'].includes(job.status)) {
        this.timer = setTimeout(() => void this.refreshJob(id, generation, request), 2500);
      }
    } catch (error) {
      if (generation === this.generation && request === this.runRequest)
        this.error.set(this.errorMessage(error));
    }
  }

  async loadResult(jobId: string, imageId: string, request = ++this.imageRequest): Promise<void> {
    this.loadingResult.set(true);
    try {
      const key = `${jobId}:${imageId}`;
      const result = this.cache.get(key) ?? (await this.inference.getImage(jobId, imageId));
      if (request !== this.imageRequest || this.destroyRef.destroyed) return;
      this.cache.set(key, result);
      this.result.set(result);
    } catch (error) {
      if (request === this.imageRequest) this.error.set(this.errorMessage(error));
    } finally {
      if (request === this.imageRequest) this.loadingResult.set(false);
    }
  }

  applyPredictions(mode: 'append' | 'replace'): void {
    const result = this.result();
    const imageId = this.imageId();
    const expiresAt = this.job()?.expiresAt;
    if (expiresAt && new Date(expiresAt) <= new Date()) {
      this.error.set('Esta execução expirou. Gere novas sugestões.');
      return;
    }
    if (
      this.disabled() ||
      !result ||
      result.status !== 'completed' ||
      result.uploadImageId !== imageId ||
      !this.predictions().length
    )
      return;
    this.apply.emit({
      uploadId: this.uploadId(),
      imageId: imageId!,
      detections: this.predictions(),
      width: result.width,
      height: result.height,
      mode,
    });
    this.dialogRef?.close();
    this.showPreview.set(false);
  }

  private stopPolling(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 503)
        return 'Inferência indisponível. Tente novamente mais tarde ou continue rotulando manualmente.';
      if (error.status === 403) return 'Sem permissão para executar ou consultar esta inferência.';
      if (error.status === 404)
        return 'Modelo ou execução indisponível. Atualize a lista ou gere novas sugestões.';
      if (error.status === 400 || error.status === 409)
        return 'Não foi possível iniciar. Atualize os modelos e verifique se o upload está pronto, com imagens RGB dentro do limite de tamanho.';
    }
    return 'Não foi possível carregar a inferência. Tente novamente; seus rótulos não foram alterados.';
  }
}
