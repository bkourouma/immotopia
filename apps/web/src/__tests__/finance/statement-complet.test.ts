import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * BUG-2026-11-04-048 : le relevé d'agence ne montrait que les 50 premières
 * lignes. `getFullAccountStatement` enchaîne les pages du serveur jusqu'au
 * solde de clôture.
 */
const get = vi.fn();
vi.mock('../../utils/api-client', () => ({ default: { get: (...a: unknown[]) => get(...a) } }));

import { getFullAccountStatement } from '../../services/finance-service';

const ligne = (i: number) => ({ id: `m-${i}`, balanceAfter: i * 10 });

function serveur(total: number) {
  get.mockImplementation(async (url: string) => {
    const params = new URL(url, 'http://x').searchParams;
    const skip = Number(params.get('skip') ?? 0);
    const take = Number(params.get('take') ?? 50);
    const taille = Math.max(0, Math.min(take, total - skip));
    const movements = Array.from({ length: taille }, (_, i) => ligne(skip + i + 1));
    return {
      data: {
        data: {
          accountId: 'a',
          label: 'L',
          kind: 'TENANT',
          openingBalance: 0,
          closingBalance: -610000,
          currency: 'XOF',
          movements,
          total
        }
      }
    };
  });
}

describe('getFullAccountStatement', () => {
  beforeEach(() => get.mockReset());

  it('rassemble les 73 lignes d’un compte au lieu de s’arrêter à 50', async () => {
    serveur(73);
    const releve = await getFullAccountStatement('t1', 'a');
    expect(releve.movements).toHaveLength(73);
    expect(releve.movements[72].id).toBe('m-73');
    expect(releve.closingBalance).toBe(-610000);
  });

  it('enchaîne plusieurs pages de 200 et transmet les bornes de dates', async () => {
    serveur(450);
    const releve = await getFullAccountStatement('t1', 'a', { from: '2026-01-01', to: '2026-12-31' });
    expect(releve.movements).toHaveLength(450);
    expect(get).toHaveBeenCalledTimes(3);
    expect(get.mock.calls[1][0]).toContain('skip=200');
    expect(get.mock.calls[1][0]).toContain('from=2026-01-01');
  });

  it('fige le même asOf sur toutes les pages', async () => {
    serveur(450);
    await getFullAccountStatement('t1', 'a');
    const asOfs = get.mock.calls.map(c => new URL(c[0], 'http://x').searchParams.get('asOf'));
    expect(asOfs).toHaveLength(3);
    expect(asOfs[0]).toBeTruthy();
    expect(new Set(asOfs).size).toBe(1);
  });

  it('signale la troncature quand le plafond de 50 pages est atteint', async () => {
    serveur(10_500);
    const releve = await getFullAccountStatement('t1', 'a');
    expect(get).toHaveBeenCalledTimes(50);
    expect(releve.movements).toHaveLength(10_000);
    expect(releve.tronque).toBe(true);
  });

  it('pas de troncature quand tout est lu, même à 50 pages pleines', async () => {
    serveur(10_000);
    const releve = await getFullAccountStatement('t1', 'a');
    expect(releve.movements).toHaveLength(10_000);
    expect(releve.tronque).toBe(false);
  });

  it('ne demande qu’une page quand le relevé est court', async () => {
    serveur(12);
    const releve = await getFullAccountStatement('t1', 'a');
    expect(releve.movements).toHaveLength(12);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
