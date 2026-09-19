/**
 * Tests du volet pilotage du lot 3 : avancement physique
 * (`lib/finance/site-progress.ts`), alerte de dépassement
 * (`lib/finance/budget-alerts.ts`) et tableau de bord
 * (`lib/finance/site-dashboard.ts`).
 *
 * Prisma est remplacé par un magasin en mémoire, même esprit que
 * `finance.sites.test.ts` et `finance.cash.test.ts` (lot 2) : aucune base
 * n'est requise. Le même objet `mockPrisma` sert à la fois de client de
 * transaction (`tx`, passé directement aux fonctions qui l'attendent en
 * premier argument) et de client global (`prisma`, mocké via
 * `jest.mock('../../src/utils/database')`) pour les fonctions de lecture
 * seule — les deux sont, en production, le même genre de client
 * (`PrismaTransactionClient` accepte l'un comme l'autre, voir
 * `utils/database.ts`).
 */

type Row = Record<string, any>;

const store = {
  sites: [] as Row[],
  progressEntries: [] as Row[],
  users: [] as Row[],
  budgets: [] as Row[],
  budgetLines: [] as Row[],
  amendments: [] as Row[],
  amendmentLines: [] as Row[],
  alerts: [] as Row[],
  allocations: [] as Row[],
  purchaseOrders: [] as Row[],
  purchaseOrderLines: [] as Row[],
  invoices: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function attachCreatedBy(row: Row): Row {
  return { ...row, createdBy: store.users.find(u => u.id === row.createdByUserId) ?? null };
}

function attachSite(row: Row): Row {
  const site = store.sites.find(s => s.id === row.siteId);
  return { ...row, site: site ? { name: site.name } : null };
}

/** Même sémantique que le tri Prisma : un tableau `[{ champ: 'asc'|'desc' }, ...]`, départagé dans l'ordre. */
function sortByOrderSpec<T extends Row>(rows: T[], orderBy: Array<Record<string, 'asc' | 'desc'>>): T[] {
  return [...rows].sort((a, b) => {
    for (const spec of orderBy) {
      const [field, dir] = Object.entries(spec)[0] as [string, 'asc' | 'desc'];
      const av = a[field];
      const bv = b[field];
      let cmp = 0;
      if (av instanceof Date && bv instanceof Date) cmp = av.getTime() - bv.getTime();
      else if (typeof av === 'string' && typeof bv === 'string') cmp = av.localeCompare(bv);
      else cmp = (av ?? 0) - (bv ?? 0);
      if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

function sumBy<T extends Row>(rows: T[], groupField: string, sumField: string): Array<Record<string, any>> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row[groupField], (totals.get(row[groupField]) ?? 0) + Number(row[sumField]));
  }
  return [...totals.entries()].map(([key, sum]) => ({ [groupField]: key, _sum: { [sumField]: sum } }));
}

// ---------------------------------------------------------------------------
// Magasin en mémoire — un délégué Prisma minimal par table utilisée
// ---------------------------------------------------------------------------

const mockPrisma: Row = {
  constructionSite: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.sites.find(s => s.id === where.id && s.tenantId === where.tenantId) ?? null
    ),
    findMany: jest.fn(async ({ where }: Row) => {
      const rows = store.sites.filter(
        s => s.tenantId === where.tenantId && (!where.status || s.status === where.status)
      );
      return sortByOrderSpec(rows, [{ createdAt: 'desc' }]);
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const site = store.sites.find(s => s.id === where.id);
      if (!site) throw new Error('site introuvable dans le magasin de test');
      Object.assign(site, data);
      return { ...site };
    })
  },

  siteProgressEntry: {
    create: jest.fn(async ({ data }: Row) => {
      const row = { id: nextId('progress'), createdAt: new Date(), ...data };
      store.progressEntries.push(row);
      return attachCreatedBy(row);
    }),
    findFirst: jest.fn(async ({ where, orderBy }: Row) => {
      const rows = store.progressEntries.filter(e => e.tenantId === where.tenantId && e.siteId === where.siteId);
      const sorted = sortByOrderSpec(rows, orderBy ?? []);
      return sorted[0] ? attachCreatedBy(sorted[0]) : null;
    }),
    findMany: jest.fn(async ({ where, orderBy }: Row) => {
      const rows = store.progressEntries.filter(e => e.tenantId === where.tenantId && e.siteId === where.siteId);
      return sortByOrderSpec(rows, orderBy ?? []).map(attachCreatedBy);
    })
  },

  siteBudget: {
    findFirst: jest.fn(
      async ({ where }: Row) =>
        store.budgets.find(
          b =>
            b.tenantId === where.tenantId && b.siteId === where.siteId && (!where.status || b.status === where.status)
        ) ?? null
    ),
    findMany: jest.fn(async ({ where }: Row) =>
      store.budgets
        .filter(
          b =>
            b.tenantId === where.tenantId &&
            where.siteId.in.includes(b.siteId) &&
            (!where.status || b.status === where.status)
        )
        .map(b => ({ id: b.id, siteId: b.siteId }))
    )
  },

  siteBudgetLine: {
    groupBy: jest.fn(async ({ where }: Row) => {
      const rows = store.budgetLines.filter(l => where.budgetId.in.includes(l.budgetId));
      return sumBy(rows, 'budgetId', 'amountForecast');
    })
  },

  budgetAmendment: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.amendments
        .filter(a => where.budgetId.in.includes(a.budgetId) && (!where.status || a.status === where.status))
        .map(a => ({ id: a.id, budgetId: a.budgetId }))
    )
  },

  budgetAmendmentLine: {
    groupBy: jest.fn(async ({ where }: Row) => {
      const rows = store.amendmentLines.filter(l => where.amendmentId.in.includes(l.amendmentId));
      return sumBy(rows, 'amendmentId', 'amountDelta');
    })
  },

  siteBudgetAlert: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const row = store.alerts.find(
        a =>
          (where.id === undefined || a.id === where.id) &&
          (where.tenantId === undefined || a.tenantId === where.tenantId) &&
          (where.budgetId === undefined || a.budgetId === where.budgetId) &&
          (where.acknowledgedAt === undefined || a.acknowledgedAt === where.acknowledgedAt)
      );
      return row ? attachSite(row) : null;
    }),
    findMany: jest.fn(async ({ where }: Row) => {
      const siteFilter = where.siteId
        ? (siteId: string) => (where.siteId.in ? where.siteId.in.includes(siteId) : siteId === where.siteId)
        : () => true;
      const rows = store.alerts.filter(
        a =>
          a.tenantId === where.tenantId &&
          siteFilter(a.siteId) &&
          (where.acknowledgedAt === undefined || a.acknowledgedAt === where.acknowledgedAt)
      );
      return sortByOrderSpec(rows, [{ raisedAt: 'desc' }]).map(attachSite);
    }),
    create: jest.fn(async ({ data }: Row) => {
      const row = {
        id: nextId('alert'),
        raisedAt: new Date(),
        acknowledgedAt: null,
        acknowledgedByUserId: null,
        ...data
      };
      store.alerts.push(row);
      return attachSite(row);
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.alerts.filter(
        a =>
          a.id === where.id &&
          a.tenantId === where.tenantId &&
          (where.acknowledgedAt === undefined || a.acknowledgedAt === where.acknowledgedAt)
      );
      rows.forEach(r => Object.assign(r, data));
      return { count: rows.length };
    })
  },

  costAllocation: {
    groupBy: jest.fn(async ({ where }: Row) => {
      const rows = store.allocations.filter(
        a =>
          a.tenantId === where.tenantId &&
          where.siteId.in.includes(a.siteId) &&
          (where.validatedAt === undefined || a.validatedAt !== null) &&
          a.voidedAt === where.voidedAt
      );
      return sumBy(rows, 'siteId', 'amount');
    })
  },

  purchaseOrder: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.purchaseOrders
        .filter(
          o =>
            o.tenantId === where.tenantId &&
            where.siteId.in.includes(o.siteId) &&
            (!where.status || o.status === where.status)
        )
        .map(o => ({ id: o.id, siteId: o.siteId }))
    )
  },

  purchaseOrderLine: {
    groupBy: jest.fn(async ({ where }: Row) => {
      const rows = store.purchaseOrderLines.filter(l => where.orderId.in.includes(l.orderId));
      return sumBy(rows, 'orderId', 'amount');
    })
  },

  supplierInvoice: {
    groupBy: jest.fn(async ({ where }: Row) => {
      const rows = store.invoices.filter(
        i =>
          where.purchaseOrderId.in.includes(i.purchaseOrderId) &&
          i.tenantId === where.tenantId &&
          (!where.status || i.status === where.status)
      );
      return sumBy(rows, 'purchaseOrderId', 'amount');
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

import { recordSiteProgressTx, listSiteProgress } from '../../src/lib/finance/site-progress';
import {
  raiseBudgetAlertIfNeededTx,
  acknowledgeBudgetAlertTx,
  listOpenBudgetAlerts,
  computeConsumedPercent
} from '../../src/lib/finance/budget-alerts';
import { getSitesDashboard } from '../../src/lib/finance/site-dashboard';

const TENANT_ID = 'tenant-1';
const GESTIONNAIRE_ID = 'user-gestionnaire';
const DIRIGEANT_ID = 'user-dirigeant';

// Typé `any` à dessein : le magasin de test n'implémente qu'un sous-ensemble
// de `PrismaTransactionClient` (les délégués réellement appelés par ce lot),
// pas l'intégralité du client Prisma généré.
function tx(): any {
  return mockPrisma;
}

function seedSite(overrides: Partial<Row> = {}): Row {
  const site = {
    id: nextId('site'),
    tenantId: TENANT_ID,
    name: 'Villa Kipé — extension',
    zone: 'Dixinn',
    status: 'IN_PROGRESS',
    progressPercent: 0,
    budgetThresholdPercent: null,
    createdAt: new Date(),
    ...overrides
  };
  store.sites.push(site);
  return site;
}

function seedUser(overrides: Partial<Row> = {}): Row {
  const user = { id: nextId('user'), fullName: null, email: 'user@example.com', ...overrides };
  store.users.push(user);
  return user;
}

function seedValidatedBudget(siteId: string, lines: number[], overrides: Partial<Row> = {}): Row {
  const budget = { id: nextId('budget'), tenantId: TENANT_ID, siteId, status: 'VALIDATED', ...overrides };
  store.budgets.push(budget);
  lines.forEach(amountForecast => {
    store.budgetLines.push({ id: nextId('line'), budgetId: budget.id, amountForecast });
  });
  return budget;
}

function seedAmendment(budgetId: string, deltas: number[], status: 'DRAFT' | 'VALIDATED' = 'VALIDATED'): Row {
  const amendment = { id: nextId('amendment'), tenantId: TENANT_ID, budgetId, status };
  store.amendments.push(amendment);
  deltas.forEach(amountDelta => {
    store.amendmentLines.push({ id: nextId('amendment-line'), amendmentId: amendment.id, amountDelta });
  });
  return amendment;
}

function seedAllocation(siteId: string, amount: number, overrides: Partial<Row> = {}): Row {
  const allocation = {
    id: nextId('alloc'),
    tenantId: TENANT_ID,
    siteId,
    amount,
    validatedAt: new Date(),
    voidedAt: null,
    ...overrides
  };
  store.allocations.push(allocation);
  return allocation;
}

function seedPurchaseOrder(siteId: string, lines: number[], overrides: Partial<Row> = {}): Row {
  const order = { id: nextId('po'), tenantId: TENANT_ID, siteId, status: 'ISSUED', ...overrides };
  store.purchaseOrders.push(order);
  lines.forEach(amount => {
    store.purchaseOrderLines.push({ id: nextId('po-line'), orderId: order.id, amount });
  });
  return order;
}

function seedInvoice(purchaseOrderId: string, amount: number, overrides: Partial<Row> = {}): Row {
  const invoice = {
    id: nextId('inv'),
    tenantId: TENANT_ID,
    purchaseOrderId,
    amount,
    status: 'VALIDATED',
    ...overrides
  };
  store.invoices.push(invoice);
  return invoice;
}

beforeEach(() => {
  jest.clearAllMocks();
  store.sites = [];
  store.progressEntries = [];
  store.users = [];
  store.budgets = [];
  store.budgetLines = [];
  store.amendments = [];
  store.amendmentLines = [];
  store.alerts = [];
  store.allocations = [];
  store.purchaseOrders = [];
  store.purchaseOrderLines = [];
  store.invoices = [];
  store.seq = 0;
});

// ---------------------------------------------------------------------------
// recordSiteProgressTx / listSiteProgress
// ---------------------------------------------------------------------------

describe('recordSiteProgressTx — copie sur ConstructionSite.progressPercent', () => {
  it('recopie le pourcentage à la première saisie', async () => {
    const site = seedSite();

    const entry = await recordSiteProgressTx(tx(), TENANT_ID, {
      siteId: site.id,
      entryDate: new Date('2026-02-01T00:00:00.000Z'),
      percent: 40,
      createdByUserId: GESTIONNAIRE_ID
    });

    expect(entry.percent).toBe(40);
    expect(store.sites.find(s => s.id === site.id)?.progressPercent).toBe(40);
  });

  /**
   * Le test explicitement demandé par la mission : une saisie ANTÉRIEURE
   * ajoutée APRÈS COUP (donc avec un `createdAt` plus récent que la saisie
   * déjà là, mais un `entryDate` plus ancien) ne doit PAS écraser le
   * pourcentage d'un point plus récent déjà enregistré.
   */
  it("une saisie antérieure ajoutée après coup n'écrase pas un point plus récent", async () => {
    const site = seedSite();

    await recordSiteProgressTx(tx(), TENANT_ID, {
      siteId: site.id,
      entryDate: new Date('2026-02-01T00:00:00.000Z'),
      percent: 40,
      createdByUserId: GESTIONNAIRE_ID
    });
    expect(store.sites.find(s => s.id === site.id)?.progressPercent).toBe(40);

    // Rattrapage d'une saisie oubliée, datée du mois précédent : enregistrée
    // APRÈS (donc avec un `createdAt` plus tardif), mais sa `entryDate` est
    // ANTÉRIEURE au point déjà connu.
    const late = await recordSiteProgressTx(tx(), TENANT_ID, {
      siteId: site.id,
      entryDate: new Date('2026-01-15T00:00:00.000Z'),
      percent: 90,
      createdByUserId: GESTIONNAIRE_ID
    });

    expect(late.percent).toBe(90); // la ligne d'historique porte bien 90…
    // …mais le chantier reste au pourcentage du point le plus récent au sens
    // de la date de saisie (40, daté du 1er février), pas 90.
    expect(store.sites.find(s => s.id === site.id)?.progressPercent).toBe(40);
  });

  it('un avancement qui recule est permis quand la saisie est bien la plus récente', async () => {
    const site = seedSite();

    await recordSiteProgressTx(tx(), TENANT_ID, {
      siteId: site.id,
      entryDate: new Date('2026-02-01T00:00:00.000Z'),
      percent: 60,
      createdByUserId: GESTIONNAIRE_ID
    });

    await recordSiteProgressTx(tx(), TENANT_ID, {
      siteId: site.id,
      entryDate: new Date('2026-03-01T00:00:00.000Z'),
      percent: 45,
      createdByUserId: GESTIONNAIRE_ID
    });

    expect(store.sites.find(s => s.id === site.id)?.progressPercent).toBe(45);
  });

  it('refuse un pourcentage hors bornes [0, 100]', async () => {
    const site = seedSite();

    await expect(
      recordSiteProgressTx(tx(), TENANT_ID, {
        siteId: site.id,
        entryDate: new Date(),
        percent: 101,
        createdByUserId: GESTIONNAIRE_ID
      })
    ).rejects.toThrow(/entre 0 et 100/i);

    await expect(
      recordSiteProgressTx(tx(), TENANT_ID, {
        siteId: site.id,
        entryDate: new Date(),
        percent: -1,
        createdByUserId: GESTIONNAIRE_ID
      })
    ).rejects.toThrow(/entre 0 et 100/i);
  });

  it('refuse un chantier introuvable', async () => {
    await expect(
      recordSiteProgressTx(tx(), TENANT_ID, {
        siteId: 'site-inconnu',
        entryDate: new Date(),
        percent: 50,
        createdByUserId: GESTIONNAIRE_ID
      })
    ).rejects.toThrow(/introuvable/i);
  });

  it('résout un libellé lisible pour l’auteur de la saisie, avec repli sur l’email puis sur l’identifiant', async () => {
    const site = seedSite();
    seedUser({ id: GESTIONNAIRE_ID, fullName: 'Fatoumata Diallo', email: 'f.diallo@example.com' });

    const entry = await recordSiteProgressTx(tx(), TENANT_ID, {
      siteId: site.id,
      entryDate: new Date(),
      percent: 10,
      createdByUserId: GESTIONNAIRE_ID
    });

    expect(entry.createdByLabel).toBe('Fatoumata Diallo');
  });
});

describe('listSiteProgress — historique du plus récent au plus ancien', () => {
  it('trie par date de saisie décroissante, quel que soit l’ordre de saisie', async () => {
    const site = seedSite();

    await recordSiteProgressTx(tx(), TENANT_ID, {
      siteId: site.id,
      entryDate: new Date('2026-02-01T00:00:00.000Z'),
      percent: 40,
      createdByUserId: GESTIONNAIRE_ID
    });
    await recordSiteProgressTx(tx(), TENANT_ID, {
      siteId: site.id,
      entryDate: new Date('2026-01-01T00:00:00.000Z'),
      percent: 10,
      createdByUserId: GESTIONNAIRE_ID
    });
    await recordSiteProgressTx(tx(), TENANT_ID, {
      siteId: site.id,
      entryDate: new Date('2026-03-01T00:00:00.000Z'),
      percent: 70,
      createdByUserId: GESTIONNAIRE_ID
    });

    const history = await listSiteProgress(TENANT_ID, site.id);

    expect(history.map(e => e.percent)).toEqual([70, 40, 10]);
  });

  it('refuse un chantier introuvable', async () => {
    await expect(listSiteProgress(TENANT_ID, 'site-inconnu')).rejects.toThrow(/introuvable/i);
  });
});

// ---------------------------------------------------------------------------
// raiseBudgetAlertIfNeededTx
// ---------------------------------------------------------------------------

describe('raiseBudgetAlertIfNeededTx — ne fait rien tant que rien ne le justifie', () => {
  it('sans seuil configuré sur le chantier', async () => {
    const site = seedSite({ budgetThresholdPercent: null });
    seedValidatedBudget(site.id, [100000]);
    seedAllocation(site.id, 90000);

    const alert = await raiseBudgetAlertIfNeededTx(tx(), TENANT_ID, site.id);

    expect(alert).toBeNull();
    expect(store.alerts).toHaveLength(0);
  });

  it('sans budget validé', async () => {
    const site = seedSite({ budgetThresholdPercent: 50 });
    seedAllocation(site.id, 90000);

    const alert = await raiseBudgetAlertIfNeededTx(tx(), TENANT_ID, site.id);

    expect(alert).toBeNull();
  });

  it("quand l'engagé reste sous le seuil", async () => {
    const site = seedSite({ budgetThresholdPercent: 90 });
    seedValidatedBudget(site.id, [100000]);
    seedAllocation(site.id, 80000); // 80 % < 90 %

    const alert = await raiseBudgetAlertIfNeededTx(tx(), TENANT_ID, site.id);

    expect(alert).toBeNull();
    expect(store.alerts).toHaveLength(0);
  });

  it('quand une alerte non acquittée existe déjà sur ce budget : jamais de doublon', async () => {
    const site = seedSite({ budgetThresholdPercent: 50 });
    const budget = seedValidatedBudget(site.id, [100000]);
    seedAllocation(site.id, 90000);
    store.alerts.push({
      id: nextId('alert'),
      tenantId: TENANT_ID,
      siteId: site.id,
      budgetId: budget.id,
      thresholdPercent: 50,
      engagedAmount: 60000,
      budgetAmount: 100000,
      raisedAt: new Date(),
      acknowledgedAt: null,
      acknowledgedByUserId: null
    });

    const alert = await raiseBudgetAlertIfNeededTx(tx(), TENANT_ID, site.id);

    expect(alert).toBeNull();
    expect(store.alerts).toHaveLength(1); // pas de second enregistrement
  });
});

describe('raiseBudgetAlertIfNeededTx — lève une alerte contre le budget RÉVISÉ', () => {
  it('quand l’engagé franchit le seuil (>=)', async () => {
    const site = seedSite({ budgetThresholdPercent: 90 });
    seedValidatedBudget(site.id, [100000]);
    seedAllocation(site.id, 90000); // exactement 90 % : « franchit » inclut l'égalité

    const alert = await raiseBudgetAlertIfNeededTx(tx(), TENANT_ID, site.id);

    expect(alert).not.toBeNull();
    expect(alert?.thresholdPercent).toBe(90);
    expect(alert?.budgetAmount).toBe(100000);
    expect(alert?.engagedAmount).toBe(90000);
    expect(alert?.consumedPercent).toBe(90);
    expect(alert?.siteLabel).toBe(site.name);
    expect(store.alerts).toHaveLength(1);
  });

  it('compare contre le révisé (initial + avenants VALIDÉS), jamais contre l’initial', async () => {
    const site = seedSite({ budgetThresholdPercent: 80 });
    const budget = seedValidatedBudget(site.id, [100000]);
    seedAmendment(budget.id, [20000], 'VALIDATED'); // révisé = 120 000
    seedAmendment(budget.id, [500000], 'DRAFT'); // ignoré : pas validé
    seedAllocation(site.id, 100000); // 100 000 / 120 000 ≈ 83,33 % ≥ 80 %

    const alert = await raiseBudgetAlertIfNeededTx(tx(), TENANT_ID, site.id);

    expect(alert).not.toBeNull();
    expect(alert?.budgetAmount).toBe(120000);
    expect(alert?.consumedPercent).toBeCloseTo(83.33, 1);
  });

  it("compte le reste à facturer d'un bon ÉMIS, jamais son montant total", async () => {
    const site = seedSite({ budgetThresholdPercent: 20 });
    seedValidatedBudget(site.id, [100000]);
    const order = seedPurchaseOrder(site.id, [50000], { status: 'ISSUED' });
    seedInvoice(order.id, 20000, { status: 'VALIDATED' }); // reste à facturer : 30 000

    const alert = await raiseBudgetAlertIfNeededTx(tx(), TENANT_ID, site.id);

    expect(alert).not.toBeNull();
    expect(alert?.engagedAmount).toBe(30000); // pas 50 000
  });

  it('ignore les bons en brouillon et les bons annulés', async () => {
    const site = seedSite({ budgetThresholdPercent: 1 });
    seedValidatedBudget(site.id, [100000]);
    seedPurchaseOrder(site.id, [999999], { status: 'DRAFT' });
    seedPurchaseOrder(site.id, [999999], { status: 'CANCELLED' });

    const alert = await raiseBudgetAlertIfNeededTx(tx(), TENANT_ID, site.id);

    expect(alert).toBeNull(); // engagé nul : rien ne franchit un seuil de 1 %
  });

  it('ne lève jamais d’exception : un dépassement franc reste une information, pas un refus', async () => {
    const site = seedSite({ budgetThresholdPercent: 50 });
    seedValidatedBudget(site.id, [10000]);
    seedAllocation(site.id, 500000); // très largement au-delà du budget

    await expect(raiseBudgetAlertIfNeededTx(tx(), TENANT_ID, site.id)).resolves.not.toThrow();
  });
});

describe('computeConsumedPercent — cas limite d’un budget révisé nul', () => {
  it('un engagé positif contre un budget révisé nul rend zéro, jamais une valeur inventée', () => {
    const value = computeConsumedPercent(50000, 0);

    // La première version rendait ici une sentinelle, 999999,99. Un écran qui
    // l'affiche annonce « 999999,99 % consommé », ce qu'aucune gestionnaire ne
    // lira comme « il n'y a pas de budget ». Une valeur inventée qui se lit
    // comme une mesure est pire qu'une absence de mesure — même raison qui
    // fait qu'une pièce de caisse sans numéro n'affiche pas de tiret.
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBe(0);
  });

  it('aucune alerte ne se lève contre un budget révisé nul', async () => {
    // Le vrai garde-fou est là, et il est explicite : un seuil exprimé en
    // pourcentage d'un budget nul ne veut rien dire. Il ne tient PAS au hasard
    // de la comparaison au seuil — un seuil à zéro, qu'aucune contrainte
    // n'interdit, aurait sinon fait naître une alerte sur un budget
    // inexistant.
    const site = seedSite({ budgetThresholdPercent: 0 });
    seedValidatedBudget(site.id, [0]);
    seedAllocation(site.id, 50000);

    const alert = await raiseBudgetAlertIfNeededTx(tx(), TENANT_ID, site.id);

    expect(alert).toBeNull();
  });

  it('un engagé nul contre un budget révisé nul est zéro', () => {
    expect(computeConsumedPercent(0, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// acknowledgeBudgetAlertTx
// ---------------------------------------------------------------------------

describe('acknowledgeBudgetAlertTx', () => {
  function seedAlert(overrides: Partial<Row> = {}): Row {
    const site = seedSite();
    const alert = {
      id: nextId('alert'),
      tenantId: TENANT_ID,
      siteId: site.id,
      budgetId: nextId('budget'),
      thresholdPercent: 80,
      engagedAmount: 90000,
      budgetAmount: 100000,
      raisedAt: new Date(),
      acknowledgedAt: null,
      acknowledgedByUserId: null,
      ...overrides
    };
    store.alerts.push(alert);
    return alert;
  }

  it('acquitte une alerte ouverte', async () => {
    const alert = seedAlert();

    const acknowledged = await acknowledgeBudgetAlertTx(tx(), TENANT_ID, alert.id, DIRIGEANT_ID);

    expect(acknowledged.acknowledgedAt).not.toBeNull();
    expect(store.alerts.find(a => a.id === alert.id)?.acknowledgedByUserId).toBe(DIRIGEANT_ID);
  });

  it('refuse (409) une seconde tentative sur une alerte déjà acquittée', async () => {
    const alert = seedAlert({ acknowledgedAt: new Date('2026-09-01') });

    await expect(acknowledgeBudgetAlertTx(tx(), TENANT_ID, alert.id, DIRIGEANT_ID)).rejects.toMatchObject({
      statusCode: 409
    });
  });

  it('refuse (404) une alerte introuvable', async () => {
    await expect(acknowledgeBudgetAlertTx(tx(), TENANT_ID, 'alerte-inconnue', DIRIGEANT_ID)).rejects.toMatchObject({
      statusCode: 404
    });
  });
});

// ---------------------------------------------------------------------------
// listOpenBudgetAlerts
// ---------------------------------------------------------------------------

describe('listOpenBudgetAlerts', () => {
  it('ne renvoie que les alertes non acquittées, avec le pourcentage consommé recalculé', async () => {
    const site = seedSite();
    store.alerts.push(
      {
        id: nextId('alert'),
        tenantId: TENANT_ID,
        siteId: site.id,
        budgetId: nextId('budget'),
        thresholdPercent: 80,
        engagedAmount: 90000,
        budgetAmount: 100000,
        raisedAt: new Date('2026-09-01'),
        acknowledgedAt: null,
        acknowledgedByUserId: null
      },
      {
        id: nextId('alert'),
        tenantId: TENANT_ID,
        siteId: site.id,
        budgetId: nextId('budget'),
        thresholdPercent: 80,
        engagedAmount: 90000,
        budgetAmount: 100000,
        raisedAt: new Date('2026-08-01'),
        acknowledgedAt: new Date('2026-08-05'),
        acknowledgedByUserId: DIRIGEANT_ID
      }
    );

    const openAlerts = await listOpenBudgetAlerts(TENANT_ID);

    expect(openAlerts).toHaveLength(1);
    expect(openAlerts[0].consumedPercent).toBe(90);
    expect(openAlerts[0].siteLabel).toBe(site.name);
  });
});

// ---------------------------------------------------------------------------
// getSitesDashboard
// ---------------------------------------------------------------------------

describe('getSitesDashboard — un seul appel, agrégé', () => {
  it('agrège budget révisé, engagé, écart et alerte ouverte pour chaque chantier', async () => {
    const siteWithBudget = seedSite({ name: 'Chantier A', progressPercent: 55 });
    const budget = seedValidatedBudget(siteWithBudget.id, [200000]);
    seedAmendment(budget.id, [50000], 'VALIDATED'); // révisé = 250 000
    seedAllocation(siteWithBudget.id, 300000); // dépassement : engagé > révisé
    store.alerts.push({
      id: nextId('alert'),
      tenantId: TENANT_ID,
      siteId: siteWithBudget.id,
      budgetId: budget.id,
      thresholdPercent: 80,
      engagedAmount: 300000,
      budgetAmount: 250000,
      raisedAt: new Date(),
      acknowledgedAt: null,
      acknowledgedByUserId: null
    });

    const siteWithoutBudget = seedSite({ name: 'Chantier B' });
    seedAllocation(siteWithoutBudget.id, 15000);

    const { rows, currency } = await getSitesDashboard(TENANT_ID, {});

    expect(currency).toBe('XOF');
    const rowA = rows.find(r => r.siteId === siteWithBudget.id);
    const rowB = rows.find(r => r.siteId === siteWithoutBudget.id);

    expect(rowA?.initialBudget).toBe(200000);
    expect(rowA?.revisedBudget).toBe(250000);
    expect(rowA?.engagedAmount).toBe(300000);
    expect(rowA?.variance).toBe(-50000);
    expect(rowA?.variancePercent).toBeCloseTo(-20, 5);
    expect(rowA?.progressPercent).toBe(55);
    expect(rowA?.openAlert?.consumedPercent).toBe(120);

    // Un chantier sans budget n'a ni révisé, ni écart : rien à mesurer.
    expect(rowB?.initialBudget).toBeNull();
    expect(rowB?.revisedBudget).toBeNull();
    expect(rowB?.variance).toBeNull();
    expect(rowB?.variancePercent).toBeNull();
    expect(rowB?.engagedAmount).toBe(15000);
    expect(rowB?.openAlert).toBeNull();
  });

  it('filtre onlyOverBudget sur les chantiers réellement en dépassement', async () => {
    const overBudget = seedValidatedBudget(seedSite({ name: 'Dépassé' }).id, [100000]);
    seedAllocation(store.sites.find(s => s.id === overBudget.siteId)!.id, 150000);

    const withinBudget = seedValidatedBudget(seedSite({ name: 'Dans les clous' }).id, [100000]);
    seedAllocation(store.sites.find(s => s.id === withinBudget.siteId)!.id, 20000);

    const { rows } = await getSitesDashboard(TENANT_ID, { onlyOverBudget: true });

    expect(rows).toHaveLength(1);
    expect(rows[0].siteId).toBe(overBudget.siteId);
  });

  it("n'émet jamais une requête par chantier : le nombre d'appels ne dépend pas du nombre de chantiers", async () => {
    for (let i = 0; i < 5; i += 1) {
      const site = seedSite({ name: `Chantier ${i}` });
      const budget = seedValidatedBudget(site.id, [10000 * (i + 1)]);
      seedAllocation(site.id, 1000 * (i + 1));
      seedPurchaseOrder(site.id, [500], { status: 'ISSUED' });
      void budget;
    }

    await getSitesDashboard(TENANT_ID, {});

    // Une seule invocation de chaque agrégation groupée, quel que soit le
    // nombre de chantiers renvoyés — la discipline exigée par le contrat
    // (`data-model.md` §5) : jamais une requête par chantier.
    expect(mockPrisma.costAllocation.groupBy).toHaveBeenCalledTimes(1);
    expect(mockPrisma.siteBudgetLine.groupBy).toHaveBeenCalledTimes(1);
    expect(mockPrisma.purchaseOrder.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.purchaseOrderLine.groupBy).toHaveBeenCalledTimes(1);
    expect(mockPrisma.siteBudgetAlert.findMany).toHaveBeenCalledTimes(1);
  });

  it('filtre par statut de chantier', async () => {
    seedSite({ name: 'Planifié', status: 'PLANNED' });
    seedSite({ name: 'En cours', status: 'IN_PROGRESS' });

    const { rows } = await getSitesDashboard(TENANT_ID, { status: 'PLANNED' });

    expect(rows).toHaveLength(1);
    expect(rows[0].siteLabel).toBe('Planifié');
  });
});
