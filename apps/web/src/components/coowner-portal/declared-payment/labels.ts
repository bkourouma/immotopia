import { t } from '../../../i18n/t';
import {
  DECLARATION_PROOF_ACCEPTED_TYPES,
  DECLARATION_PROOF_MAX_BYTES,
  type DeclarationRejectReason,
  type DeclarationStatus,
  type MobileMoneyOperator
} from '../../../services/coowner-portal-service';

/**
 * Libellés et utilitaires partagés de la déclaration de paiement mobile money
 * (spec 047). Des fonctions, pas des tables à l'import : `t()` ne réagit pas
 * au changement de langue.
 */

export function operatorLabel(op: MobileMoneyOperator): string {
  switch (op) {
    case 'ORANGE':
      return t('Orange Money');
    case 'MTN':
      return t('MTN MoMo');
    case 'MOOV':
      return t('Moov Money');
    case 'WAVE':
      return t('Wave');
    default:
      return t('Autre opérateur');
  }
}

export function declarationStatusLabel(status: DeclarationStatus): string {
  switch (status) {
    case 'PENDING':
      return t('En vérification');
    case 'APPROVED':
      return t('Validée');
    case 'REJECTED':
      return t('Rejetée');
    default:
      return t('Annulée');
  }
}

export function declarationStatusColor(status: DeclarationStatus): 'warning' | 'success' | 'error' | 'default' {
  switch (status) {
    case 'PENDING':
      return 'warning';
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'error';
    default:
      return 'default';
  }
}

export function rejectReasonLabel(reason: DeclarationRejectReason): string {
  switch (reason) {
    case 'NOT_FOUND':
      return t('Paiement introuvable');
    case 'AMOUNT_MISMATCH':
      return t('Montant ne correspondant pas');
    case 'REFERENCE_USED':
      return t('Référence déjà utilisée');
    case 'WRONG_NUMBER':
      return t('Numéro de réception erroné');
    default:
      return t('Autre');
  }
}

/** Majuscules, tous les espaces retirés (comme le serveur, contrat §0 « Référence »). */
export function normalizeTransactionReference(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

export function isValidTransactionReference(normalized: string): boolean {
  return /^[A-Z0-9.-]{4,40}$/.test(normalized);
}

/** `null` si la capture est acceptable, sinon le message à afficher. */
export function validateProofFile(file: { type: string; size: number }): string | null {
  if (!DECLARATION_PROOF_ACCEPTED_TYPES.includes(file.type)) {
    return t('La capture doit être une image JPEG, PNG, WebP ou un PDF.');
  }
  if (file.size > DECLARATION_PROOF_MAX_BYTES) {
    return t('La capture ne doit pas dépasser 5 Mo.');
  }
  return null;
}

export function aiReadFailedMessage(): string {
  return t("La lecture automatique n'a pas abouti, remplissez les champs.");
}

export function aiFieldHint(): string {
  return t('Lu automatiquement, vérifiez');
}

/** « +2250707070707 » devient « +225 07 07 07 07 07 » ; tout autre motif est rendu tel quel. */
export function formatPhoneForDisplay(e164: string): string {
  const match = /^\+225(\d{10})$/.exec(e164);
  if (!match) return e164;
  return `+225 ${(match[1].match(/\d{2}/g) ?? []).join(' ')}`;
}

/** Message serveur (`{ success:false, message, code }`) s'il existe, sinon le repli. */
export function parseDeclarationApiError(
  error: unknown,
  fallback: string
): { message: string; code?: string; status?: number } {
  const response = (error as { response?: { status?: number; data?: { message?: unknown; code?: unknown } } } | null)
    ?.response;
  const message =
    typeof response?.data?.message === 'string' && response.data.message ? response.data.message : fallback;
  const code = typeof response?.data?.code === 'string' ? response.data.code : undefined;
  return { message, code, status: response?.status };
}
