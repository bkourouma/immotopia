import type { HelpEntry } from '../../types';
import agence from './ar/agence';
import equipe from './ar/equipe';
import maintenanceGestion from './ar/maintenance-gestion';
import plateformeAgences from './ar/plateforme-agences';
import pilotage from './ar/pilotage';

/**
 * Fiches d'aide du module « administration » (ar) : simple concatenation des zones
 * de `./ar/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
 */
const entries: HelpEntry[] = [...agence, ...equipe, ...maintenanceGestion, ...plateformeAgences, ...pilotage];

export default entries;
