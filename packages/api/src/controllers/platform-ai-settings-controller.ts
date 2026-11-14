import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/database';
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

export const listAssistantFeedbackHandler = asyncHandler(async (req, res) => {
  const { offset, rating } = z
    .object({
      offset: z.coerce.number().int().min(0).max(100_000).default(0),
      rating: z.enum(['all', 'helpful', 'unhelpful']).default('all')
    })
    .strict()
    .parse(req.query);
  // Seule la route super-admin peut lire les avis de plusieurs agences.
  const rows = await prisma.assistantResponseFeedback.findMany({
    where: rating === 'all' ? {} : { helpful: rating === 'helpful' },
    orderBy: [{ updatedAt: 'desc' }, { tenantId: 'asc' }, { ownerId: 'asc' }, { turnId: 'asc' }, { revision: 'desc' }],
    skip: offset,
    take: 26,
    select: {
      helpful: true,
      comment: true,
      excerpt: true,
      updatedAt: true,
      turn: { select: { conversation: { select: { tenant: { select: { name: true } } } } } }
    }
  });
  const items = rows.slice(0, 25).map(({ turn, comment, excerpt, helpful, updatedAt }, index) => ({
    comment: comment.slice(0, 1000),
    excerpt: excerpt.slice(0, 300),
    agency: turn.conversation.tenant.name,
    helpful,
    updatedAt,
    id: offset + index
  }));
  res.set('Cache-Control', 'private, no-store').json({
    success: true,
    data: { items, hasNext: rows.length > 25 && offset + 25 <= 100_000 }
  });
});
