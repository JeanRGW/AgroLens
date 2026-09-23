/**
 * Normalize a catalog name for uniqueness checks.
 *
 * - Trims leading/trailing whitespace
 * - Converts to lowercase
 * - Strips diacritics (accents) using Unicode NFD decomposition
 * - Collapses internal whitespace to a single space
 */
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}
