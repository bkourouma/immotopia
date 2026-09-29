/**
 * `ensurePropertyAsset` (lot 1 multi-actifs) : création à la volée, idempotence,
 * étanchéité entre agences, course sur P2002. Prisma est remplacé par un
 * magasin en mémoire.
 */
import { Prisma } from '@prisma/client';
import {
  ensurePropertyAsset,
  storedPropertyReliability,
  type PropertyAssetClient,
  type PropertyReliabilityClient
} from '../../src/lib/patrimoine/property-asset';

type Row = Record<string, any>;

function makeClient(properties: Row[], assets: Row[] = []) {
  const client = {
    property: {
      findFirst: jest.fn(
        async ({ where }: Row) => properties.find(p => p.id === where.id && p.tenantId === where.tenantId) ?? null
      )
    },
    asset: {
      findUnique: jest.fn(
        async ({ where }: Row) =>
          assets.find(a => a.propertyId === where.propertyId && a.tenantId === where.tenantId) ?? null
      ),
      findFirst: jest.fn(async ({ where }: Row) => {
        const found = assets.find(a => a.id === where.id && a.tenantId === where.tenantId);
        return found ? { details: found.details } : null;
      }),
      upsert: jest.fn(async ({ where, create }: Row) => {
        const found = assets.find(a => a.propertyId === where.propertyId && a.tenantId === where.tenantId);
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
    // La relecture de repli est elle aussi filtrée par agence.
    expect(mocks.asset.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { propertyId: 'prop-1', tenantId: 'tenant-a' } })
    );
  });

  it('filtre par agence chaque requête sur Asset (findUnique, upsert)', async () => {
    const { client, mocks } = makeClient([PROP]);
    await ensurePropertyAsset(client, 'tenant-a', 'prop-1');
    expect(mocks.asset.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { propertyId: 'prop-1', tenantId: 'tenant-a' } })
    );
    expect(mocks.asset.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { propertyId: 'prop-1', tenantId: 'tenant-a' } })
    );
  });

  it('ne relit pas l’actif d’une autre agence pour le même bien', async () => {
    const { client, assets } = makeClient(
      [{ ...PROP, tenantId: 'tenant-b' }],
      [{ id: 'asset-b', propertyId: 'prop-1', tenantId: 'tenant-b' }]
    );
    expect(await ensurePropertyAsset(client, 'tenant-a', 'prop-1')).toBeNull();
    expect(assets).toHaveLength(1);
  });

  it('propage une autre erreur', async () => {
    const { client, mocks } = makeClient([PROP]);
    mocks.asset.upsert.mockRejectedValueOnce(new Error('boom'));
    await expect(ensurePropertyAsset(client, 'tenant-a', 'prop-1')).rejects.toThrow('boom');
  });
});

describe('storedPropertyReliability', () => {
  const line = { method: 'MANUAL' as const, valuatedAt: new Date(), source: null };

  it('relit les détails de l’actif lié dans la même agence', async () => {
    const { client, mocks } = makeClient(
      [PROP],
      [{ id: 'asset-9', propertyId: 'prop-1', tenantId: 'tenant-a', details: { legalStatus: 'TITRE_FONCIER' } }]
    );
    await storedPropertyReliability(client as PropertyReliabilityClient, 'tenant-a', 'prop-1', line);
    expect(mocks.asset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'asset-9', tenantId: 'tenant-a' } })
    );
  });

  it('une saisie manuelle sans source est faible ; un statut juridique fragile plafonne à LOW', async () => {
    const fragile = makeClient(
      [PROP],
      [{ id: 'a', propertyId: 'prop-1', tenantId: 'tenant-a', details: { legalStatus: 'LETTRE_ATTRIBUTION' } }]
    );
    const result = await storedPropertyReliability(fragile.client as PropertyReliabilityClient, 'tenant-a', 'prop-1', {
      ...line,
      method: 'EXPERT_APPRAISAL'
    });
    expect(result.reliability).toBe('LOW');
    expect(result.reliabilityReasons).toContain('LEGAL_STATUS_FRAGILE');
  });

  it('actif créé à la volée : statut juridique inconnu, plafond MEDIUM', async () => {
    const { client, assets } = makeClient([PROP]);
    const result = await storedPropertyReliability(client as PropertyReliabilityClient, 'tenant-a', 'prop-1', {
      ...line,
      method: 'EXPERT_APPRAISAL'
    });
    expect(assets).toHaveLength(1);
    expect(result).toEqual({
      reliability: 'MEDIUM',
      reliabilityReasons: ['METHOD_EXPERT', 'LEGAL_STATUS_UNKNOWN']
    });
  });
});
