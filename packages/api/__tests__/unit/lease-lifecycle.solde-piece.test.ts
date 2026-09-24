/**
 * Vie du bail — lot 5 : une échéance révisée porte ses ajustements.
 *
 * Une révision de loyer inscrit l'écart au compte du locataire sous une pièce
 * `LEASE_REVISION` nommée `<échéance>:<révision>`. Si le calcul de « ce que
 * l'échéance a inscrit » l'ignorait, une résiliation n'annulerait que l'ancien
 * montant et laisserait l'écart au compte : le locataire devrait un loyer
 * qu'on vient d'annuler.
 */

jest.mock('../../src/utils/database', () => ({ prisma: {} }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { soldePieceTx } = require('../../src/services/rental-installment-service');

describe('soldePieceTx', () => {
  it('ajoute à une échéance les ajustements de ses révisions', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ debit: 135_000, credit: null }]) // facturation d'origine
      .mockResolvedValueOnce([{ debit: 10_000, credit: null }]); // ajustement de révision
    const tx = { thirdPartyMovement: { findMany } };

    const solde = await soldePieceTx(tx, 'tenant-1', 'RENTAL_INSTALLMENT', 'inst-1');

    expect(solde).toBe(145_000);
    expect((findMany.mock.calls[0] as any)[0].where).toEqual({
      tenantId: 'tenant-1',
      sourceType: 'RENTAL_INSTALLMENT',
      sourceId: 'inst-1'
    });
    expect((findMany.mock.calls[1] as any)[0].where).toEqual({
      tenantId: 'tenant-1',
      sourceType: 'LEASE_REVISION',
      sourceId: { startsWith: 'inst-1:' }
    });
  });

  it('ne cherche pas d’ajustement de révision pour une autre nature de pièce', async () => {
    const findMany = jest.fn(async () => [{ debit: null, credit: 50_000 }]);
    const tx = { thirdPartyMovement: { findMany } };

    const solde = await soldePieceTx(tx, 'tenant-1', 'RENTAL_PAYMENT_ALLOCATION', 'alloc-1');

    expect(solde).toBe(-50_000);
    // Une seule requête, la même qu'avant le lot 5.
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
