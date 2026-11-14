import type { HelpRoute } from '../../types';

/** Motifs de route -> fiche de page du module « locatif ». */
export const routes: HelpRoute[] = [
  { pattern: '/tenant/:tenantId/rental/leases', helpId: 'locatif.baux.liste' },
  { pattern: '/tenant/:tenantId/rental/leases/new', helpId: 'locatif.baux.nouveau' },
  { pattern: '/tenant/:tenantId/rental/leases/:leaseId', helpId: 'locatif.baux.fiche' },
  { pattern: '/tenant/:tenantId/rental/leases/:leaseId/edit', helpId: 'locatif.baux.edition' },
  { pattern: '/tenant/:tenantId/rental/installments', helpId: 'locatif.echeances.liste' },
  { pattern: '/tenant/:tenantId/rental/installments/:installmentId', helpId: 'locatif.echeances.fiche' },
  { pattern: '/tenant/:tenantId/rental/payments', helpId: 'locatif.paiements.liste' },
  { pattern: '/tenant/:tenantId/rental/payments/:paymentId', helpId: 'locatif.paiements.fiche' },
  { pattern: '/tenant/:tenantId/rental/online-payments', helpId: 'locatif.enligne.liste' },
  { pattern: '/tenant/:tenantId/rental/direct-debit', helpId: 'locatif.prelevements.mandats' },
  { pattern: '/tenant/:tenantId/rental/direct-debit/remittances', helpId: 'locatif.prelevements.remises' },
  {
    pattern: '/tenant/:tenantId/rental/direct-debit/remittances/:remittanceId',
    helpId: 'locatif.prelevements.remise'
  },
  { pattern: '/tenant/:tenantId/signatures', helpId: 'locatif.signatures.liste' }
];
