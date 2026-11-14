import type { HelpRoute } from '../../types';

/** Motifs de route -> fiche de page du module « finance ». */
const F = '/tenant/:tenantId/finance';

export const routes: HelpRoute[] = [
  // Zone caisse
  { pattern: `${F}/caisse`, helpId: 'finance.caisse.page' },
  { pattern: `${F}/pieces-de-caisse`, helpId: 'finance.pieces-de-caisse.page' },
  { pattern: `${F}/tresorerie`, helpId: 'finance.tresorerie.page' },
  { pattern: `${F}/validation`, helpId: 'finance.validation.page' },
  { pattern: `${F}/importation`, helpId: 'finance.importation.page' },
  // Zone comptabilite
  { pattern: `${F}/comptabilite`, helpId: 'finance.journal.page' },
  { pattern: `${F}/comptabilite/journal`, helpId: 'finance.journal.page' },
  { pattern: `${F}/comptabilite/grand-livre`, helpId: 'finance.grand-livre.page' },
  { pattern: `${F}/comptabilite/balance`, helpId: 'finance.balance-generale.page' },
  { pattern: `${F}/comptabilite/mandants`, helpId: 'finance.mandants.page' },
  { pattern: `${F}/comptes/:accountId`, helpId: 'finance.releve.page' },
  // Zone facturation
  { pattern: `${F}/facturation`, helpId: 'finance.facturation.page' },
  { pattern: `${F}/balance-clients`, helpId: 'finance.balance-clients.page' },
  { pattern: `${F}/balance-agee`, helpId: 'finance.balance-agee.page' },
  { pattern: `${F}/owner-accounts`, helpId: 'finance.comptes-proprietaires.page' },
  { pattern: `${F}/owner-accounts/:ownerClientId`, helpId: 'finance.compte-proprietaire.page' },
  { pattern: `${F}/associations`, helpId: 'finance.associations.page' },
  { pattern: `${F}/associations/:partnershipId`, helpId: 'finance.association.page' },
  { pattern: `${F}/commissions`, helpId: 'finance.commissions.page' },
  // Zone fournisseurs
  { pattern: `${F}/fournisseurs`, helpId: 'finance.fournisseurs.page' },
  { pattern: `${F}/factures-fournisseurs`, helpId: 'finance.factures-fournisseurs.page' },
  { pattern: `${F}/bons-de-commande`, helpId: 'finance.bons-de-commande.page' },
  { pattern: `${F}/bons-de-commande/nouveau`, helpId: 'finance.bon-de-commande.page' },
  { pattern: `${F}/bons-de-commande/:orderId`, helpId: 'finance.bon-de-commande.page' },
  { pattern: `${F}/fournisseurs/balance`, helpId: 'finance.balance-fournisseurs.page' },
  { pattern: `${F}/retenues`, helpId: 'finance.retenues.page' },
  // Zone chantiers
  { pattern: `${F}/chantiers`, helpId: 'finance.chantiers.page' },
  { pattern: `${F}/chantiers/:siteId`, helpId: 'finance.chantier.page' },
  { pattern: `${F}/chantiers/:siteId/budget`, helpId: 'finance.budget-chantier.page' },
  { pattern: `${F}/chantiers/:siteId/stock`, helpId: 'finance.stock-chantier.page' },
  { pattern: `${F}/chantiers/:siteId/cloture`, helpId: 'finance.cloture-chantier.page' },
  { pattern: `${F}/tableau-de-bord-chantiers`, helpId: 'finance.tableau-de-bord-chantiers.page' },
  { pattern: `${F}/baux-terrain`, helpId: 'finance.baux-terrain.page' },
  { pattern: `${F}/baux-terrain/:landLeaseId`, helpId: 'finance.bail-terrain.page' },
  // Zone stock
  { pattern: `${F}/stock`, helpId: 'finance.stock.page' },
  { pattern: `${F}/stock/magasin`, helpId: 'finance.magasin.page' },
  { pattern: `${F}/stock/preneurs`, helpId: 'finance.preneurs.page' },
  { pattern: `${F}/stock/parametrage`, helpId: 'finance.articles-lieux.page' },
  // Zone stock-controle
  { pattern: `${F}/stock/inventaire`, helpId: 'finance.inventaire.page' },
  { pattern: `${F}/stock/controle`, helpId: 'finance.controle-stock.page' },
  { pattern: `${F}/stock/comptages-terrain`, helpId: 'finance.comptages-terrain.page' },
  { pattern: `${F}/stock/whatsapp`, helpId: 'finance.whatsapp.page' },
  // Zone personnel
  { pattern: `${F}/salaires`, helpId: 'finance.salaires.page' },
  { pattern: `${F}/salaires/:employeeId`, helpId: 'finance.salarie.page' },
  { pattern: `${F}/tacherons`, helpId: 'finance.tacherons.page' },
  { pattern: `${F}/tacherons/:contractorId`, helpId: 'finance.tacheron.page' }
];
