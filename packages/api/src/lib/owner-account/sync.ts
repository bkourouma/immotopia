import { Prisma } from '@prisma/client';
import type { PrismaTransactionClient } from '../../utils/database';
import { prisma } from '../../utils/database';
import { notFound } from '../errors';
import { postDocumentEntryTx } from '../finance/accounting';
import { appendThirdPartyMovementTx } from '../finance/ledger';
import { roundMoney, roundMoneyXof } from '../finance/money';
import type { JournalLineInput } from '../finance/types-lot2';
import { materializeManagementFees } from '../rental-fees/materialize';
import { AgencyFinanceSettingsDto, getAgencyFinanceSettings } from '../settings/finance-settings';
import { resolveTreasuryAccountTx, ResolvedTreasury } from '../treasury/accounts';
import { ensureRentalAccountsTx, journalResolver, RentalAccounts } from './accounts';
import { baseSourceId, Share, shareLabel, sharedSourceId, splitAmount } from '../ownership/split';

/**
 * Compte courant d'un propriétaire : synchronisation avec ses sources.
 *
 * Le compte n'est pas saisi, il se DÉDUIT de pièces qui existent déjà :
 *
 * | Source                          | Mouvement                | Écriture                                          |
 * | ------------------------------- | ------------------------ | ------------------------------------------------- |
 * | affectation d'un règlement      | RENT_COLLECTED, crédit   | trésorerie réelle (ou 4731 à affecter) / 4731     |
 * | honoraires figés (lot 2)        | MANAGEMENT_FEE, débit    | 4731 / 70611 (+ pénalités agence si paramétré)    |
 * | TVA de ces honoraires           | MANAGEMENT_FEE_VAT       | (même écriture) / 4432                            |
 * | dépense d'un bien               | EXPENSE, débit           | 4731 / trésorerie réelle, ou 401 si l'agence doit |
 * | retenue à la source (lot 10)    | WITHHOLDING_TAX, débit   | 4731 / 4478                                       |
 * | dépôt de garantie conservé      | DEPOSIT_RETAINED, crédit | 4731 dépôt / 4731 compte courant                  |
 * | reversement (`service.ts`)      | PAYOUT, débit            | 4731 / trésorerie réelle                          |
 *
 * **Lot 10, conformité SYSCOHADA.** Chaque ligne du compte des mandants porte
 * son propriétaire (`thirdPartyAccountId`) et la nature des fonds
 * (`fundsNature` : compte courant, dépôt de garantie, à affecter). Le grand
 * livre auxiliaire du 4731 se lit donc directement dans les écritures.
 *
 * Deux flux ne passent pas par le compte courant et sont écrits à part, sur la
 * même synchronisation :
 *
 * - les **dépôts de garantie** encaissés et remboursés, qui restent des fonds
 *   du mandant sans jamais lui être reversés tant que le bail court ;
 * - les **encaissements non affectés**, comptabilisés le jour de leur
 *   réception comme fonds « à affecter », puis reclassés vers le compte
 *   courant quand ils sont affectés — sans toucher l'écriture initiale.
 *
 * Synchroniser, c'est inscrire ce qui manque et contre-passer ce qui a
 * disparu à la source (un règlement annulé retire son affectation, et avec
 * elle ses honoraires). Rien n'est jamais modifié ni supprimé : un mouvement
 * et son écriture, une fois passés, ne bougent plus ; une disparition
 * s'inscrit comme un mouvement VOID et une écriture de contre-passation.
 *
 * **Indivision.** L'écriture d'une pièce est passée une fois, avec une ligne
 * du 4731 par indivisaire selon les quotes-parts du jour. Si les quotes-parts
 * changent ensuite, le compte courant de chacun se réinscrit (générations
 * `:r<n>`) et une écriture de reclassement entre auxiliaires aligne le 4731
 * sur lui, en passant par le 4731 « non réparti ». La somme des auxiliaires
 * reste égale au solde du 4731.
 *
 * Idempotent : chaque mouvement est unique par (origine, pièce, nature) et
 * chaque écriture par (nature, pièce). Deux synchronisations successives ne
 * font rien de plus que la première.
 */

/** Origine d'un mouvement : une par nature, pour que chaque contre-passation soit unique. */
export const OWNER_SOURCE = {
  RENT: 'OWNER_ALLOCATION',
  FEE: 'OWNER_FEE',
  FEE_VAT: 'OWNER_FEE_VAT',
  EXPENSE: 'OWNER_EXPENSE',
  PAYOUT: 'OWNER_PAYOUT',
  WITHHOLDING: 'OWNER_WITHHOLDING',
  DEPOSIT_RETAINED: 'OWNER_DEPOSIT_RETAINED'
} as const;

type PieceDocumentType =
  | 'OWNER_RENT_COLLECTED'
  | 'OWNER_MANAGEMENT_FEE'
  | 'OWNER_EXPENSE'
  | 'OWNER_PAYOUT'
  | 'OWNER_WITHHOLDING'
  | 'OWNER_DEPOSIT';

/** Nature de la pièce comptable d'une origine. La TVA partage l'écriture des honoraires. */
const DOCUMENT_BY_SOURCE: Record<string, PieceDocumentType> = {
  [OWNER_SOURCE.RENT]: 'OWNER_RENT_COLLECTED',
  [OWNER_SOURCE.FEE]: 'OWNER_MANAGEMENT_FEE',
  [OWNER_SOURCE.FEE_VAT]: 'OWNER_MANAGEMENT_FEE',
  [OWNER_SOURCE.EXPENSE]: 'OWNER_EXPENSE',
  [OWNER_SOURCE.PAYOUT]: 'OWNER_PAYOUT',
  [OWNER_SOURCE.WITHHOLDING]: 'OWNER_WITHHOLDING',
  [OWNER_SOURCE.DEPOSIT_RETAINED]: 'OWNER_DEPOSIT'
};

/** Pièces dont le compte courant de chaque indivisaire est rapproché de ses lignes au 4731. */
const RECONCILED_DOCUMENTS = new Set<string>([
  'OWNER_RENT_COLLECTED',
  'OWNER_MANAGEMENT_FEE',
  'OWNER_EXPENSE',
  'OWNER_WITHHOLDING',
  'OWNER_DEPOSIT'
]);

export async function getOrCreateOwnerAccountTx(tx: PrismaTransactionClient, tenantId: string, ownerClientId: string) {
  const existing = await tx.thirdPartyAccount.findUnique({
    where: { tenantId_kind_tenantClientId: { tenantId, kind: 'OWNER', tenantClientId: ownerClientId } },
    select: { id: true, balance: true }
  });
  if (existing) return existing;

  const owner = await tx.tenantClient.findFirst({
    where: { id: ownerClientId, tenantId },
    select: { user: { select: { fullName: true, email: true } } }
  });
  if (!owner) throw notFound('Proprietaire introuvable');

  return tx.thirdPartyAccount.create({
    data: {
      tenantId,
      kind: 'OWNER',
      tenantClientId: ownerClientId,
      label: owner.user.fullName || owner.user.email || 'Propriétaire',
      balance: 0,
      currency: 'XOF'
    },
    select: { id: true, balance: true }
  });
}

/** Contre-passe l'écriture d'une pièce, si elle en a une et qu'elle ne l'est pas déjà. */
export async function reverseDocumentEntryTx(
  tx: PrismaTransactionClient,
  params: {
    tenantId: string;
    documentType: string;
    documentId: string;
    entryDate: Date;
    description: string;
    journalFor: ReturnType<typeof journalResolver>;
  }
) {
  const original = await tx.journalEntry.findFirst({
    where: { tenantId: params.tenantId, documentType: params.documentType, documentId: params.documentId },
    select: {
      id: true,
      reference: true,
      voidedByEntryId: true,
      lines: {
        select: { accountId: true, debit: true, credit: true, label: true, thirdPartyAccountId: true, fundsNature: true }
      }
    }
  });
  if (!original || original.voidedByEntryId) return;

  const journalId = await params.journalFor(params.entryDate, 'GENERAL');
  const { entryId } = await postDocumentEntryTx(tx, {
    tenantId: params.tenantId,
    journalId,
    entryDate: params.entryDate,
    reference: `ANN-${original.reference}`,
    description: params.description,
    documentType: 'OWNER_VOID',
    documentId: `${params.documentType}:${params.documentId}`,
    lines: original.lines.map(line => ({
      accountId: line.accountId,
      debit: Number(line.credit ?? 0),
      credit: Number(line.debit ?? 0),
      label: `Annulation — ${line.label ?? ''}`.trim(),
      thirdPartyAccountId: line.thirdPartyAccountId,
      fundsNature: line.fundsNature
    }))
  });
  await tx.journalEntry.update({ where: { id: original.id }, data: { voidedByEntryId: entryId } });
}

type MovementType =
  | 'RENT_COLLECTED'
  | 'MANAGEMENT_FEE'
  | 'MANAGEMENT_FEE_VAT'
  | 'EXPENSE'
  | 'WITHHOLDING_TAX'
  | 'DEPOSIT_RETAINED';

interface PaymentRef {
  id: string;
  date: Date;
  method: string;
  mmOperator: string | null;
  treasuryAccountId: string | null;
}

interface PendingMovement {
  sourceType: string;
  /** Identifiant du mouvement : la pièce, ou `<pièce>:<propriétaire>:<part>` pour un bien en indivision. */
  sourceId: string;
  /** La pièce d'origine : porte l'écriture comptable, une seule fois pour tous les indivisaires. */
  baseId: string;
  type: MovementType;
  /** Montants de CE propriétaire : sa quote-part, ou le tout. */
  debit: number;
  credit: number;
  date: Date;
  label: string;
  leaseId: string | null;
  /** Ce que l'écriture de la pièce entière doit savoir, pour la passer une seule fois. */
  entry?: PieceEntry;
}

type PieceEntry =
  | {
      kind: 'RENT';
      payment: PaymentRef;
      propertyId: string;
      /** Montant affecté à l'échéance. */
      amount: number;
      /** Part des pénalités qui revient à l'agence, déduite de ce qui va au propriétaire. */
      agencyPenalty: number;
    }
  | { kind: 'FEE'; propertyId: string; feeAmount: number; vatAmount: number }
  | {
      kind: 'EXPENSE';
      propertyId: string;
      amount: number;
      method: string;
      treasuryAccountId: string | null;
      agencyIsBuyer: boolean;
      supplierName: string | null;
    }
  | { kind: 'WITHHOLDING'; amount: number };

/** Identité d'un mouvement, sans son éventuel suffixe de génération `:r<n>`. */
const identityOf = (sourceId: string) => sourceId.replace(/:r\d+$/, '');

const monthKey = (date: Date) => `${date.getUTCFullYear()}-${date.getUTCMonth()}`;

/** Propriétaires de l'agence : clients de type propriétaire, désignés sur un bail, ou indivisaires. */
export async function listAgencyOwners(tenantId: string) {
  return prisma.tenantClient.findMany({
    where: {
      tenantId,
      OR: [{ clientType: 'OWNER' }, { ownerLeases: { some: {} } }, { ownershipShares: { some: {} } }]
    },
    select: { id: true, userId: true, user: { select: { fullName: true, email: true } } },
    orderBy: { user: { fullName: 'asc' } }
  });
}

/**
 * La pièce d'un mouvement existe-t-elle encore, pour qui que ce soit ?
 *
 * Distinct de « figure-t-elle encore dans CE compte » : quand les quotes-parts
 * d'un bien changent, le mouvement d'un indivisaire se contre-passe, mais la
 * pièce, elle, existe toujours et son écriture comptable ne bouge pas.
 */
async function sourceStillExistsTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  sourceType: string,
  baseId: string,
  excludedExpenseIds: Set<string>
) {
  if (sourceType === OWNER_SOURCE.RENT) {
    return Boolean(
      await tx.rentalPaymentAllocation.findFirst({
        where: { id: baseId, tenant_id: tenantId, payment: { status: 'SUCCESS' } },
        select: { id: true }
      })
    );
  }
  if (sourceType === OWNER_SOURCE.FEE || sourceType === OWNER_SOURCE.FEE_VAT) {
    return Boolean(await tx.managementFee.findFirst({ where: { id: baseId, tenantId }, select: { id: true } }));
  }
  if (sourceType === OWNER_SOURCE.EXPENSE) {
    if (excludedExpenseIds.has(baseId)) return false;
    return Boolean(await tx.propertyExpense.findFirst({ where: { id: baseId, tenantId }, select: { id: true } }));
  }
  if (sourceType === OWNER_SOURCE.WITHHOLDING) {
    return Boolean(await tx.rentWithholding.findFirst({ where: { id: baseId, tenantId }, select: { id: true } }));
  }
  if (sourceType === OWNER_SOURCE.DEPOSIT_RETAINED) {
    return Boolean(
      await tx.rentalDepositMovement.findFirst({ where: { id: baseId, tenant_id: tenantId }, select: { id: true } })
    );
  }
  return true;
}

/** Part des pénalités dans un montant affecté à une échéance, au prorata. */
function penaltyPart(
  amount: number,
  installment: { amount_rent: unknown; amount_service: unknown; amount_other_fees: unknown; penalty_amount: unknown }
) {
  const penalty = Number(installment.penalty_amount ?? 0);
  if (penalty <= 0) return 0;
  const total =
    Number(installment.amount_rent) +
    Number(installment.amount_service ?? 0) +
    Number(installment.amount_other_fees ?? 0) +
    penalty;
  return total > 0 ? roundMoneyXof((amount * penalty) / total) : 0;
}

/** Part de loyer nu dans un montant affecté à une échéance, au prorata. */
function rentPart(
  amount: number,
  installment: { amount_rent: unknown; amount_service: unknown; amount_other_fees: unknown; penalty_amount: unknown }
) {
  const rent = Number(installment.amount_rent);
  const total =
    rent +
    Number(installment.amount_service ?? 0) +
    Number(installment.amount_other_fees ?? 0) +
    Number(installment.penalty_amount ?? 0);
  return total > 0 ? roundMoney((amount * rent) / total) : 0;
}

/**
 * Retenues à la source sur les loyers de ce propriétaire encaissés depuis la
 * date de début, figées à leur création comme les honoraires : statut fiscal,
 * taux et assiette du jour.
 *
 * Assiette : sa part du loyer nu encaissé, hors charges et pénalités.
 */
async function materializeWithholdings(
  tenantId: string,
  owner: { id: string; ownerTaxStatus: 'INDIVIDUAL' | 'COMPANY' | 'EXEMPT' | null },
  settings: AgencyFinanceSettingsDto,
  allocations: Array<{
    id: string;
    amount: unknown;
    payment: { succeeded_at: Date | null; initiated_at: Date };
    installment: {
      amount_rent: unknown;
      amount_service: unknown;
      amount_other_fees: unknown;
      penalty_amount: unknown;
      lease: { id: string; property_id: string };
    };
  }>,
  sharesFor: (propertyId: string) => Share[] | undefined
) {
  if (!settings.withholdingEnabled || !settings.withholdingStartsOn) return;
  const status = owner.ownerTaxStatus;
  if (status !== 'INDIVIDUAL' && status !== 'COMPANY') return;
  const rate = status === 'INDIVIDUAL' ? settings.withholdingRateIndividual : settings.withholdingRateCompany;
  if (!(rate > 0)) return;
  const startsOn = new Date(`${settings.withholdingStartsOn}T00:00:00.000Z`);

  const existing = new Set(
    (
      await prisma.rentWithholding.findMany({
        where: { tenantId, ownerClientId: owner.id },
        select: { allocationId: true }
      })
    ).map(row => row.allocationId)
  );

  const rows: Prisma.RentWithholdingCreateManyInput[] = [];
  for (const allocation of allocations) {
    if (existing.has(allocation.id)) continue;
    const collectedAt = allocation.payment.succeeded_at ?? allocation.payment.initiated_at;
    if (collectedAt < startsOn) continue;
    const fullBase = rentPart(Number(allocation.amount), allocation.installment);
    const shares = sharesFor(allocation.installment.lease.property_id);
    const base = shares ? (splitAmount(fullBase, shares).get(owner.id) ?? 0) : fullBase;
    const amount = roundMoneyXof((base * rate) / 100);
    if (amount <= 0) continue;
    rows.push({
      tenantId,
      allocationId: allocation.id,
      ownerClientId: owner.id,
      leaseId: allocation.installment.lease.id,
      propertyId: allocation.installment.lease.property_id,
      collectedAt,
      taxStatus: status,
      baseAmount: new Prisma.Decimal(roundMoney(base)),
      rate: new Prisma.Decimal(rate),
      amount: new Prisma.Decimal(amount)
    });
  }
  if (rows.length > 0) await prisma.rentWithholding.createMany({ data: rows, skipDuplicates: true });
}

export async function syncOwnerAccount(tenantId: string, ownerClientId: string, options: { skipFees?: boolean } = {}) {
  const owner = await prisma.tenantClient.findFirst({
    where: { id: ownerClientId, tenantId },
    select: { id: true, userId: true, ownerTaxStatus: true, user: { select: { fullName: true, email: true } } }
  });
  if (!owner) throw notFound('Proprietaire introuvable');

  // Indivision (lot 4) : les biens où ce propriétaire a une quote-part, et
  // tous les biens de l'agence qui en ont — ceux-là ne reviennent plus en
  // entier au propriétaire désigné sur leurs baux.
  const [myShares, sharedRows] = await Promise.all([
    prisma.propertyOwnershipShare.findMany({ where: { tenantId, ownerClientId }, select: { propertyId: true } }),
    prisma.propertyOwnershipShare.findMany({
      where: { tenantId },
      select: { propertyId: true, ownerClientId: true, sharePercent: true }
    })
  ]);
  const sharedPropIds = Array.from(new Set(myShares.map(s => s.propertyId)));
  const anyShared = Array.from(new Set(sharedRows.map(s => s.propertyId)));
  const sharesByProperty = new Map<string, Share[]>();
  for (const row of sharedRows) {
    const list = sharesByProperty.get(row.propertyId) ?? [];
    list.push({ ownerClientId: row.ownerClientId, sharePercent: Number(row.sharePercent) });
    sharesByProperty.set(row.propertyId, list);
  }
  const notShared = anyShared.length ? { notIn: anyShared } : undefined;
  const sharesFor = (propertyId: string) =>
    sharedPropIds.includes(propertyId) ? sharesByProperty.get(propertyId) : undefined;
  /** Les propriétaires d'une pièce d'un bien : ses indivisaires, ou ce propriétaire seul. */
  const ownersOf = (propertyId: string): Share[] => sharesFor(propertyId) ?? [{ ownerClientId, sharePercent: 100 }];

  const [leases, ownedProperties] = await Promise.all([
    prisma.rentalLease.findMany({
      where: { tenant_id: tenantId, owner_client_id: ownerClientId, ...(notShared ? { property_id: notShared } : {}) },
      select: { id: true, property_id: true }
    }),
    prisma.property.findMany({
      where: { tenantId, ownerUserId: owner.userId, ...(notShared ? { id: notShared } : {}) },
      select: { id: true }
    })
  ]);
  const plainPropIds = new Set([...leases.map(l => l.property_id), ...ownedProperties.map(p => p.id)]);
  const propertyIds = Array.from(new Set([...plainPropIds, ...sharedPropIds]));

  if (!options.skipFees && propertyIds.length > 0) {
    await materializeManagementFees(tenantId, { from: new Date(0), to: new Date(), propertyIds });
  }

  // Les baux dont ce propriétaire reçoit tout ou partie des fonds.
  const leaseWhere: Prisma.RentalLeaseWhereInput = {
    OR: [
      { owner_client_id: ownerClientId, ...(notShared ? { property_id: notShared } : {}) },
      ...(sharedPropIds.length ? [{ property_id: { in: sharedPropIds } }] : [])
    ]
  };

  const [allocations, fees, expenses, payments, depositMovements, settings] = await Promise.all([
    prisma.rentalPaymentAllocation.findMany({
      where: { tenant_id: tenantId, payment: { status: 'SUCCESS' }, installment: { lease: leaseWhere } },
      select: {
        id: true,
        amount: true,
        payment: {
          select: {
            id: true,
            succeeded_at: true,
            initiated_at: true,
            method: true,
            mm_operator: true,
            treasury_account_id: true
          }
        },
        installment: {
          select: {
            period_year: true,
            period_month: true,
            amount_rent: true,
            amount_service: true,
            amount_other_fees: true,
            penalty_amount: true,
            lease: { select: { id: true, lease_number: true, property_id: true } }
          }
        }
      }
    }),
    prisma.managementFee.findMany({
      where: {
        tenantId,
        OR: [
          { ownerClientId, ...(notShared ? { propertyId: notShared } : {}) },
          ...(sharedPropIds.length ? [{ propertyId: { in: sharedPropIds } }] : [])
        ]
      }
    }),
    propertyIds.length
      ? prisma.propertyExpense.findMany({
          where: { tenantId, propertyId: { in: propertyIds } },
          select: {
            id: true,
            propertyId: true,
            label: true,
            amount: true,
            category: true,
            paidAt: true,
            paymentMethod: true,
            treasuryAccountId: true,
            agencyIsBuyer: true,
            supplierName: true
          }
        })
      : Promise.resolve([]),
    // Tous les règlements de ces baux, affectés ou non : ce qui n'est pas
    // affecté reste un fonds du mandant « à affecter ».
    prisma.rentalPayment.findMany({
      where: {
        tenant_id: tenantId,
        OR: [{ lease: leaseWhere }, { allocations: { some: { installment: { lease: leaseWhere } } } }]
      },
      select: {
        id: true,
        amount: true,
        status: true,
        method: true,
        mm_operator: true,
        treasury_account_id: true,
        succeeded_at: true,
        initiated_at: true,
        lease: { select: { id: true, lease_number: true, property_id: true } },
        allocations: {
          select: { id: true, amount: true, installment: { select: { lease: { select: { property_id: true } } } } }
        },
        depositMovements: { where: { type: 'COLLECT' }, select: { amount: true } }
      }
    }),
    prisma.rentalDepositMovement.findMany({
      where: {
        tenant_id: tenantId,
        type: { in: ['COLLECT', 'REFUND', 'FORFEIT'] },
        deposit: { lease: leaseWhere }
      },
      select: {
        id: true,
        type: true,
        amount: true,
        created_at: true,
        treasury_account_id: true,
        payment: {
          select: {
            status: true,
            method: true,
            mm_operator: true,
            treasury_account_id: true,
            succeeded_at: true,
            initiated_at: true
          }
        },
        deposit: { select: { lease: { select: { id: true, lease_number: true, property_id: true } } } }
      }
    }),
    getAgencyFinanceSettings(tenantId)
  ]);

  await materializeWithholdings(tenantId, owner, settings, allocations, sharesFor);
  const liveAllocationIds = new Set(allocations.map(a => a.id));
  const withholdingRows = await prisma.rentWithholding.findMany({ where: { tenantId, ownerClientId } });
  // Une retenue suit son encaissement : un règlement annulé l'emporte, comme
  // il emporte ses honoraires (supprimés en cascade avec l'affectation).
  const orphanWithholdings = withholdingRows.filter(row => !liveAllocationIds.has(row.allocationId));
  const withholdings = withholdingRows.filter(row => liveAllocationIds.has(row.allocationId));

  const penaltyToAgency = settings.penaltyBeneficiary === 'AGENCY' && Boolean(settings.penaltyIncomeAccountNumber);

  // Même règle que le relevé : une dépense « frais de gestion » saisie à la
  // main n'est pas déduite d'un mois où le bien porte déjà des honoraires.
  const feeMonths = new Set(fees.map(fee => `${fee.propertyId}:${monthKey(fee.collectedAt)}`));
  const leaseNumberById = new Map(allocations.map(a => [a.installment.lease.id, a.installment.lease.lease_number]));

  /**
   * Part de ce propriétaire dans une pièce d'un bien : le tout pour un bien
   * sans indivision, sa quote-part sinon — avec l'identifiant et le libellé
   * qui vont avec.
   */
  const portion = (propertyId: string, baseId: string, full: number, label: string) => {
    const shares = sharesFor(propertyId);
    if (!shares) return { sourceId: baseId, amount: full, label };
    const mine = shares.find(s => s.ownerClientId === ownerClientId);
    const sharePercent = mine?.sharePercent ?? 0;
    return {
      sourceId: sharedSourceId(baseId, ownerClientId, sharePercent),
      amount: splitAmount(full, shares).get(ownerClientId) ?? 0,
      label: `${label} (quote-part ${shareLabel(sharePercent)})`
    };
  };

  const pending: PendingMovement[] = [];
  for (const allocation of allocations) {
    const full = roundMoney(Number(allocation.amount));
    if (full <= 0) continue;
    const { period_year: year, period_month: month, lease } = allocation.installment;
    const agencyPenalty = penaltyToAgency ? penaltyPart(full, allocation.installment) : 0;
    const ownerAmount = roundMoney(full - agencyPenalty);
    const payment: PaymentRef = {
      id: allocation.payment.id,
      date: allocation.payment.succeeded_at ?? allocation.payment.initiated_at,
      method: allocation.payment.method,
      mmOperator: allocation.payment.mm_operator,
      treasuryAccountId: allocation.payment.treasury_account_id
    };
    const part = portion(
      lease.property_id,
      allocation.id,
      ownerAmount,
      `Loyer ${String(month).padStart(2, '0')}/${year} — ${lease.lease_number}`
    );
    if (part.amount <= 0) continue;
    pending.push({
      sourceType: OWNER_SOURCE.RENT,
      sourceId: part.sourceId,
      baseId: allocation.id,
      type: 'RENT_COLLECTED',
      debit: 0,
      credit: part.amount,
      date: payment.date,
      label: part.label,
      leaseId: lease.id,
      entry: { kind: 'RENT', payment, propertyId: lease.property_id, amount: full, agencyPenalty }
    });
  }
  for (const fee of fees) {
    const leaseNumber = leaseNumberById.get(fee.leaseId) ?? '';
    const feeAmount = Number(fee.feeAmount);
    const vatAmount = Number(fee.vatAmount);
    const entry: PieceEntry = { kind: 'FEE', propertyId: fee.propertyId, feeAmount, vatAmount };
    if (feeAmount > 0) {
      const part = portion(fee.propertyId, fee.id, feeAmount, `Honoraires de gestion — ${leaseNumber}`.trim());
      if (part.amount > 0) {
        pending.push({
          sourceType: OWNER_SOURCE.FEE,
          sourceId: part.sourceId,
          baseId: fee.id,
          type: 'MANAGEMENT_FEE',
          debit: part.amount,
          credit: 0,
          date: fee.collectedAt,
          label: part.label,
          leaseId: fee.leaseId,
          entry
        });
      }
    }
    if (vatAmount > 0) {
      const part = portion(fee.propertyId, fee.id, vatAmount, `TVA sur honoraires — ${leaseNumber}`.trim());
      if (part.amount > 0) {
        pending.push({
          sourceType: OWNER_SOURCE.FEE_VAT,
          sourceId: part.sourceId,
          baseId: fee.id,
          type: 'MANAGEMENT_FEE_VAT',
          debit: part.amount,
          credit: 0,
          date: fee.collectedAt,
          label: part.label,
          leaseId: fee.leaseId,
          // La TVA partage l'écriture des honoraires : c'est elle qui la passe
          // quand les honoraires sont nuls, ce qui n'arrive pas en pratique.
          entry: feeAmount > 0 ? undefined : entry
        });
      }
    }
  }
  const excludedExpenseIds = new Set<string>();
  for (const expense of expenses) {
    if (expense.category === 'MANAGEMENT_FEES' && feeMonths.has(`${expense.propertyId}:${monthKey(expense.paidAt)}`)) {
      excludedExpenseIds.add(expense.id);
      continue;
    }
    const full = roundMoney(Number(expense.amount));
    if (full <= 0) continue;
    const part = portion(expense.propertyId, expense.id, full, `Dépense — ${expense.label}`);
    if (part.amount <= 0) continue;
    pending.push({
      sourceType: OWNER_SOURCE.EXPENSE,
      sourceId: part.sourceId,
      baseId: expense.id,
      type: 'EXPENSE',
      debit: part.amount,
      credit: 0,
      date: expense.paidAt,
      label: part.label,
      leaseId: null,
      entry: {
        kind: 'EXPENSE',
        propertyId: expense.propertyId,
        amount: full,
        method: expense.paymentMethod ?? 'CASH',
        treasuryAccountId: expense.treasuryAccountId,
        agencyIsBuyer: expense.agencyIsBuyer,
        supplierName: expense.supplierName
      }
    });
  }
  for (const row of withholdings) {
    const amount = roundMoney(Number(row.amount));
    if (amount <= 0) continue;
    pending.push({
      sourceType: OWNER_SOURCE.WITHHOLDING,
      sourceId: row.id,
      baseId: row.id,
      type: 'WITHHOLDING_TAX',
      debit: amount,
      credit: 0,
      date: row.collectedAt,
      label: `Retenue à la source ${String(Number(row.rate)).replace('.', ',')} % — ${leaseNumberById.get(row.leaseId) ?? ''}`.trim(),
      leaseId: row.leaseId,
      entry: { kind: 'WITHHOLDING', amount }
    });
  }
  for (const movement of depositMovements) {
    if (movement.type !== 'FORFEIT') continue;
    const full = roundMoney(Number(movement.amount));
    if (full <= 0) continue;
    const { lease } = movement.deposit;
    const part = portion(lease.property_id, movement.id, full, `Dépôt de garantie conservé — ${lease.lease_number}`);
    if (part.amount <= 0) continue;
    // L'écriture (4731 dépôt → 4731 compte courant) est passée avec les
    // autres mouvements de dépôt, plus bas.
    pending.push({
      sourceType: OWNER_SOURCE.DEPOSIT_RETAINED,
      sourceId: part.sourceId,
      baseId: movement.id,
      type: 'DEPOSIT_RETAINED',
      debit: 0,
      credit: part.amount,
      date: movement.created_at,
      label: part.label,
      leaseId: lease.id
    });
  }

  await prisma.$transaction(
    async tx => {
      const account = await getOrCreateOwnerAccountTx(tx, tenantId, ownerClientId);
      const accounts: RentalAccounts = await ensureRentalAccountsTx(tx, tenantId, settings);
      const journalFor = journalResolver(tx, tenantId);

      const partyCache = new Map<string, Promise<string>>([[ownerClientId, Promise.resolve(account.id)]]);
      const partyOf = (id: string) => {
        let party = partyCache.get(id);
        if (!party) {
          party = getOrCreateOwnerAccountTx(tx, tenantId, id).then(a => a.id);
          partyCache.set(id, party);
        }
        return party;
      };
      const treasuryCache = new Map<string, Promise<ResolvedTreasury>>();
      const treasuryOf = (method: string, mmOperator: string | null, treasuryAccountId: string | null) => {
        const key = `${method}|${mmOperator ?? ''}|${treasuryAccountId ?? ''}`;
        let treasury = treasuryCache.get(key);
        if (!treasury) {
          treasury = resolveTreasuryAccountTx(tx, tenantId, { method, mmOperator, treasuryAccountId });
          treasuryCache.set(key, treasury);
        }
        return treasury;
      };
      const ctx: EntryContext = { tx, tenantId, accounts, journalFor, partyOf, treasuryOf, ownersOf };

      const existing = await tx.thirdPartyMovement.findMany({
        where: { accountId: account.id },
        select: { sourceType: true, sourceId: true, type: true, debit: true, credit: true, leaseId: true }
      });
      const seen = new Set(existing.map(m => `${m.sourceType}:${m.sourceId}:${m.type}`));

      // Un mouvement est ACTIF tant qu'il n'a pas été contre-passé. Une pièce
      // contre-passée puis de nouveau due (un bien sorti d'indivision, par
      // exemple) renaît sous une nouvelle génération, `<identité>:r<n>` : le
      // grand livre de tiers n'admet qu'un mouvement par (origine, pièce,
      // nature), et l'ancien, annulé, occupe déjà la place.
      const voided = new Set(existing.filter(m => m.type === 'VOID').map(m => `${m.sourceType}:${m.sourceId}`));
      const active = existing.filter(m => m.type !== 'VOID' && !voided.has(`${m.sourceType}:${m.sourceId}`));
      const activeKeys = new Set(active.map(m => `${m.sourceType}|${identityOf(m.sourceId)}|${m.type}`));
      const desiredKeys = new Set(pending.map(p => `${p.sourceType}|${p.sourceId}|${p.type}`));

      // 1. Inscrire ce qui manque, dans l'ordre des dates.
      pending.sort((a, b) => a.date.getTime() - b.date.getTime());
      for (const move of pending) {
        if (activeKeys.has(`${move.sourceType}|${move.sourceId}|${move.type}`)) continue;
        let sourceId = move.sourceId;
        for (let generation = 1; seen.has(`${move.sourceType}:${sourceId}:${move.type}`); generation += 1) {
          sourceId = `${move.sourceId}:r${generation}`;
        }
        await appendThirdPartyMovementTx(tx, {
          tenantId,
          accountId: account.id,
          type: move.type,
          billed: move.debit,
          settled: move.credit,
          movementDate: move.date,
          label: move.label,
          sourceType: move.sourceType,
          sourceId,
          leaseId: move.leaseId
        } as any);
        seen.add(`${move.sourceType}:${sourceId}:${move.type}`);
        await postSourceEntryTx(ctx, move);
      }

      // 2. Contre-passer ce qui a disparu de CE compte. Les reversements ne
      //    passent pas par ici : ils s'annulent explicitement, avec un motif.
      for (const movement of active) {
        if (movement.sourceType === OWNER_SOURCE.PAYOUT) continue;
        if (!Object.values(OWNER_SOURCE).includes(movement.sourceType as any)) continue;
        if (desiredKeys.has(`${movement.sourceType}|${identityOf(movement.sourceId)}|${movement.type}`)) continue;

        const now = new Date();
        await appendThirdPartyMovementTx(tx, {
          tenantId,
          accountId: account.id,
          type: 'VOID',
          billed: Number(movement.credit ?? 0),
          settled: Number(movement.debit ?? 0),
          movementDate: now,
          label: 'Annulation — pièce d’origine supprimée, annulée ou répartie autrement',
          sourceType: movement.sourceType,
          sourceId: movement.sourceId,
          leaseId: movement.leaseId
        } as any);

        // L'écriture comptable ne se contre-passe que si la pièce a disparu
        // pour tout le monde, pas quand seules les quotes-parts ont changé.
        const baseId = baseSourceId(movement.sourceId);
        const documentType = DOCUMENT_BY_SOURCE[movement.sourceType];
        if (
          documentType &&
          !(await sourceStillExistsTx(tx, tenantId, movement.sourceType, baseId, excludedExpenseIds))
        ) {
          await reverseDocumentEntryTx(tx, {
            tenantId,
            documentType,
            documentId: baseId,
            entryDate: now,
            description: 'Contre-passation : pièce d’origine supprimée ou annulée',
            journalFor
          });
        }
      }

      // 3. Les dépôts de garantie : encaissés, remboursés, conservés.
      for (const movement of depositMovements) {
        await postDepositEntryTx(ctx, movement);
      }

      // 4. Les encaissements non affectés, règlement par règlement.
      for (const payment of payments) {
        await syncUnallocatedTx(ctx, payment);
      }

      // 5. Aligner les lignes du 4731 de ce propriétaire sur son compte courant.
      await reconcileOwnerAuxiliaryTx(ctx, account.id);

      if (orphanWithholdings.length > 0) {
        await tx.rentWithholding.deleteMany({ where: { id: { in: orphanWithholdings.map(row => row.id) } } });
      }
    },
    { timeout: 120_000, maxWait: 20_000 }
  );
}

interface EntryContext {
  tx: PrismaTransactionClient;
  tenantId: string;
  accounts: RentalAccounts;
  journalFor: ReturnType<typeof journalResolver>;
  /** Compte de tiers (auxiliaire) d'un propriétaire. */
  partyOf: (ownerClientId: string) => Promise<string>;
  treasuryOf: (method: string, mmOperator: string | null, treasuryAccountId: string | null) => Promise<ResolvedTreasury>;
  ownersOf: (propertyId: string) => Share[];
}

type Nature = 'CURRENT' | 'DEPOSIT' | 'UNALLOCATED';

/**
 * Lignes du 4731 d'une pièce entière, une par propriétaire du bien. Les
 * montants sont répartis par morceaux (`parts`) pour que la ligne de chacun
 * vaille exactement la somme de ses mouvements — honoraires et TVA sont
 * répartis séparément sur les comptes courants, donc ici aussi.
 */
async function ownerFundsLinesTx(
  ctx: EntryContext,
  params: { propertyId: string; parts: number[]; side: 'debit' | 'credit'; nature: Nature; label: string }
): Promise<JournalLineInput[]> {
  const owners = ctx.ownersOf(params.propertyId);
  const totals = new Map<string, number>();
  for (const part of params.parts) {
    if (!(part > 0)) continue;
    const split = owners.length === 1 ? new Map([[owners[0].ownerClientId, part]]) : splitAmount(part, owners);
    for (const [ownerId, value] of split) totals.set(ownerId, roundMoney((totals.get(ownerId) ?? 0) + value));
  }
  const lines: JournalLineInput[] = [];
  for (const [ownerId, value] of totals) {
    if (!(value > 0)) continue;
    lines.push({
      accountId: ctx.accounts.ownerFunds,
      [params.side]: value,
      label: params.label,
      thirdPartyAccountId: await ctx.partyOf(ownerId),
      fundsNature: params.nature
    });
  }
  return lines;
}

const already = (ctx: EntryContext, documentType: string, documentId: string) =>
  ctx.tx.journalEntry.findFirst({
    where: { tenantId: ctx.tenantId, documentType, documentId },
    select: { id: true }
  });

async function postSourceEntryTx(ctx: EntryContext, params: PendingMovement) {
  const { tx, tenantId, accounts, journalFor } = ctx;
  const piece = params.entry;
  if (!piece) return;
  // L'écriture porte sur la pièce entière : le libellé ne dit pas la
  // quote-part de l'indivisaire dont la synchronisation l'a déclenchée.
  const label = params.label.replace(/ \(quote-part [^)]*\)$/, '');
  const ref = params.baseId.slice(0, 8).toUpperCase();

  if (piece.kind === 'RENT') {
    if (await already(ctx, 'OWNER_RENT_COLLECTED', params.baseId)) return;
    // L'argent de ce règlement est-il déjà entré en trésorerie comme fonds à
    // affecter ? Alors l'affectation le reclasse, elle ne l'encaisse pas deux fois.
    const unallocated = Math.max(0, await unallocatedBalanceTx(ctx, piece.payment.id));
    const fromUnallocated = Math.min(unallocated, piece.amount);
    const fromTreasury = roundMoney(piece.amount - fromUnallocated);
    const treasury = await ctx.treasuryOf(
      piece.payment.method,
      piece.payment.mmOperator,
      piece.payment.treasuryAccountId
    );

    const lines: JournalLineInput[] = [];
    if (fromTreasury > 0) lines.push({ accountId: treasury.chartOfAccountId, debit: fromTreasury, label });
    if (fromUnallocated > 0) {
      lines.push(
        ...(await ownerFundsLinesTx(ctx, {
          propertyId: piece.propertyId,
          parts: [fromUnallocated],
          side: 'debit',
          nature: 'UNALLOCATED',
          label: `Affectation — ${label}`
        }))
      );
    }
    lines.push(
      ...(await ownerFundsLinesTx(ctx, {
        propertyId: piece.propertyId,
        parts: [roundMoney(piece.amount - piece.agencyPenalty)],
        side: 'credit',
        nature: 'CURRENT',
        label
      }))
    );
    if (piece.agencyPenalty > 0 && accounts.penaltyIncome) {
      lines.push({ accountId: accounts.penaltyIncome, credit: piece.agencyPenalty, label: `Pénalités — ${label}` });
    }
    await postDocumentEntryTx(tx, {
      tenantId,
      journalId: await journalFor(piece.payment.date, fromTreasury > 0 ? treasury.journal : 'GENERAL'),
      entryDate: piece.payment.date,
      reference: `LOY-${ref}`,
      description: label,
      documentType: 'OWNER_RENT_COLLECTED',
      documentId: params.baseId,
      lines
    });
    return;
  }

  if (piece.kind === 'FEE') {
    // Une seule écriture pour les honoraires et leur TVA : le propriétaire est
    // débité du TTC, l'agence crédite son produit et l'État.
    if (await already(ctx, 'OWNER_MANAGEMENT_FEE', params.baseId)) return;
    const feeLabel = label.replace(/^TVA sur honoraires/, 'Honoraires de gestion');
    const lines: JournalLineInput[] = [
      ...(await ownerFundsLinesTx(ctx, {
        propertyId: piece.propertyId,
        parts: [piece.feeAmount, piece.vatAmount],
        side: 'debit',
        nature: 'CURRENT',
        label: feeLabel
      }))
    ];
    if (piece.feeAmount > 0) lines.push({ accountId: accounts.fees, credit: piece.feeAmount, label: feeLabel });
    if (piece.vatAmount > 0) lines.push({ accountId: accounts.vat, credit: piece.vatAmount, label: `TVA — ${feeLabel}` });
    await postDocumentEntryTx(tx, {
      tenantId,
      journalId: await journalFor(params.date, 'GENERAL'),
      entryDate: params.date,
      reference: `HON-${ref}`,
      description: feeLabel,
      documentType: 'OWNER_MANAGEMENT_FEE',
      documentId: params.baseId,
      lines
    });
    return;
  }

  if (piece.kind === 'EXPENSE') {
    if (await already(ctx, 'OWNER_EXPENSE', params.baseId)) return;
    const debitLines = await ownerFundsLinesTx(ctx, {
      propertyId: piece.propertyId,
      parts: [piece.amount],
      side: 'debit',
      nature: 'CURRENT',
      label
    });
    // L'agence n'est débitrice du fournisseur que si elle a elle-même commandé
    // le travail ; sinon elle a simplement payé pour le compte du propriétaire.
    if (piece.agencyIsBuyer) {
      const supplierLabel = piece.supplierName ? `${label} — ${piece.supplierName}` : label;
      await postDocumentEntryTx(tx, {
        tenantId,
        journalId: await journalFor(params.date, 'GENERAL'),
        entryDate: params.date,
        reference: `DEP-${ref}`,
        description: supplierLabel,
        documentType: 'OWNER_EXPENSE',
        documentId: params.baseId,
        lines: [...debitLines, { accountId: accounts.suppliers, credit: piece.amount, label: supplierLabel }]
      });
      return;
    }
    const treasury = await ctx.treasuryOf(piece.method, null, piece.treasuryAccountId);
    await postDocumentEntryTx(tx, {
      tenantId,
      journalId: await journalFor(params.date, treasury.journal),
      entryDate: params.date,
      reference: `DEP-${ref}`,
      description: label,
      documentType: 'OWNER_EXPENSE',
      documentId: params.baseId,
      lines: [...debitLines, { accountId: treasury.chartOfAccountId, credit: piece.amount, label }]
    });
    return;
  }

  if (piece.kind === 'WITHHOLDING') {
    if (await already(ctx, 'OWNER_WITHHOLDING', params.baseId)) return;
    // Propre à un propriétaire : son statut fiscal, sa quote-part. Pas de répartition.
    const party = await ctx.partyOf(await ownerOfWithholdingTx(ctx, params.baseId));
    await postDocumentEntryTx(tx, {
      tenantId,
      journalId: await journalFor(params.date, 'GENERAL'),
      entryDate: params.date,
      reference: `RAS-${ref}`,
      description: label,
      documentType: 'OWNER_WITHHOLDING',
      documentId: params.baseId,
      lines: [
        {
          accountId: accounts.ownerFunds,
          debit: piece.amount,
          label,
          thirdPartyAccountId: party,
          fundsNature: 'CURRENT'
        },
        { accountId: accounts.withholding, credit: piece.amount, label }
      ]
    });
  }
}

async function ownerOfWithholdingTx(ctx: EntryContext, id: string) {
  const row = await ctx.tx.rentWithholding.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { ownerClientId: true }
  });
  if (!row) throw notFound('Retenue introuvable');
  return row.ownerClientId;
}

/**
 * Écriture d'un mouvement de dépôt de garantie. Le dépôt reste un fonds du
 * mandant (4731, nature « dépôt ») : pas d'honoraire, pas de reversement tant
 * qu'il n'est pas conservé.
 */
async function postDepositEntryTx(
  ctx: EntryContext,
  movement: {
    id: string;
    type: string;
    amount: unknown;
    created_at: Date;
    treasury_account_id: string | null;
    payment: {
      status: string;
      method: string;
      mm_operator: string | null;
      treasury_account_id: string | null;
      succeeded_at: Date | null;
      initiated_at: Date;
    } | null;
    deposit: { lease: { id: string; lease_number: string; property_id: string } };
  }
) {
  const { tx, tenantId, journalFor } = ctx;
  const amount = roundMoney(Number(movement.amount));
  if (amount <= 0) return;
  if (await already(ctx, 'OWNER_DEPOSIT', movement.id)) return;
  const { lease } = movement.deposit;
  const ref = movement.id.slice(0, 8).toUpperCase();

  if (movement.type === 'COLLECT') {
    if (movement.payment && movement.payment.status !== 'SUCCESS') return;
    const date = movement.payment ? (movement.payment.succeeded_at ?? movement.payment.initiated_at) : movement.created_at;
    const treasury = movement.treasury_account_id
      ? await ctx.treasuryOf('OTHER', null, movement.treasury_account_id)
      : await ctx.treasuryOf(
          movement.payment?.method ?? 'CASH',
          movement.payment?.mm_operator ?? null,
          movement.payment?.treasury_account_id ?? null
        );
    const label = `Dépôt de garantie encaissé — ${lease.lease_number}`;
    await postDocumentEntryTx(tx, {
      tenantId,
      journalId: await journalFor(date, treasury.journal),
      entryDate: date,
      reference: `DG-${ref}`,
      description: label,
      documentType: 'OWNER_DEPOSIT',
      documentId: movement.id,
      lines: [
        { accountId: treasury.chartOfAccountId, debit: amount, label },
        ...(await ownerFundsLinesTx(ctx, {
          propertyId: lease.property_id,
          parts: [amount],
          side: 'credit',
          nature: 'DEPOSIT',
          label
        }))
      ]
    });
    return;
  }

  if (movement.type === 'REFUND') {
    const treasury = await ctx.treasuryOf(
      movement.treasury_account_id ? 'OTHER' : 'CASH',
      null,
      movement.treasury_account_id
    );
    const label = `Dépôt de garantie remboursé — ${lease.lease_number}`;
    await postDocumentEntryTx(tx, {
      tenantId,
      journalId: await journalFor(movement.created_at, treasury.journal),
      entryDate: movement.created_at,
      reference: `DG-${ref}`,
      description: label,
      documentType: 'OWNER_DEPOSIT',
      documentId: movement.id,
      lines: [
        ...(await ownerFundsLinesTx(ctx, {
          propertyId: lease.property_id,
          parts: [amount],
          side: 'debit',
          nature: 'DEPOSIT',
          label
        })),
        { accountId: treasury.chartOfAccountId, credit: amount, label }
      ]
    });
    return;
  }

  if (movement.type === 'FORFEIT') {
    // Conservé au profit du propriétaire : il quitte les dépôts pour son
    // compte courant, et sera reversé avec le reste.
    const label = `Dépôt de garantie conservé — ${lease.lease_number}`;
    await postDocumentEntryTx(tx, {
      tenantId,
      journalId: await journalFor(movement.created_at, 'GENERAL'),
      entryDate: movement.created_at,
      reference: `DG-${ref}`,
      description: label,
      documentType: 'OWNER_DEPOSIT',
      documentId: movement.id,
      lines: [
        ...(await ownerFundsLinesTx(ctx, {
          propertyId: lease.property_id,
          parts: [amount],
          side: 'debit',
          nature: 'DEPOSIT',
          label
        })),
        ...(await ownerFundsLinesTx(ctx, {
          propertyId: lease.property_id,
          parts: [amount],
          side: 'credit',
          nature: 'CURRENT',
          label
        }))
      ]
    });
  }
}

/**
 * Solde « à affecter » d'un règlement au 4731 : ses encaissements non
 * affectés, moins ce que ses affectations en ont reclassé, contre-passations
 * comprises. Positif : de l'argent reçu attend encore son échéance.
 */
async function unallocatedBalanceTx(ctx: EntryContext, paymentId: string) {
  const allocationIds = (
    await ctx.tx.rentalPaymentAllocation.findMany({ where: { payment_id: paymentId }, select: { id: true } })
  ).map(a => a.id);
  const lines = await ctx.tx.journalEntryLine.findMany({
    where: {
      fundsNature: 'UNALLOCATED',
      entry: {
        tenantId: ctx.tenantId,
        OR: [
          { documentType: 'OWNER_UNALLOCATED', documentId: { startsWith: `${paymentId}#` } },
          { documentType: 'OWNER_VOID', documentId: { startsWith: `OWNER_UNALLOCATED:${paymentId}#` } },
          ...(allocationIds.length
            ? [
                { documentType: 'OWNER_RENT_COLLECTED', documentId: { in: allocationIds } },
                {
                  documentType: 'OWNER_VOID',
                  documentId: { in: allocationIds.map(id => `OWNER_RENT_COLLECTED:${id}`) }
                }
              ]
            : [])
        ]
      }
    },
    select: { debit: true, credit: true }
  });
  return roundMoney(lines.reduce((sum, line) => sum + Number(line.credit) - Number(line.debit), 0));
}

/**
 * Un règlement dont une partie n'est affectée à aucune échéance (une avance,
 * un trop-perçu) : cette partie est comptabilisée le jour de sa réception, en
 * fonds du mandant « à affecter ». Quand elle est affectée plus tard,
 * l'écriture du loyer la reclasse (voir `postSourceEntryTx`) ; si le
 * règlement est annulé, ses encaissements à affecter sont contre-passés.
 */
async function syncUnallocatedTx(
  ctx: EntryContext,
  payment: {
    id: string;
    amount: unknown;
    status: string;
    method: string;
    mm_operator: string | null;
    treasury_account_id: string | null;
    succeeded_at: Date | null;
    initiated_at: Date;
    lease: { id: string; lease_number: string; property_id: string } | null;
    allocations: Array<{ amount: unknown; installment: { lease: { property_id: string } } }>;
    depositMovements: Array<{ amount: unknown }>;
  }
) {
  const { tx, tenantId, journalFor } = ctx;
  const propertyId = payment.lease?.property_id ?? payment.allocations[0]?.installment.lease.property_id;
  if (!propertyId) return;

  const allocated = payment.allocations.reduce((sum, a) => sum + Number(a.amount), 0);
  const deposits = payment.depositMovements.reduce((sum, d) => sum + Number(d.amount), 0);
  const desired =
    payment.status === 'SUCCESS' ? Math.max(0, roundMoney(Number(payment.amount) - allocated - deposits)) : 0;
  let balance = await unallocatedBalanceTx(ctx, payment.id);
  if (Math.abs(desired - balance) < 0.5) return;

  const receipts = await tx.journalEntry.findMany({
    where: { tenantId, documentType: 'OWNER_UNALLOCATED', documentId: { startsWith: `${payment.id}#` } },
    select: { documentId: true, voidedByEntryId: true, lines: { select: { credit: true, fundsNature: true } } },
    orderBy: { createdAt: 'desc' }
  });

  // Trop inscrit : on contre-passe les encaissements les plus récents.
  const now = new Date();
  for (const receipt of receipts) {
    if (balance <= desired + 0.5) break;
    if (receipt.voidedByEntryId || !receipt.documentId) continue;
    await reverseDocumentEntryTx(tx, {
      tenantId,
      documentType: 'OWNER_UNALLOCATED',
      documentId: receipt.documentId,
      entryDate: now,
      description: 'Contre-passation : encaissement à affecter annulé ou affecté autrement',
      journalFor
    });
    balance = roundMoney(
      balance - receipt.lines.filter(l => l.fundsNature === 'UNALLOCATED').reduce((s, l) => s + Number(l.credit), 0)
    );
  }

  const missing = roundMoney(desired - balance);
  if (missing < 0.5) return;
  const date = payment.succeeded_at ?? payment.initiated_at;
  const treasury = await ctx.treasuryOf(payment.method, payment.mm_operator, payment.treasury_account_id);
  const label = `Encaissement à affecter${payment.lease ? ` — ${payment.lease.lease_number}` : ''}`;
  await postDocumentEntryTx(tx, {
    tenantId,
    journalId: await journalFor(date, treasury.journal),
    entryDate: date,
    reference: `AAF-${payment.id.slice(0, 8).toUpperCase()}-${receipts.length + 1}`,
    description: label,
    documentType: 'OWNER_UNALLOCATED',
    documentId: `${payment.id}#${receipts.length + 1}`,
    lines: [
      { accountId: treasury.chartOfAccountId, debit: missing, label },
      ...(await ownerFundsLinesTx(ctx, { propertyId, parts: [missing], side: 'credit', nature: 'UNALLOCATED', label }))
    ]
  });
}

/** La pièce d'une écriture du 4731 : `<nature de pièce>:<identifiant>`. */
function pieceKeyOfEntry(documentType: string | null, documentId: string | null): string | null {
  if (!documentType || !documentId) return null;
  if (RECONCILED_DOCUMENTS.has(documentType)) return `${documentType}:${documentId}`;
  if (documentType === 'OWNER_VOID') {
    return RECONCILED_DOCUMENTS.has(documentId.split(':')[0]) ? documentId : null;
  }
  if (documentType === 'OWNER_AUX_REALLOC') return documentId.replace(/:[^:]+#\d+$/, '');
  return null;
}

/**
 * Aligne les lignes « compte courant » du 4731 de ce propriétaire sur son
 * compte courant, pièce par pièce.
 *
 * Ce qui est dû au propriétaire sur une pièce, c'est la somme de ses
 * mouvements actifs ; ce que la comptabilité lui attribue, c'est la somme de
 * ses lignes au 4731 sur les écritures de cette pièce (écriture d'origine,
 * contre-passation, reclassements). Un écart vient d'un changement de
 * quotes-parts : on le reclasse entre son auxiliaire et le 4731 « non
 * réparti », que la synchronisation de l'autre indivisaire soldera.
 */
async function reconcileOwnerAuxiliaryTx(ctx: EntryContext, ownerAccountId: string) {
  const { tx, tenantId, accounts, journalFor } = ctx;
  const movements = await tx.thirdPartyMovement.findMany({
    where: { accountId: ownerAccountId },
    select: { sourceType: true, sourceId: true, type: true, debit: true, credit: true }
  });
  const voided = new Set(movements.filter(m => m.type === 'VOID').map(m => `${m.sourceType}:${m.sourceId}`));
  const desired = new Map<string, number>();
  for (const m of movements) {
    const documentType = DOCUMENT_BY_SOURCE[m.sourceType];
    if (!documentType || !RECONCILED_DOCUMENTS.has(documentType)) continue;
    const key = `${documentType}:${baseSourceId(identityOf(m.sourceId))}`;
    if (!desired.has(key)) desired.set(key, 0);
    if (m.type === 'VOID' || voided.has(`${m.sourceType}:${m.sourceId}`)) continue;
    desired.set(key, roundMoney((desired.get(key) ?? 0) + Number(m.credit ?? 0) - Number(m.debit ?? 0)));
  }

  const lines = await tx.journalEntryLine.findMany({
    where: { thirdPartyAccountId: ownerAccountId, fundsNature: 'CURRENT', entry: { tenantId } },
    select: { debit: true, credit: true, entry: { select: { documentType: true, documentId: true } } }
  });
  const booked = new Map<string, number>();
  for (const line of lines) {
    const key = pieceKeyOfEntry(line.entry.documentType, line.entry.documentId);
    if (!key) continue;
    booked.set(key, roundMoney((booked.get(key) ?? 0) + Number(line.credit) - Number(line.debit)));
  }

  const keys = new Set([...desired.keys(), ...booked.keys()]);
  const now = new Date();
  for (const key of keys) {
    const diff = roundMoney((desired.get(key) ?? 0) - (booked.get(key) ?? 0));
    if (Math.abs(diff) < 0.5) continue;
    const prefix = `${key}:${ownerAccountId}#`;
    const count = await tx.journalEntry.count({
      where: { tenantId, documentType: 'OWNER_AUX_REALLOC', documentId: { startsWith: prefix } }
    });
    const label = 'Reclassement entre propriétaires — quotes-parts modifiées';
    const value = Math.abs(diff);
    // diff > 0 : il manque du crédit à ce propriétaire, pris sur le non réparti.
    const ownerSide = diff > 0 ? { credit: value } : { debit: value };
    const poolSide = diff > 0 ? { debit: value } : { credit: value };
    await postDocumentEntryTx(tx, {
      tenantId,
      journalId: await journalFor(now, 'GENERAL'),
      entryDate: now,
      reference: `RCL-${key.split(':')[1]?.slice(0, 8).toUpperCase() ?? ''}-${count + 1}`,
      description: label,
      documentType: 'OWNER_AUX_REALLOC',
      documentId: `${prefix}${count + 1}`,
      lines: [
        { accountId: accounts.ownerFunds, ...ownerSide, label, thirdPartyAccountId: ownerAccountId, fundsNature: 'CURRENT' },
        { accountId: accounts.ownerFunds, ...poolSide, label, thirdPartyAccountId: null, fundsNature: 'CURRENT' }
      ]
    });
  }
}
