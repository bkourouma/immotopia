/**
 * Solde cumulé du compte de lot, recalculé à la lecture (anomalie BUG-2026-09-27-006).
 *
 * `OwnerAccountTransaction.balanceAfter` est figé à l'écriture, donc dans
 * l'ordre de CRÉATION des mouvements. Or l'historique s'affiche trié par
 * `transactionDate`, et un appel de charges est daté à son échéance : créé
 * avant un paiement mais daté après lui, il montrait un solde contredisant sa
 * place dans la liste (et le solde courant affiché en tête).
 *
 * Règle unique, partagée par l'écran de gestion, le relevé PDF et le portail
 * copropriétaire : le solde cumulé suit l'ordre chronologique de la date
 * affichée (`transactionDate`), l'ordre de création départageant les
 * mouvements d'une même date, puis l'identifiant en dernier recours pour un
 * ordre total. Le solde courant du compte (somme des mouvements) ne dépend
 * pas de l'ordre : la ligne la plus récente porte donc toujours ce solde.
 */
import { roundMoney } from '../finance/money';

export interface RunningBalanceMovement {
  id: string;
  transactionDate: Date | string;
  createdAt: Date | string;
  debit?: unknown;
  credit?: unknown;
  /** Solde stocké à l'écriture : sert seulement à retrouver le solde d'origine du compte. */
  balanceAfter?: unknown;
}

function time(value: Date | string): number {
  return new Date(value).getTime();
}

/** Comparateur chronologique : date affichée, puis création, puis identifiant. */
export function compareChronologically(a: RunningBalanceMovement, b: RunningBalanceMovement): number {
  return (
    time(a.transactionDate) - time(b.transactionDate) ||
    time(a.createdAt) - time(b.createdAt) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * Solde du compte avant tout mouvement. Un compte peut naître avec un solde
 * (reprise d'historique) sans mouvement correspondant : on le retrouve sur le
 * premier mouvement ÉCRIT, dont le `balanceAfter` stocké part de ce solde.
 */
export function openingBalanceOf(movements: RunningBalanceMovement[]): number {
  if (movements.length === 0) return 0;
  const first = [...movements].sort(
    (a, b) =>
      time(a.createdAt) - time(b.createdAt) ||
      time(a.transactionDate) - time(b.transactionDate) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )[0];
  return roundMoney(Number(first.balanceAfter ?? 0) - Number(first.debit ?? 0) + Number(first.credit ?? 0));
}

/**
 * Solde après chaque mouvement, cumulé dans l'ordre chronologique depuis le
 * solde d'origine du compte. Renvoie une table `id → solde`.
 */
export function computeChronologicalBalances(movements: RunningBalanceMovement[]): Map<string, number> {
  const balances = new Map<string, number>();
  let balance = openingBalanceOf(movements);
  for (const movement of [...movements].sort(compareChronologically)) {
    balance = roundMoney(balance + Number(movement.debit ?? 0) - Number(movement.credit ?? 0));
    balances.set(movement.id, balance);
  }
  return balances;
}

/**
 * Remplace le `balanceAfter` stocké de chaque ligne par le solde chronologique.
 * `allMovements` doit couvrir TOUT le compte (pas seulement la page ou la
 * période affichée), faute de quoi le cumul partirait d'un mauvais solde.
 */
export function applyChronologicalBalances<T extends { id: string; balanceAfter?: unknown }>(
  rows: T[],
  allMovements: RunningBalanceMovement[]
): T[] {
  const balances = computeChronologicalBalances(allMovements);
  return rows.map(row => (balances.has(row.id) ? { ...row, balanceAfter: balances.get(row.id) } : row));
}

/** Solde atteint juste avant `before` (mouvements strictement antérieurs), dans l'ordre chronologique. */
export function chronologicalBalanceStrictlyBefore(movements: RunningBalanceMovement[], before: Date): number {
  return roundMoney(
    movements
      .filter(movement => time(movement.transactionDate) < before.getTime())
      .reduce(
        (sum, movement) => sum + Number(movement.debit ?? 0) - Number(movement.credit ?? 0),
        openingBalanceOf(movements)
      )
  );
}
