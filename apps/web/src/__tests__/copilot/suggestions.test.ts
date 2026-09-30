import { describe, it, expect } from 'vitest';
import { getCopilotPageContext } from '../../components/copilot/copilot-page-context';
import { getCopilotSuggestions, getCopilotWelcome } from '../../components/copilot/copilot-suggestions';
import type { CopilotToolName } from '../../types/copilot';

const ALL: CopilotToolName[] = [
  'search_properties',
  'search_leases',
  'list_lease_documents',
  'list_property_documents',
  'propose_rental_document'
];

describe('getCopilotPageContext', () => {
  it('reconnaît la fiche bien', () => {
    expect(getCopilotPageContext('/tenant/t1/properties/p1')).toEqual({
      currentPath: '/tenant/t1/properties/p1',
      activeEntityType: 'PROPERTY',
      activeEntityId: 'p1'
    });
  });

  it('reconnaît la fiche bail', () => {
    expect(getCopilotPageContext('/tenant/t1/rental/leases/l9')).toMatchObject({
      activeEntityType: 'LEASE',
      activeEntityId: 'l9'
    });
  });

  it('ne fixe pas d’entité ailleurs ni sur « new »', () => {
    expect(getCopilotPageContext('/tenant/t1/dashboard')).toEqual({ currentPath: '/tenant/t1/dashboard' });
    expect(getCopilotPageContext('/tenant/t1/properties/new').activeEntityType).toBeUndefined();
  });
});

describe('getCopilotSuggestions', () => {
  it('propose des actions de bail sur la fiche bail', () => {
    const ids = getCopilotSuggestions('/tenant/t1/rental/leases/l1', ALL).map(s => s.id);
    expect(ids).toEqual(['lease-receipt', 'lease-statement', 'lease-documents']);
  });

  it('filtre selon status.tools', () => {
    const list = getCopilotSuggestions('/tenant/t1/rental/leases/l1', ['list_lease_documents']);
    expect(list.map(s => s.id)).toEqual(['lease-documents']);
  });

  it('renvoie une liste vide sans outil', () => {
    expect(getCopilotSuggestions('/tenant/t1/properties/p1', [])).toEqual([]);
  });

  it('propose les suggestions par défaut ailleurs', () => {
    expect(getCopilotSuggestions('/tenant/t1/dashboard', ['search_properties']).map(s => s.id)).toEqual([
      'default-properties'
    ]);
  });
});

describe('suggestions complètes', () => {
  it("n'en propose aucune inachevée (points de suspension)", () => {
    for (const path of [
      '/tenant/t1/rental',
      '/tenant/t1/dashboard',
      '/tenant/t1/properties/p1',
      '/tenant/t1/rental/leases/l1'
    ]) {
      for (const s of getCopilotSuggestions(path, ALL)) expect(s.text).not.toMatch(/…|\.\.\./);
    }
  });
});

describe('getCopilotWelcome', () => {
  it('cite tout avec tous les outils', () => {
    expect(getCopilotWelcome(ALL)).toBe('Posez une question sur vos biens, vos baux ou vos documents.');
  });

  it('ne cite pas les baux sans outil de gestion locative (pack sans RENTAL)', () => {
    const text = getCopilotWelcome(['search_properties', 'list_property_documents']);
    expect(text).toBe('Posez une question sur vos biens ou vos documents.');
    expect(text).not.toMatch(/bail|baux/);
  });

  it('reste neutre sans outil', () => {
    expect(getCopilotWelcome([])).not.toMatch(/bien|bail|baux|document/);
  });
});
