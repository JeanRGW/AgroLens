import { Module } from '@nestjs/common';
import { FinalizationService } from './finalization.service';
import { DeletionService } from './deletion.service';
import { InferenceService } from './inference.service';
import { InferenceClient } from '../inference/inference-client';
import { AbandonedUploadCleanupService } from './abandoned-upload-cleanup.service';
import { ImageProcessingModule } from '../image-processing/image-processing.module';
import { AuthModule } from '../auth/auth.module';
import { WorkerRuntime } from './worker-runtime';

@Module({
  imports: [ImageProcessingModule, AuthModule],
  controllers: [],
  providers: [
    FinalizationService,
    DeletionService,
    InferenceService,
    InferenceClient,
    AbandonedUploadCleanupService,
    WorkerRuntime,
  ],
  exports: [FinalizationService, DeletionService, AbandonedUploadCleanupService, WorkerRuntime],
})
export class WorkerModule {}
