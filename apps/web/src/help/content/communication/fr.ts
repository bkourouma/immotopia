import type { HelpEntry } from '../../types';
import accueil from './fr/accueil';
import assistant from './fr/assistant';
import canaux from './fr/canaux';
import documents from './fr/documents';
import messagerie from './fr/messagerie';
import newsletter from './fr/newsletter';

/** Fiches d'aide du module « communication » (fr) : concatène les zones. */
const entries: HelpEntry[] = [...accueil, ...assistant, ...messagerie, ...canaux, ...newsletter, ...documents];

export default entries;
