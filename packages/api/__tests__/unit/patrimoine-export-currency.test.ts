/**
 * Détermination de la devise consolidée de l'export patrimoine (lot P3).
 *
 * Fonction pure (`determineExportCurrency`, `lib/patrimoine/export/data.ts`) :
 * une seule devise rencontrée dans les données détaillées (valorisations,
 * emprunts, dépenses) ⇒ on l'affiche ; aucune donnée ⇒ XOF par défaut ;
 * plusieurs devises différentes ⇒ pas de conversion possible, l'appelant
 * (`pdf.ts`) doit afficher des montants bruts avec une mention explicite.
 */
import { determineExportCurrency, type ExportProperty } from '../../src/lib/patrimoine/export/data';

function buildProperty(overrides: Partial<ExportProperty> = {}): ExportProperty {
  return {
    id: 'prop-1',
    internalReference: 'REF-001',
    title: 'Bien',
    propertyType: 'APPARTEMENT',
    status: 'AVAILABLE',
    address: 'Cocody, Abidjan',
    valuations: [],
    loans: [],
    expenses: [],
    workPrograms: [],
    documents: [],
    yield: {
      currentValue: 0,
      annualRent: 0,
      annualExpenses: 0,
      grossYield: 0,
      netYield: 0,
      netNetYield: null,
      latentCapitalGain: null
    },
    ...overrides
  };
}

describe('determineExportCurrency', () => {
  it("renvoie 'none' quand aucune propriété n'a de valorisation, d'emprunt ni de dépense", () => {
    expect(determineExportCurrency([buildProperty()])).toEqual({ kind: 'none' });
    expect(determineExportCurrency([])).toEqual({ kind: 'none' });
  });

  it("renvoie 'single' quand une seule devise apparaît, tous champs confondus", () => {
    const property = buildProperty({
      valuations: [{ valuatedAt: new Date(), estimatedValue: 100, currency: 'XOF', method: 'MANUAL' }],
      loans: [
        {
          lender: 'Banque',
          capitalAmount: 100,
          remainingCapital: 50,
          interestRate: 5,
          monthlyPayment: 10,
          currency: 'XOF',
          startDate: new Date(),
          endDate: new Date(),
          status: 'ACTIVE'
        }
      ],
      expenses: [
        { category: 'OTHER', label: 'x', amount: 10, currency: 'XOF', paidAt: new Date(), isCapitalized: false }
      ]
    });
    expect(determineExportCurrency([property])).toEqual({ kind: 'single', currency: 'XOF' });
  });

  it("renvoie 'multiple' dès que deux devises différentes apparaissent, même sur des biens différents", () => {
    const propertyA = buildProperty({
      valuations: [{ valuatedAt: new Date(), estimatedValue: 100, currency: 'XOF', method: 'MANUAL' }]
    });
    const propertyB = buildProperty({
      id: 'prop-2',
      expenses: [
        { category: 'OTHER', label: 'x', amount: 10, currency: 'EUR', paidAt: new Date(), isCapitalized: false }
      ]
    });
    expect(determineExportCurrency([propertyA, propertyB])).toEqual({ kind: 'multiple' });
  });

  it("détecte une seconde devise même si elle ne vient que d'un emprunt", () => {
    const property = buildProperty({
      valuations: [{ valuatedAt: new Date(), estimatedValue: 100, currency: 'XOF', method: 'MANUAL' }],
      loans: [
        {
          lender: 'Banque',
          capitalAmount: 100,
          remainingCapital: 50,
          interestRate: 5,
          monthlyPayment: 10,
          currency: 'USD',
          startDate: new Date(),
          endDate: new Date(),
          status: 'ACTIVE'
        }
      ]
    });
    expect(determineExportCurrency([property])).toEqual({ kind: 'multiple' });
  });
});
