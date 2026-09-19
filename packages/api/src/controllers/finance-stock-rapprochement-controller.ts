import { Request, Response } from 'express';

import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  enableStockOnSiteTx,
  getSiteStockReconciliation,
  getSiteStockStatus
} from '../lib/finance/stock-rapprochement';
import {
  enableSiteStockSchema,
  siteStockQuerySchema,
  uuidPathParamSchema
} from '../lib/finance/schemas-stock-rapprochement';
import { prisma } from '../utils/database';

/**
 * Contrôleur des trois points d'entrée de la bascule au stock et du
 * rapprochement — lot 5, quatrième sous-lot
 * (`lib/finance/types-lot5-rapprochement.ts`).
 *
 * Modèle : `controllers/finance-stock-mouvements-controller.ts` (deuxième
 * sous-lot) et `controllers/finance-site-closing-controller.ts` (lot 4).
 * Chaque handler est enveloppé dans `asyncHandler` et laisse le middleware
 * central (`middleware/error-middleware.ts`) traduire les erreurs — celles du
 * domaine (`lib/finance/stock-rapprochement.ts`, typées par `lib/errors.ts`)
 * comme celles levées ici (`BadRequestError`, `ZodError`). Aucun `try/catch`
 * ne devine de statut HTTP depuis un message.
 *
 * Isolation multi-tenant : `tenantId` vient toujours de l'URL (posé par
 * `requireTenantAccess` en amont), jamais du corps ni d'une query. `siteId`
 * vient toujours du chemin.
 *
 * **La date de la bascule vient d'ici, jamais du corps.** `new Date()` est
 * l'instant de la décision. Une date choisie par l'appelant permettrait
 * d'antidater la bascule et de reclasser après coup des factures déjà
 * imputées ; le schéma est `.strict()` et vide, un corps qui porterait
 * `enabledAt` a déjà échoué en 400.
 *
 * **Aucun libellé comptable ne sort d'ici** (principe P-1 du PRD) : les mots
 * « débit » et « crédit » n'apparaissent dans aucun message ni aucun champ
 * renvoyé.
 *
 * **Et aucune interprétation de l'écart.** `unreconciledAmount` est rendu tel
 * quel, sans message qui le qualifierait de perte, de vol ou d'anomalie : un
 * vol et des frais de transport se ressemblent dans une soustraction, et
 * trancher à la place d'un humain serait accuser quelqu'un sur un chiffre.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations financières.');
  }
  return tenantId;
}

/** Identifiant de chemin : rejeté en 400 s'il n'a pas la forme d'un UUID. */
function requireUuidParam(req: Request, name: string): string {
  const parsed = uuidPathParamSchema.safeParse(req.params[name]);
  if (!parsed.success) {
    throw new BadRequestError(`Le paramètre ${name} doit être un identifiant valide.`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// A. POST /sites/:siteId/stock/enable — la bascule, IRRÉVERSIBLE
//
// Il n'y a volontairement aucune route inverse dans ce fichier : ni
// `disable`, ni variante d'administrateur. Voir l'en-tête du domaine.
// ---------------------------------------------------------------------------

export const enableSiteStockHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');
  enableSiteStockSchema.parse(req.body ?? {});

  const status = await prisma.$transaction(tx => enableStockOnSiteTx(tx, tenantId, siteId, { enabledAt: new Date() }));

  res.status(200).json({ success: true, data: status });
});

// ---------------------------------------------------------------------------
// B. GET /sites/:siteId/stock/status — basculé ou non, et où atterrissent les
// réceptions
// ---------------------------------------------------------------------------

export const getSiteStockStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');
  siteStockQuerySchema.parse(req.query ?? {});

  const status = await getSiteStockStatus(tenantId, siteId);

  res.status(200).json({ success: true, data: status });
});

// ---------------------------------------------------------------------------
// C. GET /sites/:siteId/stock/reconciliation — acheté / consommé / restant
//
// Répond aussi pour un chantier qui n'a pas basculé. Refuser obligerait
// l'écran à savoir d'avance ce qu'il vient demander.
//
// Ce commentaire disait « tout y vaut zéro ». C'est faux, et le contrat l'a
// démenti depuis : seuls `invoicedAmount` et `unreconciledAmount` valent zéro
// sans bascule, parce qu'il n'y a pas de période à confronter. Le consommé, le
// reçu et le restant disent la vérité dans tous les cas — un magasin central
// peut très bien avoir livré des sorties qui ont déjà imputé le coût du
// chantier, et les afficher à zéro ferait mentir l'écran.
// ---------------------------------------------------------------------------

export const getSiteStockReconciliationHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');
  siteStockQuerySchema.parse(req.query ?? {});

  const reconciliation = await getSiteStockReconciliation(tenantId, siteId);

  res.status(200).json({ success: true, data: reconciliation });
});
