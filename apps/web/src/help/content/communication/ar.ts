import type { HelpEntry } from '../../types';
import accueil from './ar/accueil';
import assistant from './ar/assistant';
import canaux from './ar/canaux';
import documents from './ar/documents';
import messagerie from './ar/messagerie';
import newsletter from './ar/newsletter';

/** Fiches d'aide du module « communication » (ar) : concatène les zones. */
const entries: HelpEntry[] = [...accueil, ...assistant, ...messagerie, ...canaux, ...newsletter, ...documents];

export default entries;
