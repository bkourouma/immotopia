import type { HelpRoute } from '../../types';

/** Motifs de route -> fiche de page du module « commercial ». */
export const routes: HelpRoute[] = [
  // CRM : contacts
  { pattern: '/tenant/:tenantId/crm/contacts', helpId: 'commercial.contacts.liste' },
  { pattern: '/tenant/:tenantId/crm/contacts/new', helpId: 'commercial.contacts.nouveau' },
  { pattern: '/tenant/:tenantId/crm/contacts/:contactId', helpId: 'commercial.contacts.detail' },
  { pattern: '/tenant/:tenantId/crm/contacts/:contactId/edit', helpId: 'commercial.contacts.modifier' },
  // CRM : affaires
  { pattern: '/tenant/:tenantId/crm/deals', helpId: 'commercial.affaires.liste' },
  { pattern: '/tenant/:tenantId/crm/deals/new', helpId: 'commercial.affaires.nouvelle' },
  { pattern: '/tenant/:tenantId/crm/deals/:dealId', helpId: 'commercial.affaires.detail' },
  { pattern: '/tenant/:tenantId/crm/deals/:dealId/edit', helpId: 'commercial.affaires.modifier' },
  // CRM : activités, calendrier, tableau de bord
  { pattern: '/tenant/:tenantId/crm/activities', helpId: 'commercial.activites.liste' },
  { pattern: '/tenant/:tenantId/crm/calendar', helpId: 'commercial.activites.calendrier' },
  { pattern: '/tenant/:tenantId/crm/dashboard', helpId: 'commercial.activites.tableau-de-bord' },
  // Biens
  { pattern: '/properties', helpId: 'commercial.biens.liste' },
  { pattern: '/tenant/:tenantId/properties', helpId: 'commercial.biens.liste' },
  { pattern: '/tenant/:tenantId/properties/new', helpId: 'commercial.biens.nouveau' },
  { pattern: '/tenant/:tenantId/properties/visits/calendar', helpId: 'commercial.biens.visites' },
  { pattern: '/tenant/:tenantId/properties/:id/edit', helpId: 'commercial.biens.modifier' },
  { pattern: '/tenant/:tenantId/properties/:id', helpId: 'commercial.biens.detail' },
  // Ventes
  { pattern: '/tenant/:tenantId/sales', helpId: 'commercial.ventes.tableau-de-bord' },
  { pattern: '/tenant/:tenantId/sales/mandates', helpId: 'commercial.ventes.mandats' },
  { pattern: '/tenant/:tenantId/sales/mandates/:id', helpId: 'commercial.ventes.mandat' },
  { pattern: '/tenant/:tenantId/sales/agreements/:id', helpId: 'commercial.ventes.compromis' },
  { pattern: '/tenant/:tenantId/sales/commissions', helpId: 'commercial.ventes.commissions' },
  // Maintenance
  { pattern: '/tenant/:tenantId/maintenance', helpId: 'commercial.maintenance.liste' },
  { pattern: '/tenant/:tenantId/maintenance/new', helpId: 'commercial.maintenance.nouveau' },
  { pattern: '/tenant/:tenantId/maintenance/:ticketId', helpId: 'commercial.maintenance.detail' },
  { pattern: '/tenant/:tenantId/maintenance/:ticketId/edit', helpId: 'commercial.maintenance.modifier' }
];
