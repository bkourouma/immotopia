/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/external-access/view — vue publique d'un accès tiers lue par son jeton,
 * et téléchargement d'un document partagé.
 *
 * Mocks à la frontière : `utils/database` (délégués Prisma), `lib/secure-links`
 * (vérification du jeton), calcul de rendement, quotes-parts, lecture de
 * fichier et journal d'audit. Aucune base réelle (la preuve sur base réelle est
 * dans `__tests__/integration/external-access.db.test.ts`).
 */

import { NotFoundError } from '../../src/middleware/error-middleware';
import { getTenantContext } from '../../src/utils/tenant-context';

const TENANT = 'tenant-a';
const GRANT = 'grant-1';

const fns: Record<string, jest.Mock> = {};
const delegate = (name: string, methods: string[]) =>
  Object.fromEntries(
    methods.map(method => {
      const key = `${name}.${method}`;
      fns[key] = jest.fn();
      return [method, (...a: any[]) => fns[key](...a)];
    })
  );

jest.mock('../../src/utils/database', () => ({
  prisma: {
    externalAccessGrant: delegate('externalAccessGrant', ['findFirst', 'updateMany']),
    externalAccessGrantProperty: delegate('externalAccessGrantProperty', ['findMany']),
    externalAccessGrantEntity: delegate('externalAccessGrantEntity', ['findMany']),
    externalAccessGrantDocument: delegate('externalAccessGrantDocument', ['findMany', 'findFirst']),
    holdingEntity: delegate('holdingEntity', ['findMany']),
    propertyHolding: delegate('propertyHolding', ['findMany']),
    property: delegate('property', ['findMany']),
    assetValuation: delegate('assetValuation', ['findMany']),
    propertyLoan: delegate('propertyLoan', ['findMany']),
    propertyExpense: delegate('propertyExpense', ['findMany']),
    rentalLease: delegate('rentalLease', ['findMany']),
    propertyDocument: delegate('propertyDocument', ['findMany'])
  }
}));

const verifySecureLink = jest.fn();
jest.mock('../../src/lib/secure-links', () => {
  const { NotFoundError: NF } = jest.requireActual('../../src/middleware/error-middleware');
  return {
    verifySecureLink: (...a: any[]) => verifySecureLink(...a),
    invalidSecureLinkError: () => new NF('Lien invalide ou expiré.')
  };
});

const buildPropertyYieldInput = jest.fn();
jest.mock('../../src/lib/patrimoine/queries', () => ({
  buildPropertyYieldInput: (...a: any[]) => buildPropertyYieldInput(...a)
}));

const ownerSharesByProperty = jest.fn();
jest.mock('../../src/lib/ownership/service', () => ({
  ownerSharesByProperty: (...a: any[]) => ownerSharesByProperty(...a)
}));

const getPropertyDocumentFileForTenant = jest.fn();
jest.mock('../../src/lib/properties/document-files', () => ({
  getPropertyDocumentFileForTenant: (...a: any[]) => getPropertyDocumentFileForTenant(...a)
}));

const logAuditEvent = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: any[]) => logAuditEvent(...a)
}));

import { getExternalAccessDocumentByToken, getExternalAccessViewByToken } from '../../src/lib/external-access/view';

const DAY = 24 * 60 * 60 * 1000;
const TOKEN = 'T'.repeat(43);

const link = (overrides: Record<string, unknown> = {}) => ({
  id: 'link-1',
  tenantId: TENANT,
  scope: 'EXTERNAL_ACCESS_GRANT',
  objectType: 'ExternalAccessGrant',
  objectId: GRANT,
  expiresAt: new Date('2026-10-20T10:00:00.000Z'),
  ...overrides
});

const grantRow = (overrides: Record<string, unknown> = {}) => ({
  id: GRANT,
  type: 'BANKER',
  recipientName: 'Banque Atlantique',
  sections: ['VALUATIONS', 'YIELD_RATIOS', 'LOANS'],
  expiresAt: null,
  revokedAt: null,
  ownerClientId: 'client-1',
  ownerClient: { tenantId: TENANT, user: { fullName: 'Awa Koné' } },
  tenant: { name: 'Agence Alpha' },
  ...overrides
});

const PROPERTIES = [
  {
    id: 'p1',
    internalReference: 'REF-1',
    title: 'Villa A',
    address: '1 rue A',
    locationZone: 'Cocody',
    propertyType: 'MAISON_VILLA',
    surfaceArea: 220,
    ownershipType: 'TENANT'
  },
  {
    id: 'p2',
    internalReference: 'REF-2',
    title: 'Studio B',
    address: '2 rue B',
    locationZone: null,
    propertyType: 'STUDIO',
    surfaceArea: null,
    ownershipType: 'CLIENT'
  }
];

function setup(overrides: { grant?: any; properties?: any[] } = {}) {
  verifySecureLink.mockResolvedValue(link());
  fns['externalAccessGrant.findFirst'].mockResolvedValue(overrides.grant === undefined ? grantRow() : overrides.grant);
  fns['externalAccessGrant.updateMany'].mockResolvedValue({ count: 1 });
  fns['externalAccessGrantProperty.findMany'].mockResolvedValue([{ propertyId: 'p1' }, { propertyId: 'p2' }]);
  fns['externalAccessGrantEntity.findMany'].mockResolvedValue([]);
  fns['property.findMany'].mockResolvedValue(overrides.properties ?? PROPERTIES);
  ownerSharesByProperty.mockResolvedValue(new Map([['p1', 50]]));
  buildPropertyYieldInput.mockResolvedValue({
    annualRent: 6_000_000,
    currentValue: 100_000_000,
    costBasis: 60_000_000,
    annualExpenses: 1_000_000,
    annualLoanPayments: 3_000_000,
    loans: []
  });
  fns['assetValuation.findMany'].mockResolvedValue([
    {
      propertyId: 'p1',
      valuatedAt: new Date('2026-06-01'),
      estimatedValue: '100000000.00',
      acquisitionCost: null,
      currency: 'XOF',
      method: 'EXPERT_APPRAISAL'
    },
    {
      propertyId: 'p1',
      valuatedAt: new Date('2025-01-01'),
      estimatedValue: '80000000.00',
      acquisitionCost: '60000000.00',
      currency: 'XOF',
      method: 'MANUAL'
    }
  ]);
  fns['propertyLoan.findMany'].mockResolvedValue([
    {
      propertyId: 'p1',
      lender: 'Banque X',
      capitalAmount: '40000000',
      remainingCapital: '30000000',
      interestRate: '5.5',
      monthlyPayment: '500000',
      currency: 'XOF',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2034-01-01'),
      status: 'ACTIVE'
    }
  ]);
  fns['propertyExpense.findMany'].mockResolvedValue([
    { propertyId: 'p1', paidAt: new Date(Date.now() - 10 * DAY), category: 'INSURANCE', amount: '250000' },
    { propertyId: 'p1', paidAt: new Date(Date.now() - 500 * DAY), category: 'OTHER', amount: '100000' }
  ]);
  fns['rentalLease.findMany'].mockResolvedValue([
    {
      property_id: 'p1',
      status: 'ACTIVE',
      start_date: new Date('2025-01-01'),
      end_date: null,
      rent_amount: '600000',
      service_charge_amount: '50000',
      billing_frequency: 'MONTHLY'
    }
  ]);
  fns['externalAccessGrantDocument.findMany'].mockResolvedValue([
    {
      id: 'ref-1',
      propertyId: 'p1',
      document: {
        propertyId: 'p1',
        tenantId: TENANT,
        documentType: 'TITLE_DEED',
        fileName: 'Titre.pdf',
        fileSize: 1234,
        mimeType: 'application/pdf',
        createdAt: new Date('2026-01-01')
      }
    }
  ]);
  fns['propertyHolding.findMany'].mockResolvedValue([
    {
      propertyId: 'p1',
      entityId: 'e1',
      sharePercent: '60',
      entity: { tenantId: TENANT, name: 'SCI Palmiers', legalForm: 'SCI', country: 'CI', rccm: 'RCCM-1', taxId: null }
    }
  ]);
}

/** Toutes les clés rencontrées sous un `select` (récursif), pour traquer un champ interdit. */
function selectedKeys(args: any, out = new Set<string>(), inSelect = false): Set<string> {
  if (!args || typeof args !== 'object') return out;
  for (const [key, value] of Object.entries(args)) {
    if (inSelect) out.add(key);
    selectedKeys(value, out, inSelect || key === 'select');
  }
  return out;
}

/** Vrai si `where` nomme l'agence attendue (directement ou dans chaque branche d'un OR). */
function namesTenant(where: any): boolean {
  if (!where || typeof where !== 'object') return false;
  if (where.tenantId === TENANT || where.tenant_id === TENANT) return true;
  if (Array.isArray(where.AND)) return where.AND.some(namesTenant);
  // Une branche d'OR peut nommer le champ avec `null` (bien CLIENT sous mandat) : le garde-fou
  // Prisma l'accepte, à condition que chaque branche nomme le champ.
  if (Array.isArray(where.OR)) {
    return (
      where.OR.length > 0 &&
      where.OR.every(
        (branch: any) => namesTenant(branch) || (branch && 'tenantId' in branch && branch.tenantId === null)
      )
    );
  }
  return false;
}

const ALL_READ_FNS = [
  'externalAccessGrant.findFirst',
  'externalAccessGrantProperty.findMany',
  'externalAccessGrantEntity.findMany',
  'externalAccessGrantDocument.findMany',
  'externalAccessGrantDocument.findFirst',
  'holdingEntity.findMany',
  'propertyHolding.findMany',
  'property.findMany',
  'assetValuation.findMany',
  'propertyLoan.findMany',
  'propertyExpense.findMany',
  'rentalLease.findMany',
  'propertyDocument.findMany'
];

function allCalls(): Array<{ name: string; args: any }> {
  return ALL_READ_FNS.flatMap(name => fns[name].mock.calls.map(call => ({ name, args: call[0] })));
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const fn of Object.values(fns)) fn.mockReset();
  verifySecureLink.mockReset();
  buildPropertyYieldInput.mockReset();
  ownerSharesByProperty.mockReset();
  getPropertyDocumentFileForTenant.mockReset();
});

describe('vue : rubriques accordées uniquement', () => {
  it('banquier : valorisation, rendement, prêts — la vue n’interroge aucune autre table et ne renvoie rien d’autre', async () => {
    setup();
    const view = await getExternalAccessViewByToken(TOKEN, { ip: '203.0.113.1', userAgent: 'UA/1' });

    expect(view.sections).toEqual(['VALUATIONS', 'YIELD_RATIOS', 'LOANS']);
    expect(view.grantType).toBe('BANKER');
    expect(view.agencyName).toBe('Agence Alpha');
    expect(view.ownerName).toBe('Awa Koné');
    expect(view.accessExpiresAt).toBeNull();
    expect(view.linkExpiresAt).toBe('2026-10-20T10:00:00.000Z');

    const [p1, p2] = view.properties;
    expect(p1.valuation).toMatchObject({ estimatedValue: 100_000_000, acquisitionCost: 60_000_000, currency: 'XOF' });
    expect(p1.valuation?.history).toHaveLength(2);
    expect(p1.valuation?.latentCapitalGain).toBe(40_000_000);
    expect(p1.yield).toMatchObject({ annualRent: 6_000_000, annualExpenses: 1_000_000 });
    expect(p1.yield?.netNetYield).toBeCloseTo(((6_000_000 - 1_000_000 - 3_000_000) / 60_000_000) * 100);
    expect(p1.loans).toHaveLength(1);
    expect(p1.sharePercent).toBe(50);
    expect(p2.valuation).toBeNull();
    expect(p2.sharePercent).toBeNull();

    // Clés absentes, pas seulement vides.
    for (const property of view.properties) {
      for (const absent of ['expenses', 'rents', 'documents', 'titles']) expect(property).not.toHaveProperty(absent);
    }
    // Tables des rubriques non accordées : jamais interrogées.
    expect(fns['propertyExpense.findMany']).not.toHaveBeenCalled();
    expect(fns['rentalLease.findMany']).not.toHaveBeenCalled();
    expect(fns['externalAccessGrantDocument.findMany']).not.toHaveBeenCalled();
    expect(fns['propertyHolding.findMany']).not.toHaveBeenCalled();
    expect(fns['propertyDocument.findMany']).not.toHaveBeenCalled();
    // Totaux pondérés par la quote-part du propriétaire désigné (50 % de p1).
    expect(view.summary).toEqual({
      propertyCount: 2,
      ownerShareApplied: true,
      totalEstimatedValue: 50_000_000,
      totalLatentCapitalGain: 20_000_000,
      totalRemainingLoanCapital: 15_000_000
    });
  });

  it('expert-comptable : dépenses sans texte libre, loyers sans identité, aucune valorisation', async () => {
    setup({ grant: grantRow({ type: 'ACCOUNTANT', sections: ['EXPENSES', 'RENTS', 'LOANS'] }) });
    const view = await getExternalAccessViewByToken(TOKEN, {});
    const p1 = view.properties[0];

    expect(p1.expenses?.totalLast12Months).toBe(250_000);
    expect(p1.expenses?.items).toEqual([
      { date: expect.any(String), category: 'INSURANCE', amount: 250_000 },
      { date: expect.any(String), category: 'OTHER', amount: 100_000 }
    ]);
    expect(p1.rents).toEqual([
      {
        status: 'ACTIVE',
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: null,
        rentAmount: 600_000,
        chargesAmount: 50_000,
        billingFrequency: 'MONTHLY'
      }
    ]);
    expect(p1).not.toHaveProperty('valuation');
    expect(p1).not.toHaveProperty('yield');
    expect(view.summary).not.toHaveProperty('totalEstimatedValue');
    // Ni valorisation ni rendement demandés : ni table de valorisation, ni calcul de rendement.
    expect(fns['assetValuation.findMany']).not.toHaveBeenCalled();
    expect(buildPropertyYieldInput).not.toHaveBeenCalled();
  });

  // Le moteur de rendement (`buildPropertyYieldInput`) est simulé ici : en réel il lit lui-même baux,
  // dépenses et prêts pour la plus-value latente. Ce test ne prouve que ce que la VUE interroge.
  it('notaire : titres, documents liés (ref opaque) et valorisation (tables propres de la vue seulement)', async () => {
    setup({ grant: grantRow({ type: 'NOTARY', sections: ['VALUATIONS', 'DOCUMENTS', 'TITLES_OWNERSHIP'] }) });
    // L'entité e1 est explicitement listée dans le grant : seule elle peut être nommée.
    fns['externalAccessGrantEntity.findMany'].mockResolvedValue([{ entityId: 'e1' }]);
    fns['holdingEntity.findMany'].mockResolvedValue([{ id: 'e1' }]);
    const view = await getExternalAccessViewByToken(TOKEN, {});
    const p1 = view.properties[0];

    expect(p1.titles).toEqual({
      propertyType: 'MAISON_VILLA',
      surface: 220,
      ownershipType: 'TENANT',
      holdings: [
        { entityName: 'SCI Palmiers', legalForm: 'SCI', country: 'CI', rccm: 'RCCM-1', taxId: null, sharePercent: 60 }
      ],
      otherHoldersSharePercent: null,
      ownerSharePercent: 50
    });
    expect(p1.documents).toEqual([
      {
        ref: 'ref-1',
        fileName: 'Titre.pdf',
        documentType: 'TITLE_DEED',
        fileSize: 1234,
        mimeType: 'application/pdf',
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    ]);
    expect(p1).not.toHaveProperty('yield');
    expect(p1).not.toHaveProperty('loans');
    expect(fns['propertyLoan.findMany']).not.toHaveBeenCalled();
    expect(fns['propertyExpense.findMany']).not.toHaveBeenCalled();
  });

  it('le net-net, qui se déduit des mensualités, n’est pas renvoyé sans la rubrique prêts', async () => {
    setup({ grant: grantRow({ sections: ['YIELD_RATIOS'] }) });
    const view = await getExternalAccessViewByToken(TOKEN, {});
    expect(view.properties[0].yield?.netNetYield).toBeNull();
    expect(view.properties[0]).not.toHaveProperty('loans');
    expect(view.summary).not.toHaveProperty('totalRemainingLoanCapital');
  });

  it('un document dont le bien ne correspond pas à la ligne de liaison, ou d’une autre agence, ne sort pas', async () => {
    setup({ grant: grantRow({ sections: ['DOCUMENTS'] }) });
    fns['externalAccessGrantDocument.findMany'].mockResolvedValue([
      {
        id: 'r1',
        propertyId: 'p1',
        document: {
          propertyId: 'p2',
          tenantId: TENANT,
          documentType: 'OTHER',
          fileName: 'a',
          fileSize: 1,
          mimeType: null,
          createdAt: new Date()
        }
      },
      {
        id: 'r2',
        propertyId: 'p1',
        document: {
          propertyId: 'p1',
          tenantId: 'tenant-b',
          documentType: 'OTHER',
          fileName: 'b',
          fileSize: 1,
          mimeType: null,
          createdAt: new Date()
        }
      },
      {
        id: 'r3',
        propertyId: 'p1',
        document: {
          propertyId: 'p1',
          tenantId: null,
          documentType: 'OTHER',
          fileName: 'c',
          fileSize: 1,
          mimeType: null,
          createdAt: new Date()
        }
      }
    ]);
    const view = await getExternalAccessViewByToken(TOKEN, {});
    expect(view.properties[0].documents?.map(d => d.ref)).toEqual(['r3']);
  });
});

describe('vue : aucune donnée sensible, tout filtré par agence', () => {
  const FORBIDDEN_SELECTED = [
    'filePath',
    'fileUrl',
    'file_path',
    'email',
    'phonePrimary',
    'whatsappNumber',
    'passwordHash',
    'label',
    'supplierName',
    'notes',
    'receiptUrl',
    'description',
    'primary_renter_client_id',
    'terms_json',
    'contactId',
    'tenantId'
  ];

  it('chaque requête nomme l’agence du grant ; aucun champ de contact, de texte libre ou de chemin n’est sélectionné', async () => {
    setup({
      grant: grantRow({
        sections: ['VALUATIONS', 'YIELD_RATIOS', 'LOANS', 'EXPENSES', 'RENTS', 'DOCUMENTS', 'TITLES_OWNERSHIP']
      })
    });
    await getExternalAccessViewByToken(TOKEN, {});

    const calls = allCalls();
    expect(calls.length).toBeGreaterThan(8);
    for (const { name, args } of calls) {
      expect({ name, ok: namesTenant(args.where) }).toEqual({ name, ok: true });
    }
    // `tenantId` n'est sélectionné que pour revérifier le propriétaire désigné
    // (modèle TenantClient, relation imbriquée) : jamais sur un bien.
    for (const { name, args } of calls) {
      const keys = selectedKeys(args);
      for (const forbidden of FORBIDDEN_SELECTED.filter(key => key !== 'tenantId')) {
        expect({ name, forbidden, present: keys.has(forbidden) }).toEqual({ name, forbidden, present: false });
      }
      if (name === 'property.findMany') expect(keys.has('tenantId')).toBe(false);
    }
    // Le calcul de rendement reçoit l'agence du grant, pour chaque bien du périmètre.
    expect(buildPropertyYieldInput.mock.calls.map(c => c.slice(0, 2))).toEqual([
      [TENANT, 'p1'],
      [TENANT, 'p2']
    ]);
    expect(ownerSharesByProperty).toHaveBeenCalledWith(TENANT, 'client-1', ['p1', 'p2']);
  });

  it('les requêtes ne contiennent que des identifiants issus du lien et de la base, jamais de l’appelant', async () => {
    setup({ grant: grantRow({ sections: ['VALUATIONS', 'DOCUMENTS'] }) });
    await getExternalAccessViewByToken(TOKEN, { ip: 'ip-appelant', userAgent: 'ua-appelant' });
    const blob = JSON.stringify(allCalls());
    expect(blob).not.toContain(TOKEN);
    expect(blob).not.toContain('ip-appelant');
    expect(blob).not.toContain('ua-appelant');
    expect(fns['externalAccessGrant.findFirst'].mock.calls[0][0].where).toEqual({ id: GRANT, tenantId: TENANT });
  });

  it('s’exécute sous le contexte d’agence du grant', async () => {
    setup();
    const seen: Array<string | undefined> = [];
    fns['externalAccessGrant.findFirst'].mockImplementation(async () => {
      seen.push(getTenantContext()?.tenantId);
      return grantRow();
    });
    fns['property.findMany'].mockImplementation(async () => {
      seen.push(getTenantContext()?.tenantId);
      return PROPERTIES;
    });
    await getExternalAccessViewByToken(TOKEN, {});
    expect(seen).toEqual([TENANT, TENANT]);
  });

  it('parcours JSON complet : aucune clé ni valeur d’identité, de contact ou d’identifiant technique', async () => {
    setup({
      grant: grantRow({
        sections: ['VALUATIONS', 'YIELD_RATIOS', 'LOANS', 'EXPENSES', 'RENTS', 'DOCUMENTS', 'TITLES_OWNERSHIP']
      })
    });
    const view = await getExternalAccessViewByToken(TOKEN, {});
    const keys: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
          keys.push(key);
          walk(item);
        }
      }
    };
    walk(view);
    const banned =
      /^(id|tenantId|tenant_id|propertyId|entityId|ownerClientId|ownerUserId|grantId|documentId|userId|filePath|fileUrl|file_path|downloadPath|email|phone|phonePrimary|whatsappNumber|label|notes|description|supplierName|renter|tenantName|recipientEmail)$/;
    expect(keys.filter(key => banned.test(key))).toEqual([]);

    const blob = JSON.stringify(view);
    for (const secret of ['p1"', 'p2"', TENANT, GRANT, 'client-1', '/uploads/', '@']) {
      expect(blob).not.toContain(secret);
    }
    // Le nom du bénéficiaire (informatif) est le seul « nom propre » ; ni son e-mail, ni un jeton.
    expect(blob).not.toContain(TOKEN);
  });
});

describe('vue : refus uniformes', () => {
  const uniform = { message: 'Lien invalide ou expiré.', statusCode: 404 };

  it.each([
    ['grant introuvable', () => setup({ grant: null })],
    ['grant révoqué', () => setup({ grant: grantRow({ revokedAt: new Date() }) })],
    ['grant expiré', () => setup({ grant: grantRow({ expiresAt: new Date(Date.now() - 1000) }) })],
    ['périmètre disparu', () => setup({ properties: [] })]
  ])('%s : même 404', async (_label, arrange) => {
    arrange();
    await expect(getExternalAccessViewByToken(TOKEN, {})).rejects.toMatchObject(uniform);
    // Aucune consultation comptée ni journalisée pour un refus.
    expect(fns['externalAccessGrant.updateMany']).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('un lien dont l’objet n’est pas un grant est refusé sans aucune lecture', async () => {
    setup();
    verifySecureLink.mockResolvedValue(link({ objectType: 'OwnerStatement' }));
    await expect(getExternalAccessViewByToken(TOKEN, {})).rejects.toMatchObject(uniform);
    expect(allCalls()).toHaveLength(0);
  });

  it('un jeton refusé par la vérification (inconnu, expiré, révoqué, autre portée) ne déclenche aucune lecture', async () => {
    verifySecureLink.mockRejectedValue(new NotFoundError('Lien invalide ou expiré.'));
    await expect(getExternalAccessViewByToken(TOKEN, {})).rejects.toMatchObject(uniform);
    expect(allCalls()).toHaveLength(0);
    // La portée demandée est celle des accès tiers, jamais une autre.
    expect(verifySecureLink).toHaveBeenCalledWith(TOKEN, 'EXTERNAL_ACCESS_GRANT');
  });

  it('un bien qui sort du périmètre pendant le calcul (NotFoundError du rendement) donne la même 404', async () => {
    setup();
    buildPropertyYieldInput.mockRejectedValue(new NotFoundError('Bien introuvable ou inaccessible pour ce tenant'));
    await expect(getExternalAccessViewByToken(TOKEN, {})).rejects.toMatchObject(uniform);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('une panne inattendue n’est pas déguisée en lien invalide', async () => {
    setup();
    fns['property.findMany'].mockRejectedValue(new Error('connexion perdue'));
    await expect(getExternalAccessViewByToken(TOKEN, {})).rejects.toThrow('connexion perdue');
  });
});

describe('vue : périmètre explicite et entités', () => {
  it('les entités détentrices sont développées en biens, refiltrées par agence', async () => {
    setup();
    fns['externalAccessGrantProperty.findMany'].mockResolvedValue([{ propertyId: 'p1' }]);
    fns['externalAccessGrantEntity.findMany'].mockResolvedValue([{ entityId: 'e1' }]);
    fns['holdingEntity.findMany'].mockResolvedValue([{ id: 'e1' }]);
    fns['propertyHolding.findMany'].mockResolvedValue([{ propertyId: 'p2' }, { propertyId: 'p-etranger' }]);
    await getExternalAccessViewByToken(TOKEN, {});

    expect(fns['holdingEntity.findMany'].mock.calls[0][0].where).toEqual({ tenantId: TENANT, id: { in: ['e1'] } });
    expect(fns['propertyHolding.findMany'].mock.calls[0][0].where).toEqual({
      tenantId: TENANT,
      entityId: { in: ['e1'] }
    });
    // Les candidats (liste + développement) passent tous par le filtre de périmètre de l'agence.
    const scopeWhere = fns['property.findMany'].mock.calls[0][0].where;
    expect(scopeWhere.AND[0]).toEqual({ id: { in: ['p1', 'p2', 'p-etranger'] } });
    const rule = scopeWhere.AND[1].OR;
    expect(rule[0]).toEqual({ tenantId: TENANT });
    expect(rule[1]).toMatchObject({ tenantId: null, ownershipType: 'CLIENT' });
    expect(rule[1].mandates.some).toMatchObject({ tenantId: TENANT, isActive: true, revokedAt: null });
  });

  it('une entité d’une autre agence n’étend rien (aucune détention lue)', async () => {
    setup();
    fns['externalAccessGrantProperty.findMany'].mockResolvedValue([{ propertyId: 'p1' }]);
    fns['externalAccessGrantEntity.findMany'].mockResolvedValue([{ entityId: 'e-autre' }]);
    fns['holdingEntity.findMany'].mockResolvedValue([]);
    await getExternalAccessViewByToken(TOKEN, {});
    expect(fns['propertyHolding.findMany']).not.toHaveBeenCalled();
  });

  it('le propriétaire désigné d’une autre agence est ignoré (ni nom, ni quote-part)', async () => {
    setup({ grant: grantRow({ ownerClient: { tenantId: 'tenant-b', user: { fullName: 'Intrus' } } }) });
    const view = await getExternalAccessViewByToken(TOKEN, {});
    expect(view.ownerName).toBeNull();
    expect(ownerSharesByProperty).not.toHaveBeenCalled();
    expect(JSON.stringify(view)).not.toContain('Intrus');
    expect(view.summary.ownerShareApplied).toBe(false);
  });
});

describe('vue : journal et compteur', () => {
  it('compte la consultation et journalise IP, user-agent tronqué et rubriques, jamais le jeton', async () => {
    setup();
    await getExternalAccessViewByToken(TOKEN, { ip: '203.0.113.9', userAgent: `Mozilla\n${'x'.repeat(900)}` });

    expect(fns['externalAccessGrant.updateMany']).toHaveBeenCalledWith({
      where: { id: GRANT, tenantId: TENANT },
      data: { viewCount: { increment: 1 }, lastViewedAt: expect.any(Date) }
    });
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    const entry = logAuditEvent.mock.calls[0][0];
    expect(entry).toMatchObject({
      actorUserId: null,
      tenantId: TENANT,
      actionKey: 'EXTERNAL_ACCESS_GRANT_VIEWED',
      entityType: 'ExternalAccessGrant',
      entityId: GRANT,
      ipAddress: '203.0.113.9',
      payload: { grantId: GRANT, linkId: 'link-1', sections: ['VALUATIONS', 'YIELD_RATIOS', 'LOANS'] }
    });
    expect(entry.userAgent.length).toBeLessThanOrEqual(500);
    expect(entry.userAgent).not.toContain('\n');
    expect(JSON.stringify(entry)).not.toContain(TOKEN);
    expect(JSON.stringify(entry)).not.toContain('@');
  });

  it('un échec du compteur ne transforme pas une lecture réussie en erreur', async () => {
    setup();
    fns['externalAccessGrant.updateMany'].mockRejectedValue(new Error('base occupée'));
    await expect(getExternalAccessViewByToken(TOKEN, {})).resolves.toBeDefined();
    // La trace d'audit n'est pas perdue pour autant.
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('un échec de l’audit ne bloque ni la lecture ni le compteur', async () => {
    setup();
    logAuditEvent.mockImplementationOnce(() => {
      throw new Error('file pleine');
    });
    await expect(getExternalAccessViewByToken(TOKEN, {})).resolves.toBeDefined();
    expect(fns['externalAccessGrant.updateMany']).toHaveBeenCalledTimes(1);
  });
});

describe('vue : titres — jamais d’identité de co-indivisaire', () => {
  const holding = (overrides: Record<string, any>) => ({
    propertyId: 'p1',
    entityId: 'e-x',
    sharePercent: '10',
    entity: { tenantId: TENANT, name: 'X', legalForm: 'SCI', country: 'CI', rccm: null, taxId: null },
    ...overrides
  });

  it('détaille seulement les personnes morales du grant ; le reste devient une somme anonyme', async () => {
    setup({ grant: grantRow({ sections: ['TITLES_OWNERSHIP'] }) });
    fns['externalAccessGrantEntity.findMany'].mockResolvedValue([{ entityId: 'e1' }]);
    fns['holdingEntity.findMany'].mockResolvedValue([{ id: 'e1' }]);
    fns['propertyHolding.findMany'].mockResolvedValue([
      holding({
        entityId: 'e1',
        sharePercent: '50',
        entity: { tenantId: TENANT, name: 'SCI Palmiers', legalForm: 'SCI', country: 'CI', rccm: 'R1', taxId: 'T1' }
      }),
      holding({
        entityId: 'e-hors-grant',
        sharePercent: '20',
        entity: {
          tenantId: TENANT,
          name: 'SOCIETE-HORS-GRANT',
          legalForm: 'COMPANY',
          country: 'CI',
          rccm: 'R2',
          taxId: 'T2'
        }
      }),
      holding({
        entityId: 'e-pp',
        sharePercent: '25.5',
        entity: {
          tenantId: TENANT,
          name: 'PERSONNE-PHYSIQUE',
          legalForm: 'INDIVIDUAL',
          country: 'CI',
          rccm: null,
          taxId: 'NCC-SECRET'
        }
      }),
      holding({
        entityId: 'e-autre-agence',
        sharePercent: '4.5',
        entity: {
          tenantId: 'tenant-b',
          name: 'ENTITE-AUTRE-AGENCE',
          legalForm: 'SCI',
          country: 'CI',
          rccm: null,
          taxId: null
        }
      })
    ]);

    const view = await getExternalAccessViewByToken(TOKEN, {});
    const titles = view.properties[0].titles!;
    expect(titles.holdings).toEqual([
      { entityName: 'SCI Palmiers', legalForm: 'SCI', country: 'CI', rccm: 'R1', taxId: 'T1', sharePercent: 50 }
    ]);
    expect(titles.otherHoldersSharePercent).toBe(50);

    // Balayage JSON complet : aucun nom ni identifiant des autres détenteurs.
    const blob = JSON.stringify(view);
    for (const secret of [
      'SOCIETE-HORS-GRANT',
      'PERSONNE-PHYSIQUE',
      'NCC-SECRET',
      'ENTITE-AUTRE-AGENCE',
      'e-pp',
      'e-hors-grant',
      'T2',
      'R2'
    ]) {
      expect(blob).not.toContain(secret);
    }
  });

  it('accès par biens seuls (aucune entité listée) : aucune société ni personne physique nommée, tout en somme anonyme', async () => {
    setup({ grant: grantRow({ sections: ['TITLES_OWNERSHIP'] }) });
    fns['propertyHolding.findMany'].mockResolvedValue([
      holding({
        entityId: 'e1',
        sharePercent: '70',
        entity: { tenantId: TENANT, name: 'SCI A', legalForm: 'SCI', country: 'CI', rccm: null, taxId: null }
      }),
      holding({
        entityId: 'e-pp',
        sharePercent: '30',
        entity: { tenantId: TENANT, name: 'PP', legalForm: 'INDIVIDUAL', country: 'CI', rccm: null, taxId: 'SECRET' }
      })
    ]);
    const view = await getExternalAccessViewByToken(TOKEN, {});
    expect(view.properties[0].titles!.holdings).toEqual([]);
    expect(view.properties[0].titles!.otherHoldersSharePercent).toBe(100);
    const blob = JSON.stringify(view);
    for (const secret of ['SECRET', 'SCI A', 'PP', 'e1', 'e-pp']) expect(blob).not.toContain(secret);
  });
});

describe('vue : plafond de biens, concurrence et bornes', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ...PROPERTIES[0],
      id: `px${i}`,
      internalReference: `R${i}`,
      title: `Bien ${String(i).padStart(3, '0')}`
    }));

  it('au-delà de 100 biens développés : tronqué aux 100 premiers, summary.truncated vrai, rendement par lots de 5', async () => {
    setup({ grant: grantRow({ sections: ['YIELD_RATIOS'] }), properties: many(101) });
    let running = 0;
    let peak = 0;
    buildPropertyYieldInput.mockImplementation(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise(resolve => setTimeout(resolve, 1));
      running -= 1;
      return { annualRent: 1, currentValue: 10, costBasis: 0, annualExpenses: 0, annualLoanPayments: 0, loans: [] };
    });

    const view = await getExternalAccessViewByToken(TOKEN, {});
    expect(view.properties).toHaveLength(100);
    expect(view.summary.propertyCount).toBe(100);
    expect(view.summary.truncated).toBe(true);
    expect(buildPropertyYieldInput).toHaveBeenCalledTimes(100);
    expect(peak).toBeLessThanOrEqual(5);
    // La requête de périmètre demande une ligne de plus que le plafond, pour détecter le dépassement.
    expect(fns['property.findMany'].mock.calls[0][0].take).toBe(101);
  });

  it('sous le plafond : pas de clé truncated', async () => {
    setup();
    const view = await getExternalAccessViewByToken(TOKEN, {});
    expect(view.summary).not.toHaveProperty('truncated');
  });

  it('dépenses : au plus 200 lignes par bien', async () => {
    setup({ grant: grantRow({ sections: ['EXPENSES'] }) });
    fns['propertyExpense.findMany'].mockResolvedValue(
      Array.from({ length: 250 }, (_, i) => ({
        propertyId: 'p1',
        paidAt: new Date(Date.now() - (i + 1) * 60_000),
        category: 'OTHER',
        amount: '10'
      }))
    );
    const view = await getExternalAccessViewByToken(TOKEN, {});
    expect(view.properties[0].expenses!.items).toHaveLength(200);
    // Le total reste calculé sur toutes les lignes des 12 derniers mois.
    expect(view.properties[0].expenses!.totalLast12Months).toBe(2500);
  });

  it('bien sans valorisation : rendement brut et net à null (jamais un 0 % trompeur)', async () => {
    setup({ grant: grantRow({ sections: ['YIELD_RATIOS', 'LOANS'] }) });
    buildPropertyYieldInput.mockResolvedValue({
      annualRent: 6_000_000,
      currentValue: 0,
      costBasis: 0,
      annualExpenses: 0,
      annualLoanPayments: 0,
      loans: []
    });
    const view = await getExternalAccessViewByToken(TOKEN, {});
    expect(view.properties[0].yield).toMatchObject({
      grossYield: null,
      netYield: null,
      netNetYield: null,
      annualRent: 6_000_000
    });
  });
});

describe('téléchargement d’un document partagé', () => {
  const file = { buffer: Buffer.from('PDF'), fileName: 'Titre.pdf', mimeType: 'application/pdf' };

  function setupDownload(overrides: { grant?: any; row?: any; scope?: any[] } = {}) {
    setup({ grant: overrides.grant ?? grantRow({ sections: ['DOCUMENTS'] }) });
    fns['externalAccessGrantDocument.findFirst'].mockResolvedValue(
      overrides.row === undefined
        ? {
            propertyId: 'p1',
            documentId: 'doc-1',
            document: { propertyId: 'p1', tenantId: TENANT, fileName: 'Titre foncier' }
          }
        : overrides.row
    );
    if (overrides.scope) fns['property.findMany'].mockResolvedValue(overrides.scope);
    getPropertyDocumentFileForTenant.mockResolvedValue(file);
  }

  it('sert le fichier après revérification du lien, du grant, de la rubrique, de la liaison et du périmètre', async () => {
    setupDownload();
    const result = await getExternalAccessDocumentByToken(TOKEN, 'ref-1', { ip: '203.0.113.5', userAgent: 'UA' });

    expect(result).toBe(file);
    expect(verifySecureLink).toHaveBeenCalledWith(TOKEN, 'EXTERNAL_ACCESS_GRANT');
    expect(fns['externalAccessGrantDocument.findFirst'].mock.calls[0][0].where).toEqual({
      id: 'ref-1',
      grantId: GRANT,
      tenantId: TENANT
    });
    expect(getPropertyDocumentFileForTenant).toHaveBeenCalledWith(TENANT, 'p1', 'doc-1', { managedByMandate: true });
    expect(logAuditEvent.mock.calls[0][0]).toMatchObject({
      actorUserId: null,
      tenantId: TENANT,
      actionKey: 'EXTERNAL_ACCESS_GRANT_DOCUMENT_DOWNLOADED',
      entityId: GRANT,
      ipAddress: '203.0.113.5',
      userAgent: 'UA',
      payload: { grantId: GRANT, documentRef: 'ref-1', documentName: 'Titre foncier', sections: ['DOCUMENTS'] }
    });
    expect(JSON.stringify(logAuditEvent.mock.calls)).not.toContain(TOKEN);
  });

  it.each([
    ['rubrique DOCUMENTS non accordée', () => setupDownload({ grant: grantRow({ sections: ['VALUATIONS'] }) })],
    ['grant révoqué', () => setupDownload({ grant: grantRow({ sections: ['DOCUMENTS'], revokedAt: new Date() }) })],
    [
      'grant expiré',
      () => setupDownload({ grant: grantRow({ sections: ['DOCUMENTS'], expiresAt: new Date(Date.now() - 1) }) })
    ],
    ['référence hors grant', () => setupDownload({ row: null })],
    [
      'document rattaché à un autre bien que la liaison',
      () =>
        setupDownload({
          row: { propertyId: 'p1', documentId: 'd', document: { propertyId: 'p2', tenantId: TENANT, fileName: 'x' } }
        })
    ],
    [
      'document d’une autre agence',
      () =>
        setupDownload({
          row: {
            propertyId: 'p1',
            documentId: 'd',
            document: { propertyId: 'p1', tenantId: 'tenant-b', fileName: 'x' }
          }
        })
    ],
    ['bien sorti du périmètre', () => setupDownload({ scope: [PROPERTIES[1]] })]
  ])('%s : même 404, aucun fichier lu, aucun téléchargement journalisé', async (_label, arrange) => {
    arrange();
    await expect(getExternalAccessDocumentByToken(TOKEN, 'ref-1', {})).rejects.toMatchObject({
      message: 'Lien invalide ou expiré.',
      statusCode: 404
    });
    expect(getPropertyDocumentFileForTenant).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('fichier absent du disque : la NotFoundError du fichier devient la même 404 uniforme', async () => {
    setupDownload();
    getPropertyDocumentFileForTenant.mockRejectedValue(new NotFoundError('Document introuvable.'));
    await expect(getExternalAccessDocumentByToken(TOKEN, 'ref-1', {})).rejects.toMatchObject({
      message: 'Lien invalide ou expiré.'
    });
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('jeton refusé : aucune lecture', async () => {
    verifySecureLink.mockRejectedValue(new NotFoundError('Lien invalide ou expiré.'));
    await expect(getExternalAccessDocumentByToken(TOKEN, 'ref-1', {})).rejects.toBeInstanceOf(NotFoundError);
    expect(allCalls()).toHaveLength(0);
  });
});
