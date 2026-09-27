import type { PrismaTransactionClient } from '../../utils/database';
import { ConflictError } from '../../middleware/error-middleware';
import { unprocessableEntity } from '../errors';
import { isJournalEntryBalanced, roundMoney } from './finance-utils';

/**
 * Socle comptable d'une copropriete pour les factures de prestataires (S6).
 *
 * Toutes les ecritures d'ici sont de portee SYNDICATE : elles vivent dans la
 * comptabilite de LA copropriete (`syndicateId` sur le plan de comptes et le
 * journal), jamais dans la comptabilite OPERATIONS de l'agence
 * (`lib/finance/accounting.ts`, fournisseurs de l'agence).
 *
 * Regles communes avec le chemin operationnel :
 *   - lecture avant ecriture : on lit ce qui existe et on ne cree que ce qui
 *     manque. Rattraper un `P2002` dans une transaction la condamnerait ;
 *   - une ecriture ne se modifie pas : on la contre-passe (`voidedByEntryId`).
 *
 * Choix de comptes (numerotation SYSCOHADA, a valider par un comptable, voir
 * specs/021-syndic-besoins-prospect/plan.md, « Comptabilite de copropriete ») :
 *   401  prestataires (dette constatee a la facture, soldee au paiement) ;
 *   521  banque (sortie de tresorerie au paiement, quel que soit le fonds) ;
 *   624  charges courantes (entretien, reparations, maintenance) ;
 *   6241 travaux sur parties communes (sous-compte du 624).
 */

export type SyndicAccountNumber = '401' | '521' | '624' | '6241';

interface AccountSeed {
  accountNumber: SyndicAccountNumber;
  accountName: string;
  accountClass: number;
  accountType: 'ASSET' | 'LIABILITY' | 'EXPENSE';
  parent?: SyndicAccountNumber;
}

export const SYNDIC_PROVIDER_ACCOUNT_SEEDS: AccountSeed[] = [
  { accountNumber: '401', accountName: 'Fournisseurs et prestataires', accountClass: 4, accountType: 'LIABILITY' },
  { accountNumber: '521', accountName: 'Banque', accountClass: 5, accountType: 'ASSET' },
  {
    accountNumber: '624',
    accountName: 'Entretien, reparations et maintenance',
    accountClass: 6,
    accountType: 'EXPENSE'
  },
  {
    accountNumber: '6241',
    accountName: 'Travaux sur parties communes',
    accountClass: 6,
    accountType: 'EXPENSE',
    parent: '624'
  }
];

/**
 * Pose, si besoin, les comptes dont les factures de prestataires ont besoin,
 * et renvoie l'index numero -> identifiant. Idempotent : au regime de
 * croisiere, une seule lecture.
 */
export async function ensureSyndicProviderAccountsTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  syndicateId: string
): Promise<Map<SyndicAccountNumber, string>> {
  const existing = await tx.chartOfAccount.findMany({
    where: {
      tenantId,
      syndicateId,
      accountNumber: { in: SYNDIC_PROVIDER_ACCOUNT_SEEDS.map(seed => seed.accountNumber) }
    },
    select: { id: true, accountNumber: true }
  });
  const index = new Map<SyndicAccountNumber, string>(
    existing.map(account => [account.accountNumber as SyndicAccountNumber, account.id])
  );

  // L'ordre des graines place le parent (624) avant son sous-compte (6241).
  for (const seed of SYNDIC_PROVIDER_ACCOUNT_SEEDS) {
    if (index.has(seed.accountNumber)) continue;
    const created = await tx.chartOfAccount.create({
      data: {
        tenantId,
        syndicateId,
        scope: 'SYNDICATE',
        accountNumber: seed.accountNumber,
        accountName: seed.accountName,
        accountClass: seed.accountClass,
        accountType: seed.accountType,
        parentAccountId: seed.parent ? (index.get(seed.parent) ?? null) : null
      },
      select: { id: true }
    });
    index.set(seed.accountNumber, created.id);
  }

  return index;
}

const JOURNALS = {
  CHARGES: { code: 'ACH', label: 'Achats et prestataires' },
  BANK: { code: 'BQ', label: 'Banque' }
} as const;

/** Journal de la copropriete pour l'exercice (annee civile de la piece). */
export async function ensureSyndicJournalTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  syndicateId: string,
  journalType: keyof typeof JOURNALS,
  date: Date
): Promise<string> {
  const fiscalYear = date.getUTCFullYear();
  const { code, label } = JOURNALS[journalType];
  const existing = await tx.accountingJournal.findFirst({
    where: { tenantId, syndicateId, code, fiscalYear },
    select: { id: true }
  });
  if (existing) return existing.id;

  const created = await tx.accountingJournal.create({
    data: {
      tenantId,
      syndicateId,
      scope: 'SYNDICATE',
      journalType,
      label: `${label} ${fiscalYear}`,
      code,
      fiscalYear
    },
    select: { id: true }
  });
  return created.id;
}

/**
 * Refuse une ecriture dans un exercice clos. Le module syndic n'a pas de
 * cloture comptable proprement dite : l'exercice est tenu pour clos quand la
 * copropriete a un budget de cette annee au statut CLOSED.
 */
export async function assertFiscalYearOpenTx(tx: PrismaTransactionClient, syndicateId: string, date: Date) {
  const closed = await tx.syndicateBudget.findFirst({
    where: { syndicateId, fiscalYear: date.getUTCFullYear(), status: 'CLOSED' },
    select: { id: true }
  });
  if (closed) {
    throw new ConflictError('Exercice clos : aucune ecriture ne peut y etre passee');
  }
}

export interface SyndicEntryLine {
  accountId: string;
  debit: number;
  credit: number;
  label: string;
}

export interface PostSyndicEntryParams {
  tenantId: string;
  journalId: string;
  entryDate: Date;
  reference: string;
  description: string;
  sourceType: 'PROVIDER_INVOICE' | 'PROVIDER_PAYMENT';
  sourceId: string;
  documentType: string;
  lines: SyndicEntryLine[];
}

/** Arrondit chaque ligne puis verifie l'equilibre sur les valeurs stockees. */
export function roundEntryLines(lines: SyndicEntryLine[]): SyndicEntryLine[] {
  const rounded = lines.map(line => ({
    ...line,
    debit: roundMoney(line.debit),
    credit: roundMoney(line.credit)
  }));
  if (rounded.length < 2 || !isJournalEntryBalanced(rounded)) {
    throw unprocessableEntity('Ecriture non equilibree: total debit doit etre egal au total credit');
  }
  return rounded;
}

/** Ecrit une ecriture equilibree et renvoie son identifiant. */
export async function postSyndicEntryTx(tx: PrismaTransactionClient, params: PostSyndicEntryParams): Promise<string> {
  const lines = roundEntryLines(params.lines);
  const entry = await tx.journalEntry.create({
    data: {
      tenantId: params.tenantId,
      journalId: params.journalId,
      entryDate: params.entryDate,
      reference: params.reference,
      description: params.description,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      documentType: params.documentType,
      documentId: params.sourceId,
      // Ecriture nee d'une piece : verrouillee d'emblee, comme celles de
      // lib/finance/accounting.ts. Elle se corrige par contre-passation.
      isLocked: true
    },
    select: { id: true }
  });
  await tx.journalEntryLine.createMany({
    data: lines.map(line => ({
      entryId: entry.id,
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
      label: line.label
    }))
  });
  return entry.id;
}

/**
 * Contre-passe une ecriture : nouvelle ecriture aux sens inverses, a la date
 * donnee, et `voidedByEntryId` pose sur l'originale. Renvoie l'identifiant de
 * la contre-ecriture, ou `null` si l'ecriture n'existe plus.
 */
export async function reverseSyndicEntryTx(
  tx: PrismaTransactionClient,
  params: { tenantId: string; entryId: string; date: Date; description: string; documentType: string }
): Promise<string | null> {
  const original = await tx.journalEntry.findFirst({
    where: { id: params.entryId, tenantId: params.tenantId },
    select: { id: true, journalId: true, reference: true, sourceType: true, sourceId: true }
  });
  if (!original) return null;

  const lines = await tx.journalEntryLine.findMany({
    where: { entryId: original.id },
    select: { accountId: true, debit: true, credit: true, label: true }
  });

  const reversalId = await postSyndicEntryTx(tx, {
    tenantId: params.tenantId,
    journalId: original.journalId,
    entryDate: params.date,
    reference: `ANN-${original.reference}`.slice(0, 190),
    description: params.description,
    sourceType: original.sourceType as PostSyndicEntryParams['sourceType'],
    sourceId: original.sourceId ?? original.id,
    documentType: params.documentType,
    lines: lines.map(line => ({
      accountId: line.accountId,
      debit: Number(line.credit),
      credit: Number(line.debit),
      label: `Annulation - ${line.label}`
    }))
  });

  await tx.journalEntry.update({
    where: { id: original.id, tenantId: params.tenantId },
    data: { voidedByEntryId: reversalId }
  });
  return reversalId;
}
