import { inject, Injectable } from '@angular/core';
import { UploadsService } from './uploads.service';
import { PresignedUploadResult, PresignedUploadService } from './presigned-upload.service';
import { InitUploadRequest, UploadDetail } from '../../shared/models/upload-record';
import { HttpContext, HttpErrorResponse } from '@angular/common/http';
import { EXPECTED_USER_ID } from '../interceptors/auth-context';

export class UploadFileTransferError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'UploadFileTransferError';
  }
}

export class UploadProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadProcessingError';
  }
}

export interface UploadCreateOptions {
  userId: string;
  assertIdentity: () => void;
  onInitialized: (uploadId: string) => Promise<void>;
}

export interface UploadCreateProgress {
  phase: 'init' | 'uploading' | 'completing' | 'finalizing' | 'ready' | 'failed';
  message: string;
  uploadId?: string;
  filesUploaded: number;
  totalFiles: number;
  pollAttempts: number;
}

/**
 * Orchestrates the full upload creation flow:
 *   1. POST /uploads/init  — get presigned URLs
 *   2. PUT each file to its presigned URL
 *   3. POST /uploads/:id/complete
 *   4. Poll GET /uploads/:id until ready or failed
 *
 * Designed to be testable: all network calls go through UploadsService
 * and the browser fetch API (which can be stubbed in tests).
 */
@Injectable({
  providedIn: 'root',
})
export class UploadCreateService {
  private readonly uploadsService = inject(UploadsService);
  private readonly presignedUpload = inject(PresignedUploadService);

  // Include request latency in the budget so polling cannot monopolize a local batch's lock.
  static readonly POLL_BUDGET_MS = 30000;
  static readonly POLL_REQUEST_TIMEOUT_MS = 5000;

  /** Interval between status-polling requests in milliseconds. */
  static readonly POLL_INTERVAL_MS = 2000;

  /**
   * Run the full upload creation pipeline.
   *
   * @param request  The init-upload payload (metadata + file descriptors).
   * @param files    The actual File objects to upload (index must match request.files).
   * @param onProgress  Optional callback invoked with progress updates.
   * @returns The final ready-or-failed UploadDetail once polling terminates.
   */
  async createUpload(
    request: InitUploadRequest,
    files: File[],
    onProgress?: (progress: UploadCreateProgress) => void,
    options?: UploadCreateOptions,
  ): Promise<UploadDetail> {
    const context = options ? new HttpContext().set(EXPECTED_USER_ID, options.userId) : undefined;
    options?.assertIdentity();
    // ── 1. Init ──────────────────────────────────────────────────────────
    this.emitProgress(onProgress, 'init', 'Inicializando upload...', 0, files.length, 0);
    const initResult = await (context
      ? this.uploadsService.initUpload(request, context)
      : this.uploadsService.initUpload(request));
    options?.assertIdentity();
    await options?.onInitialized(initResult.uploadId);

    const fileInstructions = initResult.files;
    if (!Array.isArray(fileInstructions) || fileInstructions.length !== files.length) {
      throw new Error('Resposta do servidor inválida: instruções de arquivo incompletas');
    }
    const localFiles = new Map(
      request.files.map((descriptor, index) => [descriptor.imageId, files[index]]),
    );
    if (
      localFiles.size !== files.length ||
      new Set(fileInstructions.map((instruction) => instruction.imageId)).size !== files.length
    ) {
      throw new Error('Resposta do servidor inválida: IDs de imagem duplicados');
    }

    if (initResult.status === 'ready') {
      this.emitProgress(onProgress, 'ready', 'Upload concluído!', files.length, files.length, 0);
      return context
        ? this.uploadsService.getUpload(initResult.uploadId, context)
        : this.uploadsService.getUpload(initResult.uploadId);
    }

    if (initResult.status === 'finalizing') {
      this.emitProgress(
        onProgress,
        'finalizing',
        'Processando prévias...',
        files.length,
        files.length,
        0,
      );
      return this.pollUntilReady(initResult.uploadId, onProgress, files.length, options);
    }

    // ── 2. Upload each file to its presigned URL ─────────────────────────
    for (let i = 0; i < fileInstructions.length; i++) {
      options?.assertIdentity();
      const instruction = fileInstructions[i];
      const file = localFiles.get(instruction.imageId);
      if (!file) {
        throw new Error(`Arquivo da imagem ${instruction.imageId} não encontrado na seleção`);
      }

      this.emitProgress(
        onProgress,
        'uploading',
        `Enviando arquivo ${i + 1} de ${fileInstructions.length}...`,
        i,
        files.length,
        0,
      );

      // Skip files already uploaded (empty uploadUrl indicates already-uploaded on retry)
      if (!instruction.uploadUrl) {
        continue;
      }

      const headers: Record<string, string> = {
        'Content-Type': file.type || 'image/jpeg',
        ...(instruction.headers ?? {}),
      };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180000);
      let uploadResult: PresignedUploadResult;
      try {
        uploadResult = await this.presignedUpload.putFile(instruction.uploadUrl, file, {
          method: instruction.method || 'PUT',
          headers,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      options?.assertIdentity();

      if (!uploadResult.ok) {
        throw new UploadFileTransferError(
          uploadResult.status,
          `Falha ao enviar arquivo ${i + 1} (${file.name}): ${uploadResult.status} ${uploadResult.statusText}`,
        );
      }
    }

    // ── 3. Complete (triggers backend finalization) ──────────────────────
    this.emitProgress(
      onProgress,
      'completing',
      'Finalizando upload...',
      files.length,
      files.length,
      0,
    );
    options?.assertIdentity();
    try {
      await (context
        ? this.uploadsService.completeUpload(initResult.uploadId, context)
        : this.uploadsService.completeUpload(initResult.uploadId));
    } catch (error) {
      // A concurrent completion can return 409 after the upload started finalizing.
      if (!(error instanceof HttpErrorResponse) || error.status !== 409) throw error;
    }

    // ── 4. Poll until ready or failed ────────────────────────────────────
    this.emitProgress(
      onProgress,
      'finalizing',
      'Processando prévias...',
      files.length,
      files.length,
      0,
    );
    return this.pollUntilReady(initResult.uploadId, onProgress, files.length, options);
  }

  // ── Private helpers ───────────────────────────────────────────────────

  private async pollUntilReady(
    uploadId: string,
    onProgress: ((p: UploadCreateProgress) => void) | undefined,
    totalFiles: number,
    options?: UploadCreateOptions,
  ): Promise<UploadDetail> {
    let attempts = 0;
    const deadline = Date.now() + UploadCreateService.POLL_BUDGET_MS;
    const context = options ? new HttpContext().set(EXPECTED_USER_ID, options.userId) : undefined;

    while (Date.now() < deadline) {
      attempts++;

      options?.assertIdentity();
      const detail = await this.uploadsService.getUpload(
        uploadId,
        context,
        Math.min(UploadCreateService.POLL_REQUEST_TIMEOUT_MS, deadline - Date.now()),
      );
      options?.assertIdentity();

      if (detail.status === 'ready') {
        this.emitProgress(
          onProgress,
          'ready',
          'Upload concluído!',
          totalFiles,
          totalFiles,
          attempts,
        );
        return detail;
      }

      if (detail.status === 'failed') {
        this.emitProgress(
          onProgress,
          'failed',
          detail.errorMessage || 'Falha no processamento do upload',
          totalFiles,
          totalFiles,
          attempts,
        );
        throw new UploadProcessingError(detail.errorMessage || 'Falha no processamento do upload');
      }

      this.emitProgress(
        onProgress,
        'finalizing',
        `Processando... (consulta ${attempts})`,
        totalFiles,
        totalFiles,
        attempts,
      );

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await this.delay(Math.min(UploadCreateService.POLL_INTERVAL_MS, remaining));
    }

    throw new Error(
      'O servidor ainda está processando o lote. Ele continua salvo para uma nova tentativa.',
    );
  }

  private emitProgress(
    cb: ((p: UploadCreateProgress) => void) | undefined,
    phase: UploadCreateProgress['phase'],
    message: string,
    filesUploaded: number,
    totalFiles: number,
    pollAttempts: number,
  ): void {
    cb?.({ phase, message, filesUploaded, totalFiles, pollAttempts });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
