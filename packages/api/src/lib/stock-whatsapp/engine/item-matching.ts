import { prisma, type PrismaTransactionClient } from '../../../utils/database';

/**
 * Article non reconnu : le chef tape un nom (lot 041, spec W9-R2).
 *
 * Correspondance sur `label` et `reference` des articles ACTIFS de l'agence,
 * sans accents, sans casse, espaces réduits, dans cet ordre :
 * 1. égalité de référence ;
 * 2. libellé (ou référence) contenant tous les mots tapés ;
 * 3. distance d'édition ≤ 2 entre un mot tapé et un mot du libellé.
 *
 * Jamais de création d'article (W9-R3) : ce module ne fait que lire.
 */

type Db = PrismaTransactionClient | typeof prisma;

export type MatchableItem = { id: string; reference: string; label: string; unit: string };

/** Nombre maximal de propositions (liste Meta de 10 lignes, M20). */
export const MAX_ITEM_MATCHES = 10;

export function normalizeItemText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distance de Levenshtein, bornée : au-delà de `max`, rend `max + 1`. */
export function boundedEditDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

/** Articles correspondant au texte tapé, par ordre de règle puis de référence. */
export function matchItems<T extends MatchableItem>(items: readonly T[], typed: string): T[] {
  const query = normalizeItemText(typed);
  if (!query) return [];
  const words = query.split(' ');
  const sorted = [...items].sort((a, b) => a.reference.localeCompare(b.reference));

  const byReference = sorted.filter(item => normalizeItemText(item.reference) === query);
  if (byReference.length > 0) return byReference.slice(0, MAX_ITEM_MATCHES);

  const containing = sorted.filter(item => {
    const haystack = ` ${normalizeItemText(item.label)} ${normalizeItemText(item.reference)} `;
    return words.every(word => haystack.includes(` ${word}`));
  });
  if (containing.length > 0) return containing.slice(0, MAX_ITEM_MATCHES);

  const close = sorted.filter(item => {
    const labelWords = normalizeItemText(item.label).split(' ').filter(Boolean);
    return words.some(
      word => word.length >= 3 && labelWords.some(labelWord => boundedEditDistance(word, labelWord) <= 2)
    );
  });
  return close.slice(0, MAX_ITEM_MATCHES);
}

/** Articles actifs de l'agence (lecture seule). */
export async function loadActiveItems(db: Db, tenantId: string): Promise<MatchableItem[]> {
  return db.stockItem.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, reference: true, label: true, unit: true },
    orderBy: { reference: 'asc' }
  });
}
