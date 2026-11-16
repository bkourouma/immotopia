import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import type { LlmProvider } from './contracts';
import { isAbortError, LlmProviderError } from './providers/anthropic-provider';

export const usageModes = ['standard', 'deep', 'fast', 'rewrite', 'transcription'] as const;
export const usageProviders = ['anthropic', 'openrouter', 'fake', 'openai', 'google'] as const;
export type UsageMode = (typeof usageModes)[number];

function count(value: number | undefined) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2_147_483_647 ? value : null;
}

export async function recordTranscriptionUsage(attempt: {
  tenantId: string;
  userId: string;
  provider: 'openai' | 'google';
  model: string;
  durationMs: number;
  audioSeconds: number;
  status: 'ok' | 'error' | 'aborted';
  upstreamStatus?: number;
  inputTokens?: number;
  outputTokens?: number;
}) {
  try {
    await prisma.assistantProviderUsage.create({
      data: {
        ...attempt,
        mode: 'transcription',
        inputTokens: count(attempt.inputTokens),
        outputTokens: count(attempt.outputTokens)
      }
    });
  } catch {
    logger.warn('ImmoCopilot : échec de l’enregistrement des mesures du fournisseur', { provider: attempt.provider });
  }
}

export function measuredProvider(
  provider: LlmProvider,
  context: { tenantId: string; userId: string; mode: UsageMode }
): LlmProvider {
  return {
    id: provider.id,
    async runTurn(req, onText, signal) {
      if (signal.aborted) return provider.runTurn(req, onText, signal);
      const startedAt = performance.now();
      let result: Awaited<ReturnType<LlmProvider['runTurn']>> | undefined;
      let failure: unknown;
      try {
        result = await provider.runTurn(req, onText, signal);
        return result;
      } catch (error) {
        failure = error;
        throw error;
      } finally {
        const upstream = failure instanceof LlmProviderError ? failure : undefined;
        const usage = result?.usage ?? upstream?.usage;
        const model = result?.model || upstream?.model;
        const status = result
          ? result.stopReason === 'refusal'
            ? 'refused'
            : result.stopReason === 'max_tokens'
              ? 'truncated'
              : 'ok'
          : signal.aborted || isAbortError(failure)
            ? 'aborted'
            : 'error';
        try {
          await prisma.assistantProviderUsage.create({
            data: {
              ...context,
              provider: provider.id,
              model: typeof model === 'string' ? model.slice(0, 200) : null,
              status,
              upstreamStatus: count(upstream?.upstreamStatus),
              durationMs: Math.round(performance.now() - startedAt),
              inputTokens: count(usage?.inputTokens),
              outputTokens: count(usage?.outputTokens),
              cacheReadTokens: count(usage?.cacheReadTokens),
              cacheWriteTokens: count(usage?.cacheWriteTokens),
              costUsd:
                typeof usage?.costUsd === 'number' && usage.costUsd >= 0 && usage.costUsd < 99_999_999
                  ? usage.costUsd
                  : null
            }
          });
        } catch {
          logger.warn('ImmoCopilot : échec de l’enregistrement des mesures du fournisseur', { provider: provider.id });
        }
      }
    }
  };
}
