import type { MobileMoneyOperator, TreasuryAccountKind } from '@prisma/client';
import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest } from '../errors';

/**
 * Comptes de trésorerie de l'agence (lot 10, conformité SYSCOHADA).
 *
 * Chaque encaissement et chaque décaissement dit quel compte il a réellement
 * touché : une caisse (5711x), une banque (5211x), un portefeuille Mobile
 * Money (552x, classe 55 « instruments de monnaie électronique »), les chèques
 * (513) ou les cartes (515) à encaisser en attendant leur remise en banque.
 *
 * Quand une pièce ne précise pas son compte, on prend celui par défaut de la
 * nature qui correspond au moyen de paiement. Si l'agence n'en a configuré
 * aucun, on le crée : une agence qui n'a pas ouvert la page Trésorerie doit
 * pouvoir encaisser un loyer.
 *
 * **Reprise de l'existant.** Une agence dont la caisse 571 ou la banque 521
 * porte déjà des écritures garde ce compte comme compte par défaut : on ne
 * déplace pas une trésorerie en changeant un numéro. Une agence neuve reçoit
 * 5711 et 5211.
 */

export type PaymentMethodLike = 'CASH' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CHECK' | 'CARD' | 'OTHER' | string;

export interface ResolvedTreasury {
  treasuryAccountId: string;
  chartOfAccountId: string;
  accountNumber: string;
  label: string;
  kind: TreasuryAccountKind;
  /** Journal opérationnel des mouvements de ce compte. */
  journal: 'CASH' | 'BANK';
}

const MM_ACCOUNT_BY_OPERATOR: Record<string, { number: string; label: string }> = {
  WAVE: { number: '5521', label: 'Mobile Money — Wave' },
  ORANGE: { number: '5522', label: 'Mobile Money — Orange Money' },
  MTN: { number: '5523', label: 'Mobile Money — MTN MoMo' },
  MOOV: { number: '5524', label: 'Mobile Money — Moov Money' },
  OTHER: { number: '5529', label: 'Mobile Money — autres opérateurs' }
};

/** Comptes créés quand l'agence n'en a configuré aucun de cette nature. */
export const DEFAULT_TREASURY_SPECS: Record<
  Exclude<TreasuryAccountKind, 'MOBILE_MONEY'>,
  { number: string; label: string; legacy?: string }
> = {
  CASH: { number: '5711', label: 'Caisse principale', legacy: '571' },
  BANK: { number: '5211', label: 'Banque principale', legacy: '521' },
  CHECKS_TO_CASH: { number: '513', label: 'Chèques à encaisser' },
  CARDS_TO_CASH: { number: '515', label: 'Cartes de crédit à encaisser' }
};

export function mobileMoneySpec(operator: MobileMoneyOperator | string | null | undefined) {
  return MM_ACCOUNT_BY_OPERATOR[operator ?? 'OTHER'] ?? MM_ACCOUNT_BY_OPERATOR.OTHER;
}

/** Nature de compte par défaut d'un moyen de paiement. */
export function defaultKindForMethod(method: PaymentMethodLike): TreasuryAccountKind {
  switch (method) {
    case 'CASH':
      return 'CASH';
    case 'MOBILE_MONEY':
      return 'MOBILE_MONEY';
    case 'CHECK':
      return 'CHECKS_TO_CASH';
    case 'CARD':
      return 'CARDS_TO_CASH';
    default:
      return 'BANK';
  }
}

/**
 * Natures acceptées pour un moyen de paiement. Un chèque ou une carte peut
 * aller directement en banque quand la remise est faite le jour même.
 */
export function allowedKindsForMethod(method: PaymentMethodLike): TreasuryAccountKind[] {
  switch (method) {
    case 'CASH':
      return ['CASH'];
    case 'BANK_TRANSFER':
      return ['BANK'];
    case 'MOBILE_MONEY':
      return ['MOBILE_MONEY'];
    case 'CHECK':
      return ['CHECKS_TO_CASH', 'BANK'];
    case 'CARD':
      return ['CARDS_TO_CASH', 'BANK'];
    default:
      return ['CASH', 'BANK', 'MOBILE_MONEY', 'CHECKS_TO_CASH', 'CARDS_TO_CASH'];
  }
}

/**
 * Natures de compte qui peuvent PAYER un règlement sortant (fournisseur…).
 *
 * Différent de `allowedKindsForMethod`, qui décrit où ENTRE un encaissement :
 * un chèque reçu attend en « chèques à encaisser », mais un chèque émis sort de
 * la banque, et une carte de même. Un règlement en espèces sort de la caisse,
 * un virement de la banque, un Mobile Money d'un portefeuille. Un mode « autre »
 * ou inconnu accepte tout compte réellement disponible.
 */
export function outflowKindsForMethod(method: PaymentMethodLike): TreasuryAccountKind[] {
  switch (method) {
    case 'CASH':
      return ['CASH'];
    case 'MOBILE_MONEY':
      return ['MOBILE_MONEY'];
    case 'BANK_TRANSFER':
    case 'CHECK':
    case 'CARD':
      return ['BANK'];
    default:
      return ['CASH', 'BANK', 'MOBILE_MONEY'];
  }
}

/** Nature du compte pris par défaut pour un règlement sortant sans compte désigné. */
export function defaultOutflowKindForMethod(method: PaymentMethodLike): TreasuryAccountKind {
  if (method === 'CASH') return 'CASH';
  if (method === 'MOBILE_MONEY') return 'MOBILE_MONEY';
  return 'BANK';
}

export const journalForKind = (kind: TreasuryAccountKind): 'CASH' | 'BANK' => (kind === 'CASH' ? 'CASH' : 'BANK');

type TreasuryRow = {
  id: string;
  kind: TreasuryAccountKind;
  label: string;
  accountNumber: string;
  chartOfAccountId: string;
};

const treasurySelect = { id: true, kind: true, label: true, accountNumber: true, chartOfAccountId: true } as const;

function toResolved(row: TreasuryRow): ResolvedTreasury {
  return {
    treasuryAccountId: row.id,
    chartOfAccountId: row.chartOfAccountId,
    accountNumber: row.accountNumber,
    label: row.label,
    kind: row.kind,
    journal: journalForKind(row.kind)
  };
}

/** Le compte du plan comptable opérationnel de ce numéro, créé s'il manque. */
export async function ensureChartAccountTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  number: string,
  name: string,
  type: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE' = 'ASSET'
): Promise<string> {
  const existing = await tx.chartOfAccount.findFirst({
    where: { tenantId, scope: 'OPERATIONS', accountNumber: number },
    select: { id: true }
  });
  if (existing) return existing.id;
  const created = await tx.chartOfAccount.create({
    data: {
      tenantId,
      syndicateId: null,
      scope: 'OPERATIONS',
      accountNumber: number,
      accountName: name,
      accountClass: Number(number[0]),
      accountType: type
    },
    select: { id: true }
  });
  return created.id;
}

/** Inscrit un compte de trésorerie sur un numéro, en reprenant celui qui existe déjà. */
async function registerTreasuryAccountTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  params: { kind: TreasuryAccountKind; number: string; label: string; mmOperator?: MobileMoneyOperator | null }
): Promise<TreasuryRow> {
  const already = await tx.treasuryAccount.findFirst({
    where: { tenantId, accountNumber: params.number },
    select: treasurySelect
  });
  if (already) return already;

  const chartOfAccountId = await ensureChartAccountTx(tx, tenantId, params.number, params.label, 'ASSET');
  const hasDefault = await tx.treasuryAccount.findFirst({
    where: {
      tenantId,
      kind: params.kind,
      isDefault: true,
      ...(params.kind === 'MOBILE_MONEY' ? { mmOperator: params.mmOperator ?? null } : {})
    },
    select: { id: true }
  });
  return tx.treasuryAccount.create({
    data: {
      tenantId,
      kind: params.kind,
      label: params.label,
      accountNumber: params.number,
      chartOfAccountId,
      mmOperator: params.mmOperator ?? null,
      isDefault: !hasDefault
    },
    select: treasurySelect
  });
}

/** Un compte hérité (571, 521) qui porte déjà des écritures. */
async function legacyAccountWithLinesTx(tx: PrismaTransactionClient, tenantId: string, number: string) {
  const account = await tx.chartOfAccount.findFirst({
    where: { tenantId, scope: 'OPERATIONS', accountNumber: number },
    select: { id: true, accountName: true }
  });
  if (!account) return null;
  const line = await tx.journalEntryLine.findFirst({ where: { accountId: account.id }, select: { id: true } });
  return line ? account : null;
}

/**
 * Le compte par défaut d'une nature (et d'un opérateur, pour le Mobile Money),
 * créé s'il n'existe pas.
 */
export async function ensureDefaultTreasuryAccountTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  kind: TreasuryAccountKind,
  mmOperator?: MobileMoneyOperator | string | null
): Promise<ResolvedTreasury> {
  if (kind === 'MOBILE_MONEY') {
    const operator = (mmOperator ?? null) as MobileMoneyOperator | null;
    const found =
      (operator
        ? await tx.treasuryAccount.findFirst({
            where: { tenantId, kind, isActive: true, mmOperator: operator },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
            select: treasurySelect
          })
        : null) ??
      (await tx.treasuryAccount.findFirst({
        where: { tenantId, kind, isActive: true, isDefault: true, mmOperator: null },
        select: treasurySelect
      })) ??
      (operator
        ? null
        : await tx.treasuryAccount.findFirst({
            where: { tenantId, kind, isActive: true },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
            select: treasurySelect
          }));
    if (found) return toResolved(found);
    const spec = mobileMoneySpec(operator);
    return toResolved(
      await registerTreasuryAccountTx(tx, tenantId, {
        kind,
        number: spec.number,
        label: spec.label,
        mmOperator: operator ?? 'OTHER'
      })
    );
  }

  const found = await tx.treasuryAccount.findFirst({
    where: { tenantId, kind, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: treasurySelect
  });
  if (found) return toResolved(found);

  const spec = DEFAULT_TREASURY_SPECS[kind];
  if (spec.legacy) {
    const legacy = await legacyAccountWithLinesTx(tx, tenantId, spec.legacy);
    if (legacy) {
      return toResolved(
        await registerTreasuryAccountTx(tx, tenantId, { kind, number: spec.legacy, label: legacy.accountName })
      );
    }
  }
  return toResolved(await registerTreasuryAccountTx(tx, tenantId, { kind, number: spec.number, label: spec.label }));
}

/**
 * Le compte de trésorerie d'une pièce : celui qu'elle désigne, vérifié, ou
 * celui par défaut de son moyen de paiement.
 */
export async function resolveTreasuryAccountTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    method: PaymentMethodLike;
    mmOperator?: MobileMoneyOperator | string | null;
    treasuryAccountId?: string | null;
  }
): Promise<ResolvedTreasury> {
  if (params.treasuryAccountId) {
    const row = await tx.treasuryAccount.findFirst({
      where: { id: params.treasuryAccountId, tenantId },
      select: { ...treasurySelect, isActive: true }
    });
    if (!row) throw badRequest('Compte de trésorerie introuvable');
    if (!allowedKindsForMethod(params.method).includes(row.kind)) {
      throw badRequest('Ce compte de trésorerie ne correspond pas au moyen de paiement');
    }
    return toResolved(row);
  }
  return ensureDefaultTreasuryAccountTx(tx, tenantId, defaultKindForMethod(params.method), params.mmOperator);
}

/**
 * Le compte de trésorerie qui PAIE un règlement sortant : celui que la pièce
 * désigne (vérifié : agence, actif, nature compatible avec le mode), sinon le
 * compte par défaut de la nature qui correspond au mode — banque pour un
 * virement ou un chèque, caisse pour des espèces, portefeuille pour un Mobile
 * Money. Jamais la caisse « par défaut de tout » : un virement bancaire ne
 * sort pas de la caisse (BUG-2026-09-29-002).
 */
export async function resolveOutflowTreasuryAccountTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  params: { method: PaymentMethodLike; treasuryAccountId?: string | null }
): Promise<ResolvedTreasury> {
  if (params.treasuryAccountId) {
    const row = await tx.treasuryAccount.findFirst({
      where: { id: params.treasuryAccountId, tenantId },
      select: { ...treasurySelect, isActive: true }
    });
    if (!row) throw badRequest('Compte de trésorerie introuvable');
    if (!row.isActive) throw badRequest('Ce compte de trésorerie est désactivé');
    if (!outflowKindsForMethod(params.method).includes(row.kind)) {
      throw badRequest('Ce compte de trésorerie ne correspond pas au mode de règlement');
    }
    return toResolved(row);
  }
  return ensureDefaultTreasuryAccountTx(tx, tenantId, defaultOutflowKindForMethod(params.method));
}

/**
 * Vérifie qu'un compte désigné par un formulaire est utilisable pour ce moyen
 * de paiement, avant d'enregistrer la pièce. Sans compte désigné : rien à
 * vérifier, le défaut sera pris au moment de l'écriture.
 */
export async function assertTreasuryAccountUsableTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  treasuryAccountId: string | null | undefined,
  method: PaymentMethodLike
): Promise<void> {
  if (!treasuryAccountId) return;
  const row = await tx.treasuryAccount.findFirst({
    where: { id: treasuryAccountId, tenantId },
    select: { kind: true, isActive: true }
  });
  if (!row) throw badRequest('Compte de trésorerie introuvable');
  if (!row.isActive) throw badRequest('Ce compte de trésorerie est désactivé');
  if (!allowedKindsForMethod(method).includes(row.kind)) {
    throw badRequest('Ce compte de trésorerie ne correspond pas au moyen de paiement');
  }
}
