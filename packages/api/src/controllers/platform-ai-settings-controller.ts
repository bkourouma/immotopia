import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { assistantUsageCsv, assistantUsageReport, usageReportQuery } from '../lib/ai/provider-usage-report';
import { t } from '../i18n';
import type { LlmToolSpec, LlmTurnResult } from '../lib/ai/contracts';
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

const connectionProbe: LlmToolSpec = {
  name: 'list_capabilities',
  description: 'Test only. Echo the nonce supplied in the user message.',
  inputSchema: {
    type: 'object',
    properties: { nonce: { type: 'string' } },
    required: ['nonce'],
    additionalProperties: false
  }
};
const connectionProbeInput = z.object({ nonce: z.string().uuid() }).strict();

export const testAiConnectionHandler = asyncHandler(async (req, res) => {
  const { mode } = z
    .object({ mode: z.enum(['standard', 'deep', 'fast']).default('standard') })
    .strict()
    .parse(req.body ?? {});
  const provider = await getLlmProvider(mode);
  if (!provider) throw new AppError(t('Le fournisseur de ce mode est indisponible.'), 503);
  const start = performance.now();
  const signal = AbortSignal.timeout(12_000);
  const simulated = provider.id === 'fake';
  const nonce = !simulated && mode !== 'fast' ? randomUUID() : null;
  let result: LlmTurnResult;
  try {
    result = await provider.runTurn(
      {
        system: nonce
          ? 'This is a connection test. Call list_capabilities once with the exact nonce from the user message.'
          : 'Reply with OK.',
        messages: [{ role: 'user', content: [{ type: 'text', text: nonce ?? 'OK' }] }],
        tools: nonce ? [connectionProbe] : [],
        maxOutputTokens: nonce ? 512 : 32,
        ...(mode === 'deep' ? { deep: true } : {})
      },
      () => {},
      signal
    );
  } catch {
    throw new AppError(t('Le test de connexion au fournisseur a échoué.'), 502);
  }
  if (nonce) {
    const [call] = result.toolCalls;
    const input = connectionProbeInput.safeParse(call?.input);
    if (
      result.stopReason !== 'tool_use' ||
      result.toolCalls.length !== 1 ||
      call.name !== connectionProbe.name ||
      !input.success ||
      input.data.nonce !== nonce
    ) {
      throw new AppError(t('Le modèle n’a pas réussi le test d’appel d’outil.'), 502);
    }
  } else if (
    result.stopReason !== 'end_turn' ||
    !result.assistantContent.some(block => block.type === 'text' && block.text.trim())
  ) {
    throw new AppError(t('Le test de connexion au fournisseur a échoué.'), 502);
  }
  res.set('Cache-Control', 'private, no-store').json({
    success: true,
    data: {
      provider: provider.id,
      model: result.model ?? null,
      simulated,
      toolsVerified: nonce !== null,
      durationMs: Math.round(performance.now() - start)
    }
  });
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
