import { describe, expect, it } from 'vitest';
import { requiredConfirmationWord, sanitizeWritePlan } from '../../utils/copilot-write-plan';

const base = {
  proposalId: 'p',
  token: 'tok',
  expiresAt: '2030-01-01T00:00:00Z',
  title: 'T',
  method: 'PATCH',
  recordKind: 'update',
  steps: [],
  changes: [],
  warnings: []
};

describe('sanitizeWritePlan : champs ajoutés par le serveur', () => {
  it('conserve query, pathParams et stateReadAt valides', () => {
    const plan = sanitizeWritePlan({
      ...base,
      query: [{ key: 'a', value: '1' }],
      pathParams: [{ name: 'id', value: 'x' }],
      stateReadAt: '2026-03-01T10:05:00Z'
    });
    expect(plan?.query).toEqual([{ key: 'a', value: '1' }]);
    expect(plan?.pathParams).toEqual([{ name: 'id', value: 'x' }]);
    expect(plan?.stateReadAt).toBe('2026-03-01T10:05:00Z');
  });

  it('écarte les entrées mal formées et reste compatible sans ces champs', () => {
    const plan = sanitizeWritePlan({
      ...base,
      query: [{ key: 'a' }, null, { key: 1, value: 'x' }, { key: 'ok', value: 'v' }],
      pathParams: 'oops',
      stateReadAt: 'pas une date'
    });
    expect(plan?.query).toEqual([{ key: 'ok', value: 'v' }]);
    expect(plan?.pathParams).toEqual([]);
    expect(plan?.stateReadAt).toBeUndefined();
    const legacy = sanitizeWritePlan(base);
    expect(legacy?.query).toBeUndefined();
    expect(legacy?.pathParams).toBeUndefined();
  });

  it('accepte un jeton de 16 384 caractères, pas au-delà', () => {
    expect(sanitizeWritePlan({ ...base, token: 'a'.repeat(16_384) })).not.toBeNull();
    expect(sanitizeWritePlan({ ...base, token: 'a'.repeat(16_385) })).toBeNull();
  });

  it('requiresTypedConfirmation seul impose le mot', () => {
    const plan = sanitizeWritePlan({ ...base, sensitive: false, requiresTypedConfirmation: true });
    expect(plan && requiredConfirmationWord(plan)).toBe('CONFIRMER');
  });
});
