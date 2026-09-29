import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
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
import { UploadsService } from './uploads.service';
import { JwtAuthGuard, type AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import { uploadInitSchema, type UploadInitDto } from './dto/upload-init.dto';
import { uploadListSchema, type UploadListDto } from './dto/upload-list.dto';
import { exportDownloadUrlsSchema, type ExportDownloadUrlsDto } from './dto/export-download.dto';

@ApiTags('Uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  // ── POST /uploads/init ─────────────────────────────────────────────

  @Post('init')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initialize an upload (idempotent by clientUploadId)',
    description:
      'Creates or resumes a draft upload and returns presigned URLs for original file uploads. ' +
      'Idempotent by (user_id, client_upload_id). If retry changes metadata, rejects with 409.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'clientUploadId',
        'propertyId',
        'talhaoId',
        'cropTypeId',
        'source',
        'activityDate',
        'files',
      ],
      properties: {
        clientUploadId: { type: 'string', example: 'mobile-uuid-123' },
        propertyId: { type: 'string', format: 'uuid' },
        talhaoId: { type: 'string', format: 'uuid' },
        cropTypeId: { type: 'string', format: 'uuid' },
        estadioId: { type: 'string', format: 'uuid' },
        source: { type: 'string', enum: ['drone', 'phone', 'mixed'] },
        activityDate: { type: 'string', format: 'date-time' },
        files: {
          type: 'array',
          items: {
            type: 'object',
            required: ['imageId', 'contentType', 'latitude', 'longitude'],
            properties: {
              imageId: {
                type: 'string',
                format: 'uuid',
                description: 'Client-generated image UUID; reuse it when retrying this upload',
              },
              latitude: { type: 'number', nullable: true, example: -22.9 },
              longitude: { type: 'number', nullable: true, example: -43.1 },
              contentType: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/webp'] },
              sizeBytes: { type: 'integer' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Upload initialized with presigned URLs' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({
    status: 409,
    description: 'Conflict: metadata changed for existing clientUploadId',
  })
  async initUpload(
    @Body(new ZodValidationPipe(uploadInitSchema)) dto: UploadInitDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.uploadsService.initUpload(dto, currentUser);
  }

  // ── POST /uploads/:id/complete ─────────────────────────────────────

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete an upload and enqueue finalization',
    description:
      'Moves a draft or failed upload to finalizing status and enqueues a background finalization job. ' +
      'Only the owner or admin can complete an upload.',
  })
  @ApiParam({ name: 'id', description: 'Upload ID' })
  @ApiResponse({ status: 200, description: 'Upload moved to finalizing' })
  @ApiResponse({ status: 404, description: 'Upload not found' })
  @ApiResponse({ status: 409, description: 'Upload is not in a completable status' })
  async completeUpload(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const upload = await this.uploadsService.completeUpload(id, currentUser);
    return { upload };
  }

  // ── GET /uploads ───────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'List visible (ready) uploads',
    description:
      'Returns paginated list of ready uploads visible to the current user. ' +
      'Default ordering: created_at desc. Supports activity and created date filters.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'propertyId', required: false, type: String })
  @ApiQuery({ name: 'talhaoId', required: false, type: String })
  @ApiQuery({ name: 'cropTypeId', required: false, type: String })
  @ApiQuery({ name: 'estadioId', required: false, type: String })
  @ApiQuery({ name: 'activityFrom', required: false, type: String })
  @ApiQuery({ name: 'activityTo', required: false, type: String })
  @ApiQuery({ name: 'createdFrom', required: false, type: String })
  @ApiQuery({ name: 'createdTo', required: false, type: String })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'source', required: false, enum: ['drone', 'phone', 'mixed'] })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description:
      'Free-text search over upload ID, user name, property/talhao/crop type/estadio name',
  })
  @ApiResponse({ status: 200, description: 'Paginated upload list' })
  async listUploads(
    @Query(new ZodValidationPipe(uploadListSchema)) dto: UploadListDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.uploadsService.listUploads(dto, currentUser);
  }

  // ── GET /uploads/dashboard ─────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({
    summary: 'Get dashboard counters and recent uploads',
    description:
      'Returns counters for the current user using the same visibility policy as the upload list. ' +
      'Only ready, non-deleted uploads are counted.',
  })
  @ApiResponse({ status: 200, description: 'Dashboard snapshot' })
  async getDashboardSnapshot(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.uploadsService.getDashboardSnapshot(currentUser);
  }

  // ── GET /uploads/:id ───────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({
    summary: 'Get upload detail',
    description:
      'Returns upload details with file metadata. Owner/admin can see any status. ' +
      'Non-owners can only see ready uploads they have access to.',
  })
  @ApiParam({ name: 'id', description: 'Upload ID' })
  @ApiResponse({ status: 200, description: 'Upload detail with files' })
  @ApiResponse({ status: 404, description: 'Upload not found or not accessible' })
  async getUploadDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.uploadsService.getUploadDetail(id, currentUser);
  }

  // ── GET /uploads/:id/files/:fileId/download-url ─────────────────────

  @Get(':id/files/:fileId/download-url')
  @ApiOperation({
    summary: 'Get a signed download URL for one file',
    description:
      'Returns a short-lived presigned GET URL for direct S3 download of the specified file. ' +
      'Only ready uploads are accessible. Requires admin, owner, or upload_allowed_user access.',
  })
  @ApiParam({ name: 'id', description: 'Upload ID' })
  @ApiParam({ name: 'fileId', description: 'File ID' })
  @ApiResponse({ status: 200, description: 'Signed download URL' })
  @ApiResponse({ status: 404, description: 'Upload or file not found' })
  async getFileDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.uploadsService.getFileDownloadUrl(id, fileId, currentUser);
  }

  // ── GET /uploads/:id/files/:fileId/preview-url ──────────────────────

  @Get(':id/files/:fileId/preview-url')
  @ApiOperation({
    summary: 'Get a signed URL for a preview file',
    description:
      'Returns a short-lived presigned GET URL for a preview (thumbnail) file. ' +
      'Only preview-variant files are served through this endpoint. ' +
      'Same access policy as original download URLs.',
  })
  @ApiParam({ name: 'id', description: 'Upload ID' })
  @ApiParam({ name: 'fileId', description: 'Preview file ID' })
  @ApiResponse({ status: 200, description: 'Signed preview URL' })
  @ApiResponse({ status: 404, description: 'Upload or preview file not found' })
  async getFilePreviewUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.uploadsService.getFilePreviewUrl(id, fileId, currentUser);
  }

  // ── GET /uploads/:id/display-urls ──────────────────────────────────

  @Get(':id/display-urls')
  @ApiOperation({
    summary: 'Resolve signed display URLs for all files of an upload',
    description:
      'Returns signed GET URLs for every display image file (originals and previews) of a ' +
      'single upload in one authenticated call. Upload visibility/access is validated once ' +
      'using the same policy as single-file download/preview URLs.',
  })
  @ApiParam({ name: 'id', description: 'Upload ID' })
  @ApiResponse({ status: 200, description: 'Map of file IDs to signed display URLs' })
  @ApiResponse({ status: 404, description: 'Upload not found, not ready, or not accessible' })
  async getDisplayUrls(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.uploadsService.resolveDisplayUrls(id, currentUser);
  }

  // ── POST /uploads/export-download-urls ──────────────────────────────

  @Post('export-download-urls')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Batch signed download URLs for export',
    description:
      'Accepts a list of upload IDs and/or file IDs and returns signed GET URLs for bulk download. ' +
      'All-or-nothing: fails with 400/404 if any requested upload/file is invalid. ' +
      'Maximum batch size is 500 items.',
  })
  @ApiBody({ type: Object })
  @ApiResponse({ status: 200, description: 'List of signed download URLs' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Upload or file not found' })
  async getExportDownloadUrls(
    @Body(new ZodValidationPipe(exportDownloadUrlsSchema)) dto: ExportDownloadUrlsDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.uploadsService.getExportDownloadUrls(dto, currentUser);
  }

  // ── DELETE /uploads/:id ─────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete an upload and enqueue delayed object deletion',
    description:
      'Soft-deletes the upload (sets deletedAt). Only the owner or admin may delete. ' +
      'Projected allowed users cannot delete. Enqueues object deletion jobs 7 days in the future. ' +
      'Returns 404 if the upload does not exist or is already deleted.',
  })
  @ApiParam({ name: 'id', description: 'Upload ID' })
  @ApiResponse({ status: 200, description: 'Upload soft-deleted' })
  @ApiResponse({ status: 404, description: 'Upload not found or already deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden: only owner or admin can delete' })
  async deleteUpload(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const upload = await this.uploadsService.deleteUpload(id, currentUser);
    return { upload };
  }
}
