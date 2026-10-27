/**
 * Dates et jours ouvrés des remises de prélèvement (spec 042, P2, data-model §7.2).
 *
 * Toutes les dates sont des dates civiles UTC (la Côte d'Ivoire est à UTC+0) :
 * une `@db.Date` Prisma est lue à minuit UTC et « aujourd'hui » est la date UTC
 * de l'horloge. Chaque fonction qui dépend de l'heure reçoit l'horloge en
 * paramètre pour être testable sans dépendre de la date réelle.
 *
 * Jours ouvrés : lundi à vendredi. Les jours fériés ne sont pas gérés en P2.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Minuit UTC de la date civile UTC de `now`. */
export function todayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** `AAAA-MM-JJ` (date UTC). */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `AAAA-MM-JJ` → minuit UTC ; `null` si le texte n'est pas une date civile existante. */
export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

/** `JJ/MM/AAAA`. */
export function formatFrenchDate(date: Date): string {
  const iso = toIsoDate(date);
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

/** Lundi à vendredi. */
export function isBusinessDay(date: Date): boolean {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * `date` moins `count` jours ouvrés : on recule jour par jour en ne comptant que
 * les jours ouvrés. `count = 0` renvoie la date elle-même.
 */
export function subtractBusinessDays(date: Date, count: number): Date {
  let current = date;
  let remaining = Math.max(0, Math.trunc(count));
  while (remaining > 0) {
    current = addDays(current, -1);
    if (isBusinessDay(current)) remaining -= 1;
  }
  return current;
}

/** Dernier jour où la prénotification peut partir : date de collecte moins N jours ouvrés. */
export function prenotificationDeadline(collectionDate: Date, businessDays: number): Date {
  return subtractBusinessDays(collectionDate, businessDays);
}

export type CollectionDateCheck = { ok: true } | { ok: false; firstPossible: Date };

/**
 * Date de collecte acceptable : strictement postérieure à aujourd'hui, et
 * aujourd'hui ≤ date limite de prénotification. Sinon renvoie la première date
 * possible (la plus proche qui respecte les deux conditions).
 */
export function checkCollectionDate(collectionDate: Date, businessDays: number, today: Date): CollectionDateCheck {
  const acceptable = (candidate: Date) =>
    candidate.getTime() > today.getTime() &&
    today.getTime() <= prenotificationDeadline(candidate, businessDays).getTime();
  if (acceptable(collectionDate)) return { ok: true };
  let candidate = addDays(today, 1);
  // Borne de sécurité : 30 jours ouvrés de délai se couvrent largement en 120 jours civils.
  for (let i = 0; i < 120 && !acceptable(candidate); i += 1) candidate = addDays(candidate, 1);
  return { ok: false, firstPossible: candidate };
}
