import type { AnalysisTable, CopilotArtifact } from './contracts';

export function analysisSources(artifact: CopilotArtifact): AnalysisTable[] {
  if (artifact.kind === 'table' && artifact.provenance) return [artifact];
  if (artifact.kind !== 'document') return [];
  return artifact.blocks.flatMap(block => (block.kind === 'table' && block.table.provenance ? [block.table] : []));
}
