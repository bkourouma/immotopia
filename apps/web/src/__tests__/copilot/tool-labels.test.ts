import { describe, it, expect } from 'vitest';
import { copilotToolLabel } from '../../components/copilot/copilot-labels';
import type { CopilotToolName } from '../../types/copilot';

const TOOLS: CopilotToolName[] = [
  'search_properties',
  'search_leases',
  'list_lease_documents',
  'list_property_documents',
  'propose_rental_document',
  'show_artifact',
  'list_capabilities',
  'call_read'
];

describe('copilotToolLabel', () => {
  it.each(TOOLS)('%s a un libellé d’état lisible, jamais le nom technique', tool => {
    const label = copilotToolLabel(tool);
    expect(label.length).toBeGreaterThan(3);
    expect(label).not.toContain('_');
  });

  it('dit que la passerelle consulte seulement', () => {
    expect(copilotToolLabel('call_read')).toBe('Consultation d’une donnée');
    expect(copilotToolLabel('list_capabilities')).toBe('Recherche dans les consultations disponibles');
  });
});
