/**
 * Tests des tâcherons (`lib/finance/contractors.ts`) — lot 4, quatrième
 * sous-lot.
 *
 * Modèle : `__tests__/unit/finance.salaries.test.ts` (lot 4, troisième
 * sous-lot). `accounting.ts` (moteur comptable général) et
 * `lib/finance/cost-allocation.ts` (`syncWorkProgramCostTx`) sont mockés,
 * même geste qu'aux sous-lots précédents : ce fichier ne teste pas comment une
 * écriture s'équilibre, seulement comment `contractors.ts` l'appelle (comptes,
 * montants, labels), ni comment `WorkProgram` se resynchronise, seulement
 * qu'il est appelé pour le bon chantier.
 *
 * `resolveExpenseAccountsByCostCategoryTx` est mocké lui aussi, mais de façon
 * à pouvoir prouver le point 5 de la mission : le compte de charge suit le
 * poste du marché, jamais un compte unique. `COMPTES_PAR_POSTE` (module-level)
 * permet à un test d'enregistrer un compte propre à un poste ; sans entrée, la
 * doublure renvoie le compte par défaut (605) — exactement le contrat de la
 * vraie fonction (`accounting.ts`).
 *
 * `lib/finance/ledger.ts` (`appendThirdPartyMovementTx`) et
 * `lib/finance/site-cost.ts` (`sumSiteActualCost`), en revanche, NE SONT PAS
 * mockés : ce sont les VRAIS calculs qui doivent prouver les critères les plus
 * importants du sous-lot — les deux soldes qui restent distincts, et le coût
 * réel d'un chantier qui monte de l'imputation d'une situation validée.
 */

const postDocumentEntryTx = jest.fn();

const COMPTES_OPERATIONNELS = new Map<string, string>([
  ['402', 'compte-402'],
  ['605', 'compte-605'],
  ['571', 'compte-571']
]);

/** Voir l'en-tête : permet à un test de faire porter un compte propre à un poste. */
const COMPTES_PAR_POSTE = new Map<string, string>();

const resolveExpenseAccountsByCostCategoryTx = jest.fn(
  async (_tx: unknown, _tenantId: string, ids: string[], parDefaut: string) =>
    new Map(ids.map(id => [id, COMPTES_PAR_POSTE.get(id) ?? parDefaut]))
);

// Lot 10 : la caisse ne se lit plus dans `accounting.ts` mais se resout par
// `treasury/accounts.ts`. On la mocke pour renvoyer le meme compte 571 qu'avant,
// afin que ce fichier continue de verifier les memes ecritures.
// BUG-2026-09-29-032 : le compte qui PAIE se resout par
// `resolveOutflowTreasuryAccountTx` (caisse 571 par defaut, banque 521 pour un
// virement ou quand le compte « tresorerie-banque » est choisi), et son solde
// est controle par `assertTreasuryCanPayTx` (mocke : il a ses tests dans
// `treasury.test.ts`, ici on verifie qu'il est appele pour le bon compte).
const CAISSE_571 = {
  treasuryAccountId: 'tresorerie-571',
  chartOfAccountId: 'compte-571',
  accountNumber: '571',
  label: 'Caisse',
  kind: 'CASH',
  journal: 'CASH'
};
const BANQUE_521 = {
  treasuryAccountId: 'tresorerie-banque',
  chartOfAccountId: 'compte-banque',
  accountNumber: '521',
  label: 'Banque',
  kind: 'BANK',
  journal: 'BANK'
};
const assertTreasuryCanPayTx = jest.fn();
jest.mock('../../src/lib/treasury/balance', () => ({
  assertTreasuryCanPayTx: (...args: any[]) => assertTreasuryCanPayTx(...args)
}));

jest.mock('../../src/lib/treasury/accounts', () => ({
  ensureDefaultTreasuryAccountTx: async () => CAISSE_571,
  resolveOutflowTreasuryAccountTx: async (_tx: unknown, _tenantId: string, params: any) =>
    params.treasuryAccountId === 'tresorerie-banque' || ['BANK_TRANSFER', 'CHECK', 'CARD'].includes(params.method)
      ? BANQUE_521
      : CAISSE_571
}));

jest.mock('../../src/lib/finance/accounting', () => ({
  postDocumentEntryTx: (...args: any[]) => postDocumentEntryTx(...args),
  ensureOperationalJournalTx: async () => 'journal-operationnel',
  ensureOperationalChartOfAccountsTx: async () => COMPTES_OPERATIONNELS,
  resolveExpenseAccountsByCostCategoryTx: (...args: any[]) => (resolveExpenseAccountsByCostCategoryTx as any)(...args)
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
  contractors: [] as Row[],
  sites: [] as Row[],
  categories: [] as Row[],
  contracts: [] as Row[],
  statements: [] as Row[],
  payments: [] as Row[],
  allocations: [] as Row[],
  movements: [] as Row[],
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

function withThirdPartyAccount(row: Row): Row {
  return { ...row, thirdPartyAccount: store.accounts.find(a => a.id === row.thirdPartyAccountId) ?? null };
}

function enrichContract(row: Row): Row {
  return {
    ...row,
    contractor: store.contractors.find(c => c.id === row.contractorId) ?? null,
    site: store.sites.find(s => s.id === row.siteId) ?? null,
    costCategory: store.categories.find(c => c.id === row.costCategoryId) ?? null
  };
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

  contractor: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('tacheron'), isActive: true, createdAt: new Date(), ...data };
      store.contractors.push(created);
      return created;
    }),
    findFirst: jest.fn(async ({ where, include }: Row) => {
      const row = store.contractors.find(c => c.id === where.id && c.tenantId === where.tenantId);
      if (!row) return null;
      return include?.thirdPartyAccount ? withThirdPartyAccount(row) : row;
    }),
    findMany: jest.fn(async ({ where, include }: Row) => {
      let rows = store.contractors.filter(c => c.tenantId === where.tenantId);
      if (where.isActive !== undefined) rows = rows.filter(c => c.isActive === where.isActive);
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

  contractorContract: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('marche'), isActive: true, createdAt: new Date(), ...data };
      store.contracts.push(created);
      return created;
    }),
    findFirst: jest.fn(async ({ where }: Row) => {
      let row: Row | undefined;
      if (where.id) {
        row = store.contracts.find(c => c.id === where.id && c.tenantId === where.tenantId);
      } else {
        // Contrôle d'unicité de référence, AVANT écriture — voir `contractors.ts`.
        row = store.contracts.find(c => c.tenantId === where.tenantId && c.reference === where.reference);
      }
      return row ? enrichContract(row) : null;
    }),
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = store.contracts.filter(c => c.tenantId === where.tenantId);
      if (where.contractorId) rows = rows.filter(c => c.contractorId === where.contractorId);
      if (where.siteId) rows = rows.filter(c => c.siteId === where.siteId);
      rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return rows.map(enrichContract);
    })
  },

  progressStatement: {
    create: jest.fn(async ({ data }: Row) => {
      const created = {
        id: nextId('situation'),
        journalEntryId: null,
        validatedByUserId: null,
        validatedAt: null,
        createdAt: new Date(),
        ...data
      };
      store.statements.push(created);
      return withCreatedBy(created);
    }),
    findFirst: jest.fn(async ({ where }: Row) => {
      const row = store.statements.find(s => s.id === where.id && s.tenantId === where.tenantId);
      return row ? withCreatedBy(row) : null;
    }),
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = store.statements.filter(s => s.tenantId === where.tenantId);
      if (where.contractId) rows = rows.filter(s => s.contractId === where.contractId);
      rows = [...rows].sort((a, b) => b.statementDate.getTime() - a.statementDate.getTime());
      return rows.map(withCreatedBy);
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.statements.filter(
        s =>
          s.id === where.id &&
          s.tenantId === where.tenantId &&
          (where.status === undefined || s.status === where.status)
      );
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    }),
    groupBy: jest.fn(async ({ where }: Row) => {
      let rows = store.statements.filter(s => s.tenantId === where.tenantId);
      if (where.contractId?.in) rows = rows.filter(s => where.contractId.in.includes(s.contractId));
      if (where.validatedAt && where.validatedAt.not === null) rows = rows.filter(s => s.validatedAt !== null);
      const parMarche = new Map<string, number>();
      for (const row of rows) {
        const montant = typeof row.amount === 'number' ? row.amount : Number(row.amount);
        parMarche.set(row.contractId, (parMarche.get(row.contractId) ?? 0) + montant);
      }
      return [...parMarche.entries()].map(([contractId, sum]) => ({ contractId, _sum: { amount: sum } }));
    })
  },

  contractorPayment: {
    create: jest.fn(async ({ data }: Row) => {
      const created = {
        id: nextId('reglement'),
        journalEntryId: null,
        validatedByUserId: null,
        validatedAt: null,
        createdAt: new Date(),
        ...data
      };
      store.payments.push(created);
      return withCreatedBy(created);
    }),
    findFirst: jest.fn(async ({ where }: Row) => {
      const row = store.payments.find(p => p.id === where.id && p.tenantId === where.tenantId);
      return row ? withCreatedBy(row) : null;
    }),
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = store.payments.filter(p => p.contractorId === where.contractorId && p.tenantId === where.tenantId);
      rows = [...rows].sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime());
      return rows.map(withCreatedBy);
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.payments.filter(
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
    contractors: structuredClone(store.contractors),
    contracts: structuredClone(store.contracts),
    statements: structuredClone(store.statements),
    payments: structuredClone(store.payments),
    allocations: structuredClone(store.allocations),
    movements: structuredClone(store.movements),
    seq: store.seq
  };
  try {
    return await callback(mockPrisma);
  } catch (error) {
    store.accounts = snapshot.accounts;
    store.contractors = snapshot.contractors;
    store.contracts = snapshot.contracts;
    store.statements = snapshot.statements;
    store.payments = snapshot.payments;
    store.allocations = snapshot.allocations;
    store.movements = snapshot.movements;
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
  createContractorContractTx,
  createContractorPaymentTx,
  createContractorTx,
  createProgressStatementTx,
  getContractorContract,
  listContractorContracts,
  listContractorPayments,
  listContractors,
  listProgressStatements,
  validateContractorPaymentTx,
  validateProgressStatementTx
} from '../../src/lib/finance/contractors';
// Coût réel d'un chantier — VRAI calcul, non mocké (voir l'en-tête du
// fichier) : c'est lui qui prouve que la validation d'une situation a bien
// fait monter le coût du chantier, pas une doublure qui l'affirmerait à sa
// place.
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
    label: 'Gros œuvre',
    isActive: true,
    ...overrides
  };
  store.categories.push(category);
  return category;
}

async function seedContractor(overrides: Partial<Row> = {}): Promise<Row> {
  return runTransaction((tx: any) =>
    createContractorTx(tx, TENANT_ID, {
      fullName: 'Sekou Diallo',
      trade: 'Maçon',
      ...overrides
    })
  );
}

async function seedContract(contractor: Row, site: Row, category: Row, overrides: Partial<Row> = {}): Promise<Row> {
  return runTransaction((tx: any) =>
    createContractorContractTx(tx, TENANT_ID, {
      contractorId: contractor.id,
      siteId: site.id,
      costCategoryId: category.id,
      reference: `MCH-${store.contracts.length + 1}`,
      agreedAmount: 1_000_000,
      signedDate: new Date('2026-01-05'),
      ...overrides
    })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  assertTreasuryCanPayTx.mockResolvedValue(undefined);
  store.accounts = [];
  store.contractors = [];
  store.sites = [];
  store.categories = [];
  store.contracts = [];
  store.statements = [];
  store.payments = [];
  store.allocations = [];
  store.movements = [];
  store.users = [
    { id: GESTIONNAIRE_ID, fullName: 'Fatoumata Camara', email: 'f.camara@example.gn' },
    { id: DIRIGEANT_ID, fullName: 'Ibrahima Sory', email: 'i.sory@example.gn' }
  ];
  store.seq = 0;
  COMPTES_PAR_POSTE.clear();

  postDocumentEntryTx.mockImplementation(async () => ({ entryId: nextId('ecriture'), totalDebit: 0, totalCredit: 0 }));
});

// ---------------------------------------------------------------------------
// A. Le tâcheron et son compte de tiers
// ---------------------------------------------------------------------------

describe('createContractorTx — enregistrement et compte de tiers', () => {
  it('ouvre un compte de tiers CONTRACTOR à solde nul', async () => {
    const contractor = await seedContractor({ fullName: 'Sekou Diallo', trade: 'Maçon' });

    expect(contractor.thirdPartyAccountId).toBeTruthy();
    expect(store.accounts).toHaveLength(1);
    expect(store.accounts[0].kind).toBe('CONTRACTOR');
    expect(contractor.accountBalance).toBe(0);
    expect(contractor.isActive).toBe(true);
    expect(contractor.trade).toBe('Maçon');
  });

  it('accepte un tâcheron sans corps de métier renseigné', async () => {
    const contractor = await seedContractor({ trade: null });
    expect(contractor.trade).toBeNull();
  });

  it('refuse un nom complet vide', async () => {
    await expect(seedContractor({ fullName: '   ' })).rejects.toThrow(/obligatoire/i);
  });
});

describe('listContractors', () => {
  it('liste les tâcherons avec leur solde', async () => {
    await seedContractor({ fullName: 'Alpha Bah' });
    await seedContractor({ fullName: 'Zainab Cissé' });

    const contractors = await listContractors(TENANT_ID, {});

    expect(contractors).toHaveLength(2);
    expect(contractors.every(c => c.accountBalance === 0)).toBe(true);
  });

  it('filtre les tâcherons actifs', async () => {
    const contractor = await seedContractor();
    store.contractors.find(c => c.id === contractor.id)!.isActive = false;

    const contractors = await listContractors(TENANT_ID, { onlyActive: true });

    expect(contractors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// B. Le marché
// ---------------------------------------------------------------------------

describe('createContractorContractTx — convention', () => {
  it('crée un marché neuf, sans situation validée : remainingAmount = agreedAmount, isOverrun faux', async () => {
    const contractor = await seedContractor();
    const site = seedSite();
    const category = seedCostCategory();

    const contract = await seedContract(contractor, site, category, { agreedAmount: 1_000_000 });

    expect(contract.statementedAmount).toBe(0);
    expect(contract.remainingAmount).toBe(1_000_000);
    expect(contract.isOverrun).toBe(false);
    expect(contract.contractorLabel).toBe(contractor.fullName);
    expect(contract.siteLabel).toBe(site.name);
    expect(contract.costCategoryLabel).toBe(category.label);
  });

  it('refuse un tâcheron introuvable', async () => {
    const site = seedSite();
    const category = seedCostCategory();
    await expect(
      runTransaction((tx: any) =>
        createContractorContractTx(tx, TENANT_ID, {
          contractorId: 'tacheron-inconnu',
          siteId: site.id,
          costCategoryId: category.id,
          reference: 'MCH-X',
          agreedAmount: 1_000_000,
          signedDate: new Date('2026-01-05')
        })
      )
    ).rejects.toThrow(/introuvable/i);
  });

  it('refuse un chantier introuvable', async () => {
    const contractor = await seedContractor();
    const category = seedCostCategory();
    await expect(
      runTransaction((tx: any) =>
        createContractorContractTx(tx, TENANT_ID, {
          contractorId: contractor.id,
          siteId: 'chantier-inconnu',
          costCategoryId: category.id,
          reference: 'MCH-X',
          agreedAmount: 1_000_000,
          signedDate: new Date('2026-01-05')
        })
      )
    ).rejects.toThrow(/chantier introuvable/i);
  });

  it('refuse un poste de dépense désactivé — un repli serait un choix invisible', async () => {
    const contractor = await seedContractor();
    const site = seedSite();
    const category = seedCostCategory({ isActive: false });
    await expect(seedContract(contractor, site, category)).rejects.toThrow(/désactivé/i);
  });

  it('refuse un montant convenu nul ou négatif', async () => {
    const contractor = await seedContractor();
    const site = seedSite();
    const category = seedCostCategory();
    await expect(seedContract(contractor, site, category, { agreedAmount: 0 })).rejects.toThrow(/positif/i);
  });

  it('refuse une seconde référence identique pour le même tenant (409), vérifiée AVANT toute écriture', async () => {
    const contractor = await seedContractor();
    const site = seedSite();
    const category = seedCostCategory();
    await seedContract(contractor, site, category, { reference: 'MCH-UNIQUE' });

    await expect(seedContract(contractor, site, category, { reference: 'MCH-UNIQUE' })).rejects.toThrow(
      /déjà cette référence/i
    );
    expect(store.contracts).toHaveLength(1);
  });
});

describe('listContractorContracts / getContractorContract', () => {
  it('filtre par contractorId et siteId', async () => {
    const contractorA = await seedContractor({ fullName: 'Alpha Bah' });
    const contractorB = await seedContractor({ fullName: 'Boubacar Sow' });
    const siteA = seedSite();
    const siteB = seedSite();
    const category = seedCostCategory();

    await seedContract(contractorA, siteA, category, { reference: 'MCH-A' });
    await seedContract(contractorB, siteB, category, { reference: 'MCH-B' });

    expect(await listContractorContracts(TENANT_ID, {})).toHaveLength(2);
    expect(await listContractorContracts(TENANT_ID, { contractorId: contractorA.id })).toHaveLength(1);
    expect(await listContractorContracts(TENANT_ID, { siteId: siteB.id })).toHaveLength(1);
  });

  it('résout contractorLabel/siteLabel/costCategoryLabel par une seule requête de lot, et le montant statué par lot', async () => {
    const contractor = await seedContractor({ fullName: 'Alpha Bah' });
    const site = seedSite({ name: 'Chantier de Kaloum' });
    const category = seedCostCategory({ label: 'Gros œuvre' });
    const contract = await seedContract(contractor, site, category, { reference: 'MCH-LOT', agreedAmount: 500_000 });

    const statement = await runTransaction((tx: any) =>
      createProgressStatementTx(tx, TENANT_ID, {
        contractId: contract.id,
        statementDate: new Date('2026-02-01'),
        amount: 200_000,
        description: 'Fondations coulées',
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    await runTransaction((tx: any) => validateProgressStatementTx(tx, TENANT_ID, statement.id, DIRIGEANT_ID));

    const [found] = await listContractorContracts(TENANT_ID, {});

    expect(found.contractorLabel).toBe('Alpha Bah');
    expect(found.siteLabel).toBe('Chantier de Kaloum');
    expect(found.costCategoryLabel).toBe('Gros œuvre');
    expect(found.statementedAmount).toBe(200_000);
    expect(found.remainingAmount).toBe(300_000);
  });

  it('refuse un marché introuvable', async () => {
    await expect(getContractorContract(TENANT_ID, 'marche-inconnu')).rejects.toThrow(/introuvable/i);
  });
});

// ---------------------------------------------------------------------------
// C. La situation d'avancement — brouillon
// ---------------------------------------------------------------------------

describe('createProgressStatementTx — brouillon', () => {
  async function seedReadyContract() {
    const contractor = await seedContractor();
    const site = seedSite();
    const category = seedCostCategory();
    return { contractor, site, category, contract: await seedContract(contractor, site, category) };
  }

  it("n'écrit ni écriture ni mouvement ni imputation", async () => {
    const { contract } = await seedReadyContract();

    const statement = await runTransaction((tx: any) =>
      createProgressStatementTx(tx, TENANT_ID, {
        contractId: contract.id,
        statementDate: new Date('2026-02-01'),
        amount: 300_000,
        description: 'Élévation des murs',
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    expect(statement.status).toBe('DRAFT');
    expect(statement.validatedAt).toBeNull();
    expect(statement.createdByLabel).toBe('Fatoumata Camara');
    expect(statement.contractReference).toBe(contract.reference);
    expect(statement.contractorLabel).toBe(contract.contractorLabel);
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
    expect(store.movements).toHaveLength(0);
    expect(store.allocations).toHaveLength(0);
  });

  it('refuse une description manquante — un chiffre sans justification', async () => {
    const { contract } = await seedReadyContract();
    await expect(
      runTransaction((tx: any) =>
        createProgressStatementTx(tx, TENANT_ID, {
          contractId: contract.id,
          statementDate: new Date('2026-02-01'),
          amount: 300_000,
          description: '   ',
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toThrow(/description/i);
  });

  it('refuse un montant nul ou négatif', async () => {
    const { contract } = await seedReadyContract();
    await expect(
      runTransaction((tx: any) =>
        createProgressStatementTx(tx, TENANT_ID, {
          contractId: contract.id,
          statementDate: new Date('2026-02-01'),
          amount: 0,
          description: 'Rien',
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toThrow(/positif/i);
  });

  it('refuse un marché introuvable', async () => {
    await expect(
      runTransaction((tx: any) =>
        createProgressStatementTx(tx, TENANT_ID, {
          contractId: 'marche-inconnu',
          statementDate: new Date('2026-02-01'),
          amount: 300_000,
          description: 'Élévation des murs',
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toThrow(/introuvable/i);
  });
});

// ---------------------------------------------------------------------------
// D. La situation d'avancement — validation
// ---------------------------------------------------------------------------

describe('validateProgressStatementTx — écriture, mouvement et imputation', () => {
  async function seedReadyContract(overrides: Partial<Row> = {}) {
    const contractor = await seedContractor();
    const site = seedSite();
    const category = seedCostCategory();
    const contract = await seedContract(contractor, site, category, overrides);
    return { contractor, site, category, contract };
  }

  async function statementAndValidate(contract: Row, amount: number, description = 'Situation') {
    const statement = await runTransaction((tx: any) =>
      createProgressStatementTx(tx, TENANT_ID, {
        contractId: contract.id,
        statementDate: new Date('2026-02-01T00:00:00.000Z'),
        amount,
        description,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    return runTransaction((tx: any) => validateProgressStatementTx(tx, TENANT_ID, statement.id, DIRIGEANT_ID));
  }

  it('débite le compte de charge du poste (repli 605), crédite les tacherons (402), et rend le tâcheron créancier', async () => {
    const { contractor, contract } = await seedReadyContract();

    const validated = await statementAndValidate(contract, 400_000);

    expect(validated.status).toBe('VALIDATED');
    expect(postDocumentEntryTx).toHaveBeenCalledTimes(1);
    const [, params] = postDocumentEntryTx.mock.calls[0];
    expect(params.documentType).toBe('PROGRESS_STATEMENT');
    expect(params.lines).toEqual([
      expect.objectContaining({ accountId: 'compte-605', debit: 400_000 }),
      expect.objectContaining({ accountId: 'compte-402', credit: 400_000 })
    ]);
    for (const line of params.lines) {
      expect(line.label.toLowerCase()).not.toMatch(/débit|crédit/);
    }
    expect(params.description.toLowerCase()).not.toMatch(/débit|crédit/);

    const account = store.accounts.find(a => a.id === contractor.thirdPartyAccountId)!;
    expect(account.balance).toBe(400_000);
  });

  it(
    'LE COMPTE DE CHARGE SUIT LE POSTE DU MARCHÉ : un poste qui porte son propre compte ' +
      'est frappé à sa place, jamais le 605 par défaut',
    async () => {
      const { category, contract } = await seedReadyContract();
      COMPTES_PAR_POSTE.set(category.id, 'compte-poste-gros-oeuvre');

      await statementAndValidate(contract, 250_000);

      const [, params] = postDocumentEntryTx.mock.calls[0];
      expect(params.lines).toEqual([
        expect.objectContaining({ accountId: 'compte-poste-gros-oeuvre', debit: 250_000 }),
        expect.objectContaining({ accountId: 'compte-402', credit: 250_000 })
      ]);
    }
  );

  it('refuse de valider une situation déjà validée (principe P-6)', async () => {
    const { contract } = await seedReadyContract();
    const statement = await runTransaction((tx: any) =>
      createProgressStatementTx(tx, TENANT_ID, {
        contractId: contract.id,
        statementDate: new Date('2026-02-01'),
        amount: 200_000,
        description: 'Situation',
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    await runTransaction((tx: any) => validateProgressStatementTx(tx, TENANT_ID, statement.id, DIRIGEANT_ID));

    await expect(
      runTransaction((tx: any) => validateProgressStatementTx(tx, TENANT_ID, statement.id, DIRIGEANT_ID))
    ).rejects.toThrow(/déjà été validée/i);
  });

  it('refuse une situation introuvable', async () => {
    await expect(
      runTransaction((tx: any) => validateProgressStatementTx(tx, TENANT_ID, 'situation-inconnue', DIRIGEANT_ID))
    ).rejects.toThrow(/introuvable/i);
  });

  it(
    'LE TEST LE PLUS IMPORTANT — LES DEUX SOLDES SONT DISTINCTS : un marché ENTIÈREMENT statué ' +
      '(remainingAmount = 0) mais non réglé laisse le tâcheron créancier (accountBalance > 0)',
    async () => {
      const { contractor, contract } = await seedReadyContract({ agreedAmount: 1_000_000 });

      await statementAndValidate(contract, 1_000_000);

      const relu = await getContractorContract(TENANT_ID, contract.id);
      expect(relu.remainingAmount).toBe(0);
      expect(relu.isOverrun).toBe(false);

      const account = store.accounts.find(a => a.id === contractor.thirdPartyAccountId)!;
      expect(account.balance).toBe(1_000_000); // créancier : on lui doit tout, rien n'a été réglé
    }
  );

  it(
    'SYMÉTRIQUE : un tâcheron qui a reçu un acompte sans avoir rien fait est débiteur, ' +
      'le marché lui-même reste intact (remainingAmount = agreedAmount)',
    async () => {
      const { contractor, contract } = await seedReadyContract({ agreedAmount: 1_000_000 });

      const payment = await runTransaction((tx: any) =>
        createContractorPaymentTx(tx, TENANT_ID, {
          contractorId: contractor.id,
          paymentDate: new Date('2026-01-10'),
          amount: 300_000,
          createdByUserId: GESTIONNAIRE_ID
        })
      );
      await runTransaction((tx: any) => validateContractorPaymentTx(tx, TENANT_ID, payment.id, DIRIGEANT_ID));

      const account = store.accounts.find(a => a.id === contractor.thirdPartyAccountId)!;
      expect(account.balance).toBe(-300_000); // débiteur : il nous doit l'acompte

      const relu = await getContractorContract(TENANT_ID, contract.id);
      expect(relu.statementedAmount).toBe(0);
      expect(relu.remainingAmount).toBe(1_000_000); // le marché n'a pas bougé
    }
  );

  it(
    'UN DÉPASSEMENT DE MARCHÉ EST ACCEPTÉ, PAS REFUSÉ : 1 200 000 de situations sur un marché de ' +
      '1 000 000 donnent remainingAmount = -200 000 et isOverrun vrai',
    async () => {
      const { contract } = await seedReadyContract({ agreedAmount: 1_000_000 });

      await statementAndValidate(contract, 700_000, 'Première tranche');
      const statement2 = await runTransaction((tx: any) =>
        createProgressStatementTx(tx, TENANT_ID, {
          contractId: contract.id,
          statementDate: new Date('2026-03-01'),
          amount: 500_000,
          description: 'Seconde tranche',
          createdByUserId: GESTIONNAIRE_ID
        })
      );
      // Ne lève AUCUNE exception malgré le dépassement.
      await runTransaction((tx: any) => validateProgressStatementTx(tx, TENANT_ID, statement2.id, DIRIGEANT_ID));

      const relu = await getContractorContract(TENANT_ID, contract.id);
      expect(relu.statementedAmount).toBe(1_200_000);
      expect(relu.remainingAmount).toBe(-200_000);
      expect(relu.isOverrun).toBe(true);
    }
  );

  it(
    'LA VALIDATION FAIT MONTER LE COÛT RÉEL DU CHANTIER : une VRAIE CostAllocation ' +
      '(PROGRESS_STATEMENT, poste du marché, validée, non annulée) fait monter sumSiteActualCost, ' +
      'et resynchronise le programme de travaux',
    async () => {
      const { site, category, contract } = await seedReadyContract();

      const coutAvant = await sumSiteActualCost(mockPrisma as any, TENANT_ID, site.id);
      expect(coutAvant).toBe(0);

      const validated = await statementAndValidate(contract, 350_000);

      const coutApres = await sumSiteActualCost(mockPrisma as any, TENANT_ID, site.id);
      expect(coutApres).toBe(coutAvant + 350_000);
      expect(coutApres).toBe(350_000);

      expect(store.allocations).toHaveLength(1);
      expect(store.allocations[0]).toMatchObject({
        tenantId: TENANT_ID,
        siteId: site.id,
        costCategoryId: category.id,
        sourceType: 'PROGRESS_STATEMENT',
        sourceId: validated.id,
        amount: 350_000
      });
      expect(store.allocations[0].validatedAt).not.toBeNull();
      expect(store.allocations[0].voidedAt).toBeNull();

      expect(syncWorkProgramCostTx).toHaveBeenCalledWith(expect.anything(), TENANT_ID, site.id);
    }
  );
});

// ---------------------------------------------------------------------------
// E. Situations — liste d'un marché
// ---------------------------------------------------------------------------

describe('listProgressStatements', () => {
  it('liste les situations d’un marché, triées par date décroissante', async () => {
    const contractor = await seedContractor();
    const site = seedSite();
    const category = seedCostCategory();
    const contract = await seedContract(contractor, site, category);

    await runTransaction((tx: any) =>
      createProgressStatementTx(tx, TENANT_ID, {
        contractId: contract.id,
        statementDate: new Date('2026-02-01'),
        amount: 100_000,
        description: 'Première',
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    await runTransaction((tx: any) =>
      createProgressStatementTx(tx, TENANT_ID, {
        contractId: contract.id,
        statementDate: new Date('2026-03-01'),
        amount: 100_000,
        description: 'Seconde',
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    const statements = await listProgressStatements(TENANT_ID, contract.id);

    expect(statements).toHaveLength(2);
    expect(statements[0].description).toBe('Seconde');
  });

  it('refuse un marché introuvable', async () => {
    await expect(listProgressStatements(TENANT_ID, 'marche-inconnu')).rejects.toThrow(/introuvable/i);
  });
});

// ---------------------------------------------------------------------------
// F/G. Le règlement — brouillon puis validation
// ---------------------------------------------------------------------------

describe('createContractorPaymentTx — brouillon', () => {
  it("n'écrit ni écriture ni mouvement", async () => {
    const contractor = await seedContractor();

    const payment = await runTransaction((tx: any) =>
      createContractorPaymentTx(tx, TENANT_ID, {
        contractorId: contractor.id,
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
    const contractor = await seedContractor();
    await expect(
      runTransaction((tx: any) =>
        createContractorPaymentTx(tx, TENANT_ID, {
          contractorId: contractor.id,
          paymentDate: new Date('2026-03-05'),
          amount: -1,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toThrow(/positif/i);
  });

  it('refuse un tâcheron introuvable', async () => {
    await expect(
      runTransaction((tx: any) =>
        createContractorPaymentTx(tx, TENANT_ID, {
          contractorId: 'tacheron-inconnu',
          paymentDate: new Date('2026-03-05'),
          amount: 300_000,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toThrow(/introuvable/i);
  });
});

describe('validateContractorPaymentTx — écriture et mouvement', () => {
  it('débite les tacherons (402), crédite la caisse (571), et diminue le solde du tâcheron', async () => {
    const contractor = await seedContractor();
    const site = seedSite();
    const category = seedCostCategory();
    const contract = await seedContract(contractor, site, category, { agreedAmount: 500_000 });
    const statement = await runTransaction((tx: any) =>
      createProgressStatementTx(tx, TENANT_ID, {
        contractId: contract.id,
        statementDate: new Date('2026-02-01'),
        amount: 500_000,
        description: 'Situation unique',
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    await runTransaction((tx: any) => validateProgressStatementTx(tx, TENANT_ID, statement.id, DIRIGEANT_ID));

    const payment = await runTransaction((tx: any) =>
      createContractorPaymentTx(tx, TENANT_ID, {
        contractorId: contractor.id,
        paymentDate: new Date('2026-03-05T00:00:00.000Z'),
        amount: 500_000,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    const validated = await runTransaction((tx: any) =>
      validateContractorPaymentTx(tx, TENANT_ID, payment.id, DIRIGEANT_ID)
    );

    expect(validated.status).toBe('VALIDATED');
    expect(postDocumentEntryTx).toHaveBeenCalledTimes(2); // situation + règlement
    const [, params] = postDocumentEntryTx.mock.calls[1];
    expect(params.documentType).toBe('CONTRACTOR_PAYMENT');
    expect(params.lines).toEqual([
      expect.objectContaining({ accountId: 'compte-402', debit: 500_000 }),
      expect.objectContaining({ accountId: 'compte-571', credit: 500_000 })
    ]);
    for (const line of params.lines) {
      expect(line.label.toLowerCase()).not.toMatch(/débit|crédit/);
    }

    const account = store.accounts.find(a => a.id === contractor.thirdPartyAccountId)!;
    expect(account.balance).toBe(0);
  });

  it('UN RÈGLEMENT SUPÉRIEUR AU SOLDE EST ACCEPTÉ (acompte) : le compte devient débiteur', async () => {
    const contractor = await seedContractor();
    expect(store.accounts.find(a => a.id === contractor.thirdPartyAccountId)!.balance).toBe(0);

    const payment = await runTransaction((tx: any) =>
      createContractorPaymentTx(tx, TENANT_ID, {
        contractorId: contractor.id,
        paymentDate: new Date('2026-01-10'),
        amount: 200_000,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    const validated = await runTransaction((tx: any) =>
      validateContractorPaymentTx(tx, TENANT_ID, payment.id, DIRIGEANT_ID)
    );

    expect(validated.status).toBe('VALIDATED');
    const account = store.accounts.find(a => a.id === contractor.thirdPartyAccountId)!;
    expect(account.balance).toBe(-200_000);
  });

  it('refuse de valider un règlement déjà validé (principe P-6)', async () => {
    const contractor = await seedContractor();
    const payment = await runTransaction((tx: any) =>
      createContractorPaymentTx(tx, TENANT_ID, {
        contractorId: contractor.id,
        paymentDate: new Date('2026-03-05'),
        amount: 300_000,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    await runTransaction((tx: any) => validateContractorPaymentTx(tx, TENANT_ID, payment.id, DIRIGEANT_ID));

    await expect(
      runTransaction((tx: any) => validateContractorPaymentTx(tx, TENANT_ID, payment.id, DIRIGEANT_ID))
    ).rejects.toThrow(/déjà été validé/i);
  });

  it('refuse un règlement introuvable', async () => {
    await expect(
      runTransaction((tx: any) => validateContractorPaymentTx(tx, TENANT_ID, 'reglement-inconnu', DIRIGEANT_ID))
    ).rejects.toThrow(/introuvable/i);
  });
});

// ---------------------------------------------------------------------------
// H. Règlements — liste
// ---------------------------------------------------------------------------

describe('listContractorPayments', () => {
  it('liste les règlements d’un tâcheron, triés par date décroissante', async () => {
    const contractor = await seedContractor();
    await runTransaction((tx: any) =>
      createContractorPaymentTx(tx, TENANT_ID, {
        contractorId: contractor.id,
        paymentDate: new Date('2026-03-05'),
        amount: 100_000,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    await runTransaction((tx: any) =>
      createContractorPaymentTx(tx, TENANT_ID, {
        contractorId: contractor.id,
        paymentDate: new Date('2026-04-05'),
        amount: 100_000,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    const payments = await listContractorPayments(TENANT_ID, contractor.id);

    expect(payments).toHaveLength(2);
    expect(payments[0].paymentDate.getUTCMonth()).toBe(3); // avril, le plus récent d'abord
  });

  it('refuse un tâcheron introuvable', async () => {
    await expect(listContractorPayments(TENANT_ID, 'tacheron-inconnu')).rejects.toThrow(/introuvable/i);
  });
});

// ---------------------------------------------------------------------------
// Controle de solde et compte payeur (BUG-2026-09-29-032)
// ---------------------------------------------------------------------------

describe('validateContractorPaymentTx — compte payeur et controle de solde (BUG-2026-09-29-032)', () => {
  async function brouillon(montant = 400_000) {
    const owner = await seedContractor();
    return {
      owner,
      payment: await runTransaction((tx: any) =>
        createContractorPaymentTx(tx, TENANT_ID, {
          contractorId: owner.id,
          paymentDate: new Date('2026-03-05T00:00:00.000Z'),
          amount: montant,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    };
  }
  const compteDe = (o: any): string => o.thirdPartyAccountId ?? o.landlordAccountId;
  const valider = (id: string, payer?: any) =>
    runTransaction((tx: any) => validateContractorPaymentTx(tx, TENANT_ID, id, DIRIGEANT_ID, payer));

  it('controle le solde de la caisse par defaut avant d ecrire, pour le montant du reglement', async () => {
    const { payment } = await brouillon(400_000);
    await valider(payment.id);
    expect(assertTreasuryCanPayTx).toHaveBeenCalledTimes(1);
    expect(assertTreasuryCanPayTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({ chartOfAccountId: 'compte-571' }),
      400_000
    );
    const lignes = postDocumentEntryTx.mock.calls.at(-1)![1].lines;
    expect(lignes.find((l: any) => l.credit)!.accountId).toBe('compte-571');
  });

  it('REFUSE (400) un solde insuffisant : aucune ecriture, aucun mouvement, la piece reste en brouillon', async () => {
    const { owner, payment } = await brouillon(400_000);
    assertTreasuryCanPayTx.mockRejectedValueOnce(
      Object.assign(new Error('Solde insuffisant sur « Caisse »'), { status: 400 })
    );
    const mouvementsAvant = store.movements.length;
    const soldeAvant = store.accounts.find(a => a.id === compteDe(owner))?.balance;

    await expect(valider(payment.id)).rejects.toMatchObject({ status: 400 });

    expect(postDocumentEntryTx).not.toHaveBeenCalled();
    expect(store.movements).toHaveLength(mouvementsAvant);
    expect(store.accounts.find(a => a.id === compteDe(owner))?.balance).toBe(soldeAvant);
    expect(store.payments.find(p => p.id === payment.id)!.status).toBe('DRAFT');
  });

  it('sort de la banque pour un virement, et du compte CHOISI quand il y en a un', async () => {
    const a = await brouillon(150_000);
    await valider(a.payment.id, { method: 'BANK_TRANSFER' });
    expect(postDocumentEntryTx.mock.calls.at(-1)![1].lines.find((l: any) => l.credit)!.accountId).toBe('compte-banque');
    expect(assertTreasuryCanPayTx).toHaveBeenLastCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({ treasuryAccountId: 'tresorerie-banque' }),
      150_000
    );

    const b = await brouillon(90_000);
    await valider(b.payment.id, { method: 'CHECK', treasuryAccountId: 'tresorerie-banque' });
    expect(postDocumentEntryTx.mock.calls.at(-1)![1].lines.find((l: any) => l.credit)!.accountId).toBe('compte-banque');
  });
});
