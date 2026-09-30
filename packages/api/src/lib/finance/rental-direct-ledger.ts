/**
 * Comptabilité de la gestion locative DIRECTE (BUG-2026-09-30-058).
 *
 * Gestion directe = un bien détenu en propre (`ownershipType = TENANT`, ni
 * quote-part d'indivisaire, ni bail rattaché à un propriétaire mandant). Le
 * loyer n'est alors pas un fonds de mandant (4731) : c'est le produit du
 * détenteur, et la dépense d'un bien est sa charge.
 *
 * Pourquoi rien n'était écrit : toutes les écritures de la gestion locative
 * (`lib/owner-account/sync.ts`) se déduisent du COMPTE D'UN PROPRIÉTAIRE
 * (`owner_client_id` du bail, mandat). Un bail sans propriétaire mandant n'a
 * aucun compte à synchroniser : l'encaissement ne créditait aucune trésorerie
 * et le journal restait vide. Seule la dépense d'un bien rattaché à un
 * utilisateur membre passait, à tort, au 4731.
 *
 * Trois pièces, chacune écrite dans la transaction de l'événement qui la
 * fait naître, et idempotente (clé = nature + pièce) :
 *
 * | Pièce                          | Écriture                                             |
 * | ------------------------------ | ---------------------------------------------------- |
 * | encaissement (règlement OK)    | débit trésorerie réelle / crédit 411 (locataire)     |
 * | mouvement de créance locataire | débit 411 / crédit 7083 (loyer) ou 7088 (pénalité)   |
 * |   (échéance, pénalité, remise, |   ou l'inverse pour un crédit (remise, annulation)   |
 * |   annulation, révision)        |                                                      |
 * | dépense d'un bien              | débit charge de la catégorie / crédit trésorerie     |
 * |                                |   réelle, ou 401 si l'agence doit la facture         |
 * | dépôt de garantie encaissé     | débit trésorerie / crédit 165 (PAS 411, PAS d'avance) |
 * | dépôt remboursé                | débit 165 / crédit trésorerie                        |
 * | dépôt retenu (conservé)        | débit 165 / crédit 758 (produit)                     |
 *
 * Dépôt de garantie (À VALIDER PAR LA COMPTABILITÉ) : c'est une dette envers le
 * locataire, pas un loyer ni une avance. Compte retenu : 165 « Dépôts et
 * cautionnements reçus » (SYSCOHADA, dettes financières) ; une retenue définitive
 * devient un produit divers (758). Une imputation sur une créance 411 impayée
 * n'est pas automatique : elle reste une opération manuelle.
 *
 * Le 411 auxiliaire du locataire (`thirdPartyAccountId`) se lit donc comme son
 * relevé : facturé − réglé. Les mouvements PAYMENT / ADVANCE_* du compte du
 * locataire ne sont pas repris ici : la trésorerie vient du règlement lui-même,
 * une seule fois, quelle que soit la façon dont le compte l'a ventilé.
 *
 * Une pièce qui change ou disparaît est CONTRE-PASSÉE (écriture inverse liée,
 * jamais de modification), et sa nouvelle version naît sous une génération
 * `<pièce>:r<n>`. Comptes manquants (411, produits, charges, trésorerie par
 * défaut) : créés à la volée.
 */
import type { ExtendedPrismaClient, PrismaTransactionClient } from '../../utils/database';
import { ensureChartAccountTx, resolveTreasuryAccountTx } from '../treasury/accounts';
import { postDocumentEntryTx, ensureOperationalJournalTx } from './accounting';
import { getOrCreateTenantAccountTx } from './ledger';
import { roundMoney } from './money';
import type { JournalLineInput } from './types-lot2';

type Db = PrismaTransactionClient | ExtendedPrismaClient;

/** Natures de pièce de cette comptabilité (texte libre côté base, `sourceType` MANUAL). */
export const DIRECT_DOCUMENT = {
  RECEIPT: 'RENTAL_RECEIPT',
  BILLING: 'RENTAL_RENTER_MOVEMENT',
  EXPENSE: 'DIRECT_EXPENSE',
  DEPOSIT: 'RENTAL_DEPOSIT_MOVEMENT'
} as const;

export const DIRECT_ACCOUNTS = {
  clients: { number: '411', name: 'Clients', type: 'ASSET' as const },
  rentIncome: { number: '7083', name: 'Loyers et charges locatives', type: 'INCOME' as const },
  penaltyIncome: { number: '7088', name: 'Pénalités de retard sur loyers', type: 'INCOME' as const },
  suppliers: { number: '401', name: 'Fournisseurs', type: 'LIABILITY' as const },
  buildings: { number: '231', name: 'Bâtiments', type: 'ASSET' as const },
  /** Dépôts de garantie reçus des locataires (dette envers eux). */
  depositsReceived: { number: '165', name: 'Dépôts et cautionnements reçus', type: 'LIABILITY' as const },
  /** Retenue définitive sur un dépôt : produit divers. */
  miscIncome: { number: '758', name: 'Produits divers', type: 'INCOME' as const }
};

/** Compte de charge par catégorie de dépense d'un bien (SYSCOHADA, à valider par la comptabilité). */
export const EXPENSE_ACCOUNTS: Record<string, { number: string; name: string }> = {
  PROPERTY_TAX: { number: '6411', name: 'Impôts fonciers et taxes annexes' },
  CONDO_FEES: { number: '6228', name: 'Locations et charges locatives diverses' },
  INSURANCE: { number: '625', name: "Primes d'assurance" },
  ROUTINE_MAINTENANCE: { number: '624', name: 'Entretien, réparations et maintenance' },
  RENOVATION: { number: '624', name: 'Entretien, réparations et maintenance' },
  MANAGEMENT_FEES: { number: '6324', name: 'Honoraires' },
  UTILITIES: { number: '6051', name: 'Fournitures non stockables (eau, énergie)' },
  OTHER: { number: '658', name: 'Charges diverses' }
};

const roundXof = (value: number) => Math.round(value);

// ---------------------------------------------------------------------------
// Qui relève de la gestion directe ?
// ---------------------------------------------------------------------------

/**
 * Parmi ces biens, ceux qui relèvent de la gestion directe : détenus en propre
 * (`TENANT`), sans indivision et sans bail rattaché à un propriétaire mandant.
 */
export async function directPropertyIdsTx(db: Db, tenantId: string, propertyIds: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(propertyIds.filter(Boolean)));
  if (ids.length === 0) return new Set();

  const own = await db.property.findMany({
    where: { tenantId, id: { in: ids }, ownershipType: 'TENANT' },
    select: { id: true }
  });
  const candidates = own.map(row => row.id);
  if (candidates.length === 0) return new Set();

  const [shares, mandated] = await Promise.all([
    db.propertyOwnershipShare.findMany({
      where: { tenantId, propertyId: { in: candidates } },
      select: { propertyId: true }
    }),
    db.rentalLease.findMany({
      where: { tenant_id: tenantId, property_id: { in: candidates }, owner_client_id: { not: null } },
      select: { property_id: true }
    })
  ]);
  const excluded = new Set([...shares.map(s => s.propertyId), ...mandated.map(l => l.property_id)]);
  return new Set(candidates.filter(id => !excluded.has(id)));
}

/** Un bail relève de la gestion directe : pas de propriétaire mandant, bien détenu en propre. */
export async function isDirectLeaseTx(db: Db, tenantId: string, leaseId: string): Promise<boolean> {
  const lease = await db.rentalLease.findFirst({
    where: { id: leaseId, tenant_id: tenantId },
    select: { owner_client_id: true, property_id: true }
  });
  if (!lease || lease.owner_client_id) return false;
  return (await directPropertyIdsTx(db, tenantId, [lease.property_id])).has(lease.property_id);
}

// ---------------------------------------------------------------------------
// Pièce comptable : poser, remplacer, contre-passer
// ---------------------------------------------------------------------------

interface DesiredEntry {
  entryDate: Date;
  reference: string;
  description: string;
  journalId: string;
  lines: JournalLineInput[];
}

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

function signature(lines: Array<{ accountId: string; debit?: unknown; credit?: unknown }>): string {
  return lines
    .map(l => `${l.accountId}|${roundXof(Number(l.debit ?? 0))}|${roundXof(Number(l.credit ?? 0))}`)
    .sort()
    .join(';');
}

/** Contre-passe une écriture (écriture inverse liée à l'originale), une seule fois. */
async function reverseEntryTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  original: {
    id: string;
    reference: string;
    documentType: string | null;
    documentId: string | null;
    lines: Array<{
      accountId: string;
      debit: unknown;
      credit: unknown;
      label: string | null;
      thirdPartyAccountId: string | null;
      fundsNature: string | null;
    }>;
  },
  journalId: string,
  description: string
) {
  const { entryId } = await postDocumentEntryTx(tx, {
    tenantId,
    journalId,
    entryDate: new Date(),
    reference: `ANN-${original.reference}`,
    description,
    documentType: 'OWNER_VOID',
    documentId: `${original.documentType}:${original.documentId}`,
    lines: original.lines.map(line => ({
      accountId: line.accountId,
      debit: Number(line.credit ?? 0),
      credit: Number(line.debit ?? 0),
      label: `Annulation — ${line.label ?? ''}`.trim(),
      thirdPartyAccountId: line.thirdPartyAccountId,
      fundsNature: (line.fundsNature as any) ?? null
    }))
  });
  await tx.journalEntry.update({ where: { id: original.id, tenantId }, data: { voidedByEntryId: entryId } });
}

/**
 * Amène la pièce à l'écriture voulue (`desired`), ou à aucune (`null`).
 * Inchangée : rien. Changée : contre-passation puis génération suivante.
 */
async function settlePieceTx(
  tx: PrismaTransactionClient,
  params: {
    tenantId: string;
    documentType: string;
    baseId: string;
    desired: DesiredEntry | null;
    reverseJournalId: () => Promise<string>;
  }
): Promise<'posted' | 'kept' | 'reversed' | 'none'> {
  const { tenantId, documentType, baseId, desired } = params;
  const rows = await tx.journalEntry.findMany({
    where: {
      tenantId,
      documentType,
      OR: [{ documentId: baseId }, { documentId: { startsWith: `${baseId}:r` } }]
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      reference: true,
      documentType: true,
      documentId: true,
      entryDate: true,
      voidedByEntryId: true,
      lines: {
        select: {
          accountId: true,
          debit: true,
          credit: true,
          label: true,
          thirdPartyAccountId: true,
          fundsNature: true
        }
      }
    }
  });
  const live = rows.find(row => !row.voidedByEntryId);

  if (live && desired) {
    const same =
      signature(live.lines) === signature(desired.lines) && dayKey(live.entryDate) === dayKey(desired.entryDate);
    if (same) return 'kept';
  }
  if (live) {
    await reverseEntryTx(
      tx,
      tenantId,
      live,
      await params.reverseJournalId(),
      'Contre-passation : pièce modifiée ou annulée'
    );
  }
  if (!desired) return live ? 'reversed' : 'none';

  await postDocumentEntryTx(tx, {
    tenantId,
    journalId: desired.journalId,
    entryDate: desired.entryDate,
    reference: desired.reference,
    description: desired.description,
    documentType: documentType as never,
    documentId: rows.length === 0 ? baseId : `${baseId}:r${rows.length}`,
    lines: desired.lines
  });
  return 'posted';
}

const refOf = (id: string) => id.slice(0, 8).toUpperCase();
const journalFor = (tx: PrismaTransactionClient, tenantId: string, date: Date, type: 'GENERAL' | 'CASH' | 'BANK') =>
  ensureOperationalJournalTx(tx, tenantId, date.getUTCFullYear(), type);

// ---------------------------------------------------------------------------
// 1. Encaissement d'un loyer : trésorerie / 411
// ---------------------------------------------------------------------------

/**
 * Rend l'écriture d'un règlement conforme à son état : SUCCESS sur un bail de
 * gestion directe → débit trésorerie / crédit 411 ; sinon aucune (et
 * contre-passation d'une écriture antérieure). À appeler dans la transaction de
 * toute création ou changement de statut d'un règlement, et par le
 * rattrapage.
 */
export async function syncDirectRentPaymentEntryTx(tx: PrismaTransactionClient, tenantId: string, paymentId: string) {
  const payment = await tx.rentalPayment.findFirst({
    where: { id: paymentId, tenant_id: tenantId },
    select: {
      id: true,
      status: true,
      amount: true,
      method: true,
      mm_operator: true,
      treasury_account_id: true,
      succeeded_at: true,
      initiated_at: true,
      lease_id: true,
      renter_client_id: true,
      lease: { select: { primary_renter_client_id: true } },
      // Un règlement qui porte l'encaissement d'un dépôt de garantie.
      depositMovements: { where: { type: 'COLLECT' }, select: { id: true }, take: 1 }
    }
  });
  if (!payment || !payment.lease_id) return 'none' as const;
  const isDeposit = (payment.depositMovements?.length ?? 0) > 0;

  const direct = await isDirectLeaseTx(tx, tenantId, payment.lease_id);
  const amount = roundMoney(Number(payment.amount ?? 0));
  const reverseJournalId = () => journalFor(tx, tenantId, new Date(), 'GENERAL');

  if (!direct || payment.status !== 'SUCCESS' || amount <= 0) {
    return settlePieceTx(tx, {
      tenantId,
      documentType: DIRECT_DOCUMENT.RECEIPT,
      baseId: paymentId,
      desired: null,
      reverseJournalId
    });
  }

  const date = payment.succeeded_at ?? payment.initiated_at;
  const treasury = await resolveTreasuryAccountTx(tx, tenantId, {
    method: payment.method,
    mmOperator: payment.mm_operator,
    treasuryAccountId: payment.treasury_account_id
  });
  const clients = await ensureChartAccountTx(
    tx,
    tenantId,
    DIRECT_ACCOUNTS.clients.number,
    DIRECT_ACCOUNTS.clients.name,
    DIRECT_ACCOUNTS.clients.type
  );
  const renterClientId = payment.renter_client_id ?? payment.lease?.primary_renter_client_id ?? null;
  const renterAccount = renterClientId ? await getOrCreateTenantAccountTx(tx, tenantId, renterClientId) : null;
  const label = isDeposit
    ? `Dépôt de garantie encaissé — règlement ${refOf(payment.id)}`
    : `Loyer encaissé — règlement ${refOf(payment.id)}`;
  // Dépôt : dette envers le locataire (165), ni créance 411 ni avance.
  const creditLine: JournalLineInput = isDeposit
    ? {
        accountId: await ensureChartAccountTx(
          tx,
          tenantId,
          DIRECT_ACCOUNTS.depositsReceived.number,
          DIRECT_ACCOUNTS.depositsReceived.name,
          DIRECT_ACCOUNTS.depositsReceived.type
        ),
        credit: amount,
        label
      }
    : { accountId: clients, credit: amount, label, thirdPartyAccountId: renterAccount?.id ?? null };

  return settlePieceTx(tx, {
    tenantId,
    documentType: DIRECT_DOCUMENT.RECEIPT,
    baseId: paymentId,
    reverseJournalId,
    desired: {
      entryDate: date,
      reference: `ENC-${refOf(payment.id)}`,
      description: label,
      journalId: await journalFor(tx, tenantId, date, treasury.journal),
      lines: [{ accountId: treasury.chartOfAccountId, debit: amount, label }, creditLine]
    }
  });
}

// ---------------------------------------------------------------------------
// 1 bis. Sortie d'un dépôt de garantie : 165 / trésorerie (remboursement) ou 758 (retenue)
// ---------------------------------------------------------------------------

/**
 * Écriture d'un mouvement REFUND ou FORFEIT d'un dépôt de garantie, sur un bail
 * de gestion directe. Une seule pièce par mouvement (clé = id du mouvement,
 * idempotente). Les autres mouvements (COLLECT : voir le règlement ; HOLD,
 * RELEASE, ADJUSTMENT : sans mouvement d'argent) n'écrivent rien.
 */
export async function syncDirectDepositMovementEntryTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  movementId: string
) {
  const movement = await tx.rentalDepositMovement.findFirst({
    where: { id: movementId, tenant_id: tenantId },
    select: {
      id: true,
      type: true,
      amount: true,
      created_at: true,
      treasury_account_id: true,
      deposit: { select: { lease_id: true } }
    }
  });
  const reverseJournalId = () => journalFor(tx, tenantId, new Date(), 'GENERAL');
  const none = { tenantId, documentType: DIRECT_DOCUMENT.DEPOSIT, baseId: movementId, desired: null, reverseJournalId };
  const amount = roundMoney(Number(movement?.amount ?? 0));

  if (
    !movement ||
    (movement.type !== 'REFUND' && movement.type !== 'FORFEIT') ||
    !(amount > 0) ||
    !(await isDirectLeaseTx(tx, tenantId, movement.deposit.lease_id))
  ) {
    return settlePieceTx(tx, none);
  }

  const deposits = await ensureChartAccountTx(
    tx,
    tenantId,
    DIRECT_ACCOUNTS.depositsReceived.number,
    DIRECT_ACCOUNTS.depositsReceived.name,
    DIRECT_ACCOUNTS.depositsReceived.type
  );
  const date = movement.created_at;

  if (movement.type === 'REFUND') {
    const treasury = await resolveTreasuryAccountTx(tx, tenantId, {
      method: 'CASH',
      treasuryAccountId: movement.treasury_account_id
    });
    const label = `Dépôt de garantie remboursé — mouvement ${refOf(movement.id)}`;
    return settlePieceTx(tx, {
      tenantId,
      documentType: DIRECT_DOCUMENT.DEPOSIT,
      baseId: movementId,
      reverseJournalId,
      desired: {
        entryDate: date,
        reference: `DEP-REM-${refOf(movement.id)}`,
        description: label,
        journalId: await journalFor(tx, tenantId, date, treasury.journal),
        lines: [
          { accountId: deposits, debit: amount, label },
          { accountId: treasury.chartOfAccountId, credit: amount, label }
        ]
      }
    });
  }

  const income = await ensureChartAccountTx(
    tx,
    tenantId,
    DIRECT_ACCOUNTS.miscIncome.number,
    DIRECT_ACCOUNTS.miscIncome.name,
    DIRECT_ACCOUNTS.miscIncome.type
  );
  const label = `Dépôt de garantie conservé — mouvement ${refOf(movement.id)}`;
  return settlePieceTx(tx, {
    tenantId,
    documentType: DIRECT_DOCUMENT.DEPOSIT,
    baseId: movementId,
    reverseJournalId,
    desired: {
      entryDate: date,
      reference: `DEP-RET-${refOf(movement.id)}`,
      description: label,
      journalId: await journalFor(tx, tenantId, date, 'GENERAL'),
      lines: [
        { accountId: deposits, debit: amount, label },
        { accountId: income, credit: amount, label }
      ]
    }
  });
}

// ---------------------------------------------------------------------------
// 2. Mouvements de créance du locataire : 411 / produit
// ---------------------------------------------------------------------------

/** Mouvements du compte locataire qui constatent un produit (le reste est de la trésorerie, voir en-tête). */
const BILLING_SOURCES = new Set(['RENTAL_INSTALLMENT', 'RENTAL_PENALTY', 'LEASE_REVISION']);
const BILLING_TYPES = new Set(['INSTALLMENT', 'PENALTY', 'WAIVER', 'VOID', 'ADJUSTMENT']);

export interface RenterMovementLike {
  id: string;
  accountId: string;
  type: string;
  sourceType: string;
  leaseId?: string | null;
  debit?: unknown;
  credit?: unknown;
  movementDate: Date;
  label?: string | null;
}

/**
 * Projette un mouvement de créance du compte d'un locataire au journal :
 * débit → débit 411 / crédit produit ; crédit → l'inverse. Une seule
 * écriture par mouvement, jamais modifiée (un mouvement ne l'est pas non plus).
 */
export async function syncDirectRenterMovementEntryTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  movement: RenterMovementLike
): Promise<boolean> {
  if (!BILLING_TYPES.has(movement.type) || !BILLING_SOURCES.has(movement.sourceType) || !movement.leaseId) return false;
  const debit = roundMoney(Number(movement.debit ?? 0));
  const credit = roundMoney(Number(movement.credit ?? 0));
  const amount = debit > 0 ? debit : credit;
  if (!(amount > 0) || (debit > 0 && credit > 0)) return false;
  if (!(await isDirectLeaseTx(tx, tenantId, movement.leaseId))) return false;

  const already = await tx.journalEntry.findFirst({
    where: { tenantId, documentType: DIRECT_DOCUMENT.BILLING, documentId: movement.id },
    select: { id: true }
  });
  if (already) return false;

  const productSpec =
    movement.sourceType === 'RENTAL_PENALTY' ? DIRECT_ACCOUNTS.penaltyIncome : DIRECT_ACCOUNTS.rentIncome;
  const [clients, product] = await Promise.all([
    ensureChartAccountTx(
      tx,
      tenantId,
      DIRECT_ACCOUNTS.clients.number,
      DIRECT_ACCOUNTS.clients.name,
      DIRECT_ACCOUNTS.clients.type
    ),
    ensureChartAccountTx(tx, tenantId, productSpec.number, productSpec.name, productSpec.type)
  ]);
  const label = movement.label?.trim() || 'Loyer';
  const clientLine: JournalLineInput = {
    accountId: clients,
    label,
    thirdPartyAccountId: movement.accountId,
    ...(debit > 0 ? { debit: amount } : { credit: amount })
  };
  const productLine: JournalLineInput = {
    accountId: product,
    label,
    ...(debit > 0 ? { credit: amount } : { debit: amount })
  };

  await postDocumentEntryTx(tx, {
    tenantId,
    journalId: await journalFor(tx, tenantId, movement.movementDate, 'GENERAL'),
    entryDate: movement.movementDate,
    reference: `LOC-${refOf(movement.id)}`,
    description: label,
    documentType: DIRECT_DOCUMENT.BILLING as never,
    documentId: movement.id,
    lines: [clientLine, productLine]
  });
  return true;
}

// ---------------------------------------------------------------------------
// 3. Dépense d'un bien détenu en propre : charge / trésorerie (ou 401)
// ---------------------------------------------------------------------------

/**
 * Rend l'écriture d'une dépense conforme à son état : dépense d'un bien de
 * gestion directe → débit charge / crédit trésorerie réelle (401 si l'agence
 * doit la facture) ; dépense supprimée, ou bien qui n'est plus en gestion
 * directe → contre-passation. Une dépense modifiée est contre-passée puis
 * réécrite.
 */
export async function syncDirectExpenseEntryTx(tx: PrismaTransactionClient, tenantId: string, expenseId: string) {
  const expense = await tx.propertyExpense.findFirst({
    where: { id: expenseId, tenantId },
    select: {
      id: true,
      propertyId: true,
      category: true,
      label: true,
      amount: true,
      paidAt: true,
      isCapitalized: true,
      paymentMethod: true,
      treasuryAccountId: true,
      agencyIsBuyer: true,
      supplierName: true
    }
  });
  const reverseJournalId = () => journalFor(tx, tenantId, new Date(), 'GENERAL');
  const none = { tenantId, documentType: DIRECT_DOCUMENT.EXPENSE, baseId: expenseId, desired: null, reverseJournalId };

  if (!expense) return settlePieceTx(tx, none);
  const amount = roundMoney(Number(expense.amount ?? 0));
  if (!(amount > 0) || !(await directPropertyIdsTx(tx, tenantId, [expense.propertyId])).has(expense.propertyId)) {
    return settlePieceTx(tx, none);
  }

  const chargeSpec = expense.isCapitalized
    ? {
        number: DIRECT_ACCOUNTS.buildings.number,
        name: DIRECT_ACCOUNTS.buildings.name,
        type: DIRECT_ACCOUNTS.buildings.type
      }
    : { ...(EXPENSE_ACCOUNTS[expense.category] ?? EXPENSE_ACCOUNTS.OTHER), type: 'EXPENSE' as const };
  const charge = await ensureChartAccountTx(tx, tenantId, chargeSpec.number, chargeSpec.name, chargeSpec.type);
  const label = `Dépense — ${expense.label}`;

  let creditAccountId: string;
  let journalType: 'GENERAL' | 'CASH' | 'BANK' = 'GENERAL';
  let creditLabel = label;
  if (expense.agencyIsBuyer) {
    creditAccountId = await ensureChartAccountTx(
      tx,
      tenantId,
      DIRECT_ACCOUNTS.suppliers.number,
      DIRECT_ACCOUNTS.suppliers.name,
      DIRECT_ACCOUNTS.suppliers.type
    );
    if (expense.supplierName) creditLabel = `${label} — ${expense.supplierName}`;
  } else {
    const treasury = await resolveTreasuryAccountTx(tx, tenantId, {
      method: expense.paymentMethod ?? 'CASH',
      treasuryAccountId: expense.treasuryAccountId
    });
    creditAccountId = treasury.chartOfAccountId;
    journalType = treasury.journal;
  }

  return settlePieceTx(tx, {
    tenantId,
    documentType: DIRECT_DOCUMENT.EXPENSE,
    baseId: expenseId,
    reverseJournalId,
    desired: {
      entryDate: expense.paidAt,
      reference: `DEP-${refOf(expense.id)}`,
      description: label,
      journalId: await journalFor(tx, tenantId, expense.paidAt, journalType),
      lines: [
        { accountId: charge, debit: amount, label },
        { accountId: creditAccountId, credit: amount, label: creditLabel }
      ]
    }
  });
}
