import type { HelpRoute } from '../../types';

/** Motifs de route -> fiche de page du module « syndic » (copropriétés, finances, assemblées, portail copropriétaire). */
const S = '/tenant/:tenantId/syndics';

export const routes: HelpRoute[] = [
  { pattern: S, helpId: 'syndic.copropriete.liste' },
  { pattern: `${S}/mandants`, helpId: 'syndic.mandants.liste' },
  { pattern: `${S}/:syndicId`, helpId: 'syndic.copropriete.fiche' },
  { pattern: `${S}/:syndicId/lots`, helpId: 'syndic.lots.liste' },
  { pattern: `${S}/:syndicId/lots/:lotId/compte`, helpId: 'syndic.lots.compte' },
  { pattern: `${S}/:syndicId/prestataires`, helpId: 'syndic.prestataires.liste' },
  { pattern: `${S}/:syndicId/profils-incidents`, helpId: 'syndic.profils.liste' },
  { pattern: `${S}/:syndicId/budgets`, helpId: 'syndic.budgets.liste' },
  { pattern: `${S}/:syndicId/charges`, helpId: 'syndic.charges.liste' },
  { pattern: `${S}/:syndicId/programmation`, helpId: 'syndic.programmation.liste' },
  { pattern: `${S}/:syndicId/suivi-mensuel`, helpId: 'syndic.suivi.liste' },
  { pattern: `${S}/:syndicId/quittances`, helpId: 'syndic.quittances.liste' },
  { pattern: `${S}/:syndicId/recouvrement`, helpId: 'syndic.recouvrement.liste' },
  { pattern: `${S}/:syndicId/finances`, helpId: 'syndic.tresorerie.liste' },
  { pattern: `${S}/:syndicId/paiements-en-ligne`, helpId: 'syndic.paiements.liste' },
  { pattern: `${S}/:syndicId/prelevements`, helpId: 'syndic.prelevements.liste' },
  { pattern: `${S}/:syndicId/prelevements/remises/:remittanceId`, helpId: 'syndic.prelevements.remise' },
  { pattern: `${S}/:syndicId/comptabilite`, helpId: 'syndic.comptabilite.liste' },
  { pattern: `${S}/:syndicId/assemblees`, helpId: 'syndic.assemblees.liste' },
  { pattern: `${S}/:syndicId/assemblees/:meetingId`, helpId: 'syndic.assemblees.detail' },
  { pattern: `${S}/:syndicId/documents`, helpId: 'syndic.documents.liste' },
  { pattern: '/copropriete', helpId: 'syndic.portail.lots' },
  { pattern: '/copropriete/lots/:lotId', helpId: 'syndic.portail.compte' },
  { pattern: '/copropriete/lots/:lotId/compte', helpId: 'syndic.portail.compte' },
  { pattern: '/copropriete/appels', helpId: 'syndic.portail.appels' },
  { pattern: '/copropriete/documents', helpId: 'syndic.portail.documents' },
  { pattern: '/copropriete/assemblees', helpId: 'syndic.portail.assemblees' },
  { pattern: '/copropriete/paiements', helpId: 'syndic.portail.paiements' },
  { pattern: '/copropriete/quittances', helpId: 'syndic.portail.quittances' },
  { pattern: '/copropriete/suivi-mensuel', helpId: 'syndic.portail.suivi' },
  { pattern: '/copropriete/ma-copropriete', helpId: 'syndic.portail.copropriete' }
];
