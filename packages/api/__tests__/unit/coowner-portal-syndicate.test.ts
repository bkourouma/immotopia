/**
 * « Ma copropriété » : repli des coordonnées du mandant sur celles de l'agence
 * quand il n'a ni téléphone ni e-mail. Test purement mocké (aucune base).
 */
jest.mock('../../src/utils/database', () => ({
  prisma: {
    syndicate: { findFirst: jest.fn() },
    syndicateLot: { count: jest.fn(), findMany: jest.fn() },
    syndicMandatingAgency: { findFirst: jest.fn() },
    tenant: { findUnique: jest.fn() },
    crmContact: { findFirst: jest.fn() }
  }
}));
jest.mock('../../src/lib/documents/branding-storage', () => ({ readBrandingImage: jest.fn() }));

import { prisma } from '../../src/utils/database';
import { getCoOwnerSyndicate } from '../../src/lib/syndics/coowner-portal-syndicate';
import type { CoOwnerPortalScope } from '../../src/lib/syndics/coowner-portal';

const db = prisma as any;

const scope: CoOwnerPortalScope = {
  tenantId: 'tenant-1',
  contactIds: ['c1'],
  lots: [],
  lotIds: ['lot-1'],
  syndicateIds: ['syn-1']
};

const tenantRow = {
  name: 'Agence Test',
  legalName: 'Agence Test SARL',
  address: 'Cocody',
  city: null,
  country: null,
  contactPhone: '+225 01 02 03',
  contactEmail: 'agence@test.ci',
  logoUrl: null,
  financeSettings: { taxpayerNumber: 'TAX-SECRET' }
};

function mandantRow(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Mandant SA',
    legalName: 'Mandant SA',
    address: 'Plateau',
    phone: null,
    email: '  ',
    rccm: 'RCCM-SECRET',
    taxId: 'TAXID-SECRET',
    logoPath: null,
    signaturePath: 'sig/secret.png',
    stampPath: 'stamp/secret.png',
    ...overrides
  };
}

function setup(mandatingAgencyId: string | null, mandant: unknown) {
  db.syndicate.findFirst.mockResolvedValue({
    id: 'syn-1',
    name: 'Résidence',
    address: 'Plateau',
    registrationNo: null,
    cadastralReference: null,
    logoPath: null,
    mandatingAgencyId,
    syndicManagerId: null
  });
  db.syndicateLot.count.mockResolvedValue(3);
  db.syndicateLot.findMany.mockResolvedValue([]);
  db.syndicMandatingAgency.findFirst.mockResolvedValue(mandant);
  db.tenant.findUnique.mockResolvedValue(tenantRow);
}

describe('getCoOwnerSyndicate : coordonnées de l’émetteur', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mandant sans téléphone ni e-mail : reprend ceux de l’agence, garde nom/adresse/kind', async () => {
    setup('m1', mandantRow());
    const res = await getCoOwnerSyndicate(scope, 'syn-1');
    expect(res.issuer).toEqual({
      kind: 'MANDANT',
      name: 'Mandant SA',
      address: 'Plateau',
      phone: '+225 01 02 03',
      email: 'agence@test.ci'
    });
  });

  it('mandant avec un téléphone seulement : inchangé, sans mélange', async () => {
    setup('m1', mandantRow({ phone: '+225 07 07 07' }));
    const res = await getCoOwnerSyndicate(scope, 'syn-1');
    expect(res.issuer.phone).toBe('+225 07 07 07');
    expect(res.issuer.email).toBeNull();
    expect(res.issuer.kind).toBe('MANDANT');
  });

  it('pas de mandant : l’agence', async () => {
    setup(null, null);
    const res = await getCoOwnerSyndicate(scope, 'syn-1');
    expect(res.issuer).toMatchObject({
      kind: 'AGENCY',
      name: 'Agence Test',
      phone: '+225 01 02 03',
      email: 'agence@test.ci'
    });
  });

  it('agence introuvable : pas de plantage, coordonnées vides', async () => {
    setup('m1', mandantRow());
    db.tenant.findUnique.mockResolvedValue(null);
    const res = await getCoOwnerSyndicate(scope, 'syn-1');
    expect(res.issuer.phone).toBeNull();
    expect(res.issuer.email).toBeNull();
  });

  it('ne publie jamais signature, cachet, RCCM ni numéro fiscal', async () => {
    setup('m1', mandantRow());
    const json = JSON.stringify(await getCoOwnerSyndicate(scope, 'syn-1')).toLowerCase();
    for (const forbidden of ['signature', 'stamp', 'cachet', 'rccm', 'taxid', 'secret']) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('chaque where Prisma porte le tenantId du périmètre', async () => {
    setup('m1', mandantRow());
    await getCoOwnerSyndicate(scope, 'syn-1');
    expect(db.syndicate.findFirst.mock.calls[0][0].where.tenantId).toBe('tenant-1');
    expect(db.syndicMandatingAgency.findFirst.mock.calls[0][0].where.tenantId).toBe('tenant-1');
    expect(db.tenant.findUnique.mock.calls[0][0].where.id).toBe('tenant-1');
    // SyndicateLot n'a pas de tenantId : filtré par copropriété du périmètre et lots ouverts.
    expect(db.syndicateLot.findMany.mock.calls[0][0].where).toEqual({
      syndicateId: 'syn-1',
      id: { in: ['lot-1'] }
    });
  });
});
