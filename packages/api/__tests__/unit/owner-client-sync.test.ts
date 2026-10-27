/**
 * BUG-2026-09-28-019 — un contact CRM au rôle Propriétaire devient un
 * `TenantClient` OWNER (vendeur d'un mandat, propriétaire d'un bien,
 * indivision), sans passer par un bail.
 *
 * Prisma est remplacé par un magasin en mémoire ; `getOrCreateTenantClientFromContact`
 * (tenant-service) est simulé avec la même sémantique idempotente que le réel
 * (un client par compte et par agence).
 */

type Row = Record<string, any>;

const store = {
  contacts: [] as Row[],
  roles: [] as Row[],
  clients: [] as Row[],
  seq: 0
};

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const mockPrisma: Row = {
  crmContact: {
    findFirst: jest.fn(async ({ where, include }: Row) => {
      const c = store.contacts.find(x => x.id === where.id && x.tenantId === where.tenantId);
      if (!c) return null;
      return include?.roles ? { ...c, roles: store.roles.filter(r => r.contactId === c.id && r.active) } : c;
    }),
    findMany: jest.fn(async ({ where }: Row) =>
      store.contacts.filter(
        c =>
          c.tenantId === where.tenantId &&
          store.roles.some(
            r => r.contactId === c.id && r.role === where.roles.some.role && r.active === where.roles.some.active
          )
      )
    ),
    update: jest.fn(async ({ where, data }: Row) => {
      const c = store.contacts.find(x => x.id === where.id)!;
      Object.assign(c, data);
      return c;
    })
  },
  crmContactRole: {
    create: jest.fn(async ({ data }: Row) => {
      const r = { id: `role-${++store.seq}`, ...data };
      store.roles.push(r);
      return r;
    })
  },
  user: {
    findUnique: jest.fn(async ({ where }: Row) => (where.email ? { id: `user-${where.email}` } : null))
  },
  tenantClient: {
    findUnique: jest.fn(async ({ where }: Row) => {
      const { userId, tenantId } = where.userId_tenantId;
      return store.clients.find(c => c.userId === userId && c.tenantId === tenantId) ?? null;
    })
  }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/whatsapp-group-automation-service', () => ({
  autoInviteContactToWhatsappGroup: jest.fn()
}));

const getOrCreate = jest.fn(async (tenantId: string, contactId: string, clientType: string) => {
  const contact = store.contacts.find(c => c.id === contactId && c.tenantId === tenantId);
  if (!contact) throw new Error('Contact not found or does not belong to this tenant');
  const userId = `user-${contact.email}`;
  let tenantClient = store.clients.find(c => c.userId === userId && c.tenantId === tenantId);
  if (!tenantClient) {
    tenantClient = { id: `client-${++store.seq}`, userId, tenantId, clientType };
    store.clients.push(tenantClient);
  }
  return { tenantClient };
});
jest.mock('../../src/services/tenant-service', () => ({
  getOrCreateTenantClientFromContact: (...a: any[]) => (getOrCreate as any)(...a)
}));

import { syncOwnerClients, ensureOwnerClientForContact } from '../../src/services/owner-client-service';
import { convertLeadToClient, updateContactRoles } from '../../src/services/crm-contact-service';
import { NotFoundError } from '../../src/middleware/error-middleware';

beforeEach(() => {
  store.contacts = [
    { id: 'c-kouassi', tenantId: TENANT_A, email: 'kouassi@a.test', status: 'LEAD' },
    { id: 'c-autre', tenantId: TENANT_B, email: 'autre@b.test', status: 'LEAD' }
  ];
  store.roles = [];
  store.clients = [];
  jest.clearAllMocks();
});

describe('conversion au rôle Propriétaire', () => {
  it('crée le TenantClient OWNER une seule fois, même si le rôle est ré-appliqué', async () => {
    await convertLeadToClient(TENANT_A, 'c-kouassi', ['PROPRIETAIRE']);
    expect(store.clients).toHaveLength(1);
    expect(store.clients[0]).toMatchObject({ tenantId: TENANT_A, clientType: 'OWNER' });

    // Ré-ajouter le rôle (voie « roles ») ne duplique rien.
    await updateContactRoles(TENANT_A, 'c-kouassi', ['PROPRIETAIRE']);
    expect(store.clients).toHaveLength(1);
  });

  it('ne crée aucun client pour un autre rôle', async () => {
    await convertLeadToClient(TENANT_A, 'c-kouassi', ['LOCATAIRE']);
    expect(store.clients).toHaveLength(0);
    expect(getOrCreate).not.toHaveBeenCalled();
  });

  it('ajouter le rôle à un contact déjà converti (données existantes) suffit', async () => {
    store.contacts[0].status = 'ACTIVE_CLIENT';
    store.roles.push({ id: 'r0', contactId: 'c-kouassi', role: 'PROPRIETAIRE', active: true, tenantId: TENANT_A });
    await updateContactRoles(TENANT_A, 'c-kouassi', ['PROPRIETAIRE']);
    expect(store.clients).toHaveLength(1);
  });
});

describe('refus inter-agences', () => {
  it("le contact d'une autre agence est refusé par NotFoundError", async () => {
    await expect(ensureOwnerClientForContact(TENANT_A, 'c-autre')).rejects.toBeInstanceOf(NotFoundError);
    expect(store.clients).toHaveLength(0);
  });
});

describe('rattrapage syncOwnerClients', () => {
  it('couvre un contact déjà converti et reste idempotent', async () => {
    // Contact converti avant le correctif : rôle actif, aucun TenantClient.
    store.contacts[0].status = 'ACTIVE_CLIENT';
    store.roles.push({ id: 'r1', contactId: 'c-kouassi', role: 'PROPRIETAIRE', active: true, tenantId: TENANT_A });
    // Le contact de l'autre agence porte aussi le rôle : il ne doit pas être touché.
    store.roles.push({ id: 'r2', contactId: 'c-autre', role: 'PROPRIETAIRE', active: true, tenantId: TENANT_B });

    const premier = await syncOwnerClients(TENANT_A);
    expect(premier).toEqual({ examined: 1, created: 1 });
    expect(store.clients).toHaveLength(1);
    expect(store.clients[0].tenantId).toBe(TENANT_A);

    const second = await syncOwnerClients(TENANT_A);
    expect(second).toEqual({ examined: 1, created: 0 });
    expect(store.clients).toHaveLength(1);
  });

  it("n'examine rien sans propriétaire", async () => {
    expect(await syncOwnerClients(TENANT_A)).toEqual({ examined: 0, created: 0 });
  });
});
