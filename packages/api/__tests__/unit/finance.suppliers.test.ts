/**
 * Tests des fournisseurs (`lib/finance/suppliers.ts`).
 *
 * Meme esprit que `finance.billing-run.test.ts` : Prisma est remplace par un
 * magasin en memoire (aucune base requise), et le moteur comptable
 * (`postDocumentEntryTx`) ainsi que le grand livre (`appendThirdPartyMovementTx`)
 * sont mockes — ce fichier ne teste pas leur calcul, seulement la facon dont
 * les fournisseurs les orchestrent (invariant avant ecriture, atomicite,
 * vocabulaire).
 *
 * Le mock d'`appendThirdPartyMovementTx` reproduit neanmoins fidelement le
 * sens du grand livre (facture augmente le solde, regle le diminue), pour que
 * `getSuppliersBalance` — qui lit directement `ThirdPartyMovement` via
 * `groupBy`, sans passer par le grand livre — ait des donnees realistes a
 * agreger.
 */

import { roundMoneyXof } from '../../src/lib/finance/money';

// ---------------------------------------------------------------------------
// Moteur comptable et grand livre — mockes
// ---------------------------------------------------------------------------

const postDocumentEntryTx = jest.fn();
const appendThirdPartyMovementTx = jest.fn();

// Le plan de comptes operationnel vit desormais dans `accounting.ts`, seul.
// Ce fichier en portait sa propre copie, retiree a l'integration : les deux
// avaient deja diverge sur le compte de tresorerie.
//
// Le mock rend donc l'amorcage : un journal fixe, et l'index des cinq comptes
// que `OPERATIONAL_ACCOUNT_SEEDS` garantit.
const COMPTES_OPERATIONNELS = new Map<string, string>([
  ['401', 'compte-401'],
  ['411', 'compte-411'],
  ['571', 'compte-571'],
  ['601', 'compte-601'],
  ['605', 'compte-605'],
  // Lot 5 : le 311 recoit la valeur d'une facture imputee a un chantier passe
  // au stock, a la place du compte de charge du poste (principe P-7).
  ['311', 'compte-311']
]);

// La synchronisation du cout des programmes de travaux appartient a
// `cost-allocation.ts`. On la mocke ici, comme le moteur comptable : ce fichier
// verifie qu'elle est APPELEE avec le bon chantier, pas ce qu'elle fait.
const syncWorkProgramCostTx = jest.fn();

const raiseBudgetAlertIfNeededTx = jest.fn();

// L'alerte de depassement (lot 3) est appelee a la validation d'une piece,
// parce que c'est l'un des trois seuls moments ou l'engage d'un chantier peut
// monter. Elle est mockee ici comme le sont deja l'imputation et le moteur
// comptable : ce fichier verifie COMMENT les fonctions fournisseurs
// l'appellent, jamais ce qu'elle calcule — le lot 3 a ses propres tests pour
// cela, et son parcours de bout en bout.
//
// Elle rend `null` par defaut : aucune alerte a lever.
jest.mock('../../src/lib/finance/budget-alerts', () => ({
  raiseBudgetAlertIfNeededTx: (...args: any[]) => raiseBudgetAlertIfNeededTx(...args)
}));

jest.mock('../../src/lib/finance/cost-allocation', () => ({
  syncWorkProgramCostTx: (...args: any[]) => syncWorkProgramCostTx(...args)
}));

// Lot 10 : le compte qui PAIE un reglement se resout par `treasury/accounts.ts`
// (reel, pas mocke : c'est lui qui decide d'ou sort l'argent, et le defaut du
// 29 septembre 2026 y vivait). Il lit `treasuryAccount`, dont le magasin est
// seme dans `beforeEach` : une caisse 571, une banque 521 et une seconde banque.
//
// Le controle de solde (`treasury/balance.ts`) est, lui, mocke : il a ses
// propres tests dans `treasury.test.ts`, ici on verifie qu'il est appele pour
// le bon compte et le bon montant, et qu'un refus n'ecrit rien.
const assertTreasuryCanPayTx = jest.fn();
jest.mock('../../src/lib/treasury/balance', () => ({
  assertTreasuryCanPayTx: (...args: any[]) => assertTreasuryCanPayTx(...args)
}));

jest.mock('../../src/lib/finance/accounting', () => ({
  postDocumentEntryTx: (...args: any[]) => postDocumentEntryTx(...args),
  // Le journal suit le type demande (caisse, banque) ; sans type, le journal general.
  ensureOperationalJournalTx: async (_tx: unknown, _tenantId: string, _year: number, type?: string) =>
    type ? `journal-${type}` : 'journal-operationnel',
  ensureOperationalChartOfAccountsTx: async () => COMPTES_OPERATIONNELS,
  // Resout le compte de charge d'un poste. La doublure rend le compte par
  // defaut pour chaque poste : ces fichiers verifient COMMENT l'ecriture est
  // batie, pas quel compte un poste designe — le test du resolveur lui-meme
  // vit dans `finance.accounting.test.ts`.
  resolveExpenseAccountsByCostCategoryTx: async (_tx: unknown, _tenantId: string, ids: string[], parDefaut: string) =>
    new Map(ids.map(id => [id, parDefaut]))
}));

jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: (...args: any[]) => appendThirdPartyMovementTx(...args)
}));

// ---------------------------------------------------------------------------
// Magasin en memoire pour `../../src/utils/database`
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

const store = {
  thirdPartyAccounts: [] as Row[],
  suppliers: [] as Row[],
  invoices: [] as Row[],
  invoiceLines: [] as Row[],
  costAllocations: [] as Row[],
  // La garde « chantier clos » du sous-lot 6 lit le chantier avant d'imputer.
  // Depuis l'audit multi-tenant du 24 septembre 2026 (lot B1), un chantier
  // absent — ou d'une autre agence — REFUSE l'écriture (`NotFoundError`,
  // `assertSiteOpenTx` comme la vérification d'appartenance qui la précède
  // désormais) : `createSiteAndCategory()` sème donc un chantier réel pour
  // que les tests du chemin heureux continuent de passer. Les tests qui
  // veulent prouver un refus poussent un chantier clos, ou d'une autre
  // agence, explicitement.
  constructionSites: [] as Row[],
  costCategories: [] as Row[],
  chartOfAccounts: [] as Row[],
  treasuryAccounts: [] as Row[],
  journals: [] as Row[],
  payments: [] as Row[],
  voidDocuments: [] as Row[],
  paymentAllocations: [] as Row[],
  movements: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function matchesFlat(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) {
      return true;
    }
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

const mockPrisma: Row = {
  thirdPartyAccount: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('acc'), ...data };
      store.thirdPartyAccounts.push(created);
      return created;
    }),
    findMany: jest.fn(async ({ where }: Row) => {
      const rows = store.thirdPartyAccounts.filter(a => matchesFlat(a, where));
      return rows.map(a => ({
        ...a,
        supplier: store.suppliers.find(s => s.thirdPartyAccountId === a.id)
          ? { id: store.suppliers.find(s => s.thirdPartyAccountId === a.id)!.id }
          : null
      }));
    })
  },

  supplier: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('sup'), isActive: true, ...data };
      store.suppliers.push(created);
      return created;
    }),
    findFirst: jest.fn(async ({ where }: Row) => store.suppliers.find(s => matchesFlat(s, where)) ?? null)
  },

  supplierInvoice: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('inv'), journalEntryId: null, validatedByUserId: null, validatedAt: null, ...data };
      store.invoices.push(created);
      return created;
    }),
    findFirst: jest.fn(async ({ where }: Row) => store.invoices.find(i => matchesFlat(i, where)) ?? null),
    findMany: jest.fn(async ({ where }: Row) => store.invoices.filter(i => matchesFlat(i, where))),
    update: jest.fn(async ({ where, data }: Row) => {
      const invoice = store.invoices.find(i => i.id === where.id);
      if (!invoice) return null;
      Object.assign(invoice, data);
      return { ...invoice };
    })
  },

  supplierInvoiceLine: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('line'), ...data };
      store.invoiceLines.push(created);
      return created;
    })
  },

  constructionSite: {
    findFirst: jest.fn(async ({ where }: Row) => store.constructionSites.find(c => matchesFlat(c, where)) ?? null)
  },

  // Audit multi-tenant du 24 septembre 2026 (lot B1) : `createSupplierInvoiceTx`
  // vérifie désormais `costCategoryId` avant d'écrire, comme `siteId`.
  costCategory: {
    findFirst: jest.fn(async ({ where }: Row) => store.costCategories.find(c => matchesFlat(c, where)) ?? null)
  },

  costAllocation: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('alloc'), validatedAt: null, voidedAt: null, ...data };
      store.costAllocations.push(created);
      return created;
    }),
    findMany: jest.fn(async ({ where }: Row) => store.costAllocations.filter(a => matchesFlat(a, where))),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.costAllocations.filter(a => matchesFlat(a, where));
      rows.forEach(a => Object.assign(a, data));
      return { count: rows.length };
    })
  },

  // Comptes de tresorerie de l'agence : lus par `resolveOutflowTreasuryAccountTx`,
  // par defaut d'abord puis par anciennete, comme la requete reelle.
  treasuryAccount: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const rows = store.treasuryAccounts.filter(a => matchesFlat(a, where));
      rows.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.seq - b.seq);
      return rows[0] ?? null;
    })
  },

  chartOfAccount: {
    findFirst: jest.fn(async ({ where }: Row) => store.chartOfAccounts.find(a => matchesFlat(a, where)) ?? null),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('coa'), ...data };
      store.chartOfAccounts.push(created);
      return created;
    })
  },

  accountingJournal: {
    findFirst: jest.fn(async ({ where }: Row) => store.journals.find(j => matchesFlat(j, where)) ?? null),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('journal'), ...data };
      store.journals.push(created);
      return created;
    })
  },

  supplierPayment: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('pay'), journalEntryId: null, validatedAt: null, ...data };
      store.payments.push(created);
      return created;
    }),
    findFirst: jest.fn(async ({ where }: Row) => store.payments.find(p => matchesFlat(p, where)) ?? null),
    update: jest.fn(async ({ where, data }: Row) => {
      const payment = store.payments.find(p => p.id === where.id);
      if (!payment) return null;
      Object.assign(payment, data);
      return { ...payment };
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.payments.filter(p => matchesFlat(p, where));
      rows.forEach(p => Object.assign(p, data));
      return { count: rows.length };
    })
  },

  voidDocument: {
    findFirst: jest.fn(async ({ where }: Row) => store.voidDocuments.find(v => matchesFlat(v, where)) ?? null),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('void'), ...data };
      store.voidDocuments.push(created);
      return created;
    })
  },

  supplierPaymentAllocation: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('palloc'), ...data };
      store.paymentAllocations.push(created);
      return created;
    }),
    findMany: jest.fn(async ({ where }: Row) => store.paymentAllocations.filter(a => matchesFlat(a, where)))
  },

  thirdPartyMovement: {
    groupBy: jest.fn(async ({ where }: Row) => {
      const accountIds: string[] = where.accountId?.in ?? [];
      const rows = store.movements.filter(m => {
        if (!accountIds.includes(m.accountId)) return false;
        if (m.tenantId !== where.tenantId) return false;
        if (where.movementDate) {
          const time = m.movementDate.getTime();
          if (where.movementDate.gte && time < where.movementDate.gte.getTime()) return false;
          if (where.movementDate.lte && time > where.movementDate.lte.getTime()) return false;
        }
        if (where.OR) {
          const matchesOr = (where.OR as Row[]).some(
            cond => m.sourceType === cond.sourceType && (cond.sourceId.in as string[]).includes(m.sourceId)
          );
          if (!matchesOr) return false;
        }
        return true;
      });

      const byAccount = new Map<string, { debit: number; credit: number }>();
      for (const row of rows) {
        const agg = byAccount.get(row.accountId) ?? { debit: 0, credit: 0 };
        agg.debit += row.debit ?? 0;
        agg.credit += row.credit ?? 0;
        byAccount.set(row.accountId, agg);
      }

      return Array.from(byAccount.entries()).map(([accountId, sums]) => ({
        accountId,
        _sum: { debit: sums.debit, credit: sums.credit }
      }));
    })
  },

  $transaction: jest.fn(async (callback: (tx: Row) => Promise<any>) => {
    const snapshot = {
      thirdPartyAccounts: structuredClone(store.thirdPartyAccounts),
      suppliers: structuredClone(store.suppliers),
      invoices: structuredClone(store.invoices),
      invoiceLines: structuredClone(store.invoiceLines),
      costAllocations: structuredClone(store.costAllocations),
      chartOfAccounts: structuredClone(store.chartOfAccounts),
      journals: structuredClone(store.journals),
      payments: structuredClone(store.payments),
      paymentAllocations: structuredClone(store.paymentAllocations),
      movements: structuredClone(store.movements),
      seq: store.seq
    };
    try {
      return await callback(mockPrisma);
    } catch (error) {
      store.thirdPartyAccounts = snapshot.thirdPartyAccounts;
      store.suppliers = snapshot.suppliers;
      store.invoices = snapshot.invoices;
      store.invoiceLines = snapshot.invoiceLines;
      store.costAllocations = snapshot.costAllocations;
      store.chartOfAccounts = snapshot.chartOfAccounts;
      store.journals = snapshot.journals;
      store.payments = snapshot.payments;
      store.paymentAllocations = snapshot.paymentAllocations;
      store.movements = snapshot.movements;
      store.seq = snapshot.seq;
      throw error;
    }
  })
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

import { prisma } from '../../src/utils/database';
import {
  createSupplierInvoiceTx,
  createSupplierPaymentTx,
  createSupplierTx,
  getSuppliersBalance,
  validateSupplierInvoiceTx,
  validateSupplierPaymentTx
} from '../../src/lib/finance/suppliers';

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';
// Le compte choisi transite par la colonne `method` (`MODE@<uuid>`) : la relecture
// ignore tout identifiant qui n'est pas un UUID, comme ceux de la base.
const BANQUE_2_ID = '22222222-2222-4222-8222-222222222222';

function tx(): any {
  return mockPrisma;
}

let treasurySeq = 0;

function treasuryRow(key: string, kind: string, number: string, label: string, isDefault: boolean): Row {
  return {
    id: `tresorerie-${key}`,
    tenantId: TENANT_ID,
    kind,
    label,
    accountNumber: number,
    chartOfAccountId: `compte-${key}`,
    isActive: true,
    isDefault,
    seq: treasurySeq++
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  raiseBudgetAlertIfNeededTx.mockResolvedValue(null);
  assertTreasuryCanPayTx.mockResolvedValue(undefined);
  store.thirdPartyAccounts = [];
  store.suppliers = [];
  store.invoices = [];
  store.invoiceLines = [];
  store.costAllocations = [];
  store.constructionSites = [];
  store.costCategories = [];
  store.chartOfAccounts = [];
  store.treasuryAccounts = [
    treasuryRow('caisse', 'CASH', '571', 'Caisse principale', true),
    treasuryRow('banque', 'BANK', '521', 'Banque principale', true),
    { ...treasuryRow('banque-2', 'BANK', '52112', 'Ecobank', false), id: BANQUE_2_ID },
    treasuryRow('orange', 'MOBILE_MONEY', '5522', 'Orange Money', true)
  ];
  store.journals = [];
  store.payments = [];
  store.voidDocuments = [];
  store.paymentAllocations = [];
  store.movements = [];
  store.seq = 0;

  postDocumentEntryTx.mockImplementation(async () => ({
    entryId: nextId('entry'),
    totalDebit: 0,
    totalCredit: 0
  }));

  // Reproduit fidelement le sens du grand livre : `billed` augmente le solde
  // du compte, `settled` le diminue — meme calcul que `computeBalanceAfterMovement`
  // du lot 1, sans en dependre (ce fichier ne teste pas le grand livre).
  appendThirdPartyMovementTx.mockImplementation(async (_tx: Row, params: Row) => {
    const account = store.thirdPartyAccounts.find(a => a.id === params.accountId && a.tenantId === params.tenantId);
    if (!account) {
      return null;
    }
    const debit = params.billed ?? 0;
    const credit = params.settled ?? 0;
    account.balance = roundMoneyXof(Number(account.balance ?? 0) + debit - credit);

    const movement = {
      id: nextId('mv'),
      accountId: params.accountId,
      tenantId: params.tenantId,
      movementDate: params.movementDate ?? new Date(),
      type: params.type,
      debit: debit || undefined,
      credit: credit || undefined,
      balanceAfter: account.balance,
      label: params.label,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      createdAt: new Date()
    };
    store.movements.push(movement);
    return movement;
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function createSupplier(kind: 'MATERIALS' | 'SERVICES' | 'MIXED' = 'SERVICES', overrides: Row = {}) {
  return createSupplierTx(tx(), TENANT_ID, {
    name: overrides.name ?? 'Comptoir du Ciment',
    kind,
    contactName: overrides.contactName,
    phone: overrides.phone ?? null,
    email: overrides.email ?? null,
    maintenanceVendorId: overrides.maintenanceVendorId ?? null
  });
}

/**
 * Sème un chantier OUVERT et un poste de dépense, pour l'agence donnée
 * (`TENANT_ID` par défaut). Depuis le lot B1 (audit multi-tenant du
 * 24 septembre 2026), `createSupplierInvoiceTx` vérifie que `siteId` et
 * `costCategoryId` appartiennent à l'agence avant d'écrire : un id qui ne
 * désigne rien de seedé ici serait désormais refusé (`NotFoundError`), là où
 * il ne l'était pas avant ce jour.
 */
async function createSiteAndCategory(tenantId: string = TENANT_ID) {
  const siteId = nextId('site');
  const costCategoryId = nextId('cat');
  store.constructionSites.push({ id: siteId, tenantId, name: 'Chantier de test', closedAt: null });
  store.costCategories.push({ id: costCategoryId, tenantId, label: 'Poste de test' });
  return { siteId, costCategoryId };
}

async function createDraftInvoice(
  supplierId: string,
  options: { amount?: number; allocations?: Array<{ siteId: string; costCategoryId: string; amount: number }> } = {}
) {
  const amount = options.amount ?? 500000;
  return createSupplierInvoiceTx(tx(), TENANT_ID, {
    supplierId,
    invoiceDate: new Date('2026-09-01T00:00:00.000Z'),
    reference: `FAC-${nextId('ref')}`,
    lines: [{ label: 'Prestation', amount }],
    allocations: options.allocations ?? [],
    createdByUserId: USER_ID
  });
}

// ---------------------------------------------------------------------------
// A. Creation du fournisseur et de son compte
// ---------------------------------------------------------------------------

describe('createSupplierTx', () => {
  it('cree le fournisseur et son compte de tiers dans la meme transaction, solde a zero', async () => {
    const supplier = await createSupplier('MATERIALS', { name: 'Materiaux Sahel', phone: '+224600000000' });

    expect(supplier.name).toBe('Materiaux Sahel');
    expect(supplier.kind).toBe('MATERIALS');
    expect(supplier.thirdPartyAccountId).toBeTruthy();
    expect(store.thirdPartyAccounts).toHaveLength(1);
    expect(store.thirdPartyAccounts[0].balance).toBe(0);
    expect(store.thirdPartyAccounts[0].kind).toBe('SUPPLIER');
  });

  it('accepte un lien facultatif vers un MaintenanceVendor', async () => {
    const supplier = await createSupplier('SERVICES', { maintenanceVendorId: 'vendor-1' });
    expect(supplier.maintenanceVendorId).toBe('vendor-1');
  });
});

// ---------------------------------------------------------------------------
// B. Facture brouillon
// ---------------------------------------------------------------------------

describe('createSupplierInvoiceTx', () => {
  it("une facture brouillon n'ecrit ni ecriture, ni mouvement, ni imputation validee", async () => {
    const supplier = await createSupplier('SERVICES');
    const invoice = await createDraftInvoice(supplier.id, { amount: 100000 });

    expect(invoice.status).toBe('DRAFT');
    expect(invoice.amount).toBe(100000);
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
    expect(appendThirdPartyMovementTx).not.toHaveBeenCalled();
    expect(store.costAllocations.every(a => a.validatedAt === null)).toBe(true);
  });

  it('rattachement a un chantier obligatoire pour un fournisseur de materiaux', async () => {
    const supplier = await createSupplier('MATERIALS');

    await expect(createDraftInvoice(supplier.id, { amount: 50000, allocations: [] })).rejects.toThrow(/chantier/i);
  });

  it('un fournisseur de materiaux avec un chantier rattache est accepte', async () => {
    const supplier = await createSupplier('MATERIALS');
    const { siteId, costCategoryId } = await createSiteAndCategory();

    const invoice = await createDraftInvoice(supplier.id, {
      amount: 200000,
      allocations: [{ siteId, costCategoryId, amount: 200000 }]
    });

    expect(invoice.siteId).toBe(siteId);
    expect(store.costAllocations).toHaveLength(1);
  });

  it('une prestation sans chantier reste acceptee (rattachement facultatif)', async () => {
    const supplier = await createSupplier('SERVICES');
    const invoice = await createDraftInvoice(supplier.id, { amount: 75000, allocations: [] });
    expect(invoice.siteId).toBeNull();
  });

  it('REFUSE une reference deja prise chez ce fournisseur, en la nommant', async () => {
    // Le refus existait deja, mais par violation de contrainte Prisma : le
    // middleware le traduisait en « Cette ressource existe deja. », sans dire
    // quel champ ni quelle piece. Recette du 20 septembre 2026.
    const supplier = await createSupplier('SERVICES', { name: 'QA Quincaillerie Angre' });
    const params = {
      supplierId: supplier.id,
      invoiceDate: new Date('2026-09-01T00:00:00.000Z'),
      reference: 'FRS-QA-006',
      lines: [{ label: 'Prestation', amount: 100000 }],
      allocations: [],
      createdByUserId: USER_ID
    };

    await createSupplierInvoiceTx(tx(), TENANT_ID, params);

    await expect(createSupplierInvoiceTx(tx(), TENANT_ID, params)).rejects.toThrow(
      /FRS-QA-006.*QA Quincaillerie Angre/
    );
    // Une seule facture creee : le refus vient AVANT l'ecriture, et non d'un
    // rattrapage apres coup — en PostgreSQL une commande en echec condamne
    // le reste de la transaction, qui cree ensuite lignes et imputations.
    expect(store.invoices).toHaveLength(1);
  });

  it("DIT qu'une reference reste reservee quand la facture qui la porte est ANNULEE", async () => {
    // Le cas le plus courant, et le plus deroutant : on annule parce qu'on
    // s'est trompe, et on ressaisit la meme facture. Un statut n'est pas une
    // suppression, la reference ne se libere donc pas — encore faut-il le
    // dire, sans quoi le refus est incomprehensible.
    const supplier = await createSupplier('SERVICES', { name: 'QA Materiaux du Sud SARL' });
    const params = {
      supplierId: supplier.id,
      invoiceDate: new Date('2026-09-20T00:00:00.000Z'),
      reference: 'FRS-QA-006',
      lines: [{ label: 'Ciment', amount: 11_000_000 }],
      allocations: [],
      createdByUserId: USER_ID
    };

    const premiere = await createSupplierInvoiceTx(tx(), TENANT_ID, params);
    store.invoices.find(i => i.id === premiere.id)!.status = 'VOIDED';

    await expect(createSupplierInvoiceTx(tx(), TENANT_ID, params)).rejects.toThrow(/annulée.*réservée/i);
  });

  it('laisse DEUX FOURNISSEURS porter la meme reference — chacun numerote ses factures', async () => {
    const premier = await createSupplier('SERVICES', { name: 'Fournisseur A' });
    const second = await createSupplier('SERVICES', { name: 'Fournisseur B' });
    const facture = (supplierId: string) => ({
      supplierId,
      invoiceDate: new Date('2026-09-01T00:00:00.000Z'),
      reference: 'F-2026-001',
      lines: [{ label: 'Prestation', amount: 100000 }],
      allocations: [],
      createdByUserId: USER_ID
    });

    await createSupplierInvoiceTx(tx(), TENANT_ID, facture(premier.id));
    await expect(createSupplierInvoiceTx(tx(), TENANT_ID, facture(second.id))).resolves.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// C. Validation
// ---------------------------------------------------------------------------

describe('validateSupplierInvoiceTx', () => {
  it('valide une facture : ecriture, mouvement, imputations, dans une seule transaction', async () => {
    const supplier = await createSupplier('MATERIALS');
    const { siteId, costCategoryId } = await createSiteAndCategory();
    const invoice = await createDraftInvoice(supplier.id, {
      amount: 300000,
      allocations: [{ siteId, costCategoryId, amount: 300000 }]
    });

    const validated = await validateSupplierInvoiceTx(tx(), TENANT_ID, invoice.id, USER_ID);

    expect(validated.status).toBe('VALIDATED');
    expect(validated.validatedByUserId).toBe(USER_ID);
    expect(postDocumentEntryTx).toHaveBeenCalledTimes(1);
    expect(appendThirdPartyMovementTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ billed: 300000, sourceType: 'SUPPLIER_INVOICE', sourceId: invoice.id })
    );

    const account = store.thirdPartyAccounts.find(a => a.id === supplier.thirdPartyAccountId)!;
    expect(account.balance).toBe(300000);

    const allocation = store.costAllocations.find(a => a.sourceId === invoice.id)!;
    expect(allocation.validatedAt).not.toBeNull();
  });

  it('refuse la validation quand la somme des imputations ne correspond pas au montant, avant toute ecriture', async () => {
    const supplier = await createSupplier('MATERIALS');
    const { siteId, costCategoryId } = await createSiteAndCategory();
    const invoice = await createDraftInvoice(supplier.id, {
      amount: 300000,
      allocations: [{ siteId, costCategoryId, amount: 300000 }]
    });

    // Une imputation est modifiee apres coup pour desequilibrer la somme —
    // simule une incoherence que la creation n'aurait pas dû laisser passer.
    store.costAllocations.find(a => a.sourceId === invoice.id)!.amount = 250000;

    await expect(validateSupplierInvoiceTx(tx(), TENANT_ID, invoice.id, USER_ID)).rejects.toThrow(/imputations/i);

    expect(postDocumentEntryTx).not.toHaveBeenCalled();
    expect(appendThirdPartyMovementTx).not.toHaveBeenCalled();
    expect(store.invoices.find(i => i.id === invoice.id)!.status).toBe('DRAFT');
  });

  it('une prestation sans imputation se valide sans controle de somme', async () => {
    const supplier = await createSupplier('SERVICES');
    const invoice = await createDraftInvoice(supplier.id, { amount: 60000, allocations: [] });

    const validated = await validateSupplierInvoiceTx(tx(), TENANT_ID, invoice.id, USER_ID);

    expect(validated.status).toBe('VALIDATED');
    expect(appendThirdPartyMovementTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ billed: 60000 })
    );
  });

  it("evalue l'alerte de depassement sur chaque chantier impute", async () => {
    const supplier = await createSupplier('MATERIALS');
    const { siteId, costCategoryId } = await createSiteAndCategory();
    const invoice = await createDraftInvoice(supplier.id, {
      amount: 500000,
      allocations: [{ siteId, costCategoryId, amount: 500000 }]
    });

    await validateSupplierInvoiceTx(tx(), TENANT_ID, invoice.id, USER_ID);

    // Valider une facture fait monter l'engage du chantier : c'est l'un des
    // trois seuls moments ou une alerte peut naitre. Sans cet appel, le seuil
    // configure par la cliente ne se declencherait jamais par ce chemin — et
    // rien, hors ce test, ne le dirait.
    expect(raiseBudgetAlertIfNeededTx).toHaveBeenCalledWith(expect.anything(), TENANT_ID, siteId);
  });

  it('refuse de revalider une facture deja validee (piece en lecture seule)', async () => {
    const supplier = await createSupplier('SERVICES');
    const invoice = await createDraftInvoice(supplier.id, { amount: 10000, allocations: [] });
    await validateSupplierInvoiceTx(tx(), TENANT_ID, invoice.id, USER_ID);

    await expect(validateSupplierInvoiceTx(tx(), TENANT_ID, invoice.id, USER_ID)).rejects.toThrow();
  });

  it("l'echec d'une ecriture apres que le mouvement a ete pose n'ecrit rien : atomicite", async () => {
    const supplier = await createSupplier('SERVICES');
    const invoice = await createDraftInvoice(supplier.id, { amount: 40000, allocations: [] });

    // Le mouvement du compte reussit, mais la mise a jour finale de la
    // facture echoue : rien ne doit subsister apres le rollback de la
    // transaction englobante.
    const originalUpdate = mockPrisma.supplierInvoice.update;
    mockPrisma.supplierInvoice.update = jest.fn(async () => {
      throw new Error('panne simulee apres le mouvement');
    });

    await expect(
      prisma.$transaction((t: any) => validateSupplierInvoiceTx(t, TENANT_ID, invoice.id, USER_ID))
    ).rejects.toThrow('panne simulee');

    mockPrisma.supplierInvoice.update = originalUpdate;

    expect(store.invoices.find(i => i.id === invoice.id)!.status).toBe('DRAFT');
    expect(store.movements).toHaveLength(0);
    const account = store.thirdPartyAccounts.find(a => a.id === supplier.thirdPartyAccountId)!;
    expect(account.balance).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// D. Reglement
// ---------------------------------------------------------------------------

describe('createSupplierPaymentTx — brouillon', () => {
  it('ne bouge ni le solde du fournisseur, ni le grand livre', async () => {
    const supplier = await createSupplier('SERVICES');
    const invoice = await createDraftInvoice(supplier.id, { amount: 500000, allocations: [] });
    await validateSupplierInvoiceTx(tx(), TENANT_ID, invoice.id, USER_ID);
    postDocumentEntryTx.mockClear();

    const payment = await createSupplierPaymentTx(tx(), TENANT_ID, {
      supplierId: supplier.id,
      paymentDate: new Date('2026-09-10T00:00:00.000Z'),
      amount: 200000,
      allocations: [{ invoiceId: invoice.id, amount: 200000 }],
      createdByUserId: USER_ID
    });

    // Jusqu'au 19 septembre 2026 un reglement naissait valide, ce qui rendait
    // la file de validation vide de reglements par construction : elle les
    // filtre sur l'absence de validation.
    expect(payment.status).toBe('DRAFT');
    expect(payment.amount).toBe(200000);

    // Un reglement saisi n'a encore rien regle.
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
    const account = store.thirdPartyAccounts.find(a => a.id === supplier.thirdPartyAccountId)!;
    expect(account.balance).toBe(500000);
  });

  it('les affectations naissent avec le brouillon, sans mouvement', async () => {
    const supplier = await createSupplier('SERVICES');
    const invoiceA = await createDraftInvoice(supplier.id, { amount: 100000, allocations: [] });
    const invoiceB = await createDraftInvoice(supplier.id, { amount: 150000, allocations: [] });
    await validateSupplierInvoiceTx(tx(), TENANT_ID, invoiceA.id, USER_ID);
    await validateSupplierInvoiceTx(tx(), TENANT_ID, invoiceB.id, USER_ID);
    const mouvementsAvant = store.movements.length;

    const payment = await createSupplierPaymentTx(tx(), TENANT_ID, {
      supplierId: supplier.id,
      paymentDate: new Date('2026-09-11T00:00:00.000Z'),
      amount: 250000,
      allocations: [
        { invoiceId: invoiceA.id, amount: 100000 },
        { invoiceId: invoiceB.id, amount: 150000 }
      ],
      createdByUserId: USER_ID
    });

    expect(payment.allocations).toHaveLength(2);
    expect(store.paymentAllocations).toHaveLength(2);
    expect(store.movements).toHaveLength(mouvementsAvant);
  });

  it('refuse un reglement dont les imputations depassent le montant regle, avant toute ecriture', async () => {
    const supplier = await createSupplier('SERVICES');
    const invoice = await createDraftInvoice(supplier.id, { amount: 500000, allocations: [] });
    await validateSupplierInvoiceTx(tx(), TENANT_ID, invoice.id, USER_ID);
    postDocumentEntryTx.mockClear();

    await expect(
      createSupplierPaymentTx(tx(), TENANT_ID, {
        supplierId: supplier.id,
        paymentDate: new Date('2026-09-12T00:00:00.000Z'),
        amount: 100000,
        allocations: [{ invoiceId: invoice.id, amount: 200000 }],
        createdByUserId: USER_ID
      })
    ).rejects.toThrow();

    expect(postDocumentEntryTx).not.toHaveBeenCalled();
    expect(store.payments).toHaveLength(0);
  });
});

describe('validateSupplierPaymentTx', () => {
  async function saisirReglement(
    supplierId: string,
    amount: number,
    allocations: Array<{ invoiceId: string; amount: number }>,
    extra: { method?: string; treasuryAccountId?: string; paymentDate?: Date } = {}
  ) {
    return createSupplierPaymentTx(tx(), TENANT_ID, {
      supplierId,
      paymentDate: extra.paymentDate ?? new Date('2026-09-10T00:00:00.000Z'),
      amount,
      method: extra.method,
      treasuryAccountId: extra.treasuryAccountId,
      allocations,
      createdByUserId: USER_ID
    });
  }

  /** L'ecriture postee par le dernier reglement valide : ses lignes et sa reference. */
  function derniereEcriture() {
    const appels = postDocumentEntryTx.mock.calls.filter(([, p]) => p.documentType === 'SUPPLIER_PAYMENT');
    return appels[appels.length - 1][1];
  }

  describe('compte de tresorerie et reference (BUG-2026-09-29-002)', () => {
    it.each([
      ['BANK_TRANSFER', 'compte-banque', 'journal-BANK'],
      ['CHECK', 'compte-banque', 'journal-BANK'],
      ['CASH', 'compte-caisse', 'journal-CASH'],
      ['MOBILE_MONEY', 'compte-orange', 'journal-BANK']
    ])('un reglement en %s sort de %s, pas toujours de la caisse', async (method, compte, journal) => {
      const supplier = await createSupplier('SERVICES');
      const draft = await saisirReglement(supplier.id, 200000, [], { method });
      await validateSupplierPaymentTx(tx(), TENANT_ID, draft.id, USER_ID);

      const ecriture = derniereEcriture();
      const sortie = ecriture.lines.find((l: Row) => l.credit);
      expect(sortie.accountId).toBe(compte);
      // Le journal est celui de la tresorerie (banque ou caisse), pas le journal general.
      expect(ecriture.journalId).toBe(journal);
    });

    it('sort du compte de tresorerie CHOISI a la saisie, et le controle de solde porte sur lui', async () => {
      const supplier = await createSupplier('SERVICES');
      const draft = await saisirReglement(supplier.id, 75000, [], {
        method: 'BANK_TRANSFER',
        treasuryAccountId: BANQUE_2_ID
      });
      // Le choix est retenu par le brouillon : il survit jusqu'a la validation,
      // faite par une autre personne, une autre session.
      await validateSupplierPaymentTx(tx(), TENANT_ID, draft.id, 'autre-utilisateur');

      const sortie = derniereEcriture().lines.find((l: Row) => l.credit);
      expect(sortie.accountId).toBe('compte-banque-2');
      expect(assertTreasuryCanPayTx).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_ID,
        expect.objectContaining({ chartOfAccountId: 'compte-banque-2' }),
        75000
      );
    });

    it('refuse a la saisie un compte qui ne correspond pas au mode (virement depuis la caisse)', async () => {
      const supplier = await createSupplier('SERVICES');
      await expect(
        saisirReglement(supplier.id, 10000, [], { method: 'BANK_TRANSFER', treasuryAccountId: 'tresorerie-caisse' })
      ).rejects.toThrow(/ne correspond pas au mode/);
      expect(store.payments).toHaveLength(0);
    });

    it('donne a CHAQUE reglement une reference d ecriture distincte, meme jour, meme fournisseur', async () => {
      const supplier = await createSupplier('SERVICES');
      const references = new Set<string>();
      for (const montant of [200000, 10000, 5000]) {
        const draft = await saisirReglement(supplier.id, montant, [], { method: 'CHECK' });
        await validateSupplierPaymentTx(tx(), TENANT_ID, draft.id, USER_ID);
        references.add(derniereEcriture().reference);
      }
      expect(references.size).toBe(3);
    });

    it('ecrit les libelles avec leurs accents', async () => {
      const supplier = await createSupplier('SERVICES', { name: 'BTP Sahel OI' });
      const draft = await saisirReglement(supplier.id, 10000, [], { method: 'CASH' });
      await validateSupplierPaymentTx(tx(), TENANT_ID, draft.id, USER_ID);
      expect(derniereEcriture().description).toBe('Règlement fournisseur — BTP Sahel OI');
    });
  });

  describe('controle de solde (BUG-2026-09-29-003)', () => {
    it('refuse la validation quand la tresorerie ne couvre pas le reglement : aucune ecriture, aucun mouvement', async () => {
      const supplier = await createSupplier('SERVICES');
      const draft = await saisirReglement(supplier.id, 200000, [], { method: 'CASH' });
      assertTreasuryCanPayTx.mockRejectedValueOnce(
        Object.assign(new Error('Solde insuffisant sur « Caisse principale »'), { status: 400 })
      );
      postDocumentEntryTx.mockClear();
      const mouvementsAvant = store.movements.length;

      await expect(validateSupplierPaymentTx(tx(), TENANT_ID, draft.id, USER_ID)).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('Solde insuffisant')
      });
      expect(postDocumentEntryTx).not.toHaveBeenCalled();
      expect(store.movements).toHaveLength(mouvementsAvant);
      expect(store.payments.find(p => p.id === draft.id)!.validatedAt).toBeNull();
    });
  });

  it('reglement partiel : le solde fournisseur diminue du montant regle', async () => {
    const supplier = await createSupplier('SERVICES');
    const invoice = await createDraftInvoice(supplier.id, { amount: 500000, allocations: [] });
    await validateSupplierInvoiceTx(tx(), TENANT_ID, invoice.id, USER_ID);

    const draft = await saisirReglement(supplier.id, 200000, [{ invoiceId: invoice.id, amount: 200000 }]);
    const payment = await validateSupplierPaymentTx(tx(), TENANT_ID, draft.id, USER_ID);

    expect(payment.status).toBe('VALIDATED');
    const account = store.thirdPartyAccounts.find(a => a.id === supplier.thirdPartyAccountId)!;
    expect(account.balance).toBe(300000); // 500000 factures - 200000 regles
  });

  it('reglement couvrant deux factures en une seule fois', async () => {
    const supplier = await createSupplier('SERVICES');
    const invoiceA = await createDraftInvoice(supplier.id, { amount: 100000, allocations: [] });
    const invoiceB = await createDraftInvoice(supplier.id, { amount: 150000, allocations: [] });
    await validateSupplierInvoiceTx(tx(), TENANT_ID, invoiceA.id, USER_ID);
    await validateSupplierInvoiceTx(tx(), TENANT_ID, invoiceB.id, USER_ID);

    const draft = await saisirReglement(supplier.id, 250000, [
      { invoiceId: invoiceA.id, amount: 100000 },
      { invoiceId: invoiceB.id, amount: 150000 }
    ]);
    const payment = await validateSupplierPaymentTx(tx(), TENANT_ID, draft.id, USER_ID);

    expect(payment.allocations).toHaveLength(2);
    const account = store.thirdPartyAccounts.find(a => a.id === supplier.thirdPartyAccountId)!;
    expect(account.balance).toBe(0);
  });

  it('un acompte sans facture en face rend le compte fournisseur debiteur', async () => {
    const supplier = await createSupplier('SERVICES');

    const draft = await saisirReglement(supplier.id, 80000, []);
    await validateSupplierPaymentTx(tx(), TENANT_ID, draft.id, USER_ID);

    const account = store.thirdPartyAccounts.find(a => a.id === supplier.thirdPartyAccountId)!;
    // Positif = nous lui devons ; un acompte sans facture rend le solde
    // negatif = le fournisseur nous doit (symetrique de l'avance locataire).
    expect(account.balance).toBe(-80000);
  });

  it('refuse de valider deux fois (immutabilite, principe P-6)', async () => {
    const supplier = await createSupplier('SERVICES');
    const draft = await saisirReglement(supplier.id, 50000, []);
    await validateSupplierPaymentTx(tx(), TENANT_ID, draft.id, USER_ID);

    await expect(validateSupplierPaymentTx(tx(), TENANT_ID, draft.id, USER_ID)).rejects.toThrow(/deja valide/i);
  });

  it('refuse de valider un reglement dont la facture visee a ete annulee entre-temps', async () => {
    const supplier = await createSupplier('SERVICES');
    const invoice = await createDraftInvoice(supplier.id, { amount: 500000, allocations: [] });
    await validateSupplierInvoiceTx(tx(), TENANT_ID, invoice.id, USER_ID);

    const draft = await saisirReglement(supplier.id, 200000, [{ invoiceId: invoice.id, amount: 200000 }]);

    // La facture est annulee apres la saisie du reglement, avant sa validation.
    // Le controle de la saisie ne pouvait pas le voir : il faut le refaire ici.
    const row = store.invoices.find(i => i.id === invoice.id)!;
    row.status = 'VOIDED';
    postDocumentEntryTx.mockClear();

    await expect(validateSupplierPaymentTx(tx(), TENANT_ID, draft.id, USER_ID)).rejects.toThrow(/plus validee/i);
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// E. Balance fournisseurs
// ---------------------------------------------------------------------------

describe('getSuppliersBalance', () => {
  it('agrege facture/regle sur la periode, et le solde courant en dehors de la periode', async () => {
    const supplier = await createSupplier('SERVICES');
    const invoiceJanvier = await createDraftInvoice(supplier.id, { amount: 100000, allocations: [] });
    await validateSupplierInvoiceTx(tx(), TENANT_ID, invoiceJanvier.id, USER_ID);
    // Force la date du mouvement de janvier pour le test de periode.
    store.movements[0].movementDate = new Date('2026-01-15T00:00:00.000Z');

    const invoiceSeptembre = await createDraftInvoice(supplier.id, { amount: 40000, allocations: [] });
    await validateSupplierInvoiceTx(tx(), TENANT_ID, invoiceSeptembre.id, USER_ID);
    store.movements[1].movementDate = new Date('2026-09-15T00:00:00.000Z');

    const balance = await getSuppliersBalance(TENANT_ID, {
      range: { from: new Date('2026-09-01T00:00:00.000Z'), to: new Date('2026-09-30T00:00:00.000Z') }
    });

    expect(balance.lines).toHaveLength(1);
    expect(balance.lines[0].totalBilled).toBe(40000); // seule l'activite de septembre
    // Le solde, lui, porte le solde COURANT du compte (140000), pas
    // l'activite de la periode : un fournisseur sans mouvement dans la
    // periode ne doit jamais voir sa dette disparaitre de la balance.
    expect(balance.lines[0].balance).toBe(140000);
    expect(balance.totalBalance).toBe(140000);
  });

  it('filtre par chantier : seules les factures rattachees au chantier comptent', async () => {
    const supplier = await createSupplier('MATERIALS');
    const { siteId: siteA, costCategoryId } = await createSiteAndCategory();
    const { siteId: siteB } = await createSiteAndCategory();

    const invoiceSiteA = await createDraftInvoice(supplier.id, {
      amount: 100000,
      allocations: [{ siteId: siteA, costCategoryId, amount: 100000 }]
    });
    const invoiceSiteB = await createDraftInvoice(supplier.id, {
      amount: 60000,
      allocations: [{ siteId: siteB, costCategoryId, amount: 60000 }]
    });
    await validateSupplierInvoiceTx(tx(), TENANT_ID, invoiceSiteA.id, USER_ID);
    await validateSupplierInvoiceTx(tx(), TENANT_ID, invoiceSiteB.id, USER_ID);

    const balance = await getSuppliersBalance(TENANT_ID, { siteId: siteA });

    expect(balance.lines).toHaveLength(1);
    expect(balance.lines[0].totalBilled).toBe(100000);
  });

  it('le total de controle est la somme des soldes des lignes', async () => {
    const supplierA = await createSupplier('SERVICES', { name: 'Alpha' });
    const supplierB = await createSupplier('SERVICES', { name: 'Beta' });
    const invoiceA = await createDraftInvoice(supplierA.id, { amount: 100000, allocations: [] });
    const invoiceB = await createDraftInvoice(supplierB.id, { amount: 250000, allocations: [] });
    await validateSupplierInvoiceTx(tx(), TENANT_ID, invoiceA.id, USER_ID);
    await validateSupplierInvoiceTx(tx(), TENANT_ID, invoiceB.id, USER_ID);

    const balance = await getSuppliersBalance(TENANT_ID);

    expect(balance.lines).toHaveLength(2);
    expect(balance.totalBalance).toBe(350000);
  });
});

// ---------------------------------------------------------------------------
// Chantier clos — le CABLAGE de la garde du sous-lot 6, pas la garde elle-meme
// ---------------------------------------------------------------------------
//
// `assertSiteOpenTx` est testee chez elle. Ce qui n'etait teste nulle part,
// c'est qu'elle soit APPELEE d'ici : une garde ecrite, exportee, documentee et
// branchee nulle part ne protege rien, et rien dans la suite ne l'aurait dit.

describe('chantier cloture — refus d imputer', () => {
  it('refuse une facture imputee a un chantier clos, a la saisie', async () => {
    const supplier = await createSupplier('MATERIALS', { name: 'Quincaillerie du Plateau' });
    const { siteId, costCategoryId } = await createSiteAndCategory();
    // On CLOT le chantier deja seme par `createSiteAndCategory` (une seconde
    // ligne portant le meme id serait invisible : `constructionSite.findFirst`
    // rend la premiere qui correspond, l'ouverte).
    const site = store.constructionSites.find(c => c.id === siteId)!;
    site.closedAt = new Date('2026-08-31T00:00:00.000Z');

    await expect(
      createDraftInvoice(supplier.id, { amount: 120000, allocations: [{ siteId, costCategoryId, amount: 120000 }] })
    ).rejects.toThrow(/clôturé/);

    // Rien n'a ete ecrit : la transaction refuse avant, pas apres.
    expect(store.costAllocations).toHaveLength(0);
  });

  it('laisse passer un chantier ouvert', async () => {
    const supplier = await createSupplier('MATERIALS', { name: 'Quincaillerie de Cocody' });
    const { siteId, costCategoryId } = await createSiteAndCategory();

    const invoice = await createDraftInvoice(supplier.id, {
      amount: 120000,
      allocations: [{ siteId, costCategoryId, amount: 120000 }]
    });

    expect(invoice.id).toBeTruthy();
    expect(store.costAllocations).toHaveLength(1);
  });

  // ---------------------------------------------------------------------
  // Audit multi-tenant du 24 septembre 2026 (lot B1) : une agence ne doit
  // plus pouvoir imputer sa facture au chantier — ni au poste de dépense —
  // d'une AUTRE agence. Avant ce jour, `assertSiteOpenTx` se taisait quand le
  // chantier n'existait pas pour l'agence, et `costCategoryId` n'était vérifié
  // nulle part : les deux références passaient, silencieusement.
  // ---------------------------------------------------------------------

  it("refuse un siteId d'une AUTRE agence (IDOR) — NotFoundError, avant toute ecriture", async () => {
    const supplier = await createSupplier('MATERIALS', { name: 'Quincaillerie de Kaloum' });
    const { siteId: siteAutreAgence } = await createSiteAndCategory('autre-tenant');
    const { costCategoryId } = await createSiteAndCategory();

    await expect(
      createDraftInvoice(supplier.id, {
        amount: 120000,
        allocations: [{ siteId: siteAutreAgence, costCategoryId, amount: 120000 }]
      })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(store.invoices).toHaveLength(0);
    expect(store.costAllocations).toHaveLength(0);
  });

  it("refuse un costCategoryId d'une AUTRE agence (IDOR) — NotFoundError, avant toute ecriture", async () => {
    const supplier = await createSupplier('MATERIALS', { name: 'Quincaillerie de Matam' });
    const { siteId } = await createSiteAndCategory();
    const { costCategoryId: categorieAutreAgence } = await createSiteAndCategory('autre-tenant');

    await expect(
      createDraftInvoice(supplier.id, {
        amount: 120000,
        allocations: [{ siteId, costCategoryId: categorieAutreAgence, amount: 120000 }]
      })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(store.invoices).toHaveLength(0);
    expect(store.costAllocations).toHaveLength(0);
  });

  it('refuse un siteId qui ne designe aucun chantier — meme erreur qu une reference d une autre agence', async () => {
    const supplier = await createSupplier('MATERIALS', { name: 'Quincaillerie de Ratoma' });
    const { costCategoryId } = await createSiteAndCategory();

    await expect(
      createDraftInvoice(supplier.id, {
        amount: 120000,
        allocations: [{ siteId: 'chantier-fantome', costCategoryId, amount: 120000 }]
      })
    ).rejects.toMatchObject({ statusCode: 404 });
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

  it('aucune chaine renvoyee par les fonctions fournisseurs ne contient "debit" ou "credit"', async () => {
    const supplier = await createSupplier('MATERIALS', { name: 'Quincaillerie Faso' });
    const { siteId, costCategoryId } = await createSiteAndCategory();
    const invoice = await createDraftInvoice(supplier.id, {
      amount: 120000,
      allocations: [{ siteId, costCategoryId, amount: 120000 }]
    });
    const validated = await validateSupplierInvoiceTx(tx(), TENANT_ID, invoice.id, USER_ID);
    const payment = await createSupplierPaymentTx(tx(), TENANT_ID, {
      supplierId: supplier.id,
      paymentDate: new Date('2026-09-20T00:00:00.000Z'),
      amount: 50000,
      allocations: [{ invoiceId: invoice.id, amount: 50000 }],
      createdByUserId: USER_ID
    });
    const balance = await getSuppliersBalance(TENANT_ID);

    const strings: string[] = [];
    collectStrings(supplier, strings);
    collectStrings(validated, strings);
    collectStrings(payment, strings);
    collectStrings(balance, strings);

    for (const value of strings) {
      const normalized = stripAccents(value).toLowerCase();
      expect(normalized).not.toMatch(/debit/);
      expect(normalized).not.toMatch(/credit/);
    }
  });
});
