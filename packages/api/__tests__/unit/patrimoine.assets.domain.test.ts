/**
 * Tests du domaine pur des actifs multi-classes (lot 1 du patrimoine
 * multi-actifs, `lib/patrimoine/assets/`) : schémas de détails par classe et
 * calcul de la valeur nette.
 */

import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  ASSET_DETAILS_VERSION,
  computeNetWorth,
  computeNetWorthHistory,
  currentValueAt,
  parseAssetDetails,
  toXof,
  type AssetClassKey,
  type NetWorthAssetInput,
  type NetWorthLoanInput
} from '../../src/lib/patrimoine/assets';

const AS_OF = new Date('2026-09-29T00:00:00Z');

function asset(overrides: Partial<NetWorthAssetInput> & { value?: number } = {}): NetWorthAssetInput {
  const { value, ...rest } = overrides;
  return {
    id: 'a1',
    name: 'Actif',
    assetClass: 'REAL_ESTATE',
    status: 'ACTIVE',
    currency: 'XOF',
    exchangeRateToXof: null,
    disposedAt: null,
    valuations:
      value === undefined
        ? []
        : [{ valuatedAt: new Date('2026-01-01T00:00:00Z'), estimatedValue: value, currency: 'XOF' }],
    ...rest
  };
}

function loan(overrides: Partial<NetWorthLoanInput> = {}): NetWorthLoanInput {
  return {
    id: 'l1',
    assetId: null,
    remainingCapital: 1_000_000,
    currency: 'XOF',
    status: 'ACTIVE',
    exchangeRateToXof: null,
    ...overrides
  };
}

function scenarioAssets(): NetWorthAssetInput[] {
  return [
    asset({ id: 'immeuble', assetClass: 'REAL_ESTATE', value: 80_000_000 }),
    asset({ id: 'vehicule', assetClass: 'VEHICLE_EQUIPMENT', value: 6_000_000 }),
    asset({ id: 'momo', assetClass: 'CASH', value: 400_000 })
  ];
}

describe('constantes des classes', () => {
  it('expose exactement les dix classes attendues', () => {
    expect([...ASSET_CLASSES]).toEqual([
      'REAL_ESTATE',
      'BUSINESS_EQUITY',
      'INVENTORY',
      'VEHICLE_EQUIPMENT',
      'CASH',
      'SAVINGS_INVESTMENT',
      'RECEIVABLE',
      'AGRICULTURE',
      'MOVABLE',
      'OTHER'
    ]);
    expect(ASSET_DETAILS_VERSION).toBe(2);
  });

  it('fournit un libellé français stable pour chaque classe', () => {
    expect(ASSET_CLASS_LABELS).toEqual({
      REAL_ESTATE: 'Immobilier',
      BUSINESS_EQUITY: 'Entreprises et parts de sociétés',
      INVENTORY: 'Stocks et marchandises',
      VEHICLE_EQUIPMENT: 'Véhicules et équipements',
      CASH: 'Comptes et mobile money',
      SAVINGS_INVESTMENT: 'Épargne et placements',
      RECEIVABLE: 'Créances',
      AGRICULTURE: 'Agriculture et élevage',
      MOVABLE: 'Biens meubles de valeur',
      OTHER: 'Autre'
    });
  });
});

describe('currentValueAt', () => {
  it('retient la valorisation la plus récente, même arrivée dans le désordre', () => {
    const a = asset({
      valuations: [
        { valuatedAt: new Date('2026-06-01T00:00:00Z'), estimatedValue: 300, currency: 'XOF' },
        { valuatedAt: new Date('2026-01-01T00:00:00Z'), estimatedValue: 100, currency: 'XOF' },
        { valuatedAt: new Date('2026-03-01T00:00:00Z'), estimatedValue: 200, currency: 'XOF' }
      ]
    });
    expect(currentValueAt(a, AS_OF)?.estimatedValue).toBe(300);
    expect(currentValueAt(a, new Date('2026-04-01T00:00:00Z'))?.estimatedValue).toBe(200);
  });

  it('ignore les valorisations postérieures à la date de calcul', () => {
    const a = asset({
      valuations: [{ valuatedAt: new Date('2027-01-01T00:00:00Z'), estimatedValue: 1, currency: 'XOF' }]
    });
    expect(currentValueAt(a, AS_OF)).toBeNull();
  });

  it('inclut une valorisation datée exactement de la date de calcul', () => {
    const a = asset({ valuations: [{ valuatedAt: AS_OF, estimatedValue: 5, currency: 'XOF' }] });
    expect(currentValueAt(a, AS_OF)?.estimatedValue).toBe(5);
  });

  it('à date égale, la dernière du tableau gagne', () => {
    const date = new Date('2026-02-01T00:00:00Z');
    const a = asset({
      valuations: [
        { valuatedAt: date, estimatedValue: 10, currency: 'XOF' },
        { valuatedAt: date, estimatedValue: 20, currency: 'XOF' }
      ]
    });
    expect(currentValueAt(a, AS_OF)?.estimatedValue).toBe(20);
  });

  it('renvoie null sans valorisation', () => {
    expect(currentValueAt(asset(), AS_OF)).toBeNull();
  });
});

describe('toXof', () => {
  it('laisse le XOF inchangé et ignore le taux', () => {
    expect(toXof(1000, 'XOF', null)).toBe(1000);
    expect(toXof(1000, 'XOF', 999)).toBe(1000);
  });

  it('convertit une devise étrangère avec le taux', () => {
    expect(toXof(100, 'EUR', 655.957)).toBeCloseTo(65_595.7, 5);
  });

  it('renvoie null sans taux exploitable', () => {
    expect(toXof(100, 'EUR', null)).toBeNull();
    expect(toXof(100, 'EUR', 0)).toBeNull();
    expect(toXof(100, 'EUR', -2)).toBeNull();
    expect(toXof(100, 'EUR', Number.NaN)).toBeNull();
  });
});

describe('computeNetWorth - scénarios d’acceptation', () => {
  it('additionne immeuble, véhicule et mobile money : 86 400 000 XOF', () => {
    const result = computeNetWorth(scenarioAssets(), [], AS_OF);
    expect(result.currency).toBe('XOF');
    expect(result.asOf).toBe(AS_OF);
    expect(result.totalAssets).toBe(86_400_000);
    expect(result.totalDebts).toBe(0);
    expect(result.netWorth).toBe(86_400_000);
    expect(result.assets).toHaveLength(3);
    expect(result.excluded).toEqual([]);
  });

  it('soustrait un prêt de 20 000 000 : valeur nette 66 400 000', () => {
    const result = computeNetWorth(
      scenarioAssets(),
      [loan({ assetId: 'immeuble', remainingCapital: 20_000_000 })],
      AS_OF
    );
    expect(result.totalDebts).toBe(20_000_000);
    expect(result.netWorth).toBe(66_400_000);
  });

  it('ne compte que la valorisation la plus récente', () => {
    const a = asset({
      id: 'v',
      valuations: [
        { valuatedAt: new Date('2025-01-01T00:00:00Z'), estimatedValue: 5_000_000, currency: 'XOF' },
        { valuatedAt: new Date('2026-05-01T00:00:00Z'), estimatedValue: 7_000_000, currency: 'XOF' },
        { valuatedAt: new Date('2024-01-01T00:00:00Z'), estimatedValue: 4_000_000, currency: 'XOF' }
      ]
    });
    const result = computeNetWorth([a], [], AS_OF);
    expect(result.totalAssets).toBe(7_000_000);
    expect(result.assets[0]).toEqual({
      id: 'v',
      valueXof: 7_000_000,
      valuatedAt: new Date('2026-05-01T00:00:00Z'),
      reliability: null,
      stale: false
    });
  });

  it('exclut et signale un actif sans valorisation', () => {
    const result = computeNetWorth([asset({ id: 'sans' }), asset({ id: 'avec', value: 1_000 })], [], AS_OF);
    expect(result.totalAssets).toBe(1_000);
    expect(result.excluded).toEqual([{ assetId: 'sans', reason: 'NO_VALUATION' }]);
  });
});

describe('computeNetWorth - devises', () => {
  const eur = { valuatedAt: new Date('2026-01-01T00:00:00Z'), estimatedValue: 1_000, currency: 'EUR' };

  it('convertit une devise étrangère avec le taux de l’actif et arrondit au franc', () => {
    const a = asset({ currency: 'EUR', exchangeRateToXof: 655.957, valuations: [eur] });
    const result = computeNetWorth([a], [], AS_OF);
    expect(result.totalAssets).toBe(655_957);
    expect(result.assets[0].valueXof).toBe(655_957);
  });

  it('exclut un actif en devise étrangère sans taux', () => {
    const a = asset({ id: 'usd', currency: 'EUR', exchangeRateToXof: null, valuations: [eur] });
    const result = computeNetWorth([a], [], AS_OF);
    expect(result.totalAssets).toBe(0);
    expect(result.excluded).toEqual([{ assetId: 'usd', reason: 'MISSING_EXCHANGE_RATE' }]);
  });

  it('convertit un prêt en devise étrangère et exclut celui sans taux', () => {
    const result = computeNetWorth(
      [],
      [
        loan({ id: 'ok', currency: 'EUR', exchangeRateToXof: 656, remainingCapital: 1_000 }),
        loan({ id: 'ko', currency: 'EUR', exchangeRateToXof: null, remainingCapital: 5_000 })
      ],
      AS_OF
    );
    expect(result.totalDebts).toBe(656_000);
    expect(result.excludedLoans).toEqual([{ loanId: 'ko', reason: 'MISSING_EXCHANGE_RATE' }]);
  });
});

describe('computeNetWorth - statuts', () => {
  it('exclut un actif archivé', () => {
    const result = computeNetWorth([asset({ id: 'x', status: 'ARCHIVED', value: 100 })], [], AS_OF);
    expect(result.totalAssets).toBe(0);
    expect(result.excluded).toEqual([{ assetId: 'x', reason: 'ARCHIVED' }]);
  });

  it('exclut un actif cédé avant la date de calcul', () => {
    const cede = asset({ id: 'x', status: 'DISPOSED', disposedAt: new Date('2026-03-01T00:00:00Z'), value: 100 });
    const result = computeNetWorth([cede], [], AS_OF);
    expect(result.totalAssets).toBe(0);
    expect(result.excluded).toEqual([{ assetId: 'x', reason: 'DISPOSED' }]);
  });

  it('compte un actif cédé après la date de calcul', () => {
    const cede = asset({ id: 'x', status: 'DISPOSED', disposedAt: new Date('2026-12-01T00:00:00Z'), value: 100 });
    const result = computeNetWorth([cede], [], AS_OF);
    expect(result.totalAssets).toBe(100);
    expect(result.excluded).toEqual([]);
  });

  it('exclut un actif cédé sans date de sortie connue', () => {
    const result = computeNetWorth([asset({ id: 'x', status: 'DISPOSED', value: 100 })], [], AS_OF);
    expect(result.excluded).toEqual([{ assetId: 'x', reason: 'DISPOSED' }]);
  });

  it('ignore les prêts clôturés ou en défaut', () => {
    const result = computeNetWorth(
      [],
      [
        loan({ id: 'c', status: 'CLOSED' }),
        loan({ id: 'd', status: 'DEFAULTED' }),
        loan({ id: 'a', remainingCapital: 500 })
      ],
      AS_OF
    );
    expect(result.totalDebts).toBe(500);
  });
});

describe('computeNetWorth - dettes', () => {
  it('soustrait une dette non adossée (assetId nul)', () => {
    const result = computeNetWorth(
      [asset({ value: 10_000_000 })],
      [loan({ assetId: null, remainingCapital: 4_000_000 })],
      AS_OF
    );
    expect(result.netWorth).toBe(6_000_000);
  });

  it('garde la dette d’un actif exclu : la dette existe toujours', () => {
    const sans = asset({ id: 'sans' });
    const result = computeNetWorth([sans], [loan({ assetId: 'sans', remainingCapital: 3_000_000 })], AS_OF);
    expect(result.excluded).toEqual([{ assetId: 'sans', reason: 'NO_VALUATION' }]);
    expect(result.totalDebts).toBe(3_000_000);
    expect(result.netWorth).toBe(-3_000_000);
  });

  it('laisse la valeur nette négative sans la tronquer à zéro', () => {
    const result = computeNetWorth([asset({ value: 1_000_000 })], [loan({ remainingCapital: 5_000_000 })], AS_OF);
    expect(result.totalAssets).toBe(1_000_000);
    expect(result.netWorth).toBe(-4_000_000);
  });
});

describe('computeNetWorth - répartition par classe', () => {
  it('trie par valeur décroissante, ne liste que les classes présentes et somme les parts à ~100', () => {
    const assets = [
      asset({ id: '1', assetClass: 'CASH', value: 1_000_000 }),
      asset({ id: '2', assetClass: 'REAL_ESTATE', value: 5_000_000 }),
      asset({ id: '3', assetClass: 'CASH', value: 1_000_000 }),
      asset({ id: '4', assetClass: 'VEHICLE_EQUIPMENT', value: 3_000_000 })
    ];
    const { byClass } = computeNetWorth(assets, [], AS_OF);

    expect(byClass.map(entry => entry.assetClass)).toEqual(['REAL_ESTATE', 'VEHICLE_EQUIPMENT', 'CASH']);
    expect(byClass.find(entry => entry.assetClass === 'CASH')).toEqual({
      assetClass: 'CASH',
      value: 2_000_000,
      count: 2,
      share: 20
    });
    const totalShare = byClass.reduce((sum, entry) => sum + entry.share, 0);
    expect(totalShare).toBeGreaterThan(99.9);
    expect(totalShare).toBeLessThan(100.1);
  });

  it('arrondit les parts à deux décimales : trois tiers donnent 33,33 % chacun', () => {
    const assets = (['CASH', 'OTHER', 'MOVABLE'] as const).map(assetClass =>
      asset({ id: assetClass, assetClass, value: 1_000_000 })
    );
    const { byClass } = computeNetWorth(assets, [], AS_OF);
    expect(byClass.map(entry => entry.share)).toEqual([33.33, 33.33, 33.33]);
  });

  it('ne compte pas les actifs exclus dans la répartition', () => {
    const { byClass } = computeNetWorth([asset({ id: 'sans', assetClass: 'OTHER' })], [], AS_OF);
    expect(byClass).toEqual([]);
  });

  it('donne une part nulle quand le total est nul', () => {
    const { byClass } = computeNetWorth([asset({ value: 0 })], [], AS_OF);
    expect(byClass).toEqual([{ assetClass: 'REAL_ESTATE', value: 0, count: 1, share: 0 }]);
  });
});

describe('computeNetWorthHistory', () => {
  const assets: NetWorthAssetInput[] = [
    asset({
      id: 'immeuble',
      valuations: [
        { valuatedAt: new Date('2026-06-01T00:00:00Z'), estimatedValue: 90_000_000, currency: 'XOF' },
        { valuatedAt: new Date('2025-01-01T00:00:00Z'), estimatedValue: 70_000_000, currency: 'XOF' },
        { valuatedAt: new Date('2026-01-01T00:00:00Z'), estimatedValue: 80_000_000, currency: 'XOF' }
      ]
    }),
    asset({
      id: 'compte',
      assetClass: 'CASH',
      valuations: [{ valuatedAt: new Date('2025-09-01T00:00:00Z'), estimatedValue: 1_000_000, currency: 'XOF' }]
    })
  ];
  const loans = [loan({ remainingCapital: 20_000_000 })];

  it('produit un point par date, trié, avec la dernière valeur connue à chaque date', () => {
    const dates = [
      new Date('2026-09-01T00:00:00Z'),
      new Date('2025-06-01T00:00:00Z'),
      new Date('2026-02-01T00:00:00Z')
    ];
    const history = computeNetWorthHistory(assets, loans, dates);

    expect(history.map(point => point.date.toISOString().slice(0, 10))).toEqual([
      '2025-06-01',
      '2026-02-01',
      '2026-09-01'
    ]);
    expect(history.map(point => point.totalAssets)).toEqual([70_000_000, 81_000_000, 91_000_000]);
    expect(history.map(point => point.netWorth)).toEqual([50_000_000, 61_000_000, 71_000_000]);
  });

  it('utilise le capital restant dû actuel à chaque date (pas d’amortissement reconstitué)', () => {
    const history = computeNetWorthHistory(assets, loans, [
      new Date('2025-06-01T00:00:00Z'),
      new Date('2026-09-01T00:00:00Z')
    ]);
    expect(history.every(point => point.totalDebts === 20_000_000)).toBe(true);
  });

  it('ne modifie pas le tableau de dates reçu', () => {
    const dates = [new Date('2026-09-01T00:00:00Z'), new Date('2025-06-01T00:00:00Z')];
    computeNetWorthHistory(assets, loans, dates);
    expect(dates[0].toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('renvoie une liste vide sans date', () => {
    expect(computeNetWorthHistory(assets, loans, [])).toEqual([]);
  });
});

describe('parseAssetDetails - détails valides par classe', () => {
  const currentYear = new Date().getFullYear();
  const valid: Record<AssetClassKey, unknown> = {
    REAL_ESTATE: {},
    BUSINESS_EQUITY: {
      companyName: 'Société Alpha',
      legalForm: 'SARL',
      country: 'CI',
      ownershipPercent: 40,
      sector: 'Commerce'
    },
    INVENTORY: { designation: 'Ciment', quantity: 250, unit: 'sac', unitCost: 5_500 },
    VEHICLE_EQUIPMENT: {
      kind: 'Voiture',
      brand: 'Toyota',
      model: 'Hilux',
      year: currentYear,
      registration: 'AB-123-CD'
    },
    CASH: { institution: 'Orange Money', cashKind: 'MOBILE_MONEY', accountLast4: '1234' },
    SAVINGS_INVESTMENT: { savingsKind: 'TONTINE', organization: 'Tontine du quartier', expectedRatePercent: 6.5 },
    RECEIVABLE: { debtor: 'M. Diallo', dueDate: '2026-12-31', ratePercent: 5 },
    AGRICULTURE: { agricultureKind: 'PLANTATION', crop: 'Cacao', areaHectares: 12.5 },
    MOVABLE: { designation: 'Tableau', category: 'Art' },
    OTHER: { label: 'Droit d’usage' }
  };

  it.each(ASSET_CLASSES)('accepte un détail valide pour %s', assetClass => {
    const result = parseAssetDetails(assetClass, valid[assetClass]);
    expect(result).toEqual({ success: true, data: valid[assetClass] });
  });

  it('accepte les champs facultatifs absents', () => {
    expect(parseAssetDetails('VEHICLE_EQUIPMENT', { kind: 'Tracteur' }).success).toBe(true);
    expect(parseAssetDetails('CASH', { institution: 'Banque X', cashKind: 'BANK' }).success).toBe(true);
    expect(parseAssetDetails('AGRICULTURE', { agricultureKind: 'LIVESTOCK', headcount: 40 }).success).toBe(true);
  });
});

describe('parseAssetDetails - détails invalides', () => {
  function issuesOf(assetClass: string, details: unknown) {
    const result = parseAssetDetails(assetClass, details);
    if (result.success) throw new Error('Une erreur de validation était attendue');
    return result.issues;
  }

  it.each(ASSET_CLASSES)('refuse un champ inconnu pour %s et le désigne par son nom', assetClass => {
    // Base valide par classe, pour que le champ inconnu soit la seule erreur.
    const seed: Record<string, unknown> = {
      BUSINESS_EQUITY: { companyName: 'A', legalForm: 'SA', country: 'CI', ownershipPercent: 10 },
      INVENTORY: { designation: 'A', quantity: 1, unit: 'kg', unitCost: 1 },
      VEHICLE_EQUIPMENT: { kind: 'Voiture' },
      CASH: { institution: 'B', cashKind: 'BANK' },
      SAVINGS_INVESTMENT: { savingsKind: 'PLACEMENT' },
      RECEIVABLE: { debtor: 'D' },
      AGRICULTURE: { agricultureKind: 'HARVEST' },
      MOVABLE: { designation: 'M' },
      OTHER: { label: 'L' }
    };
    const issues = issuesOf(assetClass, { ...(seed[assetClass] as object | undefined), intrus: 'x' });
    expect(issues).toEqual([{ path: 'intrus', message: expect.stringContaining('inconnu') }]);
  });

  it('refuse un pourcentage de détention supérieur à 100', () => {
    const issues = issuesOf('BUSINESS_EQUITY', {
      companyName: 'A',
      legalForm: 'SARL',
      country: 'CI',
      ownershipPercent: 101
    });
    expect(issues).toEqual([{ path: 'ownershipPercent', message: expect.stringContaining('100') }]);
  });

  it('refuse un pourcentage négatif et une forme juridique inconnue', () => {
    const issues = issuesOf('BUSINESS_EQUITY', {
      companyName: 'A',
      legalForm: 'XYZ',
      country: 'CI',
      ownershipPercent: -1
    });
    expect(issues.map(issue => issue.path).sort()).toEqual(['legalForm', 'ownershipPercent']);
  });

  it('refuse des quatre derniers chiffres de plus de quatre chiffres (jamais un numéro complet)', () => {
    const issues = issuesOf('CASH', { institution: 'Banque X', cashKind: 'BANK', accountLast4: '12345' });
    expect(issues).toEqual([{ path: 'accountLast4', message: 'Format invalide' }]);
    expect(parseAssetDetails('CASH', { institution: 'B', cashKind: 'BANK', accountLast4: '123' }).success).toBe(false);
    expect(parseAssetDetails('CASH', { institution: 'B', cashKind: 'BANK', accountLast4: '12a4' }).success).toBe(false);
  });

  it('refuse un champ obligatoire absent avec un message en français', () => {
    const issues = issuesOf('OTHER', {});
    expect(issues).toEqual([{ path: 'label', message: 'Champ obligatoire' }]);
  });

  it('refuse une quantité ou un coût unitaire négatif', () => {
    const issues = issuesOf('INVENTORY', { designation: 'A', quantity: -1, unit: 'kg', unitCost: -5 });
    expect(issues.map(issue => issue.path).sort()).toEqual(['quantity', 'unitCost']);
  });

  it('refuse une année de véhicule hors bornes', () => {
    expect(parseAssetDetails('VEHICLE_EQUIPMENT', { kind: 'V', year: 1949 }).success).toBe(false);
    expect(parseAssetDetails('VEHICLE_EQUIPMENT', { kind: 'V', year: new Date().getFullYear() + 2 }).success).toBe(
      false
    );
    expect(parseAssetDetails('VEHICLE_EQUIPMENT', { kind: 'V', year: new Date().getFullYear() + 1 }).success).toBe(
      true
    );
    expect(parseAssetDetails('VEHICLE_EQUIPMENT', { kind: 'V', year: 2020.5 }).success).toBe(false);
  });

  it('refuse un type de compte ou d’épargne inconnu', () => {
    expect(parseAssetDetails('CASH', { institution: 'B', cashKind: 'CRYPTO' }).success).toBe(false);
    expect(parseAssetDetails('SAVINGS_INVESTMENT', { savingsKind: 'BOURSE' }).success).toBe(false);
  });

  it('refuse un taux hors 0 à 100 et une échéance non ISO', () => {
    expect(
      parseAssetDetails('SAVINGS_INVESTMENT', { savingsKind: 'PLACEMENT', expectedRatePercent: 101 }).success
    ).toBe(false);
    expect(parseAssetDetails('RECEIVABLE', { debtor: 'D', ratePercent: -1 }).success).toBe(false);
    expect(parseAssetDetails('RECEIVABLE', { debtor: 'D', dueDate: '31/12/2026' }).success).toBe(false);
    expect(parseAssetDetails('RECEIVABLE', { debtor: 'D', dueDate: 'demain' }).success).toBe(false);
    expect(parseAssetDetails('RECEIVABLE', { debtor: 'D', dueDate: '2026-12-31T10:00:00Z' }).success).toBe(true);
  });

  it('refuse une surface négative et un effectif non entier', () => {
    expect(parseAssetDetails('AGRICULTURE', { agricultureKind: 'PLANTATION', areaHectares: -1 }).success).toBe(false);
    expect(parseAssetDetails('AGRICULTURE', { agricultureKind: 'LIVESTOCK', headcount: 2.5 }).success).toBe(false);
    expect(parseAssetDetails('AGRICULTURE', { agricultureKind: 'LIVESTOCK', headcount: -3 }).success).toBe(false);
  });

  it('refuse un texte vide pour un champ obligatoire', () => {
    const issues = issuesOf('MOVABLE', { designation: '   ' });
    expect(issues).toEqual([{ path: 'designation', message: 'Le champ ne peut pas être vide' }]);
  });

  it('refuse un détail qui n’est pas un objet', () => {
    expect(parseAssetDetails('OTHER', null).success).toBe(false);
    expect(parseAssetDetails('OTHER', 'texte').success).toBe(false);
  });

  it('signale une classe inconnue sans lever d’exception', () => {
    expect(parseAssetDetails('BATEAU', {})).toEqual({
      success: false,
      issues: [{ path: 'assetClass', message: "Classe d'actif inconnue" }]
    });
  });
});

describe('détails de classe, version 2 (lot 2)', () => {
  it('garde valides les détails de la version 1', () => {
    expect(parseAssetDetails('REAL_ESTATE', {}).success).toBe(true);
    expect(parseAssetDetails('VEHICLE_EQUIPMENT', { kind: 'Camion' }).success).toBe(true);
    expect(parseAssetDetails('RECEIVABLE', { debtor: 'Awa' }).success).toBe(true);
  });

  it('accepte les champs de valorisation facultatifs', () => {
    expect(parseAssetDetails('REAL_ESTATE', { legalStatus: 'ACD' }).success).toBe(true);
    expect(
      parseAssetDetails('VEHICLE_EQUIPMENT', {
        kind: 'Camion',
        usefulLifeYears: 7.5,
        residualValuePercent: 10,
        depreciationMethod: 'DECLINING',
        decliningRatePercent: 20
      }).success
    ).toBe(true);
    expect(
      parseAssetDetails('BUSINESS_EQUITY', {
        companyName: 'X',
        legalForm: 'SARL',
        country: 'CI',
        ownershipPercent: 30,
        netIncome: 10,
        earningsMultiple: 5
      }).success
    ).toBe(true);
    expect(
      parseAssetDetails('INVENTORY', { designation: 'a', quantity: 1, unit: 'u', unitCost: 1, writeDownPercent: 10 })
        .success
    ).toBe(true);
    expect(parseAssetDetails('RECEIVABLE', { debtor: 'A', principal: 100, collectibilityPercent: 75 }).success).toBe(
      true
    );
    expect(parseAssetDetails('AGRICULTURE', { agricultureKind: 'LIVESTOCK', unitValue: 50000 }).success).toBe(true);
    expect(parseAssetDetails('SAVINGS_INVESTMENT', { savingsKind: 'PLACEMENT', principal: 5_000_000 }).success).toBe(
      true
    );
  });

  it('refuse les valeurs hors bornes', () => {
    expect(parseAssetDetails('REAL_ESTATE', { legalStatus: 'INCONNU' }).success).toBe(false);
    expect(parseAssetDetails('VEHICLE_EQUIPMENT', { kind: 'a', usefulLifeYears: 0.5 }).success).toBe(false);
    expect(parseAssetDetails('VEHICLE_EQUIPMENT', { kind: 'a', usefulLifeYears: 51 }).success).toBe(false);
    expect(parseAssetDetails('VEHICLE_EQUIPMENT', { kind: 'a', residualValuePercent: 101 }).success).toBe(false);
    expect(parseAssetDetails('VEHICLE_EQUIPMENT', { kind: 'a', depreciationMethod: 'X' }).success).toBe(false);
    expect(
      parseAssetDetails('BUSINESS_EQUITY', {
        companyName: 'X',
        legalForm: 'SARL',
        country: 'CI',
        ownershipPercent: 30,
        earningsMultiple: 0
      }).success
    ).toBe(false);
    expect(parseAssetDetails('RECEIVABLE', { debtor: 'A', principal: -1 }).success).toBe(false);
    expect(parseAssetDetails('RECEIVABLE', { debtor: 'A', principal: 1_000_000_000_000 }).success).toBe(false);
    expect(parseAssetDetails('AGRICULTURE', { agricultureKind: 'HARVEST', unitValue: -1 }).success).toBe(false);
  });

  it('reste strict : un champ étranger à la classe est refusé', () => {
    expect(parseAssetDetails('REAL_ESTATE', { usefulLifeYears: 5 }).success).toBe(false);
  });
});

describe('valeur nette et fiabilité (lot 2)', () => {
  const valued = (id: string, value: number, reliability?: 'HIGH' | 'MEDIUM' | 'LOW' | null) =>
    asset({
      id,
      valuations: [
        { valuatedAt: new Date('2026-09-01T00:00:00Z'), estimatedValue: value, currency: 'XOF', reliability }
      ]
    });

  it('calcule la part de valeur LOW ou sans fiabilité', () => {
    const result = computeNetWorth(
      [valued('a', 600, 'HIGH'), valued('b', 300, 'LOW'), valued('c', 100, null), valued('d', 0, undefined)],
      [],
      AS_OF
    );
    expect(result.lowReliabilityShare).toBe(40);
    expect(result.assets.find(a => a.id === 'b')?.reliability).toBe('LOW');
    expect(result.assets.find(a => a.id === 'a')?.reliability).toBe('HIGH');
  });

  it('arrondit la part à deux décimales et vaut 0 sans actif', () => {
    const result = computeNetWorth([valued('a', 2, 'HIGH'), valued('b', 1, 'LOW')], [], AS_OF);
    expect(result.lowReliabilityShare).toBe(33.33);
    expect(computeNetWorth([], [], AS_OF).lowReliabilityShare).toBe(0);
  });

  it('marque périmé un compte valorisé il y a 4 mois, pas un terrain', () => {
    const old = [{ valuatedAt: new Date('2026-05-29T00:00:00Z'), estimatedValue: 10, currency: 'XOF' }];
    const result = computeNetWorth(
      [asset({ id: 'cash', assetClass: 'CASH', valuations: old }), asset({ id: 'land', valuations: old })],
      [],
      AS_OF
    );
    expect(result.assets.find(a => a.id === 'cash')?.stale).toBe(true);
    expect(result.assets.find(a => a.id === 'land')?.stale).toBe(false);
  });
});
