import type { HelpEntry } from '../../types';
import locataire from './fr/locataire';
import proprietaireBiens from './fr/proprietaire-biens';
import proprietaireSuivi from './fr/proprietaire-suivi';

/**
 * Fiches d'aide du module « portails » (fr) : simple concatenation des zones
 * de `./fr/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
 */
const entries: HelpEntry[] = [...locataire, ...proprietaireBiens, ...proprietaireSuivi];

export default entries;
