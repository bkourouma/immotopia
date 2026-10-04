/**
 * Réceptions, sorties et valorisation au coût moyen pondéré — lot 5, deuxième
 * sous-lot (`types-lot5-mouvements.ts`, contrat gelé, PRD E9, besoins S2, S3,
 * S4).
 *
 * C'est le cœur du lot : la **sortie de magasin** est ce qui fait entrer le
 * matériau dans le coût d'un chantier, à la place de la facture (principe
 * P-7). Sans la persistance qu'écrit `recordStockIssueTx`, tout le reste du
 * lot serait décoratif.
 *
 * Gabarit suivi : `contractors.ts` (lot 4, sous-lot 4) pour la pièce qui
 * écrit son écriture, son imputation et resynchronise les programmes de
 * travaux ; `ledger.ts` (`appendThirdPartyMovementTx`) pour le couple
 * solde porté / état-après, que `StockBalance` et `StockMovement.quantityAfter`
 * reprennent à l'identique.
 *
 * ---------------------------------------------------------------------------
 * Le coût moyen n'est jamais une colonne
 * ---------------------------------------------------------------------------
 *
 * Il se déduit de `value / quantity`, par **(article, LIEU)**, et il n'est
 * stocké nulle part : une troisième colonne serait un troisième chiffre à
 * tenir d'accord avec les deux autres, et c'est toujours celui-là qui ment.
 *
 * Une sortie est valorisée au coût moyen **avant** la sortie, jamais après, et
 * le prix unitaire n'est pas un paramètre d'entrée (principe P-4).
 *
 * ---------------------------------------------------------------------------
 * Deux précisions, deux arrondis, et pourquoi on ne les confond pas
 * ---------------------------------------------------------------------------
 *
 * Les **montants** sont des entiers XOF : `roundMoneyXof`. Les **quantités**
 * ont quatre décimales (`Decimal(16,4)`) : on compte des tonnes et des mètres
 * cubes, pas seulement des sacs entiers, et les arrondir à l'unité effacerait
 * une demi-tonne de ciment. `roundQuantity` existe pour cette raison, et pour
 * empêcher qu'on remplace l'un par l'autre sans s'en apercevoir — exactement
 * le motif qui a fait naître `roundPercent` dans `money.ts` au lot 3.
 *
 * ---------------------------------------------------------------------------
 * Quand la quantité tombe à zéro, la valeur aussi
 * ---------------------------------------------------------------------------
 *
 * Une sortie qui vide un emplacement emporte **toute** la valeur restante, et
 * le solde retombe à zéro des deux côtés. Sans cette règle, les arrondis
 * successifs laisseraient une valeur résiduelle sur une quantité nulle, et le
 * prochain coût moyen serait une division par zéro — ou pire, un nombre.
 * L'écart d'arrondi est donc porté par le `totalValue` du mouvement, où on
 * peut le voir, plutôt que laissé en dépôt silencieux sur le solde.
 *
 * ---------------------------------------------------------------------------
 * Lecture avant écriture, toujours
 * ---------------------------------------------------------------------------
 *
 * En PostgreSQL une commande en échec **condamne toute la transaction** :
 * chaque commande suivante est refusée avec l'erreur 25P02 jusqu'au rollback.
 * « Tenter puis rattraper » ne marche donc pas ici. On lit le solde, on
 * calcule, on écrit — dans cet ordre, comme `appendThirdPartyMovementTx` et
 * `createContractorContractTx` avant nous.
 *
 * Les lignes d'une réception sont traitées **en séquence**, jamais en
 * `Promise.all` : deux lignes du même article au même endroit doivent se
 * cumuler dans l'ordre, et un solde lu en parallèle serait lu deux fois avant
 * d'être écrit une fois.
 */

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest, conflict, notFound } from '../errors';
import {
  ensureOperationalChartOfAccountsTx,
  ensureOperationalJournalTx,
  postDocumentEntryTx,
  resolveExpenseAccountsByCostCategoryTx
} from './accounting';
import { syncWorkProgramCostTx } from './cost-allocation';
import { assertSiteOpenTx } from './site-closing';
import { roundMoneyXof, roundQuantity } from './money';
import { toAmountOrZero } from './types';
import type {
  ListStockBalances,
  RecordStockIssueTx,
  RecordStockReceiptTx,
  StockBalanceRecord,
  StockMovementRecord
} from './types-lot5-mouvements';

/** Devise unique du module (décision D9 du plan, actée au lot 1). */
const DEFAULT_CURRENCY = 'XOF';

/** `Decimal(16,4)` : la précision des quantités, qui n'est pas celle des montants. */

/**
 * Arrondit une QUANTITÉ, à quatre décimales.
 *
 * Ce n'est pas `roundMoneyXof`, et ce ne doit jamais le devenir : le franc CFA
 * n'a pas de subdivision, une tonne de ciment en a quatre. Voir l'en-tête.
 */

/**
 * Le coût moyen pondéré d'un emplacement. **Calculé, jamais stocké.**
 *
 * Vaut zéro quand la quantité est nulle — et non `null` : un écran n'a pas à
 * distinguer « pas de stock » de « stock gratuit », la quantité le dit déjà
 * (contrat, `StockBalanceRecord.averageUnitCost`).
 */
function averageUnitCostOf(quantity: number, value: number): number {
  if (quantity <= 0) {
    return 0;
  }
  return value / quantity;
}

// ---------------------------------------------------------------------------
// Comptes et journal opérationnels
// ---------------------------------------------------------------------------

interface OperationalAccounts {
  journalId: string;
  /** 311 — Stocks de matieres et fournitures : l'actif que la sortie consomme. */
  stockAccountId: string;
  /** 605 — Charges de chantier : repli quand le poste n'a pas son propre compte. */
  siteExpenseAccountId: string;
}

/**
 * Résout le journal et les comptes dont une sortie a besoin. Délègue
 * entièrement à `accounting.ts` : ce fichier ne porte aucune copie du plan de
 * comptes — le défaut n°4 du lot 2, où trois agents avaient chacun écrit son
 * amorçage avec des numéros différents.
 */
async function resolveOperationalAccounts(
  tx: PrismaTransactionClient,
  tenantId: string,
  entryDate: Date
): Promise<OperationalAccounts> {
  const [journalId, comptes] = await Promise.all([
    ensureOperationalJournalTx(tx, tenantId, entryDate.getUTCFullYear()),
    ensureOperationalChartOfAccountsTx(tx, tenantId)
  ]);

  const exiger = (numero: string): string => {
    const id = comptes.get(numero);
    if (!id) {
      throw new Error(`Compte opérationnel ${numero} absent après amorçage du plan de comptes.`);
    }
    return id;
  };

  return {
    journalId,
    stockAccountId: exiger('311'),
    siteExpenseAccountId: exiger('605')
  };
}

// ---------------------------------------------------------------------------
// Conversions Prisma -> contrat
// ---------------------------------------------------------------------------

function toBalanceRecord(row: any): StockBalanceRecord {
  const quantity = roundQuantity(toAmountOrZero(row.quantity));
  const value = roundMoneyXof(toAmountOrZero(row.value));
  return {
    itemId: row.itemId,
    itemReference: row.item?.reference ?? 'Article inconnu',
    itemLabel: row.item?.label ?? 'Article inconnu',
    itemUnit: row.item?.unit ?? '',
    locationId: row.locationId,
    locationLabel: row.location?.label ?? 'Lieu inconnu',
    quantity,
    value,
    averageUnitCost: roundQuantity(averageUnitCostOf(quantity, value)),
    currency: row.currency ?? DEFAULT_CURRENCY
  };
}

function toCreatedByLabel(user?: { fullName?: string | null; email?: string | null } | null): string {
  return user?.fullName || user?.email || 'Utilisateur inconnu';
}

function toMovementRecord(row: any): StockMovementRecord {
  return {
    id: row.id,
    type: row.type,
    itemId: row.itemId,
    itemReference: row.item?.reference ?? 'Article inconnu',
    itemLabel: row.item?.label ?? 'Article inconnu',
    itemUnit: row.item?.unit ?? '',
    locationId: row.locationId,
    locationLabel: row.location?.label ?? 'Lieu inconnu',
    movementDate: row.movementDate,
    quantity: roundQuantity(toAmountOrZero(row.quantity)),
    isDecrease: row.isDecrease === true,
    unitCost: roundQuantity(toAmountOrZero(row.unitCost)),
    totalValue: roundMoneyXof(toAmountOrZero(row.totalValue)),
    currency: row.currency ?? DEFAULT_CURRENCY,
    quantityAfter: roundQuantity(toAmountOrZero(row.quantityAfter)),
    valueAfter: roundMoneyXof(toAmountOrZero(row.valueAfter)),
    siteId: row.siteId ?? null,
    siteLabel: row.site?.name ?? null,
    costCategoryLabel: row.costCategory?.label ?? null,
    requestedBy: row.requestedBy ?? null,
    supplierInvoiceReference: row.supplierInvoice?.reference ?? null,
    transferGroupId: row.transferGroupId ?? null,
    createdByLabel: toCreatedByLabel(row.createdBy),
    createdAt: row.createdAt
  };
}

// ---------------------------------------------------------------------------
// Le solde d'un emplacement — lu avant toute écriture
// ---------------------------------------------------------------------------

interface BalanceState {
  /** Nul quand l'emplacement n'a encore jamais rien reçu. */
  id: string | null;
  quantity: number;
  value: number;
}

/**
 * Lit le solde (article, lieu). Jamais `findUnique` sur la clé composée : le
 * `tenantId` doit entrer dans le filtre, sans quoi une agence lirait le stock
 * d'une autre si jamais un identifiant fuitait.
 */
async function readBalanceTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  itemId: string,
  locationId: string
): Promise<BalanceState> {
  const row = await tx.stockBalance.findFirst({
    where: { tenantId, itemId, locationId },
    select: { id: true, quantity: true, value: true }
  });

  if (!row) {
    return { id: null, quantity: 0, value: 0 };
  }

  return {
    id: row.id,
    quantity: roundQuantity(toAmountOrZero(row.quantity)),
    value: roundMoneyXof(toAmountOrZero(row.value))
  };
}

/** Écrit le nouvel état du solde : mise à jour si la ligne existe, création sinon. */
async function writeBalanceTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  itemId: string,
  locationId: string,
  previous: BalanceState,
  quantity: number,
  value: number
): Promise<void> {
  if (previous.id) {
    await tx.stockBalance.update({
      // `tenantId` en plus de l'id : anticipe le futur garde-fou Prisma (lot D).
      where: { id: previous.id, tenantId },
      data: { quantity, value }
    });
    return;
  }

  await tx.stockBalance.create({
    data: { tenantId, itemId, locationId, quantity, value, currency: DEFAULT_CURRENCY }
  });
}

// ---------------------------------------------------------------------------
// Gardes communes — article et lieu
// ---------------------------------------------------------------------------

/**
 * Le lieu, lu **directement par le client Prisma**.
 *
 * `stock-referentiel.ts` (premier sous-lot du lot 5) est écrit en parallèle de
 * ce fichier : en importer quoi que ce soit ferait dépendre deux territoires
 * l'un de l'autre pendant qu'ils bougent tous les deux.
 */
async function requireActiveLocationTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  locationId: string
): Promise<{ id: string; label: string }> {
  const location = await tx.stockLocation.findFirst({
    where: { id: locationId, tenantId },
    select: { id: true, label: true, isActive: true }
  });
  if (!location) {
    throw notFound('Lieu de stockage introuvable');
  }
  if (!location.isActive) {
    // Refus délibéré (contrat) : désactiver un lieu est un geste de
    // paramétrage voulu, pas un état à contourner en silence.
    throw conflict('Ce lieu de stockage est désactivé');
  }
  return { id: location.id, label: location.label };
}

// ---------------------------------------------------------------------------
// A. La réception — aucune écriture, aucune imputation
// ---------------------------------------------------------------------------

/**
 * Voir `RecordStockReceiptTx` dans `./types-lot5-mouvements.ts`.
 *
 * **N'écrit aucune écriture comptable ni aucune imputation**, et ce n'est pas
 * un oubli : la facture a déjà porté la valeur au 311, une seconde écriture
 * doublerait l'actif (contrat, en-tête). L'écart éventuel entre le 311 et la
 * valeur du stock est une **donnée** — c'est précisément ce que le besoin S7
 * demande d'exposer —, pas un bug qu'on corrigerait ici.
 *
 * **Un mouvement PAR LIGNE**, jamais un mouvement fourre-tout : le coût moyen
 * se recalcule article par article.
 */
export const recordStockReceiptTx: RecordStockReceiptTx = async (tx, tenantId, params) => {
  const lines = params.lines ?? [];
  if (lines.length === 0) {
    throw badRequest('Une réception comporte au moins une ligne');
  }

  await requireActiveLocationTx(tx, tenantId, params.locationId);

  // La réception est RATTACHÉE À UNE FACTURE VALIDÉE, et ce lien est exigé
  // (besoin S2, principe P-2) : une entrée de stock sans pièce est une valeur
  // qui apparaît de nulle part.
  const invoice = await tx.supplierInvoice.findFirst({
    where: { id: params.supplierInvoiceId, tenantId },
    select: { id: true, reference: true, status: true }
  });
  if (!invoice) {
    throw notFound('Facture fournisseur introuvable');
  }
  if (invoice.status !== 'VALIDATED') {
    throw conflict("Cette facture n'est pas validée : une réception ne s'adosse qu'à une pièce validée");
  }

  // Les articles sont résolus PAR LOT, jamais une requête par ligne — la même
  // discipline que `resolveExpenseAccountsByCostCategoryTx`.
  const itemIds = [...new Set(lines.map(line => line.itemId))];
  const items = await tx.stockItem.findMany({
    where: { tenantId, id: { in: itemIds } },
    select: { id: true, reference: true, label: true, unit: true, isActive: true }
  });
  const itemsById = new Map<string, any>((items as any[]).map(item => [item.id, item]));
  for (const itemId of itemIds) {
    const item = itemsById.get(itemId);
    if (!item) {
      throw notFound('Article de stock introuvable');
    }
    // UN ARTICLE DESACTIVE NE RENTRE PLUS, MAIS IL PEUT ENCORE SORTIR.
    //
    // L'asymetrie est voulue. Desactiver un article veut dire « on n'en
    // achete plus », jamais « abandonnez ce qui est en magasin » : refuser la
    // SORTIE d'un article desactive emprisonnerait un stock reel, que l'agence
    // devrait consommer en trichant. Refuser la RECEPTION, en revanche,
    // respecte le geste de la gestionnaire.
    //
    // Le contrat ne tranchait pas ; l'agent des mouvements l'a signale sans
    // decider, ce qui etait la bonne reaction. Arbitre a l'integration.
    if (!item.isActive) {
      throw conflict(`L'article « ${item.label} » est désactivé : on ne peut plus en recevoir`);
    }
  }

  // Validation de TOUTES les lignes avant la première écriture : une ligne
  // refusée au milieu laisserait la transaction condamnée côté PostgreSQL, et
  // la moitié des mouvements déjà écrits n'aurait servi à rien.
  for (const line of lines) {
    const quantity = roundQuantity(line.quantity);
    if (!(quantity > 0)) {
      throw badRequest('La quantité reçue doit être strictement positive');
    }
    // Un prix unitaire NUL est accepté — un don, une reprise, une chute
    // récupérée entrent en stock à valeur nulle (contrat). Seul le négatif
    // est refusé.
    if (!Number.isFinite(Number(line.unitCost)) || Number(line.unitCost) < 0) {
      throw badRequest('Le prix unitaire de réception ne peut pas être négatif');
    }
  }

  const records: StockMovementRecord[] = [];

  // EN SÉQUENCE, jamais en parallèle : deux lignes du même article au même
  // endroit doivent se cumuler dans l'ordre (voir l'en-tête).
  for (const line of lines) {
    const item = itemsById.get(line.itemId);
    const quantity = roundQuantity(line.quantity);
    const unitCost = roundQuantity(Number(line.unitCost));

    const previous = await readBalanceTx(tx, tenantId, line.itemId, params.locationId);

    const totalValue = roundMoneyXof(quantity * unitCost);
    const quantityAfter = roundQuantity(previous.quantity + quantity);
    const valueAfter = roundMoneyXof(previous.value + totalValue);

    const movement = await tx.stockMovement.create({
      data: {
        tenantId,
        type: 'RECEIPT',
        itemId: line.itemId,
        locationId: params.locationId,
        movementDate: params.receiptDate,
        quantity,
        // Le signe ne dit jamais le sens : c'est `type` et `isDecrease`
        // (contrat, et le commentaire du schéma).
        isDecrease: false,
        unitCost,
        totalValue,
        currency: DEFAULT_CURRENCY,
        quantityAfter,
        valueAfter,
        supplierInvoiceId: invoice.id,
        createdByUserId: params.createdByUserId
      },
      include: {
        item: { select: { reference: true, label: true, unit: true } },
        location: { select: { label: true } },
        supplierInvoice: { select: { reference: true } },
        createdBy: { select: { fullName: true, email: true } }
      }
    });

    await writeBalanceTx(tx, tenantId, line.itemId, params.locationId, previous, quantityAfter, valueAfter);

    records.push(
      toMovementRecord({
        ...(movement as any),
        item: (movement as any).item ?? item,
        supplierInvoice: (movement as any).supplierInvoice ?? invoice
      })
    );
  }

  return records;
};

// ---------------------------------------------------------------------------
// B. La sortie — LE geste du lot
// ---------------------------------------------------------------------------

/**
 * Voir `RecordStockIssueTx` dans `./types-lot5-mouvements.ts`.
 *
 * Écrit, dans une seule transaction : le mouvement valorisé au coût moyen
 * **avant** la sortie, l'écriture (débit du compte de charge du poste, crédit
 * du 311), l'imputation validée (`CostAllocation`, `STOCK_ISSUE`) et la
 * synchronisation des programmes de travaux.
 *
 * C'est cette imputation que `sumSiteActualCost` (`site-cost.ts`, non modifié
 * ici) lit pour le coût réel du chantier : sans elle, le matériau n'entrerait
 * **jamais** dans ce coût, et tout le lot serait décoratif.
 */
export const recordStockIssueTx: RecordStockIssueTx = async (tx, tenantId, params) => {
  const quantity = roundQuantity(params.quantity);
  if (!(quantity > 0)) {
    throw badRequest('La quantité sortie doit être strictement positive');
  }

  // `requestedBy` est EXIGÉ (besoin S3) : une sortie sans demandeur est un
  // matériau qui a disparu sans que personne n'en réponde.
  const requestedBy = (params.requestedBy ?? '').trim();
  if (!requestedBy) {
    throw badRequest('Le demandeur de la sortie est obligatoire');
  }

  await requireActiveLocationTx(tx, tenantId, params.locationId);

  const item = await tx.stockItem.findFirst({
    where: { id: params.itemId, tenantId },
    select: { id: true, reference: true, label: true, unit: true }
  });
  if (!item) {
    throw notFound('Article de stock introuvable');
  }

  const site = await tx.constructionSite.findFirst({
    where: { id: params.siteId, tenantId },
    select: { id: true, name: true }
  });
  if (!site) {
    throw notFound('Chantier introuvable');
  }

  // Le poste est EXIGÉ, jamais deviné depuis l'article : `defaultCostCategoryId`
  // est une proposition d'écran, pas une autorité (contrat). Même parti pris
  // qu'au poste « main-d'œuvre » des salaires.
  const costCategory = await tx.costCategory.findFirst({
    where: { id: params.costCategoryId, tenantId },
    select: { id: true, label: true, isActive: true }
  });
  if (!costCategory) {
    throw notFound('Poste de dépense introuvable');
  }
  if (!costCategory.isActive) {
    throw conflict('Ce poste de dépense est désactivé');
  }

  // Lot 4, sous-lot 6 : un chantier clos n'accepte plus aucune dépense, et une
  // sortie EST une dépense — elle impute. Appelée AVANT toute écriture : en
  // PostgreSQL, refuser après avoir écrit ne coûte pas moins cher, mais laisse
  // croire à la lecture du code que le refus est un rattrapage.
  await assertSiteOpenTx(tx, tenantId, params.siteId);

  // LECTURE AVANT ÉCRITURE : le coût moyen se lit sur l'état d'AVANT, jamais
  // sur celui d'après (principe P-4, contrat).
  const previous = await readBalanceTx(tx, tenantId, params.itemId, params.locationId);

  // LA SEULE INTERDICTION DURE DU SOUS-LOT, et elle tranche avec la doctrine du
  // module — ailleurs, on enregistre ce qui a eu lieu plutôt que de bloquer.
  // Ici c'est différent : un stock négatif n'a pas de coût moyen qui veuille
  // dire quelque chose, et toute la valorisation qui suit deviendrait fausse.
  // Quand la quantité physique dépasse ce que le système croit, le geste juste
  // est un inventaire, pas une sortie à découvert.
  if (quantity > previous.quantity) {
    throw conflict(
      `Stock insuffisant : ${previous.quantity} ${item.unit} disponible(s) pour ${quantity} demandé(s). ` +
        'Un inventaire, et non une sortie, corrige un écart de quantité physique.'
    );
  }

  const averageUnitCost = averageUnitCostOf(previous.quantity, previous.value);
  const quantityAfter = roundQuantity(previous.quantity - quantity);

  let totalValue: number;
  let valueAfter: number;
  if (quantityAfter <= 0) {
    // QUAND LA QUANTITÉ TOMBE À ZÉRO, LA VALEUR AUSSI. Le mouvement emporte
    // toute la valeur restante — l'écart d'arrondi y est donc visible — et le
    // solde retombe à zéro des deux côtés. Voir l'en-tête.
    totalValue = roundMoneyXof(previous.value);
    valueAfter = 0;
  } else {
    totalValue = roundMoneyXof(quantity * averageUnitCost);
    valueAfter = Math.max(0, roundMoneyXof(previous.value - totalValue));
  }

  const accounts = await resolveOperationalAccounts(tx, tenantId, params.issueDate);

  // Le compte de charge suit LE POSTE, avec repli sur les charges de chantier
  // (605) — jamais un compte unique frappé pour toute dépense, le défaut
  // corrigé au lot 3 (`accounting.ts`).
  const comptesParPoste = await resolveExpenseAccountsByCostCategoryTx(
    tx,
    tenantId,
    [params.costCategoryId],
    accounts.siteExpenseAccountId
  );
  const compteDeCharge = comptesParPoste.get(params.costCategoryId) ?? accounts.siteExpenseAccountId;

  // Le mouvement naît AVANT son écriture : c'est lui la pièce, et une écriture
  // sans pièce n'existe pas (principe P-2). `postDocumentEntryTx` a donc besoin
  // de son identifiant.
  const movement = await tx.stockMovement.create({
    data: {
      tenantId,
      type: 'ISSUE',
      itemId: params.itemId,
      locationId: params.locationId,
      movementDate: params.issueDate,
      quantity,
      isDecrease: true,
      // Le coût moyen d'AVANT la sortie, jamais un prix saisi (principe P-4).
      unitCost: roundQuantity(averageUnitCost),
      totalValue,
      currency: DEFAULT_CURRENCY,
      quantityAfter,
      valueAfter,
      siteId: params.siteId,
      costCategoryId: params.costCategoryId,
      requestedBy,
      createdByUserId: params.createdByUserId
    }
  });

  // Journal : débit du compte de charge du poste (ou 605 à défaut), crédit du
  // 311 — le matériau cesse d'être un actif et devient une charge du chantier.
  const entry = await postDocumentEntryTx(tx, {
    tenantId,
    journalId: accounts.journalId,
    entryDate: params.issueDate,
    reference: `SORT-${(movement as any).id}`,
    description: `Sortie de stock — ${item.label} — ${site.name}`,
    documentType: 'STOCK_ISSUE',
    documentId: (movement as any).id,
    lines: [
      { accountId: compteDeCharge, debit: totalValue, label: `Sortie de stock — ${item.label}` },
      { accountId: accounts.stockAccountId, credit: totalValue, label: `Stock — ${item.label}` }
    ]
  });

  // L'IMPUTATION. C'est elle, et elle seule, qui fait entrer le matériau dans
  // le coût réel du chantier — `validatedAt` renseigné, `voidedAt` nul, le
  // filtre exact que `sumSiteActualCost` lit (`site-cost.ts`).
  await tx.costAllocation.create({
    data: {
      tenantId,
      siteId: params.siteId,
      costCategoryId: params.costCategoryId,
      sourceType: 'STOCK_ISSUE',
      sourceId: (movement as any).id,
      amount: totalValue,
      validatedAt: new Date(),
      voidedAt: null
    }
  });

  // Le coût réel du chantier vient de changer : le programme de travaux
  // rattaché doit suivre, DANS CETTE transaction.
  await syncWorkProgramCostTx(tx, tenantId, params.siteId);

  await writeBalanceTx(tx, tenantId, params.itemId, params.locationId, previous, quantityAfter, valueAfter);

  const updated = await tx.stockMovement.update({
    // `tenantId` en plus de l'id : anticipe le futur garde-fou Prisma (lot D).
    where: { id: (movement as any).id, tenantId },
    data: { journalEntryId: entry.entryId },
    include: {
      item: { select: { reference: true, label: true, unit: true } },
      location: { select: { label: true } },
      site: { select: { name: true } },
      costCategory: { select: { label: true } },
      createdBy: { select: { fullName: true, email: true } }
    }
  });

  return toMovementRecord({
    ...(movement as any),
    ...(updated as any),
    item: (updated as any)?.item ?? item,
    site: (updated as any)?.site ?? site,
    costCategory: (updated as any)?.costCategory ?? costCategory
  });
};

// ---------------------------------------------------------------------------
// C. Ce qu'il reste, et ce que ça vaut (besoin S4)
// ---------------------------------------------------------------------------

/** Voir `ListStockBalances` dans `./types-lot5-mouvements.ts`. */
export const listStockBalances: ListStockBalances = async (tenantId, filters) => {
  const rows = await prisma.stockBalance.findMany({
    where: {
      tenantId,
      ...(filters?.locationId ? { locationId: filters.locationId } : {}),
      ...(filters?.itemId ? { itemId: filters.itemId } : {}),
      // Masque les lignes à quantité nulle, jamais un filtre appliqué en
      // mémoire après coup : un emplacement vidé reste en base, et une page
      // de stock n'a pas à en porter le poids.
      ...(filters?.onlyInStock ? { quantity: { gt: 0 } } : {})
    },
    include: {
      item: { select: { reference: true, label: true, unit: true } },
      location: { select: { label: true } }
    }
  });

  return (rows as any[])
    .map(toBalanceRecord)
    .sort((a, b) => a.locationLabel.localeCompare(b.locationLabel) || a.itemReference.localeCompare(b.itemReference));
};

// ---------------------------------------------------------------------------
// D. Le journal des mouvements — déplacé dans `stock-journal.ts` (lot 040,
//    fondations), sans changement de comportement.
// ---------------------------------------------------------------------------
