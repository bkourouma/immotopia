/**
 * Revue fonctionnelle lot 1 (fiche copropriete, lots, profils, incidents, documents) :
 * non-regressions des correctifs.
 */

jest.mock('@prisma/client', () => {
  const prisma: any = {
    syndicate: { findFirst: jest.fn() },
    syndicateLot: { findFirst: jest.fn() },
    syndicateFund: { findMany: jest.fn(async () => []) },
    syndicateBudget: {
      findFirst: jest.fn(),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data }))
    },
    lotOwnerProfile: { findFirst: jest.fn() },
    syndicateDocument: { findMany: jest.fn(async () => []) },
    syndicateIncident: {
      findFirst: jest.fn(),
      findMany: jest.fn(async () => []),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data }))
    },
    serviceProvider: { findFirst: jest.fn() },
    crmContact: { findFirst: jest.fn() },
    rentalLease: { findFirst: jest.fn() },
    lotTenantAssignment: {
      findFirst: jest.fn(),
      updateMany: jest.fn(async () => ({ count: 0 })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      create: jest.fn(async ({ data }: any) => ({ id: 'assign-1', ...data }))
    },
    $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma))
  };
  return { PrismaClient: jest.fn(() => prisma), __mockPrisma: prisma };
});

jest.mock('../../src/services/lot-registry-service', () => ({
  syncLotActivationsTx: jest.fn(async () => ({ activated: [], deactivated: [], quota: null })),
  assertCapacityTx: jest.fn(async () => ({ decision: 'ALLOW' })),
  resolveLotScope: jest.fn(async (_tx: unknown, _tenantId: string, scope: unknown) => scope),
  ACTIVE_SYNDICATE_STATUSES: ['ACTIVE', 'IN_DISPUTE'],
  LOT_QUOTA_REACHED_REASON: 'Quota de lots atteint'
}));

jest.mock('../../src/lib/syndics/owner-account-tx', () => ({
  ensureCrmRoleForContact: jest.fn(async () => undefined),
  ensureOwnerAccountForLotTx: jest.fn(async () => undefined)
}));

import {
  addLotTenantBySyndicate,
  deactivateLotTenantAssignmentBySyndicate,
  listDocumentsBySyndicate,
  listFundsBySyndicate,
  updateBudgetBySyndicate,
  updateLotOwnerProfileBySyndicate,
  updateIncidentBySyndicate
} from '../../src/lib/syndics/queries';
import {
  createLotOwnerProfileSchema,
  createLotTenantAssignmentSchema,
  createLotTenantProfileSchema,
  incidentListQuerySchema,
  profileLotFilterQuerySchema
} from '../../src/lib/syndics/schemas';

const { __mockPrisma: db } = jest.requireMock('@prisma/client') as { __mockPrisma: any };

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Documents : copropriete d une autre agence', () => {
  it('repond 404 au lieu d une liste vide', async () => {
    db.syndicate.findFirst.mockResolvedValueOnce(null);
    await expect(listDocumentsBySyndicate('tenant-a', 'syn-other')).rejects.toMatchObject({ status: 404 });
    expect(db.syndicateDocument.findMany).not.toHaveBeenCalled();
  });

  it('liste les documents de la copropriete de l agence', async () => {
    db.syndicate.findFirst.mockResolvedValueOnce({ id: 'syn-1' });
    await expect(listDocumentsBySyndicate('tenant-a', 'syn-1')).resolves.toEqual([]);
    expect(db.syndicate.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'syn-1', tenantId: 'tenant-a' });
  });
});

describe('Fonds : copropriete d une autre agence', () => {
  it('repond 404 (meme erreur qu un objet inexistant) et non 403', async () => {
    db.syndicate.findFirst.mockResolvedValueOnce(null);
    await expect(listFundsBySyndicate('tenant-a', 'syn-other')).rejects.toMatchObject({ status: 404 });
    expect(db.syndicateFund.findMany).not.toHaveBeenCalled();
  });

  it('liste les fonds de la copropriete de l agence', async () => {
    db.syndicate.findFirst.mockResolvedValueOnce({ id: 'syn-1' });
    await expect(listFundsBySyndicate('tenant-a', 'syn-1')).resolves.toEqual([]);
    expect(db.syndicateFund.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('Profil proprietaire : coherence des dates a la modification', () => {
  it('fin avant debut : 422', async () => {
    db.syndicate.findFirst.mockResolvedValueOnce({ id: 'syn-1' });
    db.lotOwnerProfile.findFirst.mockResolvedValueOnce({
      id: UUID,
      lotId: UUID2,
      contactId: 'c-1',
      portalAccessToken: null,
      ownershipPercentage: 100,
      ownedSince: new Date('2024-06-01T00:00:00Z'),
      ownedUntil: null,
      isActive: true
    });
    await expect(
      updateLotOwnerProfileBySyndicate('tenant-a', 'syn-1', UUID, { ownedUntil: new Date('2024-01-01T00:00:00Z') })
    ).rejects.toMatchObject({ status: 422 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe('Budget : date d approbation', () => {
  const updateWith = async (current: string, status: string | undefined) => {
    db.syndicate.findFirst.mockResolvedValueOnce({ id: 'syn-1' });
    db.syndicateBudget.findFirst.mockResolvedValueOnce({ id: 'b-1', status: current });
    await updateBudgetBySyndicate(
      'tenant-a',
      'syn-1',
      'b-1',
      status ? { status: status as any } : { label: 'Nouveau' }
    );
    return db.syndicateBudget.update.mock.calls[0][0].data;
  };

  it('le passage a APPROVED pose approvedAt', async () => {
    const data = await updateWith('DRAFT', 'APPROVED');
    expect(data.approvedAt).toBeInstanceOf(Date);
  });

  it('une modification d un budget deja APPROVED ne reecrit pas approvedAt', async () => {
    const data = await updateWith('APPROVED', 'APPROVED');
    expect(data.approvedAt).toBeUndefined();
  });

  it('une modification sans statut ne touche pas approvedAt', async () => {
    const data = await updateWith('DRAFT', undefined);
    expect(data.approvedAt).toBeUndefined();
  });
});

describe('Incident : date de resolution suivant le statut', () => {
  const arrange = (resolvedAt: Date | null) => {
    db.syndicate.findFirst.mockResolvedValue({ id: 's1' });
    db.syndicateIncident.findFirst.mockResolvedValue({ id: 'inc-1', resolvedAt });
  };

  it('Resolu sans date : la date de resolution est posee a aujourd hui', async () => {
    arrange(null);
    await updateIncidentBySyndicate('tenant-a', 's1', 'inc-1', { status: 'RESOLVED' });
    const data = db.syndicateIncident.update.mock.calls[0][0].data;
    expect(data.status).toBe('RESOLVED');
    expect(data.resolvedAt).toBeInstanceOf(Date);
  });

  it('Resolu avec une date deja saisie : elle est conservee', async () => {
    arrange(new Date('2026-01-01'));
    await updateIncidentBySyndicate('tenant-a', 's1', 'inc-1', { status: 'CLOSED' });
    expect(db.syndicateIncident.update.mock.calls[0][0].data.resolvedAt).toBeUndefined();
  });

  it('une date fournie par l appelant l emporte', async () => {
    arrange(null);
    const chosen = new Date('2026-03-03');
    await updateIncidentBySyndicate('tenant-a', 's1', 'inc-1', { status: 'RESOLVED', resolvedAt: chosen });
    expect(db.syndicateIncident.update.mock.calls[0][0].data.resolvedAt).toBe(chosen);
  });

  it('rouvrir un incident resolu efface la date de resolution', async () => {
    arrange(new Date('2026-01-01'));
    await updateIncidentBySyndicate('tenant-a', 's1', 'inc-1', { status: 'IN_PROGRESS' });
    expect(db.syndicateIncident.update.mock.calls[0][0].data.resolvedAt).toBeNull();
  });

  it('une modification sans statut ne touche pas a la date', async () => {
    arrange(new Date('2026-01-01'));
    await updateIncidentBySyndicate('tenant-a', 's1', 'inc-1', { description: 'Fuite' });
    expect(db.syndicateIncident.update.mock.calls[0][0].data.resolvedAt).toBeUndefined();
  });
});

describe('Locataires de lot : historique des affectations', () => {
  const start = new Date('2026-06-01');

  beforeEach(() => {
    db.syndicateLot.findFirst.mockResolvedValue({ id: 'lot-1' });
    db.crmContact.findFirst.mockResolvedValue({ id: 'contact-1' });
  });

  it('l ancienne affectation sans fin recoit la date d entree du nouveau locataire', async () => {
    await addLotTenantBySyndicate('tenant-a', 's1', 'lot-1', { tenantId: 'contact-1', startDate: start });
    const [first, second] = db.lotTenantAssignment.updateMany.mock.calls.map((call: any[]) => call[0]);
    expect(first.where).toMatchObject({ lotId: 'lot-1', isActive: true, endDate: null });
    expect(first.data).toEqual({ isActive: false, endDate: start });
    // Les autres affectations actives (fin deja saisie, ou debut posterieur) sont seulement closes.
    expect(second).toEqual({ where: { lotId: 'lot-1', isActive: true }, data: { isActive: false } });
    expect(db.lotTenantAssignment.create).toHaveBeenCalledTimes(1);
  });

  it('terminer une affectation deja terminee conserve sa date de fin', async () => {
    db.lotTenantAssignment.findFirst.mockResolvedValueOnce({
      id: 'a1',
      isActive: false,
      endDate: new Date('2026-02-02')
    });
    await deactivateLotTenantAssignmentBySyndicate('tenant-a', 's1', 'lot-1', 'a1');
    expect(db.lotTenantAssignment.update.mock.calls[0][0].data).toEqual({ isActive: false });
  });

  it('terminer une affectation en cours pose la date du jour', async () => {
    db.lotTenantAssignment.findFirst.mockResolvedValueOnce({ id: 'a1', isActive: true, endDate: null });
    await deactivateLotTenantAssignmentBySyndicate('tenant-a', 's1', 'lot-1', 'a1');
    const data = db.lotTenantAssignment.update.mock.calls[0][0].data;
    expect(data.isActive).toBe(false);
    expect(data.endDate).toBeInstanceOf(Date);
  });
});

describe('Schemas : coherence des dates et filtres de liste', () => {
  it('affectation locataire : fin avant debut refusee', () => {
    const base = { tenantId: UUID, startDate: '2026-06-01' };
    expect(createLotTenantAssignmentSchema.safeParse({ ...base, endDate: '2026-05-01' }).success).toBe(false);
    expect(createLotTenantAssignmentSchema.safeParse({ ...base, endDate: '2026-07-01' }).success).toBe(true);
    expect(createLotTenantAssignmentSchema.safeParse({ ...base, endDate: '' }).success).toBe(true);
    expect(createLotTenantAssignmentSchema.safeParse(base).success).toBe(true);
  });

  it('profil proprietaire : fin avant debut refusee', () => {
    const base = { lotId: UUID, contactId: UUID2, ownershipPercentage: 50, ownedSince: '2026-06-01' };
    expect(createLotOwnerProfileSchema.safeParse({ ...base, ownedUntil: '2026-01-01' }).success).toBe(false);
    expect(createLotOwnerProfileSchema.safeParse({ ...base, ownedUntil: '2026-12-01' }).success).toBe(true);
    expect(createLotOwnerProfileSchema.safeParse(base).success).toBe(true);
  });

  it('profil locataire : sortie avant entree refusee', () => {
    const base = { lotId: UUID, contactId: UUID2, tenantSince: '2026-06-01' };
    expect(createLotTenantProfileSchema.safeParse({ ...base, tenantUntil: '2026-01-01' }).success).toBe(false);
    expect(createLotTenantProfileSchema.safeParse(base).success).toBe(true);
  });

  it('?lotId= doit etre un uuid ; vide ou absent = pas de filtre', () => {
    expect(profileLotFilterQuerySchema.safeParse({ lotId: 'abc' }).success).toBe(false);
    expect(profileLotFilterQuerySchema.parse({ lotId: UUID })).toEqual({ lotId: UUID });
    expect(profileLotFilterQuerySchema.parse({ lotId: '' })).toEqual({ lotId: undefined });
    expect(profileLotFilterQuerySchema.parse({})).toEqual({ lotId: undefined });
  });

  it('?status= des incidents : enum, vide = pas de filtre', () => {
    expect(incidentListQuerySchema.parse({ status: 'RESOLVED' })).toEqual({ status: 'RESOLVED' });
    expect(incidentListQuerySchema.parse({ status: '' })).toEqual({ status: undefined });
    expect(incidentListQuerySchema.safeParse({ status: 'NOPE' }).success).toBe(false);
  });
});
