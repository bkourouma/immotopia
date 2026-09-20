/**
 * Tests de la retenue de garantie (`lib/finance/retentions.ts`) — lot 4,
 * cinquième sous-lot.
 *
 * Modèle : `__tests__/unit/finance.salaries.test.ts` (sous-lot 3).
 *
 * ---------------------------------------------------------------------------
 * Ce qui est simulé, et ce qui ne l'est surtout pas
 * ---------------------------------------------------------------------------
 *
 * SIMULÉS : `postDocumentEntryTx` et les deux amorçages d'`accounting.ts` — ce
 * fichier ne teste pas comment une écriture s'équilibre, seulement comment
 * `retentions.ts` l'appelle (comptes, sens, montants, natures) ;
 * `syncWorkProgramCostTx` et `raiseBudgetAlertIfNeededTx`, appelés par la
 * validation de facture du lot 2 et étrangers au sujet.
 *
 * PAS SIMULÉS, et c'est le cœur du fichier :
 *
 *   - `sumSiteActualCost` (`site-cost.ts`), la VRAIE définition du coût réel
 *     d'un chantier. C'est elle qui doit prouver que poser une retenue ne fait
 *     pas baisser ce coût d'un franc. Une doublure aurait surtout prouvé que
 *     la doublure est juste.
 *   - `appendThirdPartyMovementTx` (`ledger.ts`), le VRAI calcul de solde de
 *     compte de tiers. C'est lui qui doit montrer le solde descendre à la pose
 *     et remonter exactement à la libération.
 *   - `createSupplierInvoiceTx` / `validateSupplierInvoiceTx` (`suppliers.ts`,
 *     lot 2). La facture sur laquelle on retient est une VRAIE facture validée
 *     par le vrai chemin du lot 2, avec sa vraie imputation validée — pas une
 *     ligne posée à la main dans le magasin, qui aurait pu ne ressembler que de
 *     loin à ce que le lot 2 écrit réellement.
 */

const postDocumentEntryTx = jest.fn();

const COMPTES_OPERATIONNELS = new Map<string, string>([
  ['401', 'compte-401'],
  ['402', 'compte-402'],
  ['4047', 'compte-4047'],
  ['601', 'compte-601'],
  ['571', 'compte-571']
]);

jest.mock('../../src/lib/finance/accounting', () => ({
  postDocumentEntryTx: (...args: any[]) => postDocumentEntryTx(...args),
  ensureOperationalJournalTx: async () => 'journal-operationnel',
  ensureOperationalChartOfAccountsTx: async () => COMPTES_OPERATIONNELS,
  resolveExpenseAccountsByCostCategoryTx: async () => new Map<string, string>()
}));

const syncWorkProgramCostTx = jest.fn();
jest.mock('../../src/lib/finance/cost-allocation', () => ({
  syncWorkProgramCostTx: (...args: any[]) => syncWorkProgramCostTx(...args)
}));

const raiseBudgetAlertIfNeededTx = jest.fn();
jest.mock('../../src/lib/finance/budget-alerts', () => ({
  raiseBudgetAlertIfNeededTx: (...args: any[]) => raiseBudgetAlertIfNeededTx(...args)
}));

// ---------------------------------------------------------------------------
// Magasin en mémoire
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

const store = {
  accounts: [] as Row[],
  movements: [] as Row[],
  suppliers: [] as Row[],
  invoices: [] as Row[],
  invoiceLines: [] as Row[],
  paymentAllocations: [] as Row[],
  payments: [] as Row[],
  voidDocuments: [] as Row[],
  contractors: [] as Row[],
  contracts: [] as Row[],
  statements: [] as Row[],
  sites: [] as Row[],
  allocations: [] as Row[],
  retentions: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function num(value: any): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function matchesDateFilter(value: Date, filter: any): boolean {
  if (!filter) return true;
  if (filter.lt !== undefined && !(value.getTime() < new Date(filter.lt).getTime())) return false;
  if (filter.gte !== undefined && !(value.getTime() >= new Date(filter.gte).getTime())) return false;
  return true;
}

function withThirdPartyAccount(row: Row): Row {
  return { ...row, thirdPartyAccount: store.accounts.find(a => a.id === row.thirdPartyAccountId) ?? null };
}

function withContract(row: Row): Row {
  const contract = store.contracts.find(c => c.id === row.contractId) ?? null;
  if (!contract) return { ...row, contract: null };
  return {
    ...row,
    contract: {
      ...contract,
      contractor: store.contractors.find(t => t.id === contract.contractorId) ?? null,
      site: store.sites.find(s => s.id === contract.siteId) ?? null
    }
  };
}

const mockPrisma: Row = {
  thirdPartyAccount: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('compte-tiers'), balance: 0, currency: 'XOF', ...data };
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
  },

  supplier: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.suppliers.find(s => s.id === where.id && s.tenantId === where.tenantId) ?? null
    )
  },

  supplierInvoice: {
    create: jest.fn(async ({ data }: Row) => {
      const created = {
        id: nextId('facture'),
        status: 'DRAFT',
        journalEntryId: null,
        validatedAt: null,
        validatedByUserId: null,
        createdAt: new Date(),
        currency: 'XOF',
        ...data,
        siteId: data.siteId ?? null
      };
      store.invoices.push(created);
      return created;
    }),
    findFirst: jest.fn(async ({ where, include }: Row) => {
      const row = store.invoices.find(i => i.id === where.id && i.tenantId === where.tenantId);
      if (!row) return null;
      if (!include) return row;
      return {
        ...row,
        supplier: store.suppliers.find(s => s.id === row.supplierId) ?? null,
        site: row.siteId ? (store.sites.find(s => s.id === row.siteId) ?? null) : null
      };
    }),
    findMany: jest.fn(async ({ where }: Row) => {
      const ids: string[] = where.id?.in ?? [];
      return store.invoices.filter(i => i.tenantId === where.tenantId && ids.includes(i.id));
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.invoices.find(i => i.id === where.id)!;
      Object.assign(row, data);
      return row;
    })
  },

  supplierInvoiceLine: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('ligne'), ...data };
      store.invoiceLines.push(created);
      return created;
    })
  },

  supplierPaymentAllocation: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('affectation'), ...data };
      store.paymentAllocations.push(created);
      return created;
    }),
    findFirst: jest.fn(
      async ({ where }: Row) => store.paymentAllocations.find(a => a.invoiceId === where.invoiceId) ?? null
    ),
    // Ajoute le 20 septembre 2026, avec le correctif d'ANO-17 : le domaine ne
    // demande plus « un reglement touche-t-il cette facture ? » mais « combien
    // reste-t-il a payer ? ». La doublure HONORE le filtre sur le reglement —
    // `payment: { validatedAt: { not: null } }` — plutot que de rendre toutes
    // les affectations : un brouillon n'a rien paye, et une doublure qui
    // l'ignorerait ferait passer un test que la production echouerait.
    findMany: jest.fn(async ({ where }: Row) => {
      const exigeReglementValide = where?.payment?.validatedAt?.not === null;
      return store.paymentAllocations.filter(a => {
        if (a.invoiceId !== where.invoiceId) return false;
        if (!exigeReglementValide) return true;
        const reglement = store.payments.find(p => p.id === a.paymentId);
        return Boolean(reglement?.validatedAt);
      });
    })
  },

  voidDocument: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.voidDocuments.filter(
        v =>
          v.tenantId === where.tenantId &&
          v.documentType === where.documentType &&
          (where.documentId?.in ? where.documentId.in.includes(v.documentId) : true)
      )
    )
  },

  progressStatement: {
    findFirst: jest.fn(async ({ where, include }: Row) => {
      const row = store.statements.find(s => s.id === where.id && s.tenantId === where.tenantId);
      if (!row) return null;
      return include ? withContract(row) : row;
    }),
    findMany: jest.fn(async ({ where }: Row) => {
      const ids: string[] = where.id?.in ?? [];
      return store.statements.filter(s => s.tenantId === where.tenantId && ids.includes(s.id)).map(withContract);
    })
  },

  constructionSite: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.sites.find(s => s.id === where.id && s.tenantId === where.tenantId) ?? null
    ),
    findMany: jest.fn(async ({ where }: Row) => {
      const ids: string[] = where.id?.in ?? [];
      return store.sites.filter(s => s.tenantId === where.tenantId && ids.includes(s.id));
    })
  },

  costAllocation: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('imputation'), validatedAt: null, voidedAt: null, createdAt: new Date(), ...data };
      store.allocations.push(created);
      return created;
    }),
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = store.allocations.filter(a => a.tenantId === where.tenantId);
      if (where.sourceType) rows = rows.filter(a => a.sourceType === where.sourceType);
      if (where.sourceId) rows = rows.filter(a => a.sourceId === where.sourceId);
      if (where.siteId) rows = rows.filter(a => a.siteId === where.siteId);
      if (where.voidedAt === null) rows = rows.filter(a => a.voidedAt === null);
      if (where.validatedAt === null) rows = rows.filter(a => a.validatedAt === null);
      if (where.validatedAt?.not === null) rows = rows.filter(a => a.validatedAt !== null);
      return [...rows];
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      let rows = store.allocations.filter(a => a.tenantId === where.tenantId);
      if (where.sourceType) rows = rows.filter(a => a.sourceType === where.sourceType);
      if (where.sourceId) rows = rows.filter(a => a.sourceId === where.sourceId);
      if (where.validatedAt === null) rows = rows.filter(a => a.validatedAt === null);
      if (where.voidedAt === null) rows = rows.filter(a => a.voidedAt === null);
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    }),
    aggregate: jest.fn(async ({ where }: Row) => {
      let rows = store.allocations.filter(a => a.tenantId === where.tenantId && a.siteId === where.siteId);
      if (where.validatedAt?.not === null) rows = rows.filter(a => a.validatedAt !== null);
      if (where.voidedAt === null) rows = rows.filter(a => a.voidedAt === null);
      const sum = rows.reduce((total, row) => total + num(row.amount), 0);
      return { _sum: { amount: rows.length ? sum : null } };
    })
  },

  retentionGuarantee: {
    create: jest.fn(async ({ data }: Row) => {
      const created = {
        id: nextId('retenue'),
        heldJournalEntryId: null,
        releasedJournalEntryId: null,
        releasedAt: null,
        releasedByUserId: null,
        createdAt: new Date(),
        ...data
      };
      store.retentions.push(created);
      return created;
    }),
    findFirst: jest.fn(async ({ where, include }: Row) => {
      const row = store.retentions.find(
        r =>
          r.tenantId === where.tenantId &&
          (where.id === undefined || r.id === where.id) &&
          (where.sourceType === undefined || r.sourceType === where.sourceType) &&
          (where.sourceId === undefined || r.sourceId === where.sourceId)
      );
      if (!row) return null;
      return include?.thirdPartyAccount ? withThirdPartyAccount(row) : row;
    }),
    findMany: jest.fn(async ({ where, include }: Row) => {
      let rows = store.retentions.filter(r => r.tenantId === where.tenantId);
      if (where.status) rows = rows.filter(r => r.status === where.status);
      if (where.siteId) rows = rows.filter(r => r.siteId === where.siteId);
      if (where.thirdPartyAccountId) rows = rows.filter(r => r.thirdPartyAccountId === where.thirdPartyAccountId);
      if (where.plannedReleaseDate) {
        rows = rows.filter(r => matchesDateFilter(new Date(r.plannedReleaseDate), where.plannedReleaseDate));
      }
      rows = [...rows].sort(
        (a, b) =>
          new Date(a.plannedReleaseDate).getTime() - new Date(b.plannedReleaseDate).getTime() ||
          a.createdAt.getTime() - b.createdAt.getTime()
      );
      return include?.thirdPartyAccount ? rows.map(withThirdPartyAccount) : rows;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.retentions.find(r => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.retentions.filter(
        r =>
          r.id === where.id &&
          r.tenantId === where.tenantId &&
          (where.status === undefined || r.status === where.status)
      );
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    }),
    aggregate: jest.fn(async ({ where }: Row) => {
      let rows = store.retentions.filter(r => r.tenantId === where.tenantId);
      if (where.siteId) rows = rows.filter(r => r.siteId === where.siteId);
      if (where.status) rows = rows.filter(r => r.status === where.status);
      if (where.plannedReleaseDate) {
        rows = rows.filter(r => matchesDateFilter(new Date(r.plannedReleaseDate), where.plannedReleaseDate));
      }
      const sum = rows.reduce((total, row) => total + num(row.amount), 0);
      return { _sum: { amount: rows.length ? sum : null }, _count: { _all: rows.length } };
    })
  }
};

/** Rollback par copie profonde en cas d'erreur — même esprit qu'aux sous-lots précédents. */
async function runTransaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
  const snapshot = structuredClone({
    accounts: store.accounts,
    movements: store.movements,
    invoices: store.invoices,
    invoiceLines: store.invoiceLines,
    paymentAllocations: store.paymentAllocations,
    payments: store.payments,
    voidDocuments: store.voidDocuments,
    statements: store.statements,
    allocations: store.allocations,
    retentions: store.retentions
  });
  const seq = store.seq;
  try {
    return await callback(mockPrisma);
  } catch (error) {
    store.accounts = snapshot.accounts;
    store.movements = snapshot.movements;
    store.invoices = snapshot.invoices;
    store.invoiceLines = snapshot.invoiceLines;
    store.paymentAllocations = snapshot.paymentAllocations;
    store.payments = snapshot.payments;
    store.voidDocuments = snapshot.voidDocuments;
    store.statements = snapshot.statements;
    store.allocations = snapshot.allocations;
    store.retentions = snapshot.retentions;
    store.seq = seq;
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
  createRetentionTx,
  getRetention,
  getRetentionSummary,
  listRetentions,
  releaseRetentionTx
} from '../../src/lib/finance/retentions';
// VRAIS calculs, non simulés — voir l'en-tête du fichier.
import { sumSiteActualCost } from '../../src/lib/finance/site-cost';
import { createSupplierInvoiceTx, validateSupplierInvoiceTx } from '../../src/lib/finance/suppliers';

const TENANT_ID = 'tenant-1';
const AUTRE_TENANT = 'tenant-2';
const GESTIONNAIRE_ID = 'user-gestionnaire';
const DIRIGEANT_ID = 'user-dirigeant';

// ---------------------------------------------------------------------------
// Semences
// ---------------------------------------------------------------------------

function seedAccount(label: string, kind: string): Row {
  const account = { id: nextId('compte-tiers'), tenantId: TENANT_ID, kind, label, balance: 0, currency: 'XOF' };
  store.accounts.push(account);
  return account;
}

function seedSite(name = 'Résidence Kipé'): Row {
  const site = { id: nextId('chantier'), tenantId: TENANT_ID, name };
  store.sites.push(site);
  return site;
}

function seedCategory(): string {
  return nextId('poste');
}

function seedSupplier(name = 'Ciments de Guinée', kind = 'MATERIALS'): Row {
  const account = seedAccount(name, 'SUPPLIER');
  const supplier = {
    id: nextId('fournisseur'),
    tenantId: TENANT_ID,
    name,
    kind,
    thirdPartyAccountId: account.id,
    isActive: true
  };
  store.suppliers.push(supplier);
  return supplier;
}

/**
 * Une VRAIE facture de chantier, saisie puis validée par le chemin du lot 2 :
 * écriture, mouvement de compte fournisseur, imputation validée.
 */
async function seedValidatedInvoice(options: {
  supplier: Row;
  site: Row;
  amount: number;
  reference?: string;
  invoiceDate?: Date;
}): Promise<Row> {
  const categoryId = seedCategory();
  const invoiceDate = options.invoiceDate ?? new Date(Date.UTC(2026, 2, 10));
  const created = await runTransaction(tx =>
    createSupplierInvoiceTx(tx, TENANT_ID, {
      supplierId: options.supplier.id,
      invoiceDate,
      reference: options.reference ?? `F-${nextId('ref')}`,
      lines: [{ label: 'Ciment', amount: options.amount }],
      allocations: [{ siteId: options.site.id, costCategoryId: categoryId, amount: options.amount }],
      createdByUserId: GESTIONNAIRE_ID
    })
  );
  await runTransaction(tx => validateSupplierInvoiceTx(tx, TENANT_ID, created.id, DIRIGEANT_ID));
  return store.invoices.find(i => i.id === created.id)!;
}

/** Une facture laissée en brouillon : rien n'a été constaté. */
async function seedDraftInvoice(supplier: Row, site: Row, amount: number): Promise<Row> {
  const created = await runTransaction(tx =>
    createSupplierInvoiceTx(tx, TENANT_ID, {
      supplierId: supplier.id,
      invoiceDate: new Date(Date.UTC(2026, 2, 10)),
      reference: `F-BROUILLON-${nextId('ref')}`,
      lines: [{ label: 'Ciment', amount }],
      allocations: [{ siteId: site.id, costCategoryId: seedCategory(), amount }],
      createdByUserId: GESTIONNAIRE_ID
    })
  );
  return store.invoices.find(i => i.id === created.id)!;
}

function seedValidatedStatement(options: { site: Row; amount: number; contractorName?: string }): Row {
  const contractorName = options.contractorName ?? 'Mamadou Bah';
  const account = seedAccount(contractorName, 'CONTRACTOR');
  const contractor = {
    id: nextId('tacheron'),
    tenantId: TENANT_ID,
    fullName: contractorName,
    thirdPartyAccountId: account.id
  };
  store.contractors.push(contractor);

  const contract = {
    id: nextId('marche'),
    tenantId: TENANT_ID,
    contractorId: contractor.id,
    siteId: options.site.id,
    reference: 'MAÇ-07',
    agreedAmount: 20_000_000
  };
  store.contracts.push(contract);

  const statement = {
    id: nextId('situation'),
    tenantId: TENANT_ID,
    contractId: contract.id,
    statementDate: new Date(Date.UTC(2026, 2, 15)),
    amount: options.amount,
    currency: 'XOF',
    description: 'Élévation R+1',
    status: 'VALIDATED'
  };
  store.statements.push(statement);
  return statement;
}

function soldeDuTiers(accountId: string): number {
  return num(store.accounts.find(a => a.id === accountId)!.balance);
}

function ecritures(): Row[] {
  return postDocumentEntryTx.mock.calls.map(call => call[1]);
}

function derniereEcriture(): Row {
  const toutes = ecritures();
  return toutes[toutes.length - 1];
}

const DANS_UN_AN = new Date(Date.UTC(2027, 2, 10));
const HIER = new Date(Date.now() - 24 * 3600 * 1000);

beforeEach(() => {
  jest.clearAllMocks();
  store.accounts = [];
  store.movements = [];
  store.suppliers = [];
  store.invoices = [];
  store.invoiceLines = [];
  store.paymentAllocations = [];
  store.payments = [];
  store.voidDocuments = [];
  store.contractors = [];
  store.contracts = [];
  store.statements = [];
  store.sites = [];
  store.allocations = [];
  store.retentions = [];
  store.seq = 0;

  let compteur = 0;
  postDocumentEntryTx.mockImplementation(async (_tx: any, params: any) => {
    compteur += 1;
    const totalDebit = params.lines.reduce((s: number, l: any) => s + (l.debit ?? 0), 0);
    const totalCredit = params.lines.reduce((s: number, l: any) => s + (l.credit ?? 0), 0);
    return { entryId: `ecriture-${compteur}`, totalDebit, totalCredit };
  });
});

// ===========================================================================
// A. LE CRITÈRE LE PLUS IMPORTANT DU SOUS-LOT
// ===========================================================================

describe('la retenue ne diminue jamais le coût du chantier', () => {
  it('laisse le coût réel rigoureusement identique, à la pose comme à la libération', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const invoice = await seedValidatedInvoice({ supplier, site, amount: 10_000_000 });

    // Le coût réel lu par la VRAIE fonction de `site-cost.ts`, avant tout.
    const coutAvant = await sumSiteActualCost(mockPrisma as any, TENANT_ID, site.id);
    expect(coutAvant).toBe(10_000_000);

    const imputationsAvant = structuredClone(store.allocations);
    // Les compteurs repartent de zéro APRÈS la facture : ce qui est mesuré
    // ici, ce sont les écritures d'imputation de la RETENUE, pas celles,
    // légitimes, de la facture qui vient d'être validée.
    mockPrisma.costAllocation.create.mockClear();
    mockPrisma.costAllocation.updateMany.mockClear();

    const retention = await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: invoice.id,
        ratePercent: 5,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    const coutApresPose = await sumSiteActualCost(mockPrisma as any, TENANT_ID, site.id);
    expect(coutApresPose).toBe(coutAvant);

    await runTransaction(tx => releaseRetentionTx(tx, TENANT_ID, retention.id, DIRIGEANT_ID));

    const coutApresLiberation = await sumSiteActualCost(mockPrisma as any, TENANT_ID, site.id);
    expect(coutApresLiberation).toBe(coutAvant);

    // Et pas seulement la somme : AUCUNE imputation n'a été créée, modifiée ni
    // annulée. Une somme inchangée pourrait masquer deux écritures qui se
    // compensent.
    expect(store.allocations).toEqual(imputationsAvant);
    expect(mockPrisma.costAllocation.create).not.toHaveBeenCalled();
    expect(mockPrisma.costAllocation.updateMany).not.toHaveBeenCalled();
  });

  it('laisse aussi intact le coût d’un chantier dont la retenue vient d’une situation', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    await seedValidatedInvoice({ supplier, site, amount: 4_000_000 });
    const statement = seedValidatedStatement({ site, amount: 8_000_000 });

    const coutAvant = await sumSiteActualCost(mockPrisma as any, TENANT_ID, site.id);

    await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'PROGRESS_STATEMENT',
        sourceId: statement.id,
        ratePercent: 10,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    expect(await sumSiteActualCost(mockPrisma as any, TENANT_ID, site.id)).toBe(coutAvant);
  });
});

// ===========================================================================
// B. Le reclassement : écriture et compte de tiers
// ===========================================================================

describe('createRetentionTx — le reclassement', () => {
  it('dérive le montant du taux, ne l’accepte jamais en entrée', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const invoice = await seedValidatedInvoice({ supplier, site, amount: 1_000_000 });

    const retention = await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: invoice.id,
        ratePercent: 5,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    expect(retention.baseAmount).toBe(1_000_000);
    expect(retention.ratePercent).toBe(5);
    expect(retention.amount).toBe(50_000);
    expect(retention.status).toBe('HELD');
    expect(retention.releasedAt).toBeNull();
  });

  it('arrondit le MONTANT à l’unité et le TAUX à deux décimales — ce ne sont pas les mêmes arrondis', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const invoice = await seedValidatedInvoice({ supplier, site, amount: 333_333 });

    const retention = await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: invoice.id,
        // 3,333 % : un taux arrondi comme un montant deviendrait 3 %, et la
        // retenue tomberait à 10 000 au lieu de 11 100.
        ratePercent: 3.333,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    expect(retention.ratePercent).toBe(3.33);
    expect(retention.amount).toBe(11_100);
    expect(Number.isInteger(retention.amount)).toBe(true);
  });

  it('débite le 401 et crédite le 4047 pour une facture fournisseur', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const invoice = await seedValidatedInvoice({ supplier, site, amount: 2_000_000 });
    postDocumentEntryTx.mockClear();

    await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: invoice.id,
        ratePercent: 5,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    const entry = derniereEcriture();
    expect(entry.documentType).toBe('RETENTION_HELD');
    expect(entry.lines).toEqual([
      expect.objectContaining({ accountId: 'compte-401', debit: 100_000 }),
      expect.objectContaining({ accountId: 'compte-4047', credit: 100_000 })
    ]);
    // Aucun compte de charge, aucune caisse : rien n'est constaté, rien ne sort.
    const comptes = entry.lines.map((l: any) => l.accountId);
    expect(comptes).not.toContain('compte-601');
    expect(comptes).not.toContain('compte-571');
  });

  it('débite le 402 pour une situation de tâcheron, jamais le 401', async () => {
    const site = seedSite();
    const statement = seedValidatedStatement({ site, amount: 5_000_000 });
    postDocumentEntryTx.mockClear();

    const retention = await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'PROGRESS_STATEMENT',
        sourceId: statement.id,
        ratePercent: 10,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    const entry = derniereEcriture();
    expect(entry.lines[0].accountId).toBe('compte-402');
    expect(entry.lines[1].accountId).toBe('compte-4047');
    // Le chantier vient du MARCHÉ, pas de la situation : elle n'en porte pas.
    expect(retention.siteId).toBe(site.id);
    expect(retention.siteLabel).toBe('Résidence Kipé');
    expect(retention.thirdPartyLabel).toBe('Mamadou Bah');
  });

  it('fait descendre puis remonter EXACTEMENT le solde du tiers', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const invoice = await seedValidatedInvoice({ supplier, site, amount: 3_000_000 });

    const soldeApresFacture = soldeDuTiers(supplier.thirdPartyAccountId);
    expect(soldeApresFacture).toBe(3_000_000);

    const retention = await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: invoice.id,
        ratePercent: 5,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    // Ce qu'on doit MAINTENANT a baissé de la retenue, pas d'autre chose.
    expect(soldeDuTiers(supplier.thirdPartyAccountId)).toBe(soldeApresFacture - 150_000);

    await runTransaction(tx => releaseRetentionTx(tx, TENANT_ID, retention.id, DIRIGEANT_ID));

    expect(soldeDuTiers(supplier.thirdPartyAccountId)).toBe(soldeApresFacture);
  });

  it('pose un mouvement d’AJUSTEMENT, jamais un règlement', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const invoice = await seedValidatedInvoice({ supplier, site, amount: 1_000_000 });

    await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: invoice.id,
        ratePercent: 5,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    const mouvement = store.movements.find(m => m.sourceType === 'RETENTION_HELD')!;
    expect(mouvement.type).toBe('ADJUSTMENT');
    expect(num(mouvement.credit)).toBe(50_000);
    expect(mouvement.debit).toBeUndefined();
    expect(store.movements.some(m => m.type === 'PAYMENT')).toBe(false);
  });
});

// ===========================================================================
// C. Les refus du contrat — tous implémentés, tous testés
// ===========================================================================

describe('createRetentionTx — les refus', () => {
  it('refuse une facture qui n’est pas validée (409)', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const invoice = await seedDraftInvoice(supplier, site, 1_000_000);

    await expect(
      runTransaction(tx =>
        createRetentionTx(tx, TENANT_ID, {
          sourceType: 'SUPPLIER_INVOICE',
          sourceId: invoice.id,
          ratePercent: 5,
          plannedReleaseDate: DANS_UN_AN,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toMatchObject({ status: 409 });

    expect(store.retentions).toHaveLength(0);
  });

  it('refuse une situation qui n’est pas validée (409)', async () => {
    const site = seedSite();
    const statement = seedValidatedStatement({ site, amount: 1_000_000 });
    statement.status = 'DRAFT';

    await expect(
      runTransaction(tx =>
        createRetentionTx(tx, TENANT_ID, {
          sourceType: 'PROGRESS_STATEMENT',
          sourceId: statement.id,
          ratePercent: 5,
          plannedReleaseDate: DANS_UN_AN,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toMatchObject({ status: 409 });
  });

  it('refuse une seconde retenue sur la même pièce (409), et n’écrit rien', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const invoice = await seedValidatedInvoice({ supplier, site, amount: 1_000_000 });

    await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: invoice.id,
        ratePercent: 5,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    const mouvementsAvant = store.movements.length;
    postDocumentEntryTx.mockClear();

    await expect(
      runTransaction(tx =>
        createRetentionTx(tx, TENANT_ID, {
          sourceType: 'SUPPLIER_INVOICE',
          sourceId: invoice.id,
          ratePercent: 3,
          plannedReleaseDate: DANS_UN_AN,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toMatchObject({ status: 409 });

    expect(store.retentions).toHaveLength(1);
    expect(store.movements).toHaveLength(mouvementsAvant);
    // Le conflit est détecté PAR UNE LECTURE, avant toute écriture : en
    // PostgreSQL, une commande en échec condamnerait toute la transaction.
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
  });

  it.each([
    ['nul', 0],
    ['négatif', -5],
    ['égal à cent', 100],
    ['supérieur à cent', 150],
    ['nul après arrondi à deux décimales', 0.001]
  ])('refuse un taux %s (400)', async (_libelle, taux) => {
    const site = seedSite();
    const supplier = seedSupplier();
    const invoice = await seedValidatedInvoice({ supplier, site, amount: 1_000_000 });

    await expect(
      runTransaction(tx =>
        createRetentionTx(tx, TENANT_ID, {
          sourceType: 'SUPPLIER_INVOICE',
          sourceId: invoice.id,
          ratePercent: taux,
          plannedReleaseDate: DANS_UN_AN,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toMatchObject({ status: 400 });
  });

  it('refuse une retenue dont le montant tombe à zéro après arrondi (400)', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    // 10 francs à 1 % font 0,1 franc, soit zéro au franc CFA près.
    const invoice = await seedValidatedInvoice({ supplier, site, amount: 10 });

    await expect(
      runTransaction(tx =>
        createRetentionTx(tx, TENANT_ID, {
          sourceType: 'SUPPLIER_INVOICE',
          sourceId: invoice.id,
          ratePercent: 1,
          plannedReleaseDate: DANS_UN_AN,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toMatchObject({ status: 400 });

    expect(store.retentions).toHaveLength(0);
  });

  /**
   * ANO-17, recette du 20 septembre 2026 — la regle a CHANGE ici.
   *
   * L'ancienne garde refusait la retenue des qu'un reglement TOUCHAIT la
   * facture, si peu que ce soit. Elle visait juste — on ne retient pas sur un
   * solde eteint — mais frappait trop large, et la situation de tacheron
   * acceptait le meme cas : deux natures, deux comportements opposes sur une
   * situation metier identique. La seule limite qui compte est le RESTE DU.
   */
  function seedReglementValide(invoiceId: string, montant: number, options: { validated?: boolean } = {}) {
    const paymentId = nextId('reg');
    store.payments.push({
      id: paymentId,
      tenantId: TENANT_ID,
      validatedAt: options.validated === false ? null : new Date()
    });
    store.paymentAllocations.push({ id: nextId('aff'), paymentId, invoiceId, amount: montant });
    return paymentId;
  }

  it('ACCEPTE une facture deja reglee en partie, tant que le reste du couvre la retenue', async () => {
    // Le cas exact de la recette : 18 000 000 regles a 16 200 000, il reste
    // 1 800 000, et une retenue de 10 % vaut exactement 1 800 000.
    const site = seedSite();
    const supplier = seedSupplier();
    const invoice = await seedValidatedInvoice({ supplier, site, amount: 18_000_000 });
    seedReglementValide(invoice.id, 16_200_000);

    const retention = await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: invoice.id,
        ratePercent: 10,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    expect(retention.amount).toBe(1_800_000);
  });

  it('REFUSE quand la retenue depasse ce qui reste a payer (409)', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const invoice = await seedValidatedInvoice({ supplier, site, amount: 1_000_000 });
    seedReglementValide(invoice.id, 990_000);

    await expect(
      runTransaction(tx =>
        createRetentionTx(tx, TENANT_ID, {
          sourceType: 'SUPPLIER_INVOICE',
          sourceId: invoice.id,
          ratePercent: 5,
          plannedReleaseDate: DANS_UN_AN,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(store.retentions).toHaveLength(0);
  });

  it('IGNORE un reglement reste en BROUILLON : il n’a rien paye', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const invoice = await seedValidatedInvoice({ supplier, site, amount: 1_000_000 });
    seedReglementValide(invoice.id, 990_000, { validated: false });

    const retention = await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: invoice.id,
        ratePercent: 5,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    expect(retention.amount).toBe(50_000);
  });

  it('IGNORE un reglement ANNULE : il a rendu ce qu’il avait pris', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const invoice = await seedValidatedInvoice({ supplier, site, amount: 1_000_000 });
    const paymentId = seedReglementValide(invoice.id, 990_000);
    store.voidDocuments.push({
      id: 'annul-1',
      tenantId: TENANT_ID,
      documentType: 'SUPPLIER_PAYMENT',
      documentId: paymentId
    });

    const retention = await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: invoice.id,
        ratePercent: 5,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    expect(retention.amount).toBe(50_000);
  });

  it('accepte en revanche une situation, dont les règlements ne sont affectés à rien', async () => {
    // Le contrat l'explique : on règle un tâcheron, pas une situation. Il n'y a
    // RIEN à lire pour savoir si celle-ci a déjà été payée, et prétendre le
    // vérifier serait un mensonge. Ce test épingle ce que le sous-lot fait
    // vraiment, plutôt que ce qu'on aimerait qu'il fasse.
    const site = seedSite();
    const statement = seedValidatedStatement({ site, amount: 1_000_000 });

    const retention = await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'PROGRESS_STATEMENT',
        sourceId: statement.id,
        ratePercent: 5,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    expect(retention.amount).toBe(50_000);
  });

  it('refuse une pièce introuvable (404) et une pièce d’un autre tenant', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const invoice = await seedValidatedInvoice({ supplier, site, amount: 1_000_000 });

    await expect(
      runTransaction(tx =>
        createRetentionTx(tx, TENANT_ID, {
          sourceType: 'SUPPLIER_INVOICE',
          sourceId: 'facture-inexistante',
          ratePercent: 5,
          plannedReleaseDate: DANS_UN_AN,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      runTransaction(tx =>
        createRetentionTx(tx, AUTRE_TENANT, {
          sourceType: 'SUPPLIER_INVOICE',
          sourceId: invoice.id,
          ratePercent: 5,
          plannedReleaseDate: DANS_UN_AN,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ===========================================================================
// D. La libération
// ===========================================================================

describe('releaseRetentionTx', () => {
  async function poserUneRetenue(): Promise<{ site: Row; supplier: Row; retentionId: string }> {
    const site = seedSite();
    const supplier = seedSupplier();
    const invoice = await seedValidatedInvoice({ supplier, site, amount: 2_000_000 });
    const retention = await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: invoice.id,
        ratePercent: 5,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    return { site, supplier, retentionId: retention.id };
  }

  it('écrit l’écriture inverse sous une nature DISTINCTE de la pose', async () => {
    const { retentionId } = await poserUneRetenue();
    postDocumentEntryTx.mockClear();

    const libere = await runTransaction(tx => releaseRetentionTx(tx, TENANT_ID, retentionId, DIRIGEANT_ID));

    const entry = derniereEcriture();
    // Deux natures, et c'est structurel : `postDocumentEntryTx` refuse une
    // seconde écriture pour le même couple (nature, pièce), et les deux
    // écritures portent le même identifiant de retenue.
    expect(entry.documentType).toBe('RETENTION_RELEASED');
    expect(entry.documentId).toBe(retentionId);
    expect(entry.lines).toEqual([
      expect.objectContaining({ accountId: 'compte-4047', debit: 100_000 }),
      expect.objectContaining({ accountId: 'compte-401', credit: 100_000 })
    ]);
    expect(libere.status).toBe('RELEASED');
    expect(libere.releasedAt).toBeInstanceOf(Date);
  });

  it('ne règle rien : aucun mouvement de caisse, aucun règlement', async () => {
    const { retentionId } = await poserUneRetenue();
    postDocumentEntryTx.mockClear();

    await runTransaction(tx => releaseRetentionTx(tx, TENANT_ID, retentionId, DIRIGEANT_ID));

    for (const entry of ecritures()) {
      expect(entry.lines.map((l: any) => l.accountId)).not.toContain('compte-571');
    }
    const mouvement = store.movements.find(m => m.sourceType === 'RETENTION_RELEASED')!;
    expect(mouvement.type).toBe('ADJUSTMENT');
    expect(num(mouvement.debit)).toBe(100_000);
    expect(store.movements.some(m => m.type === 'PAYMENT')).toBe(false);
  });

  it('pose deux mouvements distincts sur le même compte, la pose et la libération', async () => {
    const { supplier, retentionId } = await poserUneRetenue();
    await runTransaction(tx => releaseRetentionTx(tx, TENANT_ID, retentionId, DIRIGEANT_ID));

    const mouvements = store.movements.filter(m => m.accountId === supplier.thirdPartyAccountId);
    expect(mouvements.map(m => m.sourceType)).toEqual(['SUPPLIER_INVOICE', 'RETENTION_HELD', 'RETENTION_RELEASED']);
  });

  it('refuse une retenue déjà libérée (409)', async () => {
    const { retentionId } = await poserUneRetenue();
    await runTransaction(tx => releaseRetentionTx(tx, TENANT_ID, retentionId, DIRIGEANT_ID));

    await expect(
      runTransaction(tx => releaseRetentionTx(tx, TENANT_ID, retentionId, DIRIGEANT_ID))
    ).rejects.toMatchObject({ status: 409 });
  });

  it('refuse une retenue introuvable (404)', async () => {
    await expect(
      runTransaction(tx => releaseRetentionTx(tx, TENANT_ID, 'retenue-inconnue', DIRIGEANT_ID))
    ).rejects.toMatchObject({ status: 404 });
  });

  it('accepte une libération AVANT la date prévue — rien n’interdit de rendre plus tôt', async () => {
    const { retentionId } = await poserUneRetenue();
    const retention = store.retentions.find(r => r.id === retentionId)!;
    expect(new Date(retention.plannedReleaseDate).getTime()).toBeGreaterThan(Date.now());

    const libere = await runTransaction(tx => releaseRetentionTx(tx, TENANT_ID, retentionId, DIRIGEANT_ID));
    expect(libere.status).toBe('RELEASED');
  });
});

// ===========================================================================
// E. Lectures
// ===========================================================================

describe('listRetentions / getRetention', () => {
  async function jeuDeDonnees() {
    const siteA = seedSite('Résidence Kipé');
    const siteB = seedSite('Villa Ratoma');
    const supplier = seedSupplier();
    const factureA = await seedValidatedInvoice({ supplier, site: siteA, amount: 1_000_000, reference: 'F-2026-014' });
    const statementB = seedValidatedStatement({ site: siteB, amount: 2_000_000 });

    const retenueA = await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: factureA.id,
        ratePercent: 5,
        plannedReleaseDate: HIER,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    const retenueB = await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'PROGRESS_STATEMENT',
        sourceId: statementB.id,
        ratePercent: 10,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    return { siteA, siteB, supplier, retenueA, retenueB };
  }

  it('nomme la pièce et le chantier en clair, jamais par un identifiant', async () => {
    const { retenueA } = await jeuDeDonnees();

    const detail = await getRetention(TENANT_ID, retenueA.id);
    expect(detail.sourceLabel).toBe('Facture F-2026-014');
    expect(detail.siteLabel).toBe('Résidence Kipé');
    expect(detail.thirdPartyLabel).toBe('Ciments de Guinée');
    expect(detail.sourceLabel).not.toContain(detail.sourceId);
  });

  it('nomme une situation par sa date et son marché', async () => {
    const { retenueB } = await jeuDeDonnees();

    const detail = await getRetention(TENANT_ID, retenueB.id);
    expect(detail.sourceLabel).toBe('Situation du 15/03/2026 — marché MAÇ-07');
  });

  it('filtre par chantier, par tiers, par statut et par échéance dépassée', async () => {
    const { siteA, supplier, retenueA, retenueB } = await jeuDeDonnees();

    expect((await listRetentions(TENANT_ID, {})).map(r => r.id).sort()).toEqual([retenueA.id, retenueB.id].sort());
    expect((await listRetentions(TENANT_ID, { siteId: siteA.id })).map(r => r.id)).toEqual([retenueA.id]);
    expect(
      (await listRetentions(TENANT_ID, { thirdPartyAccountId: supplier.thirdPartyAccountId })).map(r => r.id)
    ).toEqual([retenueA.id]);
    expect(await listRetentions(TENANT_ID, { status: 'HELD' })).toHaveLength(2);
    expect(await listRetentions(TENANT_ID, { status: 'RELEASED' })).toHaveLength(0);
    // Seule la retenue dont la date prévue est passée.
    expect((await listRetentions(TENANT_ID, { dueBefore: new Date() })).map(r => r.id)).toEqual([retenueA.id]);
  });

  it('classe la plus ancienne échéance d’abord', async () => {
    const { retenueA, retenueB } = await jeuDeDonnees();
    expect((await listRetentions(TENANT_ID, {})).map(r => r.id)).toEqual([retenueA.id, retenueB.id]);
  });

  it('ne montre rien à un autre tenant', async () => {
    const { retenueA } = await jeuDeDonnees();
    expect(await listRetentions(AUTRE_TENANT, {})).toEqual([]);
    await expect(getRetention(AUTRE_TENANT, retenueA.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('getRetentionSummary', () => {
  it('sépare ce qui est détenu, ce qui est libéré, et ce qui est en retard', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const f1 = await seedValidatedInvoice({ supplier, site, amount: 1_000_000, reference: 'F-1' });
    const f2 = await seedValidatedInvoice({ supplier, site, amount: 2_000_000, reference: 'F-2' });
    const f3 = await seedValidatedInvoice({ supplier, site, amount: 4_000_000, reference: 'F-3' });

    // Échéance dépassée.
    await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: f1.id,
        ratePercent: 5,
        plannedReleaseDate: HIER,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    // Échéance à venir.
    await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: f2.id,
        ratePercent: 5,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    // Libérée : elle sort du détenu, et du retard avec.
    const troisieme = await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: f3.id,
        ratePercent: 5,
        plannedReleaseDate: HIER,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    await runTransaction(tx => releaseRetentionTx(tx, TENANT_ID, troisieme.id, DIRIGEANT_ID));

    const resume = await getRetentionSummary(TENANT_ID, {});
    expect(resume.totalHeld).toBe(150_000);
    expect(resume.totalReleased).toBe(200_000);
    expect(resume.overdueHeld).toBe(50_000);
    expect(resume.overdueCount).toBe(1);
    expect(resume.currency).toBe('XOF');
  });

  it('rend des zéros plutôt que rien quand aucune retenue n’existe', async () => {
    const resume = await getRetentionSummary(TENANT_ID, {});
    expect(resume).toEqual({
      totalHeld: 0,
      totalReleased: 0,
      overdueHeld: 0,
      overdueCount: 0,
      currency: 'XOF'
    });
  });

  it('se restreint à un chantier quand on le demande', async () => {
    const siteA = seedSite('A');
    const siteB = seedSite('B');
    const supplier = seedSupplier();
    const fA = await seedValidatedInvoice({ supplier, site: siteA, amount: 1_000_000, reference: 'F-A' });
    const statementB = seedValidatedStatement({ site: siteB, amount: 2_000_000 });

    await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: fA.id,
        ratePercent: 5,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'PROGRESS_STATEMENT',
        sourceId: statementB.id,
        ratePercent: 10,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    expect((await getRetentionSummary(TENANT_ID, { siteId: siteA.id })).totalHeld).toBe(50_000);
    expect((await getRetentionSummary(TENANT_ID, { siteId: siteB.id })).totalHeld).toBe(200_000);
  });
});

// ===========================================================================
// F. Principe P-1 — aucun libellé comptable à l'écran
// ===========================================================================

describe('principe P-1 — aucun vocabulaire comptable rendu à l’utilisateur', () => {
  it('ne prononce ni « débit » ni « crédit » dans un message de refus', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const brouillon = await seedDraftInvoice(supplier, site, 1_000_000);
    const validee = await seedValidatedInvoice({ supplier, site, amount: 10 });

    const messages: string[] = [];
    const attraper = async (promesse: Promise<unknown>) => {
      try {
        await promesse;
      } catch (error: any) {
        messages.push(String(error.message));
      }
    };

    await attraper(
      runTransaction(tx =>
        createRetentionTx(tx, TENANT_ID, {
          sourceType: 'SUPPLIER_INVOICE',
          sourceId: brouillon.id,
          ratePercent: 5,
          plannedReleaseDate: DANS_UN_AN,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    );
    await attraper(
      runTransaction(tx =>
        createRetentionTx(tx, TENANT_ID, {
          sourceType: 'SUPPLIER_INVOICE',
          sourceId: validee.id,
          ratePercent: 1,
          plannedReleaseDate: DANS_UN_AN,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    );
    await attraper(
      runTransaction(tx =>
        createRetentionTx(tx, TENANT_ID, {
          sourceType: 'SUPPLIER_INVOICE',
          sourceId: validee.id,
          ratePercent: 100,
          plannedReleaseDate: DANS_UN_AN,
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    );
    await attraper(runTransaction(tx => releaseRetentionTx(tx, TENANT_ID, 'inconnue', DIRIGEANT_ID)));

    expect(messages.length).toBeGreaterThanOrEqual(4);
    for (const message of messages) {
      expect(message.toLowerCase()).not.toContain('débit');
      expect(message.toLowerCase()).not.toContain('crédit');
      expect(message.toLowerCase()).not.toContain('4047');
    }
  });

  it('ne renvoie aucun champ comptable dans l’enregistrement rendu', async () => {
    const site = seedSite();
    const supplier = seedSupplier();
    const invoice = await seedValidatedInvoice({ supplier, site, amount: 1_000_000 });

    const retention = await runTransaction(tx =>
      createRetentionTx(tx, TENANT_ID, {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: invoice.id,
        ratePercent: 5,
        plannedReleaseDate: DANS_UN_AN,
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    expect(Object.keys(retention).sort()).toEqual(
      [
        'amount',
        'baseAmount',
        'createdAt',
        'currency',
        'id',
        'plannedReleaseDate',
        'ratePercent',
        'releasedAt',
        'siteId',
        'siteLabel',
        'sourceId',
        'sourceLabel',
        'sourceType',
        'status',
        'tenantId',
        'thirdPartyAccountId',
        'thirdPartyLabel'
      ].sort()
    );
  });
});
