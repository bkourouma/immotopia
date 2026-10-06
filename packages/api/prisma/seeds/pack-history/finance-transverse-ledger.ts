/**
 * Finance transverse, partie 1 : comptes de trésorerie, paramètres financiers
 * et rattrapage de la comptabilité de la gestion locative.
 *
 * Pourquoi un rattrapage : le seed de base (agence, patrimoine) crée loyers,
 * encaissements et dépenses par insertion ou par des services qui n'écrivent
 * en comptabilité que dans certains cas (gestion directe seulement). Résultat
 * constaté : des centaines d'encaissements et aucune écriture au journal. On
 * rejoue donc ici, avec les VRAIS moteurs de l'application, ce que
 * `scripts/backfill-rental-ledger.ts` fait en production :
 *
 *  - gestion directe (biens détenus en propre, sans propriétaire mandant) :
 *    créances locataires (411 / 7083), encaissements (trésorerie / 411),
 *    dépôts de garantie (165), dépenses des biens (charge / trésorerie) ;
 *  - gestion pour compte de tiers (mandats) : synchronisation de chaque compte
 *    propriétaire (`syncOwnerAccount`) : loyers encaissés (trésorerie / 4731),
 *    honoraires (4731 / 70611), dépenses, dépôts.
 *
 * Tout est idempotent (clé = nature + pièce) : une relance n'ajoute rien.
 */
import { MobileMoneyOperator, TreasuryAccountKind } from '@prisma/client';

import type { HistoryContext } from './types';

interface TreasurySpec {
  kind: TreasuryAccountKind;
  number: string;
  label: string;
  bankName?: string;
  bankAccountRef?: string;
  mmOperator?: MobileMoneyOperator;
  isDefault?: boolean;
}

/** Comptes qu'une agence ivoirienne tient après trois ans : caisse, banques, Mobile Money, chèques. */
function treasurySpecs(tag: string): TreasurySpec[] {
  const iban = (bank: string, n: number) =>
    `CI93 ${bank} 01${tag.slice(0, 4).toUpperCase()} ${String(n).padStart(8, '0')}`;
  return [
    {
      kind: TreasuryAccountKind.BANK,
      number: '5211',
      label: 'Banque principale — SGBCI',
      bankName: 'SGBCI',
      bankAccountRef: iban('CI008', 40211835),
      isDefault: true
    },
    {
      kind: TreasuryAccountKind.BANK,
      number: '5212',
      label: 'Compte d’exploitation — Ecobank',
      bankName: 'Ecobank Côte d’Ivoire',
      bankAccountRef: iban('CI059', 7714502)
    },
    {
      kind: TreasuryAccountKind.BANK,
      number: '5213',
      label: 'Compte d’épargne — NSIA Banque',
      bankName: 'NSIA Banque',
      bankAccountRef: iban('CI042', 5520917)
    },
    {
      kind: TreasuryAccountKind.MOBILE_MONEY,
      number: '5522',
      label: 'Orange Money — compte agence',
      mmOperator: MobileMoneyOperator.ORANGE,
      isDefault: true
    },
    {
      kind: TreasuryAccountKind.MOBILE_MONEY,
      number: '5523',
      label: 'MTN MoMo — compte agence',
      mmOperator: MobileMoneyOperator.MTN,
      isDefault: true
    },
    {
      kind: TreasuryAccountKind.MOBILE_MONEY,
      number: '5521',
      label: 'Wave — compte agence',
      mmOperator: MobileMoneyOperator.WAVE,
      isDefault: true
    },
    {
      kind: TreasuryAccountKind.MOBILE_MONEY,
      number: '5524',
      label: 'Moov Money — compte agence',
      mmOperator: MobileMoneyOperator.MOOV,
      isDefault: true
    },
    { kind: TreasuryAccountKind.CHECKS_TO_CASH, number: '513', label: 'Chèques à encaisser', isDefault: true }
  ];
}

/**
 * Comptes de trésorerie : banques, Mobile Money, chèques. Idempotent par numéro
 * de compte (la caisse 5711 existe déjà).
 */
export async function seedTreasuryAccounts(ctx: HistoryContext): Promise<number> {
  const { prisma, tenantId, log } = ctx;
  const { createAccount } = await import('../../../src/lib/treasury/service');
  const existing = await prisma.treasuryAccount.findMany({ where: { tenantId }, select: { accountNumber: true } });
  const have = new Set(existing.map(a => a.accountNumber));
  const tag = tenantId.replace(/-/g, '');
  let created = 0;
  // Les chèques à encaisser n'existent que si l'agence encaisse des loyers par chèque.
  const mmPayments = await prisma.rentalPayment.findMany({
    where: { tenant_id: tenantId, method: 'MOBILE_MONEY' },
    select: { mm_operator: true },
    distinct: ['mm_operator']
  });
  const operators = new Set(mmPayments.map(p => String(p.mm_operator)));
  const hasRentals = (await prisma.rentalPayment.count({ where: { tenant_id: tenantId } })) > 0;
  const hasChecks = (await prisma.rentalPayment.count({ where: { tenant_id: tenantId, method: 'CHECK' } })) > 0;
  for (const spec of treasurySpecs(tag)) {
    if (have.has(spec.number)) continue;
    if (spec.kind === TreasuryAccountKind.CHECKS_TO_CASH && !hasChecks) continue;
    // Un portefeuille Mobile Money n'existe que pour un opérateur réellement utilisé (Orange et MTN toujours).
    if (
      spec.kind === TreasuryAccountKind.MOBILE_MONEY &&
      hasRentals &&
      spec.mmOperator !== MobileMoneyOperator.ORANGE &&
      spec.mmOperator !== MobileMoneyOperator.MTN &&
      !operators.has(String(spec.mmOperator))
    )
      continue;
    // Une banque par défaut existe peut-être déjà (créée à la volée par un encaissement).
    const hasDefault = await prisma.treasuryAccount.findFirst({
      where: {
        tenantId,
        kind: spec.kind,
        isDefault: true,
        ...(spec.kind === TreasuryAccountKind.MOBILE_MONEY ? { mmOperator: spec.mmOperator } : {})
      },
      select: { id: true }
    });
    await createAccount(tenantId, {
      kind: spec.kind,
      label: spec.label,
      accountNumber: spec.number,
      mmOperator: spec.mmOperator ?? null,
      bankName: spec.bankName ?? null,
      bankAccountRef: spec.bankAccountRef ?? null,
      isDefault: Boolean(spec.isDefault) && !hasDefault
    });
    created += 1;
  }
  // La caisse porte un libellé parlant plutôt que « Caisse principale » seule : on le garde (déjà correct).
  if (created) log(`finance : ${created} compte(s) de trésorerie ajouté(s)`);
  return created;
}

/**
 * Paramètres financiers de l'agence (numéro de contribuable, honoraires par
 * défaut, comptes de la gestion locative). Seulement si rien n'a été paramétré.
 */
export async function seedFinanceSettings(ctx: HistoryContext): Promise<void> {
  const { prisma, tenantId, log } = ctx;
  const row = await prisma.agencyFinanceSettings.findUnique({ where: { tenantId } });
  if (!row) return;
  if (row.taxpayerNumber || row.managementFeeRate) return;
  const ncc = `${1000000 + Math.floor(ctx.rng() * 8_999_999)} ${String.fromCharCode(65 + Math.floor(ctx.rng() * 26))}`;
  await prisma.agencyFinanceSettings.update({
    where: { tenantId },
    data: {
      taxpayerNumber: ncc,
      managementFeeRate: 10,
      managementFeeMode: 'PERCENT',
      managementFeeBase: 'RENT_ONLY',
      ownerFundsAccountNumber: '4731',
      managementFeeAccountNumber: '70611',
      vatCollectedAccountNumber: '4432',
      cashShortageAccountNumber: '6588',
      cashSurplusAccountNumber: '7588',
      withholdingAccountNumber: '4478',
      updatedByUserId: ctx.adminUserId
    }
  });
  log('finance : paramètres financiers renseignés');
}

/** Compte les écritures d'un type de pièce (pour le rapport du rattrapage). */
async function countEntries(ctx: HistoryContext): Promise<number> {
  return ctx.prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } });
}

/**
 * Rattrape les écritures de la gestion locative (voir l'en-tête du fichier).
 * Sans effet quand l'agence n'a ni règlement ni dépense de bien.
 */
export async function seedRentalLedger(ctx: HistoryContext): Promise<void> {
  const { prisma, tenantId, log } = ctx;
  const [payments, expenses] = await Promise.all([
    prisma.rentalPayment.count({ where: { tenant_id: tenantId, lease_id: { not: null } } }),
    prisma.propertyExpense.count({ where: { tenantId } })
  ]);
  if (payments === 0 && expenses === 0) return;

  const [{ prisma: appPrisma }, direct, deposits, owners, ledger] = await Promise.all([
    import('../../../src/utils/database'),
    import('../../../src/lib/finance/rental-direct-ledger'),
    import('../../../src/services/rental-deposit-service'),
    import('../../../src/lib/owner-account/sync'),
    import('../../../src/lib/finance/ledger')
  ]);
  const before = await countEntries(ctx);

  // 0. Comptes de tiers des locataires (état des lieux : la gestion directe du patrimoine n'en avait
  //    jamais ouvert) : créances, règlements et pénalités sont rejoués depuis les pièces, comme le
  //    ferait `finance-backfill-tenant-accounts`. Idempotent (clé de source unique).
  const renters = await prisma.rentalLease.findMany({
    where: { tenant_id: tenantId },
    select: { primary_renter_client_id: true },
    distinct: ['primary_renter_client_id']
  });
  for (const renter of renters) {
    const clientId = renter.primary_renter_client_id as string;
    const account = await appPrisma.$transaction(tx => ledger.getOrCreateTenantAccountTx(tx, tenantId, clientId));
    if (account) await ledger.rebuildThirdPartyAccount(tenantId, account.id);
  }

  // 1. Gestion directe, dans une transaction par agence (comme le script de rattrapage).
  await appPrisma.$transaction(
    async tx => {
      const movements = await tx.thirdPartyMovement.findMany({
        where: {
          tenantId,
          account: { kind: 'TENANT' },
          leaseId: { not: null },
          sourceType: { in: ['RENTAL_INSTALLMENT', 'RENTAL_PENALTY', 'LEASE_REVISION'] },
          type: { in: ['INSTALLMENT', 'PENALTY', 'WAIVER', 'VOID', 'ADJUSTMENT'] }
        },
        orderBy: [{ movementDate: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          accountId: true,
          type: true,
          sourceType: true,
          leaseId: true,
          debit: true,
          credit: true,
          movementDate: true,
          label: true
        }
      });
      for (const movement of movements) await direct.syncDirectRenterMovementEntryTx(tx, tenantId, movement);

      const collects = await tx.rentalDepositMovement.findMany({
        where: { tenant_id: tenantId, type: 'COLLECT', payment_id: { not: null } },
        select: { payment_id: true }
      });
      for (const collect of collects) await deposits.retirerAvanceDuDepotTx(tx, tenantId, collect.payment_id as string);

      const allPayments = await tx.rentalPayment.findMany({
        where: { tenant_id: tenantId, lease_id: { not: null } },
        orderBy: { initiated_at: 'asc' },
        select: { id: true }
      });
      for (const payment of allPayments) await direct.syncDirectRentPaymentEntryTx(tx, tenantId, payment.id);

      const outs = await tx.rentalDepositMovement.findMany({
        where: { tenant_id: tenantId, type: { in: ['REFUND', 'FORFEIT'] } },
        orderBy: { created_at: 'asc' },
        select: { id: true }
      });
      for (const out of outs) await direct.syncDirectDepositMovementEntryTx(tx, tenantId, out.id);

      const exp = await tx.propertyExpense.findMany({
        where: { tenantId },
        orderBy: { paidAt: 'asc' },
        select: { id: true }
      });
      for (const e of exp) await direct.syncDirectExpenseEntryTx(tx, tenantId, e.id);
    },
    { timeout: 900_000, maxWait: 60_000 }
  );

  // 2. Gestion pour compte de tiers : un compte courant par propriétaire mandant.
  const list = await owners.listAgencyOwners(tenantId);
  // La synchronisation fait naître les honoraires, qui eux-mêmes produisent des écritures : on la rejoue
  // jusqu'à ce que plus rien ne bouge (convergence dès le premier passage, jamais de rattrapage au suivant).
  for (let round = 0; round < 4; round++) {
    const marker = await countEntries(ctx);
    for (const owner of list) {
      try {
        await owners.syncOwnerAccount(tenantId, owner.id);
      } catch (error) {
        log(`finance : synchronisation du propriétaire ${owner.id} impossible (${(error as Error).message})`);
      }
    }
    if ((await countEntries(ctx)) === marker) break;
  }

  const after = await countEntries(ctx);
  log(`finance : comptabilité locative rattrapée (+${after - before} écriture(s), ${list.length} propriétaire(s))`);
}
