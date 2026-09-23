import { Module } from '@nestjs/common';
import { InferenceModelService } from './inference-model.service';
import { InferenceJobService } from './inference-job.service';
import { InferenceController } from './inference.controller';
import { InferenceAdminController } from './inference-admin.controller';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { InferenceEnabledGuard } from './inference-enabled.guard';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [InferenceController, InferenceAdminController],
  providers: [InferenceModelService, InferenceJobService, InferenceEnabledGuard],
  exports: [InferenceEnabledGuard],
})
export class InferenceModule {}
