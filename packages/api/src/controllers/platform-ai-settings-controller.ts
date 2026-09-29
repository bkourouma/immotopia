import type { Request, Response } from 'express';
import { asyncHandler, UnauthorizedError } from '../middleware/error-middleware';
import {
  aiSettingsInputSchema,
  getAiSettingsView,
  listOpenRouterModels,
  updateAiSettings
} from '../services/ai-settings-service';

/**
 * Réglage ImmoCopilot de la plateforme (super-admin). Les réponses ne portent
 * jamais de clé API : uniquement des booléens de présence (`keys`).
 * Réponses au format habituel `{ success: true, data }`.
 */

export const getAiSettingsHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: await getAiSettingsView() });
});

export const updateAiSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new UnauthorizedError();
  const body = aiSettingsInputSchema.parse(req.body ?? {});
  res.json({ success: true, data: await updateAiSettings(body, userId) });
});

export const listAiModelsHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: await listOpenRouterModels() });
});
