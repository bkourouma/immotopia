/**
 * Offres d'extension de l'agence : lues dans le catalogue en BASE, filtrees par
 * les packs detenus (`rules.requiresAnyOf`), avec le prix applicable ; la
 * creation d'une demande refuse un code non autorise.
 */

import { DEFAULT_CATALOG, EXTENSION, PACK } from '../../src/lib/subscription';
import { runWithLanguage, t } from '../../src/i18n';

const mockGetEntitlements = jest.fn();
const mockPrisma = {
  catalogItem: { findMany: jest.fn(), findUnique: jest.fn() },
  subscriptionExtensionRequest: {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'r1',
      status: 'PENDING',
      createdAt: new Date(),
      ...data
    })),
    findMany: jest.fn(async () => [])
  },
  tenant: { findUnique: jest.fn(async () => ({ name: 'Agence' })) },
  user: { findUnique: jest.fn(async () => ({ fullName: 'A', email: 'a@x.ci' })), findMany: jest.fn(async () => []) }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), AuditActionKey: {} }));
jest.mock('../../src/types/audit-types', () => ({ AuditActionKey: { SUBSCRIPTION_EXTENSION_REQUESTED: 'X' } }));
jest.mock('../../src/services/subscription-v2-service', () => {
  const actual = jest.requireActual('../../src/services/subscription-v2-service');
  return {
    ...actual,
    getEntitlements: (...args: unknown[]) => mockGetEntitlements(...args),
    invalidateEntitlements: jest.fn()
  };
});

import {
  createExtensionRequest,
  listTenantExtensionOffers
} from '../../src/services/subscription-admin-extras-service';

const rows = DEFAULT_CATALOG.filter(i => i.kind === 'EXTENSION').map(i => ({
  ...i,
  id: i.code,
  capacities: Object.entries(i.capacities).map(([capacityKey, amount]) => ({ capacityKey, amount }))
}));

function holdPacks(packs: string[], lots = 0) {
  mockGetEntitlements.mockResolvedValue({ packs, capacities: { LOTS: { limit: lots } } });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.catalogItem.findMany.mockResolvedValue(rows);
  mockPrisma.catalogItem.findUnique.mockImplementation(
    async ({ where }: { where: { code: string } }) => rows.find(r => r.code === where.code) ?? null
  );
});

const codes = async (tenantId = 't1') => (await listTenantExtensionOffers(tenantId)).map(o => o.code);

describe('listTenantExtensionOffers', () => {
  it('Agence seule : blocs de lots et signatures', async () => {
    holdPacks([PACK.AGENCE]);
    expect(await codes()).toEqual([EXTENSION.LOTS_10, EXTENSION.SIGNATURES_SUPPLEMENTAIRES]);
  });

  it('Promoteur : inventaire WhatsApp et chantier en plus', async () => {
    holdPacks([PACK.PROMOTEUR]);
    const list = await codes();
    expect(list).toEqual(
      expect.arrayContaining([EXTENSION.INVENTAIRE_WHATSAPP, EXTENSION.CHANTIER, EXTENSION.LOTS_10])
    );
    expect(list).not.toContain(EXTENSION.COPRO);
    expect(list).not.toContain(EXTENSION.BIENS_10);
  });

  it('Patrimoine Essentiel : bloc de biens uniquement', async () => {
    holdPacks([PACK.PATRIMOINE_ESSENTIEL]);
    expect(await codes()).toEqual([EXTENSION.BIENS_10]);
  });

  it("marque l'offre non commercialisee et renvoie le prix applicable aux packs detenus", async () => {
    holdPacks([PACK.PROMOTEUR]);
    const offers = await listTenantExtensionOffers('t1');
    expect(offers.find(o => o.code === EXTENSION.LOTS_10)).toMatchObject({ monthlyPrice: 1_000, isSellable: true });
    expect(offers.find(o => o.code === EXTENSION.SIGNATURES_SUPPLEMENTAIRES)).toMatchObject({ isSellable: false });
    expect(mockPrisma.catalogItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { kind: 'EXTENSION' }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] })
    );
  });
});

describe('listTenantExtensionOffers : langue de la requête', () => {
  it('traduit le nom et la description du catalogue en anglais et en arabe', async () => {
    holdPacks([PACK.PATRIMOINE_ESSENTIEL]);
    const en = await runWithLanguage('en', () => listTenantExtensionOffers('t1'));
    expect(en[0]).toMatchObject({ code: EXTENSION.BIENS_10, name: 'Block of 10 owned properties' });
    expect(en[0].description).toContain('per property');
    const ar = await runWithLanguage('ar', () => listTenantExtensionOffers('t1'));
    expect(ar[0].name).toBe('حزمة من 10 عقارات مملوكة');
  });

  it('garde le français par défaut', async () => {
    holdPacks([PACK.PATRIMOINE_ESSENTIEL]);
    const fr = await listTenantExtensionOffers('t1');
    expect(fr[0].name).toBe('Bloc de 10 biens détenus');
  });

  it('repli sur le texte en base quand le super-admin a édité le catalogue (aucune traduction)', async () => {
    holdPacks([PACK.PATRIMOINE_ESSENTIEL]);
    mockPrisma.catalogItem.findMany.mockResolvedValue(
      rows.map(r => (r.code === EXTENSION.BIENS_10 ? { ...r, name: 'Bloc sur mesure', description: null } : r))
    );
    const en = await runWithLanguage('en', () => listTenantExtensionOffers('t1'));
    expect(en[0]).toMatchObject({ name: 'Bloc sur mesure', description: null });
  });

  it.each(['en', 'ar'] as const)('chaque extension amorcée est traduite (%s)', language => {
    for (const item of DEFAULT_CATALOG.filter(i => i.kind === 'EXTENSION')) {
      expect(t(item.name, undefined, language)).not.toBe(item.name);
      if (item.description) expect(t(item.description, undefined, language)).not.toBe(item.description);
    }
  });
});

describe('createExtensionRequest : code du catalogue', () => {
  it('refuse une extension que les packs de l’agence n’ouvrent pas', async () => {
    holdPacks([PACK.AGENCE]);
    await expect(
      createExtensionRequest('t1', { catalogCode: EXTENSION.INVENTAIRE_WHATSAPP, message: 'Besoin' }, 'u1')
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.subscriptionExtensionRequest.create).not.toHaveBeenCalled();
  });

  it('refuse un code qui n’est pas une extension', async () => {
    holdPacks([PACK.AGENCE]);
    mockPrisma.catalogItem.findUnique.mockResolvedValueOnce({ ...rows[0], kind: 'PACK' });
    await expect(
      createExtensionRequest('t1', { catalogCode: PACK.AGENCE, message: 'Besoin' }, 'u1')
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('accepte une extension autorisee, même non commercialisee', async () => {
    holdPacks([PACK.AGENCE]);
    const dto = await createExtensionRequest(
      't1',
      { catalogCode: EXTENSION.SIGNATURES_SUPPLEMENTAIRES, message: 'Besoin' },
      'u1'
    );
    expect(dto).toBeDefined();
    expect(mockPrisma.subscriptionExtensionRequest.create).toHaveBeenCalled();
  });
});
