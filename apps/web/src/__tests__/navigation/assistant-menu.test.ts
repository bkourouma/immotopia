import { describe, expect, it } from 'vitest';
import { getNavigation } from '../../navigation/model';
import { withAssistantMenu } from '../../navigation/owner-patrimoine-menu';

describe('menu Assistant', () => {
  it('existe dans la navigation du collaborateur, vers la page plein écran', () => {
    const group = getNavigation().collaborateur.tree.find(g => g.key === 'assistant');
    expect(group?.href).toBe('/tenant/:tenantId/assistant');
  });

  it('est coupé tant qu’ImmoCopilot n’est pas confirmé activé', () => {
    expect(withAssistantMenu(new Set(), false).has('collaborateur.assistant')).toBe(true);
    const base = new Set<string>();
    expect(withAssistantMenu(base, true)).toBe(base);
  });
});
