import { describe, expect, it } from 'vitest';
import { buildCrumbs } from '../../components/shell/Breadcrumbs';

const base = '/tenant/8cab62a9-bddc-41d5-be02-712d345df2df/finance/comptabilite';

describe("Fil d'Ariane — comptabilité", () => {
  it('balance : « Balance générale »', () => {
    const labels = buildCrumbs(`${base}/balance`).map(c => c.label);
    expect(labels).toContain('Balance générale');
    expect(labels).not.toContain('Balance fournisseurs');
  });

  it('mandants : « Mandants »', () => {
    const labels = buildCrumbs(`${base}/mandants`).map(c => c.label);
    expect(labels).toContain('Mandants');
    expect(labels).not.toContain('Agences mandantes');
  });

  it('un autre fil reste identique', () => {
    expect(buildCrumbs('/tenant/8cab62a9-bddc-41d5-be02-712d345df2df/rental/leases').map(c => c.label)).toEqual([
      'Gestion locative',
      'Baux'
    ]);
  });
});
