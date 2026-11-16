import type { HelpEntry } from '../../types';
import copropriete from './ar/copropriete';
import prestataires from './ar/prestataires';
import charges from './ar/charges';
import encaissements from './ar/encaissements';
import comptabilite from './ar/comptabilite';
import assemblees from './ar/assemblees';
import portail from './ar/portail';

/**
 * Fiches d'aide du module « syndic » (ar) : simple concatenation des zones
 * de `./ar/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
 */
const entries: HelpEntry[] = [
  ...copropriete,
  ...prestataires,
  ...charges,
  ...encaissements,
  ...comptabilite,
  ...assemblees,
  ...portail
];

export default entries;
