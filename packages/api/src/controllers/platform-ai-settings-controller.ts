import type { Request, Response } from 'express';
import { z } from 'zod';
import { assistantUsageCsv, assistantUsageReport, usageReportQuery } from '../lib/ai/provider-usage-report';
import { t } from '../i18n';
import { getLlmProvider } from '../lib/ai/providers';
import { prisma } from '../utils/database';
import { AppError, asyncHandler, UnauthorizedError } from '../middleware/error-middleware';
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

export const testAiConnectionHandler = asyncHandler(async (req, res) => {
  const { mode } = z
    .object({ mode: z.enum(['standard', 'deep', 'fast']).default('standard') })
    .strict()
    .parse(req.body ?? {});
  const provider = await getLlmProvider(mode);
  if (!provider) throw new AppError(t('Le fournisseur de ce mode est indisponible.'), 503);
  const start = performance.now();
  const signal = AbortSignal.timeout(12_000);
  try {
    const result = await provider.runTurn(
      {
        system: 'Reply with OK.',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'OK' }] }],
        tools: [],
        maxOutputTokens: 32
      },
      () => {},
      signal
    );
    res.set('Cache-Control', 'private, no-store').json({
      success: true,
      data: {
        provider: provider.id,
        model: result.model ?? null,
        simulated: provider.id === 'fake',
        durationMs: Math.round(performance.now() - start)
      }
    });
  } catch {
    throw new AppError(t('Le test de connexion au fournisseur a échoué.'), 502);
  }
});

export const listAiUsageHandler = asyncHandler(async (req, res) => {
  const query = usageReportQuery.parse(req.query);
  const data = await assistantUsageReport(query, 25, query.offset);
  data.hasNext &&= query.offset + 25 <= 100_000;
  res.set('Cache-Control', 'private, no-store').json({ success: true, data });
});

export const exportAiUsageHandler = asyncHandler(async (req, res) => {
  const query = usageReportQuery.parse(req.query);
  const data = await assistantUsageReport(query, 10_000, 0);
  if (data.hasNext) throw new AppError(t('Réduisez la période ou filtrez les usages avant de les exporter.'), 413);
  res
    .set('Cache-Control', 'private, no-store')
    .set('X-Content-Type-Options', 'nosniff')
    .attachment(`immotopia-usage-ia-${data.from}-${data.to}.csv`)
    .type('text/csv; charset=utf-8')
    .send(assistantUsageCsv(data));
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
