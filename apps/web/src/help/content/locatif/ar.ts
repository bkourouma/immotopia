import type { HelpEntry } from '../../types';
import baux from './ar/baux';
import echeances from './ar/echeances';
import paiements from './ar/paiements';
import enligne from './ar/enligne';
import mandats from './ar/mandats';
import remises from './ar/remises';
import signatures from './ar/signatures';
import dossier from './ar/dossier';

/**
 * Fiches d'aide du module « locatif » (ar) : simple concatenation des zones
 * de `./ar/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
 */
const entries: HelpEntry[] = [
  ...baux,
  ...echeances,
  ...paiements,
  ...enligne,
  ...mandats,
  ...remises,
  ...signatures,
  ...dossier
];

export default entries;
