/**
 * Rattrapage des dépôts de garantie et des créances d'échéances
 * (BUG-2026-09-30-058, moitié « compte du locataire »).
 *
 * 1. Dépôts de garantie : `collected_amount`, `refunded_amount`,
 *    `forfeited_amount` et `held_amount` sont recalculés depuis les mouvements
 *    (`RentalDepositMovement`). Règle en vigueur (`computeDepositBalance`) :
 *    collecté = Σ COLLECT + Σ ADJUSTMENT ; remboursé = Σ REFUND ; conservé =
 *    Σ FORFEIT ; retenu = Σ HOLD − Σ RELEASE (jamais négatif). Solde détenu =
 *    collecté − remboursé − conservé. Avant la correction, un remboursement
 *    retranchait aussi du collecté, ce qui le comptait deux fois.
 * 2. Créances d'échéances : une échéance ÉCHUE (date passée) dont le statut
 *    recalculé est DUE, OVERDUE, PARTIAL ou PAID, sans mouvement INSTALLMENT au
 *    compte du locataire, est débitée, via `recalculateInstallmentStatuses`
 *    puis `inscrireEcheanceFactureeTx` (clé d'idempotence du grand livre :
 *    aucun doublon). Une échéance à venir reste Brouillon (aucun débit daté du
 *    futur) ; les baux brouillon ou annulés sont ignorés ; une échéance déjà
 *    repricée par une révision de loyer (ajustement `LEASE_REVISION` écrit)
 *    n'est pas débitée (elle est comptée à part : à traiter à la main). Le
 *    mouvement passe au journal pour un bail de gestion directe (hook de
 *    `appendThirdPartyMovementTx`).
 *
 * SIMULATION PAR DÉFAUT : sans `--apply`, seuls des comptes rendus sont
 * produits. Idempotent : relancer ne change plus rien.
 *
 * Usage :
 *   npx ts-node packages/api/scripts/backfill-rental-deposits.ts
 *   npx ts-node packages/api/scripts/backfill-rental-deposits.ts --tenant=<id> --apply
 *   (--json pour une sortie machine, --allow-production pour lever le refus)
 */

import { RentalInstallmentStatus } from '@prisma/client';
import { prisma } from '../src/utils/database';
import { computeInstallmentStatus } from '../src/lib/finance/installment-status';
import {
  isLeaseAlive,
  repricedInstallmentIds,
  selectInstallmentsToDebit
} from '../src/lib/finance/rental-backfill-rules';
import { inscrireEcheanceFactureeTx, recalculateInstallmentStatuses } from '../src/services/rental-installment-service';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const JSON_ONLY = args.includes('--json');
const TENANT_ARG = args.find(a => a.startsWith('--tenant='))?.slice('--tenant='.length);

if (process.env.NODE_ENV === 'production' && !args.includes('--allow-production')) {
  console.error('Refus de tourner : NODE_ENV=production (ajouter --allow-production en connaissance de cause).');
  process.exit(1);
}

const round = (n: number) => Math.round(n * 100) / 100;

interface DepositFix {
  depositId: string;
  leaseId: string;
  before: { collected: number; refunded: number; forfeited: number; held: number };
  after: { collected: number; refunded: number; forfeited: number; held: number };
}

async function fixDeposits(tenantId: string): Promise<DepositFix[]> {
  const deposits = await prisma.rentalSecurityDeposit.findMany({
    where: { tenant_id: tenantId },
    select: {
      id: true,
      lease_id: true,
      collected_amount: true,
      refunded_amount: true,
      forfeited_amount: true,
      held_amount: true,
      movements: { select: { type: true, amount: true } }
    }
  });
  const fixes: DepositFix[] = [];
  for (const deposit of deposits) {
    const sum = (types: string[]) =>
      round(deposit.movements.filter(m => types.includes(m.type)).reduce((s, m) => s + Number(m.amount), 0));
    const after = {
      collected: sum(['COLLECT', 'ADJUSTMENT']),
      refunded: sum(['REFUND']),
      forfeited: sum(['FORFEIT']),
      held: Math.max(0, round(sum(['HOLD']) - sum(['RELEASE'])))
    };
    const before = {
      collected: round(Number(deposit.collected_amount)),
      refunded: round(Number(deposit.refunded_amount)),
      forfeited: round(Number(deposit.forfeited_amount)),
      held: round(Number(deposit.held_amount))
    };
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    fixes.push({ depositId: deposit.id, leaseId: deposit.lease_id, before, after });
    if (APPLY) {
      await prisma.rentalSecurityDeposit.update({
        where: { id: deposit.id, tenant_id: tenantId },
        data: {
          collected_amount: after.collected,
          refunded_amount: after.refunded,
          forfeited_amount: after.forfeited,
          held_amount: after.held
        }
      });
    }
  }
  return fixes;
}

async function fixInstallments(tenantId: string) {
  const now = new Date();
  const installments = await prisma.rentalInstallment.findMany({
    where: { tenant_id: tenantId, status: { not: RentalInstallmentStatus.CANCELED } },
    select: {
      id: true,
      lease_id: true,
      status: true,
      lease: { select: { status: true } },
      due_date: true,
      period_year: true,
      period_month: true,
      amount_rent: true,
      amount_service: true,
      amount_other_fees: true,
      penalty_amount: true,
      amount_paid: true
    }
  });
  const debited = new Set(
    (
      await prisma.thirdPartyMovement.findMany({
        where: { tenantId, sourceType: 'RENTAL_INSTALLMENT', type: 'INSTALLMENT' },
        select: { sourceId: true }
      })
    ).map(m => m.sourceId)
  );

  const repriced = repricedInstallmentIds(
    (
      await prisma.thirdPartyMovement.findMany({
        where: { tenantId, sourceType: 'LEASE_REVISION' },
        select: { sourceId: true }
      })
    ).map(m => m.sourceId)
  );

  const statusChanges = installments.filter(
    i => isLeaseAlive(i) && computeInstallmentStatus(i, now, { emitDraft: false }) !== i.status
  );
  const { toDebit: missingDebits, skippedRepriced } = selectInstallmentsToDebit(installments, now, {
    debited,
    repriced
  });

  let recalculated = 0;
  let debitsPosted = 0;
  if (APPLY) {
    for (const leaseId of new Set(statusChanges.map(i => i.lease_id))) {
      recalculated += await recalculateInstallmentStatuses(tenantId, leaseId);
    }
    // Échéances déjà exigibles en base mais jamais débitées.
    const fresh = await prisma.rentalInstallment.findMany({
      where: { tenant_id: tenantId, id: { in: missingDebits.map(i => i.id) } }
    });
    for (const installment of fresh) {
      await prisma.$transaction(async tx => {
        const movement = await inscrireEcheanceFactureeTx(tx, tenantId, installment);
        if (movement) debitsPosted += 1;
      });
    }
  }
  return {
    statusChanges: statusChanges.length,
    missingDebits: missingDebits.length,
    skippedRepriced: skippedRepriced.length,
    recalculated,
    debitsPosted
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

  const report: any[] = [];
  for (const tenant of tenants) {
    try {
      const deposits = await fixDeposits(tenant.id);
      const installments = await fixInstallments(tenant.id);
      if (deposits.length || installments.statusChanges || installments.missingDebits) {
        report.push({ tenantId: tenant.id, tenantName: tenant.name, deposits, installments });
        if (!JSON_ONLY) {
          console.log(
            `${tenant.name} (${tenant.id}) : dépôts corrigés ${deposits.length}, échéances à requalifier ${installments.statusChanges}, ` +
              `débits manquants ${installments.missingDebits}` +
              (installments.skippedRepriced ? `, repricées ignorées ${installments.skippedRepriced}` : '') +
              (APPLY ? ` (posés ${installments.debitsPosted}, statuts changés ${installments.recalculated})` : '')
          );
          for (const fix of deposits) {
            console.log(
              `   dépôt ${fix.depositId} : collecté ${fix.before.collected} -> ${fix.after.collected}, ` +
                `remboursé ${fix.before.refunded} -> ${fix.after.refunded}, conservé ${fix.before.forfeited} -> ${fix.after.forfeited}`
            );
          }
        }
      }
    } catch (error: any) {
      report.push({ tenantId: tenant.id, tenantName: tenant.name, error: error?.message ?? String(error) });
      if (!JSON_ONLY) console.log(`${tenant.name} (${tenant.id}) : ÉCHEC — ${error?.message ?? error}`);
    }
  }

  if (JSON_ONLY) console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'simulation', report }, null, 2));
  else {
    console.log('');
    console.log(
      APPLY
        ? `Terminé : ${report.length} agence(s) concernée(s).`
        : `SIMULATION (rien n'est écrit) : ${report.length} agence(s) concernée(s). Relancer avec --apply pour écrire.`
    );
  }
  await prisma.$disconnect();
  if (report.some(r => r.error)) process.exitCode = 1;
}

main().catch(async error => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
