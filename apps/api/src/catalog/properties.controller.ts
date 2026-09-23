import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { JwtAuthGuard, type AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import {
  createPropertySchema,
  updatePropertySchema,
  type CreatePropertyDto,
  type UpdatePropertyDto,
} from './dto';

const CREATE_PROPERTY_BODY = {
  type: 'object',
  required: ['name', 'owner', 'address', 'latitude', 'longitude'],
  properties: {
    name: { type: 'string', example: 'Fazenda Santa Maria' },
    owner: { type: 'string', example: 'Joao Silva' },
    address: { type: 'string', example: 'Rodovia SP-340, km 120' },
    latitude: { type: 'number', example: -22.9068 },
    longitude: { type: 'number', example: -43.1729 },
  },
};

const UPDATE_PROPERTY_BODY = {
  type: 'object',
  properties: {
    userId: { type: 'string', format: 'uuid', description: 'New owner (admin only)' },
    name: { type: 'string', example: 'Fazenda Santa Maria' },
    owner: { type: 'string', example: 'Joao Silva' },
    address: { type: 'string', example: 'Rodovia SP-340, km 120' },
    latitude: { type: 'number', example: -22.9068 },
    longitude: { type: 'number', example: -43.1729 },
  },
};

@ApiTags('Properties')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('properties')
export class PropertiesController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  @ApiOperation({ summary: 'List all properties (authenticated)' })
  @ApiResponse({ status: 200, description: 'List of non-deleted properties' })
  async list() {
    const properties = await this.catalogService.listProperties();
    return { properties };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a property by ID (authenticated)' })
  @ApiResponse({ status: 200, description: 'Property found' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const property = await this.catalogService.getProperty(id);
    return { property };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a property for the current user' })
  @ApiBody({ schema: CREATE_PROPERTY_BODY })
  @ApiResponse({ status: 201, description: 'Property created' })
  @ApiResponse({ status: 409, description: 'Property name already exists' })
  async create(
    @Body(new ZodValidationPipe(createPropertySchema)) dto: CreatePropertyDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const property = await this.catalogService.createProperty(dto, currentUser);
    return { property };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a property (admin or owner only)' })
  @ApiBody({ schema: UPDATE_PROPERTY_BODY })
  @ApiResponse({ status: 200, description: 'Property updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  @ApiResponse({ status: 409, description: 'Property name already exists' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePropertySchema)) dto: UpdatePropertyDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const property = await this.catalogService.updateProperty(id, dto, currentUser);
    return { property };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a property (admin or owner only)' })
  @ApiResponse({ status: 200, description: 'Property soft-deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    await this.catalogService.softDeleteProperty(id, currentUser);
    return { message: 'Property deleted' };
  }
}
