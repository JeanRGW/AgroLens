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
  createTalhaoSchema,
  updateTalhaoSchema,
  type CreateTalhaoDto,
  type UpdateTalhaoDto,
} from './dto';

const CREATE_TALHAO_BODY = {
  type: 'object',
  required: ['name', 'propertyId'],
  properties: {
    name: { type: 'string', example: 'Talhao Norte' },
    propertyId: { type: 'string', format: 'uuid' },
  },
};

const UPDATE_TALHAO_BODY = {
  type: 'object',
  properties: {
    userId: { type: 'string', format: 'uuid', description: 'New owner (admin only)' },
    propertyId: {
      type: 'string',
      format: 'uuid',
      description: 'Destination property; linked uploads move too',
    },
    name: { type: 'string', example: 'Talhao Norte Atualizado' },
  },
};

@ApiTags('Talhoes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('talhoes')
export class TalhoesController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  @ApiOperation({ summary: 'List talhoes (authenticated, optional propertyId filter)' })
  @ApiQuery({ name: 'propertyId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'List of non-deleted talhoes' })
  async list(@Query('propertyId', new ParseUUIDPipe({ optional: true })) propertyId?: string) {
    const talhoes = await this.catalogService.listTalhoes(propertyId);
    return { talhoes };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a talhao by ID (authenticated)' })
  @ApiResponse({ status: 200, description: 'Talhao found' })
  @ApiResponse({ status: 404, description: 'Talhao not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const talhao = await this.catalogService.getTalhao(id);
    return { talhao };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a talhao under an existing property (any authenticated user)',
    description:
      'Any authenticated user may create a talhao under any existing property. The authenticated user owns the new talhao; update and delete remain restricted to its owner or an admin.',
  })
  @ApiBody({ schema: CREATE_TALHAO_BODY })
  @ApiResponse({ status: 201, description: 'Talhao created' })
  @ApiResponse({ status: 404, description: 'Parent property not found' })
  @ApiResponse({ status: 409, description: 'Talhao name already exists for this property' })
  async create(
    @Body(new ZodValidationPipe(createTalhaoSchema)) dto: CreateTalhaoDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const talhao = await this.catalogService.createTalhao(dto, currentUser);
    return { talhao };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a talhao (admin or owner only)' })
  @ApiBody({ schema: UPDATE_TALHAO_BODY })
  @ApiResponse({ status: 200, description: 'Talhao updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Talhao not found' })
  @ApiResponse({ status: 409, description: 'Talhao name already exists for this property' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTalhaoSchema)) dto: UpdateTalhaoDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const talhao = await this.catalogService.updateTalhao(id, dto, currentUser);
    return { talhao };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a talhao (admin or owner only)' })
  @ApiResponse({ status: 200, description: 'Talhao soft-deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Talhao not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    await this.catalogService.softDeleteTalhao(id, currentUser);
    return { message: 'Talhao deleted' };
  }
}
