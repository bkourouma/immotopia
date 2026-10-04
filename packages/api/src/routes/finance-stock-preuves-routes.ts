import { Router } from 'express';

/**
 * Routes des preuves du stock — lot 040 (bons PDF, pièces jointes).
 *
 * **Squelette posé par l'étape des fondations** : le routeur est monté dans
 * `app.ts` et ne porte encore aucune route. Le territoire API-4 y déclare
 * `GET /stock/slips/:slipId`, `GET /stock/slips/:slipId/pdf`,
 * `GET /stock/counts/:countId/report.pdf` et les routes `/stock/attachments`,
 * chacune avec ses gardes (`authenticate`, `requireTenantAccess` et une garde
 * `STOCK_*`) posés AVEC leur chemin, jamais en `router.use` nu.
 */

const router = Router();

export default router;
