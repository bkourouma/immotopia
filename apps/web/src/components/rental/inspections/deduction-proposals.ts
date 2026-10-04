import { InspectionDeduction, InspectionItem, InspectionRoom } from '../../../services/lease-inspections-service';
import { compareItemPair } from './inspection-constants';
import { t } from '../../../i18n/t';

/**
 * Proposition des retenues d'une sortie (spec 040, M5).
 *
 * Fonction pure, appelée seulement sur un clic de l'agent : rien n'est ajouté
 * sans ce geste, et chaque ligne reste modifiable ou supprimable avant
 * « Enregistrer ». Un élément manquant ou en baisse de quantité reçoit la
 * valeur de remplacement × la quantité manquante ; une dégradation, une ligne
 * à 0 FCFA (aucune valeur de réparation n'est connue) ; des clés en moins,
 * une ligne à 0 FCFA.
 *
 * Les libellés sont produits dans la langue de l'agent puis stockés, comme
 * avant ce volet.
 */

/** Élément d'entrée correspondant, retrouvé par identifiant. */
export interface EntryLookup {
  item: InspectionItem;
  roomName: string;
}

export interface ProposeDeductionsInput {
  rooms: InspectionRoom[];
  entryItemsById: Map<string, EntryLookup> | undefined;
  entryKeysCount: number | null | undefined;
  exitKeysCount: number | null | undefined;
  existing: InspectionDeduction[];
}

function missingLabel(roomName: string, item: InspectionItem, missingQuantity: number, entryQuantity: number | null) {
  if (entryQuantity !== null && missingQuantity < entryQuantity) {
    return t('{{piece}} — {{element}} : {{manquants}} manquant(s) sur {{total}}', {
      piece: roomName,
      element: item.label,
      manquants: missingQuantity,
      total: entryQuantity
    });
  }
  return t('{{piece}} — {{element}} : {{quantite}} manquant(s)', {
    piece: roomName,
    element: item.label,
    quantite: missingQuantity
  });
}

function proposeForItem(
  room: InspectionRoom,
  item: InspectionItem,
  entryItem: InspectionItem
): InspectionDeduction | null {
  const diff = compareItemPair(entryItem, item);
  if (diff.missingQuantity > 0) {
    const proposedAmount = diff.replacementValue !== null ? diff.replacementValue * diff.missingQuantity : null;
    return {
      id: crypto.randomUUID(),
      label: missingLabel(room.name, item, diff.missingQuantity, diff.entryQuantity),
      amount: proposedAmount ?? 0,
      roomId: room.id,
      itemId: item.id,
      source: 'MISSING',
      proposedAmount
    };
  }
  if (diff.degraded) {
    return {
      id: crypto.randomUUID(),
      label: t('{{piece}} — {{element}} (dégradé)', { piece: room.name, element: item.label }),
      amount: 0,
      roomId: room.id,
      itemId: item.id,
      source: 'DEGRADED',
      proposedAmount: null
    };
  }
  return null;
}

/** Nombre de clés manquantes, `null` si l'un des deux comptes est inconnu. */
export function missingKeys(entryKeysCount: number | null | undefined, exitKeysCount: number | null | undefined) {
  if (entryKeysCount === null || entryKeysCount === undefined) return null;
  if (exitKeysCount === null || exitKeysCount === undefined) return null;
  return Math.max(0, entryKeysCount - exitKeysCount);
}

/**
 * Lignes de retenue à ajouter. Pas de doublon : un élément qui a déjà une
 * ligne (même `itemId`) est ignoré, et une seule ligne de clés au plus.
 */
export function proposeDeductions({
  rooms,
  entryItemsById,
  entryKeysCount,
  exitKeysCount,
  existing
}: ProposeDeductionsInput): InspectionDeduction[] {
  const existingItemIds = new Set(existing.map(deduction => deduction.itemId).filter(Boolean));
  const proposals: InspectionDeduction[] = [];

  if (entryItemsById) {
    for (const room of rooms) {
      for (const item of room.items) {
        const entryLookup = entryItemsById.get(item.id);
        if (!entryLookup || existingItemIds.has(item.id)) continue;
        const proposal = proposeForItem(room, item, entryLookup.item);
        if (proposal) proposals.push(proposal);
      }
    }
  }

  const keys = missingKeys(entryKeysCount, exitKeysCount);
  const hasKeysLine = existing.some(deduction => deduction.source === 'KEYS');
  if (keys !== null && keys > 0 && !hasKeysLine) {
    proposals.push({
      id: crypto.randomUUID(),
      label: t('Clés manquantes : {{nombre}}', { nombre: keys }),
      amount: 0,
      roomId: null,
      itemId: null,
      source: 'KEYS',
      proposedAmount: null
    });
  }

  return proposals;
}

/**
 * Éléments manquants ou en baisse de quantité qui n'ont aucune ligne de
 * retenue — annoncés à la confirmation de finalisation, sans la bloquer.
 */
export function countMissingWithoutDeduction(
  rooms: InspectionRoom[],
  entryItemsById: Map<string, EntryLookup> | undefined,
  deductions: InspectionDeduction[]
): number {
  if (!entryItemsById) return 0;
  const coveredItemIds = new Set(deductions.map(deduction => deduction.itemId).filter(Boolean));
  let count = 0;
  for (const room of rooms) {
    for (const item of room.items) {
      const entryLookup = entryItemsById.get(item.id);
      if (!entryLookup || coveredItemIds.has(item.id)) continue;
      if (compareItemPair(entryLookup.item, item).missingQuantity > 0) count += 1;
    }
  }
  return count;
}
