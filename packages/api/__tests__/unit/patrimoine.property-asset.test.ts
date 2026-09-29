/**
 * `ensurePropertyAsset` (lot 1 multi-actifs) : création à la volée, idempotence,
 * étanchéité entre agences, course sur P2002. Prisma est remplacé par un
 * magasin en mémoire.
 */
import { Prisma } from '@prisma/client';
import { ensurePropertyAsset, type PropertyAssetClient } from '../../src/lib/patrimoine/property-asset';

type Row = Record<string, any>;

function makeClient(properties: Row[], assets: Row[] = []) {
  const client = {
    property: {
      findFirst: jest.fn(
        async ({ where }: Row) => properties.find(p => p.id === where.id && p.tenantId === where.tenantId) ?? null
      )
    },
    asset: {
      findUnique: jest.fn(async ({ where }: Row) => assets.find(a => a.propertyId === where.propertyId) ?? null),
      upsert: jest.fn(async ({ where, create }: Row) => {
        const found = assets.find(a => a.propertyId === where.propertyId);
        if (found) return found;
        const row = { id: `asset-${assets.length + 1}`, ...create };
        assets.push(row);
        return row;
      })
    }
  };
  return { client: client as unknown as PropertyAssetClient, mocks: client, assets };
}

const PROP = { id: 'prop-1', tenantId: 'tenant-a', internalReference: 'REF-001', title: 'Villa' };

describe('ensurePropertyAsset', () => {
  it('crée un actif REAL_ESTATE nommé par la référence interne', async () => {
    const { client, assets } = makeClient([PROP]);
    const result = await ensurePropertyAsset(client, 'tenant-a', 'prop-1');
    expect(result?.id).toBe('asset-1');
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      tenantId: 'tenant-a',
      propertyId: 'prop-1',
      name: 'REF-001',
      assetClass: 'REAL_ESTATE',
      status: 'ACTIVE',
      currency: 'XOF',
      details: {},
      detailsVersion: 1
    });
  });

  it('est idempotente : deux appels, un seul actif', async () => {
    const { client, assets, mocks } = makeClient([PROP]);
    const first = await ensurePropertyAsset(client, 'tenant-a', 'prop-1');
    const second = await ensurePropertyAsset(client, 'tenant-a', 'prop-1');
    expect(second?.id).toBe(first?.id);
    expect(assets).toHaveLength(1);
    expect(mocks.asset.upsert).toHaveBeenCalledTimes(1);
  });

  it("ne crée rien pour un bien d'une autre agence", async () => {
    const { client, assets } = makeClient([PROP]);
    expect(await ensurePropertyAsset(client, 'tenant-b', 'prop-1')).toBeNull();
    expect(assets).toHaveLength(0);
  });

  it('ne crée rien sans agence ou pour un bien inconnu', async () => {
    const { client, assets } = makeClient([PROP]);
    expect(await ensurePropertyAsset(client, null, 'prop-1')).toBeNull();
    expect(await ensurePropertyAsset(client, 'tenant-a', 'inconnu')).toBeNull();
    expect(assets).toHaveLength(0);
  });

  it('relit l’actif du concurrent sur P2002 au lieu d’échouer', async () => {
    const { client, assets, mocks } = makeClient([PROP]);
    mocks.asset.upsert.mockImplementationOnce(async () => {
      assets.push({ id: 'asset-concurrent', propertyId: 'prop-1', tenantId: 'tenant-a' });
      throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' });
    });
    expect((await ensurePropertyAsset(client, 'tenant-a', 'prop-1'))?.id).toBe('asset-concurrent');
    expect(assets).toHaveLength(1);
  });

  it('propage une autre erreur', async () => {
    const { client, mocks } = makeClient([PROP]);
    mocks.asset.upsert.mockRejectedValueOnce(new Error('boom'));
    await expect(ensurePropertyAsset(client, 'tenant-a', 'prop-1')).rejects.toThrow('boom');
  });
});
