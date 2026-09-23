import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  ParseUUIDPipe,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AccessService } from './access.service';
import { JwtAuthGuard, type AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import { createGrantSchema, type CreateGrantDto } from './dto/create-grant.dto';
import { listGrantsQuerySchema, type ListGrantsQueryDto } from './dto/list-grants-query.dto';

@ApiTags('Access Grants')
@ApiBearerAuth()
@Controller('access-grants')
export class AccessController {
  constructor(private readonly accessService: AccessService) {}

  // ── GET /access-grants ────────────────────────────────────────────

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'List access grants with optional filters',
    description:
      'Admin sees all grants. Non-admin owners see grants for resources they own. ' +
      'Supports pagination and optional subjectUserId/resourceType/resourceId filters.',
  })
  @ApiQuery({
    name: 'subjectUserId',
    required: false,
    type: String,
    description: 'Filter by subject user UUID',
  })
  @ApiQuery({
    name: 'resourceType',
    required: false,
    type: String,
    description: 'Filter by resource type',
  })
  @ApiQuery({
    name: 'resourceId',
    required: false,
    type: String,
    description: 'Filter by resource UUID',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default 1)' })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    description: 'Page size (default 50, max 100)',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of access grants' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async listGrants(
    @Query(new ZodValidationPipe(listGrantsQuerySchema)) query: ListGrantsQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.accessService.listGrants(currentUser, query);
  }

  // ── POST /access-grants ───────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Create an access grant',
    description: 'Admin can grant any resource. Non-admin owners can grant on resources they own.',
  })
  @ApiResponse({ status: 201, description: 'Access grant created' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden — not authorized for this resource' })
  @ApiResponse({ status: 404, description: 'Subject user or resource not found' })
  @ApiResponse({ status: 409, description: 'Duplicate active grant' })
  async createGrant(
    @Body(new ZodValidationPipe(createGrantSchema)) dto: CreateGrantDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const grant = await this.accessService.createGrant(dto, currentUser);
    return { grant };
  }

  // ── DELETE /access-grants/:id ─────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Revoke an access grant',
    description: 'Admin can revoke any. Non-admin owners can revoke on resources they own.',
  })
  @ApiResponse({ status: 204, description: 'Grant revoked' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Grant not found' })
  async revokeGrant(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    await this.accessService.revokeGrant(id, currentUser);
  }
}
