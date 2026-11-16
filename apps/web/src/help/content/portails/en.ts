import type { HelpEntry } from '../../types';
import locataire from './en/locataire';
import proprietaireBiens from './en/proprietaire-biens';
import proprietaireSuivi from './en/proprietaire-suivi';

/**
 * Fiches d'aide du module « portails » (en) : simple concatenation des zones
 * de `./en/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
 */
const entries: HelpEntry[] = [...locataire, ...proprietaireBiens, ...proprietaireSuivi];

export default entries;
