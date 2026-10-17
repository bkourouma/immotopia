import type { Prisma } from '@prisma/client';
import { t } from '../../../i18n';
import { AppError, BadRequestError, ConflictError, NotFoundError } from '../../../middleware/error-middleware';
import { recordAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import type { PrismaTransactionClient } from '../../../utils/database';
import { formatFrenchDate, parseIsoDate, todayUtc, toIsoDate } from '../business-days';
import { remittanceReferenceOf } from '../remittance-dto';
import type { ReturnScope } from './types';

/**
 * Éléments communs aux constats de retour banque (spec 042, P3, data-model §8).
 *
 * Isolation : une remise n'est lue qu'avec `tenantId` ET le périmètre
 * (`ReturnScope`) ; une ligne qu'avec `tenantId` ET sa remise. Un identifiant
 * d'une autre agence ou d'un autre périmètre lève la même NotFoundError qu'un
 * identifiant inconnu.
 */

export type Tx = PrismaTransactionClient;

/** Une transaction par ligne (data-model §8.3). */
export const LINE_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

export const notFoundRemittance = () => new NotFoundError(t('Remise introuvable.'));
export const notFoundLine = () => new NotFoundError(t('Ligne de remise introuvable.'));
export const lineJustProcessed = () => new ConflictError(t("Cette ligne vient d'être traitée : rechargez la page."));
const reloadConflict = () => new ConflictError(t("La remise vient d'être modifiée : rechargez la page."));

/**
 * Filtre de périmètre d'une remise. SYNDIC_LOT : la remise porte le périmètre ;
 * le syndicat s'y ajoutera avec la colonne de P4 (la remise de loyers n'en a pas).
 */
export function remittanceScopeWhere(scope: ReturnScope): Prisma.DirectDebitRemittanceWhereInput {
  return { scope: scopeOf(scope) };
}

/**
 * Périmètre en valeur de l'enum Prisma. L'enum ne porte que RENTAL_LEASE jusqu'à la migration de P4, qui
 * ajoute SYNDIC_LOT ; ce transtypage tombe alors de lui-même.
 */
export const scopeOf = (scope: ReturnScope) => scope.scope as 'RENTAL_LEASE';

export const RETURN_REMITTANCE_SELECT = {
  id: true,
  year: true,
  sequence: true,
  status: true,
  collectionDate: true,
  scope: true,
  lineCount: true,
  totalAmount: true,
  creditor: { select: { id: true, treasuryAccountId: true, rejectFeeAmount: true, maxConsecutiveRejects: true } },
  tenant: { select: { name: true } }
} satisfies Prisma.DirectDebitRemittanceSelect;

export type ReturnRemittance = Prisma.DirectDebitRemittanceGetPayload<{ select: typeof RETURN_REMITTANCE_SELECT }>;

/** Jamais `ibanEncrypted` : seuls les 4 derniers caractères servent au masque. */
export const RETURN_LINE_SELECT = {
  id: true,
  tenantId: true,
  remittanceId: true,
  lineNumber: true,
  status: true,
  amount: true,
  mandateId: true,
  leaseId: true,
  installmentId: true,
  debtorClientId: true,
  rentalPaymentId: true,
  mandate: { select: { id: true, year: true, sequence: true, status: true, ibanLast4: true } }
} satisfies Prisma.DirectDebitRemittanceLineSelect;

export type ReturnLine = Prisma.DirectDebitRemittanceLineGetPayload<{ select: typeof RETURN_LINE_SELECT }>;

/**
 * Lit la remise (agence + périmètre), exige qu'elle soit déposée (`EXPORTED` ou
 * `SUBMITTED`) puis la verrouille par une mise à jour conditionnelle sur son
 * statut : un constat concurrent, un dépôt ou une annulation attend, puis échoue
 * en ConflictError si le statut a bougé.
 */
export async function lockReturnRemittance(
  tx: Tx,
  tenantId: string,
  scope: ReturnScope,
  remittanceId: string,
  now: Date
): Promise<ReturnRemittance> {
  const remittance = await tx.directDebitRemittance.findFirst({
    where: { id: remittanceId, tenantId, ...remittanceScopeWhere(scope) },
    select: RETURN_REMITTANCE_SELECT
  });
  if (!remittance) throw notFoundRemittance();
  if (remittance.status !== 'EXPORTED' && remittance.status !== 'SUBMITTED') {
    throw new ConflictError(
      t(
        "Le retour de la banque ne se constate que sur une remise dont le fichier a été produit et qui n'est pas annulée."
      )
    );
  }
  const locked = await tx.directDebitRemittance.updateMany({
    where: { id: remittanceId, tenantId, status: remittance.status },
    data: { updatedAt: now }
  });
  if (locked.count === 0) throw reloadConflict();
  return remittance;
}

export async function loadReturnLine(
  tx: Tx,
  tenantId: string,
  remittanceId: string,
  lineId: string
): Promise<ReturnLine> {
  const line = await tx.directDebitRemittanceLine.findFirst({
    where: { id: lineId, tenantId, remittanceId },
    select: RETURN_LINE_SELECT
  });
  if (!line) throw notFoundLine();
  return line;
}

/** Date du constat : une date civile entre la date de prélèvement et aujourd'hui inclus. */
export function checkReturnDate(value: string, collectionDate: Date, now: Date): Date {
  const parsed = parseIsoDate(value);
  if (!parsed) throw new BadRequestError(t('Date invalide (AAAA-MM-JJ).'));
  if (parsed.getTime() < collectionDate.getTime() || parsed.getTime() > todayUtc(now).getTime()) {
    throw new BadRequestError(
      t("La date doit être comprise entre la date de prélèvement ({{from}}) et aujourd'hui.", {
        from: formatFrenchDate(collectionDate)
      })
    );
  }
  return parsed;
}

/** Date comprise dans [prélèvement, aujourd'hui] (sans lever), pour le rapprochement d'un fichier. */
export function isReturnDateInRange(value: string, collectionDate: Date, now: Date): boolean {
  const parsed = parseIsoDate(value);
  return parsed !== null && parsed.getTime() >= collectionDate.getTime() && parsed.getTime() <= todayUtc(now).getTime();
}

/**
 * Premier constat sur une remise `EXPORTED` : elle passe d'abord à `SUBMITTED`
 * (le fichier est réputé déposé), avec la même trace d'audit que le dépôt manuel.
 */
export async function promoteToSubmitted(
  tx: Tx,
  tenantId: string,
  remittance: ReturnRemittance,
  actorUserId: string | null,
  now: Date
): Promise<void> {
  if (remittance.status !== 'EXPORTED') return;
  const result = await tx.directDebitRemittance.updateMany({
    where: { id: remittance.id, tenantId, status: 'EXPORTED' },
    data: { status: 'SUBMITTED', submittedAt: now, submittedByUserId: actorUserId }
  });
  if (result.count === 0) return;
  await recordAuditEvent(tx, {
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.DIRECT_DEBIT_REMITTANCE_SUBMITTED,
    entityType: 'DirectDebitRemittance',
    entityId: remittance.id,
    payload: {
      reference: remittanceReferenceOf(remittance.year, remittance.sequence),
      lineCount: remittance.lineCount,
      totalAmount: Number(remittance.totalAmount),
      collectionDate: toIsoDate(remittance.collectionDate),
      from: 'EXPORTED',
      to: 'SUBMITTED',
      automatic: true
    }
  });
}

/** Message d'une erreur à renvoyer au client : les erreurs typées seules, jamais un message technique. */
export function publicErrorMessage(error: unknown): string {
  if (error instanceof AppError && error.statusCode < 500) return error.message;
  return t('Erreur inattendue : réessayez.');
}

export const errorNameOf = (error: unknown) => (error instanceof Error ? error.name : 'UnknownError');

/** Nom de fichier assaini : sans chemin ni caractère de contrôle, 200 caractères au plus. */
export function sanitizeFileName(name: string | undefined | null): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (cleaned || 'retour').slice(0, 200);
}
