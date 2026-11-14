import type { HelpEntry } from '../../types';
import baux from './ar/baux';

/**
 * Fiches d'aide du module « locatif » (ar) : simple concatenation des zones
 * de `./ar/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
 */
const entries: HelpEntry[] = [...baux];

export default entries;
