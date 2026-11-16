import type { HelpEntry } from '../../types';
import affaires from './ar/affaires';
import activites from './ar/activites';
import biens from './ar/biens';
import contacts from './ar/contacts';
import ficheBien from './ar/fiche-bien';
import maintenance from './ar/maintenance';
import ventes from './ar/ventes';

/**
 * Fiches d'aide du module « commercial » (ar) : simple concatenation des zones
 * de `./ar/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
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
