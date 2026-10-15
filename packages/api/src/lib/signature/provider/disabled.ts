import { AppError } from '../../../middleware/error-middleware';
import type { SignatureProvider } from '../types';

/** Refus uniforme quand `SIGNATURE_PROVIDER=disabled` (texte littéral : recensé par i18n:extract). */
export function signatureDisabledError(): AppError {
  return new AppError("La signature électronique n'est pas activée sur ce serveur.", 503, 'SERVICE_UNAVAILABLE');
}

/** Fournisseur par défaut (`SIGNATURE_PROVIDER=disabled`) : toute demande est refusée. */
export function createDisabledProvider(): SignatureProvider {
  return {
    id: 'disabled',
    qualified: false,
    async createRequest() {
      throw signatureDisabledError();
    },
    async cancel() {
      // Rien à annuler chez un fournisseur inexistant.
    },
    async deliver() {
      return { ok: false, reason: 'DISABLED' };
    }
  };
}
