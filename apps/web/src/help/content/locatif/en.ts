import type { HelpEntry } from '../../types';
import baux from './en/baux';

/**
 * Fiches d'aide du module « locatif » (en) : simple concatenation des zones
 * de `./en/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
 */
const entries: HelpEntry[] = [...baux];

export default entries;
