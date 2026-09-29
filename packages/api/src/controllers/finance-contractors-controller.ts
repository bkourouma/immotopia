import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  createContractorContractTx,
  createContractorPaymentTx,
  createContractorTx,
  createProgressStatementTx,
  getContractorContract,
  listContractorContracts,
  listContractorPayments,
  listContractors,
  listProgressStatements,
  validateContractorPaymentTx,
  validateProgressStatementTx
} from '../lib/finance/contractors';
import {
  createContractorContractSchema,
  createContractorPaymentSchema,
  createContractorSchema,
  createProgressStatementSchema,
  listContractorContractsQuerySchema,
  listContractorsQuerySchema,
  uuidPathParamSchema
} from '../lib/finance/schemas-contractors';
import { outflowPayerSchema } from '../lib/treasury/outflow';
import { prisma } from '../utils/database';

/**
 * Contrôleur des onze points d'entrée des tâcherons — lot 4, quatrième
 * sous-lot (`lib/finance/types-lot4-contractors.ts`, contrat gelé).
 *
 * Modèle : `controllers/finance-salaries-controller.ts` (lot 4, troisième
 * sous-lot). Chaque handler est enveloppé dans `asyncHandler` et laisse le
 * middleware central (`middleware/error-middleware.ts`) traduire les erreurs
 * — celles du domaine (`lib/finance/contractors.ts`, typées par
 * `lib/errors.ts`) comme celles levées ici (`BadRequestError`). Aucun
 * `try/catch` ne devine de statut HTTP depuis un message.
 *
 * Isolation multi-tenant : `tenantId` vient toujours de l'URL (posé par
 * `requireTenantAccess` en amont), jamais du corps ou d'une query.
 *
 * `contractorId`, `contractId`, `statementId` et `paymentId` viennent
 * TOUJOURS du chemin sur les routes qui les portent, jamais du corps : les
 * schémas (`schemas-contractors.ts`) sont `.strict()` et rejetteraient de
 * toute façon un corps qui les répéterait.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations financières.');
  }
  return tenantId;
}

/** Identifiant de chemin (tâcheron, marché, situation, règlement) : rejeté en 400 s'il n'a pas la forme d'un UUID. */
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
// A. GET contractors — liste
// ---------------------------------------------------------------------------

export const listContractorsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = listContractorsQuerySchema.parse(req.query ?? {});

  const contractors = await listContractors(tenantId, { onlyActive: query.onlyActive });

  res.status(200).json({ success: true, data: contractors });
});

// ---------------------------------------------------------------------------
// B. POST contractors — enregistrement
// ---------------------------------------------------------------------------

export const createContractorHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const body = createContractorSchema.parse(req.body ?? {});

  const contractor = await prisma.$transaction(tx =>
    createContractorTx(tx, tenantId, { fullName: body.fullName, trade: body.trade ?? null })
  );

  res.status(201).json({ success: true, data: contractor });
});

// ---------------------------------------------------------------------------
// C. GET contractor-contracts — liste transversale, filtrée en query
// (contractorId, siteId).
// ---------------------------------------------------------------------------

export const listContractorContractsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = listContractorContractsQuerySchema.parse(req.query ?? {});

  const contracts = await listContractorContracts(tenantId, {
    contractorId: query.contractorId,
    siteId: query.siteId
  });

  res.status(200).json({ success: true, data: contracts });
});

// ---------------------------------------------------------------------------
// D. POST contractors/:contractorId/contracts — enregistrement d'un marché
// ---------------------------------------------------------------------------

export const createContractorContractHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const contractorId = requireUuidParam(req, 'contractorId');
  const body = createContractorContractSchema.parse(req.body ?? {});

  const contract = await prisma.$transaction(tx =>
    createContractorContractTx(tx, tenantId, {
      contractorId,
      siteId: body.siteId,
      costCategoryId: body.costCategoryId,
      reference: body.reference,
      agreedAmount: body.agreedAmount,
      signedDate: body.signedDate
    })
  );

  res.status(201).json({ success: true, data: contract });
});

// ---------------------------------------------------------------------------
// E. GET contractor-contracts/:contractId — détail
// ---------------------------------------------------------------------------

export const getContractorContractHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const contractId = requireUuidParam(req, 'contractId');

  const contract = await getContractorContract(tenantId, contractId);

  res.status(200).json({ success: true, data: contract });
});

// ---------------------------------------------------------------------------
// F. GET contractor-contracts/:contractId/statements — liste
// ---------------------------------------------------------------------------

export const listProgressStatementsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const contractId = requireUuidParam(req, 'contractId');

  const statements = await listProgressStatements(tenantId, contractId);

  res.status(200).json({ success: true, data: statements });
});

// ---------------------------------------------------------------------------
// G. POST contractor-contracts/:contractId/statements — saisie en brouillon
// ---------------------------------------------------------------------------

export const createProgressStatementHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const contractId = requireUuidParam(req, 'contractId');
  const body = createProgressStatementSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const statement = await prisma.$transaction(tx =>
    createProgressStatementTx(tx, tenantId, {
      contractId,
      statementDate: body.statementDate,
      amount: body.amount,
      description: body.description,
      createdByUserId: actorUserId
    })
  );

  res.status(201).json({ success: true, data: statement });
});

// ---------------------------------------------------------------------------
// H. POST progress-statements/:statementId/validate
//
// Porte le droit de validation (`requireDocumentsValidate`), distinct de la
// création (décision D7, comme aux sous-lots précédents) : plusieurs
// saisisseurs, un validateur.
// ---------------------------------------------------------------------------

export const validateProgressStatementHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const statementId = requireUuidParam(req, 'statementId');
  const actorUserId = requireActorUserId(req);

  const statement = await prisma.$transaction(tx =>
    validateProgressStatementTx(tx, tenantId, statementId, actorUserId)
  );

  res.status(200).json({ success: true, data: statement });
});

// ---------------------------------------------------------------------------
// I. GET contractors/:contractorId/payments — liste
// ---------------------------------------------------------------------------

export const listContractorPaymentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const contractorId = requireUuidParam(req, 'contractorId');

  const payments = await listContractorPayments(tenantId, contractorId);

  res.status(200).json({ success: true, data: payments });
});

// ---------------------------------------------------------------------------
// J. POST contractors/:contractorId/payments — saisie en brouillon
// ---------------------------------------------------------------------------

export const createContractorPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const contractorId = requireUuidParam(req, 'contractorId');
  const body = createContractorPaymentSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const payment = await prisma.$transaction(tx =>
    createContractorPaymentTx(tx, tenantId, {
      contractorId,
      paymentDate: body.paymentDate,
      amount: body.amount,
      createdByUserId: actorUserId
    })
  );

  res.status(201).json({ success: true, data: payment });
});

// ---------------------------------------------------------------------------
// K. POST contractor-payments/:paymentId/validate
// ---------------------------------------------------------------------------

export const validateContractorPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const paymentId = requireUuidParam(req, 'paymentId');
  const actorUserId = requireActorUserId(req);

  // Mode et compte payeur : facultatifs, défaut espèces/caisse (BUG-2026-09-29-032).
  const payer = outflowPayerSchema.parse(req.body ?? {});

  const payment = await prisma.$transaction(tx =>
    validateContractorPaymentTx(tx, tenantId, paymentId, actorUserId, payer)
  );

  res.status(200).json({ success: true, data: payment });
});
