import type { HelpRoute } from '../../types';

/** Motifs de route -> fiche de page du module « locatif ». */
export const routes: HelpRoute[] = [{ pattern: '/tenant/:tenantId/rental/leases', helpId: 'locatif.baux.liste' }];
