/**
 * Tests du budget de chantier et de ses avenants (`lib/finance/budgets.ts`).
 *
 * Même esprit que `finance.suppliers.test.ts` (lot 2) : Prisma est remplacé
 * par un magasin en mémoire (aucune base requise). Le magasin simule aussi
 * les jointures (`include`) que `budgets.ts` utilise pour résoudre
 * `costCategoryLabel`, `createdByLabel` et `validatedByLabel` en une seule
 * requête par lecture — un test dédié vérifie qu'aucune résolution ne se
 * fait ligne à ligne (compteur d'appels à `costCategory.findMany`).
 */

// ---------------------------------------------------------------------------
// Magasin en mémoire pour `../../src/utils/database`
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

const store = {
  sites: [] as Row[],
  categories: [] as Row[],
  users: [] as Row[],
  budgets: [] as Row[],
  budgetLines: [] as Row[],
  amendments: [] as Row[],
  amendmentLines: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function matchesFlat(row: Row, where: Row): boolean {
  return Object.entries(where ?? {}).every(([key, condition]) => {
    if (condition === undefined) return true;
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('in' in condition) {
        return (condition.in as any[]).includes(row[key]);
      }
      return true;
    }
    if (condition === null) {
      return row[key] === null || row[key] === undefined;
    }
    return row[key] === condition;
  });
}

function categoryOf(id: string): { id: string; label: string } | null {
  const category = store.categories.find(c => c.id === id);
  return category ? { id: category.id, label: category.label } : null;
}

function userOf(id: string | null | undefined): { fullName: string | null; email: string } | null {
  if (!id) return null;
  const user = store.users.find(u => u.id === id);
  return user ? { fullName: user.fullName ?? null, email: user.email } : null;
}

function attachBudgetIncludes(row: Row): Row {
  const lines = store.budgetLines
    .filter(l => l.budgetId === row.id)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(l => ({ ...l, costCategory: categoryOf(l.costCategoryId) }));
  return { ...row, lines, validatedBy: userOf(row.validatedByUserId) };
}

function attachAmendmentIncludes(row: Row): Row {
  const lines = store.amendmentLines
    .filter(l => l.amendmentId === row.id)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(l => ({ ...l, costCategory: categoryOf(l.costCategoryId) }));
  return { ...row, lines, createdBy: userOf(row.createdByUserId) };
}

const costCategoryFindMany = jest.fn(async ({ where }: Row) => store.categories.filter(c => matchesFlat(c, where)));

const mockPrisma: Row = {
  constructionSite: {
    findFirst: jest.fn(async ({ where }: Row) => store.sites.find(s => matchesFlat(s, where)) ?? null)
  },

  costCategory: {
    findMany: costCategoryFindMany
  },

  siteBudget: {
    create: jest.fn(async ({ data }: Row) => {
      const created = {
        id: nextId('budget'),
        status: 'DRAFT',
        validatedAt: null,
        validatedByUserId: null,
        createdAt: new Date(),
        ...data
      };
      store.budgets.push(created);
      return created;
    }),
    findFirst: jest.fn(async ({ where, include }: Row) => {
      const row = store.budgets.find(b => matchesFlat(b, where));
      if (!row) return null;
      return include ? attachBudgetIncludes(row) : row;
    }),
    findMany: jest.fn(async ({ where, include, orderBy }: Row) => {
      let rows = store.budgets.filter(b => matchesFlat(b, where));
      if (orderBy?.createdAt === 'desc') {
        rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return include ? rows.map(attachBudgetIncludes) : rows;
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.budgets.filter(b => matchesFlat(b, where));
      rows.forEach(b => Object.assign(b, data));
      return { count: rows.length };
    })
  },

  siteBudgetLine: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('line'), createdAt: new Date(), ...data };
      store.budgetLines.push(created);
      return created;
    })
  },

  budgetAmendment: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('amendment'), status: 'DRAFT', validatedAt: null, createdAt: new Date(), ...data };
      store.amendments.push(created);
      return created;
    }),
    findFirst: jest.fn(async ({ where, include }: Row) => {
      const row = store.amendments.find(a => matchesFlat(a, where));
      if (!row) return null;
      return include ? attachAmendmentIncludes(row) : row;
    }),
    findMany: jest.fn(async ({ where, include, orderBy }: Row) => {
      let rows = store.amendments.filter(a => matchesFlat(a, where));
      if (orderBy) {
        rows = [...rows].sort((a, b) => b.amendmentDate.getTime() - a.amendmentDate.getTime());
      }
      return include ? rows.map(attachAmendmentIncludes) : rows;
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.amendments.filter(a => matchesFlat(a, where));
      rows.forEach(a => Object.assign(a, data));
      return { count: rows.length };
    })
  },

  budgetAmendmentLine: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('aline'), createdAt: new Date(), ...data };
      store.amendmentLines.push(created);
      return created;
    })
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

import {
  createBudgetAmendmentTx,
  createSiteBudgetTx,
  getValidatedSiteBudget,
  listBudgetAmendments,
  listSiteBudgets,
  validateBudgetAmendmentTx,
  validateSiteBudgetTx
} from '../../src/lib/finance/budgets';

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';

function tx(): any {
  return mockPrisma;
}

beforeEach(() => {
  jest.clearAllMocks();
  store.sites = [];
  store.categories = [];
  store.users = [];
  store.budgets = [];
  store.budgetLines = [];
  store.amendments = [];
  store.amendmentLines = [];
  store.seq = 0;
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createSite(): string {
  const id = nextId('site');
  store.sites.push({ id, tenantId: TENANT_ID });
  return id;
}

function createCategory(overrides: Row = {}): string {
  const id = nextId('cat');
  store.categories.push({ id, tenantId: TENANT_ID, label: 'Gros œuvre', isActive: true, ...overrides });
  return id;
}

function createUser(overrides: Row = {}): string {
  const id = overrides.id ?? nextId('u');
  store.users.push({ fullName: 'Awa Diallo', email: 'awa@immotopia.test', ...overrides, id });
  return id;
}

async function createDraftBudget(
  siteId: string,
  categoryIds: string[],
  overrides: { label?: string; amounts?: number[] } = {}
) {
  const amounts = overrides.amounts ?? categoryIds.map(() => 100000);
  return createSiteBudgetTx(tx(), TENANT_ID, {
    siteId,
    label: overrides.label ?? 'Budget initial',
    lines: categoryIds.map((costCategoryId, index) => ({
      costCategoryId,
      label: `Ligne ${index + 1}`,
      amountForecast: amounts[index]
    }))
  });
}

// ---------------------------------------------------------------------------
// A. createSiteBudgetTx
// ---------------------------------------------------------------------------

describe('createSiteBudgetTx', () => {
  it('cree un budget brouillon, resout les libelles de poste, et calcule le total', async () => {
    const siteId = createSite();
    const catA = createCategory({ label: 'Gros œuvre' });
    const catB = createCategory({ label: 'Toiture' });

    const budget = await createDraftBudget(siteId, [catA, catB], { amounts: [500000, 250000] });

    expect(budget.status).toBe('DRAFT');
    expect(budget.siteId).toBe(siteId);
    expect(budget.totalForecast).toBe(750000);
    expect(budget.lines).toHaveLength(2);
    expect(budget.lines.map((l: any) => l.costCategoryLabel).sort()).toEqual(['Gros œuvre', 'Toiture']);
    expect(budget.validatedByLabel).toBeNull();
  });

  it('resout les libelles de poste par une requete PAR LOT, jamais une par ligne', async () => {
    const siteId = createSite();
    const catA = createCategory();
    const catB = createCategory();
    const catC = createCategory();

    await createDraftBudget(siteId, [catA, catB, catC]);

    // Une seule saisie de plan de comptes -> un seul appel groupé, quel que
    // soit le nombre de lignes.
    expect(costCategoryFindMany).toHaveBeenCalledTimes(1);
  });

  it('refuse un chantier introuvable', async () => {
    const catA = createCategory();
    await expect(createDraftBudget('site-inconnu', [catA])).rejects.toMatchObject({ status: 404 });
  });

  it('refuse un budget sans libelle', async () => {
    const siteId = createSite();
    const catA = createCategory();
    await expect(
      createSiteBudgetTx(tx(), TENANT_ID, {
        siteId,
        label: '  ',
        lines: [{ costCategoryId: catA, label: 'x', amountForecast: 1000 }]
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('refuse un budget sans aucune ligne', async () => {
    const siteId = createSite();
    await expect(createSiteBudgetTx(tx(), TENANT_ID, { siteId, label: 'Vide', lines: [] })).rejects.toMatchObject({
      status: 400
    });
  });

  it('refuse deux lignes sur le meme poste de depense', async () => {
    const siteId = createSite();
    const catA = createCategory();
    await expect(
      createSiteBudgetTx(tx(), TENANT_ID, {
        siteId,
        label: 'Doublon',
        lines: [
          { costCategoryId: catA, label: 'Premiere', amountForecast: 1000 },
          { costCategoryId: catA, label: 'Seconde', amountForecast: 2000 }
        ]
      })
    ).rejects.toMatchObject({ status: 400 });

    expect(store.budgets).toHaveLength(0);
  });

  it('refuse un poste de depense desactive, avant toute ecriture', async () => {
    const siteId = createSite();
    const catInactive = createCategory({ isActive: false });

    await expect(createDraftBudget(siteId, [catInactive])).rejects.toMatchObject({ status: 409 });
    expect(store.budgets).toHaveLength(0);
  });

  it('refuse un poste de depense introuvable pour ce tenant', async () => {
    const siteId = createSite();
    await expect(createDraftBudget(siteId, ['poste-fantome'])).rejects.toMatchObject({ status: 404 });
  });

  it('plusieurs brouillons peuvent coexister sur un meme chantier', async () => {
    const siteId = createSite();
    const catA = createCategory();

    await createDraftBudget(siteId, [catA], { label: 'Brouillon A' });
    await createDraftBudget(siteId, [catA], { label: 'Brouillon B' });

    expect(store.budgets).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// B. validateSiteBudgetTx
// ---------------------------------------------------------------------------

describe('validateSiteBudgetTx', () => {
  it('valide un budget brouillon, nomme le validateur, et fixe validatedAt', async () => {
    const siteId = createSite();
    const catA = createCategory();
    createUser({ id: USER_ID, fullName: 'Fatoumata Barry' });
    const draft = await createDraftBudget(siteId, [catA]);

    const validated = await validateSiteBudgetTx(tx(), TENANT_ID, draft.id, USER_ID);

    expect(validated.status).toBe('VALIDATED');
    expect(validated.validatedByUserId).toBe(USER_ID);
    expect(validated.validatedByLabel).toBe('Fatoumata Barry');
    expect(validated.validatedAt).not.toBeNull();
  });

  it('refuse de revalider un budget deja valide (P-6)', async () => {
    const siteId = createSite();
    const catA = createCategory();
    const draft = await createDraftBudget(siteId, [catA]);
    await validateSiteBudgetTx(tx(), TENANT_ID, draft.id, USER_ID);

    await expect(validateSiteBudgetTx(tx(), TENANT_ID, draft.id, USER_ID)).rejects.toMatchObject({ status: 409 });
  });

  it('refuse un second budget valide sur le meme chantier : lecture AVANT ecriture', async () => {
    const siteId = createSite();
    const catA = createCategory();
    const first = await createDraftBudget(siteId, [catA], { label: 'Premier' });
    const second = await createDraftBudget(siteId, [catA], { label: 'Second' });

    await validateSiteBudgetTx(tx(), TENANT_ID, first.id, USER_ID);

    await expect(validateSiteBudgetTx(tx(), TENANT_ID, second.id, USER_ID)).rejects.toMatchObject({ status: 409 });

    // Le second budget n'a pas ete touche par la tentative refusee.
    const secondRow = store.budgets.find(b => b.id === second.id)!;
    expect(secondRow.status).toBe('DRAFT');
  });

  it('un budget valide sur un AUTRE chantier ne bloque pas celui-ci', async () => {
    const siteA = createSite();
    const siteB = createSite();
    const catA = createCategory();
    const budgetA = await createDraftBudget(siteA, [catA]);
    const budgetB = await createDraftBudget(siteB, [catA]);

    await validateSiteBudgetTx(tx(), TENANT_ID, budgetA.id, USER_ID);
    const validatedB = await validateSiteBudgetTx(tx(), TENANT_ID, budgetB.id, USER_ID);

    expect(validatedB.status).toBe('VALIDATED');
  });

  it("renvoie un conflit (409) plutot que l'erreur Prisma brute quand la mise a jour conditionnelle echoue", async () => {
    const siteId = createSite();
    const catA = createCategory();
    const draft = await createDraftBudget(siteId, [catA]);

    // Simule une validation concurrente gagnante entre la lecture et
    // l'ecriture : `updateMany` ne trouve plus de ligne en DRAFT.
    const originalUpdateMany = mockPrisma.siteBudget.updateMany;
    mockPrisma.siteBudget.updateMany = jest.fn(async () => ({ count: 0 }));

    await expect(validateSiteBudgetTx(tx(), TENANT_ID, draft.id, USER_ID)).rejects.toMatchObject({ status: 409 });

    mockPrisma.siteBudget.updateMany = originalUpdateMany;
  });

  it('refuse un budget introuvable', async () => {
    await expect(validateSiteBudgetTx(tx(), TENANT_ID, 'budget-inconnu', USER_ID)).rejects.toMatchObject({
      status: 404
    });
  });
});

// ---------------------------------------------------------------------------
// C. Lectures — getValidatedSiteBudget, listSiteBudgets
// ---------------------------------------------------------------------------

describe('getValidatedSiteBudget', () => {
  it("renvoie null quand le chantier n'a pas de budget valide", async () => {
    const siteId = createSite();
    const catA = createCategory();
    await createDraftBudget(siteId, [catA]);

    const result = await getValidatedSiteBudget(TENANT_ID, siteId);
    expect(result).toBeNull();
  });

  it('renvoie le budget valide, jamais un brouillon', async () => {
    const siteId = createSite();
    const catA = createCategory();
    const draft = await createDraftBudget(siteId, [catA], { label: 'A valider' });
    await createDraftBudget(siteId, [catA], { label: 'Autre brouillon' });
    await validateSiteBudgetTx(tx(), TENANT_ID, draft.id, USER_ID);

    const result = await getValidatedSiteBudget(TENANT_ID, siteId);
    expect(result?.id).toBe(draft.id);
    expect(result?.status).toBe('VALIDATED');
  });
});

describe('listSiteBudgets', () => {
  it('liste tous les budgets du chantier, brouillons compris, du plus recent au plus ancien', async () => {
    const siteId = createSite();
    const catA = createCategory();
    const first = await createDraftBudget(siteId, [catA], { label: 'Premier' });
    await new Promise(resolve => setTimeout(resolve, 2));
    const second = await createDraftBudget(siteId, [catA], { label: 'Second' });

    const list = await listSiteBudgets(TENANT_ID, siteId);

    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(second.id);
    expect(list[1].id).toBe(first.id);
  });
});

// ---------------------------------------------------------------------------
// D. createBudgetAmendmentTx
// ---------------------------------------------------------------------------

describe('createBudgetAmendmentTx', () => {
  async function budgetValide(siteId: string, catA: string) {
    const draft = await createDraftBudget(siteId, [catA], { amounts: [1000000] });
    return validateSiteBudgetTx(tx(), TENANT_ID, draft.id, USER_ID);
  }

  it('cree un avenant brouillon sur un budget valide, avec un total signe', async () => {
    const siteId = createSite();
    const catA = createCategory({ label: 'Gros œuvre' });
    const catB = createCategory({ label: 'Peinture' });
    const validated = await budgetValide(siteId, catA);
    createUser({ id: USER_ID, fullName: 'Ibrahima Sow' });

    const amendment = await createBudgetAmendmentTx(tx(), TENANT_ID, {
      budgetId: validated.id,
      amendmentDate: new Date('2026-09-19'),
      reason: 'Rallonge chantier',
      lines: [
        { costCategoryId: catA, amountDelta: 50000 },
        { costCategoryId: catB, amountDelta: -20000 }
      ],
      createdByUserId: USER_ID
    });

    expect(amendment.status).toBe('DRAFT');
    expect(amendment.totalDelta).toBe(30000);
    expect(amendment.createdByLabel).toBe('Ibrahima Sow');
    const deltaByCat = new Map(amendment.lines.map((l: any) => [l.costCategoryId, l.amountDelta]));
    expect(deltaByCat.get(catB)).toBe(-20000);
  });

  it("refuse un avenant sur un budget qui n'est pas valide (brouillon)", async () => {
    const siteId = createSite();
    const catA = createCategory();
    const draft = await createDraftBudget(siteId, [catA]);

    await expect(
      createBudgetAmendmentTx(tx(), TENANT_ID, {
        budgetId: draft.id,
        amendmentDate: new Date(),
        reason: 'Motif',
        lines: [{ costCategoryId: catA, amountDelta: 1000 }],
        createdByUserId: USER_ID
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('refuse un avenant sans motif', async () => {
    const siteId = createSite();
    const catA = createCategory();
    const validated = await budgetValide(siteId, catA);

    await expect(
      createBudgetAmendmentTx(tx(), TENANT_ID, {
        budgetId: validated.id,
        amendmentDate: new Date(),
        reason: '   ',
        lines: [{ costCategoryId: catA, amountDelta: 1000 }],
        createdByUserId: USER_ID
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('refuse un avenant sans aucune ligne', async () => {
    const siteId = createSite();
    const catA = createCategory();
    const validated = await budgetValide(siteId, catA);

    await expect(
      createBudgetAmendmentTx(tx(), TENANT_ID, {
        budgetId: validated.id,
        amendmentDate: new Date(),
        reason: 'Motif',
        lines: [],
        createdByUserId: USER_ID
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('refuse un budget introuvable', async () => {
    const catA = createCategory();
    await expect(
      createBudgetAmendmentTx(tx(), TENANT_ID, {
        budgetId: 'budget-inconnu',
        amendmentDate: new Date(),
        reason: 'Motif',
        lines: [{ costCategoryId: catA, amountDelta: 1000 }],
        createdByUserId: USER_ID
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('accepte deux lignes sur le meme poste (regle differente du budget) et cumule leur ecart', async () => {
    const siteId = createSite();
    const catA = createCategory();
    const validated = await budgetValide(siteId, catA);

    const amendment = await createBudgetAmendmentTx(tx(), TENANT_ID, {
      budgetId: validated.id,
      amendmentDate: new Date(),
      reason: 'Deux ajustements successifs sur le meme poste',
      lines: [
        { costCategoryId: catA, amountDelta: 10000 },
        { costCategoryId: catA, amountDelta: 5000 }
      ],
      createdByUserId: USER_ID
    });

    expect(amendment.lines).toHaveLength(2);
    expect(amendment.totalDelta).toBe(15000);
  });
});

// ---------------------------------------------------------------------------
// E. validateBudgetAmendmentTx
// ---------------------------------------------------------------------------

describe('validateBudgetAmendmentTx', () => {
  async function avenantBrouillon(siteId: string, catA: string, amountDelta = 10000) {
    const draft = await createDraftBudget(siteId, [catA], { amounts: [500000] });
    const validatedBudget = await validateSiteBudgetTx(tx(), TENANT_ID, draft.id, USER_ID);
    return createBudgetAmendmentTx(tx(), TENANT_ID, {
      budgetId: validatedBudget.id,
      amendmentDate: new Date('2026-09-19'),
      reason: 'Motif',
      lines: [{ costCategoryId: catA, amountDelta }],
      createdByUserId: USER_ID
    });
  }

  it('valide un avenant brouillon', async () => {
    const siteId = createSite();
    const catA = createCategory();
    const draft = await avenantBrouillon(siteId, catA);

    const validated = await validateBudgetAmendmentTx(tx(), TENANT_ID, draft.id, USER_ID);

    expect(validated.status).toBe('VALIDATED');
    expect(validated.validatedAt).not.toBeNull();
  });

  it('refuse de revalider un avenant deja valide', async () => {
    const siteId = createSite();
    const catA = createCategory();
    const draft = await avenantBrouillon(siteId, catA);
    await validateBudgetAmendmentTx(tx(), TENANT_ID, draft.id, USER_ID);

    await expect(validateBudgetAmendmentTx(tx(), TENANT_ID, draft.id, USER_ID)).rejects.toMatchObject({
      status: 409
    });
  });

  it("plusieurs avenants VALIDES peuvent coexister sur le meme budget (pas de contrainte d'unicite)", async () => {
    const siteId = createSite();
    const catA = createCategory();
    const draft = await createDraftBudget(siteId, [catA], { amounts: [500000] });
    const validatedBudget = await validateSiteBudgetTx(tx(), TENANT_ID, draft.id, USER_ID);

    const amendmentA = await createBudgetAmendmentTx(tx(), TENANT_ID, {
      budgetId: validatedBudget.id,
      amendmentDate: new Date('2026-09-01'),
      reason: 'Premier ajustement',
      lines: [{ costCategoryId: catA, amountDelta: 10000 }],
      createdByUserId: USER_ID
    });
    const amendmentB = await createBudgetAmendmentTx(tx(), TENANT_ID, {
      budgetId: validatedBudget.id,
      amendmentDate: new Date('2026-09-10'),
      reason: 'Second ajustement',
      lines: [{ costCategoryId: catA, amountDelta: 20000 }],
      createdByUserId: USER_ID
    });

    await validateBudgetAmendmentTx(tx(), TENANT_ID, amendmentA.id, USER_ID);
    const secondValidated = await validateBudgetAmendmentTx(tx(), TENANT_ID, amendmentB.id, USER_ID);

    expect(secondValidated.status).toBe('VALIDATED');

    // Le budget revise (hors contrat de ce fichier, calcule ici pour la
    // clarte du test) est l'initial plus la somme des avenants valides :
    // 500000 + 10000 + 20000 = 530000.
    const revised = validatedBudget.totalForecast + 10000 + 20000;
    expect(revised).toBe(530000);
  });

  it('refuse un avenant introuvable', async () => {
    await expect(validateBudgetAmendmentTx(tx(), TENANT_ID, 'avenant-inconnu', USER_ID)).rejects.toMatchObject({
      status: 404
    });
  });
});

// ---------------------------------------------------------------------------
// F. listBudgetAmendments
// ---------------------------------------------------------------------------

describe('listBudgetAmendments', () => {
  it("liste les avenants d'un budget, du plus recent au plus ancien", async () => {
    const siteId = createSite();
    const catA = createCategory();
    const draft = await createDraftBudget(siteId, [catA], { amounts: [500000] });
    const validated = await validateSiteBudgetTx(tx(), TENANT_ID, draft.id, USER_ID);

    const ancien = await createBudgetAmendmentTx(tx(), TENANT_ID, {
      budgetId: validated.id,
      amendmentDate: new Date('2026-01-10'),
      reason: 'Ancien',
      lines: [{ costCategoryId: catA, amountDelta: 1000 }],
      createdByUserId: USER_ID
    });
    const recent = await createBudgetAmendmentTx(tx(), TENANT_ID, {
      budgetId: validated.id,
      amendmentDate: new Date('2026-09-10'),
      reason: 'Recent',
      lines: [{ costCategoryId: catA, amountDelta: 2000 }],
      createdByUserId: USER_ID
    });

    const list = await listBudgetAmendments(TENANT_ID, validated.id);

    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(recent.id);
    expect(list[1].id).toBe(ancien.id);
  });
});

// ---------------------------------------------------------------------------
// Vocabulaire (P-1) : jamais "debit" ni "credit" dans une chaine renvoyee
// ---------------------------------------------------------------------------

describe('vocabulaire — principe P-1', () => {
  function stripAccents(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function collectStrings(value: unknown, into: string[]): void {
    if (typeof value === 'string') {
      into.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(v => collectStrings(v, into));
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(v => collectStrings(v, into));
    }
  }

  it('aucune chaine renvoyee par les fonctions budget/avenant ne contient "debit" ou "credit"', async () => {
    const siteId = createSite();
    const catA = createCategory({ label: 'Gros œuvre' });
    createUser({ id: USER_ID, fullName: 'Mariama Bah' });
    const draft = await createDraftBudget(siteId, [catA], { amounts: [500000] });
    const validated = await validateSiteBudgetTx(tx(), TENANT_ID, draft.id, USER_ID);
    const amendment = await createBudgetAmendmentTx(tx(), TENANT_ID, {
      budgetId: validated.id,
      amendmentDate: new Date('2026-09-19'),
      reason: 'Verification vocabulaire',
      lines: [{ costCategoryId: catA, amountDelta: -5000 }],
      createdByUserId: USER_ID
    });
    const validatedAmendment = await validateBudgetAmendmentTx(tx(), TENANT_ID, amendment.id, USER_ID);

    const strings: string[] = [];
    collectStrings(validated, strings);
    collectStrings(validatedAmendment, strings);

    for (const value of strings) {
      const normalized = stripAccents(value).toLowerCase();
      expect(normalized).not.toMatch(/debit/);
      expect(normalized).not.toMatch(/credit/);
    }
  });
});
