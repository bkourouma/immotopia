import type { HelpEntry } from '../../types';
import affaires from './fr/affaires';
import activites from './fr/activites';
import biens from './fr/biens';
import contacts from './fr/contacts';
import ficheBien from './fr/fiche-bien';
import maintenance from './fr/maintenance';
import ventes from './fr/ventes';

/**
 * Fiches d'aide du module « commercial » (fr) : simple concatenation des zones
 * de `./fr/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
 */
const entries: HelpEntry[] = [
  ...contacts,
  ...affaires,
  ...activites,
  ...biens,
  ...ficheBien,
  ...ventes,
  ...maintenance
];

export default entries;
