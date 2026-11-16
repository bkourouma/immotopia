import type { HelpEntry } from '../../types';
import agence from './fr/agence';
import equipe from './fr/equipe';
import maintenanceGestion from './fr/maintenance-gestion';
import plateformeAgences from './fr/plateforme-agences';
import pilotage from './fr/pilotage';

/**
 * Fiches d'aide du module « administration » (fr) : simple concatenation des zones
 * de `./fr/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
 */
const entries: HelpEntry[] = [...agence, ...equipe, ...maintenanceGestion, ...plateformeAgences, ...pilotage];

export default entries;
