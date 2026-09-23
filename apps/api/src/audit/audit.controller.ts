import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import { listAuditQuerySchema, type ListAuditQueryDto } from './dto/list-audit-query.dto';

@ApiTags('Audit Events')
@ApiBearerAuth()
@Controller('audit-events')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'List audit events (admin only)',
    description:
      'Returns a paginated, filterable list of audit events. All filters are optional. ' +
      'Accepts either limit/offset or page/pageSize for pagination. ' +
      'Results are ordered by createdAt descending.',
  })
  @ApiQuery({
    name: 'actorUserId',
    required: false,
    type: String,
    description: 'Filter by actor user UUID',
  })
  @ApiQuery({
    name: 'targetUserId',
    required: false,
    type: String,
    description: 'Filter by target user UUID',
  })
  @ApiQuery({
    name: 'resourceType',
    required: false,
    type: String,
    description: 'Filter by resource type (e.g. upload, property)',
  })
  @ApiQuery({
    name: 'resourceId',
    required: false,
    type: String,
    description: 'Filter by resource UUID',
  })
  @ApiQuery({
    name: 'eventType',
    required: false,
    type: String,
    description: 'Filter by event type (e.g. role_change, access_grant)',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    type: String,
    description: 'Filter events created on or after this ISO date',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description: 'Filter events created on or before this ISO date',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default 1)' })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    description: 'Page size (default 100, max 500)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Alias: page size (1-500, default 100)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Alias: pagination offset (default 0)',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of audit events with total count' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires admin role' })
  async listEvents(@Query(new ZodValidationPipe(listAuditQuerySchema)) query: ListAuditQueryDto) {
    return this.auditService.listEvents(query);
  }
}
