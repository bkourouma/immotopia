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
import { AppError, BadRequestError, ErrorCode, NotFoundError } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';
import { roundMoney } from '../finance-utils';
import { formatIsoDay } from '../period';
import { assertSyndicateOfTenant } from '../charge-allocation';
import {
  assertFiscalYearOpenTx,
  ensureSyndicAccountsTx,
  ensureSyndicJournalTx,
  isReceivingAccountNumber,
  postSyndicEntryTx,
  type ReceivingAccountNumber
} from '../provider-invoice-accounting';

export const GATEWAY_PAYOUT_DOCUMENT_TYPE = 'SYNDIC_GATEWAY_PAYOUT';
export const GATEWAY_PAYOUT_MAX_AMOUNT = 9_999_999_999.99;
const REFERENCE_MAX = 120;
const NOTE_MAX = 250;
const ENTRY_REFERENCE_PREFIX = 'REV-';
const NOTE_SEPARATOR = ' | ';

/** Compte de collecte PaySecureHub : celui des reversements du paiement en ligne (spec 042). */
export const GATEWAY_COLLECTION_ACCOUNT = '5525';

/** Compte dont on reverse : le 5525 ou le sous-compte 5521x d'un numéro de réception de la copropriété (spec 047, R23). */
export type PayoutAccountNumber = typeof GATEWAY_COLLECTION_ACCOUNT | ReceivingAccountNumber;

type Client = PrismaTransactionClient | typeof prisma;

export interface SyndicGatewayPayout {
  entryId: string;
  reference: string;
  date: string;
  amount: number;
  note: string | null;
  /** Compte reversé : 5525 ou un sous-compte 5521x. */
  treasuryAccountNumber: string;
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
  /** Compte à reverser : 5525 par défaut, ou le sous-compte d'un numéro de réception de CETTE copropriété. */
  treasuryAccountNumber?: string | null;
}

export interface RecordGatewayPayoutResult {
  entryId: string;
  reference: string;
  amount: number;
  date: string;
  /** Compte reverse. */
  treasuryAccountNumber: string;
  /** Solde du compte reverse (5525 ou 5521x) apres l'ecriture. */
  collectionBalanceAfter: number;
}

/** Reference normalisee : espaces rognes, majuscules. */
export function normalizePayoutReference(reference: string): string {
  return reference.trim().toUpperCase();
}

const entryReferenceOf = (normalizedReference: string) => `${ENTRY_REFERENCE_PREFIX}${normalizedReference}`;

async function findCollectionAccountId(
  client: Client,
  tenantId: string,
  syndicateId: string,
  accountNumber: string = GATEWAY_COLLECTION_ACCOUNT
): Promise<string | null> {
  const account = await client.chartOfAccount.findFirst({
    where: { tenantId, syndicateId, accountNumber },
    select: { id: true }
  });
  return account?.id ?? null;
}

/**
 * Compte reversable : le 5525, ou le sous-compte 5521x d'un numéro de réception de CETTE copropriété
 * (vérifié en base, agence et copropriété comprises). Tout autre compte répond comme un compte inexistant.
 */
async function resolvePayoutAccount(
  client: Client,
  tenantId: string,
  syndicateId: string,
  requested: string | null | undefined
): Promise<PayoutAccountNumber> {
  const accountNumber = (requested ?? '').trim() || GATEWAY_COLLECTION_ACCOUNT;
  if (accountNumber === GATEWAY_COLLECTION_ACCOUNT) return GATEWAY_COLLECTION_ACCOUNT;
  if (isReceivingAccountNumber(accountNumber)) {
    const owned = await client.syndicReceivingNumber.findFirst({
      where: { tenantId, syndicateId, treasuryAccountNumber: accountNumber },
      select: { id: true }
    });
    if (owned) return accountNumber;
  }
  throw new NotFoundError(t('Compte de trésorerie introuvable pour cette copropriété.'));
}

async function syndicJournalIds(client: Client, tenantId: string, syndicateId: string): Promise<string[]> {
  const journals = await client.accountingJournal.findMany({
    where: { tenantId, syndicateId },
    select: { id: true }
  });
  return journals.map(journal => journal.id);
}

async function collectionBalance(
  client: Client,
  tenantId: string,
  syndicateId: string,
  accountNumber: string = GATEWAY_COLLECTION_ACCOUNT
): Promise<number> {
  const accountId = await findCollectionAccountId(client, tenantId, syndicateId, accountNumber);
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
export async function getCollectionBalance(
  client: Client,
  tenantId: string,
  syndicateId: string,
  accountNumber?: string | null
): Promise<number> {
  await assertSyndicateOfTenant(client, tenantId, syndicateId);
  const account = await resolvePayoutAccount(client, tenantId, syndicateId, accountNumber);
  return collectionBalance(client, tenantId, syndicateId, account);
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

  // Comptes reversables de la copropriété : le 5525 et les sous-comptes 5521x (spec 047, R23).
  const accounts = (
    await prisma.chartOfAccount.findMany({
      where: { tenantId, syndicateId },
      select: { id: true, accountNumber: true }
    })
  ).filter(
    account => account.accountNumber === GATEWAY_COLLECTION_ACCOUNT || isReceivingAccountNumber(account.accountNumber)
  );
  const numberOfAccount = new Map(accounts.map(account => [account.id, account.accountNumber]));
  const lines = accounts.length
    ? await prisma.journalEntryLine.findMany({
        where: {
          accountId: { in: accounts.map(account => account.id) },
          entryId: { in: entries.map(entry => entry.id) }
        },
        select: { entryId: true, accountId: true, credit: true }
      })
    : [];
  const amountByEntry = new Map<string, number>();
  const accountByEntry = new Map<string, string>();
  for (const line of lines) {
    amountByEntry.set(line.entryId, roundMoney((amountByEntry.get(line.entryId) ?? 0) + Number(line.credit)));
    accountByEntry.set(line.entryId, numberOfAccount.get(line.accountId) ?? GATEWAY_COLLECTION_ACCOUNT);
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
        treasuryAccountNumber: accountByEntry.get(entry.id) ?? GATEWAY_COLLECTION_ACCOUNT,
        createdAt: entry.createdAt.toISOString()
      };
    })
  };
}

/**
 * Enregistre un reversement (debit 521 / credit 5525, ou credit du sous-compte 5521x d'un numero de reception).
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
    const accountNumber = await resolvePayoutAccount(
      tx,
      input.tenantId,
      input.syndicateId,
      input.treasuryAccountNumber
    );
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

    const balance = await collectionBalance(tx, input.tenantId, input.syndicateId, accountNumber);
    if (amount > balance) {
      throw new AppError(
        accountNumber === GATEWAY_COLLECTION_ACCOUNT
          ? t('Le reversement dépasse le solde encaissé non reversé du compte PaySecureHub.')
          : t('Le reversement dépasse le solde encaissé non reversé de ce numéro de réception.'),
        400,
        ErrorCode.PAYOUT_EXCEEDS_COLLECTED
      );
    }

    const accounts = await ensureSyndicAccountsTx(tx, input.tenantId, input.syndicateId, ['521', '5525']);
    // Le 5525 est semé à la demande ; un sous-compte 5521x existe déjà (créé avec son numéro de réception).
    const sourceAccountId =
      accountNumber === GATEWAY_COLLECTION_ACCOUNT
        ? accounts.get('5525')!
        : await findCollectionAccountId(tx, input.tenantId, input.syndicateId, accountNumber);
    if (!sourceAccountId) throw new NotFoundError(t('Compte de trésorerie introuvable pour cette copropriété.'));
    const journalId = await ensureSyndicJournalTx(tx, input.tenantId, input.syndicateId, 'BANK', input.date);
    const label =
      accountNumber === GATEWAY_COLLECTION_ACCOUNT ? t('Reversement PaySecureHub') : t('Reversement mobile money');
    const description = `${label} : ${reference}${note ? `${NOTE_SEPARATOR}${note}` : ''}`;
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
        { accountId: sourceAccountId, debit: 0, credit: amount, label: description }
      ]
    });

    return {
      entryId,
      reference,
      amount,
      date: formatIsoDay(input.date) as string,
      treasuryAccountNumber: accountNumber,
      collectionBalanceAfter: roundMoney(balance - amount)
    };
  });
}
