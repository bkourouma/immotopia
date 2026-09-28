import {
  pickParametersYear,
  resolveBrackets,
  resolveParameter,
  resolveSurcharges
} from '../../src/lib/patrimoine/tax/parameters';
import type { TaxContext, TaxParameterRow } from '../../src/lib/patrimoine/tax/types';

function param(
  overrides: Partial<TaxParameterRow> & Pick<TaxParameterRow, 'id' | 'country' | 'year' | 'taxKind' | 'key'>
): TaxParameterRow {
  return {
    propertyKind: 'ANY',
    occupancy: 'ANY',
    ownerKind: 'ANY',
    bracketIndex: 0,
    lowerBound: null,
    upperBound: null,
    value: null,
    valueText: null,
    unit: 'PERCENT',
    label: overrides.id,
    source: 'Fixture de test',
    sourceUrl: null,
    status: 'A_VALIDER',
    notes: null,
    ...overrides
  };
}

describe('pickParametersYear', () => {
  const rows: TaxParameterRow[] = [
    param({ id: 'p1', country: 'CI', year: 2025, taxKind: 'PROPERTY_TAX', key: 'rate', value: 8 }),
    param({ id: 'p2', country: 'CI', year: 2026, taxKind: 'PROPERTY_TAX', key: 'rate', value: 9 }),
    param({ id: 'p3', country: 'ML', year: 2026, taxKind: 'PROPERTY_TAX', key: 'rate', value: 3 }),
    param({ id: 'p4', country: 'CI', year: 2026, taxKind: 'RENTAL_INCOME_TAX', key: 'rate', value: 3 })
  ];

  it('2027 → 2026 avec repli (fallback)', () => {
    const result = pickParametersYear(rows, 'CI', 'PROPERTY_TAX', 2027);
    expect(result.year).toBe(2026);
    expect(result.fallback).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe('p2');
  });

  it('2025 → 2025 sans repli (année exacte présente)', () => {
    const result = pickParametersYear(rows, 'CI', 'PROPERTY_TAX', 2025);
    expect(result.year).toBe(2025);
    expect(result.fallback).toBe(false);
    expect(result.rows.map(r => r.id)).toEqual(['p1']);
  });

  it('2024 → aucune ligne éligible : null', () => {
    const result = pickParametersYear(rows, 'CI', 'PROPERTY_TAX', 2024);
    expect(result).toEqual({ year: null, fallback: false, rows: [] });
  });

  it("choisit par impôt (n'inclut pas RENTAL_INCOME_TAX pour un choix PROPERTY_TAX)", () => {
    const result = pickParametersYear(rows, 'CI', 'PROPERTY_TAX', 2026);
    expect(result.rows.every(r => r.taxKind === 'PROPERTY_TAX')).toBe(true);
  });

  it("choisit par pays (n'inclut pas ML pour un choix CI)", () => {
    const result = pickParametersYear(rows, 'CI', 'PROPERTY_TAX', 2026);
    expect(result.rows.every(r => r.country === 'CI')).toBe(true);
  });
});

describe('resolveParameter — spécificité des sélecteurs (poids 4/2/1)', () => {
  const ctx: TaxContext = { propertyKind: 'BUILT', occupancy: 'RENTED', ownerKind: 'INDIVIDUAL' };

  it('la ligne la plus spécifique gagne sur toutes les autres candidates', () => {
    const rows: TaxParameterRow[] = [
      param({ id: 'any', country: 'CI', year: 2026, taxKind: 'PROPERTY_TAX', key: 'rate', value: 1 }),
      param({
        id: 'pk',
        country: 'CI',
        year: 2026,
        taxKind: 'PROPERTY_TAX',
        key: 'rate',
        propertyKind: 'BUILT',
        value: 2
      }),
      param({
        id: 'occ',
        country: 'CI',
        year: 2026,
        taxKind: 'PROPERTY_TAX',
        key: 'rate',
        occupancy: 'RENTED',
        value: 3
      }),
      param({
        id: 'own',
        country: 'CI',
        year: 2026,
        taxKind: 'PROPERTY_TAX',
        key: 'rate',
        ownerKind: 'INDIVIDUAL',
        value: 4
      }),
      param({
        id: 'pk+occ',
        country: 'CI',
        year: 2026,
        taxKind: 'PROPERTY_TAX',
        key: 'rate',
        propertyKind: 'BUILT',
        occupancy: 'RENTED',
        value: 6
      }),
      param({
        id: 'all',
        country: 'CI',
        year: 2026,
        taxKind: 'PROPERTY_TAX',
        key: 'rate',
        propertyKind: 'BUILT',
        occupancy: 'RENTED',
        ownerKind: 'INDIVIDUAL',
        value: 7
      })
    ];

    expect(resolveParameter(rows, 'rate', ctx)?.id).toBe('all');
  });

  it('un poids propertyKind (4) prime sur un poids occupancy (2) seul', () => {
    const rows: TaxParameterRow[] = [
      param({
        id: 'pk',
        country: 'CI',
        year: 2026,
        taxKind: 'PROPERTY_TAX',
        key: 'rate',
        propertyKind: 'BUILT',
        value: 2
      }),
      param({
        id: 'occ',
        country: 'CI',
        year: 2026,
        taxKind: 'PROPERTY_TAX',
        key: 'rate',
        occupancy: 'RENTED',
        value: 3
      })
    ];

    expect(resolveParameter(rows, 'rate', ctx)?.id).toBe('pk');
  });

  it('un poids occupancy (2) prime sur un poids ownerKind (1) seul', () => {
    const rows: TaxParameterRow[] = [
      param({
        id: 'occ',
        country: 'CI',
        year: 2026,
        taxKind: 'PROPERTY_TAX',
        key: 'rate',
        occupancy: 'RENTED',
        value: 3
      }),
      param({
        id: 'own',
        country: 'CI',
        year: 2026,
        taxKind: 'PROPERTY_TAX',
        key: 'rate',
        ownerKind: 'INDIVIDUAL',
        value: 4
      })
    ];

    expect(resolveParameter(rows, 'rate', ctx)?.id).toBe('occ');
  });

  it('écarte les candidates dont un sélecteur ne correspond pas au contexte', () => {
    const rows: TaxParameterRow[] = [
      param({
        id: 'wrong',
        country: 'CI',
        year: 2026,
        taxKind: 'PROPERTY_TAX',
        key: 'rate',
        propertyKind: 'UNBUILT',
        value: 1
      }),
      param({
        id: 'ok',
        country: 'CI',
        year: 2026,
        taxKind: 'PROPERTY_TAX',
        key: 'rate',
        propertyKind: 'ANY',
        value: 2
      })
    ];

    expect(resolveParameter(rows, 'rate', ctx)?.id).toBe('ok');
  });

  it('ignore les lignes de bracketIndex différent de 0', () => {
    const rows: TaxParameterRow[] = [
      param({ id: 'idx1', country: 'CI', year: 2026, taxKind: 'PROPERTY_TAX', key: 'rate', bracketIndex: 1, value: 9 })
    ];

    expect(resolveParameter(rows, 'rate', ctx)).toBeNull();
  });

  it('retourne null si aucune ligne ne correspond', () => {
    expect(resolveParameter([], 'rate', ctx)).toBeNull();
  });
});

describe('resolveBrackets', () => {
  const ctx: TaxContext = { propertyKind: 'BUILT', occupancy: 'RENTED', ownerKind: 'INDIVIDUAL' };

  it('retourne les tranches du meilleur niveau de spécificité, triées par bracketIndex', () => {
    const rows: TaxParameterRow[] = [
      param({
        id: 'b1',
        country: 'CI',
        year: 2026,
        taxKind: 'PROPERTY_TAX',
        key: 'bracket_rate',
        bracketIndex: 1,
        lowerBound: 1_000_000,
        upperBound: null,
        value: 10
      }),
      param({
        id: 'b0',
        country: 'CI',
        year: 2026,
        taxKind: 'PROPERTY_TAX',
        key: 'bracket_rate',
        bracketIndex: 0,
        lowerBound: 0,
        upperBound: 1_000_000,
        value: 5
      }),
      // Niveau moins spécifique (ANY) : écarté puisqu'un niveau plus précis existe.
      param({
        id: 'generic',
        country: 'CI',
        year: 2026,
        taxKind: 'PROPERTY_TAX',
        key: 'bracket_rate',
        propertyKind: 'ANY',
        occupancy: 'ANY',
        ownerKind: 'ANY',
        bracketIndex: 0,
        value: 1
      })
    ];

    const result = resolveBrackets(
      rows.map(r =>
        r.id === 'b1' || r.id === 'b0'
          ? { ...r, propertyKind: 'BUILT' as const, occupancy: 'RENTED' as const, ownerKind: 'INDIVIDUAL' as const }
          : r
      ),
      ctx
    );

    expect(result.map(r => r.id)).toEqual(['b0', 'b1']);
  });

  it('retourne un tableau vide sans tranche définie', () => {
    expect(resolveBrackets([], ctx)).toEqual([]);
  });
});

describe('resolveSurcharges', () => {
  const ctx: TaxContext = { propertyKind: 'BUILT', occupancy: 'RENTED', ownerKind: 'INDIVIDUAL' };

  it('retourne la meilleure ligne pour chaque bracketIndex', () => {
    const rows: TaxParameterRow[] = [
      param({
        id: 's0-any',
        country: 'CI',
        year: 2026,
        taxKind: 'PROPERTY_TAX',
        key: 'surcharge_on_tax_rate',
        bracketIndex: 0,
        value: 1
      }),
      param({
        id: 's0-specific',
        country: 'CI',
        year: 2026,
        taxKind: 'PROPERTY_TAX',
        key: 'surcharge_on_tax_rate',
        bracketIndex: 0,
        propertyKind: 'BUILT',
        value: 2
      }),
      param({
        id: 's1',
        country: 'CI',
        year: 2026,
        taxKind: 'PROPERTY_TAX',
        key: 'surcharge_on_tax_rate',
        bracketIndex: 1,
        value: 3
      })
    ];

    const result = resolveSurcharges(rows, 'surcharge_on_tax_rate', ctx);
    expect(result.map(r => r.id)).toEqual(['s0-specific', 's1']);
  });

  it('retourne un tableau vide sans surtaxe définie', () => {
    expect(resolveSurcharges([], 'surcharge_on_tax_rate', ctx)).toEqual([]);
  });
});
