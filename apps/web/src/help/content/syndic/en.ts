import type { HelpEntry } from '../../types';
import copropriete from './en/copropriete';
import prestataires from './en/prestataires';
import charges from './en/charges';
import encaissements from './en/encaissements';
import comptabilite from './en/comptabilite';
import assemblees from './en/assemblees';
import portail from './en/portail';

/**
 * Fiches d'aide du module « syndic » (en) : simple concatenation des zones
 * de `./en/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
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
