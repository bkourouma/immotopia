import type { HelpEntry } from '../../types';
import locataire from './ar/locataire';
import proprietaireBiens from './ar/proprietaire-biens';
import proprietaireSuivi from './ar/proprietaire-suivi';

/**
 * Fiches d'aide du module « portails » (ar) : simple concatenation des zones
 * de `./ar/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
 */
const entries: HelpEntry[] = [...locataire, ...proprietaireBiens, ...proprietaireSuivi];

export default entries;
