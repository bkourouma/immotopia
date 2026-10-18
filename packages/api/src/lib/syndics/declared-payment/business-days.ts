/**
 * Jours ouvrés du paiement déclaré (spec 047, alerte de délai D12).
 * Calcul en UTC, du lundi au vendredi, sans jours fériés.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** Ajoute `n` jours ouvrés (n >= 0, heure conservée) ; `n = 0` renvoie une copie. */
export function addBusinessDays(date: Date, n: number): Date {
  const result = new Date(date.getTime());
  let remaining = Math.max(0, Math.floor(n));
  while (remaining > 0) {
    result.setTime(result.getTime() + DAY_MS);
    if (!isWeekend(result)) remaining -= 1;
  }
  return result;
}

/**
 * Nombre de jours ouvrés écoulés entre `from` et `to` : jours ouvrés de
 * l'intervalle (from, to], en jours civils UTC. Zéro si `to` n'est pas après
 * `from`. Un lundi vers le lundi suivant vaut 5 ; un vendredi vers le lundi, 1.
 */
export function businessDaysBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  if (end <= start) return 0;
  let count = 0;
  const cursor = new Date(start);
  for (let t = start + DAY_MS; t <= end; t += DAY_MS) {
    cursor.setTime(t);
    if (!isWeekend(cursor)) count += 1;
  }
  return count;
}

/** Vrai quand au moins `n` jours ouvrés se sont écoulés depuis `createdAt`. */
export function isOverdue(createdAt: Date, n: number, now: Date = new Date()): boolean {
  return businessDaysBetween(createdAt, now) >= n;
}
