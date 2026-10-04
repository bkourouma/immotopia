/**
 * Transferts entre lieux — extrait de `stock-inventaire.ts` (lot 040, étape des
 * fondations, plan.md §3.1) **sans changement de comportement**.
 *
 * Le code ci-dessous est celui du lot 5, troisième sous-lot
 * (`types-lot5-inventaire.ts`, contrat gelé, PRD E9, besoin S4), déplacé tel
 * quel pour que le transfert et l'inventaire aient chacun leur fichier : le
 * lot 040 les fait évoluer par deux territoires distincts (API-1 pour le
 * transfert, API-2 pour l'inventaire). Les aides privées de lecture et
 * d'écriture du solde sont **recopiées** plutôt que partagées, pour la même
 * raison : aucun des deux fichiers ne dépend de l'autre.
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
 * Livrer du ciment sur un chantier *ressemble* à une dépense, et la compter
 * comme telle ferait monter le coût de matériaux qui dorment encore sous la
 * bâche. Le 311 ne bouge pas — la matière est toujours à l'actif, simplement
 * ailleurs — et `sumSiteActualCost` ne bouge pas non plus. Seule la **sortie**
 * impute (principe P-7, `stock-mouvements.ts`).
 *
 * Comportement du lot 5 conservé à cette étape : `assertSiteOpenTx` n'est pas
 * appelé ici, et un transfert vers le lieu d'un chantier clos est accepté. Le
 * lot 040 (A7-R4) le refusera ; ce changement appartient au territoire API-1,
 * pas à l'extraction.
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
 * Lecture avant écriture, toujours
 * ---------------------------------------------------------------------------
 *
 * En PostgreSQL une commande en échec **condamne toute la transaction** :
 * chaque commande suivante est refusée jusqu'au rollback. Tout ce qui peut
 * refuser le transfert est donc lu et vérifié avant le premier `create`.
 */

import { randomUUID } from 'crypto';

import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest, conflict, notFound } from '../errors';
import { roundMoneyXof, roundQuantity } from './money';
import { toAmountOrZero } from './types';
import type { StockMovementRecord } from './types-lot5-mouvements';
import type { RecordStockTransferTx } from './types-lot5-inventaire';

/** Devise unique du module (décision D9 du plan, actée au lot 1). */
const DEFAULT_CURRENCY = 'XOF';

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
// Gardes communes — lieu et article
// ---------------------------------------------------------------------------

/**
 * Le lieu, lu **directement par le client Prisma** : importer
 * `stock-referentiel.ts` ferait dépendre deux territoires l'un de l'autre.
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
 * L'article. **Un article désactivé reste transférable.**
 *
 * Désactiver un article veut dire « on n'en achète plus », jamais « abandonnez
 * ce qui est en magasin ». Refuser de déplacer un stock réel l'emprisonnerait.
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
    transferGroupId: row.transferGroupId ?? null,
    createdByLabel: toCreatedByLabel(row.createdBy),
    createdAt: row.createdAt
  };
}

// ---------------------------------------------------------------------------
// Le transfert — deux mouvements, aucune écriture, aucune imputation
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
