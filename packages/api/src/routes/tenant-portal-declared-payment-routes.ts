import { Router } from 'express';

/**
 * Paiement de loyer déclaré, côté portail locataire.
 *
 * Territoire du lot 1 : ce routeur est VIDE, le lot le remplit.
 * Monté sur `/api` tout entier dans `app.ts` : les gardes se posent AVEC leur
 * chemin (comme `routes/syndic-declared-payment-routes.ts`), jamais en
 * `router.use` nu.
 * Monté sur `/api/portal/tenant` AVANT `tenantPortalRoutes` pour que les chemins
 * littéraux (ex. `/payments/declare/lecture`) passent avant les chemins à paramètres.
 */
const router = Router();

export default router;
