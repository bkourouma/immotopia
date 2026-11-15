import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { t } from '../../i18n';
import { AppError, ForbiddenError } from '../../middleware/error-middleware';
import type {
  AnalysisQuery,
  AnalysisTable,
  BaseAnalysisQuery,
  CopilotArtifact,
  CopilotToolContext,
  CopilotToolDefinition
} from './contracts';
import { rentalArrearsTool, monthPattern } from './tools/rental-arrears';
import { syndicateBudgetTool } from './tools/syndicate-budget';
import { syndicateChargesTool } from './tools/syndicate-charges';
import { maintenanceOverviewTool, syndicateMaintenanceTool } from './tools/maintenance-overview';
import { rentalReceiptsTool } from './tools/rental-receipts';
import { chartAnalysisTool } from './tools/chart-analysis';
import { showIndicatorsTool } from './tools/show-indicators';
import { pivotAnalysisTool, pivotInputSchema } from './tools/pivot-analysis';
import { leasePortfolioTool, propertyPortfolioTool } from './tools/portfolio';
import { constructionBudgetTool, crmPipelineTool, saleMandatesTool } from './tools/commercial-analysis';
import { ownerPayoutsTool, ownerStatementsTool } from './tools/owner-financial-analysis';
import { rentalDueComparisonTool } from './tools/rental-monthly-review';

const querySchema = z.discriminatedUnion('tool', [
  z.object({ tool: z.literal('rental_arrears'), month: z.string().regex(monthPattern) }).strict(),
  z.object({ tool: z.literal('rental_receipts'), month: z.string().regex(monthPattern) }).strict(),
  rentalDueComparisonTool.inputSchema.required({ month: true }).extend({ tool: z.literal('rental_due_comparison') }),
  maintenanceOverviewTool.inputSchema.extend({ tool: z.literal('maintenance_overview') }),
  syndicateBudgetTool.inputSchema.extend({ tool: z.literal('syndicate_budget') }),
  syndicateChargesTool.inputSchema.extend({ tool: z.literal('syndicate_charges') }),
  syndicateMaintenanceTool.inputSchema.extend({ tool: z.literal('syndicate_maintenance') }),
  propertyPortfolioTool.inputSchema.required({ groupBy: true }).extend({ tool: z.literal('property_portfolio') }),
  leasePortfolioTool.inputSchema.required({ start: true, end: true }).extend({ tool: z.literal('lease_portfolio') }),
  crmPipelineTool.inputSchema.extend({ tool: z.literal('crm_pipeline') }),
  saleMandatesTool.inputSchema.required({ start: true, end: true }).extend({ tool: z.literal('sale_mandates') }),
  constructionBudgetTool.inputSchema.extend({ tool: z.literal('construction_budget') }),
  ownerStatementsTool.inputSchema
    .required({ periodFrom: true, periodTo: true })
    .extend({ tool: z.literal('owner_statements') }),
  ownerPayoutsTool.inputSchema
    .required({ periodFrom: true, periodTo: true })
    .extend({ tool: z.literal('owner_payouts') })
]);

const analysisTools: Record<BaseAnalysisQuery['tool'], CopilotToolDefinition> = {
  rental_arrears: rentalArrearsTool,
  rental_receipts: rentalReceiptsTool,
  rental_due_comparison: rentalDueComparisonTool,
  maintenance_overview: maintenanceOverviewTool,
  syndicate_maintenance: syndicateMaintenanceTool,
  syndicate_charges: syndicateChargesTool,
  syndicate_budget: syndicateBudgetTool,
  property_portfolio: propertyPortfolioTool,
  lease_portfolio: leasePortfolioTool,
  crm_pipeline: crmPipelineTool,
  sale_mandates: saleMandatesTool,
  construction_budget: constructionBudgetTool,
  owner_statements: ownerStatementsTool,
  owner_payouts: ownerPayoutsTool
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
  },
  shared = false
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
  const canRead = (query: AnalysisQuery) =>
    allowed.has(query.tool) && (query.tool !== 'pivot_analysis' || allowed.has(query.source.tool));
  function read(query: BaseAnalysisQuery): Promise<AnalysisTable> {
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

  async function readAnalysis(query: AnalysisQuery): Promise<AnalysisTable> {
    if (query.tool !== 'pivot_analysis') return read(query);
    if (!allowed.has(query.tool)) throw new ForbiddenError();
    const source = await read(query.source);
    const parsed = pivotInputSchema.parse(query.input);
    const result = await pivotAnalysisTool.execute(
      { ...parsed, sourceId: source.id, title: shared ? t('Tableau croisé') : parsed.title },
      { ...ctx, analysisTables: new Map([[source.id, source]]) }
    );
    if (result.uiEvent?.type !== 'artifact' || result.uiEvent.artifact.kind !== 'table') throw unavailable();
    return result.uiEvent.artifact;
  }

  async function table(previous: AnalysisTable): Promise<AnalysisTable> {
    if (!previous.query) {
      if (shared) throw unavailable();
      return previous;
    }
    const fresh = await readAnalysis(previous.query);
    if (shared) {
      const { query: _query, ...result } = fresh;
      return { ...result, id: previous.id };
    }
    return { ...fresh, id: previous.id, title: previous.title };
  }

  if (artifact.kind === 'table') return table(artifact);
  if (artifact.kind === 'document') {
    const blocks = [];
    for (const block of artifact.blocks) {
      if (!shared) {
        blocks.push(block.kind === 'table' ? { ...block, table: await table(block.table) } : block);
      } else if (block.kind === 'table' && block.table.query && canRead(block.table.query)) {
        blocks.push({ kind: 'table' as const, table: await table(block.table) });
      }
    }
    if (shared) {
      if (!blocks.length) throw unavailable();
      return { kind: 'document', id: artifact.id, title: t('Rapport partagé'), blocks };
    }
    return { ...artifact, blocks };
  }
  if ((artifact.kind === 'chart' || artifact.kind === 'indicators') && artifact.replay) {
    const tool: CopilotToolDefinition = artifact.kind === 'chart' ? chartAnalysisTool : showIndicatorsTool;
    if (artifact.replay.tool !== tool.name || !allowed.has(tool.name)) throw new ForbiddenError();
    const input = tool.inputSchema.parse(artifact.replay.input);
    const fresh = await readAnalysis(artifact.replay.source);
    const result = await tool.execute(shared ? { ...input, title: fresh.title.slice(0, 120) } : input, {
      ...ctx,
      analysisTables: new Map([[input.sourceId, fresh]])
    });
    if (result.uiEvent?.type !== 'artifact' || result.uiEvent.artifact.kind !== artifact.kind) throw unavailable();
    if (shared) {
      const { replay: _replay, ...derived } = result.uiEvent.artifact;
      return { ...derived, id: artifact.id };
    }
    return { ...result.uiEvent.artifact, id: artifact.id, title: artifact.title };
  }
  if (shared) throw unavailable();
  return artifact;
}
