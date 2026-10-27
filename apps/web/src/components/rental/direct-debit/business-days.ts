/**
 * Jours ouvrés et dates de collecte (spec 042, P2, data-model §7.2).
 *
 * Jours ouvrés : lundi à vendredi, les jours fériés ne sont pas gérés. Ces
 * fonctions ne servent qu'à guider la saisie (date proposée, dates grisées) :
 * l'API reste juge et renvoie un message clair si la date n'est pas acceptable.
 *
 * Toutes les dates sont des jours calendaires locaux (aucune heure) : on
 * travaille sur midi pour qu'un changement d'heure ne décale jamais le jour.
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function atNoon(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

/** Jour calendaire (midi local) d'un instant quelconque. */
export function startOfDay(date: Date): Date {
  return atNoon(date.getFullYear(), date.getMonth(), date.getDate());
}

/** `AAAA-MM-JJ` vers un jour local ; `null` si la chaîne n'a pas ce format. */
export function parseIsoDay(value: string | null | undefined): Date | null {
  const match = ISO_DAY.exec(value ?? '');
  if (!match) return null;
  return atNoon(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Jour local vers `AAAA-MM-JJ`. */
export function toIsoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  return atNoon(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Lundi à vendredi. */
export function isBusinessDay(date: Date): boolean {
  const weekday = date.getDay();
  return weekday !== 0 && weekday !== 6;
}

/**
 * Retire `businessDays` jours ouvrés à une date : 0 rend la date elle-même,
 * même un week-end ; sinon on recule jour après jour en ne comptant que les
 * jours ouvrés.
 */
export function subtractBusinessDays(date: Date, businessDays: number): Date {
  let current = startOfDay(date);
  let remaining = Math.max(0, Math.trunc(businessDays));
  while (remaining > 0) {
    current = addDays(current, -1);
    if (isBusinessDay(current)) remaining -= 1;
  }
  return current;
}

/** Date limite d'envoi des prénotifications pour une date de prélèvement. */
export function prenotificationDeadline(collectionDate: Date, prenotificationBusinessDays: number): Date {
  return subtractBusinessDays(collectionDate, prenotificationBusinessDays);
}

/**
 * Une date de collecte est acceptable si elle est strictement postérieure à
 * aujourd'hui et si aujourd'hui n'a pas dépassé la date limite de
 * prénotification.
 */
export function isCollectionDateAllowed(
  collectionDate: Date,
  today: Date,
  prenotificationBusinessDays: number
): boolean {
  const day = startOfDay(collectionDate);
  const now = startOfDay(today);
  if (day.getTime() <= now.getTime()) return false;
  return now.getTime() <= prenotificationDeadline(day, prenotificationBusinessDays).getTime();
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Première date de collecte possible : le premier jour de collecte du créancier
 * (`collectionDay`, ramené au dernier jour des mois plus courts) dont la date
 * limite de prénotification n'est pas passée. Cherche sur les 14 mois à venir ;
 * `null` si aucune (jour de collecte hors 1–31).
 */
export function firstPossibleCollectionDate(
  collectionDay: number,
  prenotificationBusinessDays: number,
  today: Date
): Date | null {
  if (!Number.isInteger(collectionDay) || collectionDay < 1 || collectionDay > 31) return null;
  const now = startOfDay(today);
  for (let offset = 0; offset < 14; offset += 1) {
    const year = now.getFullYear();
    const monthIndex = now.getMonth() + offset;
    const first = atNoon(year, monthIndex, 1);
    const day = Math.min(collectionDay, daysInMonth(first.getFullYear(), first.getMonth()));
    const candidate = atNoon(first.getFullYear(), first.getMonth(), day);
    if (isCollectionDateAllowed(candidate, now, prenotificationBusinessDays)) return candidate;
  }
  return null;
}
