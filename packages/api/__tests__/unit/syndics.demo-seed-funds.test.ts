/**
 * `prisma/seeds/syndic-demo-fund-movements.ts` — journal des fonds du seed de
 * demo syndic (lot syndic-ecarts). Fonction pure, sans Prisma.
 */

import { buildSyndicFundMovements, roundCents } from '../../prisma/seeds/syndic-demo-fund-movements';

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
const TENANT = 'tenant-a';
const FUND_ROULEMENT = 'fund-roulement';
const FUND_TRAVAUX = 'fund-travaux';
const LOT_A = 'lot-a';
const LOT_B = 'lot-b';

describe('roundCents', () => {
  it('arrondit au centime', () => {
    expect(roundCents(1234.5678)).toBe(1234.57);
    expect(roundCents(10 / 3)).toBe(3.33);
  });
});

describe('buildSyndicFundMovements', () => {
  it("credite l'ouverture de chaque fonds a la date de reprise", () => {
    const { movements, balances } = buildSyndicFundMovements({
      tenantId: TENANT,
      travauxFundId: FUND_TRAVAUX,
      openings: [
        { fundId: FUND_ROULEMENT, amount: 1000, date: d('2026-01-01'), label: 'Solde repris' },
        { fundId: FUND_TRAVAUX, amount: 2000, date: d('2026-01-01'), label: 'Solde repris' }
      ],
      payments: [],
      lotAnnualByYear: new Map(),
      fundLotAnnualByYear: new Map(),
      expenses: []
    });

    expect(movements).toHaveLength(2);
    expect(movements.every(m => m.sourceType === 'OPENING' && m.direction === 'CREDIT')).toBe(true);
    expect(balances.get(FUND_ROULEMENT)).toBe(1000);
    expect(balances.get(FUND_TRAVAUX)).toBe(2000);
  });

  it("verse au fonds de travaux la part d'un paiement au prorata de la part annuelle du lot", () => {
    const { movements, balances } = buildSyndicFundMovements({
      tenantId: TENANT,
      travauxFundId: FUND_TRAVAUX,
      openings: [{ fundId: FUND_TRAVAUX, amount: 0, date: d('2026-01-01'), label: 'Solde repris' }],
      payments: [
        {
          paymentId: 'pay-1',
          chargeCallId: 'call-1',
          amount: 10000,
          paidAt: d('2026-02-01'),
          lotId: LOT_A,
          lotNum: 'A01',
          period: '2026-T1',
          year: 2026,
          kind: 'REGULAR'
        }
      ],
      // Part annuelle totale du lot A : 100 000, dont 10 000 au poste fonds de travaux (10 %).
      lotAnnualByYear: new Map([['2026', new Map([[LOT_A, 100000]])]]),
      fundLotAnnualByYear: new Map([[2026, new Map([[LOT_A, 10000]])]]),
      expenses: []
    });

    expect(movements).toHaveLength(1);
    const [credit] = movements;
    expect(credit.direction).toBe('CREDIT');
    expect(credit.sourceType).toBe('CHARGE_PAYMENT');
    expect(credit.sourceId).toBe('pay-1');
    expect(credit.amount).toBe(1000); // 10 % de 10 000
    expect(credit.balanceAfter).toBe(1000);
    expect(balances.get(FUND_TRAVAUX)).toBe(1000);
  });

  it('ignore les appels EXCEPTIONAL et REPRISE (aucune part "fonds de travaux")', () => {
    const { movements } = buildSyndicFundMovements({
      tenantId: TENANT,
      travauxFundId: FUND_TRAVAUX,
      openings: [],
      payments: [
        {
          paymentId: 'pay-ex',
          chargeCallId: 'call-ex',
          amount: 500000,
          paidAt: d('2026-03-01'),
          lotId: LOT_A,
          lotNum: 'A01',
          period: '2026-EXC',
          year: 2026,
          kind: 'EXCEPTIONAL'
        },
        {
          paymentId: 'pay-rep',
          chargeCallId: 'call-rep',
          amount: 200000,
          paidAt: d('2026-01-15'),
          lotId: LOT_A,
          lotNum: 'A01',
          period: 'REPRISE',
          year: 2026,
          kind: 'REPRISE'
        }
      ],
      lotAnnualByYear: new Map([['2026', new Map([[LOT_A, 100000]])]]),
      fundLotAnnualByYear: new Map([[2026, new Map([[LOT_A, 10000]])]]),
      expenses: []
    });

    expect(movements).toHaveLength(0);
  });

  it('debite une depense manuelle et calcule le solde cumule dans l ordre chronologique', () => {
    const { movements, balances } = buildSyndicFundMovements({
      tenantId: TENANT,
      travauxFundId: FUND_TRAVAUX,
      openings: [{ fundId: FUND_TRAVAUX, amount: 5000, date: d('2026-01-01'), label: 'Solde repris' }],
      payments: [
        {
          paymentId: 'pay-1',
          chargeCallId: 'call-1',
          amount: 4000,
          paidAt: d('2026-03-01'),
          lotId: LOT_A,
          lotNum: 'A01',
          period: '2026-T1',
          year: 2026,
          kind: 'REGULAR'
        }
      ],
      lotAnnualByYear: new Map([['2026', new Map([[LOT_A, 4000]])]]),
      fundLotAnnualByYear: new Map([[2026, new Map([[LOT_A, 4000]])]]), // 100 % au fonds
      expenses: [{ fundId: FUND_TRAVAUX, amount: 3000, date: d('2026-02-01'), label: 'Travaux votes' }]
    });

    // Ordre chronologique : ouverture (01/01) -> depense (01/02) -> paiement (01/03).
    expect(movements.map(m => m.sourceType)).toEqual(['OPENING', 'MANUAL_EXPENSE', 'CHARGE_PAYMENT']);
    expect(movements[0].balanceAfter).toBe(5000);
    expect(movements[1].direction).toBe('DEBIT');
    expect(movements[1].balanceAfter).toBe(2000);
    expect(movements[2].balanceAfter).toBe(6000);
    expect(balances.get(FUND_TRAVAUX)).toBe(6000);
    // Le solde final est bien la somme du journal (CREDIT - DEBIT).
    const sum = movements.reduce((acc, m) => acc + (m.direction === 'CREDIT' ? m.amount : -m.amount), 0);
    expect(roundCentsSafe(sum)).toBe(balances.get(FUND_TRAVAUX));
  });

  it('trie a date egale par ordre d insertion (stable)', () => {
    const sameDay = d('2026-05-01');
    const { movements } = buildSyndicFundMovements({
      tenantId: TENANT,
      travauxFundId: FUND_TRAVAUX,
      openings: [{ fundId: FUND_TRAVAUX, amount: 1000, date: sameDay, label: 'Ouverture' }],
      payments: [
        {
          paymentId: 'pay-1',
          chargeCallId: 'call-1',
          amount: 100,
          paidAt: sameDay,
          lotId: LOT_A,
          lotNum: 'A01',
          period: '2026-T1',
          year: 2026,
          kind: 'REGULAR'
        },
        {
          paymentId: 'pay-2',
          chargeCallId: 'call-2',
          amount: 100,
          paidAt: sameDay,
          lotId: LOT_B,
          lotNum: 'B01',
          period: '2026-T1',
          year: 2026,
          kind: 'REGULAR'
        }
      ],
      lotAnnualByYear: new Map([
        [
          '2026',
          new Map([
            [LOT_A, 100],
            [LOT_B, 100]
          ])
        ]
      ]),
      fundLotAnnualByYear: new Map([
        [
          2026,
          new Map([
            [LOT_A, 100],
            [LOT_B, 100]
          ])
        ]
      ]),
      expenses: []
    });

    expect(movements.map(m => m.sourceId)).toEqual([null, 'pay-1', 'pay-2']);
  });

  it('leve une erreur plutot que de laisser un solde intermediaire negatif', () => {
    expect(() =>
      buildSyndicFundMovements({
        tenantId: TENANT,
        travauxFundId: FUND_TRAVAUX,
        openings: [{ fundId: FUND_TRAVAUX, amount: 1000, date: d('2026-01-01'), label: 'Ouverture' }],
        payments: [],
        lotAnnualByYear: new Map(),
        fundLotAnnualByYear: new Map(),
        expenses: [{ fundId: FUND_TRAVAUX, amount: 5000, date: d('2026-02-01'), label: 'Trop gros prelevement' }]
      })
    ).toThrow(/Solde negatif/);
  });

  it('ignore un paiement sans part fonds de travaux pour l annee (fundShare = 0)', () => {
    const { movements } = buildSyndicFundMovements({
      tenantId: TENANT,
      travauxFundId: FUND_TRAVAUX,
      openings: [],
      payments: [
        {
          paymentId: 'pay-1',
          chargeCallId: 'call-1',
          amount: 1000,
          paidAt: d('2026-01-01'),
          lotId: LOT_A,
          lotNum: 'A01',
          period: '2026-T1',
          year: 2026,
          kind: 'REGULAR'
        }
      ],
      lotAnnualByYear: new Map([['2026', new Map([[LOT_A, 1000]])]]),
      fundLotAnnualByYear: new Map(), // aucune part fonds de travaux cette annee
      expenses: []
    });

    expect(movements).toHaveLength(0);
  });
});

function roundCentsSafe(value: number): number {
  return Math.round(value * 100) / 100;
}
