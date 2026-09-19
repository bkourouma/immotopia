/**
 * Tests des bons de commande et de l'engagé (`lib/finance/purchase-orders.ts`).
 *
 * Prisma est remplacé par un magasin en mémoire (même esprit que
 * `finance.sites.test.ts` et `finance.suppliers.test.ts`) : aucune base n'est
 * requise. Rien d'autre n'est mocké — ce fichier n'a aucune dépendance vers le
 * moteur comptable ni le grand livre, à la différence de `suppliers.ts` : un
 * bon de commande n'est jamais une pièce comptable (P-4 : ce n'est qu'un
 * engagement, une prévision de dette, pas une écriture).
 *
 * Le test le plus important du fichier est celui du « piège » de l'engagé
 * (voir `describe('getSiteEngagement — le piège du double compte')`) : un bon
 * d'un million émis, une facture de 400 000 validée et rapprochée, doit donner
 * un engagé d'un million — pas un million quatre cent mille.
 */

type Row = Record<string, any>;

const store = {
  sites: [] as Row[],
  suppliers: [] as Row[],
  categories: [] as Row[],
  orders: [] as Row[],
  orderLines: [] as Row[],
  invoices: [] as Row[],
  allocations: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function uniqueConstraintError(target: string[]): any {
  return Object.assign(new Error(`Unique constraint failed on the fields: (\`${target.join(', ')}\`)`), {
    code: 'P2002',
    meta: { target }
  });
}

/**
 * Filtre générique, à l'image de `matchesFlat` (`finance.suppliers.test.ts`),
 * étendu au seul opérateur qu'il manquait ici : `{ not: valeur }` (y compris
 * `{ not: null }`, utilisé par le filtre du réalisé — `validatedAt: { not:
 * null } `— et par la garde de concurrence sur le statut d'une facture).
 */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) {
      return true;
    }
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('not' in condition) {
        return row[key] !== condition.not;
      }
      if ('in' in condition) {
        return (condition.in as any[]).includes(row[key]);
      }
      return true;
    }
    return row[key] === condition;
  });
}

function applyOrderBy(rows: Row[], orderBy?: Row | Row[]): Row[] {
  if (!orderBy) {
    return rows;
  }
  const specs = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const spec of specs) {
      const [field, direction] = Object.entries(spec)[0] as [string, 'asc' | 'desc'];
      const left = a[field];
      const right = b[field];
      let cmp = 0;
      if (left instanceof Date && right instanceof Date) {
        cmp = left.getTime() - right.getTime();
      } else if (left < right) {
        cmp = -1;
      } else if (left > right) {
        cmp = 1;
      }
      if (cmp !== 0) {
        return direction === 'desc' ? -cmp : cmp;
      }
    }
    return 0;
  });
}

function siteById(id: string): Row | undefined {
  return store.sites.find(s => s.id === id);
}

function supplierById(id: string): Row | undefined {
  return store.suppliers.find(s => s.id === id);
}

function categoryById(id: string): Row | undefined {
  return store.categories.find(c => c.id === id);
}

function linesForOrder(orderId: string): Row[] {
  return store.orderLines.filter(l => l.orderId === orderId);
}

/** Reconstitue, comme le ferait la jointure Prisma (`ORDER_INCLUDE`), un bon avec site, fournisseur et lignes. */
function joinOrder(order: Row): Row {
  const site = siteById(order.siteId);
  const supplier = supplierById(order.supplierId);
  return {
    ...order,
    site: site ? { name: site.name } : null,
    supplier: supplier ? { name: supplier.name } : null,
    lines: linesForOrder(order.id).map(line => {
      const category = categoryById(line.costCategoryId);
      return { ...line, costCategory: category ? { label: category.label } : null };
    })
  };
}

const mockPrisma: Row = {
  constructionSite: {
    findFirst: jest.fn(async ({ where }: Row) => store.sites.find(s => matches(s, where)) ?? null)
  },

  supplier: {
    findFirst: jest.fn(async ({ where }: Row) => store.suppliers.find(s => matches(s, where)) ?? null)
  },

  purchaseOrder: {
    create: jest.fn(async ({ data }: Row) => {
      const clash = store.orders.find(o => o.tenantId === data.tenantId && o.reference === data.reference);
      if (clash) {
        throw uniqueConstraintError(['tenant_id', 'reference']);
      }
      const created = {
        id: nextId('po'),
        issuedByUserId: null,
        issuedAt: null,
        cancelledAt: null,
        createdAt: new Date(),
        ...data
      };
      store.orders.push(created);
      return created;
    }),
    findFirst: jest.fn(async ({ where }: Row) => {
      const found = store.orders.find(o => matches(o, where));
      return found ? joinOrder(found) : null;
    }),
    findMany: jest.fn(async ({ where, orderBy }: Row) => {
      const rows = store.orders.filter(o => matches(o, where));
      return applyOrderBy(rows, orderBy).map(joinOrder);
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const matched = store.orders.filter(o => matches(o, where));
      matched.forEach(o => Object.assign(o, data));
      return { count: matched.length };
    })
  },

  purchaseOrderLine: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('pol'), createdAt: new Date(), ...data };
      store.orderLines.push(created);
      return created;
    })
  },

  supplierInvoice: {
    findFirst: jest.fn(async ({ where }: Row) => store.invoices.find(i => matches(i, where)) ?? null),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const matched = store.invoices.filter(i => matches(i, where));
      matched.forEach(i => Object.assign(i, data));
      return { count: matched.length };
    }),
    aggregate: jest.fn(async ({ where }: Row) => {
      const rows = store.invoices.filter(i => matches(i, where));
      const sum = rows.reduce((total, r) => total + Number(r.amount), 0);
      return { _sum: { amount: rows.length ? sum : null } };
    }),
    groupBy: jest.fn(async ({ where }: Row) => {
      const rows = store.invoices.filter(i => matches(i, where));
      const byOrder = new Map<string, number>();
      for (const row of rows) {
        byOrder.set(row.purchaseOrderId, (byOrder.get(row.purchaseOrderId) ?? 0) + Number(row.amount));
      }
      return [...byOrder.entries()].map(([purchaseOrderId, amount]) => ({ purchaseOrderId, _sum: { amount } }));
    })
  },

  costAllocation: {
    aggregate: jest.fn(async ({ where }: Row) => {
      const rows = store.allocations.filter(a => matches(a, where));
      const sum = rows.reduce((total, r) => total + Number(r.amount), 0);
      return { _sum: { amount: rows.length ? sum : null } };
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

import {
  cancelPurchaseOrderTx,
  createPurchaseOrderTx,
  getPurchaseOrder,
  getSiteEngagement,
  issuePurchaseOrderTx,
  linkInvoiceToPurchaseOrderTx,
  listPurchaseOrders
} from '../../src/lib/finance/purchase-orders';

const TENANT_ID = 'tenant-1';
const OTHER_TENANT_ID = 'tenant-2';
const USER_ID = 'user-1';

function tx(): any {
  return mockPrisma;
}

function seedSite(overrides: Partial<Row> = {}): Row {
  const site = { id: nextId('site'), tenantId: TENANT_ID, name: 'Villa Kipé — extension', ...overrides };
  store.sites.push(site);
  return site;
}

function seedSupplier(overrides: Partial<Row> = {}): Row {
  const supplier = { id: nextId('sup'), tenantId: TENANT_ID, name: 'SARL Ciment Guinée', ...overrides };
  store.suppliers.push(supplier);
  return supplier;
}

function seedCategory(overrides: Partial<Row> = {}): Row {
  const category = { id: nextId('cat'), tenantId: TENANT_ID, label: 'Matériaux', ...overrides };
  store.categories.push(category);
  return category;
}

function seedInvoice(overrides: Partial<Row> = {}): Row {
  const invoice = {
    id: nextId('inv'),
    tenantId: TENANT_ID,
    supplierId: overrides.supplierId,
    siteId: overrides.siteId ?? null,
    purchaseOrderId: null,
    status: 'DRAFT',
    amount: 0,
    reference: `FAC-${nextId('ref')}`,
    ...overrides
  };
  store.invoices.push(invoice);
  return invoice;
}

function seedAllocation(overrides: Partial<Row> = {}): Row {
  const allocation = {
    id: nextId('alloc'),
    tenantId: TENANT_ID,
    siteId: overrides.siteId,
    costCategoryId: overrides.costCategoryId,
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: overrides.sourceId ?? nextId('src'),
    amount: 0,
    validatedAt: new Date(),
    voidedAt: null,
    ...overrides
  };
  store.allocations.push(allocation);
  return allocation;
}

beforeEach(() => {
  jest.clearAllMocks();
  store.sites = [];
  store.suppliers = [];
  store.categories = [];
  store.orders = [];
  store.orderLines = [];
  store.invoices = [];
  store.allocations = [];
  store.seq = 0;
});

// ---------------------------------------------------------------------------
// A. createPurchaseOrderTx
// ---------------------------------------------------------------------------

describe('createPurchaseOrderTx', () => {
  it('crée un bon en brouillon, non facturé, dont le montant est la somme des lignes', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const category = seedCategory();

    const order = await createPurchaseOrderTx(tx(), TENANT_ID, {
      siteId: site.id,
      supplierId: supplier.id,
      reference: 'BC-2026-001',
      orderDate: new Date('2026-09-01'),
      lines: [
        { costCategoryId: category.id, label: 'Ciment', amount: 600_000 },
        { costCategoryId: category.id, label: 'Fer à béton', amount: 400_000 }
      ],
      createdByUserId: USER_ID
    });

    expect(order.status).toBe('DRAFT');
    expect(order.totalAmount).toBe(1_000_000);
    expect(order.invoicedAmount).toBe(0);
    expect(order.remainingAmount).toBe(1_000_000);
    expect(order.invoicingState).toBe('NOT_INVOICED');
    expect(order.siteLabel).toBe(site.name);
    expect(order.supplierLabel).toBe(supplier.name);
    expect(order.lines[0].costCategoryLabel).toBe(category.label);
    // Aucune chaîne renvoyée ne prononce « débit » ni « crédit ».
    expect(JSON.stringify(order)).not.toMatch(/débit|crédit/i);
  });

  it('refuse un chantier introuvable', async () => {
    const supplier = seedSupplier();
    await expect(
      createPurchaseOrderTx(tx(), TENANT_ID, {
        siteId: 'site-inconnu',
        supplierId: supplier.id,
        reference: 'BC-2026-002',
        orderDate: new Date(),
        lines: [{ costCategoryId: 'cat-1', label: 'Ciment', amount: 1000 }],
        createdByUserId: USER_ID
      })
    ).rejects.toThrow(/chantier introuvable/i);
  });

  it('refuse un fournisseur introuvable', async () => {
    const site = seedSite();
    await expect(
      createPurchaseOrderTx(tx(), TENANT_ID, {
        siteId: site.id,
        supplierId: 'sup-inconnu',
        reference: 'BC-2026-003',
        orderDate: new Date(),
        lines: [{ costCategoryId: 'cat-1', label: 'Ciment', amount: 1000 }],
        createdByUserId: USER_ID
      })
    ).rejects.toThrow(/fournisseur introuvable/i);
  });

  it('refuse un bon sans aucune ligne', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    await expect(
      createPurchaseOrderTx(tx(), TENANT_ID, {
        siteId: site.id,
        supplierId: supplier.id,
        reference: 'BC-2026-004',
        orderDate: new Date(),
        lines: [],
        createdByUserId: USER_ID
      })
    ).rejects.toThrow(/au moins une ligne/i);
  });

  it('refuse une référence déjà utilisée par ce tenant (409)', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const category = seedCategory();
    const params = {
      siteId: site.id,
      supplierId: supplier.id,
      reference: 'BC-2026-005',
      orderDate: new Date(),
      lines: [{ costCategoryId: category.id, label: 'Ciment', amount: 1000 }],
      createdByUserId: USER_ID
    };

    await createPurchaseOrderTx(tx(), TENANT_ID, params);

    await expect(createPurchaseOrderTx(tx(), TENANT_ID, params)).rejects.toMatchObject({ status: 409 });
  });

  it("n'empêche pas la même référence pour un autre tenant", async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const category = seedCategory();
    const siteAutre = seedSite({ tenantId: OTHER_TENANT_ID });
    const supplierAutre = seedSupplier({ tenantId: OTHER_TENANT_ID });
    const categoryAutre = seedCategory({ tenantId: OTHER_TENANT_ID });

    await createPurchaseOrderTx(tx(), TENANT_ID, {
      siteId: site.id,
      supplierId: supplier.id,
      reference: 'BC-COMMUN',
      orderDate: new Date(),
      lines: [{ costCategoryId: category.id, label: 'Ciment', amount: 1000 }],
      createdByUserId: USER_ID
    });

    await expect(
      createPurchaseOrderTx(tx(), OTHER_TENANT_ID, {
        siteId: siteAutre.id,
        supplierId: supplierAutre.id,
        reference: 'BC-COMMUN',
        orderDate: new Date(),
        lines: [{ costCategoryId: categoryAutre.id, label: 'Ciment', amount: 1000 }],
        createdByUserId: USER_ID
      })
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// B. issuePurchaseOrderTx
// ---------------------------------------------------------------------------

describe('issuePurchaseOrderTx', () => {
  async function creerBrouillon(): Promise<Row> {
    const site = seedSite();
    const supplier = seedSupplier();
    const category = seedCategory();
    return createPurchaseOrderTx(tx(), TENANT_ID, {
      siteId: site.id,
      supplierId: supplier.id,
      reference: 'BC-2026-010',
      orderDate: new Date(),
      lines: [{ costCategoryId: category.id, label: 'Ciment', amount: 500_000 }],
      createdByUserId: USER_ID
    });
  }

  it('émet un bon brouillon', async () => {
    const draft = await creerBrouillon();
    const issued = await issuePurchaseOrderTx(tx(), TENANT_ID, draft.id, USER_ID);

    expect(issued.status).toBe('ISSUED');
    const stored = store.orders.find(o => o.id === draft.id);
    expect(stored?.issuedByUserId).toBe(USER_ID);
    expect(stored?.issuedAt).toBeInstanceOf(Date);
  });

  it('refuse un bon introuvable', async () => {
    await expect(issuePurchaseOrderTx(tx(), TENANT_ID, 'bon-inconnu', USER_ID)).rejects.toThrow(/introuvable/i);
  });

  it('refuse un bon déjà émis (409, pas 400)', async () => {
    const draft = await creerBrouillon();
    await issuePurchaseOrderTx(tx(), TENANT_ID, draft.id, USER_ID);

    await expect(issuePurchaseOrderTx(tx(), TENANT_ID, draft.id, USER_ID)).rejects.toMatchObject({ status: 409 });
  });

  it('refuse un bon annulé', async () => {
    const draft = await creerBrouillon();
    await cancelPurchaseOrderTx(tx(), TENANT_ID, draft.id, 'Erreur de saisie');

    await expect(issuePurchaseOrderTx(tx(), TENANT_ID, draft.id, USER_ID)).rejects.toMatchObject({ status: 409 });
  });
});

// ---------------------------------------------------------------------------
// C. cancelPurchaseOrderTx
// ---------------------------------------------------------------------------

describe('cancelPurchaseOrderTx', () => {
  it('annule un bon brouillon', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const category = seedCategory();
    const draft = await createPurchaseOrderTx(tx(), TENANT_ID, {
      siteId: site.id,
      supplierId: supplier.id,
      reference: 'BC-2026-020',
      orderDate: new Date(),
      lines: [{ costCategoryId: category.id, label: 'Ciment', amount: 100_000 }],
      createdByUserId: USER_ID
    });

    const cancelled = await cancelPurchaseOrderTx(tx(), TENANT_ID, draft.id, 'Doublon');
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('annule un bon émis sans facture rapprochée', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const category = seedCategory();
    const draft = await createPurchaseOrderTx(tx(), TENANT_ID, {
      siteId: site.id,
      supplierId: supplier.id,
      reference: 'BC-2026-021',
      orderDate: new Date(),
      lines: [{ costCategoryId: category.id, label: 'Ciment', amount: 100_000 }],
      createdByUserId: USER_ID
    });
    const issued = await issuePurchaseOrderTx(tx(), TENANT_ID, draft.id, USER_ID);

    const cancelled = await cancelPurchaseOrderTx(tx(), TENANT_ID, issued.id, 'Chantier suspendu');
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('refuse un bon déjà annulé', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const category = seedCategory();
    const draft = await createPurchaseOrderTx(tx(), TENANT_ID, {
      siteId: site.id,
      supplierId: supplier.id,
      reference: 'BC-2026-022',
      orderDate: new Date(),
      lines: [{ costCategoryId: category.id, label: 'Ciment', amount: 100_000 }],
      createdByUserId: USER_ID
    });
    await cancelPurchaseOrderTx(tx(), TENANT_ID, draft.id, 'Doublon');

    await expect(cancelPurchaseOrderTx(tx(), TENANT_ID, draft.id, 'Nouvelle tentative')).rejects.toMatchObject({
      status: 409
    });
  });

  it('refuse un bon auquel une facture est rapprochée (409), même si cette facture est encore en brouillon', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const category = seedCategory();
    const draft = await createPurchaseOrderTx(tx(), TENANT_ID, {
      siteId: site.id,
      supplierId: supplier.id,
      reference: 'BC-2026-023',
      orderDate: new Date(),
      lines: [{ costCategoryId: category.id, label: 'Ciment', amount: 100_000 }],
      createdByUserId: USER_ID
    });
    const issued = await issuePurchaseOrderTx(tx(), TENANT_ID, draft.id, USER_ID);
    seedInvoice({ supplierId: supplier.id, siteId: site.id, purchaseOrderId: issued.id, status: 'DRAFT' });

    await expect(cancelPurchaseOrderTx(tx(), TENANT_ID, issued.id, 'Chantier suspendu')).rejects.toMatchObject({
      status: 409
    });
  });
});

// ---------------------------------------------------------------------------
// D. linkInvoiceToPurchaseOrderTx
// ---------------------------------------------------------------------------

describe('linkInvoiceToPurchaseOrderTx', () => {
  async function creerBonEmis(overrides: Partial<Row> = {}): Promise<{ site: Row; supplier: Row; order: Row }> {
    const site = seedSite(overrides.site ?? {});
    const supplier = seedSupplier(overrides.supplier ?? {});
    const category = seedCategory();
    const draft = await createPurchaseOrderTx(tx(), TENANT_ID, {
      siteId: site.id,
      supplierId: supplier.id,
      reference: overrides.reference ?? `BC-${nextId('ref')}`,
      orderDate: new Date(),
      lines: [{ costCategoryId: category.id, label: 'Ciment', amount: 500_000 }],
      createdByUserId: USER_ID
    });
    const order = await issuePurchaseOrderTx(tx(), TENANT_ID, draft.id, USER_ID);
    return { site, supplier, order };
  }

  it('rapproche une facture brouillon à un bon émis', async () => {
    const { site, supplier, order } = await creerBonEmis();
    const invoice = seedInvoice({ supplierId: supplier.id, siteId: site.id, amount: 200_000 });

    const result = await linkInvoiceToPurchaseOrderTx(tx(), TENANT_ID, invoice.id, order.id);

    expect(result?.id).toBe(order.id);
    expect(store.invoices.find(i => i.id === invoice.id)?.purchaseOrderId).toBe(order.id);
  });

  it('défait un rapprochement quand purchaseOrderId vaut null', async () => {
    const { site, supplier, order } = await creerBonEmis();
    const invoice = seedInvoice({
      supplierId: supplier.id,
      siteId: site.id,
      amount: 200_000,
      purchaseOrderId: order.id
    });

    const result = await linkInvoiceToPurchaseOrderTx(tx(), TENANT_ID, invoice.id, null);

    expect(result).toBeNull();
    expect(store.invoices.find(i => i.id === invoice.id)?.purchaseOrderId).toBeNull();
  });

  it('refuse un bon non émis (brouillon)', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const category = seedCategory();
    const draft = await createPurchaseOrderTx(tx(), TENANT_ID, {
      siteId: site.id,
      supplierId: supplier.id,
      reference: 'BC-2026-030',
      orderDate: new Date(),
      lines: [{ costCategoryId: category.id, label: 'Ciment', amount: 500_000 }],
      createdByUserId: USER_ID
    });
    const invoice = seedInvoice({ supplierId: supplier.id, siteId: site.id, amount: 200_000 });

    await expect(linkInvoiceToPurchaseOrderTx(tx(), TENANT_ID, invoice.id, draft.id)).rejects.toMatchObject({
      status: 409
    });
  });

  it('refuse un bon annulé', async () => {
    const { site, supplier, order } = await creerBonEmis();
    await cancelPurchaseOrderTx(tx(), TENANT_ID, order.id, 'Chantier abandonné');
    const invoice = seedInvoice({ supplierId: supplier.id, siteId: site.id, amount: 200_000 });

    await expect(linkInvoiceToPurchaseOrderTx(tx(), TENANT_ID, invoice.id, order.id)).rejects.toMatchObject({
      status: 409
    });
  });

  it('refuse un fournisseur différent (400)', async () => {
    const { site, order } = await creerBonEmis();
    const autreFournisseur = seedSupplier({ name: 'Un autre fournisseur' });
    const invoice = seedInvoice({ supplierId: autreFournisseur.id, siteId: site.id, amount: 200_000 });

    await expect(linkInvoiceToPurchaseOrderTx(tx(), TENANT_ID, invoice.id, order.id)).rejects.toMatchObject({
      status: 400
    });
  });

  it('refuse un chantier différent (400)', async () => {
    const { supplier, order } = await creerBonEmis();
    const autreSite = seedSite({ name: 'Un autre chantier' });
    const invoice = seedInvoice({ supplierId: supplier.id, siteId: autreSite.id, amount: 200_000 });

    await expect(linkInvoiceToPurchaseOrderTx(tx(), TENANT_ID, invoice.id, order.id)).rejects.toMatchObject({
      status: 400
    });
  });

  it('refuse de changer le rapprochement d’une facture déjà validée (ce qui est validé ne bouge plus)', async () => {
    const { site, supplier, order } = await creerBonEmis();
    const invoice = seedInvoice({
      supplierId: supplier.id,
      siteId: site.id,
      amount: 200_000,
      status: 'VALIDATED',
      purchaseOrderId: order.id
    });

    await expect(linkInvoiceToPurchaseOrderTx(tx(), TENANT_ID, invoice.id, null)).rejects.toMatchObject({
      status: 409
    });
  });

  it('facture introuvable : 404', async () => {
    const { order } = await creerBonEmis();
    await expect(linkInvoiceToPurchaseOrderTx(tx(), TENANT_ID, 'facture-inconnue', order.id)).rejects.toMatchObject({
      status: 404
    });
  });
});

// ---------------------------------------------------------------------------
// E. getSiteEngagement — le piège du double compte
// ---------------------------------------------------------------------------

describe('getSiteEngagement — le piège du double compte', () => {
  it(
    "un bon d'un million émis, une facture de 400 000 validée et rapprochée : " +
      "l'engagé vaut un million, pas un million quatre cent mille",
    async () => {
      const site = seedSite();
      const supplier = seedSupplier();
      const category = seedCategory();

      const draft = await createPurchaseOrderTx(tx(), TENANT_ID, {
        siteId: site.id,
        supplierId: supplier.id,
        reference: 'BC-2026-100',
        orderDate: new Date(),
        lines: [{ costCategoryId: category.id, label: 'Ciment', amount: 1_000_000 }],
        createdByUserId: USER_ID
      });
      const issued = await issuePurchaseOrderTx(tx(), TENANT_ID, draft.id, USER_ID);

      // La facture est validée ET rapprochée : elle produit une
      // `CostAllocation` validée (le réalisé), exactement comme le ferait
      // `validateSupplierInvoiceTx` au lot 2.
      const invoice = seedInvoice({
        supplierId: supplier.id,
        siteId: site.id,
        amount: 400_000,
        status: 'VALIDATED',
        purchaseOrderId: issued.id
      });
      seedAllocation({
        siteId: site.id,
        costCategoryId: category.id,
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: invoice.id,
        amount: 400_000,
        validatedAt: new Date(),
        voidedAt: null
      });

      const engagement = await getSiteEngagement(TENANT_ID, site.id);

      expect(engagement.actualCost).toBe(400_000);
      expect(engagement.openCommitments).toBe(600_000);
      // La preuve du piège : PAS 1 400 000.
      expect(engagement.engagedAmount).toBe(1_000_000);
    }
  );

  it("un bon en brouillon n'engage rien", async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const category = seedCategory();
    await createPurchaseOrderTx(tx(), TENANT_ID, {
      siteId: site.id,
      supplierId: supplier.id,
      reference: 'BC-2026-101',
      orderDate: new Date(),
      lines: [{ costCategoryId: category.id, label: 'Ciment', amount: 1_000_000 }],
      createdByUserId: USER_ID
    });

    const engagement = await getSiteEngagement(TENANT_ID, site.id);

    expect(engagement.openCommitments).toBe(0);
    expect(engagement.engagedAmount).toBe(0);
  });

  it("un bon annulé n'engage rien", async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const category = seedCategory();
    const draft = await createPurchaseOrderTx(tx(), TENANT_ID, {
      siteId: site.id,
      supplierId: supplier.id,
      reference: 'BC-2026-102',
      orderDate: new Date(),
      lines: [{ costCategoryId: category.id, label: 'Ciment', amount: 1_000_000 }],
      createdByUserId: USER_ID
    });
    await issuePurchaseOrderTx(tx(), TENANT_ID, draft.id, USER_ID);
    await cancelPurchaseOrderTx(tx(), TENANT_ID, draft.id, 'Chantier abandonné');

    const engagement = await getSiteEngagement(TENANT_ID, site.id);

    expect(engagement.openCommitments).toBe(0);
    expect(engagement.engagedAmount).toBe(0);
  });

  it('un chantier sans aucune pièce a un engagé nul', async () => {
    const site = seedSite();
    const engagement = await getSiteEngagement(TENANT_ID, site.id);

    expect(engagement.actualCost).toBe(0);
    expect(engagement.openCommitments).toBe(0);
    expect(engagement.engagedAmount).toBe(0);
    expect(engagement.currency).toBe('XOF');
  });

  it('refuse un chantier introuvable', async () => {
    await expect(getSiteEngagement(TENANT_ID, 'site-inconnu')).rejects.toThrow(/introuvable/i);
  });

  it('une imputation annulée ne compte pas dans le réalisé (même filtre que getSiteActualCost)', async () => {
    const site = seedSite();
    const category = seedCategory();
    seedAllocation({
      siteId: site.id,
      costCategoryId: category.id,
      amount: 999_999,
      validatedAt: new Date(),
      voidedAt: new Date()
    });

    const engagement = await getSiteEngagement(TENANT_ID, site.id);
    expect(engagement.actualCost).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// F. Lectures — listPurchaseOrders / getPurchaseOrder
// ---------------------------------------------------------------------------

describe('listPurchaseOrders / getPurchaseOrder', () => {
  it('filtre par chantier, fournisseur et statut', async () => {
    const site = seedSite();
    const autreSite = seedSite({ name: 'Autre chantier' });
    const supplier = seedSupplier();
    const category = seedCategory();

    const a = await createPurchaseOrderTx(tx(), TENANT_ID, {
      siteId: site.id,
      supplierId: supplier.id,
      reference: 'BC-2026-200',
      orderDate: new Date('2026-01-01'),
      lines: [{ costCategoryId: category.id, label: 'Ciment', amount: 100_000 }],
      createdByUserId: USER_ID
    });
    await issuePurchaseOrderTx(tx(), TENANT_ID, a.id, USER_ID);

    await createPurchaseOrderTx(tx(), TENANT_ID, {
      siteId: autreSite.id,
      supplierId: supplier.id,
      reference: 'BC-2026-201',
      orderDate: new Date('2026-01-02'),
      lines: [{ costCategoryId: category.id, label: 'Fer', amount: 200_000 }],
      createdByUserId: USER_ID
    });

    const parChantier = await listPurchaseOrders(TENANT_ID, { siteId: site.id });
    expect(parChantier).toHaveLength(1);
    expect(parChantier[0].reference).toBe('BC-2026-200');

    const parStatut = await listPurchaseOrders(TENANT_ID, { status: 'ISSUED' as any });
    expect(parStatut).toHaveLength(1);
    expect(parStatut[0].status).toBe('ISSUED');

    const tout = await listPurchaseOrders(TENANT_ID, {});
    expect(tout).toHaveLength(2);
  });

  it('résout invoicingState : NOT_INVOICED, PARTIALLY_INVOICED puis SETTLED', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const category = seedCategory();
    const draft = await createPurchaseOrderTx(tx(), TENANT_ID, {
      siteId: site.id,
      supplierId: supplier.id,
      reference: 'BC-2026-210',
      orderDate: new Date(),
      lines: [{ costCategoryId: category.id, label: 'Ciment', amount: 1_000_000 }],
      createdByUserId: USER_ID
    });
    const issued = await issuePurchaseOrderTx(tx(), TENANT_ID, draft.id, USER_ID);

    const pasFacture = await getPurchaseOrder(TENANT_ID, issued.id);
    expect(pasFacture.invoicingState).toBe('NOT_INVOICED');

    seedInvoice({
      supplierId: supplier.id,
      siteId: site.id,
      amount: 400_000,
      status: 'VALIDATED',
      purchaseOrderId: issued.id
    });
    const partiel = await getPurchaseOrder(TENANT_ID, issued.id);
    expect(partiel.invoicingState).toBe('PARTIALLY_INVOICED');
    expect(partiel.invoicedAmount).toBe(400_000);
    expect(partiel.remainingAmount).toBe(600_000);

    seedInvoice({
      supplierId: supplier.id,
      siteId: site.id,
      amount: 600_000,
      status: 'VALIDATED',
      purchaseOrderId: issued.id
    });
    const solde = await getPurchaseOrder(TENANT_ID, issued.id);
    expect(solde.invoicingState).toBe('SETTLED');
    expect(solde.remainingAmount).toBe(0);
  });

  it('une facture brouillon rapprochée ne compte pas encore dans le facturé', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const category = seedCategory();
    const draft = await createPurchaseOrderTx(tx(), TENANT_ID, {
      siteId: site.id,
      supplierId: supplier.id,
      reference: 'BC-2026-211',
      orderDate: new Date(),
      lines: [{ costCategoryId: category.id, label: 'Ciment', amount: 1_000_000 }],
      createdByUserId: USER_ID
    });
    const issued = await issuePurchaseOrderTx(tx(), TENANT_ID, draft.id, USER_ID);
    seedInvoice({
      supplierId: supplier.id,
      siteId: site.id,
      amount: 400_000,
      status: 'DRAFT',
      purchaseOrderId: issued.id
    });

    const order = await getPurchaseOrder(TENANT_ID, issued.id);
    expect(order.invoicedAmount).toBe(0);
    expect(order.invoicingState).toBe('NOT_INVOICED');
  });

  it('renvoie 404 pour un bon introuvable', async () => {
    await expect(getPurchaseOrder(TENANT_ID, 'bon-inconnu')).rejects.toMatchObject({ status: 404 });
  });

  it("isole les tenants : un bon d'un autre tenant est introuvable ici", async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const category = seedCategory();
    const order = await createPurchaseOrderTx(tx(), TENANT_ID, {
      siteId: site.id,
      supplierId: supplier.id,
      reference: 'BC-2026-212',
      orderDate: new Date(),
      lines: [{ costCategoryId: category.id, label: 'Ciment', amount: 100_000 }],
      createdByUserId: USER_ID
    });

    await expect(getPurchaseOrder(OTHER_TENANT_ID, order.id)).rejects.toMatchObject({ status: 404 });
  });
});
