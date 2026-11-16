import type { HelpEntry } from '../../types';
import affaires from './en/affaires';
import activites from './en/activites';
import biens from './en/biens';
import contacts from './en/contacts';
import ficheBien from './en/fiche-bien';
import maintenance from './en/maintenance';
import ventes from './en/ventes';

/**
 * Fiches d'aide du module « commercial » (en) : simple concatenation des zones
 * de `./en/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
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
