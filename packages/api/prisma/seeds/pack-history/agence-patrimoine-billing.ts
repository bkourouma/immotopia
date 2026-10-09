/**
 * Échéances « émises » : la campagne de facturation du produit (`runRentBilling`)
 * fait passer les échéances Brouillon du mois en cours et du suivant à « À payer »
 * (DUE) et inscrit la créance au compte de chaque locataire. Sans cela, toutes les
 * échéances à venir restaient en Brouillon et aucune n'était « à payer ».
 *
 * La campagne d'un mois déjà journalisée (écrite par le complément locatif) est
 * rejouée pour de vrai ; sa ligne d'historique (date, libellé, bilan) est ensuite
 * remise telle qu'elle était : seule la facturation du mois suivant est nouvelle.
 */
import { runWithTenantContext } from '../../../src/utils/tenant-context';
import { neutralizeOutbound } from './types';
import type { HistoryContext } from './types';

export async function seedBillingEmission(ctx: HistoryContext): Promise<void> {
  const { prisma, tenantId, end, log } = ctx;
  const months = [0, 1].map(k => {
    const d = new Date(end.getFullYear(), end.getMonth() + k, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const issued = await prisma.rentalInstallment.count({
    where: {
      tenant_id: tenantId,
      status: 'DUE',
      OR: months.map(m => ({ period_year: m.year, period_month: m.month }))
    }
  });
  if (issued > 0) {
    log(`échéances émises : ${issued} échéance(s) déjà « À payer » sur le mois en cours et le suivant, bloc sauté.`);
    return;
  }
  neutralizeOutbound();
  const { runRentBilling } = await import('../../../src/lib/finance/billing-run');

  await runWithTenantContext({ tenantId, userId: ctx.adminUserId }, async () => {
    for (const m of months) {
      const before = await prisma.rentBillingRun.findUnique({
        where: { tenantId_periodYear_periodMonth: { tenantId, periodYear: m.year, periodMonth: m.month } }
      });
      const result = await runRentBilling(
        tenantId,
        { periodYear: m.year, periodMonth: m.month, ...(before ? { label: before.label } : {}) },
        ctx.adminUserId
      );
      if (before) {
        // La campagne du 1er du mois garde son historique d'origine.
        await prisma.rentBillingRun.update({
          where: { id: before.id, tenantId },
          data: {
            status: before.status,
            startedAt: before.startedAt,
            finishedAt: before.finishedAt,
            summary: before.summary ?? undefined
          }
        });
      }
      log(
        `échéances émises : ${m.year}-${String(m.month).padStart(2, '0')} → ${result.summary?.billed.length ?? 0} échéance(s) émise(s).`
      );
    }
  });
}
