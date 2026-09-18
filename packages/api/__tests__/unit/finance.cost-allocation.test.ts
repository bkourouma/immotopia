/**
 * Tests de `syncWorkProgramCostTx` (`lib/finance/cost-allocation.ts`).
 *
 * Aucun mock de module : la fonction ne reçoit qu'un `tx` par injection, pas
 * le client Prisma global — un magasin en mémoire glissé directement en
 * paramètre suffit, même esprit que les autres tests de caractérisation du
 * lot 2 mais sans la mécanique `jest.mock('../../src/utils/database', ...)`,
 * inutile ici.
 */

import { syncWorkProgramCostTx } from '../../src/lib/finance/cost-allocation';

type Row = Record<string, any>;

function makeTx(options: { workPrograms: Row[]; allocations: Row[] }) {
  const { workPrograms, allocations } = options;

  return {
    workProgram: {
      count: jest.fn(
        async ({ where }: Row) =>
          workPrograms.filter(p => p.tenantId === where.tenantId && p.constructionSiteId === where.constructionSiteId)
            .length
      ),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        let count = 0;
        for (const program of workPrograms) {
          if (program.tenantId === where.tenantId && program.constructionSiteId === where.constructionSiteId) {
            Object.assign(program, data);
            count += 1;
          }
        }
        return { count };
      })
    },
    costAllocation: {
      aggregate: jest.fn(async ({ where }: Row) => {
        const matching = allocations.filter(
          a =>
            a.tenantId === where.tenantId && a.siteId === where.siteId && a.validatedAt !== null && a.voidedAt === null
        );
        const sum = matching.reduce((total, a) => total + Number(a.amount), 0);
        return { _sum: { amount: matching.length ? sum : null } };
      })
    }
  } as any;
}

const TENANT_ID = 'tenant-1';
const SITE_ID = 'site-1';

describe('syncWorkProgramCostTx', () => {
  it("ne fait rien si aucun programme de travaux n'est rattaché au chantier", async () => {
    const workPrograms: Row[] = [{ id: 'wp-1', tenantId: TENANT_ID, constructionSiteId: null, actualCost: 500 }];
    const allocations: Row[] = [
      { tenantId: TENANT_ID, siteId: SITE_ID, amount: 1000, validatedAt: new Date(), voidedAt: null }
    ];
    const tx = makeTx({ workPrograms, allocations });

    await syncWorkProgramCostTx(tx, TENANT_ID, SITE_ID);

    // Le programme non rattaché garde son coût saisi à la main, intact.
    expect(workPrograms[0].actualCost).toBe(500);
    expect(tx.costAllocation.aggregate).not.toHaveBeenCalled();
    expect(tx.workProgram.updateMany).not.toHaveBeenCalled();
  });

  it('recopie la somme des imputations validées et non annulées sur le programme rattaché', async () => {
    const workPrograms: Row[] = [{ id: 'wp-1', tenantId: TENANT_ID, constructionSiteId: SITE_ID, actualCost: 12345 }];
    const allocations: Row[] = [
      { tenantId: TENANT_ID, siteId: SITE_ID, amount: 300000, validatedAt: new Date(), voidedAt: null },
      { tenantId: TENANT_ID, siteId: SITE_ID, amount: 150000, validatedAt: new Date(), voidedAt: null },
      // Non validée : ne doit pas compter.
      { tenantId: TENANT_ID, siteId: SITE_ID, amount: 999999, validatedAt: null, voidedAt: null },
      // Annulée : ne doit pas compter.
      { tenantId: TENANT_ID, siteId: SITE_ID, amount: 999999, validatedAt: new Date(), voidedAt: new Date() }
    ];
    const tx = makeTx({ workPrograms, allocations });

    await syncWorkProgramCostTx(tx, TENANT_ID, SITE_ID);

    expect(workPrograms[0].actualCost).toBe(450000);
  });

  it('remet le coût à zéro quand toutes les imputations du chantier ont été annulées', async () => {
    const workPrograms: Row[] = [{ id: 'wp-1', tenantId: TENANT_ID, constructionSiteId: SITE_ID, actualCost: 450000 }];
    const allocations: Row[] = [
      { tenantId: TENANT_ID, siteId: SITE_ID, amount: 450000, validatedAt: new Date(), voidedAt: new Date() }
    ];
    const tx = makeTx({ workPrograms, allocations });

    await syncWorkProgramCostTx(tx, TENANT_ID, SITE_ID);

    expect(workPrograms[0].actualCost).toBe(0);
  });

  it('met à jour tous les programmes rattachés au même chantier, jamais ceux des autres', async () => {
    const otherSiteId = 'site-2';
    const workPrograms: Row[] = [
      { id: 'wp-1', tenantId: TENANT_ID, constructionSiteId: SITE_ID, actualCost: 0 },
      { id: 'wp-2', tenantId: TENANT_ID, constructionSiteId: SITE_ID, actualCost: 0 },
      { id: 'wp-3', tenantId: TENANT_ID, constructionSiteId: otherSiteId, actualCost: 777 }
    ];
    const allocations: Row[] = [
      { tenantId: TENANT_ID, siteId: SITE_ID, amount: 100000, validatedAt: new Date(), voidedAt: null }
    ];
    const tx = makeTx({ workPrograms, allocations });

    await syncWorkProgramCostTx(tx, TENANT_ID, SITE_ID);

    expect(workPrograms[0].actualCost).toBe(100000);
    expect(workPrograms[1].actualCost).toBe(100000);
    // Programme rattaché à un autre chantier : jamais touché.
    expect(workPrograms[2].actualCost).toBe(777);
  });

  it("n'imagine jamais un chantier d'un autre tenant (isolation multi-tenant)", async () => {
    const otherTenantId = 'tenant-2';
    const workPrograms: Row[] = [{ id: 'wp-1', tenantId: otherTenantId, constructionSiteId: SITE_ID, actualCost: 0 }];
    const allocations: Row[] = [
      { tenantId: otherTenantId, siteId: SITE_ID, amount: 100000, validatedAt: new Date(), voidedAt: null }
    ];
    const tx = makeTx({ workPrograms, allocations });

    // Un appel pour TENANT_ID ne doit rien voir de otherTenantId, même sur le
    // même identifiant de chantier.
    await syncWorkProgramCostTx(tx, TENANT_ID, SITE_ID);

    expect(tx.workProgram.updateMany).not.toHaveBeenCalled();
    expect(workPrograms[0].actualCost).toBe(0);
  });
});
