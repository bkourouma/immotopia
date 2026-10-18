import { createHmac, hkdfSync } from 'node:crypto';
import { env } from '../../config/env';
import { t } from '../../i18n';
import { BadRequestError } from '../../middleware/error-middleware';

/**
 * Empreinte des données d'un mandat envoyé en signature (spec 042 §10, SIG-S4).
 *
 * Elle contient l'IBAN complet dans son entrée : un SHA-256 d'un JSON portant
 * l'IBAN se retrouverait par essai exhaustif. C'est donc un HMAC-SHA-256 dont
 * la clé est DÉRIVÉE (HKDF) de `DIRECT_DEBIT_IBAN_KEY`, comme `file-digest.ts`.
 * Seul le serveur peut la recalculer ; le résultat ne contient jamais l'IBAN.
 */

const KEY_INFO = 'immotopia:direct-debit:signature-snapshot';

/** Données figées à l'envoi : celles du PDF, plus les identifiants du périmètre. */
export interface MandateSnapshotInput {
  scope: string;
  reference: string;
  creditorId: string;
  creditorLabel: string;
  creditorIdentifier: string | null;
  creditorBankName: string | null;
  debtorName: string | null;
  holderName: string;
  /** IBAN complet : entre dans le HMAC, jamais dans le résultat. */
  iban: string;
  bankCode: string;
  leaseId: string | null;
  lotId: string | null;
  syndicateId: string | null;
  leaseNumber: string | null;
  propertyLabel: string | null;
  /** Copropriété : syndicat et lot débités (nuls pour un bail). */
  syndicateName?: string | null;
  lotNumber?: string | null;
  maxAmount: number | null;
  collectionDay: number;
  currency: string;
}

function snapshotKey(): Buffer {
  const raw = env.DIRECT_DEBIT_IBAN_KEY?.trim();
  const master = raw ? Buffer.from(raw, 'base64') : null;
  if (!master || master.length !== 32) {
    throw new BadRequestError(t("Le chiffrement des coordonnées bancaires n'est pas configuré sur ce serveur."));
  }
  return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), Buffer.from(KEY_INFO, 'utf8'), 32));
}

/** HMAC-SHA-256 hexadécimal des données du mandat. Lève une BadRequestError sans clé courante. */
export function computeMandateSignatureSnapshot(input: MandateSnapshotInput): string {
  // Ordre des champs fixe : l'empreinte ne dépend pas de l'ordre de construction de l'objet.
  const canonical = JSON.stringify([
    input.scope,
    input.reference,
    input.creditorId,
    input.creditorLabel,
    input.creditorIdentifier,
    input.creditorBankName,
    input.debtorName,
    input.holderName,
    input.iban.replace(/\s+/g, '').toUpperCase(),
    input.bankCode,
    input.leaseId,
    input.lotId,
    input.syndicateId,
    input.leaseNumber,
    input.propertyLabel,
    input.syndicateName ?? null,
    input.lotNumber ?? null,
    input.maxAmount,
    input.collectionDay,
    input.currency
  ]);
  return createHmac('sha256', snapshotKey()).update(canonical, 'utf8').digest('hex');
}
