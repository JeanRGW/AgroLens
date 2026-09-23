import { ConflictException, NotFoundException } from '@nestjs/common';
import { isUniqueViolation } from '../database/database.utils';

/**
 * Common catalog error and uniqueness helpers.
 * Generic CrudController was deferred to avoid over-engineering and keep controller contracts explicit.
 */
export function handleUniqueViolation(error: unknown, resourceName: string, name?: string): void {
  if (isUniqueViolation(error)) {
    throw new ConflictException(
      name
        ? `A ${resourceName} with the name "${name}" already exists`
        : `A ${resourceName} with the same name already exists`,
    );
  }
}

export function notFound(entity: string, id?: string): never {
  throw new NotFoundException(id ? `${entity} ${id} not found` : `${entity} not found`);
}

export async function getOrThrow<T>(
  find: () => Promise<T | undefined>,
  message: string,
): Promise<T> {
  const value = await find();
  if (!value) throw new NotFoundException(message);
  return value;
}
