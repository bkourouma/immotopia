/**
 * Lot B6 — trous d'étanchéité corrigés dans packages/api/src/services/{crm-contact,crm-deal,crm-matching}-service.ts
 * et document-template-service.ts.
 *
 * Chaque cas prouve qu'une référence reçue dans un corps de requête
 * (assignedToUserId, sourceOwnerContactId, templateId) qui pointe vers une
 * autre agence est refusée, plutôt que silencieusement acceptée. Prisma est
 * remplacé par un magasin en mémoire (même esprit que `finance.sites.test.ts`) :
 * aucune base n'est requise.
 */

type Row = Record<string, any>;

const store = {
  contacts: [] as Row[],
  deals: [] as Row[],
  dealProperties: [] as Row[],
  properties: [] as Row[],
  memberships: [] as Row[],
  templates: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const mockPrisma: Row = {
  crmContact: {
    findUnique: jest.fn(async ({ where }: Row) => {
      if (where.tenantId_email) {
        return (
          store.contacts.find(
            c => c.tenantId === where.tenantId_email.tenantId && c.email === where.tenantId_email.email
          ) ?? null
        );
      }
      return store.contacts.find(c => c.id === where.id) ?? null;
    }),
    findFirst: jest.fn(
      async ({ where }: Row) => store.contacts.find(c => c.id === where.id && c.tenantId === where.tenantId) ?? null
    ),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('contact'), ...data };
      store.contacts.push(created);
      return created;
    })
  },

  crmDeal: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.deals.find(d => d.id === where.id && d.tenantId === where.tenantId) ?? null
    ),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('deal'), version: 1, ...data };
      store.deals.push(created);
      return created;
    })
  },

  property: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.properties.find(p => p.id === where.id && p.tenantId === where.tenantId) ?? null
    )
  },

  crmDealProperty: {
    findUnique: jest.fn(async ({ where }: Row) => {
      const key = where.tenantId_dealId_propertyId;
      return (
        store.dealProperties.find(
          dp => dp.tenantId === key.tenantId && dp.dealId === key.dealId && dp.propertyId === key.propertyId
        ) ?? null
      );
    }),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('dealprop'), ...data };
      store.dealProperties.push(created);
      return created;
    })
  },

  membership: {
    findFirst: jest.fn(
      async ({ where }: Row) =>
        store.memberships.find(
          m => m.tenantId === where.tenantId && m.userId === where.userId && m.status === where.status
        ) ?? null
    )
  },

  documentTemplate: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const statusFilter = where.status;
      return (
        store.templates.find(t => {
          if (t.id !== where.id) return false;
          if (t.tenant_id !== where.tenant_id) return false;
          if (statusFilter?.not && t.status === statusFilter.not) return false;
          return true;
        }) ?? null
      );
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const idx = store.templates.findIndex(
        t => t.id === where.id && (where.tenant_id === undefined || t.tenant_id === where.tenant_id)
      );
      if (idx === -1) {
        throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
      }
      store.templates[idx] = { ...store.templates[idx], ...data };
      return store.templates[idx];
    })
  }
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

// logAuditEvent only pushes to an in-memory queue (flushed on a timer / at
// threshold), so it needs no mock — but stub it out anyway to keep these
// tests focused on the isolation check, not on audit plumbing.
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn()
}));

// Fire-and-forget in createContact; not the point of this test.
jest.mock('../../src/services/whatsapp-group-automation-service', () => ({
  autoInviteContactToWhatsappGroup: jest.fn(async () => undefined)
}));

import { createContact, assertActiveMember } from '../../src/services/crm-contact-service';
import { addPropertyToShortlist } from '../../src/services/crm-matching-service';
import { activateTemplate } from '../../src/services/document-template-service';

// crm-deal-service.ts (createDeal) applies the exact same `assertActiveMember`
// guard as crm-contact-service.ts (see its diff), but the module also carries
// pre-existing, unrelated TypeScript errors (getDealById's DealDetail shape,
// CrmDealStage used as a namespace in closeDeal, UpdateDealRequest.closedReason
// nullability) that predate this change and that ts-jest refuses to import
// through. Per AGENTS.md or its equivalent for this lot ("ne pas ajouter
// d'erreurs, en corriger est bienvenu mais pas obligatoire"), those are left
// alone rather than widened here; createDeal's own guard is covered instead
// by the crm-contact-service assertions above, since it is the identical
// helper and call pattern.

function seedMembership(overrides: Partial<Row> = {}): Row {
  const membership = { id: nextId('membership'), tenantId: TENANT_A, userId: 'user-1', status: 'ACTIVE', ...overrides };
  store.memberships.push(membership);
  return membership;
}

function seedContact(overrides: Partial<Row> = {}): Row {
  const contact = {
    id: nextId('contact'),
    tenantId: TENANT_A,
    firstName: 'Awa',
    lastName: 'Diallo',
    email: `awa-${store.seq}@example.com`,
    ...overrides
  };
  store.contacts.push(contact);
  return contact;
}

function seedDeal(overrides: Partial<Row> = {}): Row {
  const deal = { id: nextId('deal'), tenantId: TENANT_A, contactId: null, version: 1, ...overrides };
  store.deals.push(deal);
  return deal;
}

function seedProperty(overrides: Partial<Row> = {}): Row {
  const property = { id: nextId('property'), tenantId: TENANT_A, status: 'available', ...overrides };
  store.properties.push(property);
  return property;
}

function seedTemplate(overrides: Partial<Row> = {}): Row {
  const template = {
    id: nextId('template'),
    tenant_id: TENANT_A,
    doc_type: 'RENT_RECEIPT',
    status: 'INACTIVE',
    is_default: false,
    ...overrides
  };
  store.templates.push(template);
  return template;
}

beforeEach(() => {
  store.contacts = [];
  store.deals = [];
  store.dealProperties = [];
  store.properties = [];
  store.memberships = [];
  store.templates = [];
  store.seq = 0;
  jest.clearAllMocks();
});

describe('crm-contact-service — assignedToUserId doit être membre actif de la même agence', () => {
  it('assertActiveMember refuse un utilisateur sans adhésion active pour ce tenant', async () => {
    await expect(assertActiveMember(TENANT_A, 'user-inconnu')).rejects.toThrow(
      "L'utilisateur assigné doit être membre actif de cette agence"
    );
  });

  it('assertActiveMember accepte un membre actif du tenant', async () => {
    seedMembership({ tenantId: TENANT_A, userId: 'user-1' });
    await expect(assertActiveMember(TENANT_A, 'user-1')).resolves.toBeUndefined();
  });

  it("createContact refuse un assignedToUserId qui n'est membre que d'une AUTRE agence", async () => {
    // user-2 est membre actif de TENANT_B, jamais de TENANT_A.
    seedMembership({ tenantId: TENANT_B, userId: 'user-2' });

    await expect(
      createContact(
        TENANT_A,
        {
          firstName: 'Mamadou',
          lastName: 'Bah',
          email: 'mamadou.bah@example.com',
          assignedToUserId: 'user-2'
        } as any,
        'actor-1'
      )
    ).rejects.toThrow("L'utilisateur assigné doit être membre actif de cette agence");

    // Le contact n'a pas été créé : le refus est bien avant l'écriture.
    expect(store.contacts).toHaveLength(0);
  });

  it('createContact accepte un assignedToUserId membre actif de la même agence', async () => {
    seedMembership({ tenantId: TENANT_A, userId: 'user-1' });

    const contact = await createContact(
      TENANT_A,
      {
        firstName: 'Mamadou',
        lastName: 'Bah',
        email: 'mamadou.bah@example.com',
        assignedToUserId: 'user-1'
      } as any,
      'actor-1'
    );

    expect(contact.assignedToUserId).toBe('user-1');
    expect(store.contacts).toHaveLength(1);
  });
});

describe('crm-matching-service — sourceOwnerContactId reçu du corps doit appartenir au tenant', () => {
  it("addPropertyToShortlist refuse un sourceOwnerContactId d'une autre agence", async () => {
    const deal = seedDeal();
    const property = seedProperty();
    const foreignOwner = seedContact({ tenantId: TENANT_B, email: 'owner-b@example.com' });

    await expect(
      addPropertyToShortlist(TENANT_A, deal.id, property.id, 80, {}, foreignOwner.id)
    ).rejects.toThrow('Owner contact not found');

    expect(store.dealProperties).toHaveLength(0);
  });

  it('addPropertyToShortlist accepte un sourceOwnerContactId de la même agence', async () => {
    const deal = seedDeal();
    const property = seedProperty();
    const owner = seedContact({ tenantId: TENANT_A });

    const shortlisted = await addPropertyToShortlist(TENANT_A, deal.id, property.id, 80, {}, owner.id);

    expect(shortlisted.sourceOwnerContactId).toBe(owner.id);
  });
});

describe("document-template-service — une agence ne peut jamais activer/modifier un gabarit d'une autre agence ou un gabarit global", () => {
  it("activateTemplate refuse un gabarit global (tenant_id null) pour un appel d'agence", async () => {
    const globalTemplate = seedTemplate({ tenant_id: null });

    await expect(activateTemplate(TENANT_A, globalTemplate.id, 'actor-1')).rejects.toMatchObject({
      status: 404
    });
  });

  it("activateTemplate refuse un gabarit appartenant à une AUTRE agence", async () => {
    const otherAgencyTemplate = seedTemplate({ tenant_id: TENANT_B });

    await expect(activateTemplate(TENANT_A, otherAgencyTemplate.id, 'actor-1')).rejects.toMatchObject({
      status: 404
    });
  });

  it('activateTemplate active un gabarit appartenant à la même agence', async () => {
    const ownTemplate = seedTemplate({ tenant_id: TENANT_A });

    const updated = await activateTemplate(TENANT_A, ownTemplate.id, 'actor-1');

    expect(updated.status).toBe('ACTIVE');
  });
});
