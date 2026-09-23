import {
  Controller,
  Get,
  Post,
  Patch,
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
  ApiQuery,
} from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { JwtAuthGuard, type AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import {
  createEstadioSchema,
  updateEstadioSchema,
  type CreateEstadioDto,
  type UpdateEstadioDto,
} from './dto';

const CREATE_ESTADIO_BODY = {
  type: 'object',
  required: ['name', 'cropTypeId'],
  properties: {
    name: { type: 'string', example: 'Vegetativo' },
    cropTypeId: { type: 'string', format: 'uuid' },
  },
};

const UPDATE_ESTADIO_BODY = {
  type: 'object',
  properties: {
    userId: { type: 'string', format: 'uuid', description: 'New owner (admin only)' },
    cropTypeId: {
      type: 'string',
      format: 'uuid',
      description: 'Destination crop; linked uploads move too',
    },
    name: { type: 'string', example: 'Vegetativo Inicial' },
  },
};

@ApiTags('Estadios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('estadios')
export class EstadiosController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  @ApiOperation({ summary: 'List estadios (authenticated, optional cropTypeId filter)' })
  @ApiQuery({ name: 'cropTypeId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'List of non-deleted estadios' })
  async list(@Query('cropTypeId', new ParseUUIDPipe({ optional: true })) cropTypeId?: string) {
    const estadios = await this.catalogService.listEstadios(cropTypeId);
    return { estadios };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an estadio by ID (authenticated)' })
  @ApiResponse({ status: 200, description: 'Estadio found' })
  @ApiResponse({ status: 404, description: 'Estadio not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const estadio = await this.catalogService.getEstadio(id);
    return { estadio };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an estadio under an existing crop type (any authenticated user)',
    description:
      'Any authenticated user may create an estadio under any existing crop type. The authenticated user owns the new estadio; update and delete remain restricted to its owner or an admin.',
  })
  @ApiBody({ schema: CREATE_ESTADIO_BODY })
  @ApiResponse({ status: 201, description: 'Estadio created' })
  @ApiResponse({ status: 404, description: 'Parent crop type not found' })
  @ApiResponse({ status: 409, description: 'Estadio name already exists for this crop type' })
  async create(
    @Body(new ZodValidationPipe(createEstadioSchema)) dto: CreateEstadioDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const estadio = await this.catalogService.createEstadio(dto, currentUser);
    return { estadio };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an estadio (admin or owner only)' })
  @ApiBody({ schema: UPDATE_ESTADIO_BODY })
  @ApiResponse({ status: 200, description: 'Estadio updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Estadio not found' })
  @ApiResponse({ status: 409, description: 'Estadio name already exists for this crop type' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEstadioSchema)) dto: UpdateEstadioDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const estadio = await this.catalogService.updateEstadio(id, dto, currentUser);
    return { estadio };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete an estadio (admin or owner only)' })
  @ApiResponse({ status: 200, description: 'Estadio soft-deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Estadio not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    await this.catalogService.softDeleteEstadio(id, currentUser);
    return { message: 'Estadio deleted' };
  }
}
