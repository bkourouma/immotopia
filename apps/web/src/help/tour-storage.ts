import type { HelpEntry } from './types';

/** Prefixe des cles localStorage de la visite guidee. */
export const TOUR_STORAGE_PREFIX = 'immotopia.help.tour.';

/** En dessous, les cibles d'une visite sont souvent hors ecran : pas de lancement automatique. */
export const TOUR_AUTOSTART_MIN_WIDTH = 768;

export function hasSeenTour(helpId: string): boolean {
  try {
    return window.localStorage.getItem(TOUR_STORAGE_PREFIX + helpId) === '1';
  } catch {
    // Stockage refuse : la visite serait reproposee a chaque fois, donc on ne la propose pas.
    return true;
  }
}

export function markTourSeen(helpId: string): void {
  try {
    window.localStorage.setItem(TOUR_STORAGE_PREFIX + helpId, '1');
  } catch {
    /* sans consequence */
  }
}

/**
 * Une visite marquee `autoStart` se propose-t-elle maintenant ? Une seule fois
 * par fiche et par navigateur, jamais pendant un chargement (`aria-busy`), ni
 * sur un ecran etroit.
 */
export function canAutoStartTour(entry: Pick<HelpEntry, 'id' | 'tour'>): boolean {
  if (!entry.tour?.autoStart || entry.tour.steps.length === 0) return false;
  if (hasSeenTour(entry.id)) return false;
  if (typeof window === 'undefined' || window.innerWidth < TOUR_AUTOSTART_MIN_WIDTH) return false;
  if (document.querySelector('[aria-busy="true"]')) return false;
  return true;
}
