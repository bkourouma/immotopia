/**
 * Mandat de vente signé électroniquement (spec 044, S-3 et S-10) : un mandat signé ne
 * se modifie plus sur les champs IMPRIMÉS dans le PDF (409) ; sur un mandat non signé,
 * changer un champ imprimé annule les demandes ouvertes, changer le prix plancher, les
 * notes ou la part du négociateur n'annule rien. L'utilisateur est propagé à l'annulation.
 */
type Row = Record<string, any>;

const baseRow = (extra: Row = {}): Row => ({
  id: 'm1',
  tenantId: 't1',
  year: 2026,
  sequence: 1,
  propertyId: 'p1',
  sellerClientId: 'sc1',
  mandateType: 'SIMPLE',
  askingPrice: 85_000_000,
  minimumPrice: 70_000_000,
  commissionMode: 'PERCENT',
  commissionRate: 5,
  commissionFixedAmount: null,
  commissionPayer: 'SELLER',
  agentUserId: null,
  agentSharePercent: null,
  startDate: new Date('2026-02-01T00:00:00Z'),
  endDate: null,
  status: 'ACTIVE',
  revokedAt: null,
  revokeReason: null,
  notes: null,
  signedAt: null,
  signatureRequestId: null,
  createdAt: new Date('2026-02-01T00:00:00Z'),
  updatedAt: new Date('2026-02-01T00:00:00Z'),
  ...extra
});

const db: { row: Row } = { row: baseRow() };
const prismaMock: Row = {
  saleMandate: {
    findFirst: jest.fn(async () => db.row),
    update: jest.fn(async ({ data }: Row) => ({
      ...db.row,
      ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
    }))
  },
  saleAgreement: { findFirst: jest.fn(async () => null) },
  saleOffer: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
  membership: { findFirst: jest.fn(async () => ({ id: 'mb1' })) },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock))
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/utils/property-tenant-guard', () => ({ getPropertyForTenant: jest.fn() }));
jest.mock('../../src/services/own-assets-barrier-service', () => ({ assertThirdPartyAllowedForTenant: jest.fn() }));
jest.mock('../../src/lib/sales/names', () => ({
  propertyLabels: jest.fn(async () => new Map()),
  tenantClientNames: jest.fn(async () => new Map()),
  userNames: jest.fn(async () => new Map())
}));
jest.mock('../../src/lib/sales/offers', () => ({
  closeOpenOffersTx: jest.fn(async () => undefined),
  offerDto: jest.fn()
}));
jest.mock('../../src/lib/sales/agreements', () => ({ agreementDto: jest.fn() }));
jest.mock('../../src/lib/sales/commissions', () => ({ commissionDto: jest.fn() }));
const cancelOpenRequestsForTarget = jest.fn(async (..._args: unknown[]) => 1);
jest.mock('../../src/lib/signature/cancel', () => ({
  cancelOpenRequestsForTarget: (...args: unknown[]) => (cancelOpenRequestsForTarget as any)(...args)
}));

import { revokeMandate, updateMandate } from '../../src/lib/sales/mandates';

beforeEach(() => {
  jest.clearAllMocks();
  db.row = baseRow();
});

describe('mandat de vente non signé', () => {
  it.each([
    ['prix demandé', { askingPrice: 90_000_000 }],
    ['taux de commission', { commissionRate: 6 }],
    ['payeur', { commissionPayer: 'BUYER' }],
    ['type de mandat', { mandateType: 'EXCLUSIVE' }],
    ['date de fin', { endDate: '2027-01-01' }],
    ['négociateur', { agentUserId: 'u-agent' }]
  ])('un changement du champ imprimé « %s » annule la demande ouverte, avec l’utilisateur', async (_label, patch) => {
    await updateMandate('t1', 'm1', patch, 'u1');
    expect(cancelOpenRequestsForTarget).toHaveBeenCalledWith({ tenantId: 't1', userId: 'u1' }, 'SaleMandate', 'm1');
  });

  it('le prix plancher, les notes et la part du négociateur ne sont pas imprimés : rien n’est annulé', async () => {
    await updateMandate('t1', 'm1', { minimumPrice: 72_000_000, notes: 'Vendeur pressé', agentSharePercent: 30 }, 'u1');
    expect(cancelOpenRequestsForTarget).not.toHaveBeenCalled();
  });

  it('enregistrer les mêmes valeurs n’annule rien', async () => {
    await updateMandate('t1', 'm1', { askingPrice: 85_000_000, commissionRate: 5, commissionPayer: 'SELLER' }, 'u1');
    expect(cancelOpenRequestsForTarget).not.toHaveBeenCalled();
  });
});

describe('mandat de vente signé (S-3)', () => {
  beforeEach(() => {
    db.row = baseRow({ signedAt: new Date('2026-03-01T00:00:00Z'), signatureRequestId: 'req-1' });
  });

  it('refuse en 409 la modification d’un champ imprimé, sans rien écrire', async () => {
    await expect(updateMandate('t1', 'm1', { askingPrice: 99_000_000 }, 'u1')).rejects.toMatchObject({ status: 409 });
    await expect(updateMandate('t1', 'm1', { commissionPayer: 'BUYER' }, 'u1')).rejects.toMatchObject({ status: 409 });
    expect(prismaMock.saleMandate.update).not.toHaveBeenCalled();
  });

  it('laisse modifier ce qui n’est pas imprimé (prix plancher, notes)', async () => {
    await expect(updateMandate('t1', 'm1', { minimumPrice: 71_000_000, notes: 'Suivi' }, 'u1')).resolves.toBeDefined();
    expect(prismaMock.saleMandate.update).toHaveBeenCalled();
    expect(cancelOpenRequestsForTarget).not.toHaveBeenCalled();
  });
});

describe('révocation (S-10)', () => {
  it('annule les demandes ouvertes avec l’utilisateur qui révoque', async () => {
    await revokeMandate('t1', 'u7', 'm1', { reason: 'Vendeur désisté' });
    expect(cancelOpenRequestsForTarget).toHaveBeenCalledWith({ tenantId: 't1', userId: 'u7' }, 'SaleMandate', 'm1');
  });
});
