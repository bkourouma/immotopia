import { Request, Response } from 'express';
import {
  generateStatementSchema,
  listOwnerStatementsQuerySchema,
  updateStatementSchema
} from '../lib/patrimoine/schemas';
import { t } from '../i18n';
import {
  generateOwnerStatement,
  getOwnerStatementById,
  listOwnerStatements,
  recomputeOwnerStatement,
  updateOwnerStatement
} from '../lib/patrimoine/queries';
import { asyncHandler, BadRequestError, ConflictError } from '../middleware/error-middleware';
import { sendOwnerStatement } from '../lib/patrimoine/notifications';
import { OWNER_STATEMENT_COMPUTATION_VERSION } from '../lib/patrimoine/owner-statement-computation';

function resolveTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError('TenantId manquant');
  return tenantId;
}

/** Valide les parametres de requete ; toute valeur invalide leve une `BadRequestError` (400). */
export function parseListOwnerStatementsQuery(query: Request['query']) {
  const parsed = listOwnerStatementsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new BadRequestError(
      t('Paramètres de recherche invalides.'),
      parsed.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message }))
    );
  }
  return parsed.data;
}

/**
 * GET /tenants/:tenantId/owner-statements
 * Sans page ni limit : liste complete `{ data: [...] }`. Avec page ou limit :
 * `{ data, pagination, legacyUnpaidCount }`.
 */
export const listOwnerStatementsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const filters = parseListOwnerStatementsQuery(req.query);
  const result = await listOwnerStatements(tenantId, filters);
  if (Array.isArray(result)) {
    res.json({ success: true, data: result });
    return;
  }
  res.json({
    success: true,
    data: result.items,
    pagination: result.pagination,
    legacyUnpaidCount: result.legacyUnpaidCount
  });
});

export const createOwnerStatementHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const parsed = generateStatementSchema.parse(req.body);
  const data = await generateOwnerStatement(tenantId, parsed);
  res.status(201).json({ success: true, data });
});

export const getOwnerStatementHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const statementId = req.params.statementId;
  if (!statementId) throw new BadRequestError('StatementId manquant');
  const data = await getOwnerStatementById(tenantId, statementId);
  res.json({ success: true, data });
});

export const updateOwnerStatementHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const statementId = req.params.statementId;
  if (!statementId) throw new BadRequestError('StatementId manquant');
  const parsed = updateStatementSchema.parse(req.body);
  const data = await updateOwnerStatement(tenantId, statementId, parsed);
  res.json({ success: true, data });
});

export const sendOwnerStatementHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const statementId = req.params.statementId;
  if (!statementId) throw new BadRequestError('StatementId manquant');

  const statement = await getOwnerStatementById(tenantId, statementId);
  // Un releve de l'ancien calcul porte le loyer du contrat pour un loyer
  // encaisse : l'envoyer tel quel repeterait l'erreur.
  if (statement.computationVersion < OWNER_STATEMENT_COMPUTATION_VERSION) {
    throw new ConflictError("Ce relevé a été calculé selon l'ancienne méthode : recalculez-le avant de l'envoyer.");
  }
  const result = await sendOwnerStatement(statement.id, tenantId);
  res.status(result.sent ? 202 : 200).json({ success: true, data: result });
});

/**
 * Recalcule un relevé avec ses propres biens et son propre mois — le moyen de
 * corriger un relevé produit par l'ancien calcul.
 */
export const recomputeOwnerStatementHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const statementId = req.params.statementId;
  if (!statementId) throw new BadRequestError('StatementId manquant');
  const data = await recomputeOwnerStatement(tenantId, statementId);
  res.json({ success: true, data });
});
