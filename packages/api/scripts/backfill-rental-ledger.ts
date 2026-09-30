/**
 * Rattrapage de la comptabilité de la gestion locative directe
 * (BUG-2026-09-30-058).
 *
 * Rejoue, pour chaque agence (ou une seule avec `--tenant=<id>`), les écritures
 * que la gestion directe n'a jamais passées :
 *
 * 1. les mouvements de créance des locataires (échéances, pénalités, remises,
 *    annulations, révisions) : débit 411 / crédit 7083 ou 7088 ;
 * 2. les encaissements de loyer (règlements SUCCESS) : débit trésorerie réelle /
 *    crédit 411 — c'est ce qui rend à la caisse ou à la banque ce qui y est
 *    entré ;
 * 2 bis. les dépôts de garantie (À VALIDER PAR LA COMPTABILITÉ) : l'encaissement
 *    d'un dépôt est reclassé en débit trésorerie / crédit 165 (et non 411),
 *    l'« avance reçue » qu'il avait créée au compte du locataire est retirée
 *    (contre-passation), puis chaque remboursement passe en débit 165 / crédit
 *    trésorerie et chaque retenue en débit 165 / crédit 758 ;
 * 3. les dépenses des biens détenus en propre : débit charge / crédit
 *    trésorerie (ou 401) ; celles que l'ancienne règle avait passées au 4731
 *    d'un propriétaire sont contre-passées par la synchronisation du compte
 *    de ce propriétaire (étape 4, `--apply` seulement).
 *
 * SIMULATION PAR DÉFAUT : sans `--apply`, tout est exécuté dans une transaction
 * qui est ANNULÉE à la fin — mêmes règles, mêmes comptes créés puis défaits —
 * et le rapport dit ce qui serait écrit. Avec `--apply`, la transaction de
 * chaque agence est validée.
 *
 * Idempotent : chaque pièce est unique par (nature, pièce). Relancer ne fait
 * rien de plus ; une pièce modifiée depuis est contre-passée puis réécrite.
 * Une agence en échec n'interrompt pas les suivantes (sa transaction est
 * annulée en entier : jamais d'écriture partielle).
 *
 * Usage :
 *   npx ts-node packages/api/scripts/backfill-rental-ledger.ts
 *   npx ts-node packages/api/scripts/backfill-rental-ledger.ts --tenant=<id> --apply
 *   npx ts-node packages/api/scripts/backfill-rental-ledger.ts --json
 *   (--allow-production pour lever le refus sous NODE_ENV=production)
 */

import { prisma } from '../src/utils/database';
import {
  DIRECT_ACCOUNTS,
  DIRECT_DOCUMENT,
  directPropertyIdsTx,
  syncDirectDepositMovementEntryTx,
  syncDirectExpenseEntryTx,
  syncDirectRentPaymentEntryTx,
  syncDirectRenterMovementEntryTx
} from '../src/lib/finance/rental-direct-ledger';
import { syncOwnerAccount } from '../src/lib/owner-account/sync';
import { retirerAvanceDuDepotTx } from '../src/services/rental-deposit-service';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const JSON_ONLY = args.includes('--json');
const TENANT_ARG = args.find(a => a.startsWith('--tenant='))?.slice('--tenant='.length);

if (process.env.NODE_ENV === 'production' && !args.includes('--allow-production')) {
  console.error('Refus de tourner : NODE_ENV=production (ajouter --allow-production en connaissance de cause).');
  process.exit(1);
}

class Rollback extends Error {
  constructor(public stats: TenantStats) {
    super('rollback-simulation');
  }
}

interface TenantStats {
  tenantId: string;
  tenantName: string;
  movementEntries: number;
  receiptEntries: number;
  expenseEntries: number;
  depositEntries: number;
  expenseReversedOrRewritten: number;
  treasuryDebit: number;
  clientsBalance: number;
  renterAccountsBalance: number;
  ownersToResync: string[];
  error?: string;
}

const countEntries = (tx: any, tenantId: string, documentType: string) =>
  tx.journalEntry.count({ where: { tenantId, documentType } });

async function processTenant(tx: any, tenantId: string, tenantName: string): Promise<TenantStats> {
  const before = {
    movement: await countEntries(tx, tenantId, DIRECT_DOCUMENT.BILLING),
    receipt: await countEntries(tx, tenantId, DIRECT_DOCUMENT.RECEIPT),
    expense: await countEntries(tx, tenantId, DIRECT_DOCUMENT.EXPENSE),
    deposit: await countEntries(tx, tenantId, DIRECT_DOCUMENT.DEPOSIT),
    voids: await countEntries(tx, tenantId, 'OWNER_VOID')
  };

  // 1. Créances des locataires.
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
  for (const movement of movements) {
    await syncDirectRenterMovementEntryTx(tx, tenantId, movement);
  }

  // 2 bis (avant les encaissements) : un règlement de dépôt n'est pas une avance.
  const collects = await tx.rentalDepositMovement.findMany({
    where: { tenant_id: tenantId, type: 'COLLECT', payment_id: { not: null } },
    select: { payment_id: true }
  });
  for (const collect of collects) {
    await retirerAvanceDuDepotTx(tx, tenantId, collect.payment_id);
  }

  // 2. Encaissements (un règlement de dépôt est reclassé trésorerie / 165).
  const payments = await tx.rentalPayment.findMany({
    where: { tenant_id: tenantId, lease_id: { not: null } },
    orderBy: { initiated_at: 'asc' },
    select: { id: true }
  });
  for (const payment of payments) {
    await syncDirectRentPaymentEntryTx(tx, tenantId, payment.id);
  }

  // 2 ter. Sorties de dépôt : remboursements et retenues.
  const depositOuts = await tx.rentalDepositMovement.findMany({
    where: { tenant_id: tenantId, type: { in: ['REFUND', 'FORFEIT'] } },
    orderBy: { created_at: 'asc' },
    select: { id: true }
  });
  for (const out of depositOuts) {
    await syncDirectDepositMovementEntryTx(tx, tenantId, out.id);
  }

  // 3. Dépenses des biens en gestion directe.
  const expenses = await tx.propertyExpense.findMany({
    where: { tenantId },
    orderBy: { paidAt: 'asc' },
    select: { id: true, propertyId: true }
  });
  for (const expense of expenses) {
    await syncDirectExpenseEntryTx(tx, tenantId, expense.id);
  }

  // Propriétaires dont le compte porte encore une dépense de bien en gestion directe.
  const direct = await directPropertyIdsTx(
    tx,
    tenantId,
    expenses.map((e: any) => e.propertyId)
  );
  const directExpenseIds = expenses.filter((e: any) => direct.has(e.propertyId)).map((e: any) => e.id);
  const ownerMoves = directExpenseIds.length
    ? await tx.thirdPartyMovement.findMany({
        where: {
          tenantId,
          sourceType: 'OWNER_EXPENSE',
          type: 'EXPENSE',
          OR: directExpenseIds.map((id: string) => ({ sourceId: { startsWith: id } }))
        },
        select: { account: { select: { tenantClientId: true } } }
      })
    : [];
  const ownersToResync = Array.from(
    new Set(ownerMoves.map((m: any) => m.account?.tenantClientId).filter(Boolean) as string[])
  );

  const after = {
    movement: await countEntries(tx, tenantId, DIRECT_DOCUMENT.BILLING),
    receipt: await countEntries(tx, tenantId, DIRECT_DOCUMENT.RECEIPT),
    expense: await countEntries(tx, tenantId, DIRECT_DOCUMENT.EXPENSE),
    deposit: await countEntries(tx, tenantId, DIRECT_DOCUMENT.DEPOSIT),
    voids: await countEntries(tx, tenantId, 'OWNER_VOID')
  };

  // Contrôle de cohérence : solde du 411 au journal vs comptes des locataires.
  const [clients, treasury, accounts] = await Promise.all([
    tx.chartOfAccount.findFirst({
      where: { tenantId, scope: 'OPERATIONS', accountNumber: DIRECT_ACCOUNTS.clients.number },
      select: { id: true }
    }),
    tx.treasuryAccount.findMany({ where: { tenantId }, select: { chartOfAccountId: true } }),
    tx.thirdPartyAccount.aggregate({ where: { tenantId, kind: 'TENANT' }, _sum: { balance: true } })
  ]);
  const sum = async (accountIds: string[]) => {
    if (accountIds.length === 0) return { debit: 0, credit: 0 };
    const agg = await tx.journalEntryLine.aggregate({
      where: { accountId: { in: accountIds }, entry: { tenantId } },
      _sum: { debit: true, credit: true }
    });
    return { debit: Number(agg._sum.debit ?? 0), credit: Number(agg._sum.credit ?? 0) };
  };
  const clientsSum = await sum(clients ? [clients.id] : []);
  const treasurySum = await sum(treasury.map((t: any) => t.chartOfAccountId));

  return {
    tenantId,
    tenantName,
    movementEntries: after.movement - before.movement,
    receiptEntries: after.receipt - before.receipt,
    expenseEntries: after.expense - before.expense,
    depositEntries: after.deposit - before.deposit,
    expenseReversedOrRewritten: after.voids - before.voids,
    treasuryDebit: treasurySum.debit - treasurySum.credit,
    clientsBalance: clientsSum.debit - clientsSum.credit,
    renterAccountsBalance: Number(accounts._sum.balance ?? 0),
    ownersToResync
  };
}

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: TENANT_ARG ? { id: TENANT_ARG } : {},
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  });
  if (TENANT_ARG && tenants.length === 0) {
    console.error(`Refus de tourner : agence introuvable (${TENANT_ARG}).`);
    process.exit(1);
  }

  const results: TenantStats[] = [];
  for (const tenant of tenants) {
    let stats: TenantStats | undefined;
    try {
      await prisma.$transaction(
        async tx => {
          const s = await processTenant(tx, tenant.id, tenant.name);
          if (!APPLY) throw new Rollback(s);
          stats = s;
        },
        { timeout: 600_000, maxWait: 30_000 }
      );
    } catch (error: any) {
      if (error instanceof Rollback) stats = error.stats;
      else stats = { ...emptyStats(tenant.id, tenant.name), error: error?.message ?? String(error) };
    }
    if (!stats) continue;

    // Étape 4, seulement à l'écriture : les comptes propriétaires contre-passent
    // leurs anciennes écritures 4731 de dépenses de biens en gestion directe.
    if (APPLY && !stats.error) {
      for (const ownerClientId of stats.ownersToResync) {
        try {
          await syncOwnerAccount(tenant.id, ownerClientId);
        } catch (error: any) {
          stats.error = `synchronisation du propriétaire ${ownerClientId} : ${error?.message ?? error}`;
        }
      }
    }
    const touched =
      stats.movementEntries +
      stats.receiptEntries +
      stats.expenseEntries +
      stats.depositEntries +
      stats.expenseReversedOrRewritten;
    if (touched > 0 || stats.ownersToResync.length > 0 || stats.error) results.push(stats);
    if (!JSON_ONLY && (touched > 0 || stats.error)) {
      console.log(
        `${tenant.name} (${tenant.id}) : créances ${stats.movementEntries}, encaissements ${stats.receiptEntries}, ` +
          `dépenses ${stats.expenseEntries}, sorties de dépôt ${stats.depositEntries}, contre-passations ${stats.expenseReversedOrRewritten}, ` +
          `trésorerie ${stats.treasuryDebit}, 411 ${stats.clientsBalance} (comptes locataires ${stats.renterAccountsBalance})` +
          (stats.error ? ` — ÉCHEC : ${stats.error}` : '')
      );
    }
  }

  const summary = { mode: APPLY ? 'apply' : 'simulation', tenantsScanned: tenants.length, tenantsTouched: results };
  if (JSON_ONLY) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log('');
    console.log(
      APPLY
        ? `Écritures posées pour ${results.length} agence(s) sur ${tenants.length}.`
        : `SIMULATION (rien n'est écrit) : ${results.length} agence(s) sur ${tenants.length} seraient modifiées. Relancer avec --apply pour écrire.`
    );
  }
  await prisma.$disconnect();
  if (results.some(r => r.error)) process.exitCode = 1;
}

function emptyStats(tenantId: string, tenantName: string): TenantStats {
  return {
    tenantId,
    tenantName,
    movementEntries: 0,
    receiptEntries: 0,
    expenseEntries: 0,
    depositEntries: 0,
    expenseReversedOrRewritten: 0,
    treasuryDebit: 0,
    clientsBalance: 0,
    renterAccountsBalance: 0,
    ownersToResync: []
  };
}

main().catch(async error => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
