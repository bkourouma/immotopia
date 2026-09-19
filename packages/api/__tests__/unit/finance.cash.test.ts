/**
 * Tests des pièces de caisse (`lib/finance/cash.ts`) et de la file de
 * validation (`lib/finance/validation-queue.ts`).
 *
 * `validation-queue.ts` n'a pas de fichier de test dédié : il n'est pas dans
 * le territoire de fichiers confié à cet agent (seuls `sites.ts`, `cash.ts`,
 * `validation-queue.ts`, `finance.sites.test.ts` et `finance.cash.test.ts` le
 * sont). Comme la file lit essentiellement les mêmes pièces de caisse que ce
 * fichier construit déjà, ses tests vivent ici plutôt que d'inventer un
 * sixième fichier hors périmètre.
 *
 * `postDocumentEntryTx` (`accounting.ts`) est mocké — ce fichier vérifie
 * comment `cash.ts` l'appelle (lignes équilibrées, document d'origine),
 * jamais ce qu'il calcule en interne. Le magasin en mémoire simule aussi la
 * commande brute : la seule que `cash.ts` envoie est le verrou consultatif
 * `pg_advisory_xact_lock(hashtext(tenantId))`, que le mock transforme en un
 * vrai mutex asynchrone par tenant, relâché quand la transaction englobante se
 * termine (succès ou échec) — exactement la sémantique Postgres d'un verrou
 * `_xact_`, sans base réelle.
 *
 * Elle est exposée sur `$executeRaw`, et **`$queryRaw` lève**. Ce n'est pas un
 * détail de mise en œuvre. `pg_advisory_xact_lock` renvoie `void`, un type que
 * le désérialiseur de `$queryRaw` ne sait pas lire : le code appelait d'abord
 * `$queryRaw` et échouait donc à *chaque* création de pièce de caisse en
 * production, pendant que ce fichier était vert. Une doublure qui accepte tout
 * ne protège de rien ; celle-ci reproduit le refus de Postgres, pour que le
 * défaut ne puisse plus repasser sans qu'un test tombe.
 */

const postDocumentEntryTx = jest.fn();

// Le plan de comptes operationnel vit desormais dans `accounting.ts`, seul.
// Ce fichier en portait sa propre copie, retiree a l'integration : elle posait
// les charges de chantier au compte 604 la ou le moteur les pose au 605.
const COMPTES_OPERATIONNELS = new Map<string, string>([
  ['401', 'compte-401'],
  ['411', 'compte-411'],
  ['571', 'compte-571'],
  ['601', 'compte-601'],
  ['605', 'compte-605']
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

jest.mock('../../src/lib/finance/accounting', () => ({
  postDocumentEntryTx: (...args: any[]) => postDocumentEntryTx(...args),
  ensureOperationalJournalTx: async () => 'journal-caisse',
  ensureOperationalChartOfAccountsTx: async () => COMPTES_OPERATIONNELS
}));

// ---------------------------------------------------------------------------
// Magasin en mémoire + verrou consultatif simulé
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

const store = {
  sites: [] as Row[],
  categories: [] as Row[],
  vouchers: [] as Row[],
  allocations: [] as Row[],
  journals: [] as Row[],
  accounts: [] as Row[],
  invoices: [] as Row[],
  payments: [] as Row[],
  users: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

/**
 * Le code de production range les montants en `Decimal` (`@prisma/client/runtime/library`) ;
 * le magasin en mémoire doit rester clonable par `structuredClone` (utilisé
 * par le `$transaction` mocké pour un vrai rollback) : on les convertit donc
 * en `number` à l'écriture, comme le fait déjà `finance.billing-run.test.ts`.
 */
function toPlainRow(data: Row): Row {
  const plain: Row = {};
  for (const [key, value] of Object.entries(data)) {
    plain[key] =
      value !== null && typeof value === 'object' && typeof value.toNumber === 'function' ? Number(value) : value;
  }
  return plain;
}

/**
 * Mutex asynchrone par clé : reproduit `pg_advisory_xact_lock`, relâché à la
 * fin de la transaction englobante (voir `$transaction` plus bas), pas au
 * retour de `$queryRaw` lui-même — c'est justement tout l'intérêt d'un verrou
 * « xact » plutôt que d'un verrou de session ordinaire.
 */
const lockTails = new Map<string, Promise<void>>();

function acquireLock(key: string): { wait: Promise<void>; release: () => void } {
  const previous = lockTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>(resolve => {
    release = resolve;
  });
  const myTurn = previous.then(() => undefined);
  lockTails.set(
    key,
    myTurn.then(() => held)
  );
  return { wait: myTurn, release };
}

function makeExecuteRaw(pendingReleases: Array<() => void>) {
  return jest.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
    const sql = strings.join('?');
    if (sql.includes('pg_advisory_xact_lock')) {
      const key = String(values[0]);
      const { wait, release } = acquireLock(key);
      pendingReleases.push(release);
      await wait;
      // `$executeRaw` rend un nombre de lignes affectees, jamais des lignes.
      return 1;
    }
    return 0;
  });
}

/**
 * Reproduit le refus de Postgres sur une commande sans colonnes lisibles.
 *
 * Voir l'en-tete du fichier : c'est ce refus, invisible tant que la doublure
 * acceptait tout, qui cassait la caisse en production.
 */
function makeQueryRawQuiRefuse() {
  return jest.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join('?');
    if (sql.includes('pg_advisory_xact_lock')) {
      throw new Error(
        "Raw query failed. Message: `Failed to deserialize column of type 'void'.` " +
          'Une commande qui ne rend aucune colonne se passe par $executeRaw, pas par $queryRaw.'
      );
    }
    return [];
  });
}

function makeTx(pendingReleases: Array<() => void>): Row {
  return {
    ...mockPrisma,
    $executeRaw: makeExecuteRaw(pendingReleases),
    $queryRaw: makeQueryRawQuiRefuse()
  };
}

const mockPrisma: Row = {
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

  cashVoucher: {
    create: jest.fn(async ({ data }: Row) => {
      const created = {
        id: nextId('bc'),
        validatedAt: null,
        validatedByUserId: null,
        journalEntryId: null,
        currency: 'XOF',
        createdAt: new Date(),
        ...toPlainRow(data)
      };
      store.vouchers.push(created);
      return created;
    }),
    findFirst: jest.fn(
      async ({ where }: Row) => store.vouchers.find(v => v.id === where.id && v.tenantId === where.tenantId) ?? null
    ),
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = store.vouchers.filter(v => v.tenantId === where.tenantId);
      if (where.createdByUserId) rows = rows.filter(v => v.createdByUserId === where.createdByUserId);
      if (where.validatedAt === null) rows = rows.filter(v => v.validatedAt === null);
      return rows.map(v => ({ ...v, createdBy: store.users.find(u => u.id === v.createdByUserId) ?? null }));
    }),
    aggregate: jest.fn(async ({ where }: Row) => {
      const rows = store.vouchers.filter(v => v.tenantId === where.tenantId && v.voucherYear === where.voucherYear);
      const max = rows.reduce((m, r) => Math.max(m, r.voucherNumber), 0);
      return { _max: { voucherNumber: rows.length ? max : null } };
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.vouchers.filter(
        v =>
          v.id === where.id &&
          v.tenantId === where.tenantId &&
          (where.validatedAt === undefined || v.validatedAt === where.validatedAt)
      );
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    })
  },

  costAllocation: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('alloc'), voidedAt: null, createdAt: new Date(), ...toPlainRow(data) };
      store.allocations.push(created);
      return created;
    })
  },

  accountingJournal: {
    findFirst: jest.fn(
      async ({ where }: Row) =>
        store.journals.find(
          j =>
            j.tenantId === where.tenantId &&
            j.scope === where.scope &&
            j.fiscalYear === where.fiscalYear &&
            j.journalType === where.journalType
        ) ?? null
    ),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('journal'), ...data };
      store.journals.push(created);
      return created;
    })
  },

  chartOfAccount: {
    findFirst: jest.fn(
      async ({ where }: Row) =>
        store.accounts.find(
          a => a.tenantId === where.tenantId && a.scope === where.scope && a.accountNumber === where.accountNumber
        ) ?? null
    ),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('acct'), ...data };
      store.accounts.push(created);
      return created;
    })
  },

  supplierInvoice: {
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = store.invoices.filter(i => i.tenantId === where.tenantId && i.status === 'DRAFT');
      if (where.createdByUserId) rows = rows.filter(i => i.createdByUserId === where.createdByUserId);
      return rows.map(i => ({ ...i, createdBy: store.users.find(u => u.id === i.createdByUserId) ?? null }));
    })
  },

  supplierPayment: {
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = store.payments.filter(p => p.tenantId === where.tenantId && p.validatedAt === null);
      if (where.createdByUserId) rows = rows.filter(p => p.createdByUserId === where.createdByUserId);
      return rows.map(p => ({ ...p, createdBy: store.users.find(u => u.id === p.createdByUserId) ?? null }));
    })
  }
};

/**
 * `$transaction` mocké dans l'esprit de `finance.billing-run.test.ts`
 * (rollback par copie profonde), mais chaque appel reçoit ici son PROPRE
 * `tx` (voir `makeTx`) : c'est ce qui permet à N transactions concurrentes de
 * poser chacune leur verrou consultatif sans se marcher dessus au niveau du
 * mock lui-même, tout en partageant le même magasin sous-jacent — exactement
 * ce qu'une vraie base ferait avec N connexions.
 */
async function runTransaction<T>(callback: (tx: Row) => Promise<T>): Promise<T> {
  const snapshot = {
    sites: structuredClone(store.sites),
    categories: structuredClone(store.categories),
    vouchers: structuredClone(store.vouchers),
    allocations: structuredClone(store.allocations),
    journals: structuredClone(store.journals),
    accounts: structuredClone(store.accounts),
    seq: store.seq
  };
  const releases: Array<() => void> = [];
  const tx = makeTx(releases);
  try {
    const result = await callback(tx);
    releases.forEach(release => release());
    return result;
  } catch (error) {
    store.sites = snapshot.sites;
    store.categories = snapshot.categories;
    store.vouchers = snapshot.vouchers;
    store.allocations = snapshot.allocations;
    store.journals = snapshot.journals;
    store.accounts = snapshot.accounts;
    store.seq = snapshot.seq;
    releases.forEach(release => release());
    throw error;
  }
}

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

import { createCashVoucherTx, validateCashVoucherTx, formatCashVoucherNumber } from '../../src/lib/finance/cash';
import { getValidationQueue } from '../../src/lib/finance/validation-queue';

const TENANT_ID = 'tenant-1';
const GESTIONNAIRE_ID = 'user-gestionnaire';
const DIRIGEANT_ID = 'user-dirigeant';

function seedSite(overrides: Partial<Row> = {}): Row {
  const site = { id: nextId('site'), tenantId: TENANT_ID, name: 'Chantier Kaporo', ...overrides };
  store.sites.push(site);
  return site;
}

function seedCategory(overrides: Partial<Row> = {}): Row {
  const category = { id: nextId('cat'), tenantId: TENANT_ID, label: 'Main-d’œuvre', isActive: true, ...overrides };
  store.categories.push(category);
  return category;
}

async function createVoucher(site: Row, category: Row, overrides: Partial<Row> = {}) {
  return runTransaction((tx: any) =>
    createCashVoucherTx(tx, TENANT_ID, {
      siteId: site.id,
      costCategoryId: category.id,
      beneficiary: 'Ouvrier Doumbia',
      amount: 15000,
      voucherDate: new Date('2026-03-01T00:00:00.000Z'),
      reason: 'Journée de coulage',
      createdByUserId: GESTIONNAIRE_ID,
      ...overrides
    })
  );
}

async function validateVoucher(voucherId: string) {
  return runTransaction((tx: any) => validateCashVoucherTx(tx, TENANT_ID, voucherId, DIRIGEANT_ID));
}

beforeEach(() => {
  jest.clearAllMocks();
  raiseBudgetAlertIfNeededTx.mockResolvedValue(null);
  store.sites = [];
  store.categories = [];
  store.vouchers = [];
  store.allocations = [];
  store.journals = [];
  store.accounts = [];
  store.invoices = [];
  store.payments = [];
  store.users = [
    { id: GESTIONNAIRE_ID, fullName: 'Fatoumata Camara', email: 'f.camara@example.gn' },
    { id: DIRIGEANT_ID, fullName: 'Ibrahima Sory', email: 'i.sory@example.gn' }
  ];
  store.seq = 0;
  lockTails.clear();

  postDocumentEntryTx.mockImplementation(async () => ({ entryId: nextId('entry'), totalDebit: 0, totalCredit: 0 }));
});

describe('createCashVoucherTx — brouillon', () => {
  it("n'écrit ni écriture ni imputation, et ne reçoit aucun numéro", async () => {
    const site = seedSite();
    const category = seedCategory();

    const voucher = await createVoucher(site, category);

    expect(voucher.status).toBe('DRAFT');
    // Le numéro est attribué à la validation, pas ici : un brouillon
    // abandonné ne doit consommer aucun rang, sans quoi le carnet garde un
    // trou que personne ne peut plus expliquer (décision du 19/09/2026).
    expect(voucher.number).toBeNull();
    expect(voucher.validatedAt).toBeNull();
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
    expect(store.allocations).toHaveLength(0);
  });

  it('un brouillon abandonné ne consomme aucun numéro', async () => {
    const site = seedSite();
    const category = seedCategory();

    // Trois brouillons, dont deux resteront tels quels. Sous l'ancienne règle
    // ils auraient pris les rangs 1, 2 et 3, et la pièce validée serait
    // repartie au 4 en laissant trois trous derrière elle.
    await createVoucher(site, category);
    await createVoucher(site, category);
    const troisieme = await createVoucher(site, category);

    const validee = await validateVoucher(troisieme.id);

    expect(validee.number).toBe(formatCashVoucherNumber(2026, 1));
  });

  it('refuse un montant nul ou négatif', async () => {
    const site = seedSite();
    const category = seedCategory();
    await expect(createVoucher(site, category, { amount: 0 })).rejects.toThrow(/positif/i);
  });

  it('refuse un poste de dépense désactivé', async () => {
    const site = seedSite();
    const category = seedCategory({ isActive: false });
    await expect(createVoucher(site, category)).rejects.toThrow(/désactivé/i);
  });

  it('numérote de façon croissante, deux validations successives du même tenant', async () => {
    const site = seedSite();
    const category = seedCategory();

    const first = await createVoucher(site, category);
    const second = await createVoucher(site, category);

    const firstValidee = await validateVoucher(first.id);
    const secondValidee = await validateVoucher(second.id);

    expect(firstValidee.number).toBe(formatCashVoucherNumber(2026, 1));
    expect(secondValidee.number).toBe(formatCashVoucherNumber(2026, 2));
  });

  it("l'ordre des numéros suit celui des validations, pas celui des saisies", async () => {
    const site = seedSite();
    const category = seedCategory();

    const premierSaisi = await createVoucher(site, category);
    const secondSaisi = await createVoucher(site, category);

    // Le validateur prend la seconde pièce d'abord : c'est elle qui reçoit le
    // rang 1. Le carnet est celui des pièces validées, pas celui des saisies.
    const secondValide = await validateVoucher(secondSaisi.id);
    const premierValide = await validateVoucher(premierSaisi.id);

    expect(secondValide.number).toBe(formatCashVoucherNumber(2026, 1));
    expect(premierValide.number).toBe(formatCashVoucherNumber(2026, 2));
  });
});

describe('validateCashVoucherTx — écriture et imputation, en une transaction', () => {
  it('valide une pièce brouillon : écriture équilibrée, imputation, statut VALIDATED', async () => {
    const site = seedSite();
    const category = seedCategory();
    const voucher = await createVoucher(site, category, { amount: 20000 });

    const validated = await runTransaction((tx: any) => validateCashVoucherTx(tx, TENANT_ID, voucher.id, DIRIGEANT_ID));

    expect(validated.status).toBe('VALIDATED');
    expect(validated.validatedByUserId).toBe(DIRIGEANT_ID);
    expect(validated.validatedAt).not.toBeNull();

    expect(postDocumentEntryTx).toHaveBeenCalledTimes(1);
    const [, params] = postDocumentEntryTx.mock.calls[0];
    expect(params.documentType).toBe('CASH_VOUCHER');
    expect(params.documentId).toBe(voucher.id);
    expect(params.lines).toEqual([
      expect.objectContaining({ debit: 20000 }),
      expect.objectContaining({ credit: 20000 })
    ]);
    // Aucun libellé de ligne ne doit employer les mots interdits.
    for (const line of params.lines) {
      expect(line.label.toLowerCase()).not.toMatch(/débit|crédit/);
    }

    expect(store.allocations).toHaveLength(1);
    expect(store.allocations[0]).toMatchObject({
      siteId: site.id,
      costCategoryId: category.id,
      sourceType: 'CASH_VOUCHER',
      sourceId: voucher.id
    });
  });

  it("evalue l'alerte de depassement sur le chantier de la piece", async () => {
    const site = seedSite();
    const category = seedCategory();
    const piece = await createVoucher(site, category);

    await validateVoucher(piece.id);

    // Meme raison qu'a la validation d'une facture : la piece de caisse fait
    // monter l'engage du chantier.
    expect(raiseBudgetAlertIfNeededTx).toHaveBeenCalledWith(expect.anything(), TENANT_ID, site.id);
  });

  it('refuse de valider une pièce déjà validée (immutabilité, principe P-6)', async () => {
    const site = seedSite();
    const category = seedCategory();
    const voucher = await createVoucher(site, category);
    await runTransaction((tx: any) => validateCashVoucherTx(tx, TENANT_ID, voucher.id, DIRIGEANT_ID));

    await expect(
      runTransaction((tx: any) => validateCashVoucherTx(tx, TENANT_ID, voucher.id, DIRIGEANT_ID))
    ).rejects.toThrow(/déjà validée/i);
  });

  it("réutilise le même journal et les mêmes comptes d'une validation à l'autre", async () => {
    const site = seedSite();
    const category = seedCategory();
    const voucherA = await createVoucher(site, category);
    const voucherB = await createVoucher(site, category);

    await runTransaction((tx: any) => validateCashVoucherTx(tx, TENANT_ID, voucherA.id, DIRIGEANT_ID));
    await runTransaction((tx: any) => validateCashVoucherTx(tx, TENANT_ID, voucherB.id, DIRIGEANT_ID));

    // L'intention du test n'a pas change, son niveau si. L'amorcage du plan de
    // comptes appartient desormais a `accounting.ts`, seul : ce fichier ne cree
    // plus ni journal ni compte, il demande les siens au moteur. On verifie
    // donc que les deux validations ecrivent dans le MEME journal et sur les
    // MEMES comptes, ce qui est la propriete qui compte — plutot que de
    // compter des lignes dans un magasin que ce fichier ne remplit plus.
    expect(postDocumentEntryTx).toHaveBeenCalledTimes(2);

    const [premier, second] = postDocumentEntryTx.mock.calls.map((appel: any[]) => appel[1]);
    expect(premier.journalId).toBe(second.journalId);
    expect(premier.lines.map((l: any) => l.accountId).sort()).toEqual(second.lines.map((l: any) => l.accountId).sort());

    expect(store.journals).toHaveLength(0);
    expect(store.accounts).toHaveLength(0);
  });
});

describe('validateCashVoucherTx — numérotation sous concurrence (FR-022)', () => {
  it("n'attribue jamais deux fois le même numéro à des validations simultanées du même tenant", async () => {
    const site = seedSite();
    const category = seedCategory();
    const CONCURRENT = 25;

    // Les brouillons sont saisis d'abord, tranquillement : la saisie ne tire
    // plus de numéro et ne prend plus le verrou.
    const drafts = [];
    for (let i = 0; i < CONCURRENT; i += 1) {
      drafts.push(await createVoucher(site, category));
    }

    // Les validations, elles, partent toutes en même temps : sans le verrou,
    // chacune lirait le même « dernier numéro » avant qu'aucune n'ait écrit le
    // sien, et plusieurs recevraient le même rang. C'est le scénario que la
    // spécification demande de prouver (US10, scénario 2), déplacé de
    // l'émission vers la validation avec la règle qu'il protège.
    const vouchers = await Promise.all(drafts.map(draft => validateVoucher(draft.id)));

    const numbers = vouchers.map(v => v.number);
    const uniqueNumbers = new Set(numbers);

    expect(uniqueNumbers.size).toBe(CONCURRENT);
    expect([...uniqueNumbers].sort()).toEqual(
      Array.from({ length: CONCURRENT }, (_, i) => formatCashVoucherNumber(2026, i + 1)).sort()
    );
    expect(store.vouchers).toHaveLength(CONCURRENT);
  });

  it('deux années différentes du même tenant repartent chacune de 1', async () => {
    const site = seedSite();
    const category = seedCategory();

    // L'année de la séquence suit la DATE DE LA PIÈCE, jamais le jour de la
    // validation : les deux pièces ci-dessous sont validées le même jour, et
    // tombent pourtant dans deux carnets distincts.
    const d2026 = await createVoucher(site, category, { voucherDate: new Date('2026-12-31T00:00:00.000Z') });
    const d2027 = await createVoucher(site, category, { voucherDate: new Date('2027-01-02T00:00:00.000Z') });

    const v2026 = await validateVoucher(d2026.id);
    const v2027 = await validateVoucher(d2027.id);

    expect(v2026.number).toBe(formatCashVoucherNumber(2026, 1));
    expect(v2027.number).toBe(formatCashVoucherNumber(2027, 1));
  });
});

describe('getValidationQueue — nomme la saisisseuse', () => {
  it('regroupe factures, règlements et pièces de caisse en attente, avec le nom de qui les a saisies', async () => {
    const site = seedSite();
    const category = seedCategory();
    const voucher = await createVoucher(site, category);

    store.invoices.push({
      id: nextId('inv'),
      tenantId: TENANT_ID,
      reference: 'FAC-2026-002',
      amount: 80000,
      currency: 'XOF',
      status: 'DRAFT',
      createdAt: new Date('2026-03-02T00:00:00.000Z'),
      createdByUserId: GESTIONNAIRE_ID,
      supplier: { name: 'SARL Ciment Guinée' }
    });

    store.payments.push({
      id: nextId('pay'),
      tenantId: TENANT_ID,
      amount: 40000,
      currency: 'XOF',
      validatedAt: null,
      createdAt: new Date('2026-03-03T00:00:00.000Z'),
      createdByUserId: GESTIONNAIRE_ID,
      supplier: { name: 'Quincaillerie Niger' }
    });

    const queue = await getValidationQueue(TENANT_ID);

    expect(queue).toHaveLength(3);
    for (const item of queue) {
      expect(item.createdByLabel).toBe('Fatoumata Camara');
    }
    expect(queue.map(item => item.documentType).sort()).toEqual([
      'CASH_VOUCHER',
      'SUPPLIER_INVOICE',
      'SUPPLIER_PAYMENT'
    ]);
    const voucherItem = queue.find(item => item.documentId === voucher.id);
    expect(voucherItem?.label).toContain('Ouvrier Doumbia');
  });

  it('filtre par saisisseuse', async () => {
    const site = seedSite();
    const category = seedCategory();
    await createVoucher(site, category, { createdByUserId: GESTIONNAIRE_ID });
    await createVoucher(site, category, { createdByUserId: DIRIGEANT_ID });

    const queue = await getValidationQueue(TENANT_ID, { createdByUserId: DIRIGEANT_ID });

    expect(queue).toHaveLength(1);
    expect(queue[0].createdByUserId).toBe(DIRIGEANT_ID);
    expect(queue[0].createdByLabel).toBe('Ibrahima Sory');
  });

  it('une pièce validée quitte la file', async () => {
    const site = seedSite();
    const category = seedCategory();
    const voucher = await createVoucher(site, category);
    await runTransaction((tx: any) => validateCashVoucherTx(tx, TENANT_ID, voucher.id, DIRIGEANT_ID));

    const queue = await getValidationQueue(TENANT_ID);
    expect(queue.find(item => item.documentId === voucher.id)).toBeUndefined();
  });
});
