import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { InferenceRepository, type InferenceModel } from '../database/repositories';
import { StorageService } from '../storage/storage.service';
import type { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import type { InitModelDto } from './dto/init-model.dto';
import type { UpdateModelDto } from './dto/update-model.dto';
import type { SetActiveModelDto } from './dto/set-active-model.dto';
import type { ModelResponse, ModelInitResponse } from './inference-job.service';

@Injectable()
export class InferenceModelService {
  private readonly modelMaxSizeBytes: number;
  private readonly modelUploadExpirySeconds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly inferenceRepository: InferenceRepository,
    private readonly storageService: StorageService,
  ) {
    this.modelMaxSizeBytes = this.configService.get<number>(
      'INFERENCE_MODEL_MAX_SIZE_BYTES',
      500 * 1024 * 1024,
    );
    this.modelUploadExpirySeconds =
      this.configService.get<number>('INFERENCE_UPLOAD_EXPIRY_HOURS', 24) * 3600;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Model management (admin)
  // ═══════════════════════════════════════════════════════════════════

  async initModel(dto: InitModelDto, currentUser: AuthenticatedUser): Promise<ModelInitResponse> {
    this.assertAdmin(currentUser);

    const modelId = randomUUID();
    const objectKey = `models/${modelId}/best.pt`;

    const model = await this.inferenceRepository.createModel(
      {
        name: dto.name,
        version: dto.version,
        description: dto.description ?? null,
        objectKey,
        sizeBytes: 0,
        status: 'uploading',
        createdByUserId: currentUser.sub,
      },
      { actorUserId: currentUser.sub, metadata: { name: dto.name, version: dto.version } },
    );

    const { url, headers, expiresAt } = await this.storageService.getPresignedPutUrl(
      objectKey,
      'application/octet-stream',
      this.modelUploadExpirySeconds,
    );

    return { id: model.id, uploadUrl: url, headers, objectKey, expiresAt };
  }

  async completeModel(modelId: string, currentUser: AuthenticatedUser): Promise<ModelResponse> {
    this.assertAdmin(currentUser);

    const model = await this.inferenceRepository.findModelById(modelId);
    if (!model) throw new NotFoundException('Model not found');

    if (model.status !== 'uploading') {
      throw new ConflictException(`Model is in "${model.status}" status, cannot complete upload`);
    }

    const head = await this.storageService.headObject(model.objectKey);
    if (!head.exists) {
      throw new BadRequestException('Model file not found in storage');
    }

    const sizeBytes = head.contentLength ?? 0;
    if (sizeBytes > this.modelMaxSizeBytes) {
      throw new BadRequestException(
        `Model file size ${sizeBytes} exceeds maximum of ${this.modelMaxSizeBytes} bytes`,
      );
    }

    // The worker records the checksum after validating the uploaded model.
    const updated = await this.inferenceRepository.updateModel(
      model.id,
      {
        status: 'validating',
        sizeBytes,
      },
      { actorUserId: currentUser.sub, eventType: 'model_complete', metadata: { sizeBytes } },
    );

    if (!updated) throw new NotFoundException('Model not found after update');

    return this.toModelResponse(updated);
  }

  async listModels(currentUser: AuthenticatedUser): Promise<ModelResponse[]> {
    this.assertAdmin(currentUser);
    const models = await this.inferenceRepository.listAllModels();
    return models.map((m) => this.toModelResponse(m));
  }

  async updateModel(
    modelId: string,
    dto: UpdateModelDto,
    currentUser: AuthenticatedUser,
  ): Promise<ModelResponse> {
    this.assertAdmin(currentUser);

    const model = await this.inferenceRepository.findModelById(modelId);
    if (!model) throw new NotFoundException('Model not found');

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;

    if (Object.keys(updateData).length === 0) {
      return this.toModelResponse(model);
    }

    const updated = await this.inferenceRepository.updateModel(
      model.id,
      updateData as Partial<InferenceModel>,
      { actorUserId: currentUser.sub, eventType: 'model_update', metadata: updateData },
    );
    if (!updated) throw new NotFoundException('Model not found after update');

    return this.toModelResponse(updated);
  }

  async setActiveModel(
    modelId: string,
    dto: SetActiveModelDto,
    currentUser: AuthenticatedUser,
  ): Promise<ModelResponse> {
    this.assertAdmin(currentUser);

    const model = await this.inferenceRepository.findModelById(modelId);
    if (!model) throw new NotFoundException('Model not found');

    if (model.status !== 'ready') {
      throw new BadRequestException(
        'Only models in "ready" status can be activated or deactivated',
      );
    }

    const updated = await this.inferenceRepository.updateModel(
      model.id,
      { active: dto.active },
      {
        actorUserId: currentUser.sub,
        eventType: dto.active ? 'model_activate' : 'model_deactivate',
      },
    );
    if (!updated) throw new NotFoundException('Model not found after update');

    return this.toModelResponse(updated);
  }

  async deleteModel(modelId: string, currentUser: AuthenticatedUser): Promise<ModelResponse> {
    this.assertAdmin(currentUser);

    const model = await this.inferenceRepository.findModelById(modelId);
    if (!model) throw new NotFoundException('Model not found');

    if (model.active) {
      throw new ConflictException('Cannot delete an active model. Deactivate it first.');
    }

    const hasActiveJobs = await this.inferenceRepository.hasActiveJobsForModel(modelId);
    if (hasActiveJobs) {
      throw new ConflictException('Cannot delete a model with active (non-terminal) jobs');
    }

    const deleted = await this.inferenceRepository.softDeleteModel(modelId, {
      actorUserId: currentUser.sub,
      metadata: { objectKey: model.objectKey },
    });
    if (!deleted) throw new NotFoundException('Model not found');

    return this.toModelResponse(deleted);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Model listing (user)
  // ═══════════════════════════════════════════════════════════════════

  async listActiveModels(): Promise<
    Array<{ id: string; name: string; version: string; task: string | null; classes: unknown }>
  > {
    const models = await this.inferenceRepository.listActiveModels();
    return models.map((m) => ({
      id: m.id,
      name: m.name,
      version: m.version,
      task: m.task,
      classes: m.classes,
    }));
  }

  private assertAdmin(currentUser: AuthenticatedUser): void {
    if (currentUser.role !== 'admin') throw new ForbiddenException('Admin access required');
  }

  private toModelResponse(model: InferenceModel): ModelResponse {
    return {
      id: model.id,
      name: model.name,
      version: model.version,
      description: model.description,
      task: model.task,
      classes: model.classes,
      status: model.status,
      active: model.active,
      sha256: model.sha256,
      sizeBytes: model.sizeBytes,
      errorMessage: model.errorMessage,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    };
  }
}
