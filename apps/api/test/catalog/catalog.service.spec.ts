import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CatalogService } from '../../src/catalog/catalog.service';
import { CatalogRepository, UsersRepository } from '../../src/database/repositories';
import type { Property, Talhao, CropType, Estadio } from '../../src/database/repositories';
import type { AuthenticatedUser } from '../../src/auth/guards/jwt-auth.guard';

// ── Helpers ──────────────────────────────────────────────────────────

function makeCurrentUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    sub: 'user-uuid-1',
    email: 'owner@example.com',
    role: 'user',
    userRecord: {
      id: 'user-uuid-1',
      email: 'owner@example.com',
      fullName: 'Test Owner',
      phone: null,
      role: 'user',
      disabledAt: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    },
    ...overrides,
  };
}

function makeAdminUser(): AuthenticatedUser {
  return makeCurrentUser({
    sub: 'admin-uuid-1',
    email: 'admin@example.com',
    role: 'admin',
    userRecord: {
      id: 'admin-uuid-1',
      email: 'admin@example.com',
      fullName: 'Admin User',
      phone: null,
      role: 'admin',
      disabledAt: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    },
  });
}

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'prop-uuid-1',
    name: 'Fazenda Santa Maria',
    normalizedName: 'fazenda santa maria',
    owner: 'Joao Silva',
    userId: 'user-uuid-1',
    address: 'Rodovia SP-340, km 120',
    latitude: -22.9068,
    longitude: -43.1729,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

function makeTalhao(overrides: Partial<Talhao> = {}): Talhao {
  return {
    id: 'talhao-uuid-1',
    name: 'Talhao Norte',
    normalizedName: 'talhao norte',
    propertyId: 'prop-uuid-1',
    userId: 'user-uuid-1',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

function makeCropType(overrides: Partial<CropType> = {}): CropType {
  return {
    id: 'crop-uuid-1',
    name: 'Soja',
    normalizedName: 'soja',
    userId: 'user-uuid-1',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

function makeEstadio(overrides: Partial<Estadio> = {}): Estadio {
  return {
    id: 'estadio-uuid-1',
    name: 'Vegetativo',
    normalizedName: 'vegetativo',
    cropTypeId: 'crop-uuid-1',
    userId: 'user-uuid-1',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('CatalogService', () => {
  let service: CatalogService;

  const mockCatalogRepository = {
    listProperties: jest.fn(),
    findPropertyById: jest.fn(),
    createProperty: jest.fn(),
    updateProperty: jest.fn(),
    softDeleteProperty: jest.fn(),
    listTalhoes: jest.fn(),
    findTalhaoById: jest.fn(),
    createTalhao: jest.fn(),
    updateTalhao: jest.fn(),
    softDeleteTalhao: jest.fn(),
    listCropTypes: jest.fn(),
    findCropTypeById: jest.fn(),
    createCropType: jest.fn(),
    updateCropType: jest.fn(),
    softDeleteCropType: jest.fn(),
    listEstadios: jest.fn(),
    findEstadioById: jest.fn(),
    createEstadio: jest.fn(),
    updateEstadio: jest.fn(),
    softDeleteEstadio: jest.fn(),
  };

  const owner = makeCurrentUser();
  const admin = makeAdminUser();
  const otherUser = makeCurrentUser({
    sub: 'other-user-uuid',
    email: 'other@example.com',
    role: 'user',
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: CatalogRepository, useValue: mockCatalogRepository },
        {
          provide: UsersRepository,
          useValue: { findById: jest.fn().mockResolvedValue({ id: 'new-owner' }) },
        },
      ],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
  });

  // ── Properties ────────────────────────────────────────────────────
  it('allows admins to transfer ownership but rejects owners doing so', async () => {
    mockCatalogRepository.findPropertyById.mockResolvedValue(makeProperty());
    mockCatalogRepository.updateProperty.mockResolvedValue(makeProperty({ userId: 'new-owner' }));
    await expect(
      service.updateProperty('prop-uuid-1', { userId: 'new-owner' }, owner),
    ).rejects.toThrow(ForbiddenException);
    await service.updateProperty('prop-uuid-1', { userId: 'new-owner' }, admin);
    expect(mockCatalogRepository.updateProperty).toHaveBeenCalledWith('prop-uuid-1', {
      userId: 'new-owner',
    });
  });

  it('allows an owner to move a talhao under another users property', async () => {
    mockCatalogRepository.findTalhaoById.mockResolvedValue(makeTalhao());
    mockCatalogRepository.findPropertyById.mockResolvedValue(
      makeProperty({ id: 'destination', userId: otherUser.sub }),
    );
    mockCatalogRepository.updateTalhao.mockResolvedValue(makeTalhao({ propertyId: 'destination' }));
    await service.updateTalhao('talhao-uuid-1', { propertyId: 'destination' }, owner);
    expect(mockCatalogRepository.updateTalhao).toHaveBeenCalledWith(
      'talhao-uuid-1',
      expect.objectContaining({ propertyId: 'destination' }),
    );
  });

  describe('properties', () => {
    describe('createProperty', () => {
      it('should create a property with normalized name and current user as owner', async () => {
        mockCatalogRepository.createProperty.mockResolvedValue(makeProperty());

        const result = await service.createProperty(
          {
            name: 'Fazenda Santa Maria',
            owner: 'Joao Silva',
            address: 'Rodovia SP-340, km 120',
            latitude: -22.9068,
            longitude: -43.1729,
          },
          owner,
        );

        expect(result.name).toBe('Fazenda Santa Maria');
        expect(mockCatalogRepository.createProperty).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Fazenda Santa Maria',
            normalizedName: 'fazenda santa maria',
            userId: 'user-uuid-1',
          }),
        );
      });

      it('should throw ConflictException on unique violation', async () => {
        const pgError = Object.assign(new Error('duplicate'), { code: '23505' });
        mockCatalogRepository.createProperty.mockRejectedValue(pgError);

        await expect(
          service.createProperty(
            {
              name: 'Duplicate',
              owner: 'Owner',
              address: 'Addr',
              latitude: 0,
              longitude: 0,
            },
            owner,
          ),
        ).rejects.toThrow(ConflictException);
      });
    });

    describe('updateProperty', () => {
      it('should allow owner to update their property', async () => {
        mockCatalogRepository.findPropertyById.mockResolvedValue(makeProperty());
        mockCatalogRepository.updateProperty.mockResolvedValue(
          makeProperty({ name: 'Updated Name' }),
        );

        const result = await service.updateProperty('prop-uuid-1', { name: 'Updated Name' }, owner);

        expect(result.name).toBe('Updated Name');
      });

      it('should allow admin to update any property', async () => {
        mockCatalogRepository.findPropertyById.mockResolvedValue(makeProperty());
        mockCatalogRepository.updateProperty.mockResolvedValue(
          makeProperty({ name: 'Admin Updated' }),
        );

        const result = await service.updateProperty(
          'prop-uuid-1',
          { name: 'Admin Updated' },
          admin,
        );

        expect(result.name).toBe('Admin Updated');
      });

      it('should reject non-owner non-admin user', async () => {
        mockCatalogRepository.findPropertyById.mockResolvedValue(makeProperty());

        await expect(
          service.updateProperty('prop-uuid-1', { name: 'Hacked' }, otherUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should throw NotFoundException when property does not exist', async () => {
        mockCatalogRepository.findPropertyById.mockResolvedValue(undefined);

        await expect(service.updateProperty('nonexistent', { name: 'X' }, owner)).rejects.toThrow(
          NotFoundException,
        );
      });

      it('should pass normalized name to repository on name update', async () => {
        mockCatalogRepository.findPropertyById.mockResolvedValue(makeProperty());
        mockCatalogRepository.updateProperty.mockResolvedValue(makeProperty());

        await service.updateProperty('prop-uuid-1', { name: 'São Paulo' }, owner);

        expect(mockCatalogRepository.updateProperty).toHaveBeenCalledWith(
          'prop-uuid-1',
          expect.objectContaining({
            name: 'São Paulo',
            normalizedName: 'sao paulo',
          }),
        );
      });
    });

    describe('softDeleteProperty', () => {
      it('should allow owner to delete their property', async () => {
        mockCatalogRepository.findPropertyById.mockResolvedValue(makeProperty());
        mockCatalogRepository.softDeleteProperty.mockResolvedValue(makeProperty());

        await service.softDeleteProperty('prop-uuid-1', owner);

        expect(mockCatalogRepository.softDeleteProperty).toHaveBeenCalledWith('prop-uuid-1');
      });

      it('should allow admin to delete any property', async () => {
        mockCatalogRepository.findPropertyById.mockResolvedValue(makeProperty());
        mockCatalogRepository.softDeleteProperty.mockResolvedValue(makeProperty());

        await service.softDeleteProperty('prop-uuid-1', admin);

        expect(mockCatalogRepository.softDeleteProperty).toHaveBeenCalledWith('prop-uuid-1');
      });

      it('should reject non-owner non-admin user', async () => {
        mockCatalogRepository.findPropertyById.mockResolvedValue(makeProperty());

        await expect(service.softDeleteProperty('prop-uuid-1', otherUser)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('should throw NotFoundException when property does not exist', async () => {
        mockCatalogRepository.findPropertyById.mockResolvedValue(undefined);

        await expect(service.softDeleteProperty('nonexistent', owner)).rejects.toThrow(
          NotFoundException,
        );
      });
    });
  });

  // ── Talhoes ───────────────────────────────────────────────────────

  describe('talhoes', () => {
    describe('createTalhao', () => {
      it('should create a talhao when user owns the parent property', async () => {
        mockCatalogRepository.findPropertyById.mockResolvedValue(makeProperty());
        mockCatalogRepository.createTalhao.mockResolvedValue(makeTalhao());

        const result = await service.createTalhao(
          { name: 'Talhao Norte', propertyId: 'prop-uuid-1' },
          owner,
        );

        expect(result.name).toBe('Talhao Norte');
        expect(mockCatalogRepository.createTalhao).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Talhao Norte',
            normalizedName: 'talhao norte',
            propertyId: 'prop-uuid-1',
            userId: 'user-uuid-1',
          }),
        );
      });

      it('should allow admin to create a talhao under any property', async () => {
        mockCatalogRepository.findPropertyById.mockResolvedValue(makeProperty());
        mockCatalogRepository.createTalhao.mockResolvedValue(makeTalhao());

        await service.createTalhao({ name: 'Talhao Norte', propertyId: 'prop-uuid-1' }, admin);

        expect(mockCatalogRepository.createTalhao).toHaveBeenCalled();
      });

      it('should allow a non-owner non-admin user to create under an existing property', async () => {
        mockCatalogRepository.findPropertyById.mockResolvedValue(makeProperty());
        mockCatalogRepository.createTalhao.mockResolvedValue(makeTalhao({ userId: otherUser.sub }));

        const result = await service.createTalhao(
          { name: 'Talhao', propertyId: 'prop-uuid-1' },
          otherUser,
        );

        expect(result.userId).toBe(otherUser.sub);
        expect(mockCatalogRepository.createTalhao).toHaveBeenCalledWith(
          expect.objectContaining({
            propertyId: 'prop-uuid-1',
            userId: otherUser.sub,
          }),
        );
      });

      it('should throw NotFoundException when parent property does not exist', async () => {
        mockCatalogRepository.findPropertyById.mockResolvedValue(undefined);

        await expect(
          service.createTalhao({ name: 'Talhao', propertyId: 'nonexistent' }, owner),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw ConflictException on unique violation', async () => {
        mockCatalogRepository.findPropertyById.mockResolvedValue(makeProperty());
        const pgError = Object.assign(new Error('duplicate'), { code: '23505' });
        mockCatalogRepository.createTalhao.mockRejectedValue(pgError);

        await expect(
          service.createTalhao({ name: 'Duplicate', propertyId: 'prop-uuid-1' }, owner),
        ).rejects.toThrow(ConflictException);
      });
    });

    describe('updateTalhao', () => {
      it('should allow owner to update', async () => {
        mockCatalogRepository.findTalhaoById.mockResolvedValue(makeTalhao());
        mockCatalogRepository.updateTalhao.mockResolvedValue(makeTalhao({ name: 'Updated' }));

        const result = await service.updateTalhao('talhao-uuid-1', { name: 'Updated' }, owner);
        expect(result.name).toBe('Updated');
      });

      it('should reject non-owner non-admin user', async () => {
        mockCatalogRepository.findTalhaoById.mockResolvedValue(makeTalhao());

        await expect(
          service.updateTalhao('talhao-uuid-1', { name: 'X' }, otherUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should throw NotFoundException when talhao does not exist', async () => {
        mockCatalogRepository.findTalhaoById.mockResolvedValue(undefined);

        await expect(service.updateTalhao('nonexistent', { name: 'X' }, owner)).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('softDeleteTalhao', () => {
      it('should allow owner to delete', async () => {
        mockCatalogRepository.findTalhaoById.mockResolvedValue(makeTalhao());
        mockCatalogRepository.softDeleteTalhao.mockResolvedValue(makeTalhao());

        await service.softDeleteTalhao('talhao-uuid-1', owner);
        expect(mockCatalogRepository.softDeleteTalhao).toHaveBeenCalledWith('talhao-uuid-1');
      });

      it('should reject non-owner non-admin user', async () => {
        mockCatalogRepository.findTalhaoById.mockResolvedValue(makeTalhao());

        await expect(service.softDeleteTalhao('talhao-uuid-1', otherUser)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('should throw NotFoundException when talhao does not exist', async () => {
        mockCatalogRepository.findTalhaoById.mockResolvedValue(undefined);

        await expect(service.softDeleteTalhao('nonexistent', owner)).rejects.toThrow(
          NotFoundException,
        );
      });
    });
  });

  // ── Crop Types ────────────────────────────────────────────────────

  describe('cropTypes', () => {
    describe('createCropType', () => {
      it('should create a crop type with normalized name', async () => {
        mockCatalogRepository.createCropType.mockResolvedValue(makeCropType());

        const result = await service.createCropType({ name: 'Soja' }, owner);

        expect(result.name).toBe('Soja');
        expect(mockCatalogRepository.createCropType).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Soja',
            normalizedName: 'soja',
            userId: 'user-uuid-1',
          }),
        );
      });

      it('should normalize diacritics on create', async () => {
        mockCatalogRepository.createCropType.mockResolvedValue(makeCropType({ name: 'Café' }));

        await service.createCropType({ name: 'Café' }, owner);

        expect(mockCatalogRepository.createCropType).toHaveBeenCalledWith(
          expect.objectContaining({ normalizedName: 'cafe' }),
        );
      });

      it('should throw ConflictException on unique violation', async () => {
        const pgError = Object.assign(new Error('duplicate'), { code: '23505' });
        mockCatalogRepository.createCropType.mockRejectedValue(pgError);

        await expect(service.createCropType({ name: 'Duplicate' }, owner)).rejects.toThrow(
          ConflictException,
        );
      });
    });

    describe('updateCropType', () => {
      it('should allow owner to update', async () => {
        mockCatalogRepository.findCropTypeById.mockResolvedValue(makeCropType());
        mockCatalogRepository.updateCropType.mockResolvedValue(makeCropType({ name: 'Milho' }));

        const result = await service.updateCropType('crop-uuid-1', { name: 'Milho' }, owner);
        expect(result.name).toBe('Milho');
      });

      it('should allow admin to update', async () => {
        mockCatalogRepository.findCropTypeById.mockResolvedValue(makeCropType());
        mockCatalogRepository.updateCropType.mockResolvedValue(makeCropType({ name: 'Milho' }));

        await service.updateCropType('crop-uuid-1', { name: 'Milho' }, admin);
        expect(mockCatalogRepository.updateCropType).toHaveBeenCalled();
      });

      it('should reject non-owner non-admin user', async () => {
        mockCatalogRepository.findCropTypeById.mockResolvedValue(makeCropType());

        await expect(
          service.updateCropType('crop-uuid-1', { name: 'X' }, otherUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should throw NotFoundException when crop type does not exist', async () => {
        mockCatalogRepository.findCropTypeById.mockResolvedValue(undefined);

        await expect(service.updateCropType('nonexistent', { name: 'X' }, owner)).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('softDeleteCropType', () => {
      it('should allow owner to delete', async () => {
        mockCatalogRepository.findCropTypeById.mockResolvedValue(makeCropType());
        mockCatalogRepository.softDeleteCropType.mockResolvedValue(makeCropType());

        await service.softDeleteCropType('crop-uuid-1', owner);
        expect(mockCatalogRepository.softDeleteCropType).toHaveBeenCalledWith('crop-uuid-1');
      });

      it('should reject non-owner non-admin user', async () => {
        mockCatalogRepository.findCropTypeById.mockResolvedValue(makeCropType());

        await expect(service.softDeleteCropType('crop-uuid-1', otherUser)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('should throw NotFoundException when crop type does not exist', async () => {
        mockCatalogRepository.findCropTypeById.mockResolvedValue(undefined);

        await expect(service.softDeleteCropType('nonexistent', owner)).rejects.toThrow(
          NotFoundException,
        );
      });
    });
  });

  // ── Estadios ──────────────────────────────────────────────────────

  describe('estadios', () => {
    describe('createEstadio', () => {
      it('should create an estadio when user owns the parent crop type', async () => {
        mockCatalogRepository.findCropTypeById.mockResolvedValue(makeCropType());
        mockCatalogRepository.createEstadio.mockResolvedValue(makeEstadio());

        const result = await service.createEstadio(
          { name: 'Vegetativo', cropTypeId: 'crop-uuid-1' },
          owner,
        );

        expect(result.name).toBe('Vegetativo');
        expect(mockCatalogRepository.createEstadio).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Vegetativo',
            normalizedName: 'vegetativo',
            cropTypeId: 'crop-uuid-1',
            userId: 'user-uuid-1',
          }),
        );
      });

      it('should allow admin to create estadio under any crop type', async () => {
        mockCatalogRepository.findCropTypeById.mockResolvedValue(makeCropType());
        mockCatalogRepository.createEstadio.mockResolvedValue(makeEstadio());

        await service.createEstadio({ name: 'Vegetativo', cropTypeId: 'crop-uuid-1' }, admin);

        expect(mockCatalogRepository.createEstadio).toHaveBeenCalled();
      });

      it('should allow a non-owner non-admin user to create under an existing crop type', async () => {
        mockCatalogRepository.findCropTypeById.mockResolvedValue(makeCropType());
        mockCatalogRepository.createEstadio.mockResolvedValue(
          makeEstadio({ userId: otherUser.sub }),
        );

        const result = await service.createEstadio(
          { name: 'Estadio', cropTypeId: 'crop-uuid-1' },
          otherUser,
        );

        expect(result.userId).toBe(otherUser.sub);
        expect(mockCatalogRepository.createEstadio).toHaveBeenCalledWith(
          expect.objectContaining({
            cropTypeId: 'crop-uuid-1',
            userId: otherUser.sub,
          }),
        );
      });

      it('should throw NotFoundException when parent crop type does not exist', async () => {
        mockCatalogRepository.findCropTypeById.mockResolvedValue(undefined);

        await expect(
          service.createEstadio({ name: 'Estadio', cropTypeId: 'nonexistent' }, owner),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw ConflictException on unique violation', async () => {
        mockCatalogRepository.findCropTypeById.mockResolvedValue(makeCropType());
        const pgError = Object.assign(new Error('duplicate'), { code: '23505' });
        mockCatalogRepository.createEstadio.mockRejectedValue(pgError);

        await expect(
          service.createEstadio({ name: 'Duplicate', cropTypeId: 'crop-uuid-1' }, owner),
        ).rejects.toThrow(ConflictException);
      });
    });

    describe('updateEstadio', () => {
      it('should allow owner to update', async () => {
        mockCatalogRepository.findEstadioById.mockResolvedValue(makeEstadio());
        mockCatalogRepository.updateEstadio.mockResolvedValue(makeEstadio({ name: 'Floracao' }));

        const result = await service.updateEstadio('estadio-uuid-1', { name: 'Floracao' }, owner);
        expect(result.name).toBe('Floracao');
      });

      it('should allow admin to update', async () => {
        mockCatalogRepository.findEstadioById.mockResolvedValue(makeEstadio());
        mockCatalogRepository.updateEstadio.mockResolvedValue(makeEstadio({ name: 'Floracao' }));

        await service.updateEstadio('estadio-uuid-1', { name: 'Floracao' }, admin);
        expect(mockCatalogRepository.updateEstadio).toHaveBeenCalled();
      });

      it('should reject non-owner non-admin user', async () => {
        mockCatalogRepository.findEstadioById.mockResolvedValue(makeEstadio());

        await expect(
          service.updateEstadio('estadio-uuid-1', { name: 'X' }, otherUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should throw NotFoundException when estadio does not exist', async () => {
        mockCatalogRepository.findEstadioById.mockResolvedValue(undefined);

        await expect(service.updateEstadio('nonexistent', { name: 'X' }, owner)).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('softDeleteEstadio', () => {
      it('should allow owner to delete', async () => {
        mockCatalogRepository.findEstadioById.mockResolvedValue(makeEstadio());
        mockCatalogRepository.softDeleteEstadio.mockResolvedValue(makeEstadio());

        await service.softDeleteEstadio('estadio-uuid-1', owner);
        expect(mockCatalogRepository.softDeleteEstadio).toHaveBeenCalledWith('estadio-uuid-1');
      });

      it('should reject non-owner non-admin user', async () => {
        mockCatalogRepository.findEstadioById.mockResolvedValue(makeEstadio());

        await expect(service.softDeleteEstadio('estadio-uuid-1', otherUser)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('should throw NotFoundException when estadio does not exist', async () => {
        mockCatalogRepository.findEstadioById.mockResolvedValue(undefined);

        await expect(service.softDeleteEstadio('nonexistent', owner)).rejects.toThrow(
          NotFoundException,
        );
      });
    });
  });

  // ── Unique violation via non-23505 error ──────────────────────────

  describe('non-unique errors', () => {
    it('should re-throw non-23505 errors without wrapping', async () => {
      const genericError = new Error('connection refused');
      mockCatalogRepository.createProperty.mockRejectedValue(genericError);

      await expect(
        service.createProperty(
          { name: 'X', owner: 'O', address: 'A', latitude: 0, longitude: 0 },
          owner,
        ),
      ).rejects.toThrow('connection refused');
    });
  });
});
