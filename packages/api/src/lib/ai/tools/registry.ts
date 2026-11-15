import type { CopilotToolDefinition, CopilotToolName, LlmToolSpec } from '../contracts';
import { syndicateBudgetTool } from './syndicate-budget';
import { syndicateChargesTool } from './syndicate-charges';
import { maintenanceOverviewTool, syndicateMaintenanceTool } from './maintenance-overview';
import { callReadTool } from './call-read';
import { listCapabilitiesTool } from './list-capabilities';
import { listLeaseDocumentsTool } from './list-lease-documents';
import { listPropertyDocumentsTool } from './list-property-documents';
import { planWriteTool } from './plan-write';
import { proposeFollowUpTool } from './propose-follow-up';
import { prepareBudgetAlertTool } from './prepare-budget-alert';
import { rentalAlertTools } from './prepare-rental-alerts';
import { proposeRentalDocumentTool } from './propose-rental-document';
import { searchLeasesTool } from './search-leases';
import { searchPropertiesTool } from './search-properties';
import { showArtifactTool } from './show-artifact';
import { rentalArrearsTool } from './rental-arrears';
import { rentalReceiptsTool } from './rental-receipts';
import { chartAnalysisTool } from './chart-analysis';
import { pivotAnalysisTool } from './pivot-analysis';
import { showIndicatorsTool } from './show-indicators';
import { composeReportTool } from './compose-report';
import { leasePortfolioTool, propertyPortfolioTool } from './portfolio';
import { constructionBudgetTool, crmPipelineTool, saleMandatesTool } from './commercial-analysis';
import { ownerBalancesTool, ownerPayoutsTool, ownerStatementsTool } from './owner-financial-analysis';
import { patrimonyHistoryTool, patrimonyNetWorthTool } from './patrimoine-analysis';
import { maintenanceLogTool } from './maintenance-log';
import { reservedPropertiesTool } from './reserved-properties';
import { rentalReceiptsSqlTool, rentalInstallmentsSqlTool } from './rental-sql';
import { rentalDueComparisonTool, rentalMonthlyReviewTool } from './rental-monthly-review';

/**
 * Registre des outils exposés au LLM. L'exécution d'un document
 * (`actions/execute-rental-document.ts`) n'y figure PAS : elle n'est joignable
 * que par la route HTTP de confirmation.
 */
export const ALL_TOOLS: readonly CopilotToolDefinition[] = [
  searchPropertiesTool,
  searchLeasesTool,
  rentalArrearsTool,
  rentalReceiptsTool,
  rentalDueComparisonTool,
  rentalMonthlyReviewTool,
  maintenanceOverviewTool,
  syndicateMaintenanceTool,
  syndicateChargesTool,
  syndicateBudgetTool,
  propertyPortfolioTool,
  leasePortfolioTool,
  crmPipelineTool,
  saleMandatesTool,
  constructionBudgetTool,
  ownerStatementsTool,
  ownerPayoutsTool,
  ownerBalancesTool,
  patrimonyNetWorthTool,
  patrimonyHistoryTool,
  maintenanceLogTool,
  reservedPropertiesTool,
  rentalReceiptsSqlTool,
  rentalInstallmentsSqlTool,
  chartAnalysisTool,
  pivotAnalysisTool,
  showIndicatorsTool,
  composeReportTool,
  listLeaseDocumentsTool,
  listPropertyDocumentsTool,
  proposeRentalDocumentTool,
  showArtifactTool,
  listCapabilitiesTool,
  callReadTool,
  planWriteTool,
  proposeFollowUpTool,
  prepareBudgetAlertTool,
  ...rentalAlertTools
] as readonly CopilotToolDefinition[];

export type ToolFeature = CopilotToolDefinition['feature'];

/**
 * Outils que l'utilisateur peut employer : permission détenue et, si
 * `entitlements` est fourni, module d'abonnement inclus. Sans `entitlements`,
 * aucun filtre d'abonnement.
 */
export function toolsForUser(
  perms: ReadonlySet<string> | readonly string[],
  entitlements?: ReadonlySet<ToolFeature> | readonly ToolFeature[]
): CopilotToolDefinition[] {
  const owned = perms instanceof Set ? perms : new Set<string>(perms as Iterable<string>);
  const features = entitlements ? new Set<ToolFeature>(entitlements as Iterable<ToolFeature>) : null;
  return ALL_TOOLS.filter(
    tool =>
      owned.has(tool.requiredPermission) &&
      (tool.additionalPermissions ?? []).every(permission => owned.has(permission)) &&
      (!features || features.has(tool.feature))
  );
}

export function findTool(tools: readonly CopilotToolDefinition[], name: string): CopilotToolDefinition | undefined {
  return tools.find(tool => tool.name === (name as CopilotToolName));
}

/** Spécifications neutres transmises au fournisseur LLM. */
export function toLlmToolSpecs(tools: readonly CopilotToolDefinition[]): LlmToolSpec[] {
  return tools.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.jsonSchema }));
}
