/**
 * Service des sinistres (lot B1, spec 032). Prisma est remplacé par un magasin
 * en mémoire (modèle : patrimoine.entities.service.test.ts) : aucune base requise.
 */

export {};

type Row = Record<string, any>;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const USER = 'user-1';

const store: Record<string, Row[]> = {};
let seq = 0;
const auditEvents: Row[] = [];
let failNextUpdateMany = false;

function resetStore(): void {
  for (const key of [
    'property',
    'insurancePolicy',
    'insuranceClaim',
    'insuranceClaimDocument',
    'insuranceClaimStatusHistory',
    'maintenanceTicket',
    'propertyExpense',
    'propertyDocument',
    'user'
  ]) {
    store[key] = [];
  }
  seq = 0;
  auditEvents.length = 0;
  failNextUpdateMany = false;
}

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'property') return true; // relation filtrée à part (documents)
    if (key === 'OR') return (expected as Row[]).some(branch => matches(row, branch));
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if ('not' in expected) return row[key] !== expected.not;
      if ('in' in expected) return expected.in.includes(row[key]);
    }
    return row[key] === expected;
  });
}

function delegate(name: string, defaults: () => Row = () => ({})) {
  return {
    findFirst: jest.fn(async ({ where }: Row) => {
      const found = store[name].find(row => matches(row, where));
      if (!found) return null;
      // Une pièce d'un bien d'une autre agence n'est pas trouvée.
      if (name === 'propertyDocument' && where?.property?.tenantId) {
        const prop = store.property.find(p => p.id === found.propertyId);
        if (!prop || prop.tenantId !== where.property.tenantId) return null;
      }
      return withIncludes(name, found);
    }),
    findMany: jest.fn(async ({ where }: Row = {}) =>
      store[name].filter(row => matches(row, where)).map(r => withIncludes(name, r))
    ),
    count: jest.fn(async ({ where }: Row = {}) => store[name].filter(row => matches(row, where)).length),
    create: jest.fn(async ({ data }: Row) => {
      seq += 1;
      const row = { id: `${name}-${seq}`, createdAt: new Date(), updatedAt: new Date(), ...defaults(), ...data };
      store[name].push(row);
      return withIncludes(name, row);
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      if (failNextUpdateMany) {
        failNextUpdateMany = false;
        return { count: 0 };
      }
      const rows = store[name].filter(row => matches(row, where));
      rows.forEach(row => Object.assign(row, data));
      return { count: rows.length };
    }),
    deleteMany: jest.fn(async ({ where }: Row) => {
      const rows = store[name].filter(row => matches(row, where));
      store[name] = store[name].filter(row => !rows.includes(row));
      return { count: rows.length };
    })
  };
}

function withIncludes(name: string, row: Row): Row {
  if (name === 'insuranceClaim') {
    const policy = store.insurancePolicy.find(p => p.id === row.policyId);
    const ticket = store.maintenanceTicket.find(t => t.id === row.ticketId);
    const property = store.property.find(p => p.id === row.propertyId);
    return {
      ...row,
      property: property ? { internalReference: property.internalReference } : null,
      policy: policy ? { insurer: policy.insurer, policyNumber: policy.policyNumber } : null,
      ticket: ticket ? { title: ticket.title } : null,
      _count: { documents: store.insuranceClaimDocument.filter(d => d.claimId === row.id).length }
    };
  }
  if (name === 'insuranceClaimDocument') {
    const doc = store.propertyDocument.find(d => d.id === row.documentId);
    return { ...row, document: { fileName: doc?.fileName ?? 'x.pdf', mimeType: doc?.mimeType ?? null } };
  }
  return row;
}

const delegates: Record<string, ReturnType<typeof delegate>> = {};
function buildDelegates(): void {
  delegates.insurancePolicy = delegate('insurancePolicy', () => ({ currency: 'XOF' }));
  delegates.insuranceClaim = delegate('insuranceClaim', () => ({
    status: 'DECLARED',
    indemnifiedAmount: null,
    deductible: null,
    rejectionReason: null,
    insurerNotifiedAt: null,
    expertiseAt: null,
    settledAt: null,
    rejectedAt: null,
    closedAt: null
  }));
  delegates.insuranceClaimDocument = delegate('insuranceClaimDocument');
  delegates.insuranceClaimStatusHistory = delegate('insuranceClaimStatusHistory');
  delegates.maintenanceTicket = delegate('maintenanceTicket');
  delegates.propertyExpense = delegate('propertyExpense');
  delegates.propertyDocument = delegate('propertyDocument');
  delegates.user = delegate('user');
}

jest.mock('../../src/utils/database', () => {
  const prismaMock: Row = {};
  return {
    prisma: new Proxy(prismaMock, {
      get: (_t, prop: string) => {
        if (prop === '$transaction') {
          return async (fn: (tx: unknown) => unknown) => {
            const snapshot = JSON.stringify(Object.fromEntries(Object.entries(store).map(([k, v]) => [k, v])));
            try {
              return await fn(prismaMock.__self);
            } catch (error) {
              // Annulation : le magasin revient à l'état d'avant la transaction.
              const restored = JSON.parse(snapshot, (_k, v) =>
                typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : v
              );
              for (const key of Object.keys(store)) store[key] = restored[key];
              throw error;
            }
          };
        }
        return (delegates as Row)[prop];
      }
    })
  };
});

jest.mock('../../src/utils/property-tenant-guard', () => {
  const { NotFoundError } = require('../../src/middleware/error-middleware');
  return {
    getPropertyForTenant: jest.fn(async (propertyId: string, tenantId: string) => {
      const found = store.property.find(p => p.id === propertyId && p.tenantId === tenantId);
      if (!found) throw new NotFoundError('Bien introuvable.');
      return found;
    })
  };
});

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (entry: Row) => auditEvents.push(entry),
  flushAuditEvents: jest.fn()
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { prisma: prismaClient } = require('../../src/utils/database');
const service = require('../../src/lib/patrimoine/insurance/claim-service');
const {
  transitionClaimSchema,
  updateClaimSchema,
  createClaimSchema
} = require('../../src/lib/patrimoine/insurance/schemas');
const { BadRequestError, ConflictError, NotFoundError } = require('../../src/middleware/error-middleware');

function seedBase(): void {
  store.property.push(
    { id: 'prop-a', tenantId: TENANT_A, internalReference: 'REF-A' },
    { id: 'prop-a2', tenantId: TENANT_A, internalReference: 'REF-A2' },
    { id: 'prop-b', tenantId: TENANT_B, internalReference: 'REF-B' }
  );
  store.insurancePolicy.push(
    { id: 'pol-a', tenantId: TENANT_A, propertyId: 'prop-a', insurer: 'NSIA', policyNumber: 'P1', currency: 'XOF' },
    { id: 'pol-a2', tenantId: TENANT_A, propertyId: 'prop-a2', insurer: 'SUNU', policyNumber: 'P2', currency: 'XOF' },
    { id: 'pol-b', tenantId: TENANT_B, propertyId: 'prop-b', insurer: 'AXA', policyNumber: 'P3', currency: 'XOF' }
  );
  store.maintenanceTicket.push(
    { id: 'tk-a', tenant_id: TENANT_A, property_id: 'prop-a', title: 'Fuite' },
    { id: 'tk-a2', tenant_id: TENANT_A, property_id: 'prop-a2', title: 'Autre bien' },
    { id: 'tk-b', tenant_id: TENANT_B, property_id: 'prop-b', title: 'Étranger' }
  );
  store.propertyExpense.push(
    { id: 'ex-a', tenantId: TENANT_A, propertyId: 'prop-a' },
    { id: 'ex-b', tenantId: TENANT_B, propertyId: 'prop-b' }
  );
  store.propertyDocument.push(
    { id: 'doc-a', propertyId: 'prop-a', tenantId: TENANT_A, fileName: 'devis.pdf', mimeType: 'application/pdf' },
    { id: 'doc-b', propertyId: 'prop-b', tenantId: TENANT_B, fileName: 'secret.pdf', mimeType: 'application/pdf' },
    { id: 'doc-a2', propertyId: 'prop-a2', tenantId: TENANT_A, fileName: 'autre.pdf', mimeType: 'application/pdf' }
  );
  store.user.push({ id: USER, fullName: 'Awa Konan' });
}

const baseClaim = {
  propertyId: 'prop-a',
  policyId: 'pol-a',
  occurredAt: new Date('2026-09-01T00:00:00Z'),
  cause: 'WATER_DAMAGE',
  description: 'Dégât des eaux',
  claimedAmount: 1000
};

async function declare(overrides: Row = {}) {
  return service.createClaim(TENANT_A, { ...baseClaim, ...overrides }, USER);
}

beforeEach(() => {
  resetStore();
  buildDelegates();
  (prismaClient as Row).__self = new Proxy({}, { get: (_t, p: string) => (delegates as Row)[p] });
  seedBase();
});

describe('createClaim', () => {
  it('crée le sinistre DECLARED, la 1re ligne d’historique et le journal d’audit', async () => {
    const claim = await declare();
    expect(claim.status).toBe('DECLARED');
    expect(claim.outOfPocketAmount).toBeNull();
    expect(claim.allowedNextStatuses).toEqual(['INSURER_NOTIFIED']);
    expect(store.insuranceClaimStatusHistory).toHaveLength(1);
    expect(store.insuranceClaimStatusHistory[0]).toMatchObject({
      fromStatus: null,
      toStatus: 'DECLARED',
      changedByUserId: USER
    });
    expect(store.insuranceClaim[0].createdByUserId).toBe(USER);
    expect(auditEvents[0]).toMatchObject({ actionKey: 'PATRIMOINE_INSURANCE_CLAIM_DECLARED', tenantId: TENANT_A });
  });

  it('n’écrit aucune dépense', async () => {
    await declare({ expenseId: 'ex-a' });
    expect(delegates.propertyExpense.create).not.toHaveBeenCalled();
    expect(store.insuranceClaim[0].expenseId).toBe('ex-a');
  });

  it.each([
    ['bien', { propertyId: 'prop-b', policyId: 'pol-b' }],
    ['police', { policyId: 'pol-b' }],
    ['police d’un autre bien', { policyId: 'pol-a2' }],
    ['ticket', { ticketId: 'tk-b' }],
    ['ticket d’un autre bien', { ticketId: 'tk-a2' }],
    ['dépense', { expenseId: 'ex-b' }],
    ['inexistant (ticket)', { ticketId: 'nope' }]
  ])('référence d’une autre agence ou bien (%s) -> NotFoundError', async (_label, overrides) => {
    await expect(declare(overrides)).rejects.toBeInstanceOf(NotFoundError);
    expect(store.insuranceClaim).toHaveLength(0);
  });

  it('le schéma refuse outOfPocketAmount et indemnifiedAmount en entrée', () => {
    const body = { ...baseClaim, policyId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', occurredAt: '2026-09-01' };
    expect(() => createClaimSchema.parse(body)).not.toThrow();
    expect(() => createClaimSchema.parse({ ...body, outOfPocketAmount: 10 })).toThrow();
    expect(() => createClaimSchema.parse({ ...body, indemnifiedAmount: 10 })).toThrow();
    expect(() => updateClaimSchema.parse({ outOfPocketAmount: 10 })).toThrow();
    expect(() => updateClaimSchema.parse({ indemnifiedAmount: 10 })).toThrow();
    expect(() => transitionClaimSchema.parse({ toStatus: 'SETTLED', outOfPocketAmount: 1 })).toThrow();
  });
});

describe('transitionClaim', () => {
  async function toStatus(id: string, toStatus: string, extra: Row = {}) {
    return service.transitionClaim(TENANT_A, id, { toStatus, ...extra }, USER);
  }

  it('parcours complet : horodatage, historique, audit et reste à charge', async () => {
    const { id } = await declare();
    let claim = await toStatus(id, 'INSURER_NOTIFIED', { note: 'Courrier envoyé' });
    expect(claim.insurerNotifiedAt).not.toBeNull();
    claim = await toStatus(id, 'EXPERTISE');
    expect(claim.expertiseAt).not.toBeNull();
    claim = await toStatus(id, 'SETTLED', { indemnifiedAmount: 700 });
    expect(claim).toMatchObject({ status: 'SETTLED', indemnifiedAmount: 700, outOfPocketAmount: 300 });
    expect(claim.settledAt).not.toBeNull();
    claim = await toStatus(id, 'CLOSED');
    expect(claim.closedAt).not.toBeNull();
    expect(claim.allowedNextStatuses).toEqual([]);

    expect(claim.history.map((h: Row) => h.toStatus)).toEqual([
      'DECLARED',
      'INSURER_NOTIFIED',
      'EXPERTISE',
      'SETTLED',
      'CLOSED'
    ]);
    expect(claim.history[1]).toMatchObject({
      fromStatus: 'DECLARED',
      toStatus: 'INSURER_NOTIFIED',
      note: 'Courrier envoyé'
    });
    expect(claim.history[0].changedByName).toBe('Awa Konan');
    const changed = auditEvents.filter(e => e.actionKey === 'PATRIMOINE_INSURANCE_CLAIM_STATUS_CHANGED');
    expect(changed).toHaveLength(4);
  });

  it('refuse une transition interdite en 409 sans rien écrire', async () => {
    const { id } = await declare();
    await expect(toStatus(id, 'SETTLED', { indemnifiedAmount: 1 })).rejects.toBeInstanceOf(ConflictError);
    expect(store.insuranceClaimStatusHistory).toHaveLength(1);
    expect(store.insuranceClaim[0].status).toBe('DECLARED');
  });

  it('SETTLED sans montant indemnisé -> 400', async () => {
    const { id } = await declare();
    await toStatus(id, 'INSURER_NOTIFIED');
    await expect(toStatus(id, 'SETTLED')).rejects.toBeInstanceOf(BadRequestError);
    expect(store.insuranceClaim[0].status).toBe('INSURER_NOTIFIED');
  });

  it('SETTLED avec un montant supérieur au réclamé -> 400', async () => {
    const { id } = await declare();
    await toStatus(id, 'INSURER_NOTIFIED');
    await expect(toStatus(id, 'SETTLED', { indemnifiedAmount: 1000.01 })).rejects.toBeInstanceOf(BadRequestError);
  });

  it('REJECTED sans motif -> 400, avec motif : indemnifié forcé à 0', async () => {
    const { id } = await declare();
    await toStatus(id, 'INSURER_NOTIFIED');
    await expect(toStatus(id, 'REJECTED')).rejects.toBeInstanceOf(BadRequestError);
    await expect(toStatus(id, 'REJECTED', { rejectionReason: '   ' })).rejects.toBeInstanceOf(BadRequestError);
    const claim = await toStatus(id, 'REJECTED', { rejectionReason: 'Garantie exclue' });
    expect(claim).toMatchObject({ indemnifiedAmount: 0, outOfPocketAmount: 1000, rejectionReason: 'Garantie exclue' });
    expect(claim.rejectedAt).not.toBeNull();
  });

  it('le montant indemnisé n’est accepté que vers SETTLED', async () => {
    const { id } = await declare();
    await expect(toStatus(id, 'INSURER_NOTIFIED', { indemnifiedAmount: 10 })).rejects.toBeInstanceOf(BadRequestError);
  });

  it('course : mise à jour conditionnelle à 0 ligne -> 409 et historique annulé', async () => {
    const { id } = await declare();
    failNextUpdateMany = true;
    await expect(toStatus(id, 'INSURER_NOTIFIED')).rejects.toBeInstanceOf(ConflictError);
    expect(store.insuranceClaimStatusHistory).toHaveLength(1);
    expect(store.insuranceClaim[0].status).toBe('DECLARED');
  });

  it('le verrou porte sur le statut courant et l’agence', async () => {
    const { id } = await declare();
    await toStatus(id, 'INSURER_NOTIFIED');
    expect(delegates.insuranceClaim.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id, tenantId: TENANT_A, status: 'DECLARED', claimedAmount: 1000 } })
    );
  });

  it('course sur claimedAmount : le montant lu est épinglé, un changement entre-temps -> 409', async () => {
    const { id } = await declare();
    await toStatus(id, 'INSURER_NOTIFIED');
    failNextUpdateMany = true; // le montant réclamé a changé : 0 ligne mise à jour
    await expect(toStatus(id, 'SETTLED', { indemnifiedAmount: 900 })).rejects.toBeInstanceOf(ConflictError);
    expect(store.insuranceClaim[0].status).toBe('INSURER_NOTIFIED');
  });

  it('le message de transition invalide utilise les libellés français', async () => {
    const { id } = await declare();
    await expect(toStatus(id, 'SETTLED', { indemnifiedAmount: 1 })).rejects.toThrow(
      'Transition de statut impossible : « Déclaré » vers « Indemnisé ».'
    );
  });

  it('la franchise n’est acceptée que vers SETTLED -> 400', async () => {
    const { id } = await declare();
    await expect(toStatus(id, 'INSURER_NOTIFIED', { deductible: 10 })).rejects.toBeInstanceOf(BadRequestError);
    expect(store.insuranceClaim[0].status).toBe('DECLARED');
  });

  it('vocabulaire « Rejeté » / « motif du rejet » dans les messages', async () => {
    const { id } = await declare();
    await toStatus(id, 'INSURER_NOTIFIED');
    await expect(toStatus(id, 'REJECTED')).rejects.toThrow('Le motif du rejet est obligatoire.');
    await expect(toStatus(id, 'EXPERTISE', { rejectionReason: 'x' })).rejects.toThrow(/« Rejeté »/);
  });

  it('sinistre d’une autre agence -> NotFoundError', async () => {
    const { id } = await declare();
    await expect(service.transitionClaim(TENANT_B, id, { toStatus: 'INSURER_NOTIFIED' }, USER)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});

describe('updateClaim', () => {
  it('refuse un sinistre clos en 409', async () => {
    const { id } = await declare();
    store.insuranceClaim[0].status = 'CLOSED';
    await expect(service.updateClaim(TENANT_A, id, { description: 'x' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuse un montant réclamé inférieur à l’indemnisation -> 400', async () => {
    const { id } = await declare();
    store.insuranceClaim[0].status = 'SETTLED';
    store.insuranceClaim[0].indemnifiedAmount = 800;
    await expect(service.updateClaim(TENANT_A, id, { claimedAmount: 500 })).rejects.toBeInstanceOf(BadRequestError);
    const ok = await service.updateClaim(TENANT_A, id, { claimedAmount: 900 });
    expect(ok.claimedAmount).toBe(900);
    expect(ok.indemnifiedAmount).toBe(800);
  });

  it('vérifie ticket et dépense par agence, délie avec null', async () => {
    const { id } = await declare({ ticketId: 'tk-a' });
    await expect(service.updateClaim(TENANT_A, id, { ticketId: 'tk-b' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.updateClaim(TENANT_A, id, { expenseId: 'ex-b' })).rejects.toBeInstanceOf(NotFoundError);
    const claim = await service.updateClaim(TENANT_A, id, { ticketId: null });
    expect(claim.ticketId).toBeNull();
  });

  it('course : un changement de claimedAmount épingle les montants lus ; 0 ligne -> 409', async () => {
    const { id } = await declare();
    await service.updateClaim(TENANT_A, id, { claimedAmount: 1200 });
    expect(delegates.insuranceClaim.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id, tenantId: TENANT_A, claimedAmount: 1000, indemnifiedAmount: null })
      })
    );
    failNextUpdateMany = true;
    await expect(service.updateClaim(TENANT_A, id, { claimedAmount: 1500 })).rejects.toBeInstanceOf(ConflictError);
  });

  it('n’écrit jamais indemnifiedAmount', async () => {
    const { id } = await declare();
    await service.updateClaim(TENANT_A, id, { description: 'Nouveau texte' });
    const data = delegates.insuranceClaim.updateMany.mock.calls.at(-1)![0].data;
    expect(data).not.toHaveProperty('indemnifiedAmount');
    expect(data).not.toHaveProperty('outOfPocketAmount');
  });
});

describe('deleteClaim', () => {
  it('supprime seulement un sinistre DECLARED', async () => {
    const { id } = await declare();
    await service.deleteClaim(TENANT_A, id);
    expect(store.insuranceClaim).toHaveLength(0);
  });

  it('409 si le statut a avancé, 404 depuis une autre agence', async () => {
    const { id } = await declare();
    await service.transitionClaim(TENANT_A, id, { toStatus: 'INSURER_NOTIFIED' }, USER);
    await expect(service.deleteClaim(TENANT_A, id)).rejects.toBeInstanceOf(ConflictError);
    await expect(service.deleteClaim(TENANT_B, id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('pièces', () => {
  it('rattache une pièce du bien, refuse le doublon (409)', async () => {
    const { id } = await declare();
    const link = await service.attachClaimDocument(TENANT_A, id, { documentId: 'doc-a', kind: 'QUOTE' });
    expect(link).toMatchObject({ documentId: 'doc-a', kind: 'QUOTE', fileName: 'devis.pdf' });
    expect(JSON.stringify(link)).not.toMatch(/filePath|file_path|uploads/);
    await expect(
      service.attachClaimDocument(TENANT_A, id, { documentId: 'doc-a', kind: 'INVOICE' })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('doublon concurrent (P2002 à la création) -> 409', async () => {
    const { id } = await declare();
    delegates.insuranceClaimDocument.create.mockRejectedValueOnce(
      Object.assign(new Error('unique'), { code: 'P2002' })
    );
    await expect(
      service.attachClaimDocument(TENANT_A, id, { documentId: 'doc-a', kind: 'QUOTE' })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('sinistre clos : rattacher et retirer une pièce -> 409', async () => {
    const { id } = await declare();
    const link = await service.attachClaimDocument(TENANT_A, id, { documentId: 'doc-a', kind: 'QUOTE' });
    store.insuranceClaim[0].status = 'CLOSED';
    await expect(
      service.attachClaimDocument(TENANT_A, id, { documentId: 'doc-a2', kind: 'QUOTE' })
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(service.detachClaimDocument(TENANT_A, id, link.id)).rejects.toBeInstanceOf(ConflictError);
    expect(store.insuranceClaimDocument).toHaveLength(1);
  });

  it('document de bien sans agence (ancienne ligne) accepté, d’une autre agence refusé', async () => {
    store.propertyDocument.push({ id: 'doc-legacy', propertyId: 'prop-a', tenantId: null, fileName: 'v.pdf' });
    const { id } = await declare();
    await expect(
      service.attachClaimDocument(TENANT_A, id, { documentId: 'doc-legacy', kind: 'QUOTE' })
    ).resolves.toMatchObject({ documentId: 'doc-legacy' });
  });

  it.each([
    ['autre agence', 'doc-b'],
    ['autre bien', 'doc-a2'],
    ['inexistant', 'nope']
  ])('document %s -> NotFoundError', async (_label, documentId) => {
    const { id } = await declare();
    await expect(service.attachClaimDocument(TENANT_A, id, { documentId, kind: 'QUOTE' })).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('retire la liaison sans toucher au document ; lien inconnu -> 404', async () => {
    const { id } = await declare();
    const link = await service.attachClaimDocument(TENANT_A, id, { documentId: 'doc-a', kind: 'QUOTE' });
    await expect(service.detachClaimDocument(TENANT_A, id, 'inconnu')).rejects.toBeInstanceOf(NotFoundError);
    await service.detachClaimDocument(TENANT_A, id, link.id);
    expect(store.insuranceClaimDocument).toHaveLength(0);
    expect(store.propertyDocument).toHaveLength(3);
  });
});

describe('listClaims', () => {
  it('filtre par agence et plafonne limit à 500', async () => {
    await declare();
    store.insuranceClaim.push({
      id: 'foreign',
      tenantId: TENANT_B,
      propertyId: 'prop-b',
      policyId: 'pol-b',
      status: 'DECLARED'
    });
    const list = await service.listClaims(TENANT_A, { limit: 9999 });
    expect(list).toHaveLength(1);
    expect(delegates.insuranceClaim.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT_A }, take: 500 })
    );
  });
});
