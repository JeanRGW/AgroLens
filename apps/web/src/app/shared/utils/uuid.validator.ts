import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const uuidValidator: ValidatorFn = (control) =>
  !control.value ||
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(control.value)
    ? null
    : { invalidId: true };

/**
 * Checks whether a string looks like a plausible opaque entity ID
 * (UUID, ULID, etc.). Rejects email-like values and strings with whitespace.
 */
export function isLikelyEntityId(value: string): boolean {
  const normalized = value.trim();

  return (
    normalized.length >= 6 &&
    normalized.length <= 128 &&
    !normalized.includes('@') &&
    !/\s/.test(normalized)
  );
}

export const entityIdValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value = `${control.value ?? ''}`;
  if (!value.trim()) {
    return null;
  }

  return isLikelyEntityId(value) ? null : { invalidId: true };
};
