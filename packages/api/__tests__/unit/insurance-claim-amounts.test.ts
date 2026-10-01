import { computeOutOfPocket, outOfPocketForStatus } from '../../src/lib/patrimoine/insurance/claim-amounts';

describe('computeOutOfPocket', () => {
  it('réclamé moins indemnisé', () => {
    expect(computeOutOfPocket(1000, 600)).toBe(400);
    expect(computeOutOfPocket(1000, null)).toBe(1000);
  });

  it("n'est jamais négatif", () => {
    expect(computeOutOfPocket(500, 800)).toBe(0);
  });

  it('évite les erreurs de flottant', () => {
    expect(computeOutOfPocket(0.3, 0.1)).toBe(0.2);
    expect(computeOutOfPocket(1.1, 0.7)).toBe(0.4);
  });
});

describe('outOfPocketForStatus', () => {
  it('null avant que le dossier soit tranché', () => {
    for (const status of ['DECLARED', 'INSURER_NOTIFIED', 'EXPERTISE'] as const) {
      expect(outOfPocketForStatus(status, 1000, null)).toBeNull();
    }
  });

  it('exposé pour SETTLED, REJECTED et CLOSED', () => {
    expect(outOfPocketForStatus('SETTLED', 1000, 700)).toBe(300);
    expect(outOfPocketForStatus('REJECTED', 1000, 0)).toBe(1000);
    expect(outOfPocketForStatus('CLOSED', 1000, 1000)).toBe(0);
  });
});
