import type { HelpEntry } from '../../types';
import baux from './fr/baux';

/**
 * Fiches d'aide du module « locatif » (fr) : simple concatenation des zones
 * de `./fr/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
 */
const entries: HelpEntry[] = [...baux];

export default entries;
