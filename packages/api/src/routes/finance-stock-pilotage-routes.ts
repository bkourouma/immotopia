import { Router } from 'express';

/**
 * Routes du pilotage du stock — lot 040 (alertes, indicateurs, réglages de
 * contrôle).
 *
 * **Squelette posé par l'étape des fondations** : le routeur est monté dans
 * `app.ts` et ne porte encore aucune route. Le territoire API-5 y déclare
 * `GET /stock/alerts`, `POST /stock/alerts/:alertId/acknowledge`,
 * `GET /stock/indicators` et `GET/PATCH /stock/settings/controls`, chacune avec
 * ses gardes (`authenticate`, `requireTenantAccess` et une garde `STOCK_*`)
 * posés AVEC leur chemin, jamais en `router.use` nu.
 */

const router = Router();

export default router;
