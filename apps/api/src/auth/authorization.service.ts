import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from './guards/jwt-auth.guard';
import type { Upload, AccessRepository } from '../database/repositories';

export function assertOwnerOrAdmin(resourceOwnerId: string, currentUser: AuthenticatedUser): void {
  if (currentUser.role === 'admin') return;
  if (resourceOwnerId === currentUser.sub) return;
  throw new ForbiddenException('You do not have permission to modify this resource');
}

/**
 * Assert the current user can access (read) the upload.
 * Returns the upload for callers that need its metadata.
 */
export async function assertCanAccessUpload(
  uploadsRepository: {
    findByIdAnyStatus?: (id: string) => Promise<Upload | undefined>;
    findById?: (id: string) => Promise<Upload | undefined>;
  },
  accessRepository: Pick<AccessRepository, 'hasAnyActiveGrantForUpload'>,
  uploadId: string,
  currentUser: AuthenticatedUser,
): Promise<Upload> {
  const upload =
    (await uploadsRepository.findByIdAnyStatus?.(uploadId)) ??
    (await uploadsRepository.findById?.(uploadId));
  if (!upload || upload.deletedAt) {
    // Deleted uploads are invisible to every caller, including admins.
    throw new NotFoundException('Upload not found');
  }

  const isOwner = upload.userId === currentUser.sub;
  const isAdmin = currentUser.role === 'admin';

  if (isOwner || isAdmin) {
    return upload;
  }

  // Non-owner/non-admin: only ready uploads with explicit access
  if (upload.status !== 'ready') {
    throw new NotFoundException('Upload not found');
  }

  const isAllowed = await accessRepository.hasAnyActiveGrantForUpload(currentUser.sub, {
    uploadId: upload.id,
    propertyId: upload.propertyId,
    talhaoId: upload.talhaoId,
    cropTypeId: upload.cropTypeId,
    estadioId: upload.estadioId,
  });
  if (!isAllowed) {
    throw new NotFoundException('Upload not found');
  }

  return upload;
}

@Injectable()
export class AuthorizationService {
  assertOwnerOrAdmin(resourceOwnerId: string, currentUser: AuthenticatedUser): void {
    return assertOwnerOrAdmin(resourceOwnerId, currentUser);
  }

  assertCanAccessUpload(
    uploadsRepository: {
      findByIdAnyStatus?: (id: string) => Promise<Upload | undefined>;
      findById?: (id: string) => Promise<Upload | undefined>;
    },
    accessRepository: Pick<AccessRepository, 'hasAnyActiveGrantForUpload'>,
    uploadId: string,
    currentUser: AuthenticatedUser,
  ): Promise<Upload> {
    return assertCanAccessUpload(uploadsRepository, accessRepository, uploadId, currentUser);
  }
}
