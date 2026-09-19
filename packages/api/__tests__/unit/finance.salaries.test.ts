/**
 * Tests des salaires (`lib/finance/salaries.ts`) — lot 4, troisième sous-lot.
 *
 * Modèle : `__tests__/unit/finance.land-leases.test.ts` (lot 4, premier
 * sous-lot). `accounting.ts` (moteur comptable général) et
 * `lib/finance/cost-allocation.ts` (`syncWorkProgramCostTx`) sont mockés,
 * même geste qu'aux sous-lots précédents : ce fichier ne teste pas comment
 * une écriture s'équilibre, seulement comment `salaries.ts` l'appelle
 * (comptes, montants, labels), ni comment `WorkProgram` se resynchronise,
 * seulement qu'il est appelé pour le bon chantier.
 *
 * `lib/finance/ledger.ts` (`appendThirdPartyMovementTx`) et
 * `lib/finance/site-cost.ts` (`sumSiteActualCost`), en revanche, NE SONT PAS
 * mockés : ce sont les VRAIS calculs qui doivent prouver le critère de
 * sortie le plus important du sous-lot — le coût réel d'un chantier qui
 * monte du montant de la note quand elle porte un chantier (besoin P9 du
 * PRD). Simuler ces calculs à la main aurait surtout prouvé que la
 * simulation est juste, pas que le calcul réel l'est.
 */

const postDocumentEntryTx = jest.fn();

const COMPTES_OPERATIONNELS = new Map<string, string>([
  ['661', 'compte-661'],
  ['422', 'compte-422'],
  ['571', 'compte-571']
]);

jest.mock('../../src/lib/finance/accounting', () => ({
  postDocumentEntryTx: (...args: any[]) => postDocumentEntryTx(...args),
  ensureOperationalJournalTx: async () => 'journal-operationnel',
  ensureOperationalChartOfAccountsTx: async () => COMPTES_OPERATIONNELS
}));

const syncWorkProgramCostTx = jest.fn();

jest.mock('../../src/lib/finance/cost-allocation', () => ({
  syncWorkProgramCostTx: (...args: any[]) => syncWorkProgramCostTx(...args)
}));

// ---------------------------------------------------------------------------
// Magasin en mémoire
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

const store = {
  accounts: [] as Row[],
  employees: [] as Row[],
  salaryNotes: [] as Row[],
  salaryPayments: [] as Row[],
  sites: [] as Row[],
  categories: [] as Row[],
  movements: [] as Row[],
  allocations: [] as Row[],
  users: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function withCreatedBy(row: Row): Row {
  return { ...row, createdBy: store.users.find(u => u.id === row.createdByUserId) ?? null };
}

function withEmployee(row: Row): Row {
  return { ...row, employee: store.employees.find(e => e.id === row.employeeId) ?? null };
}

function withSite(row: Row): Row {
  return { ...row, site: row.siteId ? (store.sites.find(s => s.id === row.siteId) ?? null) : null };
}

function withCostCategory(row: Row): Row {
  return {
    ...row,
    costCategory: row.costCategoryId ? (store.categories.find(c => c.id === row.costCategoryId) ?? null) : null
  };
}

function enrichSalaryNote(row: Row): Row {
  return withCreatedBy(withCostCategory(withSite(withEmployee(row))));
}

function enrichSalaryPayment(row: Row): Row {
  return withCreatedBy(withEmployee(row));
}

function withThirdPartyAccount(row: Row): Row {
  return { ...row, thirdPartyAccount: store.accounts.find(a => a.id === row.thirdPartyAccountId) ?? null };
}

const mockPrisma: Row = {
  thirdPartyAccount: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('compte'), ...data };
      store.accounts.push(created);
      return created;
    }),
    findFirst: jest.fn(
      async ({ where }: Row) => store.accounts.find(a => a.id === where.id && a.tenantId === where.tenantId) ?? null
    ),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.accounts.find(a => a.id === where.id)!;
      Object.assign(row, data);
      return row;
    })
  },

  employee: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('employe'), isActive: true, createdAt: new Date(), ...data };
      store.employees.push(created);
      return created;
    }),
    findFirst: jest.fn(async ({ where, include }: Row) => {
      const row = store.employees.find(e => e.id === where.id && e.tenantId === where.tenantId);
      if (!row) return null;
      return include?.thirdPartyAccount ? withThirdPartyAccount(row) : row;
    }),
    findMany: jest.fn(async ({ where, include }: Row) => {
      let rows = store.employees.filter(e => e.tenantId === where.tenantId);
      if (where.isActive !== undefined) rows = rows.filter(e => e.isActive === where.isActive);
      rows = [...rows].sort((a, b) => a.fullName.localeCompare(b.fullName));
      return include?.thirdPartyAccount ? rows.map(withThirdPartyAccount) : rows;
    })
  },

  constructionSite: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.sites.find(s => s.id === where.id && s.tenantId === where.tenantId) ?? null
    )
  },

  costCategory: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.categories.find(c => c.id === where.id && c.tenantId === where.tenantId) ?? null
    )
  },

  salaryNote: {
    create: jest.fn(async ({ data }: Row) => {
      const created = {
        id: nextId('note'),
        journalEntryId: null,
        validatedByUserId: null,
        validatedAt: null,
        createdAt: new Date(),
        ...data
      };
      store.salaryNotes.push(created);
      return enrichSalaryNote(created);
    }),
    findFirst: jest.fn(async ({ where }: Row) => {
      const row = store.salaryNotes.find(n => n.id === where.id && n.tenantId === where.tenantId);
      return row ? enrichSalaryNote(row) : null;
    }),
    findUnique: jest.fn(async ({ where }: Row) => {
      const key = where.employeeId_periodYear_periodMonth;
      const row = store.salaryNotes.find(
        n => n.employeeId === key.employeeId && n.periodYear === key.periodYear && n.periodMonth === key.periodMonth
      );
      return row ?? null;
    }),
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = store.salaryNotes.filter(n => n.tenantId === where.tenantId);
      if (where.employeeId) rows = rows.filter(n => n.employeeId === where.employeeId);
      if (where.siteId) rows = rows.filter(n => n.siteId === where.siteId);
      if (where.periodYear !== undefined) rows = rows.filter(n => n.periodYear === where.periodYear);
      if (where.periodMonth !== undefined) rows = rows.filter(n => n.periodMonth === where.periodMonth);
      rows = [...rows].sort(
        (a, b) =>
          b.periodYear - a.periodYear || b.periodMonth - a.periodMonth || b.createdAt.getTime() - a.createdAt.getTime()
      );
      return rows.map(enrichSalaryNote);
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.salaryNotes.filter(
        n =>
          n.id === where.id &&
          n.tenantId === where.tenantId &&
          (where.status === undefined || n.status === where.status)
      );
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    })
  },

  salaryPayment: {
    create: jest.fn(async ({ data }: Row) => {
      const created = {
        id: nextId('reglement'),
        journalEntryId: null,
        validatedByUserId: null,
        validatedAt: null,
        createdAt: new Date(),
        ...data
      };
      store.salaryPayments.push(created);
      return enrichSalaryPayment(created);
    }),
    findFirst: jest.fn(async ({ where }: Row) => {
      const row = store.salaryPayments.find(p => p.id === where.id && p.tenantId === where.tenantId);
      return row ? enrichSalaryPayment(row) : null;
    }),
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = store.salaryPayments.filter(p => p.employeeId === where.employeeId && p.tenantId === where.tenantId);
      rows = [...rows].sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime());
      return rows.map(enrichSalaryPayment);
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.salaryPayments.filter(
        p =>
          p.id === where.id &&
          p.tenantId === where.tenantId &&
          (where.status === undefined || p.status === where.status)
      );
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    })
  },

  costAllocation: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('imputation'), voidedAt: null, createdAt: new Date(), ...data };
      store.allocations.push(created);
      return created;
    }),
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = store.allocations.filter(a => a.tenantId === where.tenantId);
      if (where.sourceType) rows = rows.filter(a => a.sourceType === where.sourceType);
      if (where.siteId) rows = rows.filter(a => a.siteId === where.siteId);
      if (where.voidedAt === null) rows = rows.filter(a => a.voidedAt === null);
      if (where.validatedAt && where.validatedAt.not === null) rows = rows.filter(a => a.validatedAt !== null);
      return [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }),
    aggregate: jest.fn(async ({ where }: Row) => {
      let rows = store.allocations.filter(a => a.tenantId === where.tenantId && a.siteId === where.siteId);
      if (where.validatedAt && where.validatedAt.not === null) rows = rows.filter(a => a.validatedAt !== null);
      if (where.voidedAt === null) rows = rows.filter(a => a.voidedAt === null);
      const sum = rows.reduce(
        (total, row) => total + (typeof row.amount === 'number' ? row.amount : Number(row.amount)),
        0
      );
      return { _sum: { amount: rows.length ? sum : null } };
    })
  },

  thirdPartyMovement: {
    findUnique: jest.fn(async ({ where }: Row) => {
      const key = where.sourceType_sourceId_type;
      return (
        store.movements.find(
          m => m.sourceType === key.sourceType && m.sourceId === key.sourceId && m.type === key.type
        ) ?? null
      );
    }),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('mvt'), createdAt: new Date(), ...data };
      store.movements.push(created);
      return created;
    })
  }
};

/** Rollback par copie profonde en cas d'erreur — même esprit qu'aux sous-lots précédents. */
async function runTransaction<T>(callback: (tx: Row) => Promise<T>): Promise<T> {
  const snapshot = {
    accounts: structuredClone(store.accounts),
    employees: structuredClone(store.employees),
    salaryNotes: structuredClone(store.salaryNotes),
    salaryPayments: structuredClone(store.salaryPayments),
    movements: structuredClone(store.movements),
    allocations: structuredClone(store.allocations),
    seq: store.seq
  };
  try {
    return await callback(mockPrisma);
  } catch (error) {
    store.accounts = snapshot.accounts;
    store.employees = snapshot.employees;
    store.salaryNotes = snapshot.salaryNotes;
    store.salaryPayments = snapshot.salaryPayments;
    store.movements = snapshot.movements;
    store.allocations = snapshot.allocations;
    store.seq = snapshot.seq;
    throw error;
  }
}

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === '$transaction') {
          return (callback: any) => runTransaction(callback);
        }
        return (mockPrisma as any)[prop];
      }
    }
  )
}));

import {
  createEmployeeTx,
  createSalaryNoteTx,
  createSalaryPaymentTx,
  getEmployee,
  listEmployees,
  listSalaryNotes,
  listSalaryPayments,
  validateSalaryNoteTx,
  validateSalaryPaymentTx
} from '../../src/lib/finance/salaries';
// Coût réel d'un chantier — VRAI calcul, non mocké (voir l'en-tête du
// fichier) : c'est lui qui prouve que la validation d'une note a bien fait
// monter le coût du chantier, pas une doublure qui l'affirmerait à sa place.
import { sumSiteActualCost } from '../../src/lib/finance/site-cost';

const TENANT_ID = 'tenant-1';
const GESTIONNAIRE_ID = 'user-gestionnaire';
const DIRIGEANT_ID = 'user-dirigeant';

function seedSite(overrides: Partial<Row> = {}): Row {
  const site = {
    id: nextId('chantier'),
    tenantId: TENANT_ID,
    name: `Chantier ${store.sites.length + 1}`,
    status: 'IN_PROGRESS',
    createdAt: new Date(Date.now() + store.sites.length),
    ...overrides
  };
  store.sites.push(site);
  return site;
}

function seedCostCategory(overrides: Partial<Row> = {}): Row {
  const category = {
    id: nextId('poste'),
    tenantId: TENANT_ID,
    label: 'Main-d’œuvre',
    isActive: true,
    ...overrides
  };
  store.categories.push(category);
  return category;
}

async function seedEmployee(overrides: Partial<Row> = {}): Promise<Row> {
  return runTransaction((tx: any) =>
    createEmployeeTx(tx, TENANT_ID, {
      fullName: 'Sekou Diallo',
      role: 'Maçon',
      ...overrides
    })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  store.accounts = [];
  store.employees = [];
  store.salaryNotes = [];
  store.salaryPayments = [];
  store.sites = [];
  store.categories = [];
  store.movements = [];
  store.allocations = [];
  store.users = [
    { id: GESTIONNAIRE_ID, fullName: 'Fatoumata Camara', email: 'f.camara@example.gn' },
    { id: DIRIGEANT_ID, fullName: 'Ibrahima Sory', email: 'i.sory@example.gn' }
  ];
  store.seq = 0;

  postDocumentEntryTx.mockImplementation(async () => ({ entryId: nextId('ecriture'), totalDebit: 0, totalCredit: 0 }));
});

// ---------------------------------------------------------------------------
// A. L'employé et son compte de tiers
// ---------------------------------------------------------------------------

describe('createEmployeeTx — enregistrement et compte de tiers', () => {
  it('ouvre un compte de tiers EMPLOYEE à solde nul', async () => {
    const employee = await seedEmployee({ fullName: 'Sekou Diallo', role: 'Maçon' });

    expect(employee.thirdPartyAccountId).toBeTruthy();
    expect(store.accounts).toHaveLength(1);
    expect(store.accounts[0].kind).toBe('EMPLOYEE');
    expect(employee.accountBalance).toBe(0);
    expect(employee.isActive).toBe(true);
    expect(employee.role).toBe('Maçon');
  });

  it('accepte un employé sans poste renseigné (role nul)', async () => {
    const employee = await seedEmployee({ role: null });
    expect(employee.role).toBeNull();
  });

  it('refuse un nom complet vide', async () => {
    await expect(seedEmployee({ fullName: '   ' })).rejects.toThrow(/obligatoire/i);
  });
});

describe('listEmployees / getEmployee', () => {
  it('liste les employés avec leur solde', async () => {
    await seedEmployee({ fullName: 'Alpha Bah' });
    await seedEmployee({ fullName: 'Zainab Cissé' });

    const employees = await listEmployees(TENANT_ID, {});

    expect(employees).toHaveLength(2);
    expect(employees.every(e => e.accountBalance === 0)).toBe(true);
  });

  it('filtre les employés actifs', async () => {
    const employee = await seedEmployee();
    store.employees.find(e => e.id === employee.id)!.isActive = false;

    const employees = await listEmployees(TENANT_ID, { onlyActive: true });

    expect(employees).toHaveLength(0);
  });

  it('refuse un employé introuvable', async () => {
    await expect(getEmployee(TENANT_ID, 'employe-inconnu')).rejects.toThrow(/introuvable/i);
  });
});

// ---------------------------------------------------------------------------
// B/C. Note de salaire — brouillon
// ---------------------------------------------------------------------------

describe('createSalaryNoteTx — brouillon', () => {
  it("n'écrit ni écriture ni mouvement ni imputation", async () => {
    const employee = await seedEmployee();

    const note = await runTransaction((tx: any) =>
      createSalaryNoteTx(tx, TENANT_ID, {
        employeeId: employee.id,
        periodYear: 2026,
        periodMonth: 3,
        amount: 500_000,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    expect(note.status).toBe('DRAFT');
    expect(note.validatedAt).toBeNull();
    expect(note.createdByLabel).toBe('Fatoumata Camara');
    expect(note.siteId).toBeNull();
    expect(note.siteLabel).toBeNull();
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
    expect(store.movements).toHaveLength(0);
    expect(store.allocations).toHaveLength(0);
  });

  it('refuse un montant nul ou négatif', async () => {
    const employee = await seedEmployee();
    await expect(
      runTransaction((tx: any) =>
        createSalaryNoteTx(tx, TENANT_ID, {
          employeeId: employee.id,
          periodYear: 2026,
          periodMonth: 3,
          amount: 0,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toThrow(/positif/i);
  });

  it('refuse un employé introuvable', async () => {
    await expect(
      runTransaction((tx: any) =>
        createSalaryNoteTx(tx, TENANT_ID, {
          employeeId: 'employe-inconnu',
          periodYear: 2026,
          periodMonth: 3,
          amount: 500_000,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toThrow(/introuvable/i);
  });

  it('EXIGE le poste de dépense dès qu’un chantier est renseigné', async () => {
    const employee = await seedEmployee();
    const site = seedSite();

    await expect(
      runTransaction((tx: any) =>
        createSalaryNoteTx(tx, TENANT_ID, {
          employeeId: employee.id,
          periodYear: 2026,
          periodMonth: 3,
          amount: 500_000,
          siteId: site.id,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toThrow(/poste de dépense est obligatoire/i);
  });

  it('REFUSE le poste de dépense quand aucun chantier n’est renseigné', async () => {
    const employee = await seedEmployee();
    const category = seedCostCategory();

    await expect(
      runTransaction((tx: any) =>
        createSalaryNoteTx(tx, TENANT_ID, {
          employeeId: employee.id,
          periodYear: 2026,
          periodMonth: 3,
          amount: 500_000,
          costCategoryId: category.id,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toThrow(/n'est accepté que si un chantier/i);
  });

  it('refuse un poste de dépense désactivé — un repli serait un choix invisible', async () => {
    const employee = await seedEmployee();
    const site = seedSite();
    const category = seedCostCategory({ isActive: false });

    await expect(
      runTransaction((tx: any) =>
        createSalaryNoteTx(tx, TENANT_ID, {
          employeeId: employee.id,
          periodYear: 2026,
          periodMonth: 3,
          amount: 500_000,
          siteId: site.id,
          costCategoryId: category.id,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toThrow(/désactivé/i);
  });

  it('refuse un chantier introuvable', async () => {
    const employee = await seedEmployee();
    const category = seedCostCategory();

    await expect(
      runTransaction((tx: any) =>
        createSalaryNoteTx(tx, TENANT_ID, {
          employeeId: employee.id,
          periodYear: 2026,
          periodMonth: 3,
          amount: 500_000,
          siteId: 'chantier-inconnu',
          costCategoryId: category.id,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toThrow(/chantier introuvable/i);
  });

  it(
    'UNE NOTE PAR EMPLOYÉ ET PAR MOIS : refuse une seconde note sur la même période (409), ' +
      'vérifiée AVANT toute écriture',
    async () => {
      const employee = await seedEmployee();
      await runTransaction((tx: any) =>
        createSalaryNoteTx(tx, TENANT_ID, {
          employeeId: employee.id,
          periodYear: 2026,
          periodMonth: 3,
          amount: 500_000,
          createdByUserId: GESTIONNAIRE_ID
        })
      );

      await expect(
        runTransaction((tx: any) =>
          createSalaryNoteTx(tx, TENANT_ID, {
            employeeId: employee.id,
            periodYear: 2026,
            periodMonth: 3,
            amount: 600_000,
            createdByUserId: GESTIONNAIRE_ID
          })
        )
      ).rejects.toThrow(/existe déjà/i);

      expect(store.salaryNotes).toHaveLength(1);
    }
  );

  it('accepte deux notes du même employé sur des mois différents', async () => {
    const employee = await seedEmployee();
    await runTransaction((tx: any) =>
      createSalaryNoteTx(tx, TENANT_ID, {
        employeeId: employee.id,
        periodYear: 2026,
        periodMonth: 3,
        amount: 500_000,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    await runTransaction((tx: any) =>
      createSalaryNoteTx(tx, TENANT_ID, {
        employeeId: employee.id,
        periodYear: 2026,
        periodMonth: 4,
        amount: 500_000,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    expect(store.salaryNotes).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// C. Note de salaire — validation
// ---------------------------------------------------------------------------

describe('validateSalaryNoteTx — écriture et mouvement', () => {
  async function createNote(employee: Row, overrides: Partial<Row> = {}) {
    return runTransaction((tx: any) =>
      createSalaryNoteTx(tx, TENANT_ID, {
        employeeId: employee.id,
        periodYear: 2026,
        periodMonth: 3,
        amount: 500_000,
        createdByUserId: GESTIONNAIRE_ID,
        ...overrides
      })
    );
  }

  it('débite le 661, crédite le 422, et rend l’employé créditeur (solde positif)', async () => {
    const employee = await seedEmployee();
    const note = await createNote(employee);

    const validated = await runTransaction((tx: any) => validateSalaryNoteTx(tx, TENANT_ID, note.id, DIRIGEANT_ID));

    expect(validated.status).toBe('VALIDATED');
    expect(postDocumentEntryTx).toHaveBeenCalledTimes(1);
    const [, params] = postDocumentEntryTx.mock.calls[0];
    expect(params.documentType).toBe('SALARY_NOTE');
    expect(params.lines).toEqual([
      expect.objectContaining({ accountId: 'compte-661', debit: 500_000 }),
      expect.objectContaining({ accountId: 'compte-422', credit: 500_000 })
    ]);
    for (const line of params.lines) {
      expect(line.label.toLowerCase()).not.toMatch(/débit|crédit/);
    }

    const account = store.accounts.find(a => a.id === employee.thirdPartyAccountId)!;
    expect(account.balance).toBe(500_000);
    expect(store.allocations).toHaveLength(0);
    expect(syncWorkProgramCostTx).not.toHaveBeenCalled();
  });

  it('refuse de valider une note déjà validée (principe P-6)', async () => {
    const employee = await seedEmployee();
    const note = await createNote(employee);
    await runTransaction((tx: any) => validateSalaryNoteTx(tx, TENANT_ID, note.id, DIRIGEANT_ID));

    await expect(
      runTransaction((tx: any) => validateSalaryNoteTx(tx, TENANT_ID, note.id, DIRIGEANT_ID))
    ).rejects.toThrow(/déjà été validée/i);
  });

  it('refuse une note introuvable', async () => {
    await expect(
      runTransaction((tx: any) => validateSalaryNoteTx(tx, TENANT_ID, 'note-inconnue', DIRIGEANT_ID))
    ).rejects.toThrow(/introuvable/i);
  });

  it(
    'LE TEST LE PLUS IMPORTANT : la validation d’une note AVEC CHANTIER fait monter le coût réel ' +
      'du chantier, de zéro au montant de la note (sumSiteActualCost, calcul réel, non mocké)',
    async () => {
      const employee = await seedEmployee();
      const site = seedSite();
      const category = seedCostCategory();

      const coutAvant = await sumSiteActualCost(mockPrisma as any, TENANT_ID, site.id);
      expect(coutAvant).toBe(0);

      const note = await createNote(employee, { siteId: site.id, costCategoryId: category.id, amount: 350_000 });
      const validated = await runTransaction((tx: any) => validateSalaryNoteTx(tx, TENANT_ID, note.id, DIRIGEANT_ID));

      const coutApres = await sumSiteActualCost(mockPrisma as any, TENANT_ID, site.id);
      expect(coutApres).toBe(coutAvant + 350_000);
      expect(coutApres).toBe(350_000);

      expect(validated.siteId).toBe(site.id);
      expect(validated.siteLabel).toBe(site.name);
      expect(validated.costCategoryLabel).toBe(category.label);

      // Une VRAIE ligne `CostAllocation`, exactement comme une facture
      // fournisseur ou une constatation de bail : validée, non annulée, sur
      // le poste choisi à la saisie.
      expect(store.allocations).toHaveLength(1);
      expect(store.allocations[0]).toMatchObject({
        tenantId: TENANT_ID,
        siteId: site.id,
        costCategoryId: category.id,
        sourceType: 'SALARY_NOTE',
        sourceId: note.id,
        amount: 350_000
      });
      expect(store.allocations[0].validatedAt).not.toBeNull();
      expect(store.allocations[0].voidedAt).toBeNull();

      // Le programme de travaux rattaché à ce chantier doit être resynchronisé
      // DANS CETTE transaction, même geste qu'à la validation d'une facture
      // fournisseur ou d'une constatation de bail de terrain.
      expect(syncWorkProgramCostTx).toHaveBeenCalledWith(expect.anything(), TENANT_ID, site.id);
    }
  );

  it('une note sans chantier ne produit aucune imputation ni synchronisation', async () => {
    const employee = await seedEmployee();
    const note = await createNote(employee);

    await runTransaction((tx: any) => validateSalaryNoteTx(tx, TENANT_ID, note.id, DIRIGEANT_ID));

    expect(store.allocations).toHaveLength(0);
    expect(syncWorkProgramCostTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// D. Notes de salaire — liste filtrée
// ---------------------------------------------------------------------------

describe('listSalaryNotes — filtres', () => {
  it('filtre par employeeId, siteId, periodYear et periodMonth', async () => {
    const employeeA = await seedEmployee({ fullName: 'Alpha Bah' });
    const employeeB = await seedEmployee({ fullName: 'Boubacar Sow' });
    const site = seedSite();
    const category = seedCostCategory();

    await runTransaction((tx: any) =>
      createSalaryNoteTx(tx, TENANT_ID, {
        employeeId: employeeA.id,
        periodYear: 2026,
        periodMonth: 3,
        amount: 400_000,
        siteId: site.id,
        costCategoryId: category.id,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    await runTransaction((tx: any) =>
      createSalaryNoteTx(tx, TENANT_ID, {
        employeeId: employeeB.id,
        periodYear: 2026,
        periodMonth: 4,
        amount: 450_000,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    expect(await listSalaryNotes(TENANT_ID, {})).toHaveLength(2);
    expect(await listSalaryNotes(TENANT_ID, { employeeId: employeeA.id })).toHaveLength(1);
    expect(await listSalaryNotes(TENANT_ID, { siteId: site.id })).toHaveLength(1);
    expect(await listSalaryNotes(TENANT_ID, { periodYear: 2026, periodMonth: 4 })).toHaveLength(1);
    expect(await listSalaryNotes(TENANT_ID, { periodMonth: 12 })).toHaveLength(0);
  });

  it('résout employeeLabel/siteLabel/costCategoryLabel par une seule requête de lot', async () => {
    const employee = await seedEmployee({ fullName: 'Alpha Bah' });
    const site = seedSite({ name: 'Chantier de Kaloum' });
    const category = seedCostCategory({ label: 'Main-d’œuvre' });

    await runTransaction((tx: any) =>
      createSalaryNoteTx(tx, TENANT_ID, {
        employeeId: employee.id,
        periodYear: 2026,
        periodMonth: 3,
        amount: 400_000,
        siteId: site.id,
        costCategoryId: category.id,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    const [note] = await listSalaryNotes(TENANT_ID, {});

    expect(note.employeeLabel).toBe('Alpha Bah');
    expect(note.siteLabel).toBe('Chantier de Kaloum');
    expect(note.costCategoryLabel).toBe('Main-d’œuvre');
  });
});

// ---------------------------------------------------------------------------
// E/F. Règlement de salaire — brouillon puis validation
// ---------------------------------------------------------------------------

describe('createSalaryPaymentTx — brouillon', () => {
  it("n'écrit ni écriture ni mouvement", async () => {
    const employee = await seedEmployee();

    const payment = await runTransaction((tx: any) =>
      createSalaryPaymentTx(tx, TENANT_ID, {
        employeeId: employee.id,
        paymentDate: new Date('2026-03-05'),
        amount: 300_000,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    expect(payment.status).toBe('DRAFT');
    expect(payment.validatedAt).toBeNull();
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
    expect(store.movements).toHaveLength(0);
  });

  it('refuse un montant nul ou négatif', async () => {
    const employee = await seedEmployee();
    await expect(
      runTransaction((tx: any) =>
        createSalaryPaymentTx(tx, TENANT_ID, {
          employeeId: employee.id,
          paymentDate: new Date('2026-03-05'),
          amount: -1,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toThrow(/positif/i);
  });

  it('refuse un employé introuvable', async () => {
    await expect(
      runTransaction((tx: any) =>
        createSalaryPaymentTx(tx, TENANT_ID, {
          employeeId: 'employe-inconnu',
          paymentDate: new Date('2026-03-05'),
          amount: 300_000,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toThrow(/introuvable/i);
  });
});

describe('validateSalaryPaymentTx — écriture et mouvement', () => {
  async function payAndValidate(employee: Row, amount: number) {
    const payment = await runTransaction((tx: any) =>
      createSalaryPaymentTx(tx, TENANT_ID, {
        employeeId: employee.id,
        paymentDate: new Date('2026-03-05T00:00:00.000Z'),
        amount,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    return runTransaction((tx: any) => validateSalaryPaymentTx(tx, TENANT_ID, payment.id, DIRIGEANT_ID));
  }

  it('débite le 422, crédite le 571, et diminue le solde de l’employé', async () => {
    const employee = await seedEmployee();
    const note = await runTransaction((tx: any) =>
      createSalaryNoteTx(tx, TENANT_ID, {
        employeeId: employee.id,
        periodYear: 2026,
        periodMonth: 3,
        amount: 500_000,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    await runTransaction((tx: any) => validateSalaryNoteTx(tx, TENANT_ID, note.id, DIRIGEANT_ID));

    const validated = await payAndValidate(employee, 500_000);

    expect(validated.status).toBe('VALIDATED');
    expect(postDocumentEntryTx).toHaveBeenCalledTimes(2); // note + règlement
    const [, params] = postDocumentEntryTx.mock.calls[1];
    expect(params.documentType).toBe('SALARY_PAYMENT');
    expect(params.lines).toEqual([
      expect.objectContaining({ accountId: 'compte-422', debit: 500_000 }),
      expect.objectContaining({ accountId: 'compte-571', credit: 500_000 })
    ]);
    for (const line of params.lines) {
      expect(line.label.toLowerCase()).not.toMatch(/débit|crédit/);
    }

    const account = store.accounts.find(a => a.id === employee.thirdPartyAccountId)!;
    expect(account.balance).toBe(0);
  });

  it(
    'UN RÈGLEMENT SUPÉRIEUR AU SOLDE EST ACCEPTÉ (avance sur salaire) : le compte devient débiteur, ' +
      'symétrique de l’acompte fournisseur du lot 2',
    async () => {
      const employee = await seedEmployee();
      // Aucune note validée : le solde de l'employé est encore à zéro.
      expect(store.accounts.find(a => a.id === employee.thirdPartyAccountId)!.balance).toBe(0);

      const validated = await payAndValidate(employee, 200_000);

      expect(validated.status).toBe('VALIDATED');
      const account = store.accounts.find(a => a.id === employee.thirdPartyAccountId)!;
      expect(account.balance).toBe(-200_000);
    }
  );

  it('refuse de valider un règlement déjà validé (principe P-6)', async () => {
    const employee = await seedEmployee();
    const payment = await runTransaction((tx: any) =>
      createSalaryPaymentTx(tx, TENANT_ID, {
        employeeId: employee.id,
        paymentDate: new Date('2026-03-05'),
        amount: 300_000,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    await runTransaction((tx: any) => validateSalaryPaymentTx(tx, TENANT_ID, payment.id, DIRIGEANT_ID));

    await expect(
      runTransaction((tx: any) => validateSalaryPaymentTx(tx, TENANT_ID, payment.id, DIRIGEANT_ID))
    ).rejects.toThrow(/déjà été validé/i);
  });

  it('refuse un règlement introuvable', async () => {
    await expect(
      runTransaction((tx: any) => validateSalaryPaymentTx(tx, TENANT_ID, 'reglement-inconnu', DIRIGEANT_ID))
    ).rejects.toThrow(/introuvable/i);
  });
});

// ---------------------------------------------------------------------------
// G. Règlements de salaire — liste
// ---------------------------------------------------------------------------

describe('listSalaryPayments', () => {
  it('liste les règlements d’un employé, triés par date décroissante', async () => {
    const employee = await seedEmployee();
    await runTransaction((tx: any) =>
      createSalaryPaymentTx(tx, TENANT_ID, {
        employeeId: employee.id,
        paymentDate: new Date('2026-03-05'),
        amount: 100_000,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    await runTransaction((tx: any) =>
      createSalaryPaymentTx(tx, TENANT_ID, {
        employeeId: employee.id,
        paymentDate: new Date('2026-04-05'),
        amount: 100_000,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    const payments = await listSalaryPayments(TENANT_ID, employee.id);

    expect(payments).toHaveLength(2);
    expect(payments[0].paymentDate.getUTCMonth()).toBe(3); // avril, le plus récent d'abord
  });

  it('refuse un employé introuvable', async () => {
    await expect(listSalaryPayments(TENANT_ID, 'employe-inconnu')).rejects.toThrow(/introuvable/i);
  });
});
