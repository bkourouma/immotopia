import { Router } from 'express';

/**
 * Relances de paiement de loyer envoyées aux locataires, côté gestionnaire.
 *
 * Territoire du lot en charge des relances : ce routeur est VIDE, le lot le remplit.
 * Monté sur `/api` tout entier dans `app.ts` : les gardes se posent AVEC leur
 * chemin (comme `routes/syndic-declared-payment-routes.ts`), jamais en
 * `router.use` nu.
 */
const router = Router();

export default router;
