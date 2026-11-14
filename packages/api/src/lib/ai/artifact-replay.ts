import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { t } from '../../i18n';
import { AppError, ForbiddenError } from '../../middleware/error-middleware';
import type {
  AnalysisQuery,
  AnalysisTable,
  CopilotArtifact,
  CopilotToolContext,
  CopilotToolDefinition
} from './contracts';
import { rentalArrearsTool, monthPattern } from './tools/rental-arrears';
import { rentalReceiptsTool } from './tools/rental-receipts';
import { chartAnalysisTool } from './tools/chart-analysis';
import { showIndicatorsTool } from './tools/show-indicators';
import { leasePortfolioTool, propertyPortfolioTool } from './tools/portfolio';

const querySchema = z.discriminatedUnion('tool', [
  z.object({ tool: z.literal('rental_arrears'), month: z.string().regex(monthPattern) }).strict(),
  z.object({ tool: z.literal('rental_receipts'), month: z.string().regex(monthPattern) }).strict(),
  propertyPortfolioTool.inputSchema.required({ groupBy: true }).extend({ tool: z.literal('property_portfolio') }),
  leasePortfolioTool.inputSchema.required({ start: true, end: true }).extend({ tool: z.literal('lease_portfolio') })
]);

const analysisTools: Record<AnalysisQuery['tool'], CopilotToolDefinition> = {
  rental_arrears: rentalArrearsTool,
  rental_receipts: rentalReceiptsTool,
  property_portfolio: propertyPortfolioTool,
  lease_portfolio: leasePortfolioTool
};

export function canReplayArtifact(artifact: CopilotArtifact): boolean {
  switch (artifact.kind) {
    case 'table':
      return !!artifact.query;
    case 'chart':
    case 'indicators':
      return !!artifact.replay;
    case 'document':
      return artifact.blocks.some(block => block.kind === 'table' && !!block.table.query);
    case 'markdown':
      return false;
  }
}

export async function replayArtifact(
  artifact: CopilotArtifact,
  scope: {
    tenantId: string;
    userId: string;
    conversationId: string;
    permissions: Set<string>;
    tools: readonly CopilotToolDefinition[];
  }
): Promise<CopilotArtifact> {
  const allowed = new Set(scope.tools.map(tool => tool.name));
  const ctx: CopilotToolContext = {
    tenantId: scope.tenantId,
    userId: scope.userId,
    conversationId: scope.conversationId,
    permissions: scope.permissions,
    requestId: randomUUID(),
    signal: AbortSignal.timeout(30_000),
    seenLeaseIds: new Set()
  };
  const calculations = new Map<string, Promise<AnalysisTable>>();

  const unavailable = () => new AppError(t('Cette analyse ne peut pas être recalculée.'), 422);
  function read(query: AnalysisQuery): Promise<AnalysisTable> {
    const { tool, ...input } = querySchema.parse(query);
    if (!allowed.has(tool)) throw new ForbiddenError();
    const key = JSON.stringify([tool, input]);
    const existing = calculations.get(key);
    if (existing) return existing;
    const operation = analysisTools[tool].execute(input, ctx).then(result => {
      if (result.uiEvent?.type !== 'artifact' || result.uiEvent.artifact.kind !== 'table') throw unavailable();
      return result.uiEvent.artifact;
    });
    calculations.set(key, operation);
    return operation;
  }

  async function table(previous: AnalysisTable): Promise<AnalysisTable> {
    if (!previous.query) return previous;
    const fresh = await read(previous.query);
    return { ...fresh, id: previous.id, title: previous.title };
  }

  if (artifact.kind === 'table') return table(artifact);
  if (artifact.kind === 'document') {
    const blocks = [];
    for (const block of artifact.blocks) {
      blocks.push(block.kind === 'table' ? { ...block, table: await table(block.table) } : block);
    }
    return { ...artifact, blocks };
  }
  if ((artifact.kind === 'chart' || artifact.kind === 'indicators') && artifact.replay) {
    const tool: CopilotToolDefinition = artifact.kind === 'chart' ? chartAnalysisTool : showIndicatorsTool;
    if (artifact.replay.tool !== tool.name || !allowed.has(tool.name)) throw new ForbiddenError();
    const input = tool.inputSchema.parse(artifact.replay.input);
    const fresh = await read(artifact.replay.source);
    const result = await tool.execute(input, { ...ctx, analysisTables: new Map([[input.sourceId, fresh]]) });
    if (result.uiEvent?.type !== 'artifact') throw unavailable();
    return { ...result.uiEvent.artifact, id: artifact.id, title: artifact.title };
  }
  return artifact;
}
