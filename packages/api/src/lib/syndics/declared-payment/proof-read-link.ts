import { AppError, ErrorCode } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';
import type { prisma, PrismaTransactionClient } from '../../../utils/database';
import type { PrefillField } from './types';

/**
 * Lien entre une lecture IA de capture et la déclaration qui l'utilise (spec 047,
 * T064, R27) : chargement de la lecture, valeurs mémorisées dans `aiPrefill`,
 * champs proposés puis retouchés (`aiEditedFields`).
 *
 * Le JSON de la lecture est relu défensivement : seul un type attendu est repris.
 */

type Client = PrismaTransactionClient | typeof prisma;

export function proofReadInvalid(): AppError {
  return new AppError(
    t("Cette lecture automatique n'est plus valable. Envoyez de nouveau la capture."),
    409,
    ErrorCode.PROOF_READ_INVALID
  );
}

export interface LoadedProofRead {
  id: string;
  tempFileUrl: string;
  /** Valeurs proposées, telles que `readPaymentProof` les a normalisées. */
  values: ProofReadValues;
  /** JSON brut de la lecture, pour `buildAiPrefill`. */
  raw: unknown;
}

export interface ProofReadValues {
  amount: number | null;
  paidAt: string | null;
  transactionReference: string | null;
  payerPhone: string | null;
}

const asString = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

function readValues(result: unknown): ProofReadValues {
  const record = result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
  return {
    amount: typeof record.amount === 'number' && Number.isInteger(record.amount) ? record.amount : null,
    paidAt: asString(record.paidAt),
    transactionReference: asString(record.transactionReference),
    payerPhone: asString(record.payerPhone)
  };
}

/**
 * Lecture de CETTE copropriété et d'un contact du compte, non consommée, non
 * expirée, dont la capture temporaire existe encore ; sinon 409
 * `PROOF_READ_INVALID` (même réponse pour une lecture inconnue, d'un autre
 * contact, d'une autre agence, déjà utilisée ou expirée).
 */
export async function loadProofReadForDeclaration(
  client: Client,
  params: { tenantId: string; syndicateId: string; readId: string; contactIds: string[]; now: Date }
): Promise<LoadedProofRead> {
  const row = await client.syndicPaymentProofRead.findFirst({
    where: {
      id: params.readId,
      tenantId: params.tenantId,
      syndicateId: params.syndicateId,
      contactId: { in: params.contactIds },
      consumedAt: null,
      expiresAt: { gt: params.now },
      tempFileUrl: { not: null }
    },
    select: { id: true, tempFileUrl: true, result: true }
  });
  if (!row?.tempFileUrl) throw proofReadInvalid();
  return { id: row.id, tempFileUrl: row.tempFileUrl, values: readValues(row.result), raw: row.result };
}

/**
 * Contenu de `aiPrefill` : la lecture normalisée, rattachée à son identifiant. Le
 * numéro du bénéficiaire est à la racine (`recipientPhone`) : l'alerte
 * `RECIPIENT_MISMATCH` l'y lit.
 */
export function buildAiPrefill(readId: string, raw: unknown): Record<string, unknown> {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const keep = [
    'quality',
    'operator',
    'amount',
    'paidAt',
    'transactionReference',
    'payerPhone',
    'recipientPhone',
    'recipientName',
    'confidence'
  ];
  const prefill: Record<string, unknown> = { readId };
  for (const key of keep) if (key in record) prefill[key] = record[key];
  return prefill;
}

/** Tolérance sur l'heure : la saisie se fait à la minute. */
const PAID_AT_TOLERANCE_MS = 60_000;

/**
 * Champs que l'IA avait proposés et que la personne a modifiés avant d'envoyer.
 * Un champ sans proposition n'est jamais « retouché ». `operator` n'est pas saisi
 * dans le formulaire : il n'est jamais retouché.
 */
export function computeEditedFields(
  values: ProofReadValues,
  submitted: { amount: number; paidAt: Date; transactionReference: string; payerPhone: string }
): PrefillField[] {
  const edited: PrefillField[] = [];
  if (values.amount !== null && values.amount !== submitted.amount) edited.push('amount');
  if (values.paidAt !== null) {
    const proposed = Date.parse(values.paidAt);
    if (Number.isNaN(proposed) || Math.abs(proposed - submitted.paidAt.getTime()) > PAID_AT_TOLERANCE_MS) {
      edited.push('paidAt');
    }
  }
  if (values.transactionReference !== null && values.transactionReference !== submitted.transactionReference) {
    edited.push('transactionReference');
  }
  if (values.payerPhone !== null && values.payerPhone !== submitted.payerPhone) edited.push('payerPhone');
  return edited;
}
