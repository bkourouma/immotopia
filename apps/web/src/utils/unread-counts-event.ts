/**
 * Evenement navigateur : un ecran vient de changer l'etat de lecture (ex.
 * ouverture d'une conversation). La cloche et l'icone Messagerie de l'en-tete
 * relisent alors leurs compteurs sans attendre le prochain cycle de 30 s.
 */
export const UNREAD_COUNTS_CHANGED_EVENT = 'immotopia:unread-counts-changed';

export function announceUnreadCountsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(UNREAD_COUNTS_CHANGED_EVENT));
}
