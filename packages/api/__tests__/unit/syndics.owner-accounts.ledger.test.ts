/**
 * Tests de caracterisation du grand livre des comptes de lot (compte coproprietaire).
 *
 * Objectif : figer le comportement ACTUEL de `appendOwnerAccountTransactionTx`
 * (calcul du solde courant) et des fonctions publiques qui l'exposent, avant la
 * generalisation multi-tenant du lot 2. Au lot 0, aucun test d'ici ne jugeait le
 * comportement : il le decrivait, y compris quand il surprenait.
 *
 * Le lot 2 fait evoluer les deux cas du releve de compte qui repliaient
 * ouverture et cloture sur le solde courant (defaut n°3 du §6.1 bis du plan) ;
 * chacun porte au-dessus de lui le commentaire qui dit pourquoi. Le cas
 * « roundMoney arrondit 100.005 vers le bas » (defaut n°4) reste inchange : la
 * precision a l'unite decidee pour le franc CFA n'est appliquee qu'au chemin
 * d'ecriture du lot 2 (`roundMoneyXof`), et la copropriete continue de compter
 * en centimes comme ses donnees deja en base.
 *
 * Prisma est remplace par un magasin en memoire : aucune base n'est requise.
 */

jest.mock('@prisma/client', () => {
  type Row = Record<string, any>;

  const store = {
    syndicates: [] as Row[],
    lots: [] as Row[],
    accounts: [] as Row[],
    transactions: [] as Row[],
    seq: 0
  };

  const nextSeq = () => {
    store.seq += 1;
    return store.seq;
  };

  /** Horodatage technique strictement croissant, pour un tri `createdAt` deterministe. */
  const nextCreatedAt = () => new Date(Date.UTC(2000, 0, 1) + nextSeq() * 1000);

  const matchesDateFilter = (value: Date, filter?: Row) => {
    if (!filter) {
      return true;
    }
    if (filter.gte && value < new Date(filter.gte)) {
      return false;
    }
    if (filter.lte && value > new Date(filter.lte)) {
      return false;
    }
    return true;
  };

  const syndicateOfTenant = (syndicateId: string, tenantId?: string) =>
    store.syndicates.find(
      s => s.id === syndicateId && (tenantId === undefined || s.tenantId === tenantId) && s.status !== 'IN_LIQUIDATION'
    );

  /** Construit un comparateur a partir d'un `orderBy` Prisma de la forme [{champ: 'asc'}]. */
  const buildComparator = (orderBy?: Row[]) => (a: Row, b: Row) => {
    for (const clause of orderBy ?? []) {
      const [field, direction] = Object.entries(clause)[0] as [string, string];
      const left = new Date(a[field]).getTime();
      const right = new Date(b[field]).getTime();
      if (left !== right) {
        return direction === 'desc' ? right - left : left - right;
      }
    }
    return 0;
  };

  const client: Row = {
    syndicate: {
      findFirst: jest.fn(async (args: Row) => {
        const found = syndicateOfTenant(args.where.id, args.where.tenantId);
        return found ? { id: found.id } : null;
      })
    },
    syndicateLot: {
      findFirst: jest.fn(async (args: Row) => {
        const where = args.where;
        const lot = store.lots.find(l => l.id === where.id && l.syndicateId === where.syndicateId);
        if (!lot) {
          return null;
        }
        const tenantId = where.syndicate?.tenantId;
        if (tenantId && !syndicateOfTenant(lot.syndicateId, tenantId)) {
          return null;
        }
        return {
          id: lot.id,
          coownerId: lot.coownerId ?? null,
          ownerContactId: lot.ownerContactId ?? null,
          property: lot.property ?? null
        };
      }),
      update: jest.fn(async (args: Row) => {
        const lot: any = store.lots.find(l => l.id === args.where.id);
        Object.assign(lot ?? {}, args.data);
        return lot;
      })
    },
    crmContact: {
      findFirst: jest.fn(async () => null)
    },
    // reconcileOwnerAccountLedgerForLot (rapprochement automatique a chaque
    // ouverture du compte, constat de recette module 7) lit ces deux tables
    // pour retrouver les appels/paiements sans ecriture correspondante. Ce
    // magasin ne modelise ni l'un ni l'autre (les tests d'ici seedent le
    // compte et ses mouvements directement) : toujours vide, donc rien a
    // rattraper — sans changer le comportement des tests existants.
    chargeCall: {
      findMany: jest.fn(async () => [])
    },
    chargePayment: {
      findMany: jest.fn(async () => [])
    },
    // Verrou consultatif du rapprochement (lib/finance/cash.ts, meme idiome) :
    // no-op, ce magasin en memoire ne parle pas a un vrai Postgres.
    $executeRaw: jest.fn(async () => undefined),
    crmContactRole: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (args: Row) => args.data),
      update: jest.fn(async (args: Row) => args.data)
    },
    ownerAccount: {
      findUnique: jest.fn(async (args: Row) => {
        const where = args.where;
        const found = store.accounts.find(a => (where.id !== undefined ? a.id === where.id : a.lotId === where.lotId));
        return found ?? null;
      }),
      findFirst: jest.fn(async (args: Row) => {
        const where = args.where;
        const account = store.accounts.find(a => a.lotId === where.lotId && a.syndicateId === where.syndicateId);
        if (!account) {
          return null;
        }
        const tenantId = where.syndicate?.tenantId;
        const syndicate = syndicateOfTenant(account.syndicateId, tenantId);
        if (tenantId && !syndicate) {
          return null;
        }
        const lot = store.lots.find(l => l.id === account.lotId);
        return {
          ...account,
          syndicate: syndicate ?? null,
          lot: lot ? { ...lot, owner: null } : null,
          contact: { id: account.contactId, firstName: 'Awa', lastName: 'Diop' }
        };
      }),
      create: jest.fn(async (args: Row) => {
        const created = { id: `acc-${nextSeq()}`, currency: 'XOF', ...args.data };
        store.accounts.push(created);
        return created;
      }),
      // `ensureOwnerAccountForLotTx` (queries.ts) cree desormais le compte du
      // lot via un seul `upsert` atomique sur `lotId`, plutot qu'un
      // `findUnique` puis `create` non-atomique (constat de recette module
      // 3.3 : deux lectures concurrentes du meme lot heurtaient la contrainte
      // unique). Ce magasin en memoire imite le meme contrat : trouve par
      // `lotId`, sinon insere `create`.
      upsert: jest.fn(async (args: Row) => {
        const existing = store.accounts.find(a => a.lotId === args.where.lotId);
        if (existing) {
          Object.assign(existing, args.update ?? {});
          return existing;
        }
        const created = { id: `acc-${nextSeq()}`, currency: 'XOF', ...args.create };
        store.accounts.push(created);
        return created;
      }),
      update: jest.fn(async (args: Row) => {
        const account: any = store.accounts.find(a => a.id === args.where.id);
        Object.assign(account ?? {}, args.data);
        return account;
      })
    },
    ownerAccountTransaction: {
      create: jest.fn(async (args: Row) => {
        const created = { id: `tx-${nextSeq()}`, createdAt: nextCreatedAt(), ...args.data };
        store.transactions.push(created);
        return created;
      }),
      findMany: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        const rows = store.transactions
          .filter(t => t.accountId === where.accountId)
          .filter(t => matchesDateFilter(new Date(t.transactionDate), where.transactionDate))
          .sort(buildComparator(args.orderBy));
        const skip = args.skip ?? 0;
        const take = args.take ?? rows.length;
        return rows.slice(skip, skip + take);
      }),
      // Ajoute au lot 2 : le releve remonte desormais la chaine des mouvements
      // pour trouver son solde d'ouverture, au lieu de se replier sur le solde
      // courant du compte (defaut n°3). `lt` est la seule borne utilisee, d'ou
      // ce filtre plus simple que celui de `findMany`.
      findFirst: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        const rows = store.transactions
          .filter(t => t.accountId === where.accountId)
          .filter(t =>
            where.transactionDate?.lt ? new Date(t.transactionDate) < new Date(where.transactionDate.lt) : true
          )
          .sort(buildComparator(args.orderBy));
        return rows[0] ?? null;
      })
    }
  };

  client.$transaction = jest.fn(async (callback: any) => callback(client));

  return {
    PrismaClient: jest.fn(() => client),
    __mockPrisma: client,
    __store: store
  };
});

import {
  createOwnerAccountAdjustmentByLot,
  getOwnerAccountByLot,
  getOwnerAccountStatementByLot,
  listOwnerAccountTransactionsByLot
} from '../../src/lib/syndics/queries';

const { __mockPrisma: mockPrisma, __store: store } = jest.requireMock('@prisma/client') as {
  __mockPrisma: any;
  __store: any;
};

const TENANT_ID = 'tenant-1';
const OTHER_TENANT_ID = 'tenant-2';
const SYNDIC_ID = 'syndic-1';
const LOT_ID = 'lot-1';
const LOT_SANS_PROPRIETAIRE_ID = 'lot-sans-proprietaire';
const CONTACT_ID = 'contact-1';

/** Cree le compte de lot directement dans le magasin, avec le solde de depart voulu. */
function seedOwnerAccount(balance = 0) {
  const account = {
    id: 'acc-seed',
    syndicateId: SYNDIC_ID,
    lotId: LOT_ID,
    contactId: CONTACT_ID,
    balance,
    currency: 'XOF'
  };
  store.accounts.push(account);
  return account;
}

async function ajuster(direction: 'DEBIT' | 'CREDIT', amount: number, label: string, transactionDate?: Date) {
  return createOwnerAccountAdjustmentByLot(TENANT_ID, SYNDIC_ID, LOT_ID, {
    direction,
    amount,
    label,
    transactionDate
  });
}

describe('Caracterisation - grand livre du compte de lot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    store.syndicates.length = 0;
    store.lots.length = 0;
    store.accounts.length = 0;
    store.transactions.length = 0;
    store.seq = 0;

    store.syndicates.push({ id: SYNDIC_ID, tenantId: TENANT_ID, status: 'ACTIVE' });
    store.lots.push({ id: LOT_ID, syndicateId: SYNDIC_ID, coownerId: CONTACT_ID, ownerContactId: CONTACT_ID });
    store.lots.push({
      id: LOT_SANS_PROPRIETAIRE_ID,
      syndicateId: SYNDIC_ID,
      coownerId: null,
      ownerContactId: null
    });
  });

  describe('Acces au compte de lot', () => {
    it('cree le compte de lot a la volee avec un solde initial de 0', async () => {
      const account = await getOwnerAccountByLot(TENANT_ID, SYNDIC_ID, LOT_ID);

      expect(account.balance).toBe(0);
      expect(account.contactId).toBe(CONTACT_ID);
      // Appele deux fois (idempotent, meme lot) : une fois par
      // getOrCreateOwnerAccountForLot, une fois par
      // reconcileOwnerAccountLedgerForLot qui s'assure aussi de l'existence
      // du compte avant de rapprocher son historique (constat de recette,
      // module 7). Un seul compte reste cree.
      expect(mockPrisma.ownerAccount.upsert).toHaveBeenCalledTimes(2);
      expect(store.accounts).toHaveLength(1);
    });

    it('reutilise le compte existant plutot que d en creer un second', async () => {
      seedOwnerAccount(1500);

      const account = await getOwnerAccountByLot(TENANT_ID, SYNDIC_ID, LOT_ID);

      expect(account.id).toBe('acc-seed');
      expect(account.balance).toBe(1500);
      // L'upsert est toujours appele (c'est lui qui decide reutiliser/creer),
      // mais aucun second compte ne doit apparaitre dans le magasin.
      expect(store.accounts).toHaveLength(1);
    });

    it('deux lectures concurrentes du meme lot ne creent qu un seul compte (constat de recette module 3.3)', async () => {
      // Simule les deux appels lances en parallele par la page web
      // (`getLotOwnerAccount` et `listLotOwnerAccountTransactions`, qui
      // declenchaient chacun leur propre creation) : `Promise.all` sur deux
      // `getOwnerAccountByLot` pour le meme lot ne doit jamais faire
      // apparaitre une erreur ni un second compte.
      const [first, second] = await Promise.all([
        getOwnerAccountByLot(TENANT_ID, SYNDIC_ID, LOT_ID),
        getOwnerAccountByLot(TENANT_ID, SYNDIC_ID, LOT_ID)
      ]);

      expect(first.id).toBe(second.id);
      expect(store.accounts).toHaveLength(1);
      expect(store.accounts[0].balance).toBe(0);
    });

    it('leve notFound (404) quand le lot n a aucun proprietaire rattache', async () => {
      await expect(getOwnerAccountByLot(TENANT_ID, SYNDIC_ID, LOT_SANS_PROPRIETAIRE_ID)).rejects.toMatchObject({
        status: 404,
        message: 'Compte lot introuvable ou lot sans proprietaire'
      });
    });

    it('leve une erreur d isolation tenant (403) pour une copropriete d un autre tenant', async () => {
      seedOwnerAccount(1000);

      await expect(getOwnerAccountByLot(OTHER_TENANT_ID, SYNDIC_ID, LOT_ID)).rejects.toMatchObject({
        status: 403,
        code: 'TENANT_ISOLATION_ERROR'
      });
    });
  });

  describe('Sens et enchainement du solde courant', () => {
    it('un debit AUGMENTE le solde du compte de lot', async () => {
      seedOwnerAccount(0);

      const transaction: any = await ajuster('DEBIT', 25000, 'Appel de charges');

      expect(transaction.debit).toBe(25000);
      expect(transaction.credit).toBeUndefined();
      expect(Number(transaction.balanceAfter)).toBe(25000);
      expect(store.accounts[0].balance).toBe(25000);
    });

    it('un credit DIMINUE le solde du compte de lot', async () => {
      seedOwnerAccount(25000);

      const transaction: any = await ajuster('CREDIT', 10000, 'Encaissement');

      expect(transaction.credit).toBe(10000);
      expect(transaction.debit).toBeUndefined();
      expect(Number(transaction.balanceAfter)).toBe(15000);
      expect(store.accounts[0].balance).toBe(15000);
    });

    it('chaine balanceAfter sur plusieurs mouvements : chaque solde vaut le precedent + debit - credit', async () => {
      seedOwnerAccount(0);

      const t1: any = await ajuster('DEBIT', 30000, 'Appel T1');
      const t2: any = await ajuster('CREDIT', 12000, 'Acompte');
      const t3: any = await ajuster('DEBIT', 4500, 'Penalite');
      const t4: any = await ajuster('CREDIT', 22500, 'Solde');

      expect([t1, t2, t3, t4].map(t => Number(t.balanceAfter))).toEqual([30000, 18000, 22500, 0]);
      expect(store.accounts[0].balance).toBe(0);
    });

    it('laisse le solde devenir negatif : aucun plancher a zero n est applique', async () => {
      seedOwnerAccount(5000);

      const transaction: any = await ajuster('CREDIT', 8000, 'Trop-percu');

      expect(Number(transaction.balanceAfter)).toBe(-3000);
      expect(store.accounts[0].balance).toBe(-3000);
    });

    it('arrondit chaque mouvement au centime (roundMoney) avant de l ajouter au solde', async () => {
      seedOwnerAccount(0);

      const t1: any = await ajuster('DEBIT', 33.333, 'Quote-part 1');
      const t2: any = await ajuster('DEBIT', 33.333, 'Quote-part 2');
      const t3: any = await ajuster('DEBIT', 33.333, 'Quote-part 3');

      // Le montant est arrondi AVANT l addition : 33.33 x 3 = 99.99, et non 100.00.
      expect([t1.debit, t2.debit, t3.debit]).toEqual([33.33, 33.33, 33.33]);
      expect([t1, t2, t3].map(t => Number(t.balanceAfter))).toEqual([33.33, 66.66, 99.99]);
    });

    it('SURPRISE : roundMoney arrondit 100.005 a 100.00 (vers le bas), suite au binaire flottant', async () => {
      seedOwnerAccount(0);

      const transaction: any = await ajuster('DEBIT', 100.005, 'Arrondi a la baisse');

      expect(transaction.debit).toBe(100);
      expect(Number(transaction.balanceAfter)).toBe(100);
    });

    it('SURPRISE : un ajustement de montant 0 cree une transaction sans debit ni credit', async () => {
      seedOwnerAccount(7000);

      // `debit > 0 ? debit : undefined` : a montant nul, les deux colonnes restent NULL.
      // Le schema HTTP interdit amount <= 0, mais la couche requete, elle, l accepte.
      const transaction: any = await ajuster('DEBIT', 0, 'Ajustement nul');

      expect(transaction.debit).toBeUndefined();
      expect(transaction.credit).toBeUndefined();
      expect(transaction.type).toBe('ADJUSTMENT');
      expect(Number(transaction.balanceAfter)).toBe(7000);
      expect(store.accounts[0].balance).toBe(7000);
    });

    it('type un ajustement en ADJUSTMENT et reporte le libelle et la date fournis', async () => {
      seedOwnerAccount(0);
      const date = new Date('2026-04-15T00:00:00.000Z');

      const transaction: any = await createOwnerAccountAdjustmentByLot(TENANT_ID, SYNDIC_ID, LOT_ID, {
        direction: 'DEBIT',
        amount: 1200,
        label: 'Regularisation exercice 2025',
        reference: 'REG-2025-07',
        transactionDate: date
      });

      expect(transaction.type).toBe('ADJUSTMENT');
      expect(transaction.label).toBe('Regularisation exercice 2025');
      expect(transaction.reference).toBe('REG-2025-07');
      expect(transaction.transactionDate).toEqual(date);
    });

    it('leve unprocessableEntity (422) quand la transaction ne peut pas etre ecrite', async () => {
      seedOwnerAccount(0);
      // Le compte disparait entre sa lecture (findFirst) et l ecriture du mouvement,
      // qui le relit par identifiant : appendOwnerAccountTransactionTx renvoie null.
      const implementationInitiale = mockPrisma.ownerAccount.findUnique.getMockImplementation();
      mockPrisma.ownerAccount.findUnique.mockImplementation(async (args: any) =>
        args.where.id !== undefined ? null : implementationInitiale(args)
      );

      try {
        await expect(ajuster('DEBIT', 1000, 'Mouvement orphelin')).rejects.toMatchObject({
          status: 422,
          message: 'Impossible de creer la transaction de compte lot'
        });
      } finally {
        mockPrisma.ownerAccount.findUnique.mockImplementation(implementationInitiale);
      }
    });
  });

  describe('Listage des transactions', () => {
    it('trie les transactions du plus recent au plus ancien', async () => {
      seedOwnerAccount(0);
      await ajuster('DEBIT', 1000, 'Janvier', new Date('2026-01-10T00:00:00.000Z'));
      await ajuster('DEBIT', 2000, 'Mars', new Date('2026-03-10T00:00:00.000Z'));
      await ajuster('DEBIT', 3000, 'Fevrier', new Date('2026-02-10T00:00:00.000Z'));

      const rows = await listOwnerAccountTransactionsByLot(TENANT_ID, SYNDIC_ID, LOT_ID);

      expect(rows.map((r: any) => r.label)).toEqual(['Mars', 'Fevrier', 'Janvier']);
    });

    it('borne le listage par les dates from et to (bornes incluses)', async () => {
      seedOwnerAccount(0);
      await ajuster('DEBIT', 1000, 'Janvier', new Date('2026-01-10T00:00:00.000Z'));
      await ajuster('DEBIT', 2000, 'Fevrier', new Date('2026-02-10T00:00:00.000Z'));
      await ajuster('DEBIT', 3000, 'Mars', new Date('2026-03-10T00:00:00.000Z'));

      const rows = await listOwnerAccountTransactionsByLot(TENANT_ID, SYNDIC_ID, LOT_ID, {
        range: { from: new Date('2026-02-01T00:00:00.000Z'), to: new Date('2026-02-28T00:00:00.000Z') }
      });

      expect(rows.map((r: any) => r.label)).toEqual(['Fevrier']);
    });

    it('applique la pagination (page 2, limite 1) sur la liste triee', async () => {
      seedOwnerAccount(0);
      await ajuster('DEBIT', 1000, 'Janvier', new Date('2026-01-10T00:00:00.000Z'));
      await ajuster('DEBIT', 2000, 'Fevrier', new Date('2026-02-10T00:00:00.000Z'));
      await ajuster('DEBIT', 3000, 'Mars', new Date('2026-03-10T00:00:00.000Z'));

      const rows = await listOwnerAccountTransactionsByLot(TENANT_ID, SYNDIC_ID, LOT_ID, {
        pagination: { page: 2, limit: 1 }
      });

      expect(rows.map((r: any) => r.label)).toEqual(['Fevrier']);
    });
  });

  // BUG-2026-09-27-006 : un appel de charges est daté à son échéance, donc
  // parfois APRÈS des paiements créés plus tard. Le solde cumulé suit l'ordre
  // chronologique affiché (date, puis création), pas l'ordre d'écriture.
  describe('Solde cumulé chronologique (BUG-006)', () => {
    async function scenarioAppelEchuApresPaiements() {
      seedOwnerAccount(0);
      await ajuster('DEBIT', 60000, 'Appel 2026-T4', new Date('2026-10-15T00:00:00.000Z'));
      await ajuster('CREDIT', 20000, 'Paiement 1', new Date('2026-09-27T00:00:00.000Z'));
      await ajuster('CREDIT', 55000, 'Paiement 2', new Date('2026-09-27T00:00:00.000Z'));
    }

    it("affiche le plus récent d'abord, la ligne du haut portant le solde courant", async () => {
      await scenarioAppelEchuApresPaiements();

      const rows = await listOwnerAccountTransactionsByLot(TENANT_ID, SYNDIC_ID, LOT_ID);

      expect(rows.map((r: any) => [r.label, Number(r.balanceAfter)])).toEqual([
        ['Appel 2026-T4', -15000],
        ['Paiement 2', -75000],
        ['Paiement 1', -20000]
      ]);
      expect(Number(rows[0].balanceAfter)).toBe(Number(store.accounts[0].balance));
    });

    it('garde le même cumul sur une page et dans le relevé chronologique', async () => {
      await scenarioAppelEchuApresPaiements();

      const page2 = await listOwnerAccountTransactionsByLot(TENANT_ID, SYNDIC_ID, LOT_ID, {
        pagination: { page: 2, limit: 1 }
      });
      expect(page2.map((r: any) => [r.label, Number(r.balanceAfter)])).toEqual([['Paiement 2', -75000]]);

      const statement = await getOwnerAccountStatementByLot(TENANT_ID, SYNDIC_ID, LOT_ID, {
        from: new Date('2026-10-01T00:00:00.000Z')
      });
      expect(statement.transactions.map((t: any) => [t.label, Number(t.balanceAfter)])).toEqual([
        ['Appel 2026-T4', -15000]
      ]);
      expect(statement.summary.openingBalance).toBe(-75000);
      expect(statement.summary.closingBalance).toBe(-15000);
    });
  });

  describe('Releve de compte', () => {
    it('ordonne le releve chronologiquement et calcule ouverture et cloture', async () => {
      seedOwnerAccount(10000);
      await ajuster('DEBIT', 5000, 'Appel', new Date('2026-01-10T00:00:00.000Z'));
      await ajuster('CREDIT', 3000, 'Paiement', new Date('2026-02-10T00:00:00.000Z'));

      const statement = await getOwnerAccountStatementByLot(TENANT_ID, SYNDIC_ID, LOT_ID);

      expect(statement.transactions.map((t: any) => t.label)).toEqual(['Appel', 'Paiement']);
      // Ouverture = balanceAfter du 1er mouvement - son debit + son credit = 15000 - 5000 + 0.
      expect(statement.summary.openingBalance).toBe(10000);
      expect(statement.summary.closingBalance).toBe(12000);
    });

    // Corrige au lot 2 (defaut n°3, voir `data-model.md#defaut-3`). Ce cas
    // decrivait le meme defaut que le « SURPRISE » ci-dessous, sans en porter le
    // nom : ouverture et cloture se repliaient sur `OwnerAccount.balance`,
    // c'est-a-dire sur le solde du jour. Le releve s'ancre desormais sur la
    // chaine des mouvements, comme le grand livre des comptes de tiers du lot 1
    // (`getBalanceStrictlyBefore`, `lib/finance/reports.ts`). Un compte sans
    // aucun mouvement n'a donc rien a montrer : zero, et non un solde que rien
    // n'explique. Le changement est voulu.
    it('corrige (lot 2) : sans aucun mouvement, le releve affiche zero et non le solde courant', async () => {
      seedOwnerAccount(4200);

      const statement = await getOwnerAccountStatementByLot(TENANT_ID, SYNDIC_ID, LOT_ID);

      expect(statement.transactions).toHaveLength(0);
      expect(statement.summary.openingBalance).toBe(0);
      expect(statement.summary.closingBalance).toBe(0);
    });

    it('borne le releve par dates et recalcule l ouverture sur le 1er mouvement de la periode', async () => {
      seedOwnerAccount(0);
      await ajuster('DEBIT', 10000, 'Janvier', new Date('2026-01-10T00:00:00.000Z'));
      await ajuster('DEBIT', 6000, 'Fevrier', new Date('2026-02-10T00:00:00.000Z'));
      await ajuster('CREDIT', 4000, 'Mars', new Date('2026-03-10T00:00:00.000Z'));

      const statement = await getOwnerAccountStatementByLot(TENANT_ID, SYNDIC_ID, LOT_ID, {
        from: new Date('2026-02-01T00:00:00.000Z'),
        to: new Date('2026-03-31T00:00:00.000Z')
      });

      expect(statement.transactions.map((t: any) => t.label)).toEqual(['Fevrier', 'Mars']);
      // 16000 (apres Fevrier) - 6000 = 10000, soit bien le solde a l ouverture de la periode.
      expect(statement.summary.openingBalance).toBe(10000);
      expect(statement.summary.closingBalance).toBe(12000);
    });

    // Corrige au lot 2 (defaut n°3, voir `data-model.md#defaut-3`). Ce cas
    // perd son prefixe SURPRISE : le releve ne se replie plus sur le solde
    // courant quand la periode est vide. Il lit le solde atteint par le dernier
    // mouvement anterieur a la borne de debut — ici aucun, le compte n'ayant
    // rien connu avant 2026 — et la cloture le suit, puisque rien n'a bouge
    // entre les deux bornes. Un releve 2025 montre donc 2025, ce qui etait tout
    // l'enjeu : un chiffre juste a la mauvaise date est pire qu'un chiffre
    // absent. Le changement est voulu.
    it('corrige (lot 2) : sur une periode sans mouvement, le releve affiche le solde de la periode', async () => {
      seedOwnerAccount(0);
      await ajuster('DEBIT', 10000, 'Janvier', new Date('2026-01-10T00:00:00.000Z'));
      await ajuster('DEBIT', 6000, 'Fevrier', new Date('2026-02-10T00:00:00.000Z'));

      const statement = await getOwnerAccountStatementByLot(TENANT_ID, SYNDIC_ID, LOT_ID, {
        from: new Date('2025-01-01T00:00:00.000Z'),
        to: new Date('2025-12-31T00:00:00.000Z')
      });

      expect(statement.transactions).toHaveLength(0);
      // Le compte etait a 0 en 2025, et le releve le dit desormais.
      expect(statement.summary.openingBalance).toBe(0);
      expect(statement.summary.closingBalance).toBe(0);
    });

    // Contre-epreuve du meme defaut : une periode vide *posterieure* a des
    // mouvements doit montrer le solde atteint avant elle, pas zero ni le solde
    // du jour. Sans ce cas, la correction ci-dessus passerait aussi avec un
    // simple « toujours zero quand la periode est vide ».
    it('corrige (lot 2) : une periode vide posterieure montre le solde atteint avant elle', async () => {
      seedOwnerAccount(0);
      await ajuster('DEBIT', 10000, 'Janvier', new Date('2026-01-10T00:00:00.000Z'));
      await ajuster('DEBIT', 6000, 'Fevrier', new Date('2026-02-10T00:00:00.000Z'));

      const statement = await getOwnerAccountStatementByLot(TENANT_ID, SYNDIC_ID, LOT_ID, {
        from: new Date('2026-06-01T00:00:00.000Z'),
        to: new Date('2026-06-30T00:00:00.000Z')
      });

      expect(statement.transactions).toHaveLength(0);
      expect(statement.summary.openingBalance).toBe(16000);
      expect(statement.summary.closingBalance).toBe(16000);
    });

    it('arrondit ouverture et cloture au centime', async () => {
      seedOwnerAccount(0);
      await ajuster('DEBIT', 33.333, 'Quote-part 1', new Date('2026-01-10T00:00:00.000Z'));
      await ajuster('DEBIT', 33.333, 'Quote-part 2', new Date('2026-01-11T00:00:00.000Z'));

      const statement = await getOwnerAccountStatementByLot(TENANT_ID, SYNDIC_ID, LOT_ID);

      expect(statement.summary.openingBalance).toBe(0);
      expect(statement.summary.closingBalance).toBe(66.66);
    });
  });
});
