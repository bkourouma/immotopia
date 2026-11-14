import type { HelpEntry } from '../../types';
import baux from './en/baux';
import echeances from './en/echeances';
import paiements from './en/paiements';
import enligne from './en/enligne';
import mandats from './en/mandats';
import remises from './en/remises';
import signatures from './en/signatures';
import dossier from './en/dossier';

/**
 * Fiches d'aide du module « locatif » (en) : simple concatenation des zones
 * de `./en/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
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
