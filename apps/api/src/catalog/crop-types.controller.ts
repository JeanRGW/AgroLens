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
  createCropTypeSchema,
  updateCropTypeSchema,
  type CreateCropTypeDto,
  type UpdateCropTypeDto,
} from './dto';

const CREATE_CROP_TYPE_BODY = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', example: 'Soja' },
  },
};

const UPDATE_CROP_TYPE_BODY = {
  type: 'object',
  properties: {
    userId: { type: 'string', format: 'uuid', description: 'New owner (admin only)' },
    name: { type: 'string', example: 'Soja Premium' },
  },
};

@ApiTags('Crop Types')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('crop-types')
export class CropTypesController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  @ApiOperation({ summary: 'List all crop types (authenticated)' })
  @ApiResponse({ status: 200, description: 'List of non-deleted crop types' })
  async list() {
    const cropTypes = await this.catalogService.listCropTypes();
    return { cropTypes };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a crop type by ID (authenticated)' })
  @ApiResponse({ status: 200, description: 'Crop type found' })
  @ApiResponse({ status: 404, description: 'Crop type not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const cropType = await this.catalogService.getCropType(id);
    return { cropType };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a crop type for the current user' })
  @ApiBody({ schema: CREATE_CROP_TYPE_BODY })
  @ApiResponse({ status: 201, description: 'Crop type created' })
  @ApiResponse({ status: 409, description: 'Crop type name already exists' })
  async create(
    @Body(new ZodValidationPipe(createCropTypeSchema)) dto: CreateCropTypeDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const cropType = await this.catalogService.createCropType(dto, currentUser);
    return { cropType };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a crop type (admin or owner only)' })
  @ApiBody({ schema: UPDATE_CROP_TYPE_BODY })
  @ApiResponse({ status: 200, description: 'Crop type updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Crop type not found' })
  @ApiResponse({ status: 409, description: 'Crop type name already exists' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCropTypeSchema)) dto: UpdateCropTypeDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const cropType = await this.catalogService.updateCropType(id, dto, currentUser);
    return { cropType };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a crop type (admin or owner only)' })
  @ApiResponse({ status: 200, description: 'Crop type soft-deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Crop type not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    await this.catalogService.softDeleteCropType(id, currentUser);
    return { message: 'Crop type deleted' };
  }
}
