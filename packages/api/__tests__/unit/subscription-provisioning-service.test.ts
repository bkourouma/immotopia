/**
 * Tests de `services/subscription-provisioning-service.ts` (outil
 * d'exploitation CLI). Modele : `tenant-provisioning-service.test.ts` — faux
 * client Prisma en memoire, transaction a rollback par `structuredClone`.
 *
 * `subscription-v2-service` (planInitialItems, linkExtensionsToPacksTx,
 * syncTenantModulesTx, getEntitlements) tourne REELLEMENT contre ce faux
 * Prisma. `lot-registry-service`, `tenant-service` (suspendTenant) et
 * `audit-service` sont simules : ils ont leurs propres tests.
 */

type Row = Record<string, any>;

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
    subscriptions: [] as Row[],
    subscriptionItems: [] as Row[],
    tenantModules: [] as Row[],
    capacityOverrides: [] as Row[],
    memberships: [] as Row[],
    lotActivations: [] as Row[],
    invoices: [] as Row[],
    seq: 0
  };
}

let store = freshStore();

const auditEvents: Row[] = [];
const reconcileCalls: Row[] = [];
const suspendCalls: Row[] = [];

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn((entry: Row) => {
    auditEvents.push(entry);
  }),
  flushAuditEvents: jest.fn(async () => 0),
  AuditActionKey: {}
}));

jest.mock('../../src/services/tenant-service', () => ({
  suspendTenant: jest.fn(async (tenantId: string, actorUserId: string) => {
    suspendCalls.push({ tenantId, actorUserId });
    const tenant = store.tenants.find(t => t.id === tenantId);
    if (tenant) {
      tenant.status = 'SUSPENDED';
      tenant.isActive = false;
    }
    return tenant;
  })
}));

jest.mock('../../src/services/lot-registry-service', () => ({
  computeQualifyingUnits: jest.fn(async () => []),
  countActiveLots: jest.fn(async () => 0),
  countActiveCopros: jest.fn(
    async (_db: unknown, tenantId: string) =>
      store.lotActivations.filter((a: Row) => a.tenantId === tenantId && a.kind === 'COPRO_LOT' && !a.deactivatedAt)
        .length
  ),
  countActiveSites: jest.fn(async () => 0),
  // Pack Patrimoine (lot P1) : capacite BIENS_DETENUS, absente avant ce lot.
  // Sans cette entree, usageProviders.BIENS_DETENUS (subscription-v2-service.ts)
  // reste undefined sous ce mock complet du module et getUsage() leve
  // « usageProviders[key] is not a function » des le premier appel.
  countHeldProperties: jest.fn(async () => 0),
  reconcileLotActivations: jest.fn(async (tenantId: string, options: Row) => {
    reconcileCalls.push({ tenantId, ...options });
    return {
      tenantId,
      qualifying: 0,
      added: [],
      removed: [],
      reclassified: 0,
      byKind: { RENTAL_UNIT: 0, COPRO_LOT: 0, PROGRAM_LOT: 0, HELD_PROPERTY: 0 }
    };
  })
}));

function buildFakePrisma() {
  const fakePrisma: Row = {
    tenant: {
      findUnique: jest.fn(async ({ where, select }: Row) => {
        const row = where.id
          ? store.tenants.find(t => t.id === where.id)
          : store.tenants.find(t => t.slug === where.slug);
        if (!row) return null;
        if (!select) return row;
        const out: Row = {};
        for (const key of Object.keys(select)) if (select[key]) out[key] = row[key];
        return out;
      }),
      findMany: jest.fn(async ({ where }: Row) => {
        let rows = store.tenants;
        const search = where?.OR?.[0]?.slug?.contains ?? where?.OR?.[0]?.name?.contains;
        if (search) {
          rows = rows.filter(t => t.slug.includes(search) || t.name.includes(search));
        }
        return rows.map(t => ({ id: t.id, slug: t.slug, name: t.name, status: t.status }));
      })
    },
    subscription: {
      findUnique: jest.fn(
        async ({ where }: Row) => store.subscriptions.find(s => s.tenantId === where.tenantId) ?? null
      ),
      create: jest.fn(async ({ data }: Row) => {
        const row = { id: nextId('sub', store), createdAt: new Date(), updatedAt: new Date(), ...data };
        store.subscriptions.push(row);
        return row;
      })
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
          .filter(i => i.tenantId === where.tenantId && (!where.status || i.status !== 'ENDED'))
          .map(i => {
            const c = CATALOG_ROWS.find(r => r.id === i.catalogItemId)!;
            return {
              ...i,
              catalogItem: {
                code: c.code,
                kind: c.kind,
                capacities: c.capacities,
                modules: c.modules,
                exclusiveGroup: c.exclusiveGroup,
                rules: c.rules ?? null,
                name: c.name
              }
            };
          })
      ),
      update: jest.fn(async ({ where, data }: Row) => {
        const row = store.subscriptionItems.find(i => i.id === where.id)!;
        Object.assign(row, data);
        return row;
      })
    },
    tenantModule: {
      findMany: jest.fn(async ({ where }: Row) => store.tenantModules.filter(m => m.tenantId === where.tenantId)),
      create: jest.fn(async ({ data }: Row) => {
        const row = { tenantId: data.tenantId, moduleKey: data.moduleKey, ...data };
        store.tenantModules.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: Row) => {
        const row = store.tenantModules.find(
          m => m.tenantId === where.tenantId_moduleKey.tenantId && m.moduleKey === where.tenantId_moduleKey.moduleKey
        )!;
        Object.assign(row, data);
        return row;
      })
    },
    capacityOverride: {
      findMany: jest.fn(async () => [])
    },
    membership: {
      count: jest.fn(
        async ({ where }: Row) =>
          store.memberships.filter(m => m.tenantId === where.tenantId && m.status === where.status).length
      )
    },
    // Capacite ACTIFS (lot 4A) : `countActiveAssets` (subscription-v2-service) compte les actifs non archives.
    asset: { count: jest.fn(async () => 0) },
    lotActivation: {
      findMany: jest.fn(async ({ where }: Row) =>
        store.lotActivations.filter(a => a.tenantId === where.tenantId && a.deactivatedAt === null)
      )
    },
    // Filtrage fidele a la requete exacte de `computeSetupCharge`
    // (et de `autoSetupLines`, platform-invoice-service.ts:163-165) :
    // { tenantId, kind: 'PLATFORM', billingNature: 'PERIOD', status: { not: CANCELED } }.
    invoice: {
      count: jest.fn(
        async ({ where }: Row) =>
          store.invoices.filter(
            (inv: Row) =>
              inv.tenantId === where.tenantId &&
              inv.kind === where.kind &&
              inv.billingNature === where.billingNature &&
              (!where.status?.not || inv.status !== where.status.not)
          ).length
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
  },
  disconnectDatabase: jest.fn(async () => undefined)
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  provisionSubscription,
  suspendTenantAction,
  isForbiddenWriteWindow,
  ProvisioningRefusedError,
  SYSTEM_ACTOR_ID
} = require('../../src/services/subscription-provisioning-service');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { invalidateEntitlements } = require('../../src/services/subscription-v2-service');

function addTenant(overrides: Row = {}): Row {
  const tenant = {
    id: nextId('tenant', store),
    slug: overrides.slug ?? `agence-${store.seq}`,
    name: overrides.name ?? 'Ivoire Résidences',
    status: overrides.status ?? 'ACTIVE',
    isActive: overrides.isActive ?? true
  };
  store.tenants.push(tenant);
  return tenant;
}

const OUT_OF_WINDOW_NOW = new Date('2026-09-28T09:00:00.000Z');

beforeEach(() => {
  store = freshStore();
  fakePrisma = buildFakePrisma();
  auditEvents.length = 0;
  reconcileCalls.length = 0;
  suspendCalls.length = 0;
  invalidateEntitlements();
});

describe('isForbiddenWriteWindow', () => {
  it('refuse les minutes 10 à 20 UTC incluses, accepte 09 et 21', () => {
    expect(isForbiddenWriteWindow(new Date('2026-09-28T05:10:00Z'))).toBe(true);
    expect(isForbiddenWriteWindow(new Date('2026-09-28T05:20:00Z'))).toBe(true);
    expect(isForbiddenWriteWindow(new Date('2026-09-28T05:09:00Z'))).toBe(false);
    expect(isForbiddenWriteWindow(new Date('2026-09-28T05:21:00Z'))).toBe(false);
  });
});

describe('provisionSubscription — dry-run', () => {
  it("ne touche aucune methode d'ecriture, aucune transaction, aucun audit", async () => {
    const tenant = addTenant();
    const writeSpies = [
      fakePrisma.subscription.create,
      fakePrisma.subscriptionItem.createMany,
      fakePrisma.subscriptionItem.update,
      fakePrisma.tenantModule.create,
      fakePrisma.tenantModule.update
    ];
    const txSpy = jest.spyOn(fakePrisma, '$transaction');

    const result = await provisionSubscription({
      tenantRef: tenant.id,
      items: [{ code: 'AGENCE' }, { code: 'SYNDIC' }, { code: 'EXT_COPRO', quantity: 2 }],
      dryRun: true,
      now: OUT_OF_WINDOW_NOW
    });

    expect(result.outcome).toBe('dry-run');
    expect(result.wouldDo).toBe('create');
    for (const spy of writeSpies) expect(spy).not.toHaveBeenCalled();
    expect(txSpy).not.toHaveBeenCalled();
    expect(auditEvents).toHaveLength(0);

    const codes = result.plannedItems.map((i: Row) => i.code).sort();
    expect(codes).toEqual(['AGENCE', 'EXT_COPRO', 'SYNDIC'].sort());
    const copro = result.plannedItems.find((i: Row) => i.code === 'EXT_COPRO');
    expect(copro.quantity).toBe(2);

    const caps = result.after.projectedEntitlements.capacities;
    expect(caps.COPROPRIETES.limit).toBe(4); // 2 (Syndic) + 2 (EXT_COPRO x2)
  });
});

describe('provisionSubscription — provisionnement reel', () => {
  const items = [{ code: 'AGENCE' }, { code: 'SYNDIC' }, { code: 'EXT_COPRO', quantity: 2 }];

  it('cree un abonnement TRIALING conforme, sans facture, avec audit et reconciliation', async () => {
    const tenant = addTenant();
    const result = await provisionSubscription({
      tenantRef: tenant.id,
      items,
      setupWaived: true,
      now: OUT_OF_WINDOW_NOW
    });

    expect(result.outcome).toBe('created');
    const sub = store.subscriptions.find(s => s.tenantId === tenant.id)!;
    expect(sub.status).toBe('TRIALING');
    expect(sub.quotaPolicy).toBe('BILL_OVERAGE');
    expect(sub.metadata.setupWaived).toBe(true);
    const expectedTrialEnd = new Date(OUT_OF_WINDOW_NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect(sub.trialEndsAt.getTime()).toBe(expectedTrialEnd.getTime());

    const itemRows = store.subscriptionItems.filter(i => i.tenantId === tenant.id);
    const totalCopro = itemRows
      .filter(i => CATALOG_ROWS.find(c => c.id === i.catalogItemId)?.code === 'EXT_COPRO')
      .reduce((s, i) => s + i.quantity, 0);
    expect(totalCopro).toBe(2);
    const coproItem = itemRows.find(i => CATALOG_ROWS.find(c => c.id === i.catalogItemId)?.code === 'EXT_COPRO')!;
    expect(coproItem.parentItemId).toBeTruthy(); // rattachee au pack Syndic

    const modules = store.tenantModules.filter(m => m.tenantId === tenant.id && m.enabled);
    expect(modules.map(m => m.moduleKey).sort()).toEqual(['MODULE_AGENCY', 'MODULE_SYNDIC'].sort());

    // Pas de facture / InvoiceLine : la transaction ne touche que subscription/subscriptionItem/tenantModule.
    expect(fakePrisma.subscriptionItem.createMany).toHaveBeenCalledTimes(1);

    const provisionedEvent = auditEvents.find(e => e.actionKey === 'SUBSCRIPTION_PROVISIONED')!;
    expect(provisionedEvent).toBeDefined();
    expect(provisionedEvent.actorUserId).toBe(SYSTEM_ACTOR_ID);
    expect(reconcileCalls).toHaveLength(1);
    expect(reconcileCalls[0].actorUserId).toBe(SYSTEM_ACTOR_ID);
  });

  it('idempotence : un second passage ne cree rien et renvoie deja-provisionne', async () => {
    const tenant = addTenant();
    await provisionSubscription({ tenantRef: tenant.id, items, setupWaived: true, now: OUT_OF_WINDOW_NOW });
    const subCountAfterFirst = store.subscriptions.length;
    const itemCountAfterFirst = store.subscriptionItems.length;

    const second = await provisionSubscription({
      tenantRef: tenant.id,
      items,
      setupWaived: true,
      now: OUT_OF_WINDOW_NOW
    });

    expect(second.outcome).toBe('already-provisioned');
    expect(store.subscriptions.length).toBe(subCountAfterFirst);
    expect(store.subscriptionItems.length).toBe(itemCountAfterFirst);
  });

  it('creation concurrente detectee par contrainte unique (P2002) : refus explicite, pas la panne brute', async () => {
    const tenant = addTenant();
    fakePrisma.subscription.create.mockImplementationOnce(async () => {
      throw { code: 'P2002' };
    });

    let caught: unknown;
    try {
      await provisionSubscription({ tenantRef: tenant.id, items, now: OUT_OF_WINDOW_NOW });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProvisioningRefusedError);
    expect((caught as { reasons: string[] }).reasons).toEqual([
      "Un abonnement a été créé entre-temps pour cette agence : relancez l'outil."
    ]);
    expect(store.subscriptions).toHaveLength(0);
  });

  it('refuse un abonnement existant non conforme, avec les ecarts listes', async () => {
    const tenant = addTenant();
    await provisionSubscription({ tenantRef: tenant.id, items, now: OUT_OF_WINDOW_NOW });

    await expect(
      provisionSubscription({
        tenantRef: tenant.id,
        items: [{ code: 'AGENCE' }],
        quotaPolicy: 'BLOCK',
        now: OUT_OF_WINDOW_NOW
      })
    ).rejects.toThrow(ProvisioningRefusedError);
  });

  it('refuse un code catalogue inconnu', async () => {
    const tenant = addTenant();
    await expect(
      provisionSubscription({ tenantRef: tenant.id, items: [{ code: 'CODE_INEXISTANT' }], now: OUT_OF_WINDOW_NOW })
    ).rejects.toThrow();
  });

  it('refuse --setup-waived combine a un element SETUP_*', async () => {
    const tenant = addTenant();
    await expect(
      provisionSubscription({
        tenantRef: tenant.id,
        items: [{ code: 'AGENCE' }, { code: 'SETUP_AGENCE' }],
        setupWaived: true,
        now: OUT_OF_WINDOW_NOW
      })
    ).rejects.toThrow(ProvisioningRefusedError);
  });

  it('refuse une agence SUSPENDUE', async () => {
    const tenant = addTenant({ status: 'SUSPENDED' });
    await expect(provisionSubscription({ tenantRef: tenant.id, items, now: OUT_OF_WINDOW_NOW })).rejects.toThrow(
      ProvisioningRefusedError
    );
  });

  it('refuse toute ecriture dans la fenetre hh:10-hh:20 UTC (bornes incluses)', async () => {
    const tenant = addTenant();
    await expect(
      provisionSubscription({ tenantRef: tenant.id, items, now: new Date('2026-09-28T05:10:00Z') })
    ).rejects.toThrow(ProvisioningRefusedError);
    await expect(
      provisionSubscription({ tenantRef: tenant.id, items, now: new Date('2026-09-28T05:20:00Z') })
    ).rejects.toThrow(ProvisioningRefusedError);
  });

  it('accepte juste hors fenetre (09 et 21) et avertit en dry-run dans la fenetre', async () => {
    const tenant1 = addTenant();
    await expect(
      provisionSubscription({ tenantRef: tenant1.id, items, now: new Date('2026-09-28T05:09:00Z') })
    ).resolves.toMatchObject({ outcome: 'created' });

    const tenant2 = addTenant();
    const dryInWindow = await provisionSubscription({
      tenantRef: tenant2.id,
      items,
      dryRun: true,
      now: new Date('2026-09-28T05:15:00Z')
    });
    expect(dryInWindow.outcome).toBe('dry-run');
    expect(dryInWindow.warnings.some((w: string) => w.includes('hh:10–hh:20'))).toBe(true);
  });
});

describe('provisionSubscription — idempotence sans --trial-ends-at (fin par defaut)', () => {
  it('relance a J+2 sans --trial-ends-at : deja provisionne, aucune ecriture, fin d’essai affichee = celle existante', async () => {
    const tenant = addTenant();
    const items = [{ code: 'AGENCE' }];
    const dayJ = new Date('2026-09-28T09:00:00.000Z');
    const first = await provisionSubscription({ tenantRef: tenant.id, items, now: dayJ });
    expect(first.outcome).toBe('created');
    const createdTrialEndsAt = (first as Row).trialEndsAt as Date;
    const subCountAfterFirst = store.subscriptions.length;

    const dayJPlus2 = new Date('2026-09-30T09:00:00.000Z');
    const second = await provisionSubscription({ tenantRef: tenant.id, items, now: dayJPlus2 });

    expect(second.outcome).toBe('already-provisioned');
    expect(store.subscriptions.length).toBe(subCountAfterFirst);
    // La fin d'essai affichee est celle de l'abonnement EXISTANT, pas une
    // valeur recalculee a partir de dayJPlus2 (qui serait dayJPlus2 + 30j).
    expect((second as Row).trialEndsAt.getTime()).toBe(createdTrialEndsAt.getTime());
  });

  it('idem en dry-run : wouldDo=already-provisioned, fin d’essai existante affichee', async () => {
    const tenant = addTenant();
    const items = [{ code: 'AGENCE' }];
    const dayJ = new Date('2026-09-28T09:00:00.000Z');
    const created = await provisionSubscription({ tenantRef: tenant.id, items, now: dayJ });
    const createdTrialEndsAt = (created as Row).trialEndsAt as Date;

    const dayJPlus2 = new Date('2026-09-30T09:00:00.000Z');
    const dry = await provisionSubscription({ tenantRef: tenant.id, items, dryRun: true, now: dayJPlus2 });
    expect(dry.outcome).toBe('dry-run');
    expect((dry as Row).wouldDo).toBe('already-provisioned');
    expect((dry as Row).trialEndsAt.getTime()).toBe(createdTrialEndsAt.getTime());
  });
});

describe('provisionSubscription — consommation projetee en dry-run (dependances lot-registry-service)', () => {
  it('COPROPRIETES projetees = countActiveCopros reel, avec depassement signale au-dela', async () => {
    const tenant = addTenant();
    for (let i = 0; i < 4; i += 1) {
      store.lotActivations.push({ tenantId: tenant.id, kind: 'COPRO_LOT', deactivatedAt: null });
    }
    const dry = await provisionSubscription({
      tenantRef: tenant.id,
      items: [{ code: 'SYNDIC' }],
      dryRun: true,
      now: OUT_OF_WINDOW_NOW
    });
    const caps = (dry as Row).after.projectedEntitlements.capacities;
    expect(caps.COPROPRIETES.used).toBe(4);
    expect(caps.COPROPRIETES.limit).toBe(2); // SYNDIC seul : 2 inclus
    expect(caps.COPROPRIETES.overBy).toBe(2);
    expect((dry as Row).warnings.some((w: string) => w.includes('COPROPRIETES'))).toBe(true);
  });
});

describe('provisionSubscription — derogations et modules existants projetes (dry-run)', () => {
  it('signale un OVERRIDE de module vivant dans les avertissements', async () => {
    const tenant = addTenant();
    store.tenantModules.push({
      tenantId: tenant.id,
      moduleKey: 'MODULE_PROMOTER',
      enabled: true,
      source: 'OVERRIDE',
      expiresAt: null,
      disabledAt: null
    });
    const dry = await provisionSubscription({
      tenantRef: tenant.id,
      items: [{ code: 'AGENCE' }],
      dryRun: true,
      now: OUT_OF_WINDOW_NOW
    });
    expect((dry as Row).warnings.some((w: string) => w.includes('MODULE_PROMOTER') && w.includes('OVERRIDE'))).toBe(
      true
    );
    // Le module force par derogation reste ouvert dans les droits projetes.
    expect((dry as Row).after.projectedEntitlements.modules).toContain('MODULE_PROMOTER');
  });
});

describe('provisionSubscription — ordre de l’audit en provisionnement reel', () => {
  it('journalise SUBSCRIPTION_PROVISIONED juste apres le commit, avant reconcileLotActivations, avec l’id de l’abonnement', async () => {
    const tenant = addTenant();
    const order: string[] = [];
    const reconcileModule = require('../../src/services/lot-registry-service');
    reconcileModule.reconcileLotActivations.mockImplementationOnce(async (tenantId: string, options: Row) => {
      order.push('reconcile');
      reconcileCalls.push({ tenantId, ...options });
      return { tenantId, qualifying: 0, added: [], removed: [], byKind: {} };
    });
    const auditModule = require('../../src/services/audit-service');
    const originalLog = auditModule.logAuditEvent.getMockImplementation();
    auditModule.logAuditEvent.mockImplementation((entry: Row) => {
      order.push(`audit:${entry.actionKey}`);
      return originalLog?.(entry);
    });

    const result = await provisionSubscription({
      tenantRef: tenant.id,
      items: [{ code: 'AGENCE' }],
      now: OUT_OF_WINDOW_NOW
    });

    expect(order[0]).toBe('audit:SUBSCRIPTION_PROVISIONED');
    expect(order[1]).toBe('reconcile');

    const provisionedEvent = auditEvents.find(e => e.actionKey === 'SUBSCRIPTION_PROVISIONED')!;
    const createdSub = store.subscriptions.find(s => s.tenantId === tenant.id)!;
    expect(provisionedEvent.entityId).toBe(createdSub.id);
    expect(provisionedEvent.entityId).not.toBe(tenant.id);
    expect(result.outcome).toBe('created');
  });

  it('si la reconciliation echoue apres creation, l’erreur dit de relancer la meme commande (idempotente)', async () => {
    const tenant = addTenant();
    const reconcileModule = require('../../src/services/lot-registry-service');
    reconcileModule.reconcileLotActivations.mockImplementationOnce(async () => {
      throw new Error('panne registre');
    });

    await expect(
      provisionSubscription({ tenantRef: tenant.id, items: [{ code: 'AGENCE' }], now: OUT_OF_WINDOW_NOW })
    ).rejects.toThrow(/relancez la même commande/);

    // L'abonnement a bien ete cree malgre l'echec de la reconciliation.
    expect(store.subscriptions.some(s => s.tenantId === tenant.id)).toBe(true);
    // Et l'audit de creation a quand meme ete ecrit (avant la reconciliation).
    expect(auditEvents.some(e => e.actionKey === 'SUBSCRIPTION_PROVISIONED' && e.tenantId === tenant.id)).toBe(true);
  });
});

describe('provisionSubscription — montant de mise en route (dry-run)', () => {
  it('leve la somme des SETUP_<pack> implicites (aucun explicite, aucun deja en base)', async () => {
    const tenant = addTenant();
    const dry = await provisionSubscription({
      tenantRef: tenant.id,
      items: [{ code: 'AGENCE' }, { code: 'SYNDIC' }],
      setupWaived: true,
      dryRun: true,
      now: OUT_OF_WINDOW_NOW
    });
    const setupCharge = (dry as Row).after.setupCharge;
    expect(setupCharge.waived).toBe(true);
    expect(setupCharge.amount).toBe(250_000);
    expect(setupCharge.lines.sort((a: Row, b: Row) => a.code.localeCompare(b.code))).toEqual([
      { code: 'SETUP_AGENCE', name: expect.any(String), amount: 100_000 },
      { code: 'SETUP_SYNDIC', name: expect.any(String), amount: 150_000 }
    ]);
  });

  it('annonce le meme montant quand la mise en route n’est pas levee', async () => {
    const tenant = addTenant();
    const dry = await provisionSubscription({
      tenantRef: tenant.id,
      items: [{ code: 'AGENCE' }, { code: 'SYNDIC' }],
      dryRun: true,
      now: OUT_OF_WINDOW_NOW
    });
    const setupCharge = (dry as Row).after.setupCharge;
    expect(setupCharge.waived).toBe(false);
    expect(setupCharge.amount).toBe(250_000);
  });

  it('exclut SETUP_AGENCE deja present en base (agence deja mise en route pour ce pack)', async () => {
    const tenant = addTenant();
    const setupAgenceCatalogId = CATALOG_ROWS.find((c: Row) => c.code === 'SETUP_AGENCE')!.id;
    store.subscriptionItems.push({
      id: nextId('si', store),
      tenantId: tenant.id,
      subscriptionId: 'sub-preexisting',
      catalogItemId: setupAgenceCatalogId,
      quantity: 1,
      status: 'ENDED',
      startsAt: OUT_OF_WINDOW_NOW,
      endsAt: OUT_OF_WINDOW_NOW
    });
    const dry = await provisionSubscription({
      tenantRef: tenant.id,
      items: [{ code: 'AGENCE' }],
      dryRun: true,
      now: OUT_OF_WINDOW_NOW
    });
    const setupCharge = (dry as Row).after.setupCharge;
    expect(setupCharge.amount).toBe(0);
    expect(setupCharge.lines).toEqual([]);
  });

  it("n'annonce aucune mise en route automatique si une facture PLATFORM/PERIOD a deja ete emise (garde premiere facture)", async () => {
    const tenant = addTenant();
    await provisionSubscription({
      tenantRef: tenant.id,
      items: [{ code: 'AGENCE' }, { code: 'SYNDIC' }],
      now: OUT_OF_WINDOW_NOW
    });
    store.invoices.push({
      id: nextId('inv', store),
      tenantId: tenant.id,
      kind: 'PLATFORM',
      billingNature: 'PERIOD',
      status: 'ISSUED'
    });

    const dry = await provisionSubscription({
      tenantRef: tenant.id,
      items: [{ code: 'AGENCE' }, { code: 'SYNDIC' }],
      dryRun: true,
      now: OUT_OF_WINDOW_NOW
    });
    expect((dry as Row).wouldDo).toBe('already-provisioned');
    const setupCharge = (dry as Row).after.setupCharge;
    expect(setupCharge.amount).toBe(0);
    expect(setupCharge.lines).toEqual([]);
    expect(setupCharge.firstInvoiceAlreadyIssued).toBe(true);
  });

  it('une facture PLATFORM/PERIOD ANNULEE seule ne declenche pas la garde : la mise en route reste annoncee', async () => {
    const tenant = addTenant();
    await provisionSubscription({
      tenantRef: tenant.id,
      items: [{ code: 'AGENCE' }, { code: 'SYNDIC' }],
      now: OUT_OF_WINDOW_NOW
    });
    store.invoices.push({
      id: nextId('inv', store),
      tenantId: tenant.id,
      kind: 'PLATFORM',
      billingNature: 'PERIOD',
      status: 'CANCELED'
    });

    const dry = await provisionSubscription({
      tenantRef: tenant.id,
      items: [{ code: 'AGENCE' }, { code: 'SYNDIC' }],
      dryRun: true,
      now: OUT_OF_WINDOW_NOW
    });
    const setupCharge = (dry as Row).after.setupCharge;
    expect(setupCharge.firstInvoiceAlreadyIssued).toBe(false);
    expect(setupCharge.amount).toBe(250_000);
  });
});

describe('provisionSubscription — conformite face a un changement programme', () => {
  it('refuse quand un palier SCHEDULED ou un retrait partiel (endsAt pose) existe, avec un ecart explicite', async () => {
    const tenant = addTenant();
    await provisionSubscription({ tenantRef: tenant.id, items: [{ code: 'AGENCE' }], now: OUT_OF_WINDOW_NOW });
    const agenceCatalogId = CATALOG_ROWS.find((c: Row) => c.code === 'AGENCE')!.id;
    const subscriptionId = store.subscriptions.find(s => s.tenantId === tenant.id)!.id;

    // Un retrait partiel en cours : la ligne ACTIVE existante porte un endsAt futur.
    const activeRow = store.subscriptionItems.find(
      i => i.tenantId === tenant.id && i.catalogItemId === agenceCatalogId
    )!;
    activeRow.endsAt = new Date(OUT_OF_WINDOW_NOW.getTime() + 5 * 24 * 60 * 60 * 1000);

    // Un palier SCHEDULED (ex. reste d'un retrait partiel a effet futur).
    store.subscriptionItems.push({
      id: nextId('si', store),
      tenantId: tenant.id,
      subscriptionId,
      catalogItemId: agenceCatalogId,
      quantity: 1,
      status: 'SCHEDULED',
      startsAt: activeRow.endsAt,
      endsAt: null
    });

    await expect(
      provisionSubscription({ tenantRef: tenant.id, items: [{ code: 'AGENCE' }], now: OUT_OF_WINDOW_NOW })
    ).rejects.toThrow(/changement d'abonnement programmé en cours/i);

    const dry = await provisionSubscription({
      tenantRef: tenant.id,
      items: [{ code: 'AGENCE' }],
      dryRun: true,
      now: OUT_OF_WINDOW_NOW
    });
    expect((dry as Row).wouldDo).toBe('refused');
    expect(
      (dry as Row).refusalReasons.filter((r: string) => /changement d'abonnement programmé en cours/i.test(r))
    ).toHaveLength(2);
  });

  it('deux paliers du meme code (bloc de lots) restent conformes une fois additionnes', async () => {
    const tenant = addTenant();
    await provisionSubscription({
      tenantRef: tenant.id,
      items: [{ code: 'AGENCE' }, { code: 'EXT_LOTS_10', quantity: 5 }],
      now: OUT_OF_WINDOW_NOW
    });
    // Simule deux paliers distincts pour le meme code, comme le fait la tarification par palier.
    const extLotsCatalogId = CATALOG_ROWS.find((c: Row) => c.code === 'EXT_LOTS_10')!.id;
    const rows = store.subscriptionItems.filter(i => i.tenantId === tenant.id && i.catalogItemId === extLotsCatalogId);
    expect(rows.length).toBeGreaterThan(0);
    rows[0].quantity = 2;
    if (rows.length === 1) {
      store.subscriptionItems.push({
        ...rows[0],
        id: nextId('si', store),
        quantity: 3
      });
    } else {
      rows[1].quantity = 3;
    }

    const dry = await provisionSubscription({
      tenantRef: tenant.id,
      items: [{ code: 'AGENCE' }, { code: 'EXT_LOTS_10', quantity: 5 }],
      dryRun: true,
      now: OUT_OF_WINDOW_NOW
    });
    expect((dry as Row).wouldDo).toBe('already-provisioned');
  });

  it('un abonnement PAST_DUE mais conforme est deja-provisionne', async () => {
    const tenant = addTenant();
    await provisionSubscription({ tenantRef: tenant.id, items: [{ code: 'AGENCE' }], now: OUT_OF_WINDOW_NOW });
    store.subscriptions.find(s => s.tenantId === tenant.id)!.status = 'PAST_DUE';

    const result = await provisionSubscription({
      tenantRef: tenant.id,
      items: [{ code: 'AGENCE' }],
      now: OUT_OF_WINDOW_NOW
    });
    expect(result.outcome).toBe('already-provisioned');
  });

  it('message de non-conformite liste la composition existante et la composition demandee', async () => {
    const tenant = addTenant();
    await provisionSubscription({
      tenantRef: tenant.id,
      items: [{ code: 'AGENCE' }, { code: 'SYNDIC' }, { code: 'EXT_COPRO' }],
      now: OUT_OF_WINDOW_NOW
    });

    await expect(
      provisionSubscription({
        tenantRef: tenant.id,
        items: [{ code: 'AGENCE' }, { code: 'SYNDIC' }, { code: 'EXT_COPRO', quantity: 2 }],
        now: OUT_OF_WINDOW_NOW
      })
    ).rejects.toMatchObject({
      reasons: expect.arrayContaining([expect.stringMatching(/AGENCE×1.*SYNDIC×1.*EXT_COPRO×1.*EXT_COPRO×2/)])
    });
  });
});

describe('provisionSubscription — avertissement de seuils de capacite (dry-run)', () => {
  it('signale les seuils 80% et 100% franchis pour COPROPRIETES a 4/4', async () => {
    const tenant = addTenant();
    for (let i = 0; i < 4; i += 1) {
      store.lotActivations.push({ tenantId: tenant.id, kind: 'COPRO_LOT', deactivatedAt: null });
    }
    const dry = await provisionSubscription({
      tenantRef: tenant.id,
      items: [{ code: 'SYNDIC' }, { code: 'EXT_COPRO', quantity: 2 }],
      dryRun: true,
      now: OUT_OF_WINDOW_NOW
    });
    const caps = (dry as Row).after.projectedEntitlements.capacities;
    expect(caps.COPROPRIETES.used).toBe(4);
    expect(caps.COPROPRIETES.limit).toBe(4);
    expect(
      (dry as Row).warnings.some(
        (w: string) => w.includes('COPROPRIETES') && w.includes('4/4') && w.includes('80') && w.includes('100')
      )
    ).toBe(true);
  });
});

describe('provisionSubscription — fin d’essai exposee dans le resultat', () => {
  it('wouldDo=create expose trialEndsAt', async () => {
    const tenant = addTenant();
    const dry = await provisionSubscription({
      tenantRef: tenant.id,
      items: [{ code: 'AGENCE' }],
      dryRun: true,
      now: OUT_OF_WINDOW_NOW
    });
    expect((dry as Row).trialEndsAt).toBeInstanceOf(Date);
    expect((dry as Row).trialEndsAt.getTime()).toBeGreaterThan(OUT_OF_WINDOW_NOW.getTime());
  });
});

describe('suspendTenantAction', () => {
  it('suspend une agence active avec l’acteur systeme', async () => {
    const tenant = addTenant({ status: 'ACTIVE' });
    const result = await suspendTenantAction({ tenantRef: tenant.id, now: OUT_OF_WINDOW_NOW });
    expect(result.outcome).toBe('suspended');
    expect(suspendCalls).toHaveLength(1);
    expect(suspendCalls[0].actorUserId).toBe(SYSTEM_ACTOR_ID);
  });

  it('agence deja suspendue : rien a faire, en reel comme en dry-run', async () => {
    const tenant = addTenant({ status: 'SUSPENDED' });
    const real = await suspendTenantAction({ tenantRef: tenant.id, now: OUT_OF_WINDOW_NOW });
    expect(real.outcome).toBe('nothing');
    expect(suspendCalls).toHaveLength(0);

    const dry = await suspendTenantAction({ tenantRef: tenant.id, dryRun: true, now: OUT_OF_WINDOW_NOW });
    expect(dry.outcome).toBe('dry-run');
    expect(dry.wouldDo).toBe('nothing');
  });

  it('dry-run ne suspend jamais', async () => {
    const tenant = addTenant({ status: 'ACTIVE' });
    const result = await suspendTenantAction({ tenantRef: tenant.id, dryRun: true, now: OUT_OF_WINDOW_NOW });
    expect(result.outcome).toBe('dry-run');
    expect(result.wouldDo).toBe('suspend');
    expect(suspendCalls).toHaveLength(0);
  });

  it('dry-run dans la fenetre hh:10-hh:20 : accepte, avec avertissement', async () => {
    const tenant = addTenant({ status: 'ACTIVE' });
    const result = await suspendTenantAction({
      tenantRef: tenant.id,
      dryRun: true,
      now: new Date('2026-09-28T12:15:00.000Z')
    });
    expect(result.outcome).toBe('dry-run');
    expect(result.outcome === 'dry-run' && result.warnings.join(' ')).toMatch(/fenêtre hh:10–hh:20/);
    expect(suspendCalls).toHaveLength(0);
  });
});

// Module, pas script : sans cela ses declarations (`type Row`) entrent en
// collision avec celles de provision-subscription-cli.test.ts sous ts-jest
// (CI, 28/09 — cf. "Duplicate identifier 'Row'").
export {};
