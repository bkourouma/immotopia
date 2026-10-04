import { randomUUID } from 'crypto';

/**
 * États des lieux — forme des colonnes JSON et règles pures (spec 040, volet
 * meublés, exigences M1 à M5). Aucun accès à la base : tout se teste seul.
 *
 * Référence de la forme stockée dans `LeaseInspection.rooms` :
 *
 *   rooms: [{ id, name, items: [{
 *     id, label,
 *     condition: NEW | GOOD | FAIR | POOR | BROKEN | MISSING | null,
 *     comment: string | null,
 *     kind?: FIXTURE | FURNITURE        // absent = FIXTURE (bâti)
 *     quantity?: number | null           // mobilier seulement, entier 0..9 999
 *     replacementValue?: number | null   // FCFA à l'unité, entier 0..100 000 000
 *   }] }]
 *
 * et de `LeaseInspection.deductions` :
 *
 *   deductions: [{ id, label, amount, roomId, itemId,
 *     source?: MANUAL | DEGRADED | MISSING | KEYS,   // absent = MANUAL
 *     proposedAmount?: number | null }]
 *
 * Les trois champs d'élément et les deux champs de retenue sont facultatifs :
 * un document enregistré avant le volet meublés reste valide tel quel, et
 * `normalizeRooms` / `normalizeDeductions` les complètent à la lecture sans
 * rien réécrire en base.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Condition = 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'BROKEN' | 'MISSING';
export const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'BROKEN', 'MISSING'] as const;

export type ItemKind = 'FIXTURE' | 'FURNITURE';
export const ITEM_KINDS = ['FIXTURE', 'FURNITURE'] as const;

export type DeductionSource = 'MANUAL' | 'DEGRADED' | 'MISSING' | 'KEYS';
export const DEDUCTION_SOURCES = ['MANUAL', 'DEGRADED', 'MISSING', 'KEYS'] as const;

export type InspectionTemplate = 'STANDARD' | 'FURNISHED';

export interface InspectionItem {
  id: string;
  label: string;
  condition: Condition | null;
  comment: string | null;
  kind?: ItemKind;
  quantity?: number | null;
  replacementValue?: number | null;
}

export interface InspectionRoom {
  id: string;
  name: string;
  items: InspectionItem[];
}

export interface Deduction {
  id: string;
  label: string;
  amount: number;
  roomId: string | null;
  itemId: string | null;
  source?: DeductionSource;
  proposedAmount?: number | null;
}

export interface InspectionMeters {
  electricity?: string | null;
  water?: string | null;
  gas?: string | null;
}

export const MAX_QUANTITY = 9999;
export const MAX_REPLACEMENT_VALUE = 100_000_000;

// ---------------------------------------------------------------------------
// R1 — Modèles de pièces
// ---------------------------------------------------------------------------

const STANDARD_ROOM_ITEMS = ['Sol', 'Murs', 'Plafond', 'Portes', 'Fenêtres', 'Prises et interrupteurs', 'Éclairage'];

/**
 * Pièces du modèle actuel, dans l'ordre, avec leurs éléments de bâti. Les
 * libellés sont des données stockées en français (l'agent les renomme), pas
 * des textes d'interface : ils ne passent pas par `t()`.
 */
const STANDARD_ROOMS: Array<{ name: string; fixtures: string[] }> = [
  { name: 'Entrée/Séjour', fixtures: STANDARD_ROOM_ITEMS },
  { name: 'Cuisine', fixtures: [...STANDARD_ROOM_ITEMS, 'Évier et robinetterie', 'Placards'] },
  { name: 'Chambre 1', fixtures: [...STANDARD_ROOM_ITEMS, 'Placards'] },
  { name: 'Salle de bain', fixtures: ['Sol', 'Murs', 'Douche ou baignoire', 'Lavabo', 'Robinetterie', 'Ventilation'] },
  { name: 'WC', fixtures: ['Sol', 'Murs', "Cuvette et chasse d'eau"] }
];

/** Mobilier ajouté par le modèle « Bâti, mobilier et équipements » (M1), après le bâti. */
const FURNITURE_BY_ROOM: Record<string, string[]> = {
  'Entrée/Séjour': [
    'Canapé',
    'Fauteuils',
    'Table basse',
    'Table à manger',
    'Chaises',
    'Téléviseur',
    'Télécommandes',
    'Climatiseur',
    'Ventilateur',
    'Rideaux',
    'Lampes'
  ],
  Cuisine: [
    'Réfrigérateur',
    'Cuisinière ou plaques de cuisson',
    'Bouteille de gaz',
    'Four à micro-ondes',
    'Bouilloire',
    'Assiettes',
    'Verres',
    'Couverts',
    'Casseroles et poêles',
    'Ustensiles de cuisine',
    'Poubelle'
  ],
  'Chambre 1': [
    'Lit',
    'Matelas',
    'Oreillers',
    'Jeux de draps',
    'Couvertures',
    'Armoire ou penderie',
    'Cintres',
    'Table de chevet',
    'Climatiseur',
    'Moustiquaire',
    'Rideaux'
  ],
  'Salle de bain': ['Serviettes', 'Tapis de bain', 'Miroir', 'Chauffe-eau'],
  WC: []
};

const EQUIPMENT_ROOM = {
  name: 'Équipements et divers',
  furniture: [
    'Fer à repasser',
    'Planche à repasser',
    'Balai et serpillière',
    'Extincteur',
    'Décodeur TV',
    'Box internet'
  ]
};

function makeFixtures(labels: string[]): InspectionItem[] {
  return labels.map(label => ({
    id: randomUUID(),
    label,
    condition: null,
    comment: null,
    kind: 'FIXTURE' as const,
    quantity: null,
    replacementValue: null
  }));
}

function makeFurniture(labels: string[], quantity: number | null): InspectionItem[] {
  return labels.map(label => ({
    id: randomUUID(),
    label,
    condition: null,
    comment: null,
    kind: 'FURNITURE' as const,
    quantity,
    replacementValue: null
  }));
}

/** Modèle « Bâti seulement » : le modèle historique, éléments en `FIXTURE`. */
export function defaultRooms(): InspectionRoom[] {
  return STANDARD_ROOMS.map(room => ({ id: randomUUID(), name: room.name, items: makeFixtures(room.fixtures) }));
}

/**
 * Modèle « Bâti, mobilier et équipements » : le bâti de chaque pièce, puis
 * son mobilier, puis une sixième pièce d'équipements. Quantité 1 à l'entrée
 * (`withQuantities`), vide à la sortie.
 */
export function furnishedRooms({ withQuantities }: { withQuantities: boolean }): InspectionRoom[] {
  const quantity = withQuantities ? 1 : null;
  const rooms = STANDARD_ROOMS.map(room => ({
    id: randomUUID(),
    name: room.name,
    items: [...makeFixtures(room.fixtures), ...makeFurniture(FURNITURE_BY_ROOM[room.name] ?? [], quantity)]
  }));
  rooms.push({ id: randomUUID(), name: EQUIPMENT_ROOM.name, items: makeFurniture(EQUIPMENT_ROOM.furniture, quantity) });
  return rooms;
}

/** Pièces de départ d'un nouvel état des lieux sans document d'entrée à reprendre. */
export function templateRooms(template: InspectionTemplate, { withQuantities }: { withQuantities: boolean }) {
  return template === 'FURNISHED' ? furnishedRooms({ withQuantities }) : defaultRooms();
}

/**
 * Reprend les pièces d'un document (l'entrée) pour la sortie : mêmes
 * identifiants, `kind` et `replacementValue` conservés ; état, commentaire et
 * quantité vidés.
 */
export function blankRoomsFrom(rooms: InspectionRoom[]): InspectionRoom[] {
  return normalizeRooms(rooms).map(room => ({
    id: room.id,
    name: room.name,
    items: room.items.map(item => ({
      id: item.id,
      label: item.label,
      condition: null,
      comment: null,
      kind: item.kind,
      quantity: null,
      replacementValue: item.replacementValue ?? null
    }))
  }));
}

// ---------------------------------------------------------------------------
// Lecture défensive des colonnes JSON (§5.1, compatibilité ascendante)
// ---------------------------------------------------------------------------

export function itemKind(item: Pick<InspectionItem, 'kind'>): ItemKind {
  return item.kind === 'FURNITURE' ? 'FURNITURE' : 'FIXTURE';
}

function normalizeItem(item: InspectionItem): InspectionItem {
  return {
    ...item,
    kind: itemKind(item),
    quantity: item.quantity ?? null,
    replacementValue: item.replacementValue ?? null
  };
}

/** Complète chaque élément : `kind ?? 'FIXTURE'`, `quantity ?? null`, `replacementValue ?? null`. */
export function normalizeRooms(value: unknown): InspectionRoom[] {
  if (!Array.isArray(value)) return [];
  return (value as InspectionRoom[]).map(room => ({
    ...room,
    items: Array.isArray(room?.items) ? room.items.map(normalizeItem) : []
  }));
}

/** Complète chaque retenue : `source ?? 'MANUAL'`, `proposedAmount ?? null`. */
export function normalizeDeductions(value: unknown): Deduction[] {
  if (!Array.isArray(value)) return [];
  return (value as Deduction[]).map(deduction => ({
    ...deduction,
    source: deduction.source ?? 'MANUAL',
    proposedAmount: deduction.proposedAmount ?? null
  }));
}

/**
 * R3 — après validation : un élément de bâti n'a pas de quantité ; un
 * élément de mobilier manquant a une quantité de 0, quelle que soit la
 * valeur reçue.
 */
export function normalizeItemQuantity<T extends InspectionItem>(item: T): T {
  if (itemKind(item) === 'FIXTURE') return { ...item, quantity: null };
  if (item.condition === 'MISSING') return { ...item, quantity: 0 };
  return item;
}

// ---------------------------------------------------------------------------
// R4 — sortie : un élément repris d'une entrée finalisée reste en place
// ---------------------------------------------------------------------------

export interface RemovedEntryItem {
  itemId: string;
  label: string;
}

function itemsById(rooms: InspectionRoom[]): Map<string, InspectionItem> {
  const map = new Map<string, InspectionItem>();
  for (const room of rooms) {
    for (const item of room.items) map.set(item.id, item);
  }
  return map;
}

/**
 * Éléments de l'entrée présents dans la sortie enregistrée et absents du corps
 * reçu. Comparer à la sortie **enregistrée** (et non à toute l'entrée) laisse
 * passer un ancien brouillon d'où un élément avait déjà été retiré : il
 * ressort en « Absent de la sortie » dans la comparaison.
 */
export function findRemovedEntryItems(
  entryRooms: InspectionRoom[],
  savedExitRooms: InspectionRoom[],
  incomingRooms: InspectionRoom[]
): RemovedEntryItem[] {
  const savedIds = itemsById(savedExitRooms);
  const incomingIds = itemsById(incomingRooms);
  const removed: RemovedEntryItem[] = [];
  for (const room of entryRooms) {
    for (const item of room.items) {
      if (savedIds.has(item.id) && !incomingIds.has(item.id)) {
        removed.push({ itemId: item.id, label: item.label });
      }
    }
  }
  return removed;
}

/**
 * Fige libellé, nature et valeur de remplacement des éléments repris d'une
 * entrée finalisée : ceux du corps reçu sont remplacés par ceux de l'entrée,
 * sans erreur. Renommer « Téléviseur » en « Carton vide » à la sortie
 * fausserait la comparaison et la retenue proposée.
 */
export function freezeEntryFields(incomingRooms: InspectionRoom[], entryRooms: InspectionRoom[]): InspectionRoom[] {
  const entryItems = itemsById(normalizeRooms(entryRooms));
  return incomingRooms.map(room => ({
    ...room,
    items: room.items.map(item => {
      const entryItem = entryItems.get(item.id);
      if (!entryItem) return item;
      return normalizeItemQuantity({
        ...item,
        label: entryItem.label,
        kind: itemKind(entryItem),
        replacementValue: entryItem.replacementValue ?? null
      });
    })
  }));
}

// ---------------------------------------------------------------------------
// R5 — finalisation : chaque élément évalué
// ---------------------------------------------------------------------------

export interface UnevaluatedItem {
  roomId: string;
  roomName: string;
  itemId: string;
  label: string;
  missing: 'CONDITION' | 'QUANTITY';
}

/**
 * Éléments non évalués : état vide ; ou mobilier non manquant sans quantité.
 * Un élément ancien sans `kind` est traité en bâti.
 */
export function findUnevaluatedItems(rooms: InspectionRoom[]): UnevaluatedItem[] {
  const result: UnevaluatedItem[] = [];
  for (const room of rooms) {
    for (const item of room.items) {
      const base = { roomId: room.id, roomName: room.name, itemId: item.id, label: item.label };
      if (item.condition === null || item.condition === undefined) {
        result.push({ ...base, missing: 'CONDITION' });
      } else if (
        itemKind(item) === 'FURNITURE' &&
        item.condition !== 'MISSING' &&
        (item.quantity === null || item.quantity === undefined)
      ) {
        result.push({ ...base, missing: 'QUANTITY' });
      }
    }
  }
  return result;
}

export function countItems(rooms: InspectionRoom[]): number {
  return rooms.reduce((total, room) => total + room.items.length, 0);
}

// ---------------------------------------------------------------------------
// R6 — comparaison entrée / sortie
// ---------------------------------------------------------------------------

export interface CompareRow {
  roomId: string;
  roomName: string;
  itemId: string;
  label: string;
  entryCondition: Condition | null;
  exitCondition: Condition | null;
  degraded: boolean;
  kind: ItemKind;
  entryQuantity: number | null;
  exitQuantity: number | null;
  missing: boolean;
  quantityDecrease: number;
  missingQuantity: number;
  absentFromExit: boolean;
  replacementValue: number | null;
  missingValue: number | null;
}

/** Rang de l'état, du meilleur au pire ; `MISSING` ne sert qu'à l'ordre d'affichage. */
export const CONDITION_RANK: Record<Condition, number> = { NEW: 0, GOOD: 1, FAIR: 2, POOR: 3, BROKEN: 4, MISSING: 5 };

function buildRow(
  room: InspectionRoom,
  entryItem: InspectionItem | null,
  exitItem: InspectionItem | null,
  exitExists: boolean
): CompareRow {
  const item = (entryItem ?? exitItem) as InspectionItem;
  const kind: ItemKind = entryItem?.kind ?? exitItem?.kind ?? 'FIXTURE';
  const entryCondition = entryItem?.condition ?? null;
  const exitCondition = exitItem?.condition ?? null;
  const entryQuantity = kind === 'FURNITURE' ? (entryItem?.quantity ?? null) : null;
  const exitQuantity =
    kind === 'FURNITURE' && exitItem ? (exitItem.condition === 'MISSING' ? 0 : (exitItem.quantity ?? null)) : null;
  const missing = exitCondition === 'MISSING' && entryCondition !== 'MISSING';
  const quantityDecrease =
    !missing && entryQuantity !== null && exitQuantity !== null ? Math.max(0, entryQuantity - exitQuantity) : 0;
  const missingQuantity = missing ? (entryQuantity ?? 1) : quantityDecrease;
  const degraded =
    entryCondition !== null &&
    exitCondition !== null &&
    entryCondition !== 'MISSING' &&
    exitCondition !== 'MISSING' &&
    CONDITION_RANK[exitCondition] > CONDITION_RANK[entryCondition];
  const replacementValue = entryItem?.replacementValue ?? exitItem?.replacementValue ?? null;
  const missingValue = replacementValue !== null && missingQuantity > 0 ? replacementValue * missingQuantity : null;

  return {
    roomId: room.id,
    roomName: room.name,
    itemId: item.id,
    label: item.label,
    entryCondition,
    exitCondition,
    degraded,
    kind,
    entryQuantity,
    exitQuantity,
    missing,
    quantityDecrease,
    missingQuantity,
    absentFromExit: exitExists && entryItem !== null && exitItem === null,
    replacementValue,
    missingValue
  };
}

/**
 * Compare un état des lieux d'entrée et de sortie, élément par élément.
 *
 * Part des pièces de l'entrée, dans leur ordre ; les éléments qui n'existent
 * que côté sortie sont ajoutés à la suite. Le rapprochement se fait par
 * identifiant d'élément (unique dans un document) : un élément déplacé d'une
 * pièce à l'autre reste rapproché.
 */
export function compareInspections(
  entry: { rooms: InspectionRoom[] } | null,
  exit: { rooms: InspectionRoom[] } | null
): CompareRow[] {
  const entryRooms = normalizeRooms(entry?.rooms ?? []);
  const exitRooms = normalizeRooms(exit?.rooms ?? []);
  const exitItems = itemsById(exitRooms);
  const exitExists = exit !== null;

  const rows: CompareRow[] = [];
  const seen = new Set<string>();

  for (const room of entryRooms) {
    for (const item of room.items) {
      seen.add(item.id);
      rows.push(buildRow(room, item, exitItems.get(item.id) ?? null, exitExists));
    }
  }

  for (const room of exitRooms) {
    for (const item of room.items) {
      if (seen.has(item.id)) continue;
      rows.push(buildRow(room, null, item, exitExists));
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// R7 — synthèse : clés, compteurs, totaux
// ---------------------------------------------------------------------------

export type MeterKey = 'electricity' | 'water' | 'gas';
export const METER_KEYS: MeterKey[] = ['electricity', 'water', 'gas'];

export interface MeterComparison {
  entry: string | null;
  exit: string | null;
  difference: number | null;
}

export interface CompareSummary {
  keys: { entry: number | null; exit: number | null; missing: number | null };
  meters: Record<MeterKey, MeterComparison>;
  missingCount: number;
  quantityDecreaseCount: number;
  degradedCount: number;
  absentFromExitCount: number;
  missingValueTotal: number;
  missingWithoutValueCount: number;
}

interface SummarySource {
  keysCount?: number | null;
  meters?: InspectionMeters | null;
}

/**
 * Lit un relevé de compteur comme un nombre : espaces (y compris insécables)
 * retirés, virgule lue comme un point. `null` si le texte n'est pas un nombre.
 */
export function parseMeterReading(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const cleaned = value.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareMeter(entryValue: string | null, exitValue: string | null): MeterComparison {
  const entryNumber = parseMeterReading(entryValue);
  const exitNumber = parseMeterReading(exitValue);
  const difference =
    entryNumber !== null && exitNumber !== null ? Math.round((exitNumber - entryNumber) * 1e6) / 1e6 : null;
  return { entry: entryValue, exit: exitValue, difference };
}

export function compareSummary(
  entry: SummarySource | null,
  exit: SummarySource | null,
  rows: CompareRow[]
): CompareSummary {
  const keysEntry = entry?.keysCount ?? null;
  const keysExit = exit?.keysCount ?? null;
  const meters = {} as Record<MeterKey, MeterComparison>;
  for (const key of METER_KEYS) {
    meters[key] = compareMeter(entry?.meters?.[key] ?? null, exit?.meters?.[key] ?? null);
  }

  return {
    keys: {
      entry: keysEntry,
      exit: keysExit,
      missing: keysEntry !== null && keysExit !== null ? Math.max(0, keysEntry - keysExit) : null
    },
    meters,
    missingCount: rows.filter(row => row.missing).length,
    quantityDecreaseCount: rows.filter(row => row.quantityDecrease > 0).length,
    degradedCount: rows.filter(row => row.degraded).length,
    absentFromExitCount: rows.filter(row => row.absentFromExit).length,
    missingValueTotal: rows.reduce((total, row) => total + (row.missingValue ?? 0), 0),
    missingWithoutValueCount: rows.filter(row => row.missingQuantity > 0 && row.missingValue === null).length
  };
}
