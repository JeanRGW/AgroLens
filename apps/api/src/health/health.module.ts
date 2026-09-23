import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { WorkerModule } from '../worker/worker.module';

@Module({
  imports: [AuthModule, WorkerModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
