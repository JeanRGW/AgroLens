import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  AccessRepository,
  UsersRepository,
  UploadsRepository,
  CatalogRepository,
} from '../database/repositories';
import type { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import type { CreateGrantDto } from './dto/create-grant.dto';
import type { ListGrantsQueryInput } from './dto/list-grants-query.dto';
import type { AccessGrant } from '../database/repositories';
import { isUniqueViolation } from '../database/database.utils';
import { resolveLimitOffset } from '../shared/http/pagination';

@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);

  constructor(
    private readonly accessRepository: AccessRepository,
    private readonly usersRepository: UsersRepository,
    private readonly uploadsRepository: UploadsRepository,
    private readonly catalogRepository: CatalogRepository,
  ) {}

  // ── GET /access-grants ────────────────────────────────────────────

  /**
   * List grants visible to the current user with optional filters and pagination.
   * Admins see all grants. Non-admin owners see grants for resources they own.
   * Returns the normalized list envelope { items, total, limit, offset }.
   */
  async listGrants(
    currentUser: AuthenticatedUser,
    query?: ListGrantsQueryInput,
  ): Promise<{ items: AccessGrant[]; total: number; limit: number; offset: number }> {
    const { limit, offset } = resolveLimitOffset(query, 50);
    const [grants, total] = await this.accessRepository.listFilteredAndCount({
      ownerUserId: currentUser.role === 'admin' ? undefined : currentUser.sub,
      subjectUserId: query?.subjectUserId,
      resourceType: query?.resourceType,
      resourceId: query?.resourceId,
      limit,
      offset,
    });
    return { items: grants, total, limit, offset };
  }

  // ── POST /access-grants ───────────────────────────────────────────

  /**
   * Create a new access grant.
   * Authorization: admin can grant any; non-admin owner may grant on owned resources.
   */
  async createGrant(dto: CreateGrantDto, currentUser: AuthenticatedUser): Promise<AccessGrant> {
    // Validate subject user exists
    const subjectUser = await this.usersRepository.findById(dto.subjectUserId);
    if (!subjectUser) {
      throw new NotFoundException('Subject user not found');
    }

    // Validate resource exists and check ownership
    await this.validateAndAuthorizeResource(dto.resourceType, dto.resourceId, currentUser);

    // Check for duplicate active grant (DB constraint catches this too, but fail early)
    const existing = await this.accessRepository.findActiveGrant(
      dto.subjectUserId,
      dto.resourceType,
      dto.resourceId,
    );
    if (existing) {
      throw new ConflictException('An active grant already exists for this user and resource');
    }

    // Create the grant
    let grant: AccessGrant;
    try {
      grant = await this.accessRepository.createGrant(
        {
          subjectUserId: dto.subjectUserId,
          resourceType: dto.resourceType,
          resourceId: dto.resourceId,
          actions: dto.actions ?? ['read'],
          grantedByUserId: currentUser.sub,
          reason: dto.reason ?? null,
        },
        { actorUserId: currentUser.sub },
      );
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An active grant already exists for this user and resource');
      }
      throw error;
    }

    this.logger.log(
      `Grant created: user ${dto.subjectUserId} -> ${dto.resourceType}:${dto.resourceId} by ${currentUser.email}`,
    );

    return grant;
  }

  // ── DELETE /access-grants/:id ─────────────────────────────────────

  /**
   * Revoke (soft-delete) an access grant.
   * Authorization: admin can revoke any; non-admin owner may revoke on owned resources.
   * Audits the revocation.
   */
  async revokeGrant(grantId: string, currentUser: AuthenticatedUser): Promise<void> {
    const grant = await this.accessRepository.findGrantById(grantId);
    if (!grant) {
      throw new NotFoundException('Access grant not found');
    }

    // If already revoked, treat as no-op success
    if (grant.revokedAt) {
      return;
    }

    // Validate resource exists and check ownership for non-admin
    if (currentUser.role !== 'admin') {
      await this.validateResourceOwnership(grant.resourceType, grant.resourceId, currentUser);
    }

    // Revoke and audit atomically.
    await this.accessRepository.revokeGrant(grantId, { actorUserId: currentUser.sub, grant });

    this.logger.log(
      `Grant revoked: ${grantId} (user ${grant.subjectUserId} -> ${grant.resourceType}:${grant.resourceId}) by ${currentUser.email}`,
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────

  /**
   * Validate that a resource exists for the given type and ID.
   * For non-admin users, also verify ownership.
   */
  private async validateAndAuthorizeResource(
    resourceType: string,
    resourceId: string,
    currentUser: AuthenticatedUser,
  ): Promise<void> {
    if (currentUser.role === 'admin') {
      // Admin: just verify resource exists
      const exists = await this.resourceExists(resourceType, resourceId);
      if (!exists) {
        throw new NotFoundException(`${resourceType} not found`);
      }
      return;
    }

    // Non-admin: verify resource exists AND user owns it
    await this.validateResourceOwnership(resourceType, resourceId, currentUser);
  }

  /**
   * Verify resource exists and the non-admin user owns it.
   * Throws NotFoundException or ForbiddenException.
   */
  private async validateResourceOwnership(
    resourceType: string,
    resourceId: string,
    currentUser: AuthenticatedUser,
  ): Promise<void> {
    switch (resourceType) {
      case 'upload': {
        const upload = await this.uploadsRepository.findById(resourceId);
        if (!upload) throw new NotFoundException('Upload not found');
        if (upload.userId !== currentUser.sub) {
          throw new ForbiddenException('You do not own this upload');
        }
        return;
      }
      case 'property': {
        const prop = await this.catalogRepository.findPropertyById(resourceId);
        if (!prop) throw new NotFoundException('Property not found');
        if (prop.userId !== currentUser.sub) {
          throw new ForbiddenException('You do not own this property');
        }
        return;
      }
      case 'talhao': {
        const talhao = await this.catalogRepository.findTalhaoById(resourceId);
        if (!talhao) throw new NotFoundException('Talhão not found');
        if (talhao.userId !== currentUser.sub) {
          throw new ForbiddenException('You do not own this talhão');
        }
        return;
      }
      case 'crop_type': {
        const ct = await this.catalogRepository.findCropTypeById(resourceId);
        if (!ct) throw new NotFoundException('Crop type not found');
        if (ct.userId !== currentUser.sub) {
          throw new ForbiddenException('You do not own this crop type');
        }
        return;
      }
      case 'estadio': {
        const estadio = await this.catalogRepository.findEstadioById(resourceId);
        if (!estadio) throw new NotFoundException('Estádio not found');
        // Estadios belong to a crop type; the estadio has a userId field in the schema
        if (estadio.userId !== currentUser.sub) {
          throw new ForbiddenException('You do not own this estádio');
        }
        return;
      }
      default:
        throw new BadRequestException(`Unknown resource type: ${resourceType}`);
    }
  }

  /**
   * Check if a resource exists without ownership concern.
   */
  private async resourceExists(resourceType: string, resourceId: string): Promise<boolean> {
    switch (resourceType) {
      case 'upload':
        return !!(await this.uploadsRepository.findById(resourceId));
      case 'property':
        return !!(await this.catalogRepository.findPropertyById(resourceId));
      case 'talhao':
        return !!(await this.catalogRepository.findTalhaoById(resourceId));
      case 'crop_type':
        return !!(await this.catalogRepository.findCropTypeById(resourceId));
      case 'estadio':
        return !!(await this.catalogRepository.findEstadioById(resourceId));
      default:
        return false;
    }
  }
}
