import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requireAccountsRead, requireReportsRead, requireSettingsManage } from '../middleware/finance-rbac-middleware';
import {
  addPartnershipShareHandler,
  attachPropertyToPartnershipHandler,
  createPartnershipHandler,
  getPartnershipHandler,
  getPartnerStatementHandler,
  listPartnershipsHandler,
  removePartnershipShareHandler
} from '../controllers/finance-partnerships-controller';

/**
 * Routes agence du module financier opérationnel — lot 4, deuxième sous-lot :
 * les associations (`lib/finance/types-lot4-partnerships.ts`, contrat gelé).
 *
 * **Ce fichier ne se monte pas lui-même** : c'est le rôle de `src/index.ts`,
 * hors du territoire de cet agent (fichier-registre monté à l'intégration).
 * Modèle : `routes/finance-land-leases-routes.ts` (sous-lot précédent).
 *
 * **Gardes posés avec leur chemin**, jamais en `router.use(authenticate)`
 * nu. Un garde posé sans chemin sur un routeur monté sur `/api` tout entier
 * traverserait toute requête `/api/*`, y compris une route publique montée
 * après lui — l'incident du lot 1, documenté dans `finance-routes.ts`. Ici
 * comme là-bas, le garde ne s'applique qu'au préfixe que ce routeur sert
 * réellement : `/tenants/:tenantId/finance`.
 *
 * **Sept routes, pas huit.** La consigne de ce sous-lot annonçait « huit
 * signatures du contrat, et ces huit routes », mais le tableau fourni n'en
 * comptait que sept : les sept ci-dessous, une par fonction du contrat SAUF
 * `DistributeInstallmentToPartnersTx`, qui n'a jamais eu de route — elle est
 * appelée par la campagne de facturation (`billing-run.ts`), pas par une
 * requête HTTP directe (même absence de route que
 * `RunMonthlyLandLeaseAccruals` au sous-lot précédent). Signalé dans la
 * rubrique « HYPOTHÈSES » du rapport de fin de tâche plutôt que traité en
 * silence.
 *
 * **Aucune permission neuve** : les trois droits déjà posés aux lots 1/2
 * (`requireAccountsRead`, `requireSettingsManage`, `requireReportsRead`)
 * couvrent les sept routes, exactement comme demandé par la consigne.
 */

const router = Router();

router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

router.get('/tenants/:tenantId/finance/partnerships', requireAccountsRead, listPartnershipsHandler);

router.post('/tenants/:tenantId/finance/partnerships', requireSettingsManage, createPartnershipHandler);

router.get('/tenants/:tenantId/finance/partnerships/:partnershipId', requireAccountsRead, getPartnershipHandler);

router.post(
  '/tenants/:tenantId/finance/partnerships/:partnershipId/shares',
  requireSettingsManage,
  addPartnershipShareHandler
);

// Retrait d'un associé : porte le même droit que l'ajout — gérer les
// associés d'une association est la même responsabilité que gérer
// l'association elle-même (même logique qu'au lot 4, premier sous-lot, pour
// le rattachement d'un chantier à un bail).
router.delete(
  '/tenants/:tenantId/finance/partnership-shares/:shareId',
  requireSettingsManage,
  removePartnershipShareHandler
);

router.put(
  '/tenants/:tenantId/finance/properties/:propertyId/partnership',
  requireSettingsManage,
  attachPropertyToPartnershipHandler
);

router.get(
  '/tenants/:tenantId/finance/partnership-shares/:shareId/statement',
  requireReportsRead,
  getPartnerStatementHandler
);

export default router;
