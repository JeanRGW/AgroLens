import { HttpContextToken } from '@angular/common/http';

export const EXPECTED_USER_ID = new HttpContextToken<string | null>(() => null);
export const AUTH_TOKEN_OVERRIDE = new HttpContextToken<string | null>(() => null);

export class SessionIdentityError extends Error {
  constructor() {
    super('A conta mudou. Entre com a conta que salvou este lote para sincronizá-lo.');
    this.name = 'SessionIdentityError';
  }
}
