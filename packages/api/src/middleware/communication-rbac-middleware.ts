/**
 * RBAC for communication module – tenant-scoped access.
 * Allows users with TENANT_ADMIN or COMMUNICATION_VIEW (assigned to Admin, Manager, Agent).
 * @see specs/010-communication-module/tasks.md T015
 */
import { requireAnyPermission } from './rbac-middleware';

export const requireCommunicationPermission = requireAnyPermission(['TENANT_ADMIN', 'COMMUNICATION_VIEW']);

/**
 * Envois de groupe WhatsApp (invitation en masse, diffusion) : réservés à
 * l'administrateur de l'agence (et au super-admin, qui les porte toutes). Le
 * groupe visé est une variable d'environnement unique de la plateforme
 * (`WHATSAPP_GROUP_BROADCAST_TO`) : il n'existe pas encore de permission
 * d'écriture dédiée à la communication, donc on n'ouvre pas ces actions à tous
 * les détenteurs de `COMMUNICATION_VIEW` (agents, gestionnaires).
 */
export const requireCommunicationGroupSend = requireAnyPermission(['TENANT_ADMIN']);
