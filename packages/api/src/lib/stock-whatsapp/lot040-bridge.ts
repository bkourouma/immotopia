import type { StockCountKind } from '@prisma/client';
import type { PrismaTransactionClient } from '../../utils/database';
import * as stockInventaire from '../finance/stock-inventaire';

/**
 * PONT TEMPORAIRE vers le lot 040 (lot 041, fondations).
 *
 * Le lot 041 n'appelle le stock que par six éléments dont le lot 040 a FIGÉ les
 * signatures (`specs/040-controle-stock/plan.md` §11) :
 *
 * - `createStockCountTx`, `setStockCountLineTx`, `closeStockCountTx`
 *   (`src/lib/finance/stock-inventaire.ts`, territoire API-2 du lot 040) ;
 * - `detectStockFileKind`, `stripImageMetadata`, `sha256Hex` et le type
 *   `StockFileKind` (`src/lib/finance/stock-pieces-jointes.ts`, territoire
 *   API-4 du lot 040).
 *
 * Le lot 040 les écrit EN PARALLÈLE, dans une autre branche : dans celle-ci, les
 * deux premières n'ont pas encore leur forme finale (elles rendent l'inventaire
 * entier, et la ligne n'a pas d'auteur), la troisième n'existe pas, et le module
 * `stock-pieces-jointes` non plus. Ce pont expose donc les six éléments avec
 * leurs signatures EXACTES du §11, typées ici, et les résout À L'EXÉCUTION :
 *
 * - `stock-inventaire` est importé normalement et lu par un cast vers la forme
 *   du §11 (le module existe, seules ses formes changent) ;
 * - `stock-pieces-jointes` est chargé par un `require` paresseux, au premier
 *   appel : un import statique ferait échouer la compilation tant que le module
 *   n'existe pas dans cette branche.
 *
 * TOUT le lot 041 importe ces fonctions d'ICI, jamais directement ; les tests
 * simulent ce module (`jest.mock('…/lot040-bridge')`). À l'intégration (étape 2),
 * ce fichier disparaît : chaque appelant importe directement le lot 040.
 */

// ---------------------------------------------------------------------------
// Signatures figées (plan 040 §11)
// ---------------------------------------------------------------------------

export type StockFileKind = 'jpeg' | 'png' | 'webp' | 'pdf';

interface Lot040InventaireExports {
  createStockCountTx(
    tx: PrismaTransactionClient,
    tenantId: string,
    params: { locationId: string; countedAt: Date; createdByUserId: string; kind?: StockCountKind }
  ): Promise<{ id: string }>;
  setStockCountLineTx(
    tx: PrismaTransactionClient,
    tenantId: string,
    countId: string,
    params: { itemId: string; countedQuantity: number; countedByUserId: string }
  ): Promise<{ lineId: string }>;
  closeStockCountTx(
    tx: PrismaTransactionClient,
    tenantId: string,
    countId: string,
    closedByUserId: string
  ): Promise<{ id: string; status: 'COUNTED' }>;
}

interface Lot040PiecesJointesExports {
  detectStockFileKind(buffer: Buffer): StockFileKind | null;
  stripImageMetadata(buffer: Buffer, kind: StockFileKind): Buffer;
  sha256Hex(buffer: Buffer): string;
}

// ---------------------------------------------------------------------------
// Résolution à l'exécution
// ---------------------------------------------------------------------------

function inventaire(): Lot040InventaireExports {
  return stockInventaire as unknown as Lot040InventaireExports;
}

/** Erreur claire tant que le lot 040 n'a pas livré la fonction (jamais une erreur métier). */
function missing(name: string): Error {
  return new Error(`Lot 040 : ${name} n'est pas encore disponible dans cette branche (pont lot040-bridge).`);
}

function requireInventaireFunction<K extends keyof Lot040InventaireExports>(name: K): Lot040InventaireExports[K] {
  const fn = inventaire()[name];
  if (typeof fn !== 'function') throw missing(name);
  return fn;
}

let piecesJointes: Lot040PiecesJointesExports | null = null;

function loadPiecesJointes(): Lot040PiecesJointesExports {
  if (piecesJointes) return piecesJointes;
  // `require` paresseux, à l'appel : le module du lot 040 (territoire API-4)
  // n'existe pas encore dans cette branche, un import statique casserait la
  // compilation de tout le lot 041. Remplacé par un import direct à l'intégration.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const loaded = require('../finance/stock-pieces-jointes') as Partial<Lot040PiecesJointesExports>;
  if (
    typeof loaded.detectStockFileKind !== 'function' ||
    typeof loaded.stripImageMetadata !== 'function' ||
    typeof loaded.sha256Hex !== 'function'
  ) {
    throw missing('stock-pieces-jointes');
  }
  piecesJointes = loaded as Lot040PiecesJointesExports;
  return piecesJointes;
}

// ---------------------------------------------------------------------------
// API-2 — src/lib/finance/stock-inventaire.ts
// ---------------------------------------------------------------------------

/** 409 si un inventaire DRAFT existe déjà sur le lieu. */
export async function createStockCountTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  params: { locationId: string; countedAt: Date; createdByUserId: string; kind?: StockCountKind }
): Promise<{ id: string }> {
  return requireInventaireFunction('createStockCountTx')(tx, tenantId, params);
}

/** L'auteur de la ligne est `countedByUserId` (A4-R1) ; aucun attendu ni écart dans le retour (A2-R2). */
export async function setStockCountLineTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string,
  params: { itemId: string; countedQuantity: number; countedByUserId: string }
): Promise<{ lineId: string }> {
  return requireInventaireFunction('setStockCountLineTx')(tx, tenantId, countId, params);
}

/** A2-R4 et A2-R8 (lignes non comptées créées) ; 409 STOCK_COUNT_EMPTY / STOCK_COUNT_WRONG_STATUS. */
export async function closeStockCountTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string,
  closedByUserId: string
): Promise<{ id: string; status: 'COUNTED' }> {
  return requireInventaireFunction('closeStockCountTx')(tx, tenantId, countId, closedByUserId);
}

// ---------------------------------------------------------------------------
// API-4 — src/lib/finance/stock-pieces-jointes.ts (fonctions pures)
// ---------------------------------------------------------------------------

/** Type établi par les octets magiques, jamais par l'extension ni le type déclaré. */
export function detectStockFileKind(buffer: Buffer): StockFileKind | null {
  return loadPiecesJointes().detectStockFileKind(buffer);
}

/** EXIF retiré (B5-R3) ; PDF inchangé. */
export function stripImageMetadata(buffer: Buffer, kind: StockFileKind): Buffer {
  return loadPiecesJointes().stripImageMetadata(buffer, kind);
}

export function sha256Hex(buffer: Buffer): string {
  return loadPiecesJointes().sha256Hex(buffer);
}
