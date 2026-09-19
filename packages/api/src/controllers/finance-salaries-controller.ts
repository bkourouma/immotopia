import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  createEmployeeTx,
  createSalaryNoteTx,
  createSalaryPaymentTx,
  getEmployee,
  listEmployees,
  listSalaryNotes,
  listSalaryPayments,
  validateSalaryNoteTx,
  validateSalaryPaymentTx
} from '../lib/finance/salaries';
import {
  createEmployeeSchema,
  createSalaryNoteSchema,
  createSalaryPaymentSchema,
  listEmployeesQuerySchema,
  listSalaryNotesQuerySchema,
  uuidPathParamSchema
} from '../lib/finance/schemas-salaries';
import { prisma } from '../utils/database';

/**
 * Contrôleur des neuf points d'entrée des salaires — lot 4, troisième
 * sous-lot (`lib/finance/types-lot4-salaries.ts`).
 *
 * Modèle : `controllers/finance-land-leases-controller.ts` (lot 4, premier
 * sous-lot). Chaque handler est enveloppé dans `asyncHandler` et laisse le
 * middleware central (`middleware/error-middleware.ts`) traduire les erreurs
 * — celles du domaine (`lib/finance/salaries.ts`, typées par `lib/errors.ts`)
 * comme celles levées ici (`BadRequestError`). Aucun `try/catch` ne devine de
 * statut HTTP depuis un message.
 *
 * Isolation multi-tenant : `tenantId` vient toujours de l'URL (posé par
 * `requireTenantAccess` en amont), jamais du corps ou d'une query.
 *
 * `employeeId` vient TOUJOURS du chemin sur les routes qui le portent
 * (`salary-notes`, `salary-payments`), jamais du corps : les schémas
 * (`schemas-salaries.ts`) sont `.strict()` et rejetteraient de toute façon un
 * corps qui le répéterait.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations financières.');
  }
  return tenantId;
}

/** Identifiant de chemin (employé, note, règlement) : rejeté en 400 s'il n'a pas la forme d'un UUID. */
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
// A. GET employees — liste
// ---------------------------------------------------------------------------

export const listEmployeesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = listEmployeesQuerySchema.parse(req.query ?? {});

  const employees = await listEmployees(tenantId, { onlyActive: query.onlyActive });

  res.status(200).json({ success: true, data: employees });
});

// ---------------------------------------------------------------------------
// B. POST employees — enregistrement
// ---------------------------------------------------------------------------

export const createEmployeeHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const body = createEmployeeSchema.parse(req.body ?? {});

  const employee = await prisma.$transaction(tx =>
    createEmployeeTx(tx, tenantId, { fullName: body.fullName, role: body.role ?? null })
  );

  res.status(201).json({ success: true, data: employee });
});

// ---------------------------------------------------------------------------
// C. GET employees/:employeeId — détail
// ---------------------------------------------------------------------------

export const getEmployeeHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const employeeId = requireUuidParam(req, 'employeeId');

  const employee = await getEmployee(tenantId, employeeId);

  res.status(200).json({ success: true, data: employee });
});

// ---------------------------------------------------------------------------
// D. GET salary-notes — liste transversale, filtrée en query
// ---------------------------------------------------------------------------

export const listSalaryNotesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = listSalaryNotesQuerySchema.parse(req.query ?? {});

  const notes = await listSalaryNotes(tenantId, {
    employeeId: query.employeeId,
    siteId: query.siteId,
    periodYear: query.periodYear,
    periodMonth: query.periodMonth
  });

  res.status(200).json({ success: true, data: notes });
});

// ---------------------------------------------------------------------------
// E. POST employees/:employeeId/salary-notes — saisie en brouillon
// ---------------------------------------------------------------------------

export const createSalaryNoteHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const employeeId = requireUuidParam(req, 'employeeId');
  const body = createSalaryNoteSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const note = await prisma.$transaction(tx =>
    createSalaryNoteTx(tx, tenantId, {
      employeeId,
      periodYear: body.periodYear,
      periodMonth: body.periodMonth,
      amount: body.amount,
      siteId: body.siteId ?? null,
      costCategoryId: body.costCategoryId ?? null,
      createdByUserId: actorUserId
    })
  );

  res.status(201).json({ success: true, data: note });
});

// ---------------------------------------------------------------------------
// F. POST salary-notes/:salaryNoteId/validate
//
// Porte le droit de validation (`requireDocumentsValidate`), distinct de la
// création (décision D7, comme au lot 2) : plusieurs saisisseurs, un
// validateur.
// ---------------------------------------------------------------------------

export const validateSalaryNoteHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const salaryNoteId = requireUuidParam(req, 'salaryNoteId');
  const actorUserId = requireActorUserId(req);

  const note = await prisma.$transaction(tx => validateSalaryNoteTx(tx, tenantId, salaryNoteId, actorUserId));

  res.status(200).json({ success: true, data: note });
});

// ---------------------------------------------------------------------------
// G. GET employees/:employeeId/salary-payments — liste
// ---------------------------------------------------------------------------

export const listSalaryPaymentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const employeeId = requireUuidParam(req, 'employeeId');

  const payments = await listSalaryPayments(tenantId, employeeId);

  res.status(200).json({ success: true, data: payments });
});

// ---------------------------------------------------------------------------
// H. POST employees/:employeeId/salary-payments — saisie en brouillon
// ---------------------------------------------------------------------------

export const createSalaryPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const employeeId = requireUuidParam(req, 'employeeId');
  const body = createSalaryPaymentSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const payment = await prisma.$transaction(tx =>
    createSalaryPaymentTx(tx, tenantId, {
      employeeId,
      paymentDate: body.paymentDate,
      amount: body.amount,
      createdByUserId: actorUserId
    })
  );

  res.status(201).json({ success: true, data: payment });
});

// ---------------------------------------------------------------------------
// I. POST salary-payments/:salaryPaymentId/validate
// ---------------------------------------------------------------------------

export const validateSalaryPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const salaryPaymentId = requireUuidParam(req, 'salaryPaymentId');
  const actorUserId = requireActorUserId(req);

  const payment = await prisma.$transaction(tx => validateSalaryPaymentTx(tx, tenantId, salaryPaymentId, actorUserId));

  res.status(200).json({ success: true, data: payment });
});
