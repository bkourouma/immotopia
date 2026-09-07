import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import {
  generateStatementSchema,
  updateStatementSchema
} from '../lib/patrimoine/schemas';
import {
  generateOwnerStatement,
  getOwnerStatementById,
  listOwnerStatements,
  updateOwnerStatement
} from '../lib/patrimoine/queries';
import { sendOwnerStatement } from '../lib/patrimoine/notifications';
import { badRequest } from '../lib/errors';

function resolveTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw badRequest('TenantId manquant');
  return tenantId;
}

export async function listOwnerStatementsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = resolveTenantId(req);
    const ownerContactId = req.query.ownerContactId as string | undefined;
    const period = req.query.period as string | undefined;
    const data = await listOwnerStatements(tenantId, { ownerContactId, period });
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error listing owner statements', { error });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 500).json({ success: false, error: typed.message || 'Echec liste releves' });
  }
}

export async function createOwnerStatementHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = resolveTenantId(req);
    const parsed = generateStatementSchema.parse(req.body);
    const data = await generateOwnerStatement(tenantId, parsed);
    res.status(201).json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error creating owner statement', { error, body: req.body });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 400).json({ success: false, error: typed.message || 'Echec generation releve' });
  }
}

export async function getOwnerStatementHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = resolveTenantId(req);
    const statementId = req.params.statementId;
    if (!statementId) throw badRequest('StatementId manquant');
    const data = await getOwnerStatementById(tenantId, statementId);
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error getting owner statement', { error });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 500).json({ success: false, error: typed.message || 'Echec detail releve' });
  }
}

export async function updateOwnerStatementHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = resolveTenantId(req);
    const statementId = req.params.statementId;
    if (!statementId) throw badRequest('StatementId manquant');
    const parsed = updateStatementSchema.parse(req.body);
    const data = await updateOwnerStatement(tenantId, statementId, parsed);
    res.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Error updating owner statement', { error, body: req.body });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 400).json({ success: false, error: typed.message || 'Echec mise a jour releve' });
  }
}

export async function sendOwnerStatementHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = resolveTenantId(req);
    const statementId = req.params.statementId;
    if (!statementId) throw badRequest('StatementId manquant');

    const statement = await getOwnerStatementById(tenantId, statementId);
    const result = await sendOwnerStatement(statement.id);
    res.status(result.sent ? 202 : 200).json({ success: true, data: result });
  } catch (error: unknown) {
    logger.error('Error sending owner statement', { error });
    const typed = error as { status?: number; message?: string };
    res.status(typed.status || 500).json({ success: false, error: typed.message || 'Echec envoi releve' });
  }
}

