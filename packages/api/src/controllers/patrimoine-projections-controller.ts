import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { projectionRequestSchema, scenarioBodySchema, scenarioUpdateSchema } from '../lib/patrimoine/projection';
import { runProjection } from '../services/patrimoine-projections/projection-service';
import {
  createScenario,
  deleteScenario,
  getScenario,
  listScenarios,
  runScenario,
  updateScenario
} from '../services/patrimoine-projections/scenario-service';

/**
 * Contrôleurs des projections et scénarios (lot 3). Contrat :
 * `specs/025-patrimoine-projections-simulations/contracts/api.md`. Modèle :
 * `controllers/patrimoine-assets-controller.ts` (`asyncHandler` + erreurs typées).
 */

const uuid = z.string().uuid();
const runBodySchema = z.object({ compareScenarios: z.boolean().optional() }).strict();

function requireTenantId(req: Request): string {
  const tenantId = req.propertyTenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  return tenantId;
}

/** Auteur de l'action, pour le journal d'audit. */
function actor(req: Request): string | undefined {
  return req.user?.userId;
}

/** Un identifiant de chemin mal formé est une requête invalide, pas une erreur de base. */
function scenarioIdParam(req: Request): string {
  return uuid.parse(req.params.scenarioId);
}

export const projectionHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = projectionRequestSchema.parse(req.body ?? {});
  res.json({ data: await runProjection(requireTenantId(req), body) });
});

export const listScenariosHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await listScenarios(requireTenantId(req)) });
});

export const createScenarioHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = scenarioBodySchema.parse(req.body ?? {});
  res.status(201).json({ data: await createScenario(requireTenantId(req), body, actor(req)) });
});

export const getScenarioHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await getScenario(requireTenantId(req), scenarioIdParam(req)) });
});

export const updateScenarioHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = scenarioUpdateSchema.parse(req.body ?? {});
  res.json({ data: await updateScenario(requireTenantId(req), scenarioIdParam(req), body, actor(req)) });
});

export const deleteScenarioHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteScenario(requireTenantId(req), scenarioIdParam(req), actor(req));
  res.status(204).send();
});

export const runScenarioHandler = asyncHandler(async (req: Request, res: Response) => {
  const scenarioId = scenarioIdParam(req);
  const body = runBodySchema.parse(req.body ?? {});
  res.json({ data: await runScenario(requireTenantId(req), scenarioId, body) });
});
