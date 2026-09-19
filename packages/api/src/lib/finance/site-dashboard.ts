/**
 * Tableau de bord des chantiers — lot 3, volet pilotage.
 *
 * Implémente `GetSitesDashboard` du contrat gelé (`./types-lot3.ts`).
 *
 * **En un seul appel, agrégé en SQL, jamais une requête par chantier.** Même
 * discipline que `listConstructionSites` (`sites.ts`, lot 2) pour le coût
 * réel : une lecture des chantiers, puis des agrégations groupées
 * (`groupBy`/`aggregate`) pour chaque grandeur calculée, jamais une boucle qui
 * relit une table par identifiant. Le nombre de requêtes émises ici ne dépend
 * QUE du nombre de sources de données distinctes (chantiers, budgets validés,
 * lignes de budget, avenants validés, imputations, bons de commande, lignes
 * de bon, factures, alertes ouvertes), jamais du nombre de chantiers renvoyés
 * — c'est le facteur trente mesuré par le banc de charge du lot 0 entre les
 * deux approches (`data-model.md` §5).
 *
 * `getRevisedBudgetTotals` et `getSiteEngagementTotals` (`budget-alerts.ts`)
 * portent déjà cette discipline batchée : ce fichier les réutilise telles
 * quelles plutôt que de recalculer une troisième fois le budget révisé et
 * l'engagé — voir l'en-tête de `budget-alerts.ts` pour la raison pour
 * laquelle ces deux formules sont dupliquées une fois (et une seule) au lieu
 * d'appeler `GetSiteEngagement`, hors du territoire de cet agent.
 */

import { prisma } from '../../utils/database';
import { getRevisedBudgetTotals, getSiteEngagementTotals, toSiteBudgetAlertRecord } from './budget-alerts';
import { roundMoneyXof, roundPercent } from './money';
import type { GetSitesDashboard, SiteDashboardRow } from './types-lot3';

/** Devise unique du lot (voir `sites.ts`, lot 2) : jamais stockée par chantier. */
const CURRENCY = 'XOF';

/** Voir `GetSitesDashboard` dans `./types-lot3.ts`. */
export const getSitesDashboard: GetSitesDashboard = async (tenantId, filters) => {
  const sites = await prisma.constructionSite.findMany({
    where: {
      tenantId,
      ...(filters?.status ? { status: filters.status as any } : {})
    },
    orderBy: [{ createdAt: 'desc' }]
  });

  if (sites.length === 0) {
    return { rows: [], currency: CURRENCY };
  }

  const siteIds = sites.map((site: Record<string, any>) => site.id as string);

  // Un chantier n'a au plus qu'un seul budget validé à la fois (index partiel
  // `site_budgets_one_validated_per_site`) : cette recherche donne donc, pour
  // chaque chantier, zéro ou un budget, jamais plus.
  const validatedBudgets = await prisma.siteBudget.findMany({
    where: { tenantId, siteId: { in: siteIds }, status: 'VALIDATED' },
    select: { id: true, siteId: true }
  });
  const budgetIdBySite = new Map<string, string>(
    validatedBudgets.map((budget: Record<string, any>) => [budget.siteId as string, budget.id as string])
  );
  const budgetIds = validatedBudgets.map((budget: Record<string, any>) => budget.id as string);

  const [revisedTotals, engagementTotals, openAlerts] = await Promise.all([
    getRevisedBudgetTotals(prisma, budgetIds),
    getSiteEngagementTotals(prisma, tenantId, siteIds),
    // Au plus une alerte non acquittée par budget (index partiel
    // `site_budget_alerts_one_open_per_budget`), et au plus un budget validé
    // par chantier : donc au plus une alerte ouverte par chantier ici.
    prisma.siteBudgetAlert.findMany({
      where: { tenantId, siteId: { in: siteIds }, acknowledgedAt: null },
      include: { site: { select: { name: true } } }
    })
  ]);

  const alertBySite = new Map(
    (openAlerts as Array<Record<string, any>>).map(alert => [alert.siteId as string, toSiteBudgetAlertRecord(alert)])
  );

  const rows: SiteDashboardRow[] = sites.map((site: Record<string, any>) => {
    const budgetId = budgetIdBySite.get(site.id as string);
    const totals = budgetId ? revisedTotals.get(budgetId) : undefined;
    const initialBudget = totals ? totals.initialTotal : null;
    const revisedBudget = totals ? totals.revisedTotal : null;

    const engagement = engagementTotals.get(site.id as string);
    const engagedAmount = engagement?.engagedAmount ?? 0;
    const actualCost = engagement?.actualCost ?? 0;

    // Contre le budget RÉVISÉ, jamais l'initial : c'est l'enveloppe réellement
    // accordée (`types-lot3.ts`, `SiteDashboardRow.variance`). L'écart contre
    // l'initial se lit en comparant les deux colonnes que la ligne porte
    // toutes les deux.
    const variance = revisedBudget != null ? roundMoneyXof(revisedBudget - engagedAmount) : null;
    const variancePercent =
      revisedBudget != null && revisedBudget !== 0 && variance != null
        ? roundPercent((variance / revisedBudget) * 100)
        : null;

    return {
      siteId: site.id as string,
      siteLabel: site.name as string,
      zone: (site.zone as string | null) ?? null,
      status: site.status as string,
      initialBudget,
      revisedBudget,
      engagedAmount,
      actualCost,
      progressPercent: (site.progressPercent as number | null) ?? 0,
      variance,
      variancePercent,
      openAlert: alertBySite.get(site.id as string) ?? null,
      currency: CURRENCY
    };
  });

  // Dépassement : écart négatif contre le budget révisé. Un chantier sans
  // budget (`variance` nul) n'est par construction jamais « en dépassement »
  // — il n'y a rien contre quoi le mesurer.
  const filteredRows = filters?.onlyOverBudget ? rows.filter(row => row.variance != null && row.variance < 0) : rows;

  return { rows: filteredRows, currency: CURRENCY };
};
