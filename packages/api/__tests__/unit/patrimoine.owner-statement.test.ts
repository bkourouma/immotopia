import { ExpenseCategory, ManagementFeeBase, ManagementFeeMode } from '@prisma/client';
import {
  computeOwnerStatement,
  StatementComputationInput,
  StatementFeeInput,
  StatementInstallmentInput
} from '../../src/lib/patrimoine/owner-statement-computation';

/**
 * Relevé de gérance.
 *
 * L'ancien calcul prenait le loyer du CONTRAT de chaque bail actif pour un
 * loyer encaissé et ne déduisait aucun honoraire. Ces tests figent la règle qui
 * le remplace : on reverse ce qui a été réellement payé, moins les honoraires
 * figés à l'encaissement, leur TVA et les dépenses. Le calcul des honoraires
 * eux-mêmes est couvert par `rental-fees.fee-terms.test.ts`.
 */

const SEPT_START = new Date(Date.UTC(2026, 8, 1));
const SEPT_END = new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999));
const PAID_SEPT = new Date(Date.UTC(2026, 8, 6));

function installment(overrides: Partial<StatementInstallmentInput> = {}): StatementInstallmentInput {
  return {
    propertyId: 'prop-1',
    dueDate: new Date(Date.UTC(2026, 8, 5)),
    countsAsDue: true,
    amountRent: 200_000,
    amountService: 0,
    amountOtherFees: 0,
    penaltyAmount: 0,
    allocations: [],
    ...overrides
  };
}

function fee(overrides: Partial<StatementFeeInput> = {}): StatementFeeInput {
  return {
    propertyId: 'prop-1',
    feeAmount: 20_000,
    vatAmount: 3_600,
    mode: ManagementFeeMode.PERCENT,
    rate: 10,
    feeBase: ManagementFeeBase.RENT_ONLY,
    vatRate: 18,
    ...overrides
  };
}

function input(overrides: Partial<StatementComputationInput> = {}): StatementComputationInput {
  return {
    periodStart: SEPT_START,
    periodEnd: SEPT_END,
    propertyIds: ['prop-1'],
    installments: [],
    expenses: [],
    fees: [],
    ...overrides
  };
}

describe('computeOwnerStatement', () => {
  it("ne compte rien d'encaissé quand le locataire n'a pas payé", () => {
    const result = computeOwnerStatement(input({ installments: [installment()] }));

    expect(result.totalRentDue).toBe(200_000);
    expect(result.totalRevenue).toBe(0);
    expect(result.totalArrears).toBe(200_000);
    expect(result.totalManagementFees).toBe(0);
    expect(result.netAmount).toBe(0);
    expect(result.items).toEqual([]);
  });

  it('déduit les honoraires figés et leur TVA du loyer encaissé', () => {
    const result = computeOwnerStatement(
      input({
        installments: [installment({ allocations: [{ amount: 200_000, paidAt: PAID_SEPT }] })],
        fees: [fee()]
      })
    );

    expect(result.totalRevenue).toBe(200_000);
    expect(result.totalManagementFees).toBe(20_000);
    expect(result.totalManagementFeesVat).toBe(3_600);
    expect(result.netAmount).toBe(176_400);
    expect(result.appliedFeeRate).toBe(10);
    expect(result.appliedVatRate).toBe(18);
    expect(result.items.map(item => [item.type, item.label, item.amount])).toEqual([
      ['RENT_COLLECTED', 'Loyers encaissés', 200_000],
      ['MANAGEMENT_FEE', 'Honoraires de gestion (10 %)', 20_000],
      ['MANAGEMENT_FEE_VAT', 'TVA sur honoraires (18 %)', 3_600]
    ]);
  });

  it("ne fige aucun taux quand les baux du relevé n'ont pas le même", () => {
    const result = computeOwnerStatement(
      input({
        installments: [installment({ allocations: [{ amount: 200_000, paidAt: PAID_SEPT }] })],
        fees: [fee({ feeAmount: 10_000, vatAmount: 1_800 }), fee({ rate: 8, feeAmount: 8_000, vatAmount: 1_440 })]
      })
    );

    expect(result.totalManagementFees).toBe(18_000);
    expect(result.appliedFeeRate).toBeNull();
    expect(result.items.find(item => item.type === 'MANAGEMENT_FEE')?.label).toBe('Honoraires de gestion');
  });

  it('nomme un forfait comme tel', () => {
    const result = computeOwnerStatement(
      input({
        installments: [installment({ allocations: [{ amount: 200_000, paidAt: PAID_SEPT }] })],
        fees: [
          fee({
            mode: ManagementFeeMode.FIXED,
            rate: null,
            feeBase: null,
            feeAmount: 15_000,
            vatAmount: 0,
            vatRate: null
          })
        ]
      })
    );

    expect(result.items.find(item => item.type === 'MANAGEMENT_FEE')?.label).toBe('Honoraires de gestion (forfait)');
    expect(result.appliedFeeRate).toBeNull();
  });

  it('compte un arriéré de juin payé en septembre comme un encaissement de septembre', () => {
    const june = installment({
      dueDate: new Date(Date.UTC(2026, 5, 5)),
      allocations: [{ amount: 200_000, paidAt: new Date(Date.UTC(2026, 8, 15)) }]
    });

    const result = computeOwnerStatement(input({ installments: [june, installment()] }));

    expect(result.totalRentDue).toBe(200_000);
    expect(result.totalRevenue).toBe(200_000);
    // Juin est soldé ; septembre reste dû.
    expect(result.totalArrears).toBe(200_000);
  });

  it("ne réécrit pas l'impayé d'un mois passé avec un paiement postérieur", () => {
    const result = computeOwnerStatement(
      input({
        installments: [installment({ allocations: [{ amount: 200_000, paidAt: new Date(Date.UTC(2026, 9, 2)) }] })]
      })
    );

    expect(result.totalRevenue).toBe(0);
    expect(result.totalArrears).toBe(200_000);
  });

  it("ignore une échéance en brouillon pour l'appelé et l'impayé", () => {
    const result = computeOwnerStatement(input({ installments: [installment({ countsAsDue: false })] }));

    expect(result.totalRentDue).toBe(0);
    expect(result.totalArrears).toBe(0);
  });

  it('garde une dépense « frais de gestion » saisie à la main quand le bien ne porte aucun honoraire', () => {
    const result = computeOwnerStatement(
      input({
        installments: [installment({ allocations: [{ amount: 200_000, paidAt: PAID_SEPT }] })],
        expenses: [
          {
            propertyId: 'prop-1',
            label: 'Frais de gestion saisis',
            amount: 15_000,
            category: ExpenseCategory.MANAGEMENT_FEES
          }
        ]
      })
    );

    expect(result.totalManagementFees).toBe(0);
    expect(result.appliedFeeRate).toBeNull();
    expect(result.totalExpenses).toBe(15_000);
    expect(result.netAmount).toBe(185_000);
  });

  it('écarte cette dépense quand le bien porte des honoraires, pour ne pas les déduire deux fois', () => {
    const result = computeOwnerStatement(
      input({
        installments: [installment({ allocations: [{ amount: 200_000, paidAt: PAID_SEPT }] })],
        fees: [fee()],
        expenses: [
          {
            propertyId: 'prop-1',
            label: 'Frais de gestion saisis',
            amount: 15_000,
            category: ExpenseCategory.MANAGEMENT_FEES
          },
          { propertyId: 'prop-1', label: 'Plomberie', amount: 30_000, category: ExpenseCategory.ROUTINE_MAINTENANCE }
        ]
      })
    );

    expect(result.totalExpenses).toBe(30_000);
    expect(result.netAmount).toBe(200_000 - 20_000 - 3_600 - 30_000);
  });

  it("n'attribue pas à un bien l'argent ni les honoraires d'un autre", () => {
    const result = computeOwnerStatement(
      input({
        installments: [
          installment({ propertyId: 'prop-other', allocations: [{ amount: 500_000, paidAt: PAID_SEPT }] })
        ],
        fees: [fee({ propertyId: 'prop-other' })]
      })
    );

    expect(result.totalRevenue).toBe(0);
    expect(result.totalManagementFees).toBe(0);
    expect(result.items).toEqual([]);
  });
});
