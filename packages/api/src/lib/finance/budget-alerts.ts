/**
 * Alerte de dépassement de budget — lot 3, volet pilotage.
 *
 * Implémente `RaiseBudgetAlertIfNeededTx`, `AcknowledgeBudgetAlertTx` et
 * `ListOpenBudgetAlerts` du contrat gelé (`./types-lot3.ts`).
 *
 * ---------------------------------------------------------------------------
 * Deux grandeurs recalculées ici, jamais stockées (principe P-4)
 * ---------------------------------------------------------------------------
 *
 * Le budget révisé et l'engagé d'un chantier sont deux formules déjà écrites
 * dans le contrat gelé (`data-model.md` §2 et §3) :
 *
 *   révisé  = somme des lignes du budget validé + somme des avenants VALIDÉS
 *   engagé  = réalisé (`getSiteActualCost` du lot 2, filtre repris à l'identique)
 *           + reste à facturer des bons de commande ÉMIS et non annulés
 *
 * `GetSiteEngagement` figure au contrat gelé mais **hors du territoire confié
 * à cet agent pour cette vague** — elle appartient au volet bons de commande,
 * livré séparément. Au moment où ce fichier est écrit, aucune implémentation
 * n'existe encore ailleurs dans le dépôt : il aurait donc été impossible de
 * s'appuyer dessus sans introduire une dépendance vers un fichier absent, ce
 * qui aurait cassé la compilation en parallèle du travail de l'autre agent.
 *
 * `getRevisedBudgetTotals` et `getSiteEngagementTotals`, ci-dessous,
 * recalculent donc la même formule de façon autonome, batchée pour un ou
 * plusieurs identifiants à la fois (jamais une requête par chantier ni par
 * budget) — et sont réexportées pour que `site-dashboard.ts` les réutilise
 * plutôt que de les dupliquer une troisième fois. **C'est une duplication
 * assumée de la formule**, du même ordre que celle documentée en tête de
 * `cost-allocation.ts` pour `getSiteActualCost` : signalée au rapport de fin
 * de tâche, à résorber quand `GetSiteEngagement` existera (il suffira alors
 * de faire accepter un client Prisma — `prisma` ou `tx` — à cette dernière).
 *
 * ---------------------------------------------------------------------------
 * `consumedPercent` n'a pas de colonne
 * ---------------------------------------------------------------------------
 *
 * `SiteBudgetAlert` stocke `engagedAmount` et `budgetAmount`, figés à la levée
 * de l'alerte (« Le seuil qui était configuré au moment où l'alerte est née.
 * Figé, pour qu'un changement de seuil ne réécrive pas l'histoire » — même
 * logique pour les deux montants). `consumedPercent` s'en déduit à la lecture,
 * jamais stocké : c'est `computeConsumedPercent`, appliqué uniformément par
 * `toSiteBudgetAlertRecord`, qu'on lève l'alerte, qu'on l'acquitte ou qu'on la
 * liste.
 */

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { NotFoundError, ConflictError } from '../../middleware/error-middleware';
import { toAmountOrZero } from './types';
import { sumSiteActualCostByIds } from './site-cost';
import { roundMoneyXof, roundPercent } from './money';
import type {
  RaiseBudgetAlertIfNeededTx,
  AcknowledgeBudgetAlertTx,
  ListOpenBudgetAlerts,
  SiteBudgetAlertRecord
} from './types-lot3';

/** Devise unique du lot (voir `sites.ts`, lot 2) : jamais stockée sur l'alerte. */
const CURRENCY = 'XOF';

// ---------------------------------------------------------------------------
// consumedPercent — calculé, jamais stocké
// ---------------------------------------------------------------------------

/**
 * Part de l'engagé dans le budget révisé, en pourcentage.
 *
 * Un budget révisé nul ou négatif (avenants qui ramènent l'enveloppe à zéro,
 * voire en deçà — le contrat autorise un avenant à réduire) rend le ratio
 * habituel sans objet : diviser par zéro donnerait `Infinity`, non
 * représentable dans la colonne `Decimal(14,2)` où ce nombre finit par
 * atterrir (`SiteBudgetAlert.budgetAmount`/`engagedAmount`, pas
 * `consumedPercent` lui-même, mais la même contrainte de représentation
 * s'impose à toute valeur qu'on pourrait vouloir y stocker plus tard).
 * Faute d'arbitrage du contrat sur ce cas limite, tout engagement positif
 * contre un budget épuisé ou négatif rend zéro, et aucune alerte n'est levée
 * dans ce cas : un seuil exprimé en pourcentage d'un budget nul ne veut rien
 * dire.
 */
export function computeConsumedPercent(engagedAmount: number, revisedBudget: number): number {
  if (revisedBudget > 0) {
    return roundPercent((engagedAmount / revisedBudget) * 100);
  }

  // Budget révisé nul ou négatif : il n'existe aucune part à exprimer.
  //
  // La première version rendait ici une sentinelle, 999999,99. Un écran qui
  // l'affiche annonce « 999999,99 % consommé », ce qu'aucune gestionnaire ne
  // lira comme « il n'y a pas de budget ». Une valeur inventée qui se lit
  // comme une mesure est pire qu'une absence de mesure — c'est la même raison
  // qui fait qu'une pièce de caisse sans numéro n'affiche pas de tiret.
  //
  // Zéro est le seul chiffre honnête : il n'y a rien à consommer. Le vrai
  // garde-fou est ailleurs — `raiseBudgetAlertIfNeededTx` ne lève aucune
  // alerte contre un budget révisé nul ou négatif, un seuil en pourcentage
  // de zéro n'ayant pas de sens.
  return 0;
}

function toSiteBudgetAlertRecord(row: Record<string, any>): SiteBudgetAlertRecord {
  const engagedAmount = toAmountOrZero(row.engagedAmount);
  const budgetAmount = toAmountOrZero(row.budgetAmount);
  return {
    id: row.id,
    siteId: row.siteId,
    siteLabel: row.site?.name ?? 'Chantier',
    budgetId: row.budgetId,
    thresholdPercent: row.thresholdPercent,
    engagedAmount,
    budgetAmount,
    consumedPercent: computeConsumedPercent(engagedAmount, budgetAmount),
    raisedAt: row.raisedAt,
    acknowledgedAt: row.acknowledgedAt ?? null,
    currency: CURRENCY
  };
}

const SITE_LABEL_INCLUDE = { site: { select: { name: true } } } as const;

// ---------------------------------------------------------------------------
// Budget révisé — batché, jamais une requête par budget
// ---------------------------------------------------------------------------

export interface RevisedBudgetTotals {
  /** Somme des lignes du budget. */
  initialTotal: number;
  /** Initial plus la somme signée des lignes des avenants VALIDÉS. */
  revisedTotal: number;
}

/**
 * Le budget initial et révisé d'un ou plusieurs budgets, en trois requêtes au
 * plus — quel que soit le nombre de budgets demandés, jamais une par budget :
 * même discipline que `listConstructionSites` (`sites.ts`) pour le coût réel.
 *
 * Accepte `PrismaTransactionClient` : le client complet (`prisma`) lui est
 * assignable (voir `utils/database.ts`), ce qui permet à `raiseBudgetAlertIfNeededTx`
 * de l'appeler à travers `tx` — pour voir un budget ou un avenant tout juste
 * écrit dans la même transaction — et à `getSitesDashboard` de l'appeler à
 * travers `prisma`, en lecture simple hors transaction.
 */
export async function getRevisedBudgetTotals(
  client: PrismaTransactionClient,
  budgetIds: string[]
): Promise<Map<string, RevisedBudgetTotals>> {
  const result = new Map<string, RevisedBudgetTotals>();
  if (budgetIds.length === 0) {
    return result;
  }

  const lineSums = await client.siteBudgetLine.groupBy({
    by: ['budgetId'],
    where: { budgetId: { in: budgetIds } },
    _sum: { amountForecast: true }
  });
  const initialByBudget = new Map<string, number>(
    lineSums.map((row: Record<string, any>) => [row.budgetId as string, toAmountOrZero(row._sum?.amountForecast)])
  );

  // Un avenant en brouillon ne compte pour rien (`data-model.md` §4) : seuls
  // les avenants VALIDÉS entrent dans le révisé.
  const validatedAmendments = await client.budgetAmendment.findMany({
    where: { budgetId: { in: budgetIds }, status: 'VALIDATED' },
    select: { id: true, budgetId: true }
  });
  const amendmentIds = validatedAmendments.map((a: Record<string, any>) => a.id as string);
  const budgetByAmendment = new Map<string, string>(
    validatedAmendments.map((a: Record<string, any>) => [a.id as string, a.budgetId as string])
  );

  const deltaSums = amendmentIds.length
    ? await client.budgetAmendmentLine.groupBy({
        by: ['amendmentId'],
        where: { amendmentId: { in: amendmentIds } },
        _sum: { amountDelta: true }
      })
    : [];

  const deltaByBudget = new Map<string, number>();
  for (const row of deltaSums as Array<Record<string, any>>) {
    const budgetId = budgetByAmendment.get(row.amendmentId as string);
    if (!budgetId) continue;
    deltaByBudget.set(
      budgetId,
      roundMoneyXof((deltaByBudget.get(budgetId) ?? 0) + toAmountOrZero(row._sum?.amountDelta))
    );
  }

  for (const budgetId of budgetIds) {
    const initialTotal = initialByBudget.get(budgetId) ?? 0;
    const delta = deltaByBudget.get(budgetId) ?? 0;
    result.set(budgetId, { initialTotal, revisedTotal: roundMoneyXof(initialTotal + delta) });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Engagé — batché, jamais une requête par chantier
// ---------------------------------------------------------------------------

export interface SiteEngagementTotals {
  actualCost: number;
  openCommitments: number;
  engagedAmount: number;
}

/**
 * Réalisé et engagé d'un ou plusieurs chantiers, en quatre requêtes au plus —
 * quel que soit le nombre de chantiers, jamais une par chantier.
 *
 * Reprend au caractère près le filtre de `getSiteActualCost` (`sites.ts`,
 * lot 2) pour le réalisé, et la formule de `SiteEngagementRecord`
 * (`types-lot3.ts`) pour l'engagé : reste à facturer des bons ÉMIS, jamais
 * leur montant total, pour ne pas compter deux fois une facture rapprochée.
 */
export async function getSiteEngagementTotals(
  client: PrismaTransactionClient,
  tenantId: string,
  siteIds: string[]
): Promise<Map<string, SiteEngagementTotals>> {
  const result = new Map<string, SiteEngagementTotals>();
  if (siteIds.length === 0) {
    return result;
  }

  // Réalisé — identique au filtre de `getSiteActualCost` (lot 2) : imputations
  // validées et non annulées, sommées par agrégation SQL groupée.
  const actualCostBySite = await sumSiteActualCostByIds(client, tenantId, siteIds);

  // Bons ÉMIS et non annulés seulement : un brouillon n'engage rien, un bon
  // annulé non plus (`types-lot3.ts`, `SiteEngagementRecord`).
  const openOrders = await client.purchaseOrder.findMany({
    where: { tenantId, siteId: { in: siteIds }, status: 'ISSUED' },
    select: { id: true, siteId: true }
  });
  const orderIds = openOrders.map((order: Record<string, any>) => order.id as string);
  const siteByOrder = new Map<string, string>(
    openOrders.map((order: Record<string, any>) => [order.id as string, order.siteId as string])
  );

  const [lineSums, invoiceSums] = orderIds.length
    ? await Promise.all([
        client.purchaseOrderLine.groupBy({
          by: ['orderId'],
          where: { orderId: { in: orderIds } },
          _sum: { amount: true }
        }),
        // Seules les factures VALIDÉES rapprochées comptent dans le facturé
        // (`PurchaseOrderInvoicingState`, `types-lot3.ts`) : un brouillon ou
        // une facture annulée ne réduit pas le reste à facturer.
        client.supplierInvoice.groupBy({
          by: ['purchaseOrderId'],
          where: { purchaseOrderId: { in: orderIds }, tenantId, status: 'VALIDATED' },
          _sum: { amount: true }
        })
      ])
    : [[] as Array<Record<string, any>>, [] as Array<Record<string, any>>];

  const totalByOrder = new Map<string, number>(
    (lineSums as Array<Record<string, any>>).map(row => [row.orderId as string, toAmountOrZero(row._sum?.amount)])
  );
  const invoicedByOrder = new Map<string, number>(
    (invoiceSums as Array<Record<string, any>>).map(row => [
      row.purchaseOrderId as string,
      toAmountOrZero(row._sum?.amount)
    ])
  );

  const commitmentsBySite = new Map<string, number>();
  for (const orderId of orderIds) {
    const siteId = siteByOrder.get(orderId);
    if (!siteId) continue;
    const total = totalByOrder.get(orderId) ?? 0;
    const invoiced = invoicedByOrder.get(orderId) ?? 0;
    // Borné à zéro : le piège de la formule (`types-lot3.ts`) — le montant du
    // bon, pas son reste, serait compté deux fois avec le réalisé si une
    // facture le dépassait par erreur d'imputation ailleurs.
    const remaining = Math.max(0, roundMoneyXof(total - invoiced));
    commitmentsBySite.set(siteId, roundMoneyXof((commitmentsBySite.get(siteId) ?? 0) + remaining));
  }

  for (const siteId of siteIds) {
    const actualCost = actualCostBySite.get(siteId) ?? 0;
    const openCommitments = commitmentsBySite.get(siteId) ?? 0;
    result.set(siteId, { actualCost, openCommitments, engagedAmount: roundMoneyXof(actualCost + openCommitments) });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Levée de l'alerte
// ---------------------------------------------------------------------------

/** Voir `RaiseBudgetAlertIfNeededTx` dans `./types-lot3.ts`. */
export const raiseBudgetAlertIfNeededTx: RaiseBudgetAlertIfNeededTx = async (tx, tenantId, siteId) => {
  const site = await tx.constructionSite.findFirst({ where: { id: siteId, tenantId } });
  if (!site) {
    throw new NotFoundError('Chantier introuvable.');
  }

  // Pas de seuil configuré : rien à surveiller sur ce chantier.
  if (site.budgetThresholdPercent == null) {
    return null;
  }

  // Pas de budget validé : rien contre quoi comparer l'engagé.
  const budget = await tx.siteBudget.findFirst({ where: { tenantId, siteId, status: 'VALIDATED' } });
  if (!budget) {
    return null;
  }

  // Lecture avant écriture — piège rappelé en tête de `cost-allocation.ts` :
  // en PostgreSQL, une commande en échec annule toute la transaction, donc
  // « tenter l'insertion puis rattraper la violation de l'index partiel
  // (`site_budget_alerts_one_open_per_budget`) » ne fonctionne pas ici. On
  // vérifie donc explicitement, avant d'écrire quoi que ce soit.
  const existingOpenAlert = await tx.siteBudgetAlert.findFirst({
    where: { budgetId: budget.id, acknowledgedAt: null }
  });
  if (existingOpenAlert) {
    return null;
  }

  const [revisedTotals, engagementTotals] = await Promise.all([
    getRevisedBudgetTotals(tx, [budget.id]),
    getSiteEngagementTotals(tx, tenantId, [siteId])
  ]);

  const revisedBudget = revisedTotals.get(budget.id)?.revisedTotal ?? 0;
  const engagedAmount = engagementTotals.get(siteId)?.engagedAmount ?? 0;

  // Un seuil exprimé en pourcentage d'un budget nul ou négatif ne veut rien
  // dire : on ne lève alors aucune alerte.
  //
  // Le garde est posé ici EXPLICITEMENT, et non laissé au hasard de la
  // comparaison qui suit. Sans lui, la règle ne tenait que parce qu'un seuil
  // vaut au moins un : un seuil à zéro, qu'aucune contrainte n'interdit,
  // aurait fait naître une alerte sur un budget inexistant.
  if (revisedBudget <= 0) {
    return null;
  }

  const consumedPercent = computeConsumedPercent(engagedAmount, revisedBudget);
  // « Franchit le seuil » : au seuil pile, l'alerte se lève déjà — une
  // gestionnaire qui a fixé 90 % veut être prévenue en atteignant 90 %,
  // pas seulement en le dépassant. Hypothèse posée faute de précision du
  // contrat sur l'inégalité stricte ou large — voir le rapport de fin de
  // tâche.
  if (consumedPercent < site.budgetThresholdPercent) {
    return null;
  }

  const created = await tx.siteBudgetAlert.create({
    data: {
      tenantId,
      siteId,
      budgetId: budget.id,
      thresholdPercent: site.budgetThresholdPercent,
      engagedAmount: roundMoneyXof(engagedAmount),
      budgetAmount: roundMoneyXof(revisedBudget)
    },
    include: SITE_LABEL_INCLUDE
  });

  return toSiteBudgetAlertRecord(created as Record<string, any>);
};

// ---------------------------------------------------------------------------
// Acquittement
// ---------------------------------------------------------------------------

/** Voir `AcknowledgeBudgetAlertTx` dans `./types-lot3.ts`. */
export const acknowledgeBudgetAlertTx: AcknowledgeBudgetAlertTx = async (
  tx,
  tenantId,
  alertId,
  acknowledgedByUserId
) => {
  const alert = await tx.siteBudgetAlert.findFirst({ where: { id: alertId, tenantId } });
  if (!alert) {
    throw new NotFoundError('Alerte de dépassement introuvable.');
  }
  if (alert.acknowledgedAt) {
    // Ce qui est acquitté ne bouge plus — même principe (P-6) que la
    // validation d'une pièce : une seconde tentative est un refus, pas une
    // mise à jour silencieuse.
    throw new ConflictError('Cette alerte est déjà acquittée.');
  }

  // Mise à jour conditionnelle, même parti pris que `validateCashVoucherTx`
  // (`cash.ts`) : si une autre transaction a acquitté cette même alerte entre
  // la lecture ci-dessus et cet instant, `count` vaut 0 et on abandonne
  // plutôt que d'écraser silencieusement l'acquittement d'autrui.
  const updateResult = await tx.siteBudgetAlert.updateMany({
    where: { id: alertId, tenantId, acknowledgedAt: null },
    data: { acknowledgedAt: new Date(), acknowledgedByUserId }
  });
  if (updateResult.count !== 1) {
    throw new ConflictError('Cette alerte vient d’être acquittée par ailleurs.');
  }

  const updated = await tx.siteBudgetAlert.findFirst({
    where: { id: alertId, tenantId },
    include: SITE_LABEL_INCLUDE
  });
  return toSiteBudgetAlertRecord(updated as Record<string, any>);
};

// ---------------------------------------------------------------------------
// Liste des alertes ouvertes
// ---------------------------------------------------------------------------

/** Voir `ListOpenBudgetAlerts` dans `./types-lot3.ts`. */
export const listOpenBudgetAlerts: ListOpenBudgetAlerts = async tenantId => {
  const rows = await prisma.siteBudgetAlert.findMany({
    where: { tenantId, acknowledgedAt: null },
    include: SITE_LABEL_INCLUDE,
    // Plus récente d'abord : c'est ce qui vient de se produire que la
    // dirigeante doit voir en premier sur son tableau de bord, même
    // convention de lecture que `listConstructionSites` (plus récent
    // d'abord). Le contrat ne précise pas d'ordre — hypothèse posée, voir le
    // rapport de fin de tâche.
    orderBy: [{ raisedAt: 'desc' }]
  });

  return rows.map((row: Record<string, any>) => toSiteBudgetAlertRecord(row));
};

// Réexporté pour `site-dashboard.ts`, qui a besoin de la même mise en forme
// pour la colonne `openAlert` du tableau de bord — jamais dupliquée une
// troisième fois.
export { toSiteBudgetAlertRecord };
