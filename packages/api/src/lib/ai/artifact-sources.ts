import type { AnalysisTable, CopilotArtifact } from './contracts';

export function withoutSourceMarkers(response: string): string {
  return response
    .replace(/[ \t]*\[\[source:[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}(?::[1-9][0-9]{0,8})?\]\]/g, '')
    .replace(/\[\[source:[a-fA-F0-9-]{0,36}(?::[0-9]{0,9})?\]?$/, '');
}

export function analysisSources(artifact: CopilotArtifact): AnalysisTable[] {
  if (artifact.kind === 'table' && artifact.provenance) return [artifact];
  if (artifact.kind !== 'document') return [];
  return artifact.blocks.flatMap(block => (block.kind === 'table' && block.table.provenance ? [block.table] : []));
}
