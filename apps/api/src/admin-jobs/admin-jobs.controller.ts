import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  ParseEnumPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AdminJobsService, type DeadJobQueue } from './admin-jobs.service';
import { JwtAuthGuard, type AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

const DEAD_JOB_QUEUES = Object.freeze({
  upload_finalization: 'upload_finalization',
  object_deletion: 'object_deletion',
}) as Record<DeadJobQueue, DeadJobQueue>;

@ApiTags('Admin Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/jobs')
export class AdminJobsController {
  constructor(private readonly adminJobsService: AdminJobsService) {}

  @Get('dead')
  @ApiOperation({
    summary: 'List worker jobs in the dead terminal state (admin only)',
    description:
      'Lists finalization and object-deletion jobs that exhausted their attempt ' +
      'limits. Use the retry endpoint only after correcting the underlying issue.',
  })
  @ApiResponse({ status: 200, description: 'List of dead jobs' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires admin role' })
  async listDeadJobs() {
    const jobs = await this.adminJobsService.listDeadJobs();
    return { jobs };
  }

  @Post('dead/:queue/:id/retry')
  @ApiOperation({
    summary: 'Requeue a dead worker job for processing (admin only, audited)',
    description:
      'Resets a dead finalization or object-deletion job to pending so the worker ' +
      'can pick it up again. Idempotent in effect: a job that is not dead is left untouched.',
  })
  @ApiResponse({ status: 200, description: 'Job requeued for retry' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 409, description: 'Job is not in the dead state' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires admin role' })
  async retryDeadJob(
    @Param('queue', new ParseEnumPipe(DEAD_JOB_QUEUES)) queue: DeadJobQueue,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    await this.adminJobsService.retryDeadJob(queue, id, currentUser);
    return { message: 'Job requeued for retry' };
  }
}
