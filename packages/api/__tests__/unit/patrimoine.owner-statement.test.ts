import { ExpenseCategory, ManagementFeeBase } from '@prisma/client';
import {
  computeOwnerStatement,
  StatementComputationInput,
  StatementInstallmentInput
} from '../../src/lib/patrimoine/owner-statement-computation';

/**
 * Relevé de gérance — lot 1 de la gestion locative.
 *
 * L'ancien calcul prenait le loyer du CONTRAT de chaque bail actif pour un
 * loyer encaissé et ne déduisait aucun honoraire. Ces tests figent la règle qui
 * le remplace : on reverse ce qui a été réellement payé, moins les honoraires,
 * leur TVA et les dépenses.
 */

const SEPT_START = new Date(Date.UTC(2026, 8, 1));
const SEPT_END = new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999));

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

function input(overrides: Partial<StatementComputationInput> = {}): StatementComputationInput {
  return {
    periodStart: SEPT_START,
    periodEnd: SEPT_END,
    propertyIds: ['prop-1'],
    installments: [],
    expenses: [],
    settings: {
      managementFeeRate: 10,
      managementFeeBase: ManagementFeeBase.RENT_ONLY,
      vatRegistered: true,
      vatRate: 18
    },
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

  it('déduit honoraires et TVA du loyer encaissé — le cas de la démonstration', () => {
    const result = computeOwnerStatement(
      input({
        installments: [installment({ allocations: [{ amount: 200_000, paidAt: new Date(Date.UTC(2026, 8, 6)) }] })]
      })
    );

    expect(result.totalRevenue).toBe(200_000);
    expect(result.totalManagementFees).toBe(20_000);
    expect(result.totalManagementFeesVat).toBe(3_600);
    expect(result.netAmount).toBe(176_400);
    expect(result.totalArrears).toBe(0);
    expect(result.items.map(item => [item.type, item.label, item.amount])).toEqual([
      ['RENT_COLLECTED', 'Loyers encaissés', 200_000],
      ['MANAGEMENT_FEE', 'Honoraires de gestion (10 %)', 20_000],
      ['MANAGEMENT_FEE_VAT', 'TVA sur honoraires (18 %)', 3_600]
    ]);
  });

  it('prend les honoraires sur la part payée seulement, et laisse le reste en impayé', () => {
    const result = computeOwnerStatement(
      input({
        installments: [installment({ allocations: [{ amount: 50_000, paidAt: new Date(Date.UTC(2026, 8, 10)) }] })]
      })
    );

    expect(result.totalRevenue).toBe(50_000);
    expect(result.totalArrears).toBe(150_000);
    expect(result.totalManagementFees).toBe(5_000);
    expect(result.totalManagementFeesVat).toBe(900);
    expect(result.netAmount).toBe(44_100);
  });

  it('compte un arriéré de juin payé en septembre comme un encaissement de septembre', () => {
    const june = installment({
      dueDate: new Date(Date.UTC(2026, 5, 5)),
      allocations: [{ amount: 200_000, paidAt: new Date(Date.UTC(2026, 8, 15)) }]
    });
    const september = installment();

    const result = computeOwnerStatement(input({ installments: [june, september] }));

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

  it("limite l'assiette « loyer seul » à la part loyer, au prorata", () => {
    const withCharges = installment({
      amountRent: 90_000,
      amountService: 10_000,
      allocations: [{ amount: 50_000, paidAt: new Date(Date.UTC(2026, 8, 6)) }]
    });

    const rentOnly = computeOwnerStatement(input({ installments: [withCharges] }));
    const allCollected = computeOwnerStatement(
      input({
        installments: [withCharges],
        settings: {
          managementFeeRate: 10,
          managementFeeBase: ManagementFeeBase.ALL_COLLECTED,
          vatRegistered: false,
          vatRate: 18
        }
      })
    );

    expect(rentOnly.totalManagementFees).toBe(4_500);
    expect(allCollected.totalManagementFees).toBe(5_000);
    expect(allCollected.totalManagementFeesVat).toBe(0);
    expect(allCollected.appliedVatRate).toBeNull();
  });

  it("n'invente pas d'honoraires quand l'agence n'a pas fixé son taux", () => {
    const result = computeOwnerStatement(
      input({
        installments: [installment({ allocations: [{ amount: 200_000, paidAt: new Date(Date.UTC(2026, 8, 6)) }] })],
        expenses: [
          {
            propertyId: 'prop-1',
            label: 'Frais de gestion saisis',
            amount: 15_000,
            category: ExpenseCategory.MANAGEMENT_FEES
          }
        ],
        settings: {
          managementFeeRate: null,
          managementFeeBase: ManagementFeeBase.RENT_ONLY,
          vatRegistered: true,
          vatRate: 18
        }
      })
    );

    expect(result.totalManagementFees).toBe(0);
    expect(result.totalManagementFeesVat).toBe(0);
    expect(result.appliedFeeRate).toBeNull();
    // Sans taux, la dépense saisie à la main reste la seule trace des frais.
    expect(result.totalExpenses).toBe(15_000);
    expect(result.netAmount).toBe(185_000);
  });

  it('écarte une dépense « frais de gestion » quand les honoraires sont calculés, pour ne pas les déduire deux fois', () => {
    const result = computeOwnerStatement(
      input({
        installments: [installment({ allocations: [{ amount: 200_000, paidAt: new Date(Date.UTC(2026, 8, 6)) }] })],
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

  it('arrondit honoraires et TVA au franc, bien par bien', () => {
    const result = computeOwnerStatement(
      input({
        propertyIds: ['prop-1', 'prop-2'],
        installments: [
          installment({
            amountRent: 33_335,
            allocations: [{ amount: 33_335, paidAt: new Date(Date.UTC(2026, 8, 6)) }]
          }),
          installment({
            propertyId: 'prop-2',
            amountRent: 33_335,
            allocations: [{ amount: 33_335, paidAt: new Date(Date.UTC(2026, 8, 6)) }]
          })
        ]
      })
    );

    // 3 333,5 arrondi à 3 334 par bien ; TVA 600,12 arrondie à 600.
    expect(result.totalManagementFees).toBe(6_668);
    expect(result.totalManagementFeesVat).toBe(1_200);
  });

  it("n'attribue pas à un bien l'argent d'un autre", () => {
    const result = computeOwnerStatement(
      input({
        installments: [
          installment({
            propertyId: 'prop-other',
            allocations: [{ amount: 500_000, paidAt: new Date(Date.UTC(2026, 8, 6)) }]
          })
        ]
      })
    );

    expect(result.totalRevenue).toBe(0);
    expect(result.items).toEqual([]);
  });
});
