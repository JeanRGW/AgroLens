import type { UserRole } from '@agrolens/contracts';

/**
 * Presentation-only labels and guards. These are UI copy, not API types:
 * API shapes live in @agrolens/contracts and must not be re-declared here.
 */
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  user: 'Usuário',
};

export const RESOURCE_LABELS: Record<string, string> = {
  upload: 'Upload',
  upload_file: 'Arquivo de upload',
  property: 'Propriedade',
  talhao: 'Talhão',
  crop_type: 'Tipo de Cultura',
  estadio: 'Estádio',
};

const USER_ROLES: readonly string[] = ['admin', 'user'];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

const GRANT_RESOURCE_TYPES: readonly string[] = [
  'upload',
  'property',
  'talhao',
  'crop_type',
  'estadio',
];

export function isResourceType(value: unknown): value is string {
  return typeof value === 'string' && GRANT_RESOURCE_TYPES.includes(value);
}
