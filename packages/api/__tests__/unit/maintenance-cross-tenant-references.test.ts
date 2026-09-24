/**
 * Lot B — trous d'étanchéité corrigés dans
 * packages/api/src/services/{maintenance-ticket,maintenance-comment,maintenance-attachment}-service.ts.
 *
 * Chaque cas prouve qu'une référence reçue dans un corps de requête
 * (assignedToUserId, tenantContactId) qui pointe vers une autre agence — ou
 * vers un utilisateur qui n'est membre actif d'aucune agence — est refusée,
 * plutôt que silencieusement acceptée. Prisma est remplacé par un magasin en
 * mémoire (même esprit que `crm-cross-tenant-references.test.ts`) : aucune
 * base n'est requise.
 */

type Row = Record<string, any>;

const store = {
  tickets: [] as Row[],
  ticketStatusHistory: [] as Row[],
  comments: [] as Row[],
  attachments: [] as Row[],
  contacts: [] as Row[],
  memberships: [] as Row[],
  leases: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const mockPrisma: Row = {
  maintenanceTicket: {
    findFirst: jest.fn(
      async ({ where }: Row) =>
        store.tickets.find(t => t.id === where.id && t.tenant_id === where.tenant_id) ?? null
    ),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('ticket'), status: 'DECLARED', ...data };
      store.tickets.push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const idx = store.tickets.findIndex(
        t => t.id === where.id && (where.tenant_id === undefined || t.tenant_id === where.tenant_id)
      );
      if (idx === -1) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
      store.tickets[idx] = { ...store.tickets[idx], ...data };
      return store.tickets[idx];
    })
  },

  maintenanceTicketStatusHistory: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('history'), ...data };
      store.ticketStatusHistory.push(created);
      return created;
    })
  },

  maintenanceTicketComment: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('comment'), ...data };
      store.comments.push(created);
      return created;
    })
  },

  maintenanceTicketAttachment: {
    count: jest.fn(async () => 0),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('attachment'), ...data };
      store.attachments.push(created);
      return created;
    })
  },

  crmContact: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.contacts.find(c => c.id === where.id && c.tenantId === where.tenantId) ?? null
    )
  },

  membership: {
    findFirst: jest.fn(
      async ({ where }: Row) =>
        store.memberships.find(
          m => m.tenantId === where.tenantId && m.userId === where.userId && m.status === where.status
        ) ?? null
    )
  },

  rentalLease: {
    findFirst: jest.fn(async ({ where }: Row) => {
      return (
        store.leases.find(
          l =>
            l.tenant_id === where.tenant_id &&
            l.property_id === where.property_id &&
            (where.status === undefined || l.status === where.status)
        ) ?? null
      );
    })
  },

  rentalLeaseCoRenter: {
    findFirst: jest.fn(async () => null)
  },

  $transaction: jest.fn(async (callback: (tx: Row) => Promise<any>) => callback(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, prop) {
        return (mockPrisma as any)[prop];
      }
    }
  )
}));

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn()
}));

jest.mock('../../src/services/maintenance-notification-service', () => ({
  sendTicketCreatedNotification: jest.fn(async () => undefined),
  sendStatusChangeNotification: jest.fn(async () => undefined)
}));

import { createTicket, updateTicket } from '../../src/services/maintenance-ticket-service';
import { addComment } from '../../src/services/maintenance-comment-service';
import { uploadAttachment } from '../../src/services/maintenance-attachment-service';
import { MaintenanceTicketCommentAuthorType } from '@prisma/client';

function seedMembership(overrides: Partial<Row> = {}): Row {
  const membership = { id: nextId('membership'), tenantId: TENANT_A, userId: 'user-1', status: 'ACTIVE', ...overrides };
  store.memberships.push(membership);
  return membership;
}

function seedContact(overrides: Partial<Row> = {}): Row {
  const contact = { id: nextId('contact'), tenantId: TENANT_A, firstName: 'Awa', lastName: 'Diallo', ...overrides };
  store.contacts.push(contact);
  return contact;
}

function seedTicket(overrides: Partial<Row> = {}): Row {
  const ticket = {
    id: nextId('ticket'),
    tenant_id: TENANT_A,
    property_id: 'property-1',
    status: 'DECLARED',
    assigned_vendor_id: null,
    assigned_to_user_id: null,
    ...overrides
  };
  store.tickets.push(ticket);
  return ticket;
}

function seedLease(overrides: Partial<Row> = {}): Row {
  const lease = { id: nextId('lease'), tenant_id: TENANT_A, property_id: 'property-1', status: 'ACTIVE', ...overrides };
  store.leases.push(lease);
  return lease;
}

beforeEach(() => {
  store.tickets = [];
  store.ticketStatusHistory = [];
  store.comments = [];
  store.attachments = [];
  store.contacts = [];
  store.memberships = [];
  store.leases = [];
  store.seq = 0;
  jest.clearAllMocks();
});

describe('maintenance-ticket-service — createTicket : le contact déclarant doit appartenir à cette agence', () => {
  it("refuse un tenantContactId d'une AUTRE agence", async () => {
    const foreignContact = seedContact({ tenantId: TENANT_B });
    seedLease();

    await expect(
      createTicket(
        TENANT_A,
        {
          propertyId: 'property-1',
          title: 'Fuite d’eau',
          category: 'PLUMBING',
          priority: 'HIGH',
          description: 'Fuite sous l’évier'
        } as any,
        undefined,
        foreignContact.id
      )
    ).rejects.toThrow('Contact introuvable');

    expect(store.tickets).toHaveLength(0);
  });

  it('accepte un tenantContactId de la même agence', async () => {
    const contact = seedContact();
    seedLease();

    const ticket = await createTicket(
      TENANT_A,
      {
        propertyId: 'property-1',
        title: 'Fuite d’eau',
        category: 'PLUMBING',
        priority: 'HIGH',
        description: 'Fuite sous l’évier'
      } as any,
      undefined,
      contact.id
    );

    expect(ticket.tenant_contact_id).toBe(contact.id);
    expect(store.tickets).toHaveLength(1);
  });
});

describe('maintenance-ticket-service — updateTicket : assignedToUserId doit être membre actif de cette agence', () => {
  it("refuse un assignedToUserId qui n'est membre que d'une AUTRE agence", async () => {
    const ticket = seedTicket();
    seedMembership({ tenantId: TENANT_B, userId: 'user-2' });

    await expect(
      updateTicket(TENANT_A, ticket.id, { assignedToUserId: 'user-2' } as any, 'actor-1')
    ).rejects.toThrow('Utilisateur introuvable ou non membre actif de cette agence');

    expect(store.tickets.find(t => t.id === ticket.id)?.assigned_to_user_id).toBeNull();
  });

  it('accepte un assignedToUserId membre actif de la même agence', async () => {
    const ticket = seedTicket();
    seedMembership({ tenantId: TENANT_A, userId: 'user-1' });

    const updated = await updateTicket(TENANT_A, ticket.id, { assignedToUserId: 'user-1' } as any, 'actor-1');

    expect(updated.assigned_to_user_id).toBe('user-1');
  });
});

describe("maintenance-comment-service — addComment : le contact auteur doit appartenir à cette agence", () => {
  it("refuse un authorContactId d'une AUTRE agence", async () => {
    const ticket = seedTicket();
    const foreignContact = seedContact({ tenantId: TENANT_B });

    await expect(
      addComment(
        TENANT_A,
        ticket.id,
        { content: 'Un commentaire' } as any,
        MaintenanceTicketCommentAuthorType.TENANT,
        undefined,
        foreignContact.id
      )
    ).rejects.toThrow('Contact introuvable');

    expect(store.comments).toHaveLength(0);
  });

  it('accepte un authorContactId de la même agence', async () => {
    const ticket = seedTicket();
    const contact = seedContact();

    const comment = await addComment(
      TENANT_A,
      ticket.id,
      { content: 'Un commentaire' } as any,
      MaintenanceTicketCommentAuthorType.TENANT,
      undefined,
      contact.id
    );

    expect(comment.author_contact_id).toBe(contact.id);
  });
});

describe('maintenance-attachment-service — uploadAttachment : le contact qui dépose doit appartenir à cette agence', () => {
  it("refuse un tenantContactId d'une AUTRE agence, avant toute écriture sur disque", async () => {
    const ticket = seedTicket();
    const foreignContact = seedContact({ tenantId: TENANT_B });

    await expect(
      uploadAttachment(
        TENANT_A,
        ticket.id,
        { originalname: 'photo.png', mimetype: 'image/png', size: 10, buffer: Buffer.from('x') } as any,
        undefined,
        foreignContact.id
      )
    ).rejects.toThrow('Contact introuvable');

    expect(store.attachments).toHaveLength(0);
  });
});
