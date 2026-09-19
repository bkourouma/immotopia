import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  createRetentionTx,
  getRetention,
  getRetentionSummary,
  listRetentions,
  releaseRetentionTx
} from '../lib/finance/retentions';
import {
  createRetentionSchema,
  listRetentionsQuerySchema,
  releaseRetentionSchema,
  retentionSummaryQuerySchema,
  uuidPathParamSchema
} from '../lib/finance/schemas-retentions';
import { prisma } from '../utils/database';

/**
 * Contrôleur des cinq points d'entrée de la retenue de garantie — lot 4,
 * cinquième sous-lot (`lib/finance/types-lot4-retentions.ts`).
 *
 * Modèle : `controllers/finance-salaries-controller.ts` (sous-lot 3). Chaque
 * handler est enveloppé dans `asyncHandler` et laisse le middleware central
 * (`middleware/error-middleware.ts`) traduire les erreurs — celles du domaine
 * (`lib/finance/retentions.ts`, typées par `lib/errors.ts`) comme celles levées
 * ici (`BadRequestError`). Aucun `try/catch` ne devine de statut HTTP depuis un
 * message.
 *
 * Isolation multi-tenant : `tenantId` vient toujours de l'URL (posé par
 * `requireTenantAccess` en amont), jamais du corps ni d'une query.
 *
 * `retentionId` vient TOUJOURS du chemin, jamais du corps : le schéma de
 * libération est un objet vide et strict, et rejetterait de toute façon un
 * corps qui le répéterait.
 *
 * **Aucun libellé comptable ne sort d'ici** (principe P-1 du PRD) : les mots
 * « débit » et « crédit » n'apparaissent dans aucun message ni aucun champ
 * renvoyé. Le reclassement est une mécanique interne, l'écran ne voit qu'un
 * montant détenu puis rendu.
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

function requireActorUserId(req: Request): string {
  const actorUserId = req.user?.userId;
  if (!actorUserId) {
    throw new BadRequestError('Utilisateur authentifié requis pour cette opération financière.');
  }
  return actorUserId;
}

// ---------------------------------------------------------------------------
// A. POST /retentions — poser une retenue
// ---------------------------------------------------------------------------

export const createRetentionHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const body = createRetentionSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  // AUCUN MONTANT n'est transmis au domaine, parce qu'aucun n'est reçu : il se
  // dérive du taux et de la pièce source (principe P-4). Le schéma est
  // `.strict()`, un corps qui porterait `amount` a déjà échoué en 400.
  const retention = await prisma.$transaction(tx =>
    createRetentionTx(tx, tenantId, {
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      ratePercent: body.ratePercent,
      plannedReleaseDate: body.plannedReleaseDate,
      createdByUserId: actorUserId
    })
  );

  res.status(201).json({ success: true, data: retention });
});

// ---------------------------------------------------------------------------
// B. POST /retentions/:retentionId/release — libérer
//
// Porte le droit de VALIDATION (`requireDocumentsValidate`), distinct de la
// création (décision D7, comme depuis le lot 2) : rendre l'argent détenu en
// garantie est la décision de quelqu'un, pas une saisie courante.
// ---------------------------------------------------------------------------

export const releaseRetentionHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const retentionId = requireUuidParam(req, 'retentionId');
  // Parsé bien qu'attendu vide : c'est ce qui refuse un corps qui répéterait
  // `retentionId`, plutôt que de le jeter en silence.
  releaseRetentionSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const retention = await prisma.$transaction(tx => releaseRetentionTx(tx, tenantId, retentionId, actorUserId));

  res.status(200).json({ success: true, data: retention });
});

// ---------------------------------------------------------------------------
// C. GET /retentions — liste filtrée
// ---------------------------------------------------------------------------

export const listRetentionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = listRetentionsQuerySchema.parse(req.query ?? {});

  const retentions = await listRetentions(tenantId, {
    status: query.status,
    siteId: query.siteId,
    thirdPartyAccountId: query.thirdPartyAccountId,
    dueBefore: query.dueBefore
  });

  res.status(200).json({ success: true, data: retentions });
});

// ---------------------------------------------------------------------------
// D. GET /retentions/summary — ce qui est détenu, en un coup d'œil
// ---------------------------------------------------------------------------

export const getRetentionSummaryHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = retentionSummaryQuerySchema.parse(req.query ?? {});

  const summary = await getRetentionSummary(tenantId, { siteId: query.siteId });

  res.status(200).json({ success: true, data: summary });
});

// ---------------------------------------------------------------------------
// E. GET /retentions/:retentionId — détail
// ---------------------------------------------------------------------------

export const getRetentionHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const retentionId = requireUuidParam(req, 'retentionId');

  const retention = await getRetention(tenantId, retentionId);

  res.status(200).json({ success: true, data: retention });
});
