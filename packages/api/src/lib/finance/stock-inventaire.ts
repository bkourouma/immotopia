/**
 * Transferts entre lieux et inventaire physique — lot 5, troisième sous-lot
 * (`types-lot5-inventaire.ts`, contrat gelé, PRD E9, besoins S4 et S6).
 *
 * Gabarit suivi : `stock-mouvements.ts` (deuxième sous-lot), dont la mécanique
 * de solde — lecture du couple `StockBalance` / `quantityAfter`, coût moyen
 * pondéré déduit de `value / quantity`, valeur forcée à zéro quand la quantité
 * tombe à zéro — est reprise **à l'identique**. Un transfert et un ajustement
 * d'inventaire sont des mouvements comme les autres : ils n'ont pas le droit
 * d'avoir leur propre arithmétique.
 *
 * ---------------------------------------------------------------------------
 * Transférer ne crée ni ne détruit de valeur
 * ---------------------------------------------------------------------------
 *
 * La valeur part au coût moyen du lieu d'**origine** et recalcule celui du lieu
 * d'**arrivée** : les deux mouvements portent le **même** `totalValue`, si bien
 * que la somme des valeurs des deux lieux ne bouge pas d'un franc. C'est
 * l'invariant du transfert, et il tient y compris sur un coût moyen qui ne
 * tombe pas rond, parce que la sortie emporte exactement ce que l'entrée
 * reçoit — jamais deux arrondis calculés séparément.
 *
 * ---------------------------------------------------------------------------
 * Un transfert n'impute rien et n'écrit aucune écriture
 * ---------------------------------------------------------------------------
 *
 * **C'est le piège de ce sous-lot.** Livrer du ciment sur un chantier
 * *ressemble* à une dépense, et la compter comme telle ferait monter le coût de
 * matériaux qui dorment encore sous la bâche. Le 311 ne bouge pas — la matière
 * est toujours à l'actif, simplement ailleurs — et `sumSiteActualCost` ne bouge
 * pas non plus. Seule la **sortie** impute (principe P-7, `stock-mouvements.ts`).
 *
 * Conséquence directe : `assertSiteOpenTx` n'est **pas** appelé ici, et son
 * absence est un choix, pas un oubli. Un transfert vers le lieu d'un chantier
 * clos est accepté : y déposer du matériel n'impute rien, et un chantier clos
 * peut légitimement servir de lieu de stockage le temps qu'on l'évacue. C'est
 * la sortie qui est refusée, pas la livraison. Un test le documente pour que
 * personne ne le « corrige ».
 *
 * ---------------------------------------------------------------------------
 * Deux mouvements, une transaction
 * ---------------------------------------------------------------------------
 *
 * Une sortie du lieu d'origine, une entrée au lieu d'arrivée, liées par un même
 * `transferGroupId`, écrites dans **une seule** transaction : sans cela, une
 * panne entre les deux ferait disparaître de la matière.
 *
 * ---------------------------------------------------------------------------
 * L'inventaire : la quantité attendue est FIGÉE à la saisie
 * ---------------------------------------------------------------------------
 *
 * `expectedQuantity` **n'est pas un paramètre d'entrée** (principe P-4) : le
 * service la lit dans le stock au moment où la ligne est saisie, et ne la relit
 * jamais à la validation. La laisser saisir permettrait de fabriquer un écart
 * nul ; la relire comparerait le comptage d'hier au stock d'aujourd'hui.
 *
 * Conséquence assumée (contrat) : si du stock bouge entre le comptage et la
 * validation, l'ajustement ramène le solde à ce qui a été **compté**, en
 * écrasant ce mouvement. Le comptage physique fait foi.
 *
 * ---------------------------------------------------------------------------
 * Où passe l'argent d'un écart
 * ---------------------------------------------------------------------------
 *
 * ```
 * on a trouvé MOINS    débit  603 (variations de stock)   crédit 311
 * on a trouvé PLUS     débit  311                          crédit 603
 * ```
 *
 * Le 603 va dans les deux sens, et c'est pourquoi c'est lui plutôt qu'un compte
 * de charge : un compte de charge seul ne saurait pas dire le second cas. Un
 * écart n'est **jamais** imputé à un chantier — personne n'a décidé de
 * consommer ce qui a disparu, et aucune `CostAllocation` ne naît ici.
 *
 * ---------------------------------------------------------------------------
 * Lecture avant écriture, toujours
 * ---------------------------------------------------------------------------
 *
 * En PostgreSQL une commande en échec **condamne toute la transaction** :
 * chaque commande suivante est refusée jusqu'au rollback. On valide donc
 * l'intégralité d'un inventaire — toutes ses lignes en écart ont un motif —
 * **avant** d'écrire le premier ajustement, et les ajustements se traitent
 * **en séquence**, jamais en `Promise.all` : deux lignes pourraient viser le
 * même solde, et un solde lu en parallèle serait lu deux fois avant d'être
 * écrit une fois.
 */

import { randomUUID } from 'crypto';

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest, conflict, notFound } from '../errors';
import { ensureOperationalChartOfAccountsTx, ensureOperationalJournalTx, postDocumentEntryTx } from './accounting';
import { roundMoneyXof, roundQuantity } from './money';
import { toAmountOrZero } from './types';
import type { StockMovementRecord } from './types-lot5-mouvements';
import type {
  CreateStockCountTx,
  GetStockCount,
  ListStockCounts,
  RecordStockTransferTx,
  RemoveStockCountLineTx,
  SetStockCountLineTx,
  StockCountLineRecord,
  StockCountRecord,
  ValidateStockCountTx
} from './types-lot5-inventaire';

/** Devise unique du module (décision D9 du plan, actée au lot 1). */
const DEFAULT_CURRENCY = 'XOF';

/** `Decimal(16,4)` : la précision des quantités, qui n'est pas celle des montants. */

/**
 * Arrondit une QUANTITÉ, à quatre décimales.
 *
 * Jumelle de la fonction du même nom dans `stock-mouvements.ts`, qui ne
 * l'exporte pas. La recopier était le moindre mal : l'alternative était
 * d'écrire dans un fichier livré et vert, hors du territoire de cet agent.
 * Signalé au superviseur — sa place est dans `money.ts`, à côté de
 * `roundMoneyXof` et `roundPercent`.
 *
 * Ce n'est **pas** `roundMoneyXof`, et ce ne doit jamais le devenir : le franc
 * CFA n'a pas de subdivision, une tonne de ciment en a quatre.
 */

/**
 * Le coût moyen pondéré d'un emplacement. **Calculé, jamais stocké.**
 *
 * Vaut zéro quand la quantité est nulle — et non `null` : la quantité dit déjà
 * qu'il n'y a rien. Même règle et même code que `stock-mouvements.ts`.
 */
function averageUnitCostOf(quantity: number, value: number): number {
  if (quantity <= 0) {
    return 0;
  }
  return value / quantity;
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
      where: { id: previous.id },
      data: { quantity, value }
    });
    return;
  }

  await tx.stockBalance.create({
    data: { tenantId, itemId, locationId, quantity, value, currency: DEFAULT_CURRENCY }
  });
}

// ---------------------------------------------------------------------------
// Gardes communes — lieu et article
// ---------------------------------------------------------------------------

/**
 * Le lieu, lu **directement par le client Prisma**, comme dans
 * `stock-mouvements.ts` : importer `stock-referentiel.ts` ferait dépendre deux
 * territoires l'un de l'autre.
 *
 * Refus délibéré sur un lieu désactivé : désactiver un lieu est un geste de
 * paramétrage voulu, pas un état à contourner en silence.
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
    throw conflict('Ce lieu de stockage est désactivé');
  }
  return { id: location.id, label: location.label };
}

/**
 * L'article. **Un article désactivé reste transférable et reste comptable.**
 *
 * L'asymétrie est celle déjà arbitrée au sous-lot des mouvements : désactiver
 * un article veut dire « on n'en achète plus », jamais « abandonnez ce qui est
 * en magasin ». Refuser de déplacer ou de compter un stock réel
 * l'emprisonnerait, et l'agence devrait tricher pour s'en défaire.
 */
async function requireItemTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  itemId: string
): Promise<{ id: string; reference: string; label: string; unit: string }> {
  const item = await tx.stockItem.findFirst({
    where: { id: itemId, tenantId },
    select: { id: true, reference: true, label: true, unit: true }
  });
  if (!item) {
    throw notFound('Article de stock introuvable');
  }
  return item;
}

// ---------------------------------------------------------------------------
// Conversions Prisma -> contrat
// ---------------------------------------------------------------------------

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
    createdByLabel: toCreatedByLabel(row.createdBy),
    createdAt: row.createdAt
  };
}

// ---------------------------------------------------------------------------
// A. Le transfert — deux mouvements, aucune écriture, aucune imputation
// ---------------------------------------------------------------------------

/**
 * Voir `RecordStockTransferTx` dans `./types-lot5-inventaire.ts`.
 *
 * **N'appelle ni `postDocumentEntryTx`, ni `tx.costAllocation.create`, ni
 * `syncWorkProgramCostTx`, ni `assertSiteOpenTx`.** Aucune de ces absences
 * n'est un oubli : voir l'en-tête.
 */
export const recordStockTransferTx: RecordStockTransferTx = async (tx, tenantId, params) => {
  const quantity = roundQuantity(params.quantity);
  if (!(quantity > 0)) {
    throw badRequest('La quantité transférée doit être strictement positive');
  }

  // Refusé AVANT toute lecture : un transfert sur place ne déplace rien, et il
  // écrirait deux mouvements sur le même solde dont le second annulerait le
  // premier — une paire de lignes illisibles six mois plus tard.
  if (params.fromLocationId === params.toLocationId) {
    throw badRequest("Un transfert relie deux lieux distincts : l'origine et l'arrivée sont identiques");
  }

  // LECTURE AVANT ÉCRITURE (en-tête) : tout ce qui peut refuser le transfert
  // est lu et vérifié avant le premier `create`.
  const from = await requireActiveLocationTx(tx, tenantId, params.fromLocationId);
  const to = await requireActiveLocationTx(tx, tenantId, params.toLocationId);
  const item = await requireItemTx(tx, tenantId, params.itemId);

  const source = await readBalanceTx(tx, tenantId, params.itemId, params.fromLocationId);

  // Même interdiction dure qu'à la sortie, et pour la même raison : un stock
  // négatif n'a pas de coût moyen qui veuille dire quelque chose, et toute la
  // valorisation qui suit deviendrait fausse. Le geste juste est un inventaire.
  if (quantity > source.quantity) {
    throw conflict(
      `Stock insuffisant à « ${from.label} » : ${source.quantity} ${item.unit} disponible(s) pour ${quantity} demandé(s). ` +
        'Un inventaire, et non un transfert, corrige un écart de quantité physique.'
    );
  }

  const destination = await readBalanceTx(tx, tenantId, params.itemId, params.toLocationId);

  const averageUnitCost = averageUnitCostOf(source.quantity, source.value);
  const fromQuantityAfter = roundQuantity(source.quantity - quantity);

  // LA VALEUR DÉPLACÉE EST CALCULÉE UNE SEULE FOIS, et les deux mouvements la
  // portent. C'est ce qui rend l'invariant exact : deux arrondis calculés
  // séparément se seraient écartés d'un franc, et ce franc se serait créé ou
  // détruit à chaque transfert.
  let transferValue: number;
  let fromValueAfter: number;
  if (fromQuantityAfter <= 0) {
    // Quand la quantité tombe à zéro, la valeur aussi : le mouvement emporte
    // TOUTE la valeur restante, écart d'arrondi compris, et le solde d'origine
    // retombe à zéro des deux côtés (règle de `stock-mouvements.ts`).
    transferValue = roundMoneyXof(source.value);
    fromValueAfter = 0;
  } else {
    transferValue = roundMoneyXof(quantity * averageUnitCost);
    fromValueAfter = Math.max(0, roundMoneyXof(source.value - transferValue));
  }

  const toQuantityAfter = roundQuantity(destination.quantity + quantity);
  const toValueAfter = roundMoneyXof(destination.value + transferValue);

  // Les deux moitiés portent le MÊME identifiant de groupe : c'est lui, et lui
  // seul, qui dit qu'il s'agit d'un déplacement et non d'une perte d'un côté
  // suivie d'une apparition de l'autre.
  const transferGroupId = randomUUID();

  const include = {
    item: { select: { reference: true, label: true, unit: true } },
    location: { select: { label: true } },
    createdBy: { select: { fullName: true, email: true } }
  };

  const donneesCommunes = {
    tenantId,
    type: 'TRANSFER' as const,
    itemId: params.itemId,
    movementDate: params.transferDate,
    quantity,
    // Le coût moyen du lieu d'ORIGINE, pour les deux moitiés : c'est à ce
    // prix-là que la valeur part, et donc à ce prix-là qu'elle arrive.
    unitCost: roundQuantity(averageUnitCost),
    totalValue: transferValue,
    currency: DEFAULT_CURRENCY,
    transferGroupId,
    createdByUserId: params.createdByUserId
  };

  // LA SORTIE D'ABORD, L'ENTRÉE ENSUITE — l'ordre du contrat, et celui dans
  // lequel `movements` est rendu.
  const sortie = await tx.stockMovement.create({
    data: {
      ...donneesCommunes,
      locationId: params.fromLocationId,
      isDecrease: true,
      quantityAfter: fromQuantityAfter,
      valueAfter: fromValueAfter
    },
    include
  });

  const entree = await tx.stockMovement.create({
    data: {
      ...donneesCommunes,
      locationId: params.toLocationId,
      isDecrease: false,
      quantityAfter: toQuantityAfter,
      valueAfter: toValueAfter
    },
    include
  });

  await writeBalanceTx(tx, tenantId, params.itemId, params.fromLocationId, source, fromQuantityAfter, fromValueAfter);
  await writeBalanceTx(tx, tenantId, params.itemId, params.toLocationId, destination, toQuantityAfter, toValueAfter);

  return {
    transferGroupId,
    movements: [
      toMovementRecord({ ...(sortie as any), item: (sortie as any).item ?? item }),
      toMovementRecord({ ...(entree as any), item: (entree as any).item ?? item })
    ],
    fromLocationLabel: from.label,
    toLocationLabel: to.label,
    quantity,
    value: transferValue,
    currency: DEFAULT_CURRENCY
  };
};

// ---------------------------------------------------------------------------
// B. L'inventaire — lecture d'un comptage
// ---------------------------------------------------------------------------

/** L'inclusion unique de toutes les lectures d'inventaire. Une seule forme, un seul convertisseur. */
const COUNT_INCLUDE = {
  location: { select: { label: true } },
  createdBy: { select: { fullName: true, email: true } },
  lines: {
    include: { item: { select: { reference: true, label: true, unit: true } } }
  }
} as const;

/** Clé d'index d'un solde : le coût moyen est par (article, LIEU). */
function balanceKey(locationId: string, itemId: string): string {
  return `${locationId}|${itemId}`;
}

/**
 * Convertit un inventaire lu en base.
 *
 * `varianceValue` est valorisée au **coût moyen courant** de chaque article à
 * l'endroit compté (contrat) : c'est une estimation tant que l'inventaire est
 * en brouillon, et elle est négative quand il manque.
 */
function toCountRecord(row: any, averageCosts: Map<string, number>): StockCountRecord {
  const lignes = ((row.lines ?? []) as any[]).map((line): StockCountLineRecord => {
    const expectedQuantity = roundQuantity(toAmountOrZero(line.expectedQuantity));
    const countedQuantity = roundQuantity(toAmountOrZero(line.countedQuantity));
    return {
      id: line.id,
      itemId: line.itemId,
      itemReference: line.item?.reference ?? 'Article inconnu',
      itemLabel: line.item?.label ?? 'Article inconnu',
      itemUnit: line.item?.unit ?? '',
      expectedQuantity,
      countedQuantity,
      // Négatif quand il manque. Calculé, jamais stocké : une colonne de plus
      // serait un troisième chiffre à tenir d'accord avec les deux autres.
      variance: roundQuantity(countedQuantity - expectedQuantity),
      reason: line.reason ?? null
    };
  });

  lignes.sort((a, b) => a.itemReference.localeCompare(b.itemReference));

  const enEcart = lignes.filter(ligne => ligne.variance !== 0);
  const varianceValue = roundMoneyXof(
    enEcart.reduce(
      (total, ligne) => total + ligne.variance * (averageCosts.get(balanceKey(row.locationId, ligne.itemId)) ?? 0),
      0
    )
  );

  return {
    id: row.id,
    tenantId: row.tenantId,
    locationId: row.locationId,
    locationLabel: row.location?.label ?? 'Lieu inconnu',
    countedAt: row.countedAt,
    status: row.status,
    lines: lignes,
    varianceCount: enEcart.length,
    varianceValue,
    currency: DEFAULT_CURRENCY,
    createdByLabel: toCreatedByLabel(row.createdBy),
    validatedAt: row.validatedAt ?? null
  };
}

/**
 * Les coûts moyens courants des articles comptés, en **une seule** requête
 * pour tous les inventaires demandés — jamais une lecture par ligne, la
 * discipline du banc de charge du lot 0.
 */
async function readAverageCostsTx(
  client: PrismaTransactionClient,
  tenantId: string,
  rows: any[]
): Promise<Map<string, number>> {
  const locationIds = [...new Set(rows.map(row => row.locationId))];
  const itemIds = [...new Set(rows.flatMap(row => ((row.lines ?? []) as any[]).map(line => line.itemId)))];

  if (locationIds.length === 0 || itemIds.length === 0) {
    return new Map();
  }

  const balances = await client.stockBalance.findMany({
    where: { tenantId, locationId: { in: locationIds }, itemId: { in: itemIds } },
    select: { itemId: true, locationId: true, quantity: true, value: true }
  });

  const costs = new Map<string, number>();
  for (const balance of balances as any[]) {
    const quantity = roundQuantity(toAmountOrZero(balance.quantity));
    const value = roundMoneyXof(toAmountOrZero(balance.value));
    costs.set(balanceKey(balance.locationId, balance.itemId), averageUnitCostOf(quantity, value));
  }
  return costs;
}

/** Relit un inventaire dans sa transaction et le rend au format du contrat. */
async function reloadCountTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string
): Promise<StockCountRecord> {
  const row = await tx.stockCount.findFirst({
    where: { id: countId, tenantId },
    include: COUNT_INCLUDE
  });
  if (!row) {
    throw notFound('Inventaire introuvable');
  }
  const costs = await readAverageCostsTx(tx, tenantId, [row]);
  return toCountRecord(row, costs);
}

/**
 * L'inventaire brut, avec la garde d'état commune aux trois écritures de
 * lignes et à la validation.
 *
 * **Un inventaire validé ne se rouvre pas** (contrat) : ses ajustements sont
 * des mouvements comme les autres, et les défaire demanderait de rejouer tout
 * ce qui a suivi. Un comptage erroné se corrige par un second comptage.
 */
async function requireDraftCountTx(tx: PrismaTransactionClient, tenantId: string, countId: string): Promise<any> {
  const row = await tx.stockCount.findFirst({
    where: { id: countId, tenantId },
    include: COUNT_INCLUDE
  });
  if (!row) {
    throw notFound('Inventaire introuvable');
  }
  if ((row as any).status !== 'DRAFT') {
    throw conflict('Cet inventaire est déjà validé : un comptage erroné se corrige par un second comptage');
  }
  return row;
}

// ---------------------------------------------------------------------------
// C. Ouvrir un inventaire
// ---------------------------------------------------------------------------

/** Voir `CreateStockCountTx` dans `./types-lot5-inventaire.ts`. */
export const createStockCountTx: CreateStockCountTx = async (tx, tenantId, params) => {
  // Le lieu désactivé est refusé ici comme partout ailleurs dans le module. Le
  // contrat ne tranchait que pour le transfert ; le choix est signalé.
  await requireActiveLocationTx(tx, tenantId, params.locationId);

  // LECTURE AVANT ÉCRITURE : deux comptages simultanés du même dépôt
  // produiraient deux vérités, et le second validé écraserait le premier sans
  // que personne ne le voie.
  const dejaEnCours = await tx.stockCount.findFirst({
    where: { tenantId, locationId: params.locationId, status: 'DRAFT' },
    select: { id: true }
  });
  if (dejaEnCours) {
    throw conflict('Un inventaire est déjà en cours sur ce lieu de stockage');
  }

  const created = await tx.stockCount.create({
    data: {
      tenantId,
      locationId: params.locationId,
      countedAt: params.countedAt,
      status: 'DRAFT',
      createdByUserId: params.createdByUserId
    },
    select: { id: true }
  });

  return reloadCountTx(tx, tenantId, (created as any).id);
};

// ---------------------------------------------------------------------------
// D. Saisir une ligne — c'est ICI que la quantité attendue est figée
// ---------------------------------------------------------------------------

/** Voir `SetStockCountLineTx` dans `./types-lot5-inventaire.ts`. */
export const setStockCountLineTx: SetStockCountLineTx = async (tx, tenantId, countId, params) => {
  const countedQuantity = roundQuantity(params.countedQuantity);
  // Le zéro est ACCEPTÉ — « on a compté, il n'y a rien » est un résultat de
  // comptage, et le plus fréquent des écarts. Seul le négatif est refusé : on
  // ne peut pas compter moins que rien.
  if (!(countedQuantity >= 0)) {
    throw badRequest('La quantité comptée ne peut pas être négative');
  }

  const count = await requireDraftCountTx(tx, tenantId, countId);
  await requireItemTx(tx, tenantId, params.itemId);

  // LA QUANTITÉ ATTENDUE EST FIGÉE ICI, ET NULLE PART AILLEURS (principe P-4).
  // Elle n'est pas un paramètre : la laisser saisir permettrait de fabriquer un
  // écart nul. Elle n'est pas relue à la validation : ce serait comparer le
  // comptage d'hier au stock d'aujourd'hui.
  const solde = await readBalanceTx(tx, tenantId, params.itemId, count.locationId);
  const expectedQuantity = solde.quantity;

  const motif = typeof params.reason === 'string' ? params.reason.trim() : '';
  const reason = motif.length > 0 ? motif : null;

  // Rappeler le même article REMPLACE son comptage : on se reprend en comptant,
  // et une seconde ligne pour le même article rendrait l'écart ambigu.
  const existante = await tx.stockCountLine.findFirst({
    where: { countId: count.id, itemId: params.itemId },
    select: { id: true }
  });

  if (existante) {
    await tx.stockCountLine.update({
      where: { id: (existante as any).id },
      // `expectedQuantity` est refigée : une correction de comptage est une
      // NOUVELLE saisie, et elle se compare au stock de ce moment-là.
      data: { expectedQuantity, countedQuantity, reason }
    });
  } else {
    await tx.stockCountLine.create({
      data: { countId: count.id, itemId: params.itemId, expectedQuantity, countedQuantity, reason }
    });
  }

  return reloadCountTx(tx, tenantId, count.id);
};

/** Voir `RemoveStockCountLineTx` dans `./types-lot5-inventaire.ts`. */
export const removeStockCountLineTx: RemoveStockCountLineTx = async (tx, tenantId, countId, itemId) => {
  const count = await requireDraftCountTx(tx, tenantId, countId);

  const ligne = await tx.stockCountLine.findFirst({
    where: { countId: count.id, itemId },
    select: { id: true }
  });
  if (!ligne) {
    throw notFound('Cet article ne figure pas dans cet inventaire');
  }

  await tx.stockCountLine.delete({ where: { id: (ligne as any).id } });

  return reloadCountTx(tx, tenantId, count.id);
};

// ---------------------------------------------------------------------------
// E. Valider — les écarts deviennent des ajustements
// ---------------------------------------------------------------------------

interface AjustementAEcrire {
  itemId: string;
  itemLabel: string;
  reason: string;
  /** La quantité comptée : c'est ELLE que le solde doit atteindre. */
  countedQuantity: number;
}

/** Voir `ValidateStockCountTx` dans `./types-lot5-inventaire.ts`. */
export const validateStockCountTx: ValidateStockCountTx = async (tx, tenantId, countId, validatedByUserId) => {
  const count = await requireDraftCountTx(tx, tenantId, countId);
  const lignes = ((count.lines ?? []) as any[]).map(line => ({
    itemId: line.itemId,
    itemLabel: line.item?.label ?? 'Article inconnu',
    expectedQuantity: roundQuantity(toAmountOrZero(line.expectedQuantity)),
    countedQuantity: roundQuantity(toAmountOrZero(line.countedQuantity)),
    reason: typeof line.reason === 'string' ? line.reason.trim() : ''
  }));

  // Valider un comptage vide ne dit rien, et pourrait se lire comme « tout est
  // conforme » — la pire des lectures possibles.
  if (lignes.length === 0) {
    throw conflict('Cet inventaire ne porte aucune ligne : un comptage vide ne dit rien');
  }

  // L'ÉCART SE LIT SUR LA QUANTITÉ ATTENDUE FIGÉE, jamais sur le stock
  // d'aujourd'hui (contrat, en-tête).
  const aEcrire: AjustementAEcrire[] = [];
  for (const ligne of lignes) {
    const variance = roundQuantity(ligne.countedQuantity - ligne.expectedQuantity);
    if (variance === 0) {
      // Une ligne qui tombe juste ne produit RIEN : ni mouvement, ni écriture.
      continue;
    }
    // Besoin S6 : un écart sans motif ne se valide pas. Une validation qui le
    // laisserait passer transformerait une perte en ligne de tableau que
    // personne ne relira. Refusé AVANT le premier ajustement écrit, parce
    // qu'en PostgreSQL un refus au milieu condamne toute la transaction.
    if (!ligne.reason) {
      throw conflict(
        `L'écart constaté sur « ${ligne.itemLabel} » n'a pas de motif : une perte sans explication ne se valide pas`
      );
    }
    aEcrire.push({
      itemId: ligne.itemId,
      itemLabel: ligne.itemLabel,
      reason: ligne.reason,
      countedQuantity: ligne.countedQuantity
    });
  }

  if (aEcrire.length > 0) {
    const [journalId, comptes] = await Promise.all([
      ensureOperationalJournalTx(tx, tenantId, (count.countedAt as Date).getUTCFullYear()),
      ensureOperationalChartOfAccountsTx(tx, tenantId)
    ]);
    const stockAccountId = comptes.get('311');
    const variationAccountId = comptes.get('603');
    if (!stockAccountId || !variationAccountId) {
      throw new Error('Comptes opérationnels 311 ou 603 absents après amorçage du plan de comptes.');
    }

    // EN SÉQUENCE, jamais en parallèle : un solde lu en parallèle serait lu
    // deux fois avant d'être écrit une fois.
    for (const ajustement of aEcrire) {
      const previous = await readBalanceTx(tx, tenantId, ajustement.itemId, count.locationId);

      // L'ajustement RAMÈNE LE SOLDE À LA QUANTITÉ COMPTÉE. Il se mesure donc
      // sur l'état d'aujourd'hui, pas sur l'écart figé : si du stock a bougé
      // depuis le comptage, le comptage physique fait foi et l'écrase.
      const delta = roundQuantity(ajustement.countedQuantity - previous.quantity);
      if (delta === 0) {
        // Le solde est déjà à la quantité comptée : il n'y a rien à ramener.
        // Écrire un mouvement de zéro ne dirait rien et salirait le journal.
        continue;
      }

      const isDecrease = delta < 0;
      const quantity = roundQuantity(Math.abs(delta));
      // Valorisé au COÛT MOYEN COURANT DU LIEU, jamais à un prix saisi
      // (contrat, principe P-4). Sur un stock à quantité nulle il vaut zéro, et
      // l'entrée vaut zéro : c'est consigné, pas caché.
      const averageUnitCost = averageUnitCostOf(previous.quantity, previous.value);
      const quantityAfter = ajustement.countedQuantity;

      let totalValue: number;
      let valueAfter: number;
      if (isDecrease && quantityAfter <= 0) {
        // Quand la quantité tombe à zéro, la valeur aussi.
        totalValue = roundMoneyXof(previous.value);
        valueAfter = 0;
      } else if (isDecrease) {
        totalValue = roundMoneyXof(quantity * averageUnitCost);
        valueAfter = Math.max(0, roundMoneyXof(previous.value - totalValue));
      } else {
        totalValue = roundMoneyXof(quantity * averageUnitCost);
        valueAfter = roundMoneyXof(previous.value + totalValue);
      }

      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          type: 'ADJUSTMENT',
          itemId: ajustement.itemId,
          locationId: count.locationId,
          movementDate: count.countedAt,
          quantity,
          // Le signe ne dit jamais le sens : c'est `isDecrease` qui le porte,
          // et c'est pour l'ajustement qu'il a été mis au schéma.
          isDecrease,
          unitCost: roundQuantity(averageUnitCost),
          totalValue,
          currency: DEFAULT_CURRENCY,
          quantityAfter,
          valueAfter,
          stockCountId: count.id,
          reason: ajustement.reason,
          createdByUserId: validatedByUserId
        },
        select: { id: true }
      });

      // LE 603 VA DANS LES DEUX SENS, et c'est pourquoi c'est lui : un compte
      // de charge seul ne saurait pas dire qu'on a trouvé PLUS que prévu.
      const lines = isDecrease
        ? [
            { accountId: variationAccountId, debit: totalValue, label: `Écart d'inventaire — ${ajustement.itemLabel}` },
            { accountId: stockAccountId, credit: totalValue, label: `Stock — ${ajustement.itemLabel}` }
          ]
        : [
            { accountId: stockAccountId, debit: totalValue, label: `Stock — ${ajustement.itemLabel}` },
            { accountId: variationAccountId, credit: totalValue, label: `Écart d'inventaire — ${ajustement.itemLabel}` }
          ];

      const entry = await postDocumentEntryTx(tx, {
        tenantId,
        journalId,
        entryDate: count.countedAt,
        reference: `INV-${(movement as any).id}`,
        description: `Écart d'inventaire — ${ajustement.itemLabel}`,
        // La nature en clair, jamais un transtypage : l'union la connaît.
        documentType: 'STOCK_ADJUSTMENT',
        documentId: (movement as any).id,
        lines
      });

      await tx.stockMovement.update({
        where: { id: (movement as any).id },
        data: { journalEntryId: entry.entryId }
      });

      // AUCUNE `CostAllocation`, et c'est le point du contrat : personne n'a
      // décidé de consommer ce qui a disparu. Un écart n'est jamais imputé à un
      // chantier, et le coût réel d'un chantier ne bouge pas d'un franc ici.

      await writeBalanceTx(tx, tenantId, ajustement.itemId, count.locationId, previous, quantityAfter, valueAfter);
    }
  }

  await tx.stockCount.update({
    where: { id: count.id },
    data: { status: 'VALIDATED', validatedAt: new Date(), validatedByUserId }
  });

  return reloadCountTx(tx, tenantId, count.id);
};

// ---------------------------------------------------------------------------
// F. Les lectures
// ---------------------------------------------------------------------------

/** Voir `ListStockCounts` dans `./types-lot5-inventaire.ts`. */
export const listStockCounts: ListStockCounts = async (tenantId, filters) => {
  const rows = await prisma.stockCount.findMany({
    where: {
      tenantId,
      ...(filters?.locationId ? { locationId: filters.locationId } : {}),
      ...(filters?.status ? { status: filters.status } : {})
    },
    include: COUNT_INCLUDE,
    orderBy: [{ countedAt: 'desc' }, { createdAt: 'desc' }]
  });

  const costs = await readAverageCostsTx(prisma as any, tenantId, rows as any[]);
  return (rows as any[]).map(row => toCountRecord(row, costs));
};

/** Voir `GetStockCount` dans `./types-lot5-inventaire.ts`. */
export const getStockCount: GetStockCount = async (tenantId, countId) => {
  const row = await prisma.stockCount.findFirst({
    where: { id: countId, tenantId },
    include: COUNT_INCLUDE
  });
  if (!row) {
    throw notFound('Inventaire introuvable');
  }

  const costs = await readAverageCostsTx(prisma as any, tenantId, [row as any]);
  return toCountRecord(row, costs);
};
