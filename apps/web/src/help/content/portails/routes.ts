import type { HelpRoute } from '../../types';

/** Motifs de route -> fiche de page du module « portails ». */
export const routes: HelpRoute[] = [
  { pattern: '/tenant', helpId: 'portails.locataire.accueil' },
  { pattern: '/tenant/lease', helpId: 'portails.locataire.bail' },
  { pattern: '/tenant/payments', helpId: 'portails.locataire.paiements' },
  { pattern: '/tenant/deposit', helpId: 'portails.locataire.caution' },
  { pattern: '/tenant/maintenance', helpId: 'portails.locataire.incidents' },
  { pattern: '/tenant/documents', helpId: 'portails.locataire.documents' },
  { pattern: '/owner', helpId: 'portails.proprietaire.accueil' },
  { pattern: '/owner/properties', helpId: 'portails.proprietaire.biens' },
  { pattern: '/owner/properties/:id', helpId: 'portails.proprietaire.bien-detail' },
  { pattern: '/owner/leases', helpId: 'portails.proprietaire.baux' },
  { pattern: '/owner/leases/:id', helpId: 'portails.proprietaire.bail-detail' },
  { pattern: '/owner/revenues', helpId: 'portails.proprietaire.revenus' },
  { pattern: '/owner/installments', helpId: 'portails.proprietaire.echeances' },
  { pattern: '/owner/payments', helpId: 'portails.proprietaire.paiements' },
  { pattern: '/owner/account', helpId: 'portails.proprietaire.compte' },
  { pattern: '/owner/deposits', helpId: 'portails.proprietaire.cautions' },
  { pattern: '/owner/maintenance', helpId: 'portails.proprietaire.incidents' },
  { pattern: '/owner/documents', helpId: 'portails.proprietaire.documents' },
  { pattern: '/owner/reports', helpId: 'portails.proprietaire.rapports' },
  { pattern: '/owner/preferences', helpId: 'portails.proprietaire.preferences' },
  { pattern: '/owner/patrimoine', helpId: 'portails.proprietaire.patrimoine' },
  { pattern: '/owner/patrimoine/:propertyId', helpId: 'portails.proprietaire.patrimoine-detail' }
];
