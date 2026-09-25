/**
 * Tests de `services/tenant-provisioning-service.ts` (lot F1 — creation
 * d'agence en un clic).
 *
 * Modele : `__tests__/unit/finance.stock-referentiel.test.ts` (magasin en
 * memoire derriere un faux client Prisma, transaction a rollback par
 * `structuredClone`). Les fonctions `ensure*Tx` (lib/finance/**,
 * lib/treasury/**, lib/owner-account/**) sont simulees : elles ne portent pas
 * la logique testee ici et leurs propres fichiers ont deja leurs tests.
 * `services/invitation-service.ts`, lui, n'est PAS simule : c'est le vrai
 * `createInvitationRecordTx` qui tourne, contre le meme faux Prisma.
 */

type Row = Record<string, any>;

// Catalogue des offres (abonnements par packs) : la grille par defaut, sous la
// forme des lignes Prisma que lit `loadCatalogByCodes`.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DEFAULT_CATALOG } = require('../../src/lib/subscription/catalog');
const CATALOG_ROWS: Row[] = DEFAULT_CATALOG.map((d: Row, i: number) => ({
  id: `catalog-${i + 1}`,
  code: d.code,
  kind: d.kind,
  name: d.name,
  description: d.description,
  monthlyPrice: d.monthlyPrice,
  setupPrice: d.setupPrice,
  modules: d.modules,
  exclusiveGroup: d.exclusiveGroup,
  rules: d.rules,
  isSellable: d.isSellable,
  sortOrder: d.sortOrder,
  capacities: Object.entries(d.capacities).map(([capacityKey, amount]) => ({ capacityKey, amount }))
}));

function nextId(prefix: string, store: { seq: number }): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function freshStore() {
  return {
    tenants: [] as Row[],
    tenantModules: [] as Row[],
    subscriptions: [] as Row[],
    subscriptionItems: [] as Row[],
    financeSettings: [] as Row[],
    roles: [{ id: 'role-tenant-admin', key: 'TENANT_ADMIN', name: "Administrateur de l'agence", scope: 'TENANT' }] as Row[],
    users: [] as Row[],
    memberships: [] as Row[],
    userRoles: [] as Row[],
    invitations: [] as Row[],
    auditLogs: [] as Row[],
    seq: 0
  };
}

let store = freshStore();

function buildFakePrisma() {
  const fakePrisma: Row = {
    tenant: {
      create: jest.fn(async ({ data }: Row) => {
        const row = { id: nextId('tenant', store), createdAt: new Date(), updatedAt: new Date(), isActive: true, ...data };
        store.tenants.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: Row) => store.tenants.find(t => t.slug === where.slug) ?? null),
      findUnique: jest.fn(async ({ where, select }: Row) => {
        const row = store.tenants.find(t => t.id === where.id);
        if (!row) return null;
        if (!select) return row;
        const out: Row = {};
        for (const key of Object.keys(select)) if (select[key]) out[key] = row[key];
        return out;
      }),
      update: jest.fn(async ({ where, data }: Row) => {
        const row = store.tenants.find(t => t.id === where.id)!;
        Object.assign(row, data);
        return row;
      })
    },
    tenantModule: {
      createMany: jest.fn(async ({ data }: Row) => {
        for (const d of data) store.tenantModules.push({ id: nextId('tm', store), ...d });
        return { count: data.length };
      }),
      findMany: jest.fn(async ({ where }: Row) =>
        store.tenantModules.filter(m => m.tenantId === where.tenantId && (where.enabled === undefined || m.enabled === where.enabled))
      )
    },
    subscription: {
      create: jest.fn(async ({ data }: Row) => {
        const row = { id: nextId('sub', store), createdAt: new Date(), updatedAt: new Date(), ...data };
        store.subscriptions.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: Row) => store.subscriptions.find(s => s.tenantId === where.tenantId) ?? null)
    },
    catalogItem: {
      findMany: jest.fn(async ({ where }: Row) => CATALOG_ROWS.filter(r => where.code.in.includes(r.code)))
    },
    subscriptionItem: {
      createMany: jest.fn(async ({ data }: Row) => {
        for (const d of data) store.subscriptionItems.push({ id: nextId('si', store), createdAt: new Date(), ...d });
        return { count: data.length };
      }),
      findMany: jest.fn(async ({ where }: Row) =>
        store.subscriptionItems
          .filter(i => i.tenantId === where.tenantId && i.status !== 'ENDED')
          .map(i => {
            const c = CATALOG_ROWS.find(r => r.id === i.catalogItemId)!;
            return { ...i, catalogItem: { code: c.code, kind: c.kind, capacities: [], rules: c.rules ?? null } };
          })
      ),
      // Rattachement des extensions a leur pack (linkExtensionsToPacksTx).
      update: jest.fn(async ({ where, data }: Row) => {
        const row = store.subscriptionItems.find(i => i.id === where.id)!;
        Object.assign(row, data);
        return row;
      })
    },
    agencyFinanceSettings: {
      create: jest.fn(async ({ data }: Row) => {
        const row = { id: nextId('fs', store), createdAt: new Date(), updatedAt: new Date(), ...data };
        store.financeSettings.push(row);
        return row;
      })
    },
    role: {
      findFirst: jest.fn(async ({ where }: Row) => store.roles.find(r => r.key === where.key && r.scope === where.scope) ?? null),
      findMany: jest.fn(async ({ where }: Row) => store.roles.filter(r => where.id.in.includes(r.id)))
    },
    user: {
      findFirst: jest.fn(async ({ where }: Row) => {
        const emailFilter = where.email;
        const email = typeof emailFilter === 'string' ? emailFilter : emailFilter.equals;
        const insensitive = typeof emailFilter === 'object' && emailFilter.mode === 'insensitive';
        return (
          store.users.find(u => (insensitive ? u.email.toLowerCase() === String(email).toLowerCase() : u.email === email)) ??
          null
        );
      }),
      create: jest.fn(async ({ data }: Row) => {
        const row = { id: nextId('user', store), createdAt: new Date(), updatedAt: new Date(), ...data };
        store.users.push(row);
        return row;
      })
    },
    membership: {
      create: jest.fn(async ({ data }: Row) => {
        const row = { id: nextId('membership', store), createdAt: new Date(), updatedAt: new Date(), ...data };
        store.memberships.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where, include }: Row) => {
        const emailFilter = where.user?.email;
        const email = emailFilter ? (typeof emailFilter === 'string' ? emailFilter : emailFilter.equals) : undefined;
        const row = store.memberships.find(m => {
          if (m.tenantId !== where.tenantId) return false;
          if (!email) return true;
          const user = store.users.find(u => u.id === m.userId);
          return user?.email.toLowerCase() === String(email).toLowerCase();
        });
        if (!row) return null;
        if (include?.user) {
          const user = store.users.find(u => u.id === row.userId)!;
          return { ...row, user: { id: user.id, email: user.email, fullName: user.fullName } };
        }
        return row;
      })
    },
    userRole: {
      create: jest.fn(async ({ data }: Row) => {
        const row = { id: nextId('userRole', store), createdAt: new Date(), updatedAt: new Date(), ...data };
        store.userRoles.push(row);
        return row;
      })
    },
    invitation: {
      create: jest.fn(async ({ data }: Row) => {
        const row = { id: nextId('invitation', store), createdAt: new Date(), updatedAt: new Date(), status: 'PENDING', ...data };
        store.invitations.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: Row) => {
        const rows = store.invitations
          .filter(i => i.tenantId === where.tenantId && (!where.email || i.email === where.email))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows[0] ?? null;
      }),
      update: jest.fn(async ({ where, data }: Row) => {
        const row = store.invitations.find(i => i.id === where.id)!;
        Object.assign(row, data);
        return row;
      })
    },
    auditLog: {
      findMany: jest.fn(async ({ where, take }: Row) =>
        store.auditLogs
          .filter(a => a.actorUserId === where.actorUserId && a.actionKey === where.actionKey && a.createdAt >= where.createdAt.gte)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, take ?? 50)
      )
    },
    $transaction: async (cb: (tx: Row) => Promise<any>) => {
      const snapshot = structuredClone(store);
      try {
        return await cb(fakePrisma);
      } catch (error) {
        Object.assign(store, snapshot);
        throw error;
      }
    }
  };
  return fakePrisma;
}

let fakePrisma = buildFakePrisma();

jest.mock('../../src/utils/database', () => ({
  get prisma() {
    return fakePrisma;
  }
}));

jest.mock('../../src/lib/finance/accounting', () => ({
  ensureOperationalChartOfAccountsTx: jest.fn(async () => new Map()),
  ensureOperationalJournalTx: jest.fn(async () => 'journal-1')
}));

jest.mock('../../src/lib/treasury/accounts', () => ({
  ensureDefaultTreasuryAccountTx: jest.fn(async () => ({
    treasuryAccountId: 'treasury-1',
    chartOfAccountId: 'coa-1',
    accountNumber: '5711',
    label: 'Caisse',
    kind: 'CASH',
    journal: 'CASH'
  }))
}));

jest.mock('../../src/lib/finance/stock-referentiel', () => ({
  ensureStockSettingsTx: jest.fn(async () => ({
    tenantId: 't',
    valuationMethod: 'WEIGHTED_AVERAGE',
    decidedAt: new Date(),
    decisionNote: null
  }))
}));

const ensureRentalAccountsTxMock = jest.fn(async (..._args: any[]) => ({
  ownerFunds: 'coa-owner',
  fees: 'coa-fees',
  vat: 'coa-vat',
  withholding: 'coa-withholding',
  suppliers: 'coa-suppliers',
  penaltyIncome: null
}));
jest.mock('../../src/lib/owner-account/accounts', () => ({
  ensureRentalAccountsTx: (...args: any[]) => ensureRentalAccountsTxMock(...args)
}));

const sendInviteEmailMock = jest.fn(async (..._args: any[]) => {});
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendInviteEmail: (...args: any[]) => sendInviteEmailMock(...args) }
}));

// `tenant-service.ts` porte 5 des ~93 erreurs TypeScript preexistantes du
// paquet (voir AGENTS.md) : le mocker evite que ts-jest tente de compiler ce
// fichier pour la seule fonction pure dont ce test a besoin. Meme algorithme
// que l'original (services/tenant-service.ts::generateSlugFromName).
jest.mock('../../src/services/tenant-service', () => ({
  generateSlugFromName: (name: string) =>
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
}));

jest.mock('../../src/services/audit-service', () => {
  const actual = jest.requireActual('../../src/services/audit-service');
  return {
    ...actual,
    logAuditEvent: (entry: any) => {
      store.auditLogs.push({ id: nextId('audit', store), createdAt: new Date(), ...entry });
    }
  };
});

import { provisionTenant } from '../../src/services/tenant-provisioning-service';
import type { ProvisionTenantRequest } from '../../src/types/tenant-types';

const baseInput: ProvisionTenantRequest = {
  name: 'Agence Kipe',
  adminFullName: 'Awa Diallo',
  adminEmail: 'awa.diallo@example.com'
};

beforeEach(() => {
  store = freshStore();
  fakePrisma = buildFakePrisma();
  sendInviteEmailMock.mockReset();
  sendInviteEmailMock.mockResolvedValue(undefined);
  ensureRentalAccountsTxMock.mockClear();
});

describe('provisionTenant — chemin nominal', () => {
  it('cree tenant ACTIF, module par defaut AGENCY, abonnement PRO/MONTHLY en essai 30 jours, et invite un nouvel administrateur', async () => {
    const { result, replay } = await provisionTenant(baseInput, 'super-admin-1');

    expect(replay).toBe(false);
    expect(result.tenant.name).toBe('Agence Kipe');
    expect(result.tenant.status).toBe('ACTIVE');
    expect(result.modules).toEqual(['MODULE_AGENCY']);
    expect(result.subscription.planKey).toBe('PRO');
    expect(result.subscription.billingCycle).toBe('MONTHLY');
    expect(result.subscription.status).toBe('TRIALING');
    expect(result.admin.existingUser).toBe(false);
    expect(result.admin.email).toBe('awa.diallo@example.com');
    expect(result.invitation.acceptUrl).toContain('/auth/accept-invite?token=');
    expect(result.emailSent).toBe(true);

    // 30 jours d'essai (TRIAL_DAYS), a une seconde pres pour l'horloge du test.
    const expectedEnd = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(new Date(result.subscription.currentPeriodEnd).getTime() - expectedEnd)).toBeLessThan(5000);

    // Membership + role poses immediatement (PENDING_INVITE), pas seulement a l'acceptation.
    expect(store.memberships).toHaveLength(1);
    expect(store.memberships[0].status).toBe('PENDING_INVITE');
    expect(store.userRoles).toHaveLength(1);
    expect(store.userRoles[0].roleId).toBe('role-tenant-admin');

    // Socle comptable/tresorerie appele pour cette agence.
    expect(ensureRentalAccountsTxMock).toHaveBeenCalledWith(expect.anything(), result.tenant.id, expect.any(Object));

    // Journal d'audit : TENANT_CREATED + TENANT_PROVISIONED.
    const actionKeys = store.auditLogs.map(a => a.actionKey);
    expect(actionKeys).toEqual(expect.arrayContaining(['TENANT_CREATED', 'TENANT_PROVISIONED']));
  });

  it("modules par defaut d'une agence OPERATOR : AGENCE + SYNDIC + PROMOTEUR (pack Integre)", async () => {
    const { result } = await provisionTenant({ ...baseInput, adminEmail: 'op@example.com', type: 'OPERATOR' }, 'super-admin-1');
    expect(result.modules.sort()).toEqual(['MODULE_AGENCY', 'MODULE_PROMOTER', 'MODULE_SYNDIC'].sort());
    expect(result.subscription.items.map(i => i.code)).toEqual(['INTEGRE']);
  });

  it('genere un slug unique en ajoutant -2, -3... quand le nom collide', async () => {
    const first = await provisionTenant(baseInput, 'super-admin-1');
    const second = await provisionTenant({ ...baseInput, adminEmail: 'autre.admin@example.com' }, 'super-admin-1');
    const third = await provisionTenant({ ...baseInput, adminEmail: 'troisieme.admin@example.com' }, 'super-admin-1');

    expect(first.result.tenant.slug).toBe('agence-kipe');
    expect(second.result.tenant.slug).toBe('agence-kipe-2');
    expect(third.result.tenant.slug).toBe('agence-kipe-3');
  });

  it('reutilise un utilisateur existant (meme e-mail, insensible a la casse) plutot que d’en creer un second', async () => {
    store.users.push({
      id: 'user-existing',
      email: 'awa.diallo@example.com',
      fullName: 'Awa D. (compte existant)',
      passwordHash: 'hash-existant',
      emailVerified: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const { result } = await provisionTenant({ ...baseInput, adminEmail: 'Awa.Diallo@EXAMPLE.com' }, 'super-admin-1');

    expect(result.admin.existingUser).toBe(true);
    expect(result.admin.userId).toBe('user-existing');
    expect(store.users).toHaveLength(1); // aucun second utilisateur cree
  });
});

describe('provisionTenant — envoi e-mail', () => {
  it("un echec d'envoi ne defait rien : emailSent vaut false mais l'agence est creee", async () => {
    sendInviteEmailMock.mockRejectedValueOnce(new Error('SMTP indisponible'));

    const { result } = await provisionTenant(baseInput, 'super-admin-1');

    expect(result.emailSent).toBe(false);
    expect(store.tenants).toHaveLength(1);
    expect(store.tenants[0].status).toBe('ACTIVE');
    expect(store.invitations).toHaveLength(1);
  });
});

describe('provisionTenant — tout ou rien', () => {
  it("une etape qui echoue (socle comptable) annule toute la transaction : aucun Tenant ne persiste", async () => {
    ensureRentalAccountsTxMock.mockRejectedValueOnce(new Error('Deux comptes portent le meme numero'));

    await expect(provisionTenant(baseInput, 'super-admin-1')).rejects.toThrow('Deux comptes portent le meme numero');

    expect(store.tenants).toHaveLength(0);
    expect(store.subscriptions).toHaveLength(0);
    expect(store.memberships).toHaveLength(0);
    expect(store.invitations).toHaveLength(0);
  });
});

describe('provisionTenant — idempotence (F1.9)', () => {
  it('meme cle + meme super-admin -> rejeu depuis la memoire, sans recreer', async () => {
    const first = await provisionTenant(baseInput, 'super-admin-1', 'clic-1');
    const tenantCountAfterFirst = store.tenants.length;

    const second = await provisionTenant(baseInput, 'super-admin-1', 'clic-1');

    expect(second.replay).toBe(true);
    expect(second.result.tenant.id).toBe(first.result.tenant.id);
    expect(store.tenants).toHaveLength(tenantCountAfterFirst); // rien de plus cree
  });

  it("une cle differente, ou un autre super-admin, ne rejoue pas : nouvelle agence creee", async () => {
    const first = await provisionTenant(baseInput, 'super-admin-1', 'clic-A');
    const second = await provisionTenant(
      { ...baseInput, adminEmail: 'second-admin@example.com' },
      'super-admin-1',
      'clic-B'
    );

    expect(second.replay).toBe(false);
    expect(second.result.tenant.id).not.toBe(first.result.tenant.id);
  });

  it('sans cle en commun, un doublon (meme nom + meme e-mail admin + meme super-admin) sous 24h est detecte via le journal d’audit', async () => {
    // Ni le premier ni le second appel ne portent de cle : la barriere memoire
    // (indexee par cle) ne joue donc jamais ici, seule la verification en
    // base (findRecentDuplicateTenantId) peut detecter le doublon.
    const first = await provisionTenant(baseInput, 'super-admin-1');
    const second = await provisionTenant(baseInput, 'super-admin-1');

    expect(second.replay).toBe(true);
    expect(second.result.tenant.id).toBe(first.result.tenant.id);
    expect(store.tenants).toHaveLength(1);
    // Le rejeu en base regenere un jeton d'invitation utilisable (le jeton en
    // clair d'origine n'est jamais persiste) : un nouvel e-mail est tente.
    expect(sendInviteEmailMock).toHaveBeenCalledTimes(2);
  });
});

describe('provisionTenant — abonnement par packs (PLAN-ABONNEMENTS.md)', () => {
  it('ancien format sans items : module par defaut -> pack AGENCE au prix du catalogue, planKey PRO conserve', async () => {
    const { result } = await provisionTenant(baseInput, 'super-admin-1');
    expect(result.subscription.planKey).toBe('PRO');
    expect(result.subscription.items).toEqual([
      { code: 'AGENCE', kind: 'PACK', quantity: 1, unitMonthlyPrice: 29_900, unitSetupPrice: 0 }
    ]);
    expect(store.subscriptionItems).toHaveLength(1);
    expect(store.subscriptionItems[0]).toMatchObject({ tenantId: result.tenant.id, status: 'ACTIVE', unitMonthlyPrice: 29_900 });
    expect(store.tenantModules.map(m => [m.moduleKey, m.source])).toEqual([['MODULE_AGENCY', 'PACK']]);
    expect(result.subscription.trialEndsAt).toBe(result.subscription.currentPeriodEnd);
  });

  it('ancien format : modules explicites AGENCY + SYNDIC -> packs AGENCE + SYNDIC', async () => {
    const { result } = await provisionTenant({ ...baseInput, modules: ['MODULE_SYNDIC', 'MODULE_AGENCY'] }, 'super-admin-1');
    expect(result.subscription.items.map(i => i.code).sort()).toEqual(['AGENCE', 'SYNDIC']);
    expect(result.modules.sort()).toEqual(['MODULE_AGENCY', 'MODULE_SYNDIC']);
  });

  it('items : packs + extensions, prix figes, modules deduits, planKey nul', async () => {
    const { result } = await provisionTenant(
      {
        ...baseInput,
        items: [{ code: 'SYNDIC' }, { code: 'PROMOTEUR' }, { code: 'EXT_LOTS_10', quantity: 3 }, { code: 'EXT_CHANTIER' }]
      },
      'super-admin-1'
    );
    expect(result.subscription.planKey).toBeNull();
    expect(result.modules.sort()).toEqual(['MODULE_PROMOTER', 'MODULE_SYNDIC']);
    expect(result.subscription.items).toEqual([
      { code: 'SYNDIC', kind: 'PACK', quantity: 1, unitMonthlyPrice: 49_900, unitSetupPrice: 0 },
      { code: 'PROMOTEUR', kind: 'PACK', quantity: 1, unitMonthlyPrice: 149_900, unitSetupPrice: 0 },
      // Promoteur detenu : le bloc de 10 lots passe a 1 000 (100 FCFA le lot, D5).
      { code: 'EXT_LOTS_10', kind: 'EXTENSION', quantity: 3, unitMonthlyPrice: 1_000, unitSetupPrice: 0 },
      { code: 'EXT_CHANTIER', kind: 'EXTENSION', quantity: 1, unitMonthlyPrice: 40_000, unitSetupPrice: 0 }
    ]);
  });

  it("items : l'Integre n'est pas cumulable avec un autre pack -> 400, rien n'est cree", async () => {
    await expect(
      provisionTenant({ ...baseInput, items: [{ code: 'INTEGRE' }, { code: 'AGENCE' }] }, 'super-admin-1')
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(store.tenants).toHaveLength(0);
    expect(store.subscriptionItems).toHaveLength(0);
  });

  it("items : au moins un pack ; extension sans son pack refusee ; code inconnu -> 404", async () => {
    await expect(provisionTenant({ ...baseInput, items: [{ code: 'EXT_LOTS_10' }] }, 'super-admin-1')).rejects.toMatchObject({
      statusCode: 400
    });
    await expect(
      provisionTenant({ ...baseInput, items: [{ code: 'AGENCE' }, { code: 'EXT_COPRO' }] }, 'super-admin-1')
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(provisionTenant({ ...baseInput, items: [{ code: 'PLATINE' }] }, 'super-admin-1')).rejects.toMatchObject({
      statusCode: 404
    });
    expect(store.tenants).toHaveLength(0);
  });

  it('items : Agence seule, 25 blocs -> 20 a 1 500 puis 5 a 750 (au-dela du 300e lot)', async () => {
    const { result } = await provisionTenant(
      { ...baseInput, items: [{ code: 'AGENCE' }, { code: 'EXT_LOTS_10', quantity: 25 }] },
      'super-admin-1'
    );
    expect(result.subscription.items.filter(i => i.code === 'EXT_LOTS_10').map(i => [i.quantity, i.unitMonthlyPrice])).toEqual([
      [20, 1_500],
      [5, 750]
    ]);
  });

  it('le rejeu idempotent renvoie aussi les elements souscrits', async () => {
    const first = await provisionTenant({ ...baseInput, items: [{ code: 'AGENCE' }, { code: 'SETUP_AGENCE' }] }, 'super-admin-1');
    const replay = await provisionTenant({ ...baseInput, items: [{ code: 'AGENCE' }, { code: 'SETUP_AGENCE' }] }, 'super-admin-1');
    expect(replay.replay).toBe(true);
    expect(replay.result.subscription.items).toEqual(first.result.subscription.items);
    expect(first.result.subscription.items.find(i => i.code === 'SETUP_AGENCE')).toMatchObject({ unitSetupPrice: 100_000 });
  });
});
