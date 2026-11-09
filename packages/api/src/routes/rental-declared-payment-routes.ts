import { Router } from 'express';

/**
 * Paiement de loyer déclaré, côté gestionnaire (numéros de réception, réglages, déclarations).
 *
 * Territoire du lot 1 : ce routeur est VIDE, le lot le remplit.
 * Monté sur `/api` tout entier dans `app.ts` : les gardes se posent AVEC leur
 * chemin (comme `routes/syndic-declared-payment-routes.ts`), jamais en
 * `router.use` nu.
 */
const router = Router();

export default router;
