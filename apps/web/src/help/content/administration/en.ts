import type { HelpEntry } from '../../types';
import agence from './en/agence';
import equipe from './en/equipe';
import maintenanceGestion from './en/maintenance-gestion';
import plateformeAgences from './en/plateforme-agences';
import pilotage from './en/pilotage';

/**
 * Fiches d'aide du module « administration » (en) : simple concatenation des zones
 * de `./en/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
 */
const entries: HelpEntry[] = [...agence, ...equipe, ...maintenanceGestion, ...plateformeAgences, ...pilotage];

export default entries;
