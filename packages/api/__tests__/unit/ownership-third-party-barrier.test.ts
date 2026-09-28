/**
 * Barriere « detenu en propre » (pack Patrimoine, lot P1) —
 * `lib/ownership/service.ts` (`setPropertyOwnership`) : remplacer
 * l'indivision par une liste NON vide de quotes-parts rattache un (ou
 * plusieurs) proprietaire(s) tiers ; la vider reste toujours permis, meme
 * pour une agence Patrimoine seule.
 *
 * Prisma est remplace par un magasin en memoire (meme esprit que
 * `ownership.split.test.ts`/`sales.mandates-agent-membership.test.ts`) :
 * aucune base n'est requise.
 */

type Row = Record<string, any>;

const store = {
  properties: [] as Row[],
  tenantClients: [] as Row[],
  shares: [] as Row[]
};

const assertThirdPartyAllowedForTenant = jest.fn();
jest.mock('../../src/services/own-assets-barrier-service', () => ({
  assertThirdPartyAllowedForTenant: (...args: any[]) => assertThirdPartyAllowedForTenant(...args)
}));

jest.mock('../../src/lib/owner-account/sync', () => ({
  listAgencyOwners: jest.fn().mockResolvedValue([])
}));

const mockPrisma: Row = {
  property: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.properties.find(p => p.id === where.id && p.tenantId === where.tenantId) ?? null
    )
  },
  tenantClient: {
    count: jest.fn(
      async ({ where }: Row) =>
        store.tenantClients.filter(c => c.tenantId === where.tenantId && where.id.in.includes(c.id)).length
    )
  },
  propertyOwnershipShare: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.shares
        .filter(s => s.tenantId === where.tenantId && s.propertyId === where.propertyId)
        .map(s => ({
          ...s,
          ownerClient: {
            user: store.tenantClients.find(c => c.id === s.ownerClientId)?.user ?? { fullName: null, email: null }
          }
        }))
    )
  },
  rentalLease: {
    findMany: jest.fn(async () => [])
  },
  $transaction: jest.fn(async (callback: (tx: Row) => Promise<any>) =>
    callback({
      propertyOwnershipShare: {
        deleteMany: jest.fn(async ({ where }: Row) => {
          store.shares = store.shares.filter(
            s => !(s.tenantId === where.tenantId && s.propertyId === where.propertyId)
          );
          return { count: 0 };
        }),
        createMany: jest.fn(async ({ data }: Row) => {
          store.shares.push(...data);
          return { count: data.length };
        })
      }
    })
  )
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => (mockPrisma as any)[prop] })
}));

import { setPropertyOwnership } from '../../src/lib/ownership/service';
import { OwnAssetsOnlyError } from '../../src/middleware/error-middleware';

const TENANT = 'tenant-patrimoine';
const PROPERTY_ID = 'property-1';

function seedProperty() {
  store.properties.push({ id: PROPERTY_ID, tenantId: TENANT });
}

function seedOwner(id: string) {
  store.tenantClients.push({
    id,
    tenantId: TENANT,
    user: { fullName: 'Proprietaire Test', email: 'proprietaire@test.tld' }
  });
}

beforeEach(() => {
  store.properties = [];
  store.tenantClients = [];
  store.shares = [];
  assertThirdPartyAllowedForTenant.mockReset();
});

describe('setPropertyOwnership — barriere « detenu en propre »', () => {
  it('remplacer par une liste NON vide de quotes-parts appelle la barriere AVANT toute ecriture', async () => {
    seedProperty();
    seedOwner('owner-1');
    assertThirdPartyAllowedForTenant.mockResolvedValue(undefined);

    await setPropertyOwnership(TENANT, PROPERTY_ID, { shares: [{ ownerClientId: 'owner-1', sharePercent: 100 }] });

    expect(assertThirdPartyAllowedForTenant).toHaveBeenCalledWith(TENANT, 'THIRD_PARTY_OWNER');
    expect(store.shares).toHaveLength(1);
  });

  it('la barriere en enforce (ownAssetsOnly) refuse AVANT toute ecriture : aucune part enregistree', async () => {
    seedProperty();
    seedOwner('owner-1');
    assertThirdPartyAllowedForTenant.mockRejectedValue(new OwnAssetsOnlyError('THIRD_PARTY_OWNER'));

    await expect(
      setPropertyOwnership(TENANT, PROPERTY_ID, { shares: [{ ownerClientId: 'owner-1', sharePercent: 100 }] })
    ).rejects.toBeInstanceOf(OwnAssetsOnlyError);
    expect(store.shares).toHaveLength(0);
  });

  it('vider l’indivision (shares: []) ne consulte jamais la barriere', async () => {
    seedProperty();
    store.shares.push({ tenantId: TENANT, propertyId: PROPERTY_ID, ownerClientId: 'owner-1', sharePercent: 100 });

    await setPropertyOwnership(TENANT, PROPERTY_ID, { shares: [] });

    expect(assertThirdPartyAllowedForTenant).not.toHaveBeenCalled();
    expect(store.shares).toHaveLength(0);
  });
});
