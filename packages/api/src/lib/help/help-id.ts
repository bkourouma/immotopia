import { z } from 'zod';

/**
 * Identifiant d'une fiche d'aide interne (ex. `properties.list`, `rental.leases-detail`).
 * Contrat partagé avec le panneau d'aide du web : minuscules et chiffres, segments
 * séparés par des points, tirets permis à partir du second segment.
 * Utilisé par les avis d'aide (lib/help) et par le contexte d'écran d'ImmoCopilot (lib/ai).
 */
export const HELP_ID_MAX_LENGTH = 120;
export const HELP_ID_REGEX = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;

export const helpIdSchema = z.string().min(1).max(HELP_ID_MAX_LENGTH).regex(HELP_ID_REGEX);
