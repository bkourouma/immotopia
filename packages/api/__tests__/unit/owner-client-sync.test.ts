/**
 * BUG-2026-09-28-019 — un contact CRM au rôle Propriétaire devient un
 * `TenantClient` OWNER (vendeur d'un mandat, propriétaire d'un bien,
 * indivision), sans passer par un bail.
 *
 * Sécurité : ce rattachement ne crée JAMAIS de compte `User` ni ne notifie
 * (WhatsApp/e-mail) : il réutilise uniquement un compte existant. Sinon un
 * collaborateur pouvait saisir l'e-mail d'une victime et son propre numéro,
 * recevoir le lien de réinitialisation et prendre le compte.
 *
 * Prisma est remplacé par un magasin en mémoire ; `tenant-service`
 * (`getOrCreateTenantClientFromContact`, qui crée un compte et notifie) est
 * simulé et ne doit jamais être appelé.
 */

type Row = Record<string, any>;

const store = {
  contacts: [] as Row[],
  roles: [] as Row[],
  clients: [] as Row[],
  users: [] as Row[],
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
    findUnique: jest.fn(async ({ where }: Row) => store.users.find(u => u.email === where.email) ?? null),
    create: jest.fn(async ({ data }: Row) => {
      const u = { id: `user-${data.email}`, ...data };
      store.users.push(u);
      return u;
    })
  },
  passwordResetToken: {
    create: jest.fn(async () => {
      throw new Error('aucun jeton de réinitialisation ne doit être émis');
    })
  },
  tenantClient: {
    findUnique: jest.fn(async ({ where }: Row) => {
      const { userId, tenantId } = where.userId_tenantId;
      return store.clients.find(c => c.userId === userId && c.tenantId === tenantId) ?? null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      const row = { id: `client-${++store.seq}`, ...data };
      store.clients.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.clients.find(c => c.id === where.id)!;
      Object.assign(row, data);
      return row;
    })
  }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/whatsapp-group-automation-service', () => ({
  autoInviteContactToWhatsappGroup: jest.fn()
}));

const getOrCreate = jest.fn(async () => {
  throw new Error('getOrCreateTenantClientFromContact crée un compte et notifie : interdit ici');
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
    { id: 'c-autre', tenantId: TENANT_B, email: 'autre@b.test', status: 'LEAD' },
    { id: 'c-victime', tenantId: TENANT_A, email: 'victime@x.test', status: 'LEAD', phonePrimary: '+2250000' }
  ];
  store.roles = [];
  store.clients = [];
  // Seul kouassi possède déjà un compte ; « victime@x.test » n'en a pas.
  store.users = [{ id: 'user-kouassi@a.test', email: 'kouassi@a.test' }];
  jest.clearAllMocks();
});

describe('conversion au rôle Propriétaire', () => {
  it('rattache le TenantClient OWNER d’un compte existant, une seule fois', async () => {
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

describe('sécurité : aucun jeton ni notification, compte dormant seulement', () => {
  it('un contact sans compte reçoit un compte DORMANT : mot de passe inconnu, e-mail non vérifié, aucun jeton, aucune notification', async () => {
    await convertLeadToClient(TENANT_A, 'c-victime', ['PROPRIETAIRE']);
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.user.create.mock.calls[0][0].data;
    expect(data.emailVerified).toBe(false);
    expect(typeof data.passwordHash).toBe('string');
    expect(data.passwordHash.length).toBeGreaterThan(20);
    expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(getOrCreate).not.toHaveBeenCalled();
    expect(store.clients).toHaveLength(1);
    expect(store.clients[0].clientType).toBe('OWNER');
  });

  it('le rattrapage ne crée que des comptes dormants, sans jeton ni notification', async () => {
    store.roles.push({ id: 'r1', contactId: 'c-kouassi', role: 'PROPRIETAIRE', active: true, tenantId: TENANT_A });
    store.roles.push({ id: 'r3', contactId: 'c-victime', role: 'PROPRIETAIRE', active: true, tenantId: TENANT_A });
    const res = await syncOwnerClients(TENANT_A);
    expect(res).toEqual({ examined: 2, created: 2 });
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(getOrCreate).not.toHaveBeenCalled();
    expect(store.clients).toHaveLength(2);
  });
});
