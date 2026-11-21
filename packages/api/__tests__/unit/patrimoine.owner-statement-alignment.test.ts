import { ExpenseCategory, ManagementFeeBase, ManagementFeeMode } from '@prisma/client';
import {
  computeOwnerStatement,
  OWNER_STATEMENT_COMPUTATION_VERSION,
  StatementComputationInput
} from '../../src/lib/patrimoine/owner-statement-computation';
import { agencyPartOfAllocation, penaltyPart, rejectFeePart } from '../../src/lib/owner-account/agency-parts';
import { splitAmount } from '../../src/lib/ownership/split';
import { roundMoney } from '../../src/lib/finance/money';

/**
 * Revue locative, H1 : le relevé propriétaire s'aligne sur le compte propriétaire
 * (`owner-account/sync.ts`).
 *
 * - l'encaissé retire la part de l'agence (pénalités attribuées à l'agence, frais de
 *   rejet de prélèvement), avec les fonctions de `agency-parts.ts` partagées avec
 *   le compte ;
 * - en indivision, la part du propriétaire se calcule pièce par pièce
 *   (`splitAmount`), comme le compte.
 */

const START = new Date(Date.UTC(2026, 8, 1));
const END = new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999));
const PAID = new Date(Date.UTC(2026, 8, 6));

function base(overrides: Partial<StatementComputationInput> = {}): StatementComputationInput {
  return {
    periodStart: START,
    periodEnd: END,
    propertyIds: ['prop-1'],
    installments: [],
    expenses: [],
    fees: [],
    ...overrides
  };
}

/** Une échéance de la forme que lit le compte (champs Prisma). */
const dbInstallment = {
  amount_rent: 200_000,
  amount_service: 0,
  amount_other_fees: 0,
  penalty_amount: 10_000,
  items: [{ amount: 5_000, metadata: { kind: 'DIRECT_DEBIT_REJECT_FEE' } }]
};

function statementInstallment(allocations: Array<{ amount: number; agencyPart?: number }>) {
  return {
    propertyId: 'prop-1',
    dueDate: new Date(Date.UTC(2026, 8, 5)),
    countsAsDue: true,
    amountRent: 200_000,
    amountService: 0,
    amountOtherFees: 0,
    penaltyAmount: 10_000,
    allocations: allocations.map(a => ({ ...a, paidAt: PAID }))
  };
}

describe('version du calcul', () => {
  it('est passée à 4 (alignement sur le compte propriétaire)', () => {
    expect(OWNER_STATEMENT_COMPUTATION_VERSION).toBe(4);
  });
});

describe('agence : pénalités et frais de rejet retirés de l’encaissé', () => {
  it('(a) le net du relevé est ce que le compte inscrit au propriétaire', () => {
    // Montants du compte (sync.ts) : ownerAmount = roundMoney(full − pénalité agence − frais de rejet).
    const allocations = [215_000, 50_000];
    const accountCredit = allocations.reduce((sum, full) => {
      const agencyPenalty = penaltyPart(full, dbInstallment);
      const agencyRejectFee = rejectFeePart(full, dbInstallment);
      return sum + roundMoney(full - agencyPenalty - agencyRejectFee);
    }, 0);

    const result = computeOwnerStatement(
      base({
        installments: [
          statementInstallment(
            allocations.map(amount => ({ amount, agencyPart: agencyPartOfAllocation(amount, dbInstallment, true) }))
          )
        ]
      })
    );

    expect(result.totalRevenue).toBe(accountCredit);
    expect(result.netAmount).toBe(accountCredit);
    // L'agence garde bien quelque chose : l'encaissé est strictement inférieur au payé.
    expect(accountCredit).toBeLessThan(265_000);
    // Exemple chiffré : total de l'échéance = 200 000 + 10 000 = 210 000 ;
    // pénalité = 215 000 × 10 000 / 210 000 → 10 238 ; frais = 215 000 × 5 000 / 210 000 → 5 119.
    expect(penaltyPart(215_000, dbInstallment)).toBe(10_238);
    expect(rejectFeePart(215_000, dbInstallment)).toBe(5_119);
  });

  it('(a) les pénalités ne sont retirées que si elles reviennent à l’agence', () => {
    const toOwner = agencyPartOfAllocation(100_000, dbInstallment, false);
    const toAgency = agencyPartOfAllocation(100_000, dbInstallment, true);
    // Frais de rejet toujours à l’agence ; pénalités seulement si penaltyToAgency.
    expect(toOwner).toBe(rejectFeePart(100_000, dbInstallment));
    expect(toAgency).toBe(roundMoney(penaltyPart(100_000, dbInstallment) + rejectFeePart(100_000, dbInstallment)));
    expect(toAgency).toBeGreaterThan(toOwner);
  });

  it('(a) l’appelé et l’impayé restent calculés sur les montants entiers', () => {
    const full = computeOwnerStatement(
      base({ installments: [statementInstallment([{ amount: 215_000, agencyPart: 15_357 }])] })
    );
    const without = computeOwnerStatement(base({ installments: [statementInstallment([{ amount: 215_000 }])] }));
    expect(full.totalRentDue).toBe(without.totalRentDue);
    expect(full.totalArrears).toBe(without.totalArrears);
    expect(full.totalRevenue).toBe(215_000 - 15_357);
  });

  it('(c) sans part d’agence, le comportement est inchangé', () => {
    const result = computeOwnerStatement(
      base({
        installments: [statementInstallment([{ amount: 200_000 }])],
        fees: [
          {
            propertyId: 'prop-1',
            feeAmount: 20_000,
            vatAmount: 3_600,
            mode: ManagementFeeMode.PERCENT,
            rate: 10,
            feeBase: ManagementFeeBase.RENT_ONLY,
            vatRate: 18
          }
        ]
      })
    );
    expect(result.totalRevenue).toBe(200_000);
    expect(result.netAmount).toBe(200_000 - 20_000 - 3_600);
  });
});

describe('indivision : pièce par pièce, comme le compte', () => {
  const shares = [
    { ownerClientId: 'c-a', sharePercent: 33.3333 },
    { ownerClientId: 'c-b', sharePercent: 33.3333 },
    { ownerClientId: 'c-c', sharePercent: 33.3334 }
  ];

  function statementFor(ownerClientId: string) {
    return computeOwnerStatement(
      base({
        installments: [
          // Deux affectations impaires : la somme répartie diffère de la répartition pièce par pièce.
          {
            ...statementInstallment([]),
            penaltyAmount: 0,
            allocations: [
              { amount: 100_001, paidAt: PAID },
              { amount: 50_003, paidAt: PAID }
            ]
          }
        ],
        fees: [
          {
            propertyId: 'prop-1',
            feeAmount: 10_001,
            vatAmount: 1_801,
            mode: ManagementFeeMode.PERCENT,
            rate: 10,
            feeBase: ManagementFeeBase.RENT_ONLY,
            vatRate: 18
          },
          {
            propertyId: 'prop-1',
            feeAmount: 5_003,
            vatAmount: 901,
            mode: ManagementFeeMode.PERCENT,
            rate: 10,
            feeBase: ManagementFeeBase.RENT_ONLY,
            vatRate: 18
          }
        ],
        expenses: [
          { propertyId: 'prop-1', label: 'Plomberie', amount: 7_001, category: ExpenseCategory.ROUTINE_MAINTENANCE },
          { propertyId: 'prop-1', label: 'Serrure', amount: 3_001, category: ExpenseCategory.ROUTINE_MAINTENANCE }
        ],
        indivision: new Map([['prop-1', { ownerClientId, shares }]])
      })
    );
  }

  it('(b) la somme des parts des indivisaires égale le total, et chaque part est celle de splitAmount', () => {
    const results = ['c-a', 'c-b', 'c-c'].map(statementFor);
    const sum = (pick: (r: (typeof results)[number]) => number) => roundMoney(results.reduce((s, r) => s + pick(r), 0));
    expect(sum(r => r.totalRevenue)).toBe(150_004);
    expect(sum(r => r.totalManagementFees)).toBe(15_004);
    expect(sum(r => r.totalManagementFeesVat)).toBe(2_702);
    expect(sum(r => r.totalExpenses)).toBe(10_002);

    // Part du propriétaire c-b = Σ splitAmount(pièce).get('c-b'), pièce par pièce.
    const mine = (amounts: number[]) =>
      amounts.reduce((s, amount) => s + (splitAmount(amount, shares).get('c-b') ?? 0), 0);
    const b = results[1];
    expect(b.totalRevenue).toBe(mine([100_001, 50_003]));
    expect(b.totalManagementFees).toBe(mine([10_001, 5_003]));
    expect(b.totalManagementFeesVat).toBe(mine([1_801, 901]));
    expect(b.totalExpenses).toBe(mine([7_001, 3_001]));
  });

  it('(b) la part est entière en FCFA et le reste d’arrondi va au dernier indivisaire', () => {
    const results = ['c-a', 'c-b', 'c-c'].map(statementFor);
    for (const r of results) {
      expect(Number.isInteger(r.totalRevenue)).toBe(true);
      expect(Number.isInteger(r.netAmount)).toBe(true);
    }
    // Le dernier (c-c) absorbe le reste d'arrondi : a + b + c = total, au franc près.
    expect(results[0].totalRevenue + results[1].totalRevenue + results[2].totalRevenue).toBe(150_004);
  });

  it('(b) avec part d’agence : chaque affectation est répartie APRÈS retrait de la part agence', () => {
    const result = computeOwnerStatement(
      base({
        installments: [
          {
            ...statementInstallment([]),
            allocations: [{ amount: 100_001, agencyPart: 3_001, paidAt: PAID }]
          }
        ],
        indivision: new Map([['prop-1', { ownerClientId: 'c-b', shares }]])
      })
    );
    expect(result.totalRevenue).toBe(splitAmount(100_001 - 3_001, shares).get('c-b'));
  });

  it('shareByProperty seul continue de fonctionner (compatibilité)', () => {
    const result = computeOwnerStatement(
      base({
        installments: [statementInstallment([{ amount: 100_000 }])],
        shareByProperty: new Map([['prop-1', 50]])
      })
    );
    expect(result.totalRevenue).toBe(50_000);
  });
});
