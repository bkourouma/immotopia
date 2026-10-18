/**
 * Droit de publier micro et caméra dans la visio de l'AG (spec 045, V16) : règle pure, sans accès à la
 * base ni à LiveKit. Le droit est TOUJOURS décidé ici, côté serveur, à partir de deux états persistés :
 *  - `GeneralMeeting.mediaLockedAt` : interdiction posée par le gestionnaire pour tous ;
 *  - `GMParticipant.mediaPolicy` : `DEFAULT` (suit l'interdiction globale), `ALLOWED` (parole donnée, outrepasse
 *    l'interdiction globale) ou `BLOCKED` (interdit à ce participant, l'emporte sur tout).
 * Un client ne décide jamais : ni le jeton, ni `updateParticipant` ne lisent autre chose que cette règle.
 */

export type MediaPolicy = 'DEFAULT' | 'ALLOWED' | 'BLOCKED';

/** Politique d'une ligne qui n'a pas (encore) la colonne : le comportement par défaut. */
export function normalizeMediaPolicy(value: unknown): MediaPolicy {
  return value === 'ALLOWED' || value === 'BLOCKED' ? value : 'DEFAULT';
}

/** Un copropriétaire peut-il activer son micro et sa caméra ? */
export function isMediaAllowed(policy: MediaPolicy, meetingLocked: boolean): boolean {
  if (policy === 'BLOCKED') return false;
  if (policy === 'ALLOWED') return true;
  return !meetingLocked;
}

/** Politique à poser quand le gestionnaire autorise (`true`) ou interdit (`false`) un participant. */
export function policyForAllowed(allowed: boolean, meetingLocked: boolean): MediaPolicy {
  if (!allowed) return 'BLOCKED';
  // Sans interdiction globale, « autorisé » est le comportement par défaut ; avec, c'est une exception.
  return meetingLocked ? 'ALLOWED' : 'DEFAULT';
}
