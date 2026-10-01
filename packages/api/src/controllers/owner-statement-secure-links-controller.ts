import { Request, Response } from 'express';
import { z } from 'zod';
import { t } from '../i18n';
import { getOwnerStatementById } from '../lib/patrimoine/queries';
import { sendOwnerMonthlyReport } from '../lib/patrimoine/notifications';
import { OWNER_STATEMENT_COMPUTATION_VERSION } from '../lib/patrimoine/owner-statement-computation';
import { createSecureLink, listSecureLinks, revokeSecureLink } from '../lib/secure-links';
import { asyncHandler, BadRequestError, ConflictError } from '../middleware/error-middleware';

/**
 * Liens sécurisés du rapport d'un relevé de gérance (lot A3) et envoi du
 * rapport mensuel au propriétaire. Contrat côté web :
 * `/tenants/:tenantId/owner-statements/:statementId/{secure-links,send-monthly-report}`.
 *
 * Chaque handler lit d'abord le relevé par `getOwnerStatementById(tenantId, …)` :
 * un relevé d'une autre agence lève la même `NotFoundError` qu'un relevé
 * inexistant, avant toute création ou lecture de lien. Le jeton en clair n'est
 * renvoyé qu'à la création (dans `url`), jamais journalisé ni relisible ensuite.
 */

const SECURE_LINK_SCOPE = 'OWNER_MONTHLY_REPORT' as const;
const SECURE_LINK_OBJECT_TYPE = 'OwnerStatement';

/** La borne min/max de la durée est vérifiée par `createSecureLink` (400). */
const createSecureLinkSchema = z.object({ ttlDays: z.number().int().optional() }).strict();

function resolveTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError(t('TenantId manquant'));
  return tenantId;
}

function resolveStatementId(req: Request): string {
  const statementId = req.params.statementId;
  if (!statementId) throw new BadRequestError(t('StatementId manquant'));
  return statementId;
}

/**
 * Un relevé brouillon n'est pas définitif, et un relevé de l'ancien calcul
 * porte un loyer erroné : ni lien, ni envoi tant qu'ils ne sont pas corrigés
 * (même garde que l'envoi du relevé, `/send`).
 */
export function assertStatementShareable(statement: { status: string; computationVersion: number }): void {
  if (statement.status === 'DRAFT') {
    throw new ConflictError(
      t('Ce relevé est encore un brouillon : validez-le avant de le partager avec le propriétaire.')
    );
  }
  if (statement.computationVersion < OWNER_STATEMENT_COMPUTATION_VERSION) {
    throw new ConflictError(t("Ce relevé a été calculé selon l'ancienne méthode : recalculez-le avant de l'envoyer."));
  }
}

export const createOwnerStatementSecureLinkHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const statementId = resolveStatementId(req);
  const body = createSecureLinkSchema.parse(req.body ?? {});
  const statement = await getOwnerStatementById(tenantId, statementId);
  assertStatementShareable(statement);

  const link = await createSecureLink({
    tenantId,
    scope: SECURE_LINK_SCOPE,
    objectType: SECURE_LINK_OBJECT_TYPE,
    objectId: statement.id,
    createdByUserId: req.user?.userId ?? null,
    ttlDays: body.ttlDays
  });
  res.status(201).json({ success: true, data: { id: link.id, url: link.url, expiresAt: link.expiresAt } });
});

export const listOwnerStatementSecureLinksHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const statementId = resolveStatementId(req);
  const statement = await getOwnerStatementById(tenantId, statementId);

  const data = await listSecureLinks(tenantId, {
    scope: SECURE_LINK_SCOPE,
    objectType: SECURE_LINK_OBJECT_TYPE,
    objectId: statement.id,
    activeOnly: true
  });
  res.json({ success: true, data });
});

export const revokeOwnerStatementSecureLinkHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const statementId = resolveStatementId(req);
  const linkId = req.params.linkId;
  if (!linkId) throw new BadRequestError(t('LinkId manquant'));
  const statement = await getOwnerStatementById(tenantId, statementId);

  // Le lien doit appartenir à CE relevé et à cette agence : le service filtre sur
  // `{ id, tenantId, objectType, objectId }` en une seule lecture, et un identifiant
  // d'un autre relevé ou d'une autre agence répond comme un identifiant inexistant.
  await revokeSecureLink(tenantId, linkId, req.user?.userId ?? 'system', {
    objectType: SECURE_LINK_OBJECT_TYPE,
    objectId: statement.id
  });
  res.json({ success: true, data: { revoked: true } });
});

export const sendOwnerMonthlyReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const statementId = resolveStatementId(req);
  const statement = await getOwnerStatementById(tenantId, statementId);
  assertStatementShareable(statement);

  // Envoi manuel : il ignore l'anti-doublon mensuel du job (`force`).
  const result = await sendOwnerMonthlyReport(statement.id, tenantId, {
    actorUserId: req.user?.userId ?? null,
    force: true
  });
  res.status(result.sent ? 202 : 200).json({ success: true, data: result });
});
