/**
 * Recette gestion locative 06 (GL-06-036) : Facturé / Réglé de la balance
 * clients ne comptent ni une avance annulée ni sa contre-passation.
 *
 * Scénario : P3 (300 000) reçu en avance, affecté à trois échéances (PAYMENT
 * 300 000 + reprise d'avance 300 000), puis annulé. Le mouvement de
 * contre-passation (`type = VOID`, débit 300 000) défait l'avance (crédit 300 000).
 */
const groupBy = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: { thirdPartyMovement: { groupBy: (...a: any[]) => groupBy(...a) } }
}));

import { sumClientBilledSettledByAccount } from '../../src/lib/finance/third-party-totals';

const ACCOUNT = 'acc-1';

/** Simule les `groupBy` SQL sur un petit jeu de mouvements. */
function installLedger(rows: Array<{ type: string; debit?: number; credit?: number }>) {
  groupBy.mockImplementation(async ({ where }: any) => {
    let selected = rows;
    if (where.type === 'ADVANCE_APPLIED') selected = selected.filter(r => r.type === 'ADVANCE_APPLIED');
    if (where.type === 'VOID') selected = selected.filter(r => r.type === 'VOID');
    if (where.type && typeof where.type === 'object' && where.type.not === 'VOID') {
      selected = selected.filter(r => r.type !== 'VOID');
    }
    const sum = (k: 'debit' | 'credit') => selected.reduce((s, r) => s + (r[k] ?? 0), 0);
    return [{ accountId: ACCOUNT, _sum: { debit: sum('debit'), credit: sum('credit') } }];
  });
}

describe('sumClientBilledSettledByAccount — avance annulée', () => {
  it('neutralise la contre-passation de l’avance annulée (Facturé 640 000, Réglé 810 000)', async () => {
    installLedger([
      { type: 'INSTALLMENT', debit: 640_000 },
      { type: 'ADVANCE_RECEIVED', credit: 450_000 },
      { type: 'ADVANCE_RECEIVED', credit: 20_000 },
      { type: 'PAYMENT', credit: 340_000 }, // autres règlements encaissés
      { type: 'ADVANCE_RECEIVED', credit: 300_000 }, // P3
      { type: 'PAYMENT', credit: 300_000 }, // P3 affecté
      { type: 'ADVANCE_APPLIED', debit: 300_000 }, // reprise d'avance
      { type: 'VOID', debit: 300_000 } // annulation de l'avance de P3
    ]);

    const totals = await sumClientBilledSettledByAccount({ tenantId: 't1' });

    expect(totals.get(ACCOUNT)).toEqual({ billed: 640_000, settled: 810_000 });
    // Le solde (Facturé − Réglé) reste celui du grand livre : 640 − 810 = −170 000.
  });

  it('sans annulation, garde la règle de la reprise d’avance', async () => {
    installLedger([
      { type: 'INSTALLMENT', debit: 100_000 },
      { type: 'ADVANCE_RECEIVED', credit: 100_000 },
      { type: 'PAYMENT', credit: 100_000 },
      { type: 'ADVANCE_APPLIED', debit: 100_000 }
    ]);

    const totals = await sumClientBilledSettledByAccount({ tenantId: 't1' });

    expect(totals.get(ACCOUNT)).toEqual({ billed: 100_000, settled: 100_000 });
  });
});
