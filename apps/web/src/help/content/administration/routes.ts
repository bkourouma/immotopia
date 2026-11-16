import type { HelpRoute } from '../../types';

/** Motifs de route -> fiche de page du module « administration ». */
export const routes: HelpRoute[] = [
  { pattern: '/tenant/:tenantId/settings', helpId: 'administration.agence.parametres' },
  { pattern: '/tenant/:tenantId/settings/finance', helpId: 'administration.agence.finance' },
  { pattern: '/tenant/:tenantId/settings/abonnement', helpId: 'administration.agence.abonnement' },
  { pattern: '/tenant/:tenantId/settings/facturation', helpId: 'administration.agence.facturation' },
  { pattern: '/tenant/:tenantId/activity', helpId: 'administration.agence.activite' },
  { pattern: '/tenant/:tenantId/collaborators', helpId: 'administration.equipe.collaborateurs' },
  { pattern: '/tenant/:tenantId/collaborators/:userId', helpId: 'administration.equipe.collaborateur-detail' },
  { pattern: '/tenant/:tenantId/invite', helpId: 'administration.equipe.inviter' },
  { pattern: '/tenant/:tenantId/invitations', helpId: 'administration.equipe.invitations' },
  { pattern: '/settings', helpId: 'administration.equipe.profil' },
  { pattern: '/settings/profile', helpId: 'administration.equipe.profil' },
  { pattern: '/tenant/:tenantId/admin/maintenance/tickets', helpId: 'administration.maintenance-gestion.tickets' },
  {
    pattern: '/tenant/:tenantId/admin/maintenance/tickets/:ticketId',
    helpId: 'administration.maintenance-gestion.ticket-detail'
  },
  { pattern: '/tenant/:tenantId/admin/maintenance/vendors', helpId: 'administration.maintenance-gestion.prestataires' },
  { pattern: '/admin/tenants', helpId: 'administration.plateforme-agences.liste' },
  { pattern: '/admin/tenants/new', helpId: 'administration.plateforme-agences.creation' },
  { pattern: '/admin/tenants/:tenantId', helpId: 'administration.plateforme-agences.detail' },
  { pattern: '/admin/tenants/:tenantId/edit', helpId: 'administration.plateforme-agences.modification' },
  {
    pattern: '/admin/tenants/:tenantId/collaborators/:userId',
    helpId: 'administration.plateforme-agences.collaborateur'
  },
  { pattern: '/admin/tenants/:tenantId/collaborators/invite', helpId: 'administration.plateforme-agences.invitation' },
  { pattern: '/admin/statistics', helpId: 'administration.pilotage.statistiques' },
  { pattern: '/admin/audit', helpId: 'administration.pilotage.audit' },
  { pattern: '/admin/ai-settings', helpId: 'administration.pilotage.ia' },
  { pattern: '/admin/roles-permissions', helpId: 'administration.pilotage.roles' },
  { pattern: '/admin/help-feedback', helpId: 'administration.avis-aide' },
  { pattern: '/tenant/:tenantId/admin/help-feedback', helpId: 'administration.avis-aide' }
];
