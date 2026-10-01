/**
 * Service des polices d'assurance (lot B1, spec 032). Prisma remplacé par des
 * doubles ciblés : aucune base requise.
 */

export {};

type Row = Record<string, any>;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const prismaMock = {
  insurancePolicy: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn()
  },
  insuranceClaim: { count: jest.fn() },
  propertyDocument: { findFirst: jest.fn() }
};

jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/utils/property-tenant-guard', () => {
  const { NotFoundError } = require('../../src/middleware/error-middleware');
  return {
    getPropertyForTenant: jest.fn(async (propertyId: string, tenantId: string) => {
      if (propertyId !== 'prop-a' || tenantId !== 'tenant-a') throw new NotFoundError('Bien introuvable.');
      return { id: propertyId };
    })
  };
});

/* eslint-disable @typescript-eslint/no-var-requires */
const service = require('../../src/lib/patrimoine/insurance/policy-service');
const { createPolicySchema, updatePolicySchema } = require('../../src/lib/patrimoine/insurance/schemas');
const { BadRequestError, ConflictError, NotFoundError } = require('../../src/middleware/error-middleware');

const NOW = new Date('2026-10-01T10:00:00Z');

function policyRow(overrides: Row = {}): Row {
  return {
    id: 'pol-1',
    tenantId: TENANT_A,
    propertyId: 'prop-a',
    insurer: 'NSIA',
    policyNumber: 'P1',
    coverageType: 'MULTIRISK_HOME',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    annualPremium: { toNumber: () => 120000.5 },
    currency: 'XOF',
    notes: null,
    documentId: null,
    createdAt: NOW,
    updatedAt: NOW,
    property: { internalReference: 'REF-A' },
    _count: { claims: 2 },
    ...overrides
  };
}

const input = {
  propertyId: 'prop-a',
  insurer: 'NSIA',
  policyNumber: 'P1',
  coverageType: 'MULTIRISK_HOME',
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-12-31')
};

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.insurancePolicy.create.mockImplementation(async ({ data }: Row) => policyRow(data));
});

describe('createPolicy', () => {
  it('crée avec agence et auteur de la session, devise XOF par défaut, DTO en number', async () => {
    const dto = await service.createPolicy(TENANT_A, input, 'user-1', NOW);
    const data = prismaMock.insurancePolicy.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: TENANT_A, createdByUserId: 'user-1', currency: 'XOF' });
    expect(dto).toMatchObject({ status: 'ACTIVE', claimsCount: 2, propertyReference: 'REF-A' });
    expect(dto.daysToExpiry).toBe(91);
  });

  it('bien d’une autre agence -> NotFoundError, rien écrit', async () => {
    await expect(service.createPolicy(TENANT_B, input, 'u', NOW)).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.insurancePolicy.create).not.toHaveBeenCalled();
  });

  it('document d’une autre agence ou d’un autre bien -> NotFoundError', async () => {
    prismaMock.propertyDocument.findFirst.mockResolvedValue(null);
    await expect(service.createPolicy(TENANT_A, { ...input, documentId: 'doc-x' }, 'u', NOW)).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(prismaMock.propertyDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-x', propertyId: 'prop-a', OR: [{ tenantId: TENANT_A }, { tenantId: null }] }
      })
    );
    expect(prismaMock.insurancePolicy.create).not.toHaveBeenCalled();
  });

  it('le schéma refuse endDate < startDate, prime négative, devise invalide, champs inconnus', () => {
    const body = {
      propertyId: 'p',
      insurer: 'A',
      policyNumber: '1',
      coverageType: 'OTHER',
      startDate: '2026-02-01',
      endDate: '2026-01-01'
    };
    expect(() => createPolicySchema.parse(body)).toThrow();
    expect(() => createPolicySchema.parse({ ...body, endDate: '2026-03-01', annualPremium: -1 })).toThrow();
    expect(() => createPolicySchema.parse({ ...body, endDate: '2026-03-01', currency: 'xof' })).toThrow();
    expect(() => createPolicySchema.parse({ ...body, endDate: '2026-03-01', tenantId: 'x' })).toThrow();
    expect(createPolicySchema.parse({ ...body, endDate: '2026-02-01' }).endDate).toBeInstanceOf(Date);
    expect(() => updatePolicySchema.parse({ createdByUserId: 'x' })).toThrow();
  });

  it('dateInputSchema partagé : jour inexistant, format court strict, ISO avec ou sans fuseau', () => {
    const parse = (value: string) =>
      createPolicySchema.parse({ ...input, startDate: value, endDate: '2030-01-01' }).startDate;
    expect(() => parse('2026-02-31')).toThrow();
    expect(() => parse('2026-13-01')).toThrow();
    expect(() => parse('2026-2-1')).toThrow();
    expect(() => parse('26-02-01')).toThrow();
    expect(() => parse('2026-02-31T10:00:00Z')).toThrow();
    expect(parse('2026-02-28').toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(parse('2026-02-28T10:00:00Z').toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(parse('2026-02-28T10:00:00+02:00').toISOString()).toBe('2026-02-28T08:00:00.000Z');
    // Sans fuseau : lu en UTC, jamais en heure locale du serveur.
    expect(parse('2026-02-28T10:00:00').toISOString()).toBe('2026-02-28T10:00:00.000Z');
  });

  it('identifiants @db.Uuid : non-UUID refusé par les schémas des sinistres', () => {
    const { createClaimSchema, attachClaimDocumentSchema } = require('../../src/lib/patrimoine/insurance/schemas');
    const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    const claim = {
      propertyId: 'p',
      policyId: uuid,
      occurredAt: '2026-09-01',
      cause: 'FIRE',
      description: 'x',
      claimedAmount: 1
    };
    expect(createClaimSchema.parse(claim).policyId).toBe(uuid);
    expect(() => createClaimSchema.parse({ ...claim, policyId: 'pol-1' })).toThrow();
    expect(() => createClaimSchema.parse({ ...claim, ticketId: 'x' })).toThrow();
    expect(() => createClaimSchema.parse({ ...claim, expenseId: 'x' })).toThrow();
    expect(attachClaimDocumentSchema.parse({ documentId: 'doc-libre', kind: 'QUOTE' }).documentId).toBe('doc-libre');
  });
});

describe('updatePolicy', () => {
  it('police d’une autre agence -> NotFoundError (cherchée avec tenantId)', async () => {
    prismaMock.insurancePolicy.findFirst.mockResolvedValue(null);
    await expect(service.updatePolicy(TENANT_B, 'pol-1', { insurer: 'X' }, NOW)).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.insurancePolicy.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pol-1', tenantId: TENANT_B } })
    );
    expect(prismaMock.insurancePolicy.updateMany).not.toHaveBeenCalled();
  });

  it('refuse une fin antérieure au début (fusion avec l’existant) -> 400', async () => {
    prismaMock.insurancePolicy.findFirst.mockResolvedValue(policyRow());
    await expect(
      service.updatePolicy(TENANT_A, 'pol-1', { endDate: new Date('2025-12-31') }, NOW)
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('refuse un changement de devise (409) si la police a des sinistres, accepte la même devise', async () => {
    prismaMock.insurancePolicy.findFirst.mockResolvedValue(policyRow()); // 2 sinistres, XOF
    await expect(service.updatePolicy(TENANT_A, 'pol-1', { currency: 'EUR' }, NOW)).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(prismaMock.insurancePolicy.updateMany).not.toHaveBeenCalled();
    prismaMock.insurancePolicy.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.updatePolicy(TENANT_A, 'pol-1', { currency: 'XOF' }, NOW)).resolves.toBeDefined();
  });

  it('accepte un changement de devise sans sinistre', async () => {
    prismaMock.insurancePolicy.findFirst.mockResolvedValue(policyRow({ _count: { claims: 0 } }));
    prismaMock.insurancePolicy.updateMany.mockResolvedValue({ count: 1 });
    await service.updatePolicy(TENANT_A, 'pol-1', { currency: 'EUR' }, NOW);
    expect(prismaMock.insurancePolicy.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currency: 'EUR' } })
    );
  });

  it('documentId null délie sans vérification, mise à jour portée par tenantId', async () => {
    prismaMock.insurancePolicy.findFirst.mockResolvedValue(policyRow());
    prismaMock.insurancePolicy.updateMany.mockResolvedValue({ count: 1 });
    await service.updatePolicy(TENANT_A, 'pol-1', { documentId: null }, NOW);
    expect(prismaMock.propertyDocument.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.insurancePolicy.updateMany).toHaveBeenCalledWith({
      where: { id: 'pol-1', tenantId: TENANT_A },
      data: { documentId: null }
    });
  });
});

describe('deletePolicy', () => {
  it('409 si des sinistres y sont rattachés', async () => {
    prismaMock.insurancePolicy.findFirst.mockResolvedValue(policyRow());
    prismaMock.insuranceClaim.count.mockResolvedValue(1);
    await expect(service.deletePolicy(TENANT_A, 'pol-1')).rejects.toBeInstanceOf(ConflictError);
    expect(prismaMock.insurancePolicy.deleteMany).not.toHaveBeenCalled();
  });

  it('supprime une police sans sinistre', async () => {
    prismaMock.insurancePolicy.findFirst.mockResolvedValue(policyRow());
    prismaMock.insuranceClaim.count.mockResolvedValue(0);
    await service.deletePolicy(TENANT_A, 'pol-1');
    expect(prismaMock.insurancePolicy.deleteMany).toHaveBeenCalledWith({ where: { id: 'pol-1', tenantId: TENANT_A } });
  });
});

describe('listPolicies', () => {
  beforeEach(() => prismaMock.insurancePolicy.findMany.mockResolvedValue([policyRow()]));

  const whereOf = () => prismaMock.insurancePolicy.findMany.mock.calls.at(-1)![0].where;
  const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it('sans statut : filtre par agence (et bien) seulement', async () => {
    await service.listPolicies(TENANT_A, { propertyId: 'prop-a' }, NOW);
    expect(whereOf()).toEqual({ tenantId: TENANT_A, propertyId: 'prop-a' });
  });

  it.each([
    ['UPCOMING', { startDate: { gte: day('2026-10-02') } }],
    ['EXPIRED', { endDate: { lt: day('2026-10-01') } }],
    [
      'EXPIRING_SOON',
      { startDate: { lt: day('2026-10-02') }, endDate: { gte: day('2026-10-01'), lt: day('2026-11-01') } }
    ],
    ['ACTIVE', { startDate: { lt: day('2026-10-02') }, endDate: { gte: day('2026-11-01') } }]
  ])('le statut %s est traduit en plages de dates dans le where Prisma', async (status, expected) => {
    await service.listPolicies(TENANT_A, { status }, NOW);
    expect(whereOf()).toEqual({ tenantId: TENANT_A, ...expected });
  });
});
