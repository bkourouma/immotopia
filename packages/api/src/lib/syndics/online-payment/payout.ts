/**
 * Reversements du compte de collecte PaySecureHub (spec 042, contrats 1.8 a 1.10).
 *
 * Le paiement mobile encaisse sur le compte 5525 de la copropriete (voir
 * `charge-collection-accounting.ts`). Quand le fournisseur vire l'argent a la
 * banque de la copropriete, le gestionnaire enregistre un reversement :
 *
 *   debit  521 Banque ;
 *   credit 5525 PaySecureHub.
 *
 * Ce n'est qu'un enregistrement : aucun virement n'est declenche. Toutes les
 * lectures et ecritures sont bornees a `tenantId` ET `syndicateId`.
 *
 * Reference unique par copropriete : normalisee en majuscules, elle est portee
 * par la reference de l'ecriture (`REV-<REFERENCE>`) ; le controle se fait sous
 * un verrou consultatif de la copropriete, ce qui ecarte aussi deux reversements
 * concurrents qui depasseraient ensemble le solde du 5525. Un reversement annule
 * (ecriture contre-passee) libere sa reference.
 */

import { randomUUID } from 'crypto';
import { prisma, type PrismaTransactionClient } from '../../../utils/database';
import { AppError, BadRequestError, ErrorCode } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';
import { roundMoney } from '../finance-utils';
import { formatIsoDay } from '../period';
import { assertSyndicateOfTenant } from '../charge-allocation';
import {
  assertFiscalYearOpenTx,
  ensureSyndicAccountsTx,
  ensureSyndicJournalTx,
  postSyndicEntryTx
} from '../provider-invoice-accounting';

export const GATEWAY_PAYOUT_DOCUMENT_TYPE = 'SYNDIC_GATEWAY_PAYOUT';
export const GATEWAY_PAYOUT_MAX_AMOUNT = 9_999_999_999.99;
const REFERENCE_MAX = 120;
const NOTE_MAX = 250;
const ENTRY_REFERENCE_PREFIX = 'REV-';
const NOTE_SEPARATOR = ' | ';

type Client = PrismaTransactionClient | typeof prisma;

export interface SyndicGatewayPayout {
  entryId: string;
  reference: string;
  date: string;
  amount: number;
  note: string | null;
  createdAt: string;
}

export type SyndicGatewayPayoutsResult = { items: SyndicGatewayPayout[] };

export interface RecordGatewayPayoutInput {
  tenantId: string;
  syndicateId: string;
  amount: number;
  /** Jour du reversement (minuit UTC). Le controle « pas dans le futur » est fait par la route. */
  date: Date;
  reference: string;
  note?: string | null;
  actorUserId?: string | null;
}

export interface RecordGatewayPayoutResult {
  entryId: string;
  reference: string;
  amount: number;
  date: string;
  /** Solde du 5525 apres l'ecriture. */
  collectionBalanceAfter: number;
}

/** Reference normalisee : espaces rognes, majuscules. */
export function normalizePayoutReference(reference: string): string {
  return reference.trim().toUpperCase();
}

const entryReferenceOf = (normalizedReference: string) => `${ENTRY_REFERENCE_PREFIX}${normalizedReference}`;

async function findCollectionAccountId(client: Client, tenantId: string, syndicateId: string): Promise<string | null> {
  const account = await client.chartOfAccount.findFirst({
    where: { tenantId, syndicateId, accountNumber: '5525' },
    select: { id: true }
  });
  return account?.id ?? null;
}

async function syndicJournalIds(client: Client, tenantId: string, syndicateId: string): Promise<string[]> {
  const journals = await client.accountingJournal.findMany({
    where: { tenantId, syndicateId },
    select: { id: true }
  });
  return journals.map(journal => journal.id);
}

async function collectionBalance(client: Client, tenantId: string, syndicateId: string): Promise<number> {
  const accountId = await findCollectionAccountId(client, tenantId, syndicateId);
  if (!accountId) return 0;
  const totals = await client.journalEntryLine.aggregate({
    where: { accountId },
    _sum: { debit: true, credit: true }
  });
  return roundMoney(Number(totals._sum.debit ?? 0) - Number(totals._sum.credit ?? 0));
}

/**
 * Solde debiteur comptable du 5525 de la copropriete (0 si le compte n'existe
 * pas : rien n'est cree). Les contre-passations y sont comprises.
 */
export async function getCollectionBalance(client: Client, tenantId: string, syndicateId: string): Promise<number> {
  await assertSyndicateOfTenant(client, tenantId, syndicateId);
  return collectionBalance(client, tenantId, syndicateId);
}

/** Reversements non annules de la copropriete, du plus recent au plus ancien. */
export async function listGatewayPayouts(
  tenantId: string,
  syndicateId: string,
  options: { limit?: number } = {}
): Promise<SyndicGatewayPayoutsResult> {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50) || 50, 1), 200);

  const journalIds = await syndicJournalIds(prisma, tenantId, syndicateId);
  if (journalIds.length === 0) return { items: [] };
  const entries = await prisma.journalEntry.findMany({
    where: {
      tenantId,
      journalId: { in: journalIds },
      documentType: GATEWAY_PAYOUT_DOCUMENT_TYPE,
      voidedByEntryId: null
    },
    select: { id: true, reference: true, description: true, entryDate: true, createdAt: true },
    orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    take: limit
  });
  if (entries.length === 0) return { items: [] };

  const accountId = await findCollectionAccountId(prisma, tenantId, syndicateId);
  const lines = accountId
    ? await prisma.journalEntryLine.findMany({
        where: { accountId, entryId: { in: entries.map(entry => entry.id) } },
        select: { entryId: true, credit: true }
      })
    : [];
  const amountByEntry = new Map<string, number>();
  for (const line of lines) {
    amountByEntry.set(line.entryId, roundMoney((amountByEntry.get(line.entryId) ?? 0) + Number(line.credit)));
  }

  return {
    items: entries.map(entry => {
      const reference = entry.reference.startsWith(ENTRY_REFERENCE_PREFIX)
        ? entry.reference.slice(ENTRY_REFERENCE_PREFIX.length)
        : entry.reference;
      const marker = `${reference}${NOTE_SEPARATOR}`;
      const at = entry.description.indexOf(marker);
      const note = at >= 0 ? entry.description.slice(at + marker.length).trim() : '';
      return {
        entryId: entry.id,
        reference,
        date: formatIsoDay(entry.entryDate) as string,
        amount: amountByEntry.get(entry.id) ?? 0,
        note: note || null,
        createdAt: entry.createdAt.toISOString()
      };
    })
  };
}

/**
 * Enregistre un reversement (debit 521 / credit 5525).
 *
 * Erreurs : `NotFoundError` (copropriete d'une autre agence ou inconnue),
 * `BadRequestError` (montant, reference ou note invalides),
 * `AppError` 409 `PAYOUT_DUPLICATE`, `AppError` 400 `PAYOUT_EXCEEDS_COLLECTED`,
 * `ConflictError` 409 de `assertFiscalYearOpenTx` (exercice clos).
 */
export async function recordGatewayPayout(input: RecordGatewayPayoutInput): Promise<RecordGatewayPayoutResult> {
  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > GATEWAY_PAYOUT_MAX_AMOUNT) {
    throw new BadRequestError(t('Le montant du reversement doit être positif.'));
  }
  const reference = normalizePayoutReference(input.reference ?? '');
  if (reference.length < 1 || reference.length > REFERENCE_MAX) {
    throw new BadRequestError(t('La référence du reversement est obligatoire (120 caractères au plus).'));
  }
  const note = (input.note ?? '').trim();
  if (note.length > NOTE_MAX) {
    throw new BadRequestError(t('La note du reversement est limitée à 250 caractères.'));
  }

  return prisma.$transaction(async tx => {
    await assertSyndicateOfTenant(tx, input.tenantId, input.syndicateId);
    // Verrou de la copropriete : doublon de reference et plafond du solde.
    const lockKey = `syndic-gateway-payout:${input.syndicateId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const journalIds = await syndicJournalIds(tx, input.tenantId, input.syndicateId);
    const duplicate = journalIds.length
      ? await tx.journalEntry.findFirst({
          where: {
            tenantId: input.tenantId,
            journalId: { in: journalIds },
            documentType: GATEWAY_PAYOUT_DOCUMENT_TYPE,
            reference: entryReferenceOf(reference),
            voidedByEntryId: null
          },
          select: { id: true }
        })
      : null;
    if (duplicate) {
      throw new AppError(
        t('Un reversement porte déjà cette référence dans cette copropriété.'),
        409,
        ErrorCode.PAYOUT_DUPLICATE
      );
    }

    await assertFiscalYearOpenTx(tx, input.syndicateId, input.date);

    const balance = await collectionBalance(tx, input.tenantId, input.syndicateId);
    if (amount > balance) {
      throw new AppError(
        t('Le reversement dépasse le solde encaissé non reversé du compte PaySecureHub.'),
        400,
        ErrorCode.PAYOUT_EXCEEDS_COLLECTED
      );
    }

    const accounts = await ensureSyndicAccountsTx(tx, input.tenantId, input.syndicateId, ['521', '5525']);
    const journalId = await ensureSyndicJournalTx(tx, input.tenantId, input.syndicateId, 'BANK', input.date);
    const description = `${t('Reversement PaySecureHub')} : ${reference}${note ? `${NOTE_SEPARATOR}${note}` : ''}`;
    const entryId = await postSyndicEntryTx(tx, {
      tenantId: input.tenantId,
      journalId,
      entryDate: input.date,
      reference: entryReferenceOf(reference),
      description,
      sourceType: 'MANUAL',
      sourceId: randomUUID(),
      documentType: GATEWAY_PAYOUT_DOCUMENT_TYPE,
      lines: [
        { accountId: accounts.get('521')!, debit: amount, credit: 0, label: description },
        { accountId: accounts.get('5525')!, debit: 0, credit: amount, label: description }
      ]
    });

    return {
      entryId,
      reference,
      amount,
      date: formatIsoDay(input.date) as string,
      collectionBalanceAfter: roundMoney(balance - amount)
    };
  });
}
