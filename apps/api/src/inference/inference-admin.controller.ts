import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
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
} from '@nestjs/swagger';
import { InferenceModelService } from './inference-model.service';
import { JwtAuthGuard, type AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import { initModelSchema, type InitModelDto } from './dto/init-model.dto';
import { updateModelSchema, type UpdateModelDto } from './dto/update-model.dto';
import { setActiveModelSchema, type SetActiveModelDto } from './dto/set-active-model.dto';
import { InferenceEnabledGuard } from './inference-enabled.guard';

@ApiTags('Inference Models (Admin)')
@ApiBearerAuth()
@UseGuards(InferenceEnabledGuard, JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/inference-models')
export class InferenceAdminController {
  constructor(private readonly inferenceModelService: InferenceModelService) {}

  // ── POST /admin/inference-models/init ──────────────────────────────

  @Post('init')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initialize model upload',
    description:
      'Creates a model row in uploading status and returns a presigned PUT URL ' +
      'for uploading the model file to S3.',
  })
  @ApiBody({ type: Object })
  @ApiResponse({ status: 201, description: 'Model initialized with presigned URL' })
  async initModel(
    @Body(new ZodValidationPipe(initModelSchema)) dto: InitModelDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inferenceModelService.initModel(dto, currentUser);
  }

  // ── POST /admin/inference-models/:id/complete ──────────────────────

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete model upload',
    description:
      'Verifies the model file in S3, computes SHA256, and moves the model to validating status.',
  })
  @ApiParam({ name: 'id', description: 'Model ID' })
  @ApiResponse({ status: 200, description: 'Model completed and validating' })
  @ApiResponse({ status: 404, description: 'Model not found' })
  async completeModel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inferenceModelService.completeModel(id, currentUser);
  }

  // ── GET /admin/inference-models ────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'List all inference models (admin)',
    description:
      'Returns all non-deleted models including non-active, invalid, and uploading. Excludes soft-deleted.',
  })
  @ApiResponse({ status: 200, description: 'List of all models' })
  async listModels(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.inferenceModelService.listModels(currentUser);
  }

  // ── PATCH /admin/inference-models/:id ──────────────────────────────

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update model name and/or description',
    description:
      'Edits name and/or description. Version is immutable after upload complete. Admin only.',
  })
  @ApiParam({ name: 'id', description: 'Model ID' })
  @ApiBody({ type: Object })
  @ApiResponse({ status: 200, description: 'Model updated' })
  @ApiResponse({ status: 404, description: 'Model not found' })
  async updateModel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateModelSchema)) dto: UpdateModelDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inferenceModelService.updateModel(id, dto, currentUser);
  }

  // ── PATCH /admin/inference-models/:id/active ───────────────────────

  @Patch(':id/active')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate or deactivate a model',
    description:
      'Set active=true to enable a ready model for inference, or active=false to disable it. ' +
      'Only ready models can be activated. Only ready models can be deactivated.',
  })
  @ApiParam({ name: 'id', description: 'Model ID' })
  @ApiBody({ type: Object })
  @ApiResponse({ status: 200, description: 'Model active state updated' })
  @ApiResponse({ status: 400, description: 'Model not in valid status' })
  async setActiveModel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setActiveModelSchema)) dto: SetActiveModelDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inferenceModelService.setActiveModel(id, dto, currentUser);
  }

  // ── DELETE /admin/inference-models/:id ─────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete a model',
    description:
      'Soft-deletes a model. Must be inactive. Fails if active jobs reference the model. ' +
      'Enqueues the model object key for S3 deletion.',
  })
  @ApiParam({ name: 'id', description: 'Model ID' })
  @ApiResponse({ status: 200, description: 'Model soft-deleted' })
  @ApiResponse({ status: 404, description: 'Model not found' })
  @ApiResponse({ status: 409, description: 'Model is active or has active jobs' })
  async deleteModel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inferenceModelService.deleteModel(id, currentUser);
  }
}
