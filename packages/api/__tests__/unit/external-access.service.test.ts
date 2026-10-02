/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/external-access/service — API d'agence des accès tiers de confiance.
 *
 * Mocks à la frontière : `utils/database` (délégués Prisma), `lib/secure-links`
 * (création et révocation des liens), envoi d'e-mail et journal d'audit.
 */

import { BadRequestError, ConflictError, NotFoundError } from '../../src/middleware/error-middleware';

const TENANT = 'tenant-a';
const ACTOR = 'user-1';
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

jest.mock('../../src/utils/database', () => {
  const prisma: any = {
    externalAccessGrant: delegate('externalAccessGrant', [
      'findFirst',
      'findMany',
      'create',
      'updateMany',
      'deleteMany'
    ]),
    externalAccessGrantProperty: delegate('externalAccessGrantProperty', ['createMany', 'deleteMany']),
    externalAccessGrantEntity: delegate('externalAccessGrantEntity', ['createMany', 'deleteMany']),
    externalAccessGrantDocument: delegate('externalAccessGrantDocument', ['createMany', 'deleteMany']),
    tenantClient: delegate('tenantClient', ['findFirst', 'findMany']),
    property: delegate('property', ['findMany']),
    holdingEntity: delegate('holdingEntity', ['findMany']),
    propertyHolding: delegate('propertyHolding', ['findMany']),
    propertyDocument: delegate('propertyDocument', ['findMany']),
    propertyOwnershipShare: delegate('propertyOwnershipShare', ['findMany']),
    tenant: delegate('tenant', ['findUnique']),
    auditLog: delegate('auditLog', ['findMany'])
  };
  prisma.$transaction = async (fn: (tx: any) => Promise<unknown>) => fn(prisma);
  return { prisma };
});

const createSecureLink = jest.fn();
const revokeSecureLinksForObject = jest.fn();
const countActiveSecureLinksByObject = jest.fn();
jest.mock('../../src/lib/secure-links', () => ({
  createSecureLink: (...a: any[]) => createSecureLink(...a),
  revokeSecureLinksForObject: (...a: any[]) => revokeSecureLinksForObject(...a),
  countActiveSecureLinksByObject: (...a: any[]) => countActiveSecureLinksByObject(...a)
}));

const sendExternalAccessLinkEmail = jest.fn();
jest.mock('../../src/lib/external-access/mailer', () => ({
  NOT_REQUESTED: { sent: false, reason: 'NOT_REQUESTED' },
  sendExternalAccessLinkEmail: (...a: any[]) => sendExternalAccessLinkEmail(...a)
}));

const logAuditEvent = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: any[]) => logAuditEvent(...a)
}));

import {
  createExternalAccessGrant,
  getExternalAccessGrantDetail,
  getExternalAccessScopeOptions,
  listExternalAccessGrants,
  listExternalAccessLog,
  listPropertyDocumentsForSharing,
  revokeExternalAccessGrant,
  sendExternalAccessLink,
  updateExternalAccessGrant
} from '../../src/lib/external-access/service';
import { createGrantSchema, updateGrantSchema } from '../../src/lib/external-access/schemas';

const DAY = 24 * 60 * 60 * 1000;
const TOKEN = 'SECRET-TOKEN-' + 'x'.repeat(30);
const URL = `https://app.example.test/acces-partage#${TOKEN}`;

const summaryRow = (overrides: Record<string, unknown> = {}) => ({
  id: GRANT,
  type: 'NOTARY',
  recipientName: 'Maître Koné',
  recipientEmail: 'notaire@example.test',
  ownerClientId: 'client-1',
  sections: ['TITLES_OWNERSHIP', 'DOCUMENTS', 'VALUATIONS'],
  expiresAt: null,
  revokedAt: null,
  viewCount: 3,
  lastViewedAt: new Date('2026-10-01T10:00:00Z'),
  lastLinkSentAt: new Date('2026-09-30T10:00:00Z'),
  createdAt: new Date('2026-09-29T10:00:00Z'),
  ownerClient: { user: { fullName: 'Awa Koné' } },
  _count: { properties: 2, entities: 1, documents: 1 },
  properties: [{ property: { id: 'p1', title: 'Villa A', internalReference: 'REF-1' } }],
  entities: [{ entity: { id: 'e1', name: 'SCI Palmiers' } }],
  documents: [{ propertyId: 'p1', document: { id: 'doc-1', fileName: 'Titre.pdf' } }],
  ...overrides
});

function createInput(overrides: Record<string, unknown> = {}) {
  return createGrantSchema.parse({
    type: 'NOTARY',
    recipientName: 'Maître Koné',
    recipientEmail: 'notaire@example.test',
    propertyIds: ['p1'],
    ...overrides
  });
}

/** Un contexte « tout existe » : bien p1 dans le périmètre, propriétaire connu, document partageable. */
function arrangeHappyCreate() {
  fns['tenantClient.findFirst'].mockResolvedValue({ id: 'client-1' });
  fns['property.findMany'].mockResolvedValue([{ id: 'p1' }]);
  fns['holdingEntity.findMany'].mockResolvedValue([]);
  fns['propertyHolding.findMany'].mockResolvedValue([]);
  fns['propertyDocument.findMany'].mockResolvedValue([]);
  fns['externalAccessGrant.create'].mockResolvedValue({
    id: GRANT,
    type: 'NOTARY',
    recipientName: 'Maître Koné',
    recipientEmail: 'notaire@example.test',
    expiresAt: null
  });
  fns['externalAccessGrant.findFirst'].mockResolvedValue(summaryRow());
  fns['externalAccessGrant.updateMany'].mockResolvedValue({ count: 1 });
  fns['tenant.findUnique'].mockResolvedValue({ name: 'Agence Alpha' });
  createSecureLink.mockResolvedValue({
    id: 'link-1',
    token: TOKEN,
    url: URL,
    expiresAt: new Date(Date.now() + 7 * DAY)
  });
  countActiveSecureLinksByObject.mockResolvedValue(new Map([[GRANT, 1]]));
  sendExternalAccessLinkEmail.mockResolvedValue({ sent: true });
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const fn of Object.values(fns)) fn.mockReset();
  createSecureLink.mockReset();
  revokeSecureLinksForObject.mockReset().mockResolvedValue(0);
  countActiveSecureLinksByObject.mockReset().mockResolvedValue(new Map());
  sendExternalAccessLinkEmail.mockReset();
});

describe('création', () => {
  it('applique les rubriques par défaut du type, crée le périmètre et renvoie le lien UNE fois', async () => {
    arrangeHappyCreate();
    const result = await createExternalAccessGrant(TENANT, ACTOR, createInput({ type: 'BANKER' }));

    const data = fns['externalAccessGrant.create'].mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: TENANT,
      type: 'BANKER',
      sections: ['VALUATIONS', 'YIELD_RATIOS', 'LOANS'],
      expiresAt: null,
      createdByUserId: ACTOR
    });
    expect(fns['externalAccessGrantProperty.createMany'].mock.calls[0][0].data).toEqual([
      { tenantId: TENANT, grantId: GRANT, propertyId: 'p1' }
    ]);
    expect(result.link).toEqual({ id: 'link-1', url: URL, expiresAt: expect.any(Date) });
    expect(result.email).toEqual({ sent: true });
    // Le jeton ne sort que dans `link.url` : ni dans le détail du grant, ni ailleurs.
    expect(JSON.stringify(result.grant)).not.toContain(TOKEN);
    expect(JSON.stringify({ ...result, link: undefined })).not.toContain(TOKEN);
  });

  it('crée le lien du grant, plafonné à son expiration, sans jamais passer le jeton à l’audit', async () => {
    arrangeHappyCreate();
    const expiresAt = new Date(Date.now() + 3 * DAY);
    fns['externalAccessGrant.create'].mockResolvedValue({
      id: GRANT,
      type: 'NOTARY',
      recipientName: 'N',
      recipientEmail: 'n@example.test',
      expiresAt
    });
    await createExternalAccessGrant(
      TENANT,
      ACTOR,
      createInput({ expiresAt: expiresAt.toISOString(), linkTtlDays: 10 })
    );

    expect(createSecureLink).toHaveBeenCalledWith({
      tenantId: TENANT,
      scope: 'EXTERNAL_ACCESS_GRANT',
      objectType: 'ExternalAccessGrant',
      objectId: GRANT,
      createdByUserId: ACTOR,
      ttlDays: 10,
      maxExpiresAt: expiresAt
    });
    expect(JSON.stringify(logAuditEvent.mock.calls)).not.toContain(TOKEN);
    expect(JSON.stringify(logAuditEvent.mock.calls)).not.toContain('notaire@example.test');
    const actions = logAuditEvent.mock.calls.map(c => c[0].actionKey);
    expect(actions).toEqual(['EXTERNAL_ACCESS_GRANT_CREATED', 'EXTERNAL_ACCESS_GRANT_LINK_SENT']);
    for (const [entry] of logAuditEvent.mock.calls) {
      expect(entry).toMatchObject({ tenantId: TENANT, entityType: 'ExternalAccessGrant', entityId: GRANT });
    }
  });

  it('aucun audit « créé » pour un grant supprimé par compensation ; audit « créé » avant l’envoi sinon', async () => {
    arrangeHappyCreate();
    createSecureLink.mockRejectedValue(new Error('base indisponible'));
    await expect(createExternalAccessGrant(TENANT, ACTOR, createInput())).rejects.toThrow();
    expect(fns['externalAccessGrant.deleteMany']).toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();

    createSecureLink.mockResolvedValue({ id: 'link-1', token: TOKEN, url: URL, expiresAt: new Date(Date.now() + DAY) });
    await createExternalAccessGrant(TENANT, ACTOR, createInput());
    expect(logAuditEvent.mock.calls[0][0].actionKey).toBe('EXTERNAL_ACCESS_GRANT_CREATED');
  });

  it('envoie l’e-mail au destinataire du grant, avec l’URL, et mémorise l’envoi', async () => {
    arrangeHappyCreate();
    await createExternalAccessGrant(TENANT, ACTOR, createInput());
    expect(sendExternalAccessLinkEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        agencyName: 'Agence Alpha',
        recipientEmail: 'notaire@example.test',
        accessUrl: URL
      })
    );
    expect(fns['externalAccessGrant.updateMany']).toHaveBeenCalledWith({
      where: { id: GRANT, tenantId: TENANT },
      data: { lastLinkSentAt: expect.any(Date) }
    });
  });

  it('sendEmail=false : lien créé, aucun envoi, raison NOT_REQUESTED', async () => {
    arrangeHappyCreate();
    const result = await createExternalAccessGrant(TENANT, ACTOR, createInput({ sendEmail: false }));
    expect(sendExternalAccessLinkEmail).not.toHaveBeenCalled();
    expect(result.email).toEqual({ sent: false, reason: 'NOT_REQUESTED' });
  });

  it('un échec d’envoi n’annule pas le grant : le lien reste remis, la raison est signalée', async () => {
    arrangeHappyCreate();
    sendExternalAccessLinkEmail.mockResolvedValue({ sent: false, reason: 'SEND_FAILED' });
    const result = await createExternalAccessGrant(TENANT, ACTOR, createInput());
    expect(result.email).toEqual({ sent: false, reason: 'SEND_FAILED' });
    expect(result.link.url).toBe(URL);
    expect(fns['externalAccessGrant.deleteMany']).not.toHaveBeenCalled();
  });

  it('une durée de lien hors bornes est refusée AVANT toute écriture (400)', async () => {
    arrangeHappyCreate();
    await expect(
      createExternalAccessGrant(TENANT, ACTOR, { ...createInput(), linkTtlDays: 365 })
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(fns['externalAccessGrant.create']).not.toHaveBeenCalled();
    expect(createSecureLink).not.toHaveBeenCalled();
  });

  it('un échec de création du lien défait la création (pas de grant orphelin)', async () => {
    arrangeHappyCreate();
    createSecureLink.mockRejectedValue(new Error('base indisponible'));
    await expect(createExternalAccessGrant(TENANT, ACTOR, createInput())).rejects.toThrow('base indisponible');
    expect(fns['externalAccessGrant.deleteMany']).toHaveBeenCalledWith({ where: { id: GRANT, tenantId: TENANT } });
    expect(sendExternalAccessLinkEmail).not.toHaveBeenCalled();
  });

  it('une panne APRÈS l’envoi de l’e-mail ne supprime jamais le grant (la compensation ne couvre que la création du lien)', async () => {
    arrangeHappyCreate();
    fns['externalAccessGrant.updateMany'].mockRejectedValue(new Error('base occupée'));
    await expect(createExternalAccessGrant(TENANT, ACTOR, createInput())).rejects.toThrow('base occupée');
    expect(sendExternalAccessLinkEmail).toHaveBeenCalledTimes(1);
    expect(fns['externalAccessGrant.deleteMany']).not.toHaveBeenCalled();
  });

  it('plus de 100 biens (entités développées comprises) : 400, rien n’est écrit', async () => {
    arrangeHappyCreate();
    // 1er appel : vérification du bien explicite ; 2e : périmètre développé (101 biens).
    fns['property.findMany']
      .mockResolvedValueOnce([{ id: 'p1' }])
      .mockResolvedValue(Array.from({ length: 101 }, (_, i) => ({ id: `p${i}` })));
    fns['propertyHolding.findMany'].mockResolvedValue([{ propertyId: 'p100' }]);
    fns['holdingEntity.findMany'].mockResolvedValue([{ id: '3f2b8c0e-7a41-4d5c-9b6e-2f1a8d7c4e90' }]);
    await expect(
      createExternalAccessGrant(TENANT, ACTOR, createInput({ entityIds: ['3f2b8c0e-7a41-4d5c-9b6e-2f1a8d7c4e90'] }))
    ).rejects.toMatchObject({ statusCode: 400, message: 'Un accès partagé ne peut couvrir plus de 100 biens.' });
    expect(fns['externalAccessGrant.create']).not.toHaveBeenCalled();
  });

  it('une entité sans aucune détention : 400 « Cette entité ne détient aucun bien. » (pas un 404)', async () => {
    arrangeHappyCreate();
    fns['holdingEntity.findMany'].mockResolvedValue([{ id: '3f2b8c0e-7a41-4d5c-9b6e-2f1a8d7c4e90' }]);
    fns['propertyHolding.findMany'].mockResolvedValue([]);
    await expect(
      createExternalAccessGrant(
        TENANT,
        ACTOR,
        createInput({ propertyIds: [], entityIds: ['3f2b8c0e-7a41-4d5c-9b6e-2f1a8d7c4e90'] })
      )
    ).rejects.toMatchObject({ statusCode: 400, message: 'Cette entité ne détient aucun bien.' });
    expect(fns['externalAccessGrant.create']).not.toHaveBeenCalled();
  });

  it('ownerClientId : seuls les clients proposés comme propriétaires (même filtre que scope-options) sont acceptés', async () => {
    arrangeHappyCreate();
    await createExternalAccessGrant(TENANT, ACTOR, createInput({ ownerClientId: 'client-1' }));
    const where = fns['tenantClient.findFirst'].mock.calls[0][0].where;
    expect(where).toEqual({
      id: 'client-1',
      tenantId: TENANT,
      OR: [{ clientType: 'OWNER' }, { ownerLeases: { some: {} } }, { ownershipShares: { some: {} } }]
    });
    // Même filtre que la liste proposée par scope-options.
    fns['tenantClient.findMany'].mockResolvedValue([]);
    fns['property.findMany'].mockResolvedValue([]);
    fns['holdingEntity.findMany'].mockResolvedValue([]);
    await getExternalAccessScopeOptions(TENANT);
    expect(fns['tenantClient.findMany'].mock.calls[0][0].where).toEqual({ tenantId: TENANT, OR: where.OR });
  });

  it('refuse un périmètre vide (400), avant toute écriture', async () => {
    arrangeHappyCreate();
    await expect(
      createExternalAccessGrant(TENANT, ACTOR, createInput({ propertyIds: [], entityIds: [] }))
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(fns['externalAccessGrant.create']).not.toHaveBeenCalled();
  });

  it('refuse des documents sans la rubrique DOCUMENTS (400)', async () => {
    arrangeHappyCreate();
    await expect(
      createExternalAccessGrant(TENANT, ACTOR, createInput({ type: 'BANKER', documentIds: ['doc-1'] }))
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(fns['externalAccessGrant.create']).not.toHaveBeenCalled();
  });

  describe('références d’une autre agence ou inexistantes : même NotFoundError, rien n’est écrit', () => {
    it.each([
      ['bien', () => fns['property.findMany'].mockResolvedValue([]), {}],
      ['propriétaire', () => fns['tenantClient.findFirst'].mockResolvedValue(null), { ownerClientId: 'client-b' }],
      [
        'entité',
        () => fns['holdingEntity.findMany'].mockResolvedValue([]),
        { entityIds: ['3f2b8c0e-7a41-4d5c-9b6e-2f1a8d7c4e90'] }
      ],
      ['document', () => fns['propertyDocument.findMany'].mockResolvedValue([]), { documentIds: ['doc-x'] }]
    ])('%s', async (_label, arrange, patch) => {
      arrangeHappyCreate();
      arrange();
      await expect(createExternalAccessGrant(TENANT, ACTOR, createInput(patch as any))).rejects.toBeInstanceOf(
        NotFoundError
      );
      expect(fns['externalAccessGrant.create']).not.toHaveBeenCalled();
      expect(createSecureLink).not.toHaveBeenCalled();
    });

    it('chaque vérification filtre par agence (bien : règle de périmètre, propriétaire, entité, document)', async () => {
      arrangeHappyCreate();
      fns['holdingEntity.findMany'].mockResolvedValue([{ id: '3f2b8c0e-7a41-4d5c-9b6e-2f1a8d7c4e90' }]);
      fns['propertyHolding.findMany'].mockResolvedValue([{ propertyId: 'p1' }]);
      fns['propertyDocument.findMany'].mockResolvedValue([{ id: 'doc-1', propertyId: 'p1' }]);
      await createExternalAccessGrant(
        TENANT,
        ACTOR,
        createInput({
          ownerClientId: 'client-1',
          entityIds: ['3f2b8c0e-7a41-4d5c-9b6e-2f1a8d7c4e90'],
          documentIds: ['doc-1']
        })
      );
      expect(fns['tenantClient.findFirst'].mock.calls[0][0].where).toMatchObject({
        id: 'client-1',
        tenantId: TENANT,
        OR: expect.any(Array)
      });
      expect(fns['holdingEntity.findMany'].mock.calls[0][0].where.tenantId).toBe(TENANT);
      const scope = fns['property.findMany'].mock.calls[0][0].where;
      expect(scope.AND[1].OR[0]).toEqual({ tenantId: TENANT });
      expect(scope.AND[1].OR[1].mandates.some.tenantId).toBe(TENANT);
      expect(fns['propertyDocument.findMany'].mock.calls[0][0].where).toMatchObject({
        id: { in: ['doc-1'] },
        propertyId: { in: ['p1'] },
        OR: [{ tenantId: TENANT }, { tenantId: null }]
      });
      expect(fns['externalAccessGrantDocument.createMany'].mock.calls[0][0].data).toEqual([
        { tenantId: TENANT, grantId: GRANT, propertyId: 'p1', documentId: 'doc-1' }
      ]);
    });
  });
});

describe('lecture : jamais de jeton, de hash ni de coordonnées superflues', () => {
  it('liste : résumé complet, nombre de liens actifs, aucune clé de jeton', async () => {
    fns['externalAccessGrant.findMany'].mockResolvedValue([
      summaryRow(),
      summaryRow({ id: 'g2', revokedAt: new Date() })
    ]);
    countActiveSecureLinksByObject.mockResolvedValue(new Map([[GRANT, 2]]));
    const { items } = await listExternalAccessGrants(TENANT);

    expect(fns['externalAccessGrant.findMany'].mock.calls[0][0].where).toEqual({ tenantId: TENANT });
    expect(items[0]).toMatchObject({
      id: GRANT,
      status: 'ACTIVE',
      permanent: true,
      ownerName: 'Awa Koné',
      propertyCount: 2,
      entityCount: 1,
      documentCount: 1,
      viewCount: 3,
      activeLinkCount: 2
    });
    expect(items[1]).toMatchObject({ status: 'REVOKED', activeLinkCount: 0 });
    expect(JSON.stringify(items)).not.toMatch(/token|hash/i);
    expect(countActiveSecureLinksByObject).toHaveBeenCalledWith(
      TENANT,
      'EXTERNAL_ACCESS_GRANT',
      'ExternalAccessGrant',
      [GRANT, 'g2']
    );
  });

  it('le select de la liste ne demande ni jeton, ni empreinte, ni e-mail ou téléphone du propriétaire', async () => {
    fns['externalAccessGrant.findMany'].mockResolvedValue([]);
    await listExternalAccessGrants(TENANT);
    const select = fns['externalAccessGrant.findMany'].mock.calls[0][0].select;
    expect(select.ownerClient).toEqual({ select: { user: { select: { fullName: true } } } });
    expect(JSON.stringify(select)).not.toMatch(/tokenHash|"email"|phone/);
  });

  it('détail : bien, entités et documents (id du document), filtré par agence ; autre agence → 404', async () => {
    fns['externalAccessGrant.findFirst'].mockResolvedValue(summaryRow());
    const detail = await getExternalAccessGrantDetail(TENANT, GRANT);
    expect(fns['externalAccessGrant.findFirst'].mock.calls[0][0].where).toEqual({ id: GRANT, tenantId: TENANT });
    expect(detail.properties).toEqual([{ id: 'p1', title: 'Villa A', reference: 'REF-1' }]);
    expect(detail.entities).toEqual([{ id: 'e1', name: 'SCI Palmiers' }]);
    expect(detail.documents).toEqual([{ id: 'doc-1', propertyId: 'p1', fileName: 'Titre.pdf' }]);

    fns['externalAccessGrant.findFirst'].mockResolvedValue(null);
    await expect(getExternalAccessGrantDetail('tenant-b', GRANT)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('options : rubriques, défauts par type, durée maximale, propriétaires sans e-mail', async () => {
    fns['tenantClient.findMany']
      .mockResolvedValueOnce([{ id: 'client-1', user: { fullName: 'Awa Koné' } }])
      .mockResolvedValueOnce([{ id: 'client-1', userId: 'u-owner' }]);
    fns['property.findMany'].mockResolvedValue([
      { id: 'p1', title: 'Villa A', internalReference: 'REF-1', ownerUserId: 'u-owner' },
      { id: 'p2', title: 'Studio B', internalReference: 'REF-2', ownerUserId: null }
    ]);
    fns['holdingEntity.findMany'].mockResolvedValue([{ id: 'e1', name: 'SCI Palmiers' }]);
    fns['propertyOwnershipShare.findMany'].mockResolvedValue([
      { propertyId: 'p2', ownerClientId: 'client-2', sharePercent: '30' },
      { propertyId: 'p2', ownerClientId: 'client-1', sharePercent: '70' }
    ]);

    const options = await getExternalAccessScopeOptions(TENANT);
    expect(options.sections).toHaveLength(7);
    expect(options.defaultsByType.BANKER).toEqual(['VALUATIONS', 'YIELD_RATIOS', 'LOANS']);
    expect(options.maxLinkTtlDays).toBeGreaterThan(0);
    expect(options.owners).toEqual([{ id: 'client-1', name: 'Awa Koné' }]);
    expect(options.properties).toEqual([
      { id: 'p1', title: 'Villa A', reference: 'REF-1', ownerClientId: 'client-1' },
      { id: 'p2', title: 'Studio B', reference: 'REF-2', ownerClientId: 'client-1' }
    ]);
    expect(options.entities).toEqual([{ id: 'e1', name: 'SCI Palmiers' }]);
    expect(fns['tenantClient.findMany'].mock.calls[0][0].where.tenantId).toBe(TENANT);
    expect(fns['holdingEntity.findMany'].mock.calls[0][0].where).toMatchObject({ tenantId: TENANT });
    expect(JSON.stringify(options)).not.toContain('@');
  });

  it('documents proposés : le bien doit être dans le périmètre de l’agence, jamais de chemin', async () => {
    fns['property.findMany'].mockResolvedValue([{ id: 'p1' }]);
    fns['propertyDocument.findMany'].mockResolvedValue([
      { id: 'doc-1', fileName: 'Titre.pdf', documentType: 'TITLE_DEED', fileSize: 10, createdAt: new Date() }
    ]);
    const { items } = await listPropertyDocumentsForSharing(TENANT, 'p1');
    expect(items).toHaveLength(1);
    const select = fns['propertyDocument.findMany'].mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual(['createdAt', 'documentType', 'fileName', 'fileSize', 'id']);

    fns['property.findMany'].mockResolvedValue([]);
    await expect(listPropertyDocumentsForSharing(TENANT, 'p-autre')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('journal : lu dans AuditLog par agence ET grant, charge utile filtrée sur des clés connues', async () => {
    fns['externalAccessGrant.findFirst'].mockResolvedValue({ id: GRANT });
    fns['auditLog.findMany'].mockResolvedValue([
      {
        id: 'a1',
        actionKey: 'EXTERNAL_ACCESS_GRANT_VIEWED',
        ipAddress: '203.0.113.9',
        userAgent: 'UA',
        payload: { sections: ['VALUATIONS', 'INCONNUE', 42], linkId: 'link-1', secret: 'x' },
        createdAt: new Date('2026-10-01T10:00:00Z')
      },
      {
        id: 'a2',
        actionKey: 'EXTERNAL_ACCESS_GRANT_DOCUMENT_DOWNLOADED',
        ipAddress: null,
        userAgent: null,
        payload: { documentName: 'Titre.pdf', documentRef: 'ref-1' },
        createdAt: new Date('2026-10-01T11:00:00Z')
      }
    ]);
    const { items } = await listExternalAccessLog(TENANT, GRANT, 500);

    const query = fns['auditLog.findMany'].mock.calls[0][0];
    expect(query.where).toMatchObject({ tenantId: TENANT, entityType: 'ExternalAccessGrant', entityId: GRANT });
    expect(query.take).toBe(100);
    expect(items[0]).toEqual({
      id: 'a1',
      at: expect.any(Date),
      action: 'VIEWED',
      ipAddress: '203.0.113.9',
      userAgent: 'UA',
      sections: ['VALUATIONS']
    });
    expect(items[1]).toMatchObject({ action: 'DOCUMENT_DOWNLOADED', documentName: 'Titre.pdf' });
    expect(JSON.stringify(items)).not.toMatch(/linkId|secret|documentRef/);

    fns['externalAccessGrant.findFirst'].mockResolvedValue(null);
    await expect(listExternalAccessLog('tenant-b', GRANT)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('modification', () => {
  function arrangeUpdate(existing: Record<string, unknown> = {}) {
    fns['externalAccessGrant.findFirst']
      .mockResolvedValueOnce({
        id: GRANT,
        ownerClientId: 'client-1',
        recipientEmail: 'notaire@example.test',
        sections: ['VALUATIONS'],
        revokedAt: null,
        properties: [{ propertyId: 'p1' }],
        entities: [],
        documents: [],
        ...existing
      })
      .mockResolvedValue(summaryRow());
    fns['externalAccessGrant.updateMany'].mockResolvedValue({ count: 1 });
    fns['property.findMany'].mockResolvedValue([{ id: 'p1' }]);
    fns['holdingEntity.findMany'].mockResolvedValue([]);
    fns['propertyHolding.findMany'].mockResolvedValue([]);
    fns['propertyDocument.findMany'].mockResolvedValue([]);
    countActiveSecureLinksByObject.mockResolvedValue(new Map());
  }

  it('grant révoqué : 409, rien n’est écrit', async () => {
    arrangeUpdate({ revokedAt: new Date() });
    await expect(
      updateExternalAccessGrant(TENANT, ACTOR, GRANT, updateGrantSchema.parse({ recipientName: 'Autre' }))
    ).rejects.toBeInstanceOf(ConflictError);
    expect(fns['externalAccessGrant.updateMany']).not.toHaveBeenCalled();
  });

  it('grant d’une autre agence ou inexistant : NotFoundError', async () => {
    fns['externalAccessGrant.findFirst'].mockResolvedValue(null);
    await expect(
      updateExternalAccessGrant('tenant-b', ACTOR, GRANT, updateGrantSchema.parse({ recipientName: 'X' }))
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(fns['externalAccessGrant.findFirst'].mock.calls[0][0].where).toEqual({ id: GRANT, tenantId: 'tenant-b' });
  });

  it('change les rubriques et l’expiration sans toucher aux liens', async () => {
    arrangeUpdate();
    const expiresAt = new Date(Date.now() + 30 * DAY);
    await updateExternalAccessGrant(
      TENANT,
      ACTOR,
      GRANT,
      updateGrantSchema.parse({ sections: ['LOANS', 'VALUATIONS'], expiresAt: expiresAt.toISOString() })
    );
    expect(fns['externalAccessGrant.updateMany']).toHaveBeenCalledWith({
      where: { id: GRANT, tenantId: TENANT, revokedAt: null },
      data: { sections: ['VALUATIONS', 'LOANS'], expiresAt }
    });
    expect(revokeSecureLinksForObject).not.toHaveBeenCalled();
    const entry = logAuditEvent.mock.calls[0][0];
    expect(entry.actionKey).toBe('EXTERNAL_ACCESS_GRANT_UPDATED');
    expect(entry.payload.changed).toEqual(['sections', 'expiresAt']);
  });

  it('expiration nulle : accès permanent', async () => {
    arrangeUpdate();
    await updateExternalAccessGrant(TENANT, ACTOR, GRANT, updateGrantSchema.parse({ expiresAt: null }));
    expect(fns['externalAccessGrant.updateMany'].mock.calls[0][0].data).toEqual({ expiresAt: null });
  });

  it('changement d’e-mail : les liens sont révoqués AVANT l’écriture du nouvel e-mail (échec fermé)', async () => {
    arrangeUpdate();
    const order: string[] = [];
    revokeSecureLinksForObject.mockImplementation(async () => {
      order.push('revoke');
      return 1;
    });
    fns['externalAccessGrant.updateMany'].mockImplementation(async () => {
      order.push('write');
      return { count: 1 };
    });
    await updateExternalAccessGrant(
      TENANT,
      ACTOR,
      GRANT,
      updateGrantSchema.parse({ recipientEmail: 'nouveau@example.test' })
    );
    expect(order).toEqual(['revoke', 'write']);

    // Si la révocation échoue, le nouvel e-mail n'est jamais écrit.
    fns['externalAccessGrant.findFirst'].mockReset();
    arrangeUpdate();
    fns['externalAccessGrant.updateMany'].mockClear();
    revokeSecureLinksForObject.mockRejectedValue(new Error('base occupée'));
    await expect(
      updateExternalAccessGrant(TENANT, ACTOR, GRANT, updateGrantSchema.parse({ recipientEmail: 'autre@example.test' }))
    ).rejects.toThrow('base occupée');
    expect(fns['externalAccessGrant.updateMany']).not.toHaveBeenCalled();
  });

  it('changer l’e-mail du bénéficiaire révoque les liens actifs ; garder le même e-mail, non', async () => {
    arrangeUpdate();
    await updateExternalAccessGrant(
      TENANT,
      ACTOR,
      GRANT,
      updateGrantSchema.parse({ recipientEmail: 'nouveau@example.test' })
    );
    expect(revokeSecureLinksForObject).toHaveBeenCalledWith(TENANT, 'ExternalAccessGrant', GRANT, ACTOR);
    // L'adresse ne figure ni dans le journal ni dans le résumé d'audit.
    expect(JSON.stringify(logAuditEvent.mock.calls)).not.toContain('nouveau@example.test');

    revokeSecureLinksForObject.mockClear();
    fns['externalAccessGrant.findFirst'].mockReset();
    arrangeUpdate();
    await updateExternalAccessGrant(
      TENANT,
      ACTOR,
      GRANT,
      updateGrantSchema.parse({ recipientEmail: 'notaire@example.test' })
    );
    expect(revokeSecureLinksForObject).not.toHaveBeenCalled();
  });

  it('remplacer le périmètre revérifie chaque bien par agence et retire les documents des biens sortis', async () => {
    arrangeUpdate();
    await updateExternalAccessGrant(TENANT, ACTOR, GRANT, updateGrantSchema.parse({ propertyIds: ['p1'] }));
    expect(fns['externalAccessGrantProperty.deleteMany']).toHaveBeenCalledWith({
      where: { tenantId: TENANT, grantId: GRANT }
    });
    expect(fns['externalAccessGrantProperty.createMany'].mock.calls[0][0].data).toEqual([
      { tenantId: TENANT, grantId: GRANT, propertyId: 'p1' }
    ]);
    expect(fns['externalAccessGrantDocument.deleteMany']).toHaveBeenCalledWith({
      where: { tenantId: TENANT, grantId: GRANT, propertyId: { notIn: ['p1'] } }
    });
  });

  it('un bien d’une autre agence dans le nouveau périmètre : NotFoundError, rien n’est modifié', async () => {
    arrangeUpdate();
    fns['property.findMany'].mockResolvedValue([]);
    await expect(
      updateExternalAccessGrant(TENANT, ACTOR, GRANT, updateGrantSchema.parse({ propertyIds: ['p-b'] }))
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(fns['externalAccessGrantProperty.deleteMany']).not.toHaveBeenCalled();
    expect(fns['externalAccessGrant.updateMany']).not.toHaveBeenCalled();
  });

  it('un bien DÉJÀ présent mais sorti du périmètre (mandat échu) n’empêche plus la modification : il est élagué', async () => {
    arrangeUpdate({ properties: [{ propertyId: 'p1' }, { propertyId: 'p-sorti' }] });
    // Seul p1 est encore dans le périmètre ; p-sorti est déjà dans le grant (pas « ajouté »).
    fns['property.findMany'].mockResolvedValue([{ id: 'p1' }]);
    await updateExternalAccessGrant(
      TENANT,
      ACTOR,
      GRANT,
      updateGrantSchema.parse({ propertyIds: ['p1', 'p-sorti'], recipientName: 'Nouveau nom' })
    );
    expect(fns['externalAccessGrant.updateMany']).toHaveBeenCalled();
    expect(fns['externalAccessGrantProperty.createMany'].mock.calls[0][0].data).toEqual([
      { tenantId: TENANT, grantId: GRANT, propertyId: 'p1' }
    ]);
  });

  it('un bien AJOUTÉ hors périmètre reste refusé (404) même si un autre bien existant est sorti', async () => {
    arrangeUpdate({ properties: [{ propertyId: 'p1' }, { propertyId: 'p-sorti' }] });
    // La vérification du seul bien AJOUTÉ (p-b) ne trouve rien.
    fns['property.findMany'].mockResolvedValueOnce([]).mockResolvedValue([{ id: 'p1' }]);
    await expect(
      updateExternalAccessGrant(
        TENANT,
        ACTOR,
        GRANT,
        updateGrantSchema.parse({ propertyIds: ['p1', 'p-sorti', 'p-b'] })
      )
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(fns['externalAccessGrantProperty.deleteMany']).not.toHaveBeenCalled();
  });

  it('un document déjà partagé dont le bien est sorti du périmètre est élagué, sans bloquer le PATCH', async () => {
    arrangeUpdate({ sections: ['DOCUMENTS'], documents: [{ documentId: 'doc-1' }, { documentId: 'doc-sorti' }] });
    fns['propertyDocument.findMany'].mockResolvedValue([{ id: 'doc-1', propertyId: 'p1' }]);
    await updateExternalAccessGrant(
      TENANT,
      ACTOR,
      GRANT,
      updateGrantSchema.parse({ documentIds: ['doc-1', 'doc-sorti'] })
    );
    expect(fns['externalAccessGrantDocument.createMany'].mock.calls[0][0].data).toEqual([
      { tenantId: TENANT, grantId: GRANT, propertyId: 'p1', documentId: 'doc-1' }
    ]);
  });

  it('retirer la rubrique DOCUMENTS supprime les partages (pas de document dormant)', async () => {
    arrangeUpdate({ sections: ['VALUATIONS', 'DOCUMENTS'], documents: [{ documentId: 'doc-1' }] });
    await updateExternalAccessGrant(TENANT, ACTOR, GRANT, updateGrantSchema.parse({ sections: ['VALUATIONS'] }));
    expect(fns['externalAccessGrantDocument.deleteMany']).toHaveBeenCalledWith({
      where: { tenantId: TENANT, grantId: GRANT }
    });
    expect(fns['externalAccessGrantDocument.createMany']).not.toHaveBeenCalled();
  });

  it('garder la rubrique DOCUMENTS ne touche pas aux partages', async () => {
    arrangeUpdate({ sections: ['VALUATIONS', 'DOCUMENTS'] });
    await updateExternalAccessGrant(TENANT, ACTOR, GRANT, updateGrantSchema.parse({ sections: ['DOCUMENTS'] }));
    expect(fns['externalAccessGrantDocument.deleteMany']).not.toHaveBeenCalled();
  });

  it('vider le périmètre est refusé (400)', async () => {
    arrangeUpdate();
    await expect(
      updateExternalAccessGrant(TENANT, ACTOR, GRANT, updateGrantSchema.parse({ propertyIds: [] }))
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('documents : revérifiés contre le périmètre final et refusés sans la rubrique DOCUMENTS', async () => {
    arrangeUpdate();
    await expect(
      updateExternalAccessGrant(TENANT, ACTOR, GRANT, updateGrantSchema.parse({ documentIds: ['doc-1'] }))
    ).rejects.toBeInstanceOf(BadRequestError);

    fns['externalAccessGrant.findFirst'].mockReset();
    arrangeUpdate({ sections: ['DOCUMENTS'] });
    fns['propertyDocument.findMany'].mockResolvedValue([{ id: 'doc-1', propertyId: 'p1' }]);
    await updateExternalAccessGrant(TENANT, ACTOR, GRANT, updateGrantSchema.parse({ documentIds: ['doc-1'] }));
    expect(fns['externalAccessGrantDocument.createMany'].mock.calls[0][0].data).toEqual([
      { tenantId: TENANT, grantId: GRANT, propertyId: 'p1', documentId: 'doc-1' }
    ]);
  });
});

describe('révocation et renvoi de lien', () => {
  it('révoque le grant ET tous ses liens, journalise une fois, idempotent', async () => {
    fns['externalAccessGrant.findFirst']
      .mockResolvedValueOnce({ id: GRANT, revokedAt: null })
      .mockResolvedValue(summaryRow({ revokedAt: new Date() }));
    fns['externalAccessGrant.updateMany'].mockResolvedValue({ count: 1 });
    revokeSecureLinksForObject.mockResolvedValue(2);

    const detail = await revokeExternalAccessGrant(TENANT, ACTOR, GRANT);
    expect(detail.status).toBe('REVOKED');
    expect(fns['externalAccessGrant.updateMany']).toHaveBeenCalledWith({
      where: { id: GRANT, tenantId: TENANT, revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
    expect(revokeSecureLinksForObject).toHaveBeenCalledWith(TENANT, 'ExternalAccessGrant', GRANT, ACTOR);
    expect(logAuditEvent.mock.calls[0][0]).toMatchObject({
      actionKey: 'EXTERNAL_ACCESS_GRANT_REVOKED',
      payload: { grantId: GRANT, linksRevoked: 2 }
    });

    // Deuxième appel : déjà révoqué, aucune nouvelle écriture de grant ni nouveau journal.
    logAuditEvent.mockClear();
    fns['externalAccessGrant.updateMany'].mockClear();
    fns['externalAccessGrant.findFirst']
      .mockReset()
      .mockResolvedValueOnce({ id: GRANT, revokedAt: new Date() })
      .mockResolvedValue(summaryRow({ revokedAt: new Date() }));
    await revokeExternalAccessGrant(TENANT, ACTOR, GRANT);
    expect(fns['externalAccessGrant.updateMany']).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
    // Mais tout lien resté actif est refermé.
    expect(revokeSecureLinksForObject).toHaveBeenCalledTimes(2);
  });

  it('grant d’une autre agence : NotFoundError, aucun lien révoqué', async () => {
    fns['externalAccessGrant.findFirst'].mockResolvedValue(null);
    await expect(revokeExternalAccessGrant('tenant-b', ACTOR, GRANT)).rejects.toBeInstanceOf(NotFoundError);
    expect(revokeSecureLinksForObject).not.toHaveBeenCalled();
  });

  describe('renvoyer un lien', () => {
    const active = {
      id: GRANT,
      type: 'NOTARY',
      recipientName: 'N',
      recipientEmail: 'n@example.test',
      expiresAt: null,
      revokedAt: null
    };

    it('crée un nouveau lien (URL une fois), envoie l’e-mail, révoque les anciens si demandé', async () => {
      arrangeHappyCreate();
      fns['externalAccessGrant.findFirst'].mockResolvedValue(active);
      const result = await sendExternalAccessLink(TENANT, ACTOR, GRANT, { revokePreviousLinks: true, linkTtlDays: 5 });

      expect(revokeSecureLinksForObject).toHaveBeenCalledWith(TENANT, 'ExternalAccessGrant', GRANT, ACTOR);
      expect(createSecureLink).toHaveBeenCalledWith(
        expect.objectContaining({ objectId: GRANT, ttlDays: 5, maxExpiresAt: null })
      );
      expect(result.link.url).toBe(URL);
      expect(result.email).toEqual({ sent: true });
      expect(JSON.stringify(logAuditEvent.mock.calls)).not.toContain(TOKEN);
    });

    it('une durée hors bornes est refusée AVANT toute révocation des anciens liens (400)', async () => {
      arrangeHappyCreate();
      fns['externalAccessGrant.findFirst'].mockResolvedValue(active);
      await expect(
        sendExternalAccessLink(TENANT, ACTOR, GRANT, { revokePreviousLinks: true, linkTtlDays: 9999 })
      ).rejects.toBeInstanceOf(BadRequestError);
      expect(revokeSecureLinksForObject).not.toHaveBeenCalled();
      expect(createSecureLink).not.toHaveBeenCalled();
    });

    it('ne révoque pas les anciens liens par défaut', async () => {
      arrangeHappyCreate();
      fns['externalAccessGrant.findFirst'].mockResolvedValue(active);
      await sendExternalAccessLink(TENANT, ACTOR, GRANT, {});
      expect(revokeSecureLinksForObject).not.toHaveBeenCalled();
    });

    it.each([
      ['révoqué', { revokedAt: new Date() }],
      ['expiré', { expiresAt: new Date(Date.now() - 1000) }]
    ])('grant %s : 409, aucun lien créé', async (_label, patch) => {
      arrangeHappyCreate();
      fns['externalAccessGrant.findFirst'].mockResolvedValue({ ...active, ...patch });
      await expect(sendExternalAccessLink(TENANT, ACTOR, GRANT, {})).rejects.toBeInstanceOf(ConflictError);
      expect(createSecureLink).not.toHaveBeenCalled();
      expect(sendExternalAccessLinkEmail).not.toHaveBeenCalled();
    });

    it('grant d’une autre agence : NotFoundError', async () => {
      fns['externalAccessGrant.findFirst'].mockResolvedValue(null);
      await expect(sendExternalAccessLink('tenant-b', ACTOR, GRANT, {})).rejects.toBeInstanceOf(NotFoundError);
      expect(createSecureLink).not.toHaveBeenCalled();
    });
  });
});
