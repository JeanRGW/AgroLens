import {
  Controller,
  Get,
  Put,
  Param,
  Body,
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
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AnnotationsService } from './annotations.service';
import { JwtAuthGuard, type AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import { upsertAnnotationSchema, type UpsertAnnotationDto } from './dto/upsert-annotation.dto';
import { BadRequestException, ParseIntPipe } from '@nestjs/common';

@ApiTags('Annotations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads/:uploadId/annotations')
export class AnnotationsController {
  constructor(private readonly annotationsService: AnnotationsService) {}

  // ── GET /uploads/:uploadId/annotations ──────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'List all annotations for an upload',
    description:
      'Returns all annotations for the specified upload. The upload must be visible to the current user ' +
      '(owner, admin, or projected user with access to a ready upload).',
  })
  @ApiParam({ name: 'uploadId', description: 'Upload UUID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'List of annotations' })
  @ApiResponse({ status: 404, description: 'Upload not found or not accessible' })
  async listAnnotations(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.annotationsService.listAnnotations(uploadId, currentUser);
  }

  // ── GET /uploads/:uploadId/annotations/:imageIndex ─────────────────

  @Get(':imageIndex')
  @ApiOperation({
    summary: 'Get annotation for a specific image index',
    description:
      'Returns the annotation for the given image index. The upload must be visible to the current user.',
  })
  @ApiParam({ name: 'uploadId', description: 'Upload UUID', format: 'uuid' })
  @ApiParam({ name: 'imageIndex', description: 'Image index (non-negative integer)', type: Number })
  @ApiResponse({ status: 200, description: 'Annotation for the image index' })
  @ApiResponse({ status: 404, description: 'Upload or annotation not found' })
  async getAnnotation(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Param('imageIndex', new ParseIntPipe()) imageIndex: number,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    if (imageIndex < 0) {
      throw new BadRequestException('imageIndex must be a non-negative integer');
    }
    return this.annotationsService.getAnnotation(uploadId, imageIndex, currentUser);
  }

  // ── PUT /uploads/:uploadId/annotations/:imageIndex ─────────────────

  @Put(':imageIndex')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upsert annotation for a specific image index (last-write-wins)',
    description:
      'Creates or replaces the annotation for the given image index. ' +
      'Only the upload owner or an admin may modify annotations. ' +
      'The payload must include imageWidth, imageHeight, classes (string array), and labels (object or array).',
  })
  @ApiParam({ name: 'uploadId', description: 'Upload UUID', format: 'uuid' })
  @ApiParam({ name: 'imageIndex', description: 'Image index (non-negative integer)', type: Number })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['imageWidth', 'imageHeight', 'classes', 'labels'],
      properties: {
        imageWidth: { type: 'integer', example: 1920 },
        imageHeight: { type: 'integer', example: 1080 },
        classes: { type: 'array', items: { type: 'string' } },
        labels: {
          oneOf: [
            { type: 'object', description: 'Structured annotation data (e.g. COCO, custom)' },
            {
              type: 'array',
              items: { type: 'object' },
              description: 'Array of label objects (e.g. YOLO boxes)',
            },
          ],
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Annotation upserted' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: only owner or admin can modify annotations',
  })
  @ApiResponse({ status: 404, description: 'Upload not found or not accessible' })
  async upsertAnnotation(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Param('imageIndex', new ParseIntPipe()) imageIndex: number,
    @Body(new ZodValidationPipe(upsertAnnotationSchema)) dto: UpsertAnnotationDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    if (imageIndex < 0) {
      throw new BadRequestException('imageIndex must be a non-negative integer');
    }
    return this.annotationsService.upsertAnnotation(uploadId, imageIndex, dto, currentUser);
  }
}
