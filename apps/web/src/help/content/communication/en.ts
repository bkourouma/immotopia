import type { HelpEntry } from '../../types';
import accueil from './en/accueil';
import assistant from './en/assistant';
import canaux from './en/canaux';
import documents from './en/documents';
import messagerie from './en/messagerie';
import newsletter from './en/newsletter';

/** Fiches d'aide du module « communication » (en) : concatène les zones. */
const entries: HelpEntry[] = [...accueil, ...assistant, ...messagerie, ...canaux, ...newsletter, ...documents];

export default entries;
