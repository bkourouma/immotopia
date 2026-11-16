import type { HelpEntry } from '../../types';
import copropriete from './fr/copropriete';
import prestataires from './fr/prestataires';
import charges from './fr/charges';
import encaissements from './fr/encaissements';
import comptabilite from './fr/comptabilite';
import assemblees from './fr/assemblees';
import portail from './fr/portail';

/**
 * Fiches d'aide du module « syndic » (fr) : simple concatenation des zones
 * de `./fr/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
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
