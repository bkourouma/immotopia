/**
 * Lot D — outils du registre ImmoCopilot (lib/ai/tools/*).
 * Services et Prisma sont remplacés ; `document-context-builder` n'est jamais
 * importé (erreurs TypeScript préexistantes que ts-jest bloquerait).
 */
import { z } from 'zod';

const mockPrisma = {
  rentalLease: { findFirst: jest.fn() },
  rentalInstallment: { findFirst: jest.fn() },
  rentalPaymentAllocation: { findMany: jest.fn() },
  rentalDocument: { findFirst: jest.fn() },
  auditLog: { findFirst: jest.fn(), create: jest.fn() }
};
const mockListProperties = jest.fn();
const mockListLeases = jest.fn();
const mockListDocuments = jest.fn();
const mockGetDocuments = jest.fn();
const mockGetPropertyForTenant = jest.fn();
const mockResolveTemplate = jest.fn();
const mockLogAudit = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/property-service', () => ({
  listProperties: (...a: unknown[]) => mockListProperties(...a)
}));
jest.mock('../../src/services/rental-lease-service', () => ({ listLeases: (...a: unknown[]) => mockListLeases(...a) }));
jest.mock('../../src/services/rental-document-service', () => ({
  listDocuments: (...a: unknown[]) => mockListDocuments(...a)
}));
jest.mock('../../src/services/property-document-service', () => ({
  getDocuments: (...a: unknown[]) => mockGetDocuments(...a)
}));
jest.mock('../../src/utils/property-tenant-guard', () => ({
  getPropertyForTenant: (...a: unknown[]) => mockGetPropertyForTenant(...a)
}));
jest.mock('../../src/services/document-template-service', () => ({
  resolveTemplate: (...a: unknown[]) => mockResolveTemplate(...a)
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: (...a: unknown[]) => mockLogAudit(...a) }));
jest.mock('../../src/services/document-generation-service', () => ({ generateDocument: jest.fn() }));

import { ForbiddenError, NotFoundError } from '../../src/middleware/error-middleware';
import type { CopilotToolContext, CopilotToolDefinition } from '../../src/lib/ai/contracts';
import { ALL_TOOLS, toLlmToolSpecs, toolsForUser } from '../../src/lib/ai/tools/registry';
import { MAX_MODEL_RESULT_BYTES } from '../../src/lib/ai/tools/tool-utils';
import { resetProposalUsageForTests, verifyProposal } from '../../src/lib/ai/proposal-token';

const TENANT = 'tenant-a';
const USER = 'user-1';
const LEASE_ID = '11111111-1111-4111-8111-111111111111';
const PROPERTY_ID = '44444444-4444-4444-8444-444444444444';
const PAYMENT_ID = '22222222-2222-4222-8222-222222222222';
const INSTALLMENT_ID = '33333333-3333-4333-8333-333333333333';

const ALL_PERMS = ['PROPERTIES_VIEW', 'RENTAL_LEASES_VIEW', 'RENTAL_DOCUMENTS_VIEW', 'RENTAL_DOCUMENTS_GENERATE'];

const ctx = (perms: string[] = ALL_PERMS): CopilotToolContext => ({
  tenantId: TENANT,
  userId: USER,
  permissions: new Set(perms),
  requestId: 'req-1',
  conversationId: 'conv-1',
  signal: new AbortController().signal
});

const tool = (name: string): CopilotToolDefinition => {
  const found = ALL_TOOLS.find(t => t.name === name);
  if (!found) throw new Error(`outil ${name} absent`);
  return found;
};

/** Champs sensibles qui ne doivent jamais sortir (plan §4, lot D). */
const FORBIDDEN = ['email', 'phone', 'file_path', 'filePath', 'mm_phone', 'owner', 'notes', 'passwordHash'];
function expectNoSensitive(value: unknown): void {
  const json = JSON.stringify(value);
  for (const key of FORBIDDEN) expect(json).not.toContain(key);
  for (const leak of ['secret@example.com', '+2250700000000', '/var/data/private', 'Marie Proprietaire']) {
    expect(json).not.toContain(leak);
  }
}

const leaseRow = () => ({
  id: LEASE_ID,
  lease_number: 'L-00012',
  currency: 'FCFA',
  property: { internalReference: 'BIEN-1', title: 'Appartement Cocody' },
  primaryRenter: { user: { fullName: 'Awa Koné' } }
});

beforeEach(() => {
  jest.clearAllMocks();
  resetProposalUsageForTests();
  mockPrisma.rentalLease.findFirst.mockResolvedValue(leaseRow());
  mockGetPropertyForTenant.mockResolvedValue({ id: PROPERTY_ID });
});

describe('registre', () => {
  it('ne contient que les 5 outils du plan, sans outil d’exécution', () => {
    expect(ALL_TOOLS.map(t => t.name).sort()).toEqual(
      [
        'list_lease_documents',
        'list_property_documents',
        'propose_rental_document',
        'search_leases',
        'search_properties'
      ].sort()
    );
    expect(ALL_TOOLS.some(t => /execute/i.test(t.name))).toBe(false);
  });

  it.each([
    ['search_properties', 'PROPERTIES_VIEW'],
    ['search_leases', 'RENTAL_LEASES_VIEW'],
    ['list_lease_documents', 'RENTAL_DOCUMENTS_VIEW'],
    ['list_property_documents', 'PROPERTIES_VIEW'],
    ['propose_rental_document', 'RENTAL_DOCUMENTS_GENERATE']
  ])('%s exige %s', (name, permission) => {
    expect(tool(name).requiredPermission).toBe(permission);
    expect(toolsForUser(new Set([permission])).map(t => t.name)).toContain(name);
    const others = ALL_PERMS.filter(p => p !== permission);
    expect(toolsForUser(new Set(others)).map(t => t.name)).not.toContain(name);
  });

  it('filtre le registre selon les permissions', () => {
    expect(toolsForUser(new Set<string>())).toEqual([]);
    expect(
      toolsForUser(['PROPERTIES_VIEW'])
        .map(t => t.name)
        .sort()
    ).toEqual(['list_property_documents', 'search_properties']);
    expect(toolsForUser(new Set(ALL_PERMS))).toHaveLength(5);
  });

  it('filtre aussi selon les droits d’abonnement quand ils sont fournis', () => {
    const core = toolsForUser(new Set(ALL_PERMS), new Set(['CORE'] as const));
    expect(core.map(t => t.name).sort()).toEqual(['list_property_documents', 'search_properties']);
    expect(toolsForUser(new Set(ALL_PERMS), [])).toEqual([]);
  });

  it('expose des spécifications neutres avec additionalProperties:false', () => {
    const specs = toLlmToolSpecs(toolsForUser(new Set(ALL_PERMS)));
    expect(specs).toHaveLength(5);
    for (const spec of specs) expect(spec.inputSchema.additionalProperties).toBe(false);
  });

  it.each(ALL_TOOLS.map(t => [t.name]))('%s : le schéma JSON écrit à la main correspond au schéma Zod', name => {
    const definition = tool(name);
    const shape = (definition.inputSchema as unknown as z.ZodObject<z.ZodRawShape>).shape;
    const json = definition.jsonSchema as {
      type: string;
      additionalProperties: boolean;
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(json.type).toBe('object');
    expect(json.additionalProperties).toBe(false);
    expect(Object.keys(json.properties).sort()).toEqual(Object.keys(shape).sort());
    const required = Object.entries(shape)
      .filter(([, schema]) => !schema.isOptional())
      .map(([key]) => key)
      .sort();
    expect([...(json.required ?? [])].sort()).toEqual(required);
  });

  it.each(ALL_TOOLS.map(t => [t.name]))('%s : une clé tenantId ou userId en entrée est rejetée', name => {
    const definition = tool(name);
    const valid: Record<string, unknown> = { leaseId: LEASE_ID, propertyId: PROPERTY_ID, docType: 'RENT_STATEMENT' };
    for (const extra of ['tenantId', 'userId', 'tenant_id']) {
      const parsed = definition.inputSchema.safeParse({ ...valid, [extra]: 'tenant-b' });
      expect(parsed.success).toBe(false);
    }
  });
});

describe('permissions à l’exécution', () => {
  const calls: Array<[string, Record<string, unknown>]> = [
    ['search_properties', {}],
    ['search_leases', {}],
    ['list_lease_documents', { leaseId: LEASE_ID }],
    ['list_property_documents', { propertyId: PROPERTY_ID }],
    ['propose_rental_document', { docType: 'RENT_RECEIPT', leaseId: LEASE_ID, period: '2026-08' }]
  ];

  it.each(calls)('%s sans sa permission lève ForbiddenError et n’appelle aucun service', async (name, input) => {
    await expect(tool(name).execute(input, ctx([]))).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockListProperties).not.toHaveBeenCalled();
    expect(mockListLeases).not.toHaveBeenCalled();
    expect(mockListDocuments).not.toHaveBeenCalled();
    expect(mockGetDocuments).not.toHaveBeenCalled();
    expect(mockPrisma.rentalLease.findFirst).not.toHaveBeenCalled();
  });
});

describe('search_properties', () => {
  const property = (i: number, extra: Record<string, unknown> = {}) => ({
    id: `p-${i}`,
    internalReference: `BIEN-${i}`,
    title: `Appartement ${i}`,
    propertyType: 'APPARTEMENT',
    status: 'AVAILABLE',
    ownershipType: 'TENANT',
    tenantId: TENANT,
    locationZone: 'Cocody',
    address: 'Rue 12',
    price: 500000,
    currency: 'XOF',
    bedrooms: 3,
    surfaceArea: 80,
    description: 'Texte libre',
    notes: 'note interne',
    owner: { id: 'o', email: 'secret@example.com', fullName: 'Marie Proprietaire' },
    tenant: { id: TENANT, name: 'Agence A' },
    media: [{ fileUrl: `/uploads/properties/p-${i}/a.jpg`, filePath: '/var/data/private/a.jpg' }],
    ...extra
  });

  it('passe tenantId et userId du contexte, jamais de l’entrée', async () => {
    mockListProperties.mockResolvedValue({ properties: [property(1)], total: 1 });
    await tool('search_properties').execute({ city: 'Cocody' }, ctx());
    expect(mockListProperties).toHaveBeenCalledWith(
      TENANT,
      USER,
      expect.objectContaining({ city: 'Cocody', page: 1, limit: 10 })
    );
  });

  it('projette sans e-mail, propriétaire, chemin de fichier ni note', async () => {
    mockListProperties.mockResolvedValue({ properties: [property(1)], total: 1 });
    const result = await tool('search_properties').execute({}, ctx());
    expectNoSensitive(result.modelResult);
    expectNoSensitive(result.uiEvent);
    expect(result.uiEvent).toMatchObject({
      type: 'property_results',
      total: 1,
      items: [{ id: 'p-1', thumbnailUrl: '/uploads/properties/p-1/a.jpg', address: 'Rue 12' }]
    });
    expect(JSON.stringify(result.modelResult)).not.toContain('thumbnailUrl');
  });

  it('écarte les biens PUBLIC d’autres agences et plafonne à 10 éléments', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => property(i));
    rows.splice(
      2,
      0,
      property(99, { ownershipType: 'PUBLIC', tenantId: null }),
      property(98, { tenantId: 'tenant-b' })
    );
    mockListProperties.mockResolvedValue({ properties: rows, total: 27 });
    const result = await tool('search_properties').execute({ limit: 10 }, ctx());
    const items = result.modelResult.items as Array<{ id: string }>;
    expect(items.length).toBeLessThanOrEqual(10);
    expect(items.map(i => i.id)).not.toContain('p-99');
    expect(items.map(i => i.id)).not.toContain('p-98');
  });

  it('garde le résultat sous 8 Ko même avec des titres énormes', async () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      property(i, { title: 'T'.repeat(3000), address: 'A'.repeat(3000) })
    );
    mockListProperties.mockResolvedValue({ properties: rows, total: 10 });
    const result = await tool('search_properties').execute({}, ctx());
    expect(Buffer.byteLength(JSON.stringify(result.modelResult))).toBeLessThanOrEqual(MAX_MODEL_RESULT_BYTES);
    expect(result.modelResult.truncated).toBe(true);
  });
});

describe('search_leases', () => {
  const lease = (n: number, name: string) => ({
    id: `l-${n}`,
    lease_number: `L-0000${n}`,
    status: 'ACTIVE',
    currency: 'FCFA',
    rent_amount: '250000',
    start_date: new Date('2025-01-01T00:00:00Z'),
    notes: 'note interne',
    property: { internalReference: 'BIEN-1', title: 'Appartement' },
    primaryRenter: { user: { fullName: name, email: 'secret@example.com' } }
  });

  it('cherche par numéro de bail via le service, tenantId du contexte', async () => {
    mockListLeases.mockResolvedValue({
      data: [lease(1, 'Awa Koné')],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
    });
    const result = await tool('search_leases').execute({ leaseNumber: 'L-0000' }, ctx());
    expect(mockListLeases).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ search: 'L-0000' }),
      expect.anything()
    );
    expectNoSensitive(result.modelResult);
    expectNoSensitive(result.uiEvent);
    expect(result.uiEvent).toMatchObject({
      type: 'lease_results',
      items: [{ leaseNumber: 'L-00001', renterName: 'Awa Koné', rentAmount: '250000', startDate: '2025-01-01' }]
    });
  });

  it('filtre en mémoire sur le nom du locataire, sans tenir compte des accents', async () => {
    mockListLeases.mockResolvedValue({
      data: [lease(1, 'Awa Koné'), lease(2, 'Jean Traoré'), lease(3, 'Kone Ibrahim')],
      pagination: { page: 1, limit: 50, total: 3, totalPages: 1 }
    });
    const result = await tool('search_leases').execute({ renterName: 'kone' }, ctx());
    expect((result.modelResult.items as Array<{ id: string }>).map(i => i.id)).toEqual(['l-1', 'l-3']);
  });

  it('refuse un bien d’une autre agence (NotFoundError) sans interroger les baux', async () => {
    mockGetPropertyForTenant.mockRejectedValue(new NotFoundError('Bien introuvable.'));
    await expect(tool('search_leases').execute({ propertyId: PROPERTY_ID }, ctx())).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(mockGetPropertyForTenant).toHaveBeenCalledWith(PROPERTY_ID, TENANT);
    expect(mockListLeases).not.toHaveBeenCalled();
  });
});

describe('list_lease_documents', () => {
  const doc = {
    id: 'd-1',
    type: 'RENT_RECEIPT',
    status: 'FINAL',
    document_number: 'RCU-202608-0001',
    issued_at: new Date('2026-08-31T00:00:00Z'),
    file_path: '/var/data/private/rcu.docx',
    createdBy: { id: 'u', email: 'secret@example.com', fullName: 'Agent' },
    payment: { id: 'p', amount: '1', method: 'CASH' },
    mm_phone: '+2250700000000'
  };

  it('liste les documents d’un bail de l’agence sans chemin de fichier ni auteur', async () => {
    mockListDocuments.mockResolvedValue({ data: [doc], pagination: {} });
    const result = await tool('list_lease_documents').execute({ leaseId: LEASE_ID }, ctx());
    expect(mockPrisma.rentalLease.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: LEASE_ID, tenant_id: TENANT }, select: expect.any(Object) })
    );
    expect(mockListDocuments).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ leaseId: LEASE_ID }),
      expect.anything()
    );
    expectNoSensitive(result.modelResult);
    expectNoSensitive(result.uiEvent);
    expect(result.uiEvent).toMatchObject({
      type: 'document_list',
      scope: 'lease',
      items: [{ id: 'd-1', kind: 'rental', label: 'RCU-202608-0001', downloadable: true, date: '2026-08-31' }]
    });
  });

  it('rejette le bail d’une autre agence (NotFoundError) sans lister', async () => {
    mockPrisma.rentalLease.findFirst.mockResolvedValue(null);
    await expect(tool('list_lease_documents').execute({ leaseId: LEASE_ID }, ctx())).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(mockListDocuments).not.toHaveBeenCalled();
  });
});

describe('list_property_documents', () => {
  it('liste les pièces d’un bien de l’agence sans chemin de fichier', async () => {
    mockGetDocuments.mockResolvedValue([
      {
        id: 'pd-1',
        documentType: 'TITLE_DEED',
        fileName: 'titre.pdf',
        expirationDate: new Date('2020-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-02T00:00:00Z'),
        filePath: '/var/data/private/titre.pdf'
      }
    ]);
    const result = await tool('list_property_documents').execute({ propertyId: PROPERTY_ID }, ctx());
    expect(mockGetPropertyForTenant).toHaveBeenCalledWith(PROPERTY_ID, TENANT);
    expect(mockGetDocuments).toHaveBeenCalledWith(PROPERTY_ID, TENANT, true);
    expectNoSensitive(result.modelResult);
    expect(result.uiEvent).toMatchObject({
      scope: 'property',
      items: [{ id: 'pd-1', kind: 'property', status: 'EXPIRED', date: '2026-01-02' }]
    });
  });

  it('rejette le bien d’une autre agence (NotFoundError) sans lister', async () => {
    mockGetPropertyForTenant.mockRejectedValue(new NotFoundError('Bien introuvable.'));
    await expect(tool('list_property_documents').execute({ propertyId: PROPERTY_ID }, ctx())).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(mockGetDocuments).not.toHaveBeenCalled();
  });
});

describe('propose_rental_document', () => {
  const receiptInput = { docType: 'RENT_RECEIPT', leaseId: LEASE_ID, period: '2026-08' };
  const successPayment = (over: Record<string, unknown> = {}) => ({
    id: PAYMENT_ID,
    status: 'SUCCESS',
    lease_id: LEASE_ID,
    amount: { toString: () => '250000' },
    currency: 'FCFA',
    succeeded_at: new Date('2026-08-05T00:00:00Z'),
    ...over
  });

  beforeEach(() => {
    mockPrisma.rentalInstallment.findFirst.mockResolvedValue({ id: INSTALLMENT_ID });
    mockPrisma.rentalPaymentAllocation.findMany.mockResolvedValue([{ payment: successPayment() }]);
    mockPrisma.rentalDocument.findFirst.mockResolvedValue(null);
    mockResolveTemplate.mockResolvedValue({ id: 'tpl-1' });
  });

  it('propose une quittance : jeton signé dans l’événement, absent du résultat du modèle', async () => {
    const result = await tool('propose_rental_document').execute(receiptInput, ctx());

    expect(mockPrisma.rentalInstallment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: TENANT, lease_id: LEASE_ID, period_year: 2026, period_month: 8 }
      })
    );
    expect(result.uiEvent?.type).toBe('action_proposal');
    if (result.uiEvent?.type !== 'action_proposal') throw new Error('proposition attendue');
    const { proposal } = result.uiEvent;
    expect(proposal).toMatchObject({
      action: 'GENERATE_RENTAL_DOCUMENT',
      documentType: 'RENT_RECEIPT',
      summary: {
        leaseId: LEASE_ID,
        leaseNumber: 'L-00012',
        renterName: 'Awa Koné',
        amount: '250000',
        currency: 'FCFA'
      }
    });
    const claims = verifyProposal(proposal.token, { userId: USER, tenantId: TENANT });
    expect(claims.args).toEqual({
      docType: 'RENT_RECEIPT',
      leaseId: LEASE_ID,
      paymentId: PAYMENT_ID,
      installmentId: INSTALLMENT_ID
    });
    expect(claims.jti).toBe(proposal.proposalId);

    expect(JSON.stringify(result.modelResult)).not.toContain(proposal.token);
    expect(result.modelResult).toMatchObject({ status: 'PROPOSAL_READY', proposalId: proposal.proposalId });
    expectNoSensitive(result.modelResult);
  });

  it('n’écrit rien hors l’audit AI_PROPOSAL_ISSUED', async () => {
    await tool('propose_rental_document').execute(receiptInput, ctx());
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'AI_PROPOSAL_ISSUED', actorUserId: USER, tenantId: TENANT })
    );
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('sans paiement encaissé : NOT_POSSIBLE / NO_PAYMENT, aucune proposition', async () => {
    mockPrisma.rentalPaymentAllocation.findMany.mockResolvedValue([
      { payment: successPayment({ status: 'PENDING' }) },
      { payment: successPayment({ status: 'FAILED' }) }
    ]);
    const result = await tool('propose_rental_document').execute(receiptInput, ctx());
    expect(result.modelResult).toMatchObject({ status: 'NOT_POSSIBLE', reason: 'NO_PAYMENT' });
    expect(result.uiEvent).toBeUndefined();
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it('ignore un paiement rattaché à un autre bail', async () => {
    mockPrisma.rentalPaymentAllocation.findMany.mockResolvedValue([
      { payment: successPayment({ lease_id: 'autre-bail' }) }
    ]);
    const result = await tool('propose_rental_document').execute(receiptInput, ctx());
    expect(result.modelResult).toMatchObject({ reason: 'NO_PAYMENT' });
    expect(result.uiEvent).toBeUndefined();
  });

  it('sans échéance pour la période : NO_INSTALLMENT', async () => {
    mockPrisma.rentalInstallment.findFirst.mockResolvedValue(null);
    const result = await tool('propose_rental_document').execute(receiptInput, ctx());
    expect(result.modelResult).toMatchObject({ status: 'NOT_POSSIBLE', reason: 'NO_INSTALLMENT' });
    expect(result.uiEvent).toBeUndefined();
  });

  it('sans modèle : NO_TEMPLATE, sans exposer le message de l’exception', async () => {
    mockResolveTemplate.mockRejectedValue(new Error('SECRET: template introuvable pour tenant-a en base'));
    const result = await tool('propose_rental_document').execute(receiptInput, ctx());
    expect(result.modelResult).toMatchObject({ status: 'NOT_POSSIBLE', reason: 'NO_TEMPLATE' });
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(result.uiEvent).toBeUndefined();
  });

  it('quittance FINAL existante : document_list au lieu d’une proposition', async () => {
    mockPrisma.rentalDocument.findFirst.mockResolvedValue({
      id: 'doc-1',
      document_number: 'RCU-202608-0001',
      status: 'FINAL',
      issued_at: new Date('2026-08-31T00:00:00Z'),
      file_path: '/var/data/private/rcu.docx'
    });
    const result = await tool('propose_rental_document').execute(receiptInput, ctx());
    expect(mockPrisma.rentalDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT,
          type: 'RENT_RECEIPT',
          status: 'FINAL',
          payment_id: PAYMENT_ID
        })
      })
    );
    expect(result.modelResult).toMatchObject({ status: 'ALREADY_EXISTS' });
    expect(result.uiEvent).toMatchObject({ type: 'document_list', scope: 'lease', items: [{ id: 'doc-1' }] });
    expectNoSensitive(result);
    expect(mockLogAudit).not.toHaveBeenCalled();
    expect(mockResolveTemplate).not.toHaveBeenCalled();
  });

  it('exige la période pour une quittance', async () => {
    const result = await tool('propose_rental_document').execute({ docType: 'RENT_RECEIPT', leaseId: LEASE_ID }, ctx());
    expect(result.modelResult).toMatchObject({ status: 'NOT_POSSIBLE', reason: 'MISSING_PERIOD' });
  });

  it('rejette le bail d’une autre agence : pas de proposition', async () => {
    mockPrisma.rentalLease.findFirst.mockResolvedValue(null);
    await expect(tool('propose_rental_document').execute(receiptInput, ctx())).rejects.toBeInstanceOf(NotFoundError);
    expect(mockLogAudit).not.toHaveBeenCalled();
    expect(mockPrisma.rentalInstallment.findFirst).not.toHaveBeenCalled();
  });

  describe('relevé de compte', () => {
    const statement = (startDate: string, endDate: string) => ({
      docType: 'RENT_STATEMENT',
      leaseId: LEASE_ID,
      startDate,
      endDate
    });

    it('propose un relevé de 12 mois exactement', async () => {
      const result = await tool('propose_rental_document').execute(statement('2025-09-01', '2026-08-31'), ctx());
      expect(result.uiEvent).toMatchObject({
        type: 'action_proposal',
        proposal: { documentType: 'RENT_STATEMENT', summary: { amount: null, leaseNumber: 'L-00012' } }
      });
      expect(mockResolveTemplate).toHaveBeenCalledWith(TENANT, 'RENT_STATEMENT');
    });

    it('refuse plus de 12 mois', async () => {
      const result = await tool('propose_rental_document').execute(statement('2025-09-01', '2026-09-01'), ctx());
      expect(result.modelResult).toMatchObject({ status: 'NOT_POSSIBLE', reason: 'PERIOD_TOO_LONG' });
      expect(result.uiEvent).toBeUndefined();
    });

    it('refuse des dates inversées ou inexistantes', async () => {
      const inverted = await tool('propose_rental_document').execute(statement('2026-08-31', '2026-08-01'), ctx());
      expect(inverted.modelResult).toMatchObject({ reason: 'INVALID_PERIOD' });
      const impossible = await tool('propose_rental_document').execute(statement('2026-02-30', '2026-03-31'), ctx());
      expect(impossible.modelResult).toMatchObject({ reason: 'INVALID_PERIOD' });
    });

    it('exige les deux dates', async () => {
      const result = await tool('propose_rental_document').execute(
        { docType: 'RENT_STATEMENT', leaseId: LEASE_ID },
        ctx()
      );
      expect(result.modelResult).toMatchObject({ reason: 'MISSING_PERIOD' });
    });

    it('sans modèle de relevé : NO_TEMPLATE', async () => {
      mockResolveTemplate.mockRejectedValue(new Error('détail interne'));
      const result = await tool('propose_rental_document').execute(statement('2026-01-01', '2026-06-30'), ctx());
      expect(result.modelResult).toMatchObject({ reason: 'NO_TEMPLATE' });
      expect(JSON.stringify(result)).not.toContain('détail interne');
    });
  });
});
