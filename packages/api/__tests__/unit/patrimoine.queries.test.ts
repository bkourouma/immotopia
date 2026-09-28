/**
 * `lib/patrimoine/queries.ts` — corrections lot P0 (rendements et
 * programmes de travaux). Mock a la frontiere `utils/database`, comme
 * l'exige `.claude/rules/testing.md` pour un test de service.
 */

const propertyFindFirst = jest.fn();
const propertyFindMany = jest.fn();
const rentalLeaseFindMany = jest.fn();
const assetValuationFindMany = jest.fn();
const assetValuationFindFirst = jest.fn();
const propertyExpenseFindMany = jest.fn();
const propertyLoanFindMany = jest.fn();
const workProgramFindFirst = jest.fn();
const workProgramUpdate = jest.fn();
const workProgramFindMany = jest.fn();
const workProgramCount = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    property: {
      findFirst: (...a: any[]) => propertyFindFirst(...a),
      findMany: (...a: any[]) => propertyFindMany(...a)
    },
    rentalLease: { findMany: (...a: any[]) => rentalLeaseFindMany(...a) },
    assetValuation: {
      findMany: (...a: any[]) => assetValuationFindMany(...a),
      findFirst: (...a: any[]) => assetValuationFindFirst(...a)
    },
    propertyExpense: { findMany: (...a: any[]) => propertyExpenseFindMany(...a) },
    propertyLoan: { findMany: (...a: any[]) => propertyLoanFindMany(...a) },
    workProgram: {
      findFirst: (...a: any[]) => workProgramFindFirst(...a),
      update: (...a: any[]) => workProgramUpdate(...a),
      findMany: (...a: any[]) => workProgramFindMany(...a),
      count: (...a: any[]) => workProgramCount(...a)
    }
  }
}));

import {
  buildPropertyYieldInput,
  getPatrimoineOverview,
  listTenantWorkPrograms,
  updatePropertyWorkProgram
} from '../../src/lib/patrimoine/queries';

const TENANT = 'tenant-1';
const PROPERTY = 'prop-1';

beforeEach(() => {
  jest.clearAllMocks();
  propertyFindFirst.mockResolvedValue({ id: PROPERTY, tenantId: TENANT });
});

describe('buildPropertyYieldInput', () => {
  it('somme TOUS les baux ACTIVE du bien, annualises selon leur propre periodicite', async () => {
    rentalLeaseFindMany.mockResolvedValue([
      { rent_amount: 100_000, billing_frequency: 'MONTHLY' }, // -> 1 200 000 / an
      { rent_amount: 300_000, billing_frequency: 'QUARTERLY' } // -> 1 200 000 / an
    ]);
    assetValuationFindMany.mockResolvedValue([]);
    assetValuationFindFirst.mockResolvedValue(null);
    propertyExpenseFindMany.mockResolvedValue([]);
    propertyLoanFindMany.mockResolvedValue([]);

    const input = await buildPropertyYieldInput(TENANT, PROPERTY);
    expect(input.annualRent).toBe(2_400_000);
  });

  it("retient le cout d'acquisition de la valorisation la plus recente qui en porte un, pas simplement la derniere", async () => {
    rentalLeaseFindMany.mockResolvedValue([]);
    assetValuationFindMany.mockResolvedValue([
      { valuatedAt: new Date('2024-01-01'), acquisitionCost: 50_000_000 },
      // La plus recente n'a pas de cout d'acquisition (reevaluation de marche) :
      // elle ne doit pas faire disparaitre le cout connu de janvier 2024.
      { valuatedAt: new Date('2025-06-01'), acquisitionCost: null }
    ]);
    assetValuationFindFirst.mockResolvedValue({ estimatedValue: 90_000_000 });
    propertyExpenseFindMany.mockResolvedValue([]);
    propertyLoanFindMany.mockResolvedValue([]);

    const input = await buildPropertyYieldInput(TENANT, PROPERTY);
    expect(input.costBasis).toBe(50_000_000);
    expect(input.currentValue).toBe(90_000_000);
  });

  it("costBasis = 0 quand aucune valorisation ne porte de cout d'acquisition et aucune depense capitalisee", async () => {
    rentalLeaseFindMany.mockResolvedValue([]);
    assetValuationFindMany.mockResolvedValue([{ valuatedAt: new Date('2025-01-01'), acquisitionCost: null }]);
    assetValuationFindFirst.mockResolvedValue({ estimatedValue: 10_000_000 });
    propertyExpenseFindMany.mockResolvedValue([]);
    propertyLoanFindMany.mockResolvedValue([]);

    const input = await buildPropertyYieldInput(TENANT, PROPERTY);
    expect(input.costBasis).toBe(0);
  });

  it("additionne le cout d'acquisition et TOUTES les depenses capitalisees (peu importe leur date)", async () => {
    rentalLeaseFindMany.mockResolvedValue([]);
    assetValuationFindMany.mockResolvedValue([{ valuatedAt: new Date('2020-01-01'), acquisitionCost: 40_000_000 }]);
    assetValuationFindFirst.mockResolvedValue({ estimatedValue: 60_000_000 });
    propertyExpenseFindMany.mockResolvedValue([
      { amount: 5_000_000, isCapitalized: true, paidAt: new Date('2015-01-01') }, // tres ancienne, comptee quand meme
      { amount: 2_000_000, isCapitalized: true, paidAt: new Date('2025-01-01') },
      { amount: 300_000, isCapitalized: false, paidAt: new Date('2025-06-01') } // charge courante, hors costBasis
    ]);
    propertyLoanFindMany.mockResolvedValue([]);

    const input = await buildPropertyYieldInput(TENANT, PROPERTY);
    expect(input.costBasis).toBe(40_000_000 + 5_000_000 + 2_000_000);
  });

  it('ne compte, dans les charges annuelles, que les depenses NON capitalisees des 12 derniers mois glissants', async () => {
    const now = new Date();
    const thirteenMonthsAgo = new Date(now);
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    rentalLeaseFindMany.mockResolvedValue([]);
    assetValuationFindMany.mockResolvedValue([]);
    assetValuationFindFirst.mockResolvedValue(null);
    propertyExpenseFindMany.mockResolvedValue([
      { amount: 1_000_000, isCapitalized: false, paidAt: sixMonthsAgo }, // dans la fenetre
      { amount: 9_000_000, isCapitalized: false, paidAt: thirteenMonthsAgo }, // hors fenetre
      { amount: 500_000, isCapitalized: true, paidAt: sixMonthsAgo } // capitalisee, exclue des charges
    ]);
    propertyLoanFindMany.mockResolvedValue([]);

    const input = await buildPropertyYieldInput(TENANT, PROPERTY);
    expect(input.annualExpenses).toBe(1_000_000);
  });

  it("n'impute plus les mensualites d'un pret dont l'echeance est deja passee", async () => {
    rentalLeaseFindMany.mockResolvedValue([]);
    assetValuationFindMany.mockResolvedValue([]);
    assetValuationFindFirst.mockResolvedValue(null);
    propertyExpenseFindMany.mockResolvedValue([]);
    const now = new Date();
    const pastEnd = new Date(now);
    pastEnd.setMonth(pastEnd.getMonth() - 1);
    propertyLoanFindMany.mockResolvedValue([{ monthlyPayment: 200_000, remainingCapital: 0, endDate: pastEnd }]);

    const input = await buildPropertyYieldInput(TENANT, PROPERTY);
    expect(input.annualLoanPayments).toBe(0);
  });
});

describe('getPatrimoineOverview — occupation bornee a 100 %', () => {
  it('totalProperties et occupiedProperties partagent le meme ensemble (hors brouillon/vendu/archive)', async () => {
    propertyFindMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]); // deja filtre par le where du mock
    assetValuationFindMany.mockResolvedValue([]);
    propertyLoanFindMany.mockResolvedValue([]);
    propertyExpenseFindMany.mockResolvedValue([]);
    rentalLeaseFindMany.mockResolvedValue([
      { property_id: 'p1', rent_amount: 100_000, billing_frequency: 'MONTHLY' },
      // Bail actif sur un bien hors de l'ensemble (brouillon/vendu/archive,
      // deja exclu par le `where` Prisma reel) : ne doit pas gonfler le
      // numerateur au-dela du denominateur.
      { property_id: 'p-excluded', rent_amount: 100_000, billing_frequency: 'MONTHLY' }
    ]);

    const overview = await getPatrimoineOverview(TENANT);
    expect(overview.totalProperties).toBe(2);
    expect(overview.occupiedProperties).toBe(1);
    expect(overview.occupancyRate).toBeLessThanOrEqual(1);
  });

  it('annualise le loyer total selon la periodicite de chaque bail (totalAnnualRent)', async () => {
    propertyFindMany.mockResolvedValue([{ id: 'p1' }]);
    assetValuationFindMany.mockResolvedValue([]);
    propertyLoanFindMany.mockResolvedValue([]);
    propertyExpenseFindMany.mockResolvedValue([]);
    rentalLeaseFindMany.mockResolvedValue([
      { property_id: 'p1', rent_amount: 300_000, billing_frequency: 'QUARTERLY' }
    ]);

    const overview = await getPatrimoineOverview(TENANT);
    expect(overview.totalAnnualRent).toBe(1_200_000);
  });
});

describe("updatePropertyWorkProgram — 409 seulement si actualCost recu DIFFERE de l'existant", () => {
  it('refuse une saisie manuelle qui changerait le cout derive du chantier', async () => {
    workProgramFindFirst.mockResolvedValue({ id: 'wp-1', constructionSiteId: 'site-1', actualCost: 1_000_000 as any });

    await expect(updatePropertyWorkProgram(TENANT, PROPERTY, 'wp-1', { actualCost: 2_000_000 })).rejects.toThrow();
    expect(workProgramUpdate).not.toHaveBeenCalled();
  });

  it('accepte de renvoyer exactement la meme valeur deja derivee du chantier (pas un ecart)', async () => {
    workProgramFindFirst.mockResolvedValue({ id: 'wp-1', constructionSiteId: 'site-1', actualCost: 1_000_000 as any });
    workProgramUpdate.mockResolvedValue({ id: 'wp-1', constructionSiteId: 'site-1', site: null });

    await expect(updatePropertyWorkProgram(TENANT, PROPERTY, 'wp-1', { actualCost: 1_000_000 })).resolves.toBeTruthy();
    expect(workProgramUpdate).toHaveBeenCalledTimes(1);
  });

  it("accepte toujours la saisie manuelle quand aucun chantier n'est rattache", async () => {
    workProgramFindFirst.mockResolvedValue({ id: 'wp-2', constructionSiteId: null, actualCost: null });
    workProgramUpdate.mockResolvedValue({ id: 'wp-2', constructionSiteId: null, site: null });

    await expect(updatePropertyWorkProgram(TENANT, PROPERTY, 'wp-2', { actualCost: 500_000 })).resolves.toBeTruthy();
  });
});

describe('listTenantWorkPrograms — upcoming=true', () => {
  it('ne garde que les programmes planifies ou en cours, tries par date prevue croissante', async () => {
    workProgramFindMany.mockResolvedValue([
      { id: 'a', status: 'PLANNED', plannedDate: new Date('2026-01-01'), site: null },
      { id: 'b', status: 'IN_PROGRESS', plannedDate: new Date('2026-02-01'), site: { id: 's1', name: 'Chantier 1' } }
    ]);

    const result = await listTenantWorkPrograms(TENANT, { upcoming: true });

    expect(workProgramFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT, status: { in: ['PLANNED', 'IN_PROGRESS'] } })
      })
    );
    expect(result.items).toHaveLength(2);
    expect(result.items[1].constructionSite).toEqual({ id: 's1', name: 'Chantier 1' });
    // La pagination classique ne s'applique pas a `upcoming=true`.
    expect(workProgramCount).not.toHaveBeenCalled();
  });

  it('sans le parametre, la pagination classique reste inchangee', async () => {
    workProgramFindMany.mockResolvedValue([{ id: 'a', site: null }]);
    workProgramCount.mockResolvedValue(1);

    const result = await listTenantWorkPrograms(TENANT, {});

    expect(result.total).toBe(1);
    expect(workProgramFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 25 }));
  });
});
