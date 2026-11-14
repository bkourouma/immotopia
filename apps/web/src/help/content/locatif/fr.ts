import type { HelpEntry } from '../../types';
import baux from './fr/baux';
import echeances from './fr/echeances';
import paiements from './fr/paiements';
import enligne from './fr/enligne';
import mandats from './fr/mandats';
import remises from './fr/remises';
import signatures from './fr/signatures';
import dossier from './fr/dossier';

/**
 * Fiches d'aide du module « locatif » (fr) : simple concatenation des zones
 * de `./fr/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
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
