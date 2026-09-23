import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { CatalogRepository, UsersRepository } from '../database/repositories';
import { normalizeName } from './normalize';
import { handleUniqueViolation, getOrThrow } from './catalog-helpers';
import type {
  CreatePropertyDto,
  UpdatePropertyDto,
  CreateTalhaoDto,
  UpdateTalhaoDto,
  CreateCropTypeDto,
  UpdateCropTypeDto,
  CreateEstadioDto,
  UpdateEstadioDto,
} from './dto';
import type { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { assertOwnerOrAdmin } from '../auth/auth.service';

type CatalogRecord = { userId: string };

/** Catalog CRUD with entity-specific methods and shared authorization/error mechanics. */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly catalogRepository: CatalogRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  // Catalog listing and references are intentionally global across owners; resource grants project accordingly.
  listProperties() {
    return this.catalogRepository.listProperties();
  }
  getProperty(id: string) {
    return this.getOrThrow(() => this.catalogRepository.findPropertyById(id), 'Property not found');
  }
  createProperty(dto: CreatePropertyDto, user: AuthenticatedUser) {
    return this.createWithUnique('property', dto.name, () =>
      this.catalogRepository.createProperty({
        name: dto.name,
        normalizedName: normalizeName(dto.name),
        owner: dto.owner,
        userId: user.sub,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
      }),
    );
  }
  updateProperty(id: string, dto: UpdatePropertyDto, user: AuthenticatedUser) {
    return this.updateOwned(
      user,
      () => this.catalogRepository.findPropertyById(id),
      'Property not found',
      async () => {
        await this.validateOwner(dto.userId, user);
        const data: Parameters<typeof this.catalogRepository.updateProperty>[1] = {};
        if (dto.userId !== undefined) data.userId = dto.userId;
        if (dto.name !== undefined) {
          data.name = dto.name;
          data.normalizedName = normalizeName(dto.name);
        }
        if (dto.owner !== undefined) data.owner = dto.owner;
        if (dto.address !== undefined) data.address = dto.address;
        if (dto.latitude !== undefined) data.latitude = dto.latitude;
        if (dto.longitude !== undefined) data.longitude = dto.longitude;
        return this.catalogRepository.updateProperty(id, data);
      },
      dto.name,
      'property',
    );
  }
  softDeleteProperty(id: string, user: AuthenticatedUser) {
    return this.removeOwned(
      id,
      user,
      () => this.catalogRepository.findPropertyById(id),
      'Property not found',
      () => this.catalogRepository.softDeleteProperty(id),
      'Property',
    );
  }

  listTalhoes(propertyId?: string) {
    return this.catalogRepository.listTalhoes(propertyId);
  }
  getTalhao(id: string) {
    return this.getOrThrow(() => this.catalogRepository.findTalhaoById(id), 'Talhao not found');
  }
  async createTalhao(dto: CreateTalhaoDto, user: AuthenticatedUser) {
    await this.assertParent(
      () => this.catalogRepository.findPropertyById(dto.propertyId),
      'Parent property not found',
    );
    return this.createWithUnique('talhao', dto.name, () =>
      this.catalogRepository.createTalhao({
        name: dto.name,
        normalizedName: normalizeName(dto.name),
        propertyId: dto.propertyId,
        userId: user.sub,
      }),
    );
  }
  updateTalhao(id: string, dto: UpdateTalhaoDto, user: AuthenticatedUser) {
    return this.updateNamed(
      dto,
      user,
      () => this.catalogRepository.findTalhaoById(id),
      'Talhao not found',
      async (data) => {
        if (dto.propertyId)
          await this.assertParent(
            () => this.catalogRepository.findPropertyById(dto.propertyId!),
            'Parent property not found',
          );
        return this.catalogRepository.updateTalhao(id, { ...data, propertyId: dto.propertyId });
      },
      'talhao',
    );
  }
  softDeleteTalhao(id: string, user: AuthenticatedUser) {
    return this.removeOwned(
      id,
      user,
      () => this.catalogRepository.findTalhaoById(id),
      'Talhao not found',
      () => this.catalogRepository.softDeleteTalhao(id),
      'Talhao',
    );
  }

  listCropTypes() {
    return this.catalogRepository.listCropTypes();
  }
  getCropType(id: string) {
    return this.getOrThrow(
      () => this.catalogRepository.findCropTypeById(id),
      'Crop type not found',
    );
  }
  createCropType(dto: CreateCropTypeDto, user: AuthenticatedUser) {
    return this.createWithUnique('crop type', dto.name, () =>
      this.catalogRepository.createCropType({
        name: dto.name,
        normalizedName: normalizeName(dto.name),
        userId: user.sub,
      }),
    );
  }
  updateCropType(id: string, dto: UpdateCropTypeDto, user: AuthenticatedUser) {
    return this.updateNamed(
      dto,
      user,
      () => this.catalogRepository.findCropTypeById(id),
      'Crop type not found',
      (data) => this.catalogRepository.updateCropType(id, data),
      'crop type',
    );
  }
  softDeleteCropType(id: string, user: AuthenticatedUser) {
    return this.removeOwned(
      id,
      user,
      () => this.catalogRepository.findCropTypeById(id),
      'Crop type not found',
      () => this.catalogRepository.softDeleteCropType(id),
      'Crop type',
    );
  }

  listEstadios(cropTypeId?: string) {
    return this.catalogRepository.listEstadios(cropTypeId);
  }
  getEstadio(id: string) {
    return this.getOrThrow(() => this.catalogRepository.findEstadioById(id), 'Estadio not found');
  }
  async createEstadio(dto: CreateEstadioDto, user: AuthenticatedUser) {
    await this.assertParent(
      () => this.catalogRepository.findCropTypeById(dto.cropTypeId),
      'Parent crop type not found',
    );
    return this.createWithUnique('estadio', dto.name, () =>
      this.catalogRepository.createEstadio({
        name: dto.name,
        normalizedName: normalizeName(dto.name),
        cropTypeId: dto.cropTypeId,
        userId: user.sub,
      }),
    );
  }
  updateEstadio(id: string, dto: UpdateEstadioDto, user: AuthenticatedUser) {
    return this.updateNamed(
      dto,
      user,
      () => this.catalogRepository.findEstadioById(id),
      'Estadio not found',
      async (data) => {
        if (dto.cropTypeId)
          await this.assertParent(
            () => this.catalogRepository.findCropTypeById(dto.cropTypeId!),
            'Parent crop type not found',
          );
        return this.catalogRepository.updateEstadio(id, { ...data, cropTypeId: dto.cropTypeId });
      },
      'estadio',
    );
  }
  softDeleteEstadio(id: string, user: AuthenticatedUser) {
    return this.removeOwned(
      id,
      user,
      () => this.catalogRepository.findEstadioById(id),
      'Estadio not found',
      () => this.catalogRepository.softDeleteEstadio(id),
      'Estadio',
    );
  }

  private getOrThrow<T>(find: () => Promise<T | undefined>, message: string): Promise<T> {
    return getOrThrow(find, message);
  }

  private async createWithUnique<T>(
    resource: string,
    name: string,
    create: () => Promise<T>,
  ): Promise<T> {
    try {
      return await create();
    } catch (error) {
      this.handleUniqueViolation(error, resource, name);
      throw error;
    }
  }

  private assertParent<T extends CatalogRecord>(
    find: () => Promise<T | undefined>,
    message: string,
  ): Promise<T> {
    return this.getOrThrow(find, message);
  }

  private async updateOwned<T extends CatalogRecord, U>(
    user: AuthenticatedUser,
    find: () => Promise<T | undefined>,
    notFound: string,
    update: () => Promise<U | undefined>,
    name: string | undefined,
    resource: string,
  ): Promise<U> {
    const entity = await this.getOrThrow(find, notFound);
    assertOwnerOrAdmin(entity.userId, user);
    try {
      return await this.getOrThrow(update, notFound);
    } catch (error) {
      this.handleUniqueViolation(error, resource, name);
      throw error;
    }
  }

  private updateNamed<T extends CatalogRecord, U>(
    dto: { name?: string; userId?: string },
    user: AuthenticatedUser,
    find: () => Promise<T | undefined>,
    notFound: string,
    update: (data: {
      name?: string;
      normalizedName?: string;
      userId?: string;
    }) => Promise<U | undefined>,
    resource: string,
  ) {
    return this.updateOwned(
      user,
      find,
      notFound,
      async () => {
        await this.validateOwner(dto.userId, user);
        return update({
          userId: dto.userId,
          ...(dto.name !== undefined
            ? { name: dto.name, normalizedName: normalizeName(dto.name) }
            : {}),
        });
      },
      dto.name,
      resource,
    );
  }

  private async validateOwner(userId: string | undefined, user: AuthenticatedUser): Promise<void> {
    if (userId === undefined) return;
    if (user.role !== 'admin')
      throw new ForbiddenException('Only admins can change catalog ownership');
    if (!(await this.usersRepository.findById(userId)))
      throw new NotFoundException('Owner user not found');
  }

  private async removeOwned<T extends CatalogRecord>(
    id: string,
    user: AuthenticatedUser,
    find: () => Promise<T | undefined>,
    notFound: string,
    remove: () => Promise<T | undefined>,
    label: string,
  ): Promise<void> {
    const entity = await this.getOrThrow(find, notFound);
    assertOwnerOrAdmin(entity.userId, user);
    await remove();
    this.logger.log(`${label} soft-deleted: ${id}`);
  }

  private handleUniqueViolation(error: unknown, resourceName: string, name?: string): void {
    handleUniqueViolation(error, resourceName, name);
  }
}
