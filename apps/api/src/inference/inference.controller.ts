import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { InferenceJobService } from './inference-job.service';
import { InferenceModelService } from './inference-model.service';
import { JwtAuthGuard, type AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import { createJobSchema, type CreateJobDto } from './dto/create-job.dto';
import { listJobsQuerySchema, type ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { InferenceEnabledGuard } from './inference-enabled.guard';

@ApiTags('Inference')
@ApiBearerAuth()
@UseGuards(InferenceEnabledGuard, JwtAuthGuard)
@Controller('inference')
export class InferenceController {
  constructor(
    private readonly inferenceModelService: InferenceModelService,
    private readonly inferenceJobService: InferenceJobService,
  ) {}

  // ── GET /inference/models ──────────────────────────────────────────

  @Get('models')
  @ApiOperation({
    summary: 'List active ready models for inference',
    description: 'Returns all active models in ready status available for running inference jobs.',
  })
  @ApiResponse({ status: 200, description: 'List of active models' })
  async listActiveModels() {
    return this.inferenceModelService.listActiveModels();
  }

  // ── POST /inference/jobs ───────────────────────────────────────────

  @Post('jobs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an inference job',
    description:
      'Create a new inference job. Provide either uploadId (use images from an existing upload) ' +
      'or files (upload temporary images directly). ' +
      'For upload-sourced jobs, upload access is verified. ' +
      'For temporary jobs, presigned PUT URLs are returned for direct S3 upload.',
  })
  @ApiBody({ type: Object })
  @ApiResponse({ status: 201, description: 'Job created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Model or upload not found' })
  async createJob(
    @Body(new ZodValidationPipe(createJobSchema)) dto: CreateJobDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inferenceJobService.createJob(dto, currentUser);
  }

  // ── POST /inference/jobs/:id/complete ──────────────────────────────

  @Post('jobs/:id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete a temporary job',
    description:
      'Verifies all images have been uploaded to S3 and moves the job from uploading to queued. ' +
      'Only for temporary jobs. Owner or admin only.',
  })
  @ApiParam({ name: 'id', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job completed and queued' })
  @ApiResponse({ status: 400, description: 'Some images not found' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async completeTemporaryJob(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inferenceJobService.completeTemporaryJob(id, currentUser);
  }

  // ── GET /inference/jobs ────────────────────────────────────────────

  @Get('jobs')
  @ApiOperation({
    summary: 'List current user inference jobs',
    description: 'Returns paginated list of the current user non-expired inference jobs.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated job list' })
  async listJobs(
    @Query(new ZodValidationPipe(listJobsQuerySchema)) dto: ListJobsQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inferenceJobService.listJobs(dto, currentUser);
  }

  // ── GET /inference/jobs/:id ────────────────────────────────────────

  @Get('jobs/:id')
  @ApiOperation({
    summary: 'Get inference job detail',
    description:
      'Returns job details with image summaries. Owner, admin, or upload access requires upload re-check.',
  })
  @ApiParam({ name: 'id', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job detail' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJobDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inferenceJobService.getJobDetail(id, currentUser);
  }

  // ── GET /inference/jobs/:id/images/:imageId ────────────────────────

  @Get('jobs/:id/images/:imageId')
  @ApiOperation({
    summary: 'Get full image result with detections and signed display URL',
    description:
      'Returns the complete detection results for a specific image plus a signed display URL (15 min TTL).',
  })
  @ApiParam({ name: 'id', description: 'Job ID' })
  @ApiParam({ name: 'imageId', description: 'Image ID' })
  @ApiResponse({ status: 200, description: 'Image result with display URL' })
  @ApiResponse({ status: 404, description: 'Job or image not found' })
  async getImageResult(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inferenceJobService.getImageResult(id, imageId, currentUser);
  }

  // ── DELETE /inference/jobs/:id ─────────────────────────────────────

  @Delete('jobs/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an inference job',
    description:
      'Manual deletion of a job. Only uploading, completed, or failed jobs can be deleted. ' +
      'Queued/running jobs return 409. For temporary jobs, object keys are enqueued for S3 deletion.',
  })
  @ApiParam({ name: 'id', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 409, description: 'Job in queued/running status' })
  async deleteJob(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inferenceJobService.deleteJob(id, currentUser);
  }
}
