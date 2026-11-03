/**
 * BUG-2026-11-03-001 — portail propriétaire : un filtre `propertyId` reçu dans
 * la requête ne fait que RESTREINDRE le périmètre du propriétaire connecté ; il
 * ne le remplace jamais. Un bien d'un AUTRE propriétaire de la même agence
 * donne une liste vide (baux, incidents, documents, exports).
 *
 * Prisma est remplacé : chaque `findMany` évalue le `where` reçu contre des
 * lignes en mémoire (un petit évaluateur de filtres Prisma), ce qui vérifie le
 * périmètre réellement demandé à la base.
 */

type Row = Record<string, any>;

const TENANT = 'tenant-1';
const OWN = 'prop-own';
const FOREIGN = 'prop-foreign';

function matchValue(actual: any, cond: any): boolean {
  if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
    if ('in' in cond) return Array.isArray(cond.in) && cond.in.includes(actual);
    if ('not' in cond) return actual !== cond.not;
    return matches(actual, cond);
  }
  return actual === cond;
}

function matches(row: Row | null | undefined, where: Row): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'AND') {
      const list = Array.isArray(cond) ? cond : [cond];
      if (!list.every((c: Row) => matches(row, c))) return false;
    } else if (key === 'OR') {
      if (!(cond as Row[]).some(c => matches(row, c))) return false;
    } else {
      if (row === null || row === undefined) return false;
      if (!matchValue(row[key], cond)) return false;
    }
  }
  return true;
}

const store = {
  leases: [] as Row[],
  tickets: [] as Row[],
  documents: [] as Row[]
};

const findManyLeases = jest.fn();
const findManyTickets = jest.fn();
const findManyDocuments = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalLease: { findMany: (...a: any[]) => findManyLeases(...a) },
    maintenanceTicket: { findMany: (...a: any[]) => findManyTickets(...a) },
    rentalDocument: { findMany: (...a: any[]) => findManyDocuments(...a) }
  }
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../../src/services/document-generation-service', () => ({
  getDocumentFile: jest.fn()
}));

jest.mock('../../src/utils/report-generator', () => ({
  generateRevenueReport: jest.fn(),
  exportData: jest.fn()
}));

import { OwnerPortalService } from '../../src/services/owner-portal-service';

const service = new OwnerPortalService();

/** Ids des lignes que le `where` demandé laisse passer. */
function selectedIds(rows: Row[], where: Row): string[] {
  return rows.filter(r => matches(r, where)).map(r => r.id);
}

beforeEach(() => {
  jest.clearAllMocks();

  store.leases = [
    { id: 'lease-own', tenant_id: TENANT, property_id: OWN },
    { id: 'lease-foreign', tenant_id: TENANT, property_id: FOREIGN }
  ];
  store.tickets = [
    { id: 'tk-own', tenant_id: TENANT, property_id: OWN },
    { id: 'tk-foreign', tenant_id: TENANT, property_id: FOREIGN }
  ];
  store.documents = [
    { id: 'doc-own-lease', tenant_id: TENANT, status: 'ISSUED', lease_id: 'lease-own', lease: { property_id: OWN } },
    {
      id: 'doc-own-inst',
      tenant_id: TENANT,
      status: 'ISSUED',
      lease_id: null,
      installment: { lease: { property_id: OWN } }
    },
    {
      id: 'doc-foreign-lease',
      tenant_id: TENANT,
      status: 'ISSUED',
      lease_id: 'lease-foreign',
      lease: { property_id: FOREIGN }
    },
    {
      id: 'doc-foreign-inst',
      tenant_id: TENANT,
      status: 'ISSUED',
      lease_id: null,
      installment: { lease: { property_id: FOREIGN } }
    },
    {
      id: 'doc-foreign-pay',
      tenant_id: TENANT,
      status: 'ISSUED',
      lease_id: null,
      payment: { lease: { property_id: FOREIGN } }
    }
  ];

  // Les mocks renvoient les lignes que le `where` laisse passer (puis le
  // service les met en forme : on ne renvoie donc que ce qui passe le filtre).
  findManyLeases.mockImplementation(async ({ where }: Row) =>
    store.leases.filter(l => matches(l, where)).map(l => ({ ...l, _leak: true }))
  );
  findManyTickets.mockImplementation(async ({ where }: Row) =>
    store.tickets.filter(t => matches(t, where)).map(t => ({ ...t, _leak: true }))
  );
  findManyDocuments.mockImplementation(async ({ where }: Row) =>
    store.documents.filter(d => matches(d, where)).map(d => ({ ...d, _leak: true }))
  );
});

describe('portail propriétaire — le filtre propertyId restreint le périmètre', () => {
  const scope = [OWN];

  it('baux : un bien étranger ne renvoie aucun bail', async () => {
    findManyLeases.mockClear();
    try {
      await service.getLeases(scope, TENANT, { propertyId: FOREIGN });
    } catch {
      // la mise en forme peut échouer sur les lignes factices : seul le where compte
    }
    const { where } = findManyLeases.mock.calls[0][0];
    expect(selectedIds(store.leases, where)).toEqual([]);
  });

  it('baux : son propre bien reste filtrable', async () => {
    try {
      await service.getLeases(scope, TENANT, { propertyId: OWN });
    } catch {
      /* idem */
    }
    const { where } = findManyLeases.mock.calls[0][0];
    expect(selectedIds(store.leases, where)).toEqual(['lease-own']);
  });

  it('incidents : un bien étranger ne renvoie aucun ticket', async () => {
    try {
      await service.getMaintenanceTickets(scope, TENANT, { propertyId: FOREIGN });
    } catch {
      /* idem */
    }
    const { where } = findManyTickets.mock.calls[0][0];
    expect(selectedIds(store.tickets, where)).toEqual([]);
  });

  it('incidents : son propre bien reste filtrable', async () => {
    try {
      await service.getMaintenanceTickets(scope, TENANT, { propertyId: OWN });
    } catch {
      /* idem */
    }
    const { where } = findManyTickets.mock.calls[0][0];
    expect(selectedIds(store.tickets, where)).toEqual(['tk-own']);
  });

  it('documents : un bien étranger ne renvoie aucun document', async () => {
    try {
      await service.getDocuments(scope, TENANT, { propertyId: FOREIGN });
    } catch {
      /* idem */
    }
    const { where } = findManyDocuments.mock.calls[0][0];
    expect(selectedIds(store.documents, where)).toEqual([]);
  });

  it('documents : son propre bien reste filtrable (bail et échéance)', async () => {
    try {
      await service.getDocuments(scope, TENANT, { propertyId: OWN });
    } catch {
      /* idem */
    }
    const { where } = findManyDocuments.mock.calls[0][0];
    expect(selectedIds(store.documents, where).sort()).toEqual(['doc-own-inst', 'doc-own-lease']);
  });

  it('documents : leaseId étranger ne renvoie rien', async () => {
    try {
      await service.getDocuments(scope, TENANT, { leaseId: 'lease-foreign' });
    } catch {
      /* idem */
    }
    const { where } = findManyDocuments.mock.calls[0][0];
    expect(selectedIds(store.documents, where)).toEqual([]);
  });

  it('documents : leaseId étranger combiné à un propertyId étranger ne renvoie rien', async () => {
    try {
      await service.getDocuments(scope, TENANT, { propertyId: FOREIGN, leaseId: 'lease-foreign' });
    } catch {
      /* idem */
    }
    const { where } = findManyDocuments.mock.calls[0][0];
    expect(selectedIds(store.documents, where)).toEqual([]);
  });
});
