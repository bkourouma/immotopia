/**
 * Bons de commande et engagé — lot 3, volet achats
 * (`specs/018-finance-budget-pilotage/`).
 *
 * Implémente les sept fonctions de ce volet du contrat gelé
 * (`./types-lot3.ts`) : `createPurchaseOrderTx`, `issuePurchaseOrderTx`,
 * `cancelPurchaseOrderTx`, `linkInvoiceToPurchaseOrderTx`,
 * `listPurchaseOrders`, `getPurchaseOrder`, `getSiteEngagement`.
 *
 * Trois règles du contrat s'appliquent ici sans exception, héritées des lots
 * précédents :
 *
 *   1. **Aucun « débit » ni « crédit » ne sort d'ici.**
 *   2. **Toute fonction qui écrit prend le client de transaction fourni par
 *      l'appelant.** Rien n'ouvre sa propre transaction ici.
 *   3. **`PurchaseOrder.status` ne porte que le cycle décidé** (brouillon,
 *      émis, annulé). L'état de facturation — pas facturé, partiellement
 *      facturé, soldé — n'est JAMAIS stocké : il se calcule à la lecture,
 *      dans `toPurchaseOrderRecord`, à partir des factures VALIDÉES qui
 *      pointent vers le bon (`SupplierInvoice.purchaseOrderId`).
 *
 * ---------------------------------------------------------------------------
 * Le piège de l'engagé
 * ---------------------------------------------------------------------------
 *
 * `getSiteEngagement` est la fonction la plus délicate du fichier. La formule
 * gelée (`types-lot3.ts`, section « Engagé — la grandeur centrale du lot ») :
 *
 *   réalisé = somme des `CostAllocation` validées et non annulées du chantier
 *   engagé  = réalisé + somme, sur les bons ÉMIS et non annulés,
 *             de leur RESTE À FACTURER (jamais leur montant plein)
 *
 * Sans le « reste à facturer », une facture rapprochée d'un bon compterait
 * deux fois : une fois dans le réalisé (dès qu'elle est validée, via
 * `CostAllocation`), une fois dans le bon (via son montant plein). Un test de
 * `__tests__/unit/finance.purchase-orders.test.ts` le prouve avec un bon d'un
 * million émis et une facture de 400 000 validée et rapprochée : l'engagé doit
 * valoir un million, pas un million quatre cent mille.
 *
 * ---------------------------------------------------------------------------
 * Écarts et hypothèses — voir aussi le rapport de fin de tâche
 * ---------------------------------------------------------------------------
 *
 *   - `CancelPurchaseOrderTx` reçoit un `reason` (contrat gelé), mais
 *     `PurchaseOrder` ne porte aucune colonne pour le motif d'annulation
 *     (contrairement à `VoidDocument.reason` pour les pièces comptables du
 *     lot 2). Le paramètre est accepté pour respecter la signature, mais
 *     n'est persisté nulle part — même nature d'écart que `contactName` sur
 *     `Supplier` (voir l'en-tête de `./suppliers.ts`).
 *   - `getSiteActualCost` ci-dessous est une COPIE volontaire, au caractère
 *     près, de la fonction de même nom dans `./sites.ts` : elle n'y est pas
 *     exportée, et ce fichier n'a pas le droit de modifier `sites.ts` (hors de
 *     son territoire) pour l'exporter. Dupliquer plutôt que diverger.
 *   - L'émission d'un bon (`issuePurchaseOrderTx`) est, selon `types-lot3.ts`,
 *     le moment où « l'alerte de dépassement est évaluée
 *     (`raiseBudgetAlertIfNeededTx`) ». Cette fonction appartient au volet
 *     budget/alertes du lot 3, hors du territoire de cet agent (aucun fichier
 *     ne l'implémente à ce jour dans `lib/finance/`) : l'appeler ici aurait
 *     couplé ce fichier à un module qui n'existe pas encore, sous un nom qu'on
 *     ne connaît pas. Le déclenchement de l'alerte à l'émission reste donc à
 *     câbler à l'intégration, par qui possède ce volet.
 */

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest, conflict, notFound } from '../errors';
import { roundLineQuantity, roundMoneyXof } from './money';
import { toAmount, toAmountOrZero } from './types';
import { sumSiteActualCost } from './site-cost';
import { raiseBudgetAlertIfNeededTx } from './budget-alerts';
import type {
  CancelPurchaseOrderTx,
  CreatePurchaseOrderTx,
  GetPurchaseOrder,
  GetSiteEngagement,
  IssuePurchaseOrderTx,
  LinkInvoiceToPurchaseOrderTx,
  ListPurchaseOrders,
  PurchaseOrderInvoicingState,
  PurchaseOrderLineRecord,
  PurchaseOrderRecord
} from './types-lot3';

/** Devise unique du lot (décision D9, actée aux lots 1 et 2) : jamais posée par bon. */
const DEFAULT_CURRENCY = 'XOF';

// ---------------------------------------------------------------------------
// Conversions Prisma -> contrat
// ---------------------------------------------------------------------------

/**
 * Jointure Prisma commune à toutes les lectures d'un bon : le libellé du
 * chantier et du fournisseur (relations déclarées, donc une jointure SQL
 * unique — jamais une requête par ligne), et les lignes avec le libellé de
 * leur poste de dépense.
 */
const ORDER_INCLUDE = {
  site: { select: { name: true } },
  supplier: { select: { name: true } },
  lines: { include: { costCategory: { select: { label: true } } } }
} as const;

type OrderRow = {
  id: string;
  tenantId: string;
  siteId: string;
  supplierId: string;
  reference: string;
  orderDate: Date;
  status: string;
  currency: string;
  site: { name: string } | null;
  supplier: { name: string } | null;
  lines: Array<{
    id: string;
    costCategoryId: string;
    label: string;
    amount: unknown;
    quantity: unknown;
    unitPrice: unknown;
    costCategory: { label: string } | null;
  }>;
};

/**
 * L'état de facturation d'un bon, DÉRIVÉ, jamais stocké (voir l'en-tête du
 * fichier). `NOT_INVOICED` tant qu'aucune facture validée ne lui est
 * rapprochée, `SETTLED` dès que la somme facturée couvre le bon, et
 * `PARTIALLY_INVOICED` entre les deux.
 */
function deriveInvoicingState(totalAmount: number, invoicedAmount: number): PurchaseOrderInvoicingState {
  if (invoicedAmount <= 0) {
    return 'NOT_INVOICED';
  }
  if (invoicedAmount >= totalAmount) {
    return 'SETTLED';
  }
  return 'PARTIALLY_INVOICED';
}

/** Assemble un `PurchaseOrderRecord` complet à partir de la ligne jointe et du montant déjà facturé. */
function toPurchaseOrderRecord(row: OrderRow, invoicedAmount: number): PurchaseOrderRecord {
  const lines: PurchaseOrderLineRecord[] = row.lines.map(line => ({
    id: line.id,
    costCategoryId: line.costCategoryId,
    costCategoryLabel: line.costCategory?.label ?? 'Poste inconnu',
    label: line.label,
    amount: toAmountOrZero(line.amount as any),
    // Relus tels qu'ils ont ete saisis, `null` compris : le total du bon
    // reste la somme des MONTANTS, jamais un produit quantite x prix
    // unitaire recompose ici.
    quantity: toAmount(line.quantity as any),
    unitPrice: toAmount(line.unitPrice as any)
  }));

  const totalAmount = roundMoneyXof(lines.reduce((sum, line) => sum + line.amount, 0));
  const invoiced = roundMoneyXof(invoicedAmount);
  // Borné à zéro : une facture qui dépasserait le bon (avenant oublié, saisie
  // hors bon) ne doit jamais afficher un « reste à facturer » négatif.
  const remainingAmount = roundMoneyXof(Math.max(totalAmount - invoiced, 0));

  return {
    id: row.id,
    tenantId: row.tenantId,
    siteId: row.siteId,
    siteLabel: row.site?.name ?? 'Chantier inconnu',
    supplierId: row.supplierId,
    supplierLabel: row.supplier?.name ?? 'Fournisseur inconnu',
    reference: row.reference,
    orderDate: row.orderDate,
    status: row.status as PurchaseOrderRecord['status'],
    currency: row.currency,
    lines,
    totalAmount,
    invoicedAmount: invoiced,
    remainingAmount,
    invoicingState: deriveInvoicingState(totalAmount, invoiced)
  };
}

/**
 * Somme des factures VALIDÉES rapprochées d'un bon.
 *
 * `client` accepte indifféremment `prisma` ou un `tx` de transaction : le
 * client complet est assignable à `PrismaTransactionClient` (voir
 * `utils/database.ts`), ce qui permet à ce même code de servir les lectures
 * pures (`getPurchaseOrder`) et les écritures transactionnelles
 * (`issuePurchaseOrderTx`, etc.) sans le dupliquer.
 */
async function fetchInvoicedAmount(
  client: PrismaTransactionClient,
  tenantId: string,
  orderId: string
): Promise<number> {
  const result = await client.supplierInvoice.aggregate({
    where: { tenantId, purchaseOrderId: orderId, status: 'VALIDATED' as any },
    _sum: { amount: true }
  });
  return toAmountOrZero(result._sum.amount as any);
}

/**
 * Même somme que `fetchInvoicedAmount`, mais pour plusieurs bons EN UNE SEULE
 * requête groupée — jamais une requête par bon. C'est la discipline posée par
 * `listConstructionSites` (lot 2) sur ses coûts réels, et le banc de charge du
 * lot 0 en a mesuré l'enjeu (facteur trente entre les deux approches).
 */
async function fetchInvoicedAmounts(
  client: PrismaTransactionClient,
  tenantId: string,
  orderIds: string[]
): Promise<Map<string, number>> {
  if (orderIds.length === 0) {
    return new Map();
  }

  const grouped = await client.supplierInvoice.groupBy({
    by: ['purchaseOrderId'],
    where: { tenantId, purchaseOrderId: { in: orderIds }, status: 'VALIDATED' as any },
    _sum: { amount: true }
  });

  return new Map(
    (grouped as unknown as Array<{ purchaseOrderId: string | null; _sum: { amount: unknown } }>)
      .filter(
        (group): group is { purchaseOrderId: string; _sum: { amount: unknown } } => group.purchaseOrderId !== null
      )
      .map(group => [group.purchaseOrderId, toAmountOrZero(group._sum.amount as any)])
  );
}

/** Relit un bon au complet (lignes, libellés, montant facturé) après une écriture. */
async function loadOrderRecord(
  client: PrismaTransactionClient,
  tenantId: string,
  orderId: string
): Promise<PurchaseOrderRecord> {
  const row = await client.purchaseOrder.findFirst({ where: { id: orderId, tenantId }, include: ORDER_INCLUDE });
  if (!row) {
    throw notFound('Bon de commande introuvable');
  }
  const invoicedAmount = await fetchInvoicedAmount(client, tenantId, orderId);
  return toPurchaseOrderRecord(row as unknown as OrderRow, invoicedAmount);
}

// ---------------------------------------------------------------------------
// A. Création d'un bon de commande (brouillon)
// ---------------------------------------------------------------------------

/** Voir `CreatePurchaseOrderTx` dans `./types-lot3.ts`. */
export const createPurchaseOrderTx: CreatePurchaseOrderTx = async (tx, tenantId, params) => {
  const reference = params.reference?.trim();
  if (!reference) {
    throw badRequest('La référence du bon de commande est obligatoire');
  }
  if (params.lines.length === 0) {
    throw badRequest('Un bon de commande doit porter au moins une ligne');
  }

  const site = await tx.constructionSite.findFirst({ where: { id: params.siteId, tenantId }, select: { id: true } });
  if (!site) {
    throw notFound('Chantier introuvable');
  }

  const supplier = await tx.supplier.findFirst({ where: { id: params.supplierId, tenantId }, select: { id: true } });
  if (!supplier) {
    throw notFound('Fournisseur introuvable');
  }

  // Discipline du défaut n°1 du lot 2 : chaque montant est arrondi avant
  // d'entrer dans une somme, jamais après — la somme brute puis arrondie peut
  // différer de la somme des valeurs déjà arrondies qui seront stockées.
  //
  // Quantite et prix unitaire (20 septembre 2026) : conserves, jamais
  // remultiplies. Le montant reste la donnee de reference ; une ligne sans
  // quantite ni prix unitaire — un forfait de pose — les laisse nuls.
  const roundedLines = params.lines.map(line => ({
    costCategoryId: line.costCategoryId,
    label: line.label,
    amount: roundMoneyXof(line.amount),
    quantity: line.quantity === null || line.quantity === undefined ? null : roundLineQuantity(line.quantity),
    unitPrice: line.unitPrice === null || line.unitPrice === undefined ? null : roundMoneyXof(line.unitPrice)
  }));

  let order: { id: string };
  try {
    order = await tx.purchaseOrder.create({
      data: {
        tenantId,
        siteId: params.siteId,
        supplierId: params.supplierId,
        reference,
        orderDate: params.orderDate,
        status: 'DRAFT' as any,
        currency: DEFAULT_CURRENCY,
        createdByUserId: params.createdByUserId
      },
      select: { id: true }
    });
  } catch (error) {
    // `@@unique([tenantId, reference])` : une référence dupliquée est un
    // conflit métier (409), pas une erreur Prisma brute qui remonterait en 500.
    if (error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002') {
      throw conflict('Un bon de commande porte déjà cette référence pour cette agence');
    }
    throw error;
  }

  for (const line of roundedLines) {
    await tx.purchaseOrderLine.create({
      data: {
        orderId: order.id,
        costCategoryId: line.costCategoryId,
        label: line.label,
        amount: line.amount,
        quantity: line.quantity,
        unitPrice: line.unitPrice
      }
    });
  }

  return loadOrderRecord(tx, tenantId, order.id);
};

// ---------------------------------------------------------------------------
// B. Émission
// ---------------------------------------------------------------------------

/** Voir `IssuePurchaseOrderTx` dans `./types-lot3.ts`. */
export const issuePurchaseOrderTx: IssuePurchaseOrderTx = async (tx, tenantId, orderId, issuedByUserId) => {
  const order = await tx.purchaseOrder.findFirst({
    where: { id: orderId, tenantId },
    select: { id: true, status: true, siteId: true }
  });
  if (!order) {
    throw notFound('Bon de commande introuvable');
  }
  if (order.status !== 'DRAFT') {
    throw conflict("Ce bon de commande n'est plus en brouillon : il est déjà émis ou annulé");
  }

  // Mise à jour conditionnelle : si une autre transaction a déjà fait
  // transiter ce bon entre notre lecture et cet instant, `count` vaut 0 et on
  // abandonne plutôt que d'écraser un état déjà changé (même discipline que
  // `validateSupplierPaymentTx`, lot 2).
  const updateResult = await tx.purchaseOrder.updateMany({
    where: { id: orderId, tenantId, status: 'DRAFT' as any },
    data: { status: 'ISSUED' as any, issuedByUserId, issuedAt: new Date() }
  });
  if (updateResult.count !== 1) {
    throw conflict("Ce bon de commande vient d'être émis ou annulé par ailleurs");
  }

  // L'emission fait entrer le bon dans l'engage : un brouillon n'engage
  // personne. C'est donc ici, et pas a la creation, que l'alerte de
  // depassement s'evalue — l'un des trois seuls moments ou l'engage monte.
  //
  // Elle ne leve jamais d'exception : une alerte informe, elle n'interdit
  // pas d'emettre un bon.
  await raiseBudgetAlertIfNeededTx(tx, tenantId, order.siteId);

  return loadOrderRecord(tx, tenantId, orderId);
};

// ---------------------------------------------------------------------------
// C. Annulation
// ---------------------------------------------------------------------------

/** Voir `CancelPurchaseOrderTx` dans `./types-lot3.ts`. */
export const cancelPurchaseOrderTx: CancelPurchaseOrderTx = async (tx, tenantId, orderId, reason) => {
  // Le motif est obligatoire, et il est desormais STOCKE.
  //
  // Le schema gele n'avait pas de colonne pour lui : le contrat demandait un
  // motif que rien ne conservait, ce que deux agents ont releve
  // independamment. La colonne `cancellation_reason` a ete ajoutee a
  // l'integration (migration `20260919160000`). Annuler un bon est un geste
  // irreversible sur un engagement ; une annulation sans trace est un chiffre
  // qui disparait sans explication, et le lot 2 exige deja un motif pour
  // toute annulation de piece.
  const motif = reason?.trim();
  if (!motif) {
    throw badRequest("Le motif d'annulation est obligatoire");
  }

  const order = await tx.purchaseOrder.findFirst({
    where: { id: orderId, tenantId },
    select: { id: true, status: true, siteId: true }
  });
  if (!order) {
    throw notFound('Bon de commande introuvable');
  }
  if (order.status === 'CANCELLED') {
    throw conflict('Ce bon de commande est déjà annulé');
  }

  // Le piège explicite du contrat : une facture rapprochée — validée ou
  // encore brouillon, peu importe, le rapprochement est déjà posé
  // (`SupplierInvoice.purchaseOrderId`) — interdit l'annulation. On ne fait
  // pas disparaître un engagement qui a déjà commencé à produire une dette.
  const linkedInvoice = await tx.supplierInvoice.findFirst({
    where: { tenantId, purchaseOrderId: orderId },
    select: { id: true }
  });
  if (linkedInvoice) {
    throw conflict(
      'Une facture est rapprochée de ce bon de commande : défaites le rapprochement, ou annulez la facture, avant de pouvoir annuler ce bon'
    );
  }

  const updateResult = await tx.purchaseOrder.updateMany({
    where: { id: orderId, tenantId, status: order.status as any },
    data: { status: 'CANCELLED' as any, cancelledAt: new Date(), cancellationReason: motif }
  });
  if (updateResult.count !== 1) {
    throw conflict('Ce bon de commande a été modifié entre-temps');
  }

  return loadOrderRecord(tx, tenantId, orderId);
};

// ---------------------------------------------------------------------------
// D. Rapprochement d'une facture à un bon
// ---------------------------------------------------------------------------

/** Voir `LinkInvoiceToPurchaseOrderTx` dans `./types-lot3.ts`. */
export const linkInvoiceToPurchaseOrderTx: LinkInvoiceToPurchaseOrderTx = async (tx, tenantId, invoiceId, orderId) => {
  const invoice = await tx.supplierInvoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: { id: true, status: true, supplierId: true, siteId: true }
  });
  if (!invoice) {
    throw notFound('Facture fournisseur introuvable');
  }

  // Ce qui est validé ne bouge plus (P-6) : une facture validée ne se
  // rapproche plus, qu'on cherche à poser un rapprochement ou à en défaire un.
  if (invoice.status === 'VALIDATED') {
    throw conflict('Cette facture est déjà validée : son rapprochement à un bon ne peut plus changer');
  }

  if (orderId !== null) {
    const order = await tx.purchaseOrder.findFirst({
      where: { id: orderId, tenantId },
      select: { id: true, status: true, supplierId: true, siteId: true }
    });
    if (!order) {
      throw notFound('Bon de commande introuvable');
    }
    // Tous les contrôles suivants sont faits AVANT toute écriture (P-2).
    if (order.status !== 'ISSUED') {
      throw conflict("Ce bon de commande n'est pas émis, ou a été annulé : une facture ne peut pas s'y rapprocher");
    }
    if (order.supplierId !== invoice.supplierId) {
      throw badRequest('La facture et le bon de commande ne portent pas le même fournisseur');
    }
    if (order.siteId !== invoice.siteId) {
      throw badRequest('La facture et le bon de commande ne portent pas le même chantier');
    }
  }

  // Mise à jour conditionnelle : re-vérifie `status !== VALIDATED` au moment
  // même de l'écriture, au cas où une validation concurrente se serait
  // glissée entre la lecture ci-dessus et cet instant.
  const updateResult = await tx.supplierInvoice.updateMany({
    where: { id: invoiceId, tenantId, status: { not: 'VALIDATED' as any } },
    data: { purchaseOrderId: orderId }
  });
  if (updateResult.count !== 1) {
    throw conflict("Cette facture vient d'être validée par ailleurs : son rapprochement ne peut plus changer");
  }

  // Défaire un rapprochement ne désigne plus aucun bon à renvoyer.
  if (orderId === null) {
    return null;
  }

  return loadOrderRecord(tx, tenantId, orderId);
};

// ---------------------------------------------------------------------------
// E. Lectures
// ---------------------------------------------------------------------------

/** Voir `ListPurchaseOrders` dans `./types-lot3.ts`. */
export const listPurchaseOrders: ListPurchaseOrders = async (tenantId, filters) => {
  const rows = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      ...(filters.siteId ? { siteId: filters.siteId } : {}),
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(filters.status ? { status: filters.status as any } : {})
    },
    include: ORDER_INCLUDE,
    orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }]
  });

  // Montants facturés résolus par UNE requête groupée pour toute la page.
  const invoicedByOrder = await fetchInvoicedAmounts(
    prisma,
    tenantId,
    rows.map((row: { id: string }) => row.id)
  );

  return rows.map((row: unknown) => {
    const typed = row as OrderRow;
    return toPurchaseOrderRecord(typed, invoicedByOrder.get(typed.id) ?? 0);
  });
};

/** Voir `GetPurchaseOrder` dans `./types-lot3.ts`. */
export const getPurchaseOrder: GetPurchaseOrder = async (tenantId, orderId) => {
  return loadOrderRecord(prisma, tenantId, orderId);
};

// ---------------------------------------------------------------------------
// F. Engagé du chantier
// ---------------------------------------------------------------------------

/**
 * Copie volontaire, au caractère près, de `getSiteActualCost` (`./sites.ts`).
 *
 * Cette fonction n'y est pas exportée, et modifier `sites.ts` pour l'exporter
 * sort du territoire confié à cet agent. Le contrat (`GetSiteEngagement`,
 * `types-lot3.ts`) exige pourtant EXACTEMENT ce filtre : « c'est le filtre
 * exact de `getSiteActualCost` dans `sites.ts` ». Dupliquer plutôt que
 * diverger — une divergence silencieuse entre les deux copies serait le
 * défaut n°4 du lot 2 (deux plans de comptes qui dérivent) rejoué ici.
 */
async function getSiteActualCost(tenantId: string, siteId: string): Promise<number> {
  // Cette copie a ete remplacee par la definition unique de `site-cost.ts` a
  // l'integration : la dupliquer plutot que de diverger etait le bon reflexe,
  // mais le bon remede etait de n'en avoir qu'une.
  return sumSiteActualCost(prisma, tenantId, siteId);
}

/** Voir `GetSiteEngagement` dans `./types-lot3.ts`. */
export const getSiteEngagement: GetSiteEngagement = async (tenantId, siteId) => {
  const site = await prisma.constructionSite.findFirst({ where: { id: siteId, tenantId }, select: { id: true } });
  if (!site) {
    throw notFound('Chantier introuvable');
  }

  const actualCost = await getSiteActualCost(tenantId, siteId);

  // Seuls les bons ÉMIS engagent le chantier : un brouillon n'engage
  // personne, et l'énumération n'a que trois valeurs (DRAFT/ISSUED/CANCELLED)
  // — filtrer sur ISSUED exclut donc aussi les annulés sans autre condition.
  const issuedOrders = await prisma.purchaseOrder.findMany({
    where: { tenantId, siteId, status: 'ISSUED' as any },
    select: { id: true, lines: { select: { amount: true } } }
  });

  const invoicedByOrder = await fetchInvoicedAmounts(
    prisma,
    tenantId,
    issuedOrders.map((order: any) => order.id)
  );

  // LE PIÈGE DE CE LOT : on additionne le RESTE À FACTURER de chaque bon,
  // jamais son montant plein. Dès qu'une facture rapprochée d'un bon est
  // validée, elle entre dans `actualCost` via sa `CostAllocation` ; la
  // recompter ici au montant plein du bon ferait entrer le même argent deux
  // fois dans l'engagé. Voir `types-lot3.ts`, section « Engagé — la grandeur
  // centrale du lot », et le test qui le prouve
  // (`__tests__/unit/finance.purchase-orders.test.ts`).
  const openCommitments = roundMoneyXof(
    issuedOrders.reduce((sum: number, order: any) => {
      const totalAmount = roundMoneyXof(
        (order.lines as any[]).reduce((lineSum: number, line: any) => lineSum + toAmountOrZero(line.amount), 0)
      );
      const invoiced = roundMoneyXof(invoicedByOrder.get(order.id) ?? 0);
      const remaining = Math.max(totalAmount - invoiced, 0);
      return sum + remaining;
    }, 0)
  );

  return {
    siteId,
    actualCost: roundMoneyXof(actualCost),
    openCommitments,
    engagedAmount: roundMoneyXof(actualCost + openCommitments),
    currency: DEFAULT_CURRENCY
  };
};
