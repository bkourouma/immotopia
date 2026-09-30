/**
 * Rattrapage des écritures d'encaissement des appels de charges Syndic
 * (BUG-2026-09-30-086).
 *
 * Avant le correctif, un paiement de lot ne laissait aucune écriture dans la
 * comptabilité de la copropriété (les factures et paiements de prestataires,
 * eux, en écrivaient). Ce script rejoue, pour chaque paiement existant sans
 * écriture, celle que `recordLotPaymentTx` passe désormais :
 * débit 521 Banque (571 Caisse en espèces) / crédit 450 Copropriétaires (lot).
 *
 * SIMULATION PAR DÉFAUT : sans `--apply`, tout s'exécute dans une transaction
 * ANNULÉE à la fin et le rapport dit ce qui serait écrit. Avec `--apply`, la
 * transaction de chaque agence est validée.
 *
 * Idempotent : la clé est (SYNDIC_CHARGE_PAYMENT, identifiant du paiement) ;
 * relancer ne fait rien de plus. Un paiement dont l'exercice est clos est
 * signalé (« ignoré ») et laissé tel quel. Une agence en échec n'interrompt
 * pas les suivantes : sa transaction est annulée en entier.
 *
 * Usage :
 *   npx ts-node packages/api/scripts/backfill-syndic-collection-entries.ts
 *   npx ts-node packages/api/scripts/backfill-syndic-collection-entries.ts --tenant=<id> --apply
 *   npx ts-node packages/api/scripts/backfill-syndic-collection-entries.ts --json
 *   (--allow-production pour lever le refus sous NODE_ENV=production)
 */

import { prisma } from '../src/utils/database';
import {
  CHARGE_PAYMENT_DOCUMENT_TYPE,
  postChargePaymentEntryTx
} from '../src/lib/syndics/charge-collection-accounting';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const JSON_ONLY = args.includes('--json');
const TENANT_ARG = args.find(a => a.startsWith('--tenant='))?.slice('--tenant='.length);

if (process.env.NODE_ENV === 'production' && !args.includes('--allow-production')) {
  console.error('Refus de tourner : NODE_ENV=production (ajouter --allow-production en connaissance de cause).');
  process.exit(1);
}

interface TenantStats {
  tenantId: string;
  tenantName: string;
  paymentsScanned: number;
  entriesWritten: number;
  skippedClosedYear: number;
  amount: number;
  error?: string;
}

class Rollback extends Error {
  constructor(public stats: TenantStats) {
    super('rollback-simulation');
  }
}

function emptyStats(tenantId: string, tenantName: string): TenantStats {
  return { tenantId, tenantName, paymentsScanned: 0, entriesWritten: 0, skippedClosedYear: 0, amount: 0 };
}

async function processTenant(tx: any, tenantId: string, tenantName: string): Promise<TenantStats> {
  const stats = emptyStats(tenantId, tenantName);
  const payments = await tx.chargePayment.findMany({
    where: { lot: { syndicate: { tenantId } } },
    select: {
      id: true,
      lotId: true,
      amount: true,
      paidAt: true,
      method: true,
      reference: true,
      lot: { select: { syndicateId: true } }
    },
    orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }]
  });
  stats.paymentsScanned = payments.length;
  if (payments.length === 0) return stats;

  const done = new Set<string>(
    (
      await tx.journalEntry.findMany({
        where: {
          tenantId,
          documentType: CHARGE_PAYMENT_DOCUMENT_TYPE,
          documentId: { in: payments.map((payment: { id: string }) => payment.id) }
        },
        select: { documentId: true }
      })
    ).map((entry: { documentId: string | null }) => entry.documentId as string)
  );

  for (const payment of payments) {
    if (done.has(payment.id)) continue;
    try {
      await postChargePaymentEntryTx(tx, {
        tenantId,
        syndicateId: payment.lot.syndicateId,
        lotId: payment.lotId,
        paymentId: payment.id,
        amount: Number(payment.amount),
        paidAt: payment.paidAt,
        method: payment.method,
        reference: payment.reference
      });
      stats.entriesWritten += 1;
      stats.amount += Number(payment.amount);
    } catch (error: any) {
      // Exercice clos : refus avant toute écriture, la transaction reste saine.
      if (error?.statusCode === 409) stats.skippedClosedYear += 1;
      else throw error;
    }
  }
  return stats;
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
    if (stats.entriesWritten > 0 || stats.skippedClosedYear > 0 || stats.error) results.push(stats);
    if (!JSON_ONLY && (stats.entriesWritten > 0 || stats.skippedClosedYear > 0 || stats.error)) {
      console.log(
        `${tenant.name} (${tenant.id}) : ${stats.entriesWritten} écriture(s) d'encaissement ` +
          `(${stats.amount} au total) sur ${stats.paymentsScanned} paiement(s), ` +
          `${stats.skippedClosedYear} ignoré(s) pour exercice clos` +
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

main().catch(async error => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
