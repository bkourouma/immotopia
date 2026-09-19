/**
 * Moteur comptable operationnel du lot 2 — `lib/finance/accounting.ts`.
 *
 * Ce fichier ne caracterise rien : il verifie le comportement **voulu** du
 * chemin neuf, celui ou les cinq defauts du §6.1 bis du plan n'existent pas.
 * Les tests de caracterisation de la copropriete
 * (`api/syndics.accounting.characterization.test.ts`,
 * `unit/syndics.owner-accounts.ledger.test.ts`) restent leur propre reference ;
 * on ne duplique pas ici ce qu'ils disent deja.
 *
 * Prisma est remplace par un magasin en memoire : aucune base n'est requise.
 * Ce magasin ne reproduit evidemment pas la semantique d'annulation de
 * PostgreSQL — une commande en echec y condamne toute la transaction, ce qu'un
 * objet JavaScript ne fera jamais. C'est precisement pourquoi le code teste ici
 * lit avant d'ecrire au lieu de rattraper une violation d'unicite : ces tests
 * ne pourraient pas voir la difference, et le lot 1 s'y est deja brule.
 */

// La synchronisation du cout des programmes de travaux appartient a
// `cost-allocation.ts`. On la mocke ici, comme le moteur comptable : ce fichier
// verifie qu'elle est APPELEE avec le bon chantier, pas ce qu'elle fait.
const syncWorkProgramCostTx = jest.fn();

jest.mock('../../src/lib/finance/cost-allocation', () => ({
  syncWorkProgramCostTx: (...args: any[]) => syncWorkProgramCostTx(...args)
}));

jest.mock('@prisma/client', () => {
  type Row = Record<string, any>;

  const store = {
    accounts: [] as Row[],
    journals: [] as Row[],
    entries: [] as Row[],
    lines: [] as Row[],
    voidDocuments: [] as Row[],
    costAllocations: [] as Row[],
    movements: [] as Row[],
    costCategories: [] as Row[],
    paymentAllocations: [] as Row[],
    thirdPartyAccounts: [] as Row[],
    seq: 0
  };

  const nextSeq = () => {
    store.seq += 1;
    return store.seq;
  };

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

  /** Applique les clauses d'un `where` plat, plus les quelques formes utilisees ici. */
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([field, expected]) => {
      if (expected === undefined) {
        return true;
      }
      if (expected !== null && typeof expected === 'object' && 'in' in expected) {
        return (expected.in as unknown[]).includes(row[field]);
      }
      return row[field] === expected;
    });

  const client: Row = {
    chartOfAccount: {
      findMany: jest.fn(async (args: Row) => store.accounts.filter(a => matches(a, args.where)).map(a => ({ ...a }))),
      findFirst: jest.fn(async (args: Row) => {
        const found = store.accounts.find(a => matches(a, args.where));
        return found ? { ...found } : null;
      }),
      count: jest.fn(async (args: Row) => store.accounts.filter(a => matches(a, args.where)).length),
      create: jest.fn(async (args: Row) => {
        const created = {
          id: `acc-${nextSeq()}`,
          isActive: true,
          isAuxiliary: false,
          parentAccountId: null,
          createdAt: nextCreatedAt(),
          ...args.data
        };
        store.accounts.push(created);
        return created;
      }),
      update: jest.fn(async (args: Row) => {
        const found: any = store.accounts.find(a => a.id === args.where.id);
        Object.assign(found ?? {}, args.data);
        return { ...found };
      })
    },
    accountingJournal: {
      findFirst: jest.fn(async (args: Row) => {
        const found = store.journals.find(j => matches(j, args.where));
        return found ? { ...found } : null;
      }),
      create: jest.fn(async (args: Row) => {
        const created = { id: `journal-${nextSeq()}`, createdAt: nextCreatedAt(), ...args.data };
        store.journals.push(created);
        return created;
      })
    },
    journalEntry: {
      findFirst: jest.fn(async (args: Row) => {
        const found = store.entries.find(e => matches(e, args.where));
        if (!found) {
          return null;
        }
        return {
          ...found,
          lines: store.lines.filter(l => l.entryId === found.id).map(l => ({ ...l }))
        };
      }),
      create: jest.fn(async (args: Row) => {
        const created = {
          id: `entry-${nextSeq()}`,
          isLocked: false,
          sourceId: null,
          documentType: null,
          documentId: null,
          voidedByEntryId: null,
          createdAt: nextCreatedAt(),
          ...args.data
        };
        store.entries.push(created);
        return created;
      }),
      update: jest.fn(async (args: Row) => {
        const found: any = store.entries.find(e => e.id === args.where.id);
        Object.assign(found ?? {}, args.data);
        return { ...found };
      })
    },
    journalEntryLine: {
      createMany: jest.fn(async (args: Row) => {
        for (const row of args.data) {
          store.lines.push({ id: `line-${nextSeq()}`, createdAt: nextCreatedAt(), ...row });
        }
        return { count: args.data.length };
      }),
      groupBy: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        const retenues = store.lines.filter(line => {
          const account = store.accounts.find(a => a.id === line.accountId);
          const entry = store.entries.find(e => e.id === line.entryId);
          if (!account || !entry) {
            return false;
          }
          if (where.account && !matches(account, where.account)) {
            return false;
          }
          if (where.entry) {
            const { entryDate, ...plat } = where.entry;
            if (!matches(entry, plat)) {
              return false;
            }
            if (!matchesDateFilter(new Date(entry.entryDate), entryDate)) {
              return false;
            }
          }
          return true;
        });

        const parCompte = new Map<string, { debit: number; credit: number }>();
        for (const line of retenues) {
          const courant = parCompte.get(line.accountId) ?? { debit: 0, credit: 0 };
          courant.debit += Number(line.debit ?? 0);
          courant.credit += Number(line.credit ?? 0);
          parCompte.set(line.accountId, courant);
        }

        return Array.from(parCompte.entries()).map(([accountId, sommes]) => ({
          accountId,
          _sum: { debit: sommes.debit, credit: sommes.credit }
        }));
      })
    },
    voidDocument: {
      findFirst: jest.fn(async (args: Row) => {
        const found = store.voidDocuments.find(v => matches(v, args.where));
        return found ? { ...found } : null;
      }),
      create: jest.fn(async (args: Row) => {
        const created = {
          id: `void-${nextSeq()}`,
          reversingEntryId: null,
          voidedAt: nextCreatedAt(),
          ...args.data
        };
        store.voidDocuments.push(created);
        return created;
      }),
      update: jest.fn(async (args: Row) => {
        const found: any = store.voidDocuments.find(v => v.id === args.where.id);
        Object.assign(found ?? {}, args.data);
        return { ...found };
      })
    },
    costAllocation: {
      // `voidDocumentTx` lit les imputations AVANT de les marquer : apres le
      // `updateMany`, elles portent toutes `voidedAt` et on ne saurait plus
      // lesquelles viennent d'etre annulees par cette operation.
      findMany: jest.fn(async (args: Row) => store.costAllocations.filter(a => matches(a, args.where))),
      updateMany: jest.fn(async (args: Row) => {
        const touchees = store.costAllocations.filter(a => matches(a, args.where));
        for (const allocation of touchees) {
          Object.assign(allocation, args.data);
        }
        return { count: touchees.length };
      })
    },

    // Les affectations d'un reglement : `voidDocumentTx` les lit pour retrouver
    // les mouvements de compte de tiers qu'elles ont produits, chacun etant
    // pose sous l'identifiant de l'affectation et non sous celui du reglement.
    // Les postes de depense, pour le resolveur de comptes de charge.
    costCategory: {
      findMany: jest.fn(async (args: Row) => {
        const ids: string[] = args.where?.id?.in ?? [];
        return store.costCategories
          .filter((c: Row) => ids.includes(c.id) && c.tenantId === args.where?.tenantId)
          .map((c: Row) => ({
            id: c.id,
            chartOfAccountId: c.chartOfAccountId ?? null,
            chartOfAccount: c.chartOfAccountId
              ? (store.accounts.find((a: Row) => a.id === c.chartOfAccountId) ?? null)
              : null
          }));
      })
    },

    supplierPaymentAllocation: {
      findMany: jest.fn(async (args: Row) => store.paymentAllocations.filter(a => matches(a, args.where)))
    },

    // Le grand livre des comptes de tiers. Il ne figurait pas dans cette
    // doublure, si bien que rien n'exigeait de `voidDocumentTx` qu'il y touche
    // — et il n'y touchait pas : annuler une facture laissait le fournisseur
    // creancier de son montant. Defaut trouve le 19 septembre 2026 par le
    // parcours de bout en bout, jamais par cette suite.
    thirdPartyMovement: {
      findMany: jest.fn(async (args: Row) => {
        const conditions: Row[] = args.where?.OR ?? [];
        return store.movements.filter(m =>
          conditions.some(c => m.sourceType === c.sourceType && m.sourceId === c.sourceId)
        );
      }),
      findUnique: jest.fn(async (args: Row) => {
        const cle = args.where?.sourceType_sourceId_type ?? {};
        return (
          store.movements.find(
            m => m.sourceType === cle.sourceType && m.sourceId === cle.sourceId && m.type === cle.type
          ) ?? null
        );
      }),
      create: jest.fn(async (args: Row) => {
        const cree = { id: `mvt-${store.movements.length + 1}`, ...args.data };
        store.movements.push(cree);
        return cree;
      })
    },

    thirdPartyAccount: {
      findFirst: jest.fn(async (args: Row) => store.thirdPartyAccounts.find(a => matches(a, args.where)) ?? null),
      update: jest.fn(async (args: Row) => {
        const compte = store.thirdPartyAccounts.find(a => a.id === args.where.id);
        if (compte) Object.assign(compte, args.data);
        return { ...compte };
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
  OPERATIONAL_ACCOUNT_SEEDS,
  buildBalancedEntryLines,
  createOperationalAccountTx,
  deactivateOperationalAccountTx,
  ensureOperationalChartOfAccountsTx,
  ensureOperationalJournalTx,
  getTrialBalance,
  postDocumentEntryTx,
  resolveExpenseAccountsByCostCategoryTx,
  voidDocumentTx
} from '../../src/lib/finance/accounting';
import * as accountingModule from '../../src/lib/finance/accounting';
import { roundMoney, roundMoneyXof } from '../../src/lib/finance/money';

const { __mockPrisma: tx, __store: store } = jest.requireMock('@prisma/client') as {
  __mockPrisma: any;
  __store: any;
};

const TENANT_ID = 'tenant-1';
const AUTRE_TENANT_ID = 'tenant-2';

/** Pose le journal et le plan operationnels, et renvoie l'index des comptes. */
async function amorcerPlanOperationnel(tenantId = TENANT_ID) {
  const journalId = await ensureOperationalJournalTx(tx, tenantId, 2026);
  const comptes = await ensureOperationalChartOfAccountsTx(tx, tenantId);
  return { journalId, comptes };
}

/** Ecrit une facture fournisseur de `montant` : on doit au fournisseur, on a achete. */
async function posterFacture(
  montant: number,
  documentId = 'facture-1',
  options: { tenantId?: string; journalId?: string; reference?: string } = {}
) {
  const tenantId = options.tenantId ?? TENANT_ID;
  const comptes = await ensureOperationalChartOfAccountsTx(tx, tenantId);
  const journalId = options.journalId ?? (await ensureOperationalJournalTx(tx, tenantId, 2026));

  return postDocumentEntryTx(tx, {
    tenantId,
    journalId,
    entryDate: new Date('2026-03-01T00:00:00.000Z'),
    reference: options.reference ?? 'FA-001',
    description: 'Facture fournisseur',
    documentType: 'SUPPLIER_INVOICE',
    documentId,
    lines: [
      { accountId: comptes.get('601')!, debit: montant, label: 'Achats' },
      { accountId: comptes.get('401')!, credit: montant, label: 'Fournisseur' }
    ]
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  store.accounts.length = 0;
  store.journals.length = 0;
  store.entries.length = 0;
  store.lines.length = 0;
  store.voidDocuments.length = 0;
  store.costAllocations.length = 0;
  store.seq = 0;
});

// ---------------------------------------------------------------------------

describe('roundMoneyXof — defaut n°4, arrondi du franc CFA', () => {
  it('arrondit a l unite, la demie vers le haut, de facon reproductible', () => {
    // Rejoue plusieurs fois : c est la reproductibilite qui est en cause, pas la
    // valeur d un tirage. `roundMoney(100.005)` vaut 100.00 parce que 100.005
    // n est pas representable en binaire ; 100.5 et 100.4, eux, le sont.
    for (let essai = 0; essai < 100; essai += 1) {
      expect(roundMoneyXof(100.5)).toBe(101);
      expect(roundMoneyXof(100.4)).toBe(100);
      expect(roundMoneyXof(0.5)).toBe(1);
      expect(roundMoneyXof(0.49999)).toBe(0);
    }
  });

  it('ne laisse jamais sortir un zero negatif', () => {
    // `Math.round(-0.4)` vaut `-0`, qui n est pas `0` au sens de `Object.is` :
    // un solde nul compare a zero echouerait sans cette normalisation.
    expect(Object.is(roundMoneyXof(-0.4), 0)).toBe(true);
    expect(Object.is(roundMoneyXof(-0), 0)).toBe(true);
  });

  it('laisse roundMoney inchangee : la copropriete continue de compter en centimes', () => {
    // La precision a l unite ne vaut que pour le chemin d ecriture du lot 2.
    // Changer `roundMoney` toucherait des montants deja en base.
    expect(roundMoney(33.333)).toBe(33.33);
    expect(roundMoney(100.005)).toBe(100);
  });

  it('ecarte les valeurs qui ne sont pas des nombres finis plutot que de propager NaN', () => {
    expect(roundMoneyXof(Number.NaN)).toBe(0);
    expect(roundMoneyXof(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('buildBalancedEntryLines — defaut n°1, l equilibre porte sur ce qui sera stocke', () => {
  it('refuse les deux demi-unites qui ne se compensent qu avant arrondi', () => {
    // Le scenario exact du test de caracterisation de la copropriete, transpose
    // en unites entieres : 0,5 + 0,5 au debit contre 1 au credit. Le controle du
    // chemin copropriete sommait les valeurs brutes (0,5 + 0,5 = 1) et acceptait,
    // puis stockait 1 + 1 = 2 contre 1. Ici l arrondi precede le controle.
    expect(() =>
      buildBalancedEntryLines([
        { accountId: 'a', debit: 0.5, label: 'Debit 1' },
        { accountId: 'a', debit: 0.5, label: 'Debit 2' },
        { accountId: 'b', credit: 1, label: 'Credit' }
      ])
    ).toThrow(/non equilibree/i);
  });

  it('accepte une repartition dont les arrondis se compensent, et renvoie les montants stockes', () => {
    const { lines, totalDebit, totalCredit } = buildBalancedEntryLines([
      { accountId: 'a', debit: 33.4, label: 'Quote-part 1' },
      { accountId: 'a', debit: 66.6, label: 'Quote-part 2' },
      { accountId: 'b', credit: 100, label: 'Contrepartie' }
    ]);

    expect(lines.map(l => l.debit)).toEqual([33, 67, 0]);
    expect(totalDebit).toBe(100);
    expect(totalCredit).toBe(100);
  });

  it('refuse une ligne qui porterait les deux sens a la fois', () => {
    expect(() =>
      buildBalancedEntryLines([
        { accountId: 'a', debit: 100, credit: 100, label: 'Compensation deguisee' },
        { accountId: 'b', credit: 100, label: 'Contrepartie' }
      ])
    ).toThrow(/les deux sens/i);
  });

  it('refuse un montant negatif : une inversion se fait en echangeant les sens', () => {
    expect(() =>
      buildBalancedEntryLines([
        { accountId: 'a', debit: -100, label: 'Inversion par le signe' },
        { accountId: 'b', credit: -100, label: 'Contrepartie' }
      ])
    ).toThrow(/negatif/i);
  });

  it('refuse une ecriture a moins de deux lignes', () => {
    expect(() => buildBalancedEntryLines([{ accountId: 'a', debit: 0, label: 'Seule' }])).toThrow(/deux lignes/i);
  });
});

// ---------------------------------------------------------------------------

describe('Plan de comptes operationnel', () => {
  it('pose le jeu minimal a la premiere piece de l agence', async () => {
    const comptes = await ensureOperationalChartOfAccountsTx(tx, TENANT_ID);

    // Le jeu est epingle a dessein : ce test tombe des qu'on y touche, et
    // c'est ce qu'on lui demande. Les comptes 486 et 613 ont ete ajoutes au
    // lot 4 pour les baux de terrain — un loyer paye d'avance est une creance
    // de jouissance (486) qui se consomme mois apres mois en location (613),
    // et non une charge le jour du paiement.
    expect(Array.from(comptes.keys()).sort()).toEqual(['401', '411', '422', '486', '571', '601', '605', '613', '661']);
    expect(store.accounts).toHaveLength(OPERATIONAL_ACCOUNT_SEEDS.length);
    // Un plan operationnel n appartient a aucune copropriete.
    expect(store.accounts.every((a: any) => a.syndicateId === null)).toBe(true);
    expect(store.accounts.every((a: any) => a.scope === 'OPERATIONS')).toBe(true);
    expect(store.accounts.every((a: any) => a.tenantId === TENANT_ID)).toBe(true);
  });

  it('est idempotent : la deuxieme piece ne recree rien', async () => {
    await ensureOperationalChartOfAccountsTx(tx, TENANT_ID);
    tx.chartOfAccount.create.mockClear();

    await ensureOperationalChartOfAccountsTx(tx, TENANT_ID);

    expect(tx.chartOfAccount.create).not.toHaveBeenCalled();
    expect(store.accounts).toHaveLength(OPERATIONAL_ACCOUNT_SEEDS.length);
  });

  it('enrichit le plan avec un compte supplementaire', async () => {
    await ensureOperationalChartOfAccountsTx(tx, TENANT_ID);

    const cree: any = await createOperationalAccountTx(tx, TENANT_ID, {
      accountNumber: '622',
      accountName: 'Locations de materiel',
      accountClass: 6,
      accountType: 'EXPENSE'
    });

    expect(cree.accountNumber).toBe('622');
    expect(store.accounts).toHaveLength(OPERATIONAL_ACCOUNT_SEEDS.length + 1);
  });

  it('refuse un numero deja pris en 409, sans tenter l insertion — defaut n°5', async () => {
    await ensureOperationalChartOfAccountsTx(tx, TENANT_ID);
    tx.chartOfAccount.create.mockClear();

    await expect(
      createOperationalAccountTx(tx, TENANT_ID, {
        accountNumber: '401',
        accountName: 'Fournisseurs bis',
        accountClass: 4,
        accountType: 'LIABILITY'
      })
    ).rejects.toMatchObject({ status: 409 });

    // Le doublon est vu par une lecture prealable. Tenter puis rattraper le
    // P2002 aurait condamne la transaction : en PostgreSQL, une commande en
    // echec annule tout ce qui suit jusqu au rollback.
    expect(tx.chartOfAccount.create).not.toHaveBeenCalled();
  });

  it('desactive un compte sans le supprimer, et n expose aucune suppression', async () => {
    const comptes = await ensureOperationalChartOfAccountsTx(tx, TENANT_ID);

    await deactivateOperationalAccountTx(tx, TENANT_ID, comptes.get('605')!);

    const compte = store.accounts.find((a: any) => a.accountNumber === '605');
    expect(compte.isActive).toBe(false);
    expect(store.accounts).toHaveLength(OPERATIONAL_ACCOUNT_SEEDS.length);

    // Supprimer un compte emporterait ses lignes d ecriture (onDelete: Cascade)
    // et trouerait des ecritures verrouillees : aucune fonction de suppression
    // n existe, et ce n est pas un oubli.
    const surface = Object.keys(accountingModule);
    expect(surface.filter(nom => /delete|remove|supprim/i.test(nom))).toEqual([]);
  });

  it('cloisonne les plans de deux agences', async () => {
    await ensureOperationalChartOfAccountsTx(tx, TENANT_ID);
    await ensureOperationalChartOfAccountsTx(tx, AUTRE_TENANT_ID);

    expect(store.accounts).toHaveLength(OPERATIONAL_ACCOUNT_SEEDS.length * 2);
    // Le meme numero coexiste dans les deux agences, sans jointure vers une
    // copropriete pour les distinguer : la colonne `tenantId` suffit.
    expect(store.accounts.filter((a: any) => a.accountNumber === '401')).toHaveLength(2);
  });

  it('reutilise le journal operationnel de l exercice', async () => {
    const premier = await ensureOperationalJournalTx(tx, TENANT_ID, 2026);
    const second = await ensureOperationalJournalTx(tx, TENANT_ID, 2026);

    expect(second).toBe(premier);
    expect(store.journals).toHaveLength(1);

    // Un exercice different est un journal different.
    await ensureOperationalJournalTx(tx, TENANT_ID, 2027);
    expect(store.journals).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------

describe('postDocumentEntryTx', () => {
  it('ecrit l ecriture d une piece validee et la verrouille dans la meme transaction', async () => {
    const { totalDebit, totalCredit, entryId } = await posterFacture(150000);

    const entry = store.entries.find((e: any) => e.id === entryId);
    expect(entry.isLocked).toBe(true);
    expect(entry.documentType).toBe('SUPPLIER_INVOICE');
    expect(entry.documentId).toBe('facture-1');
    expect(entry.tenantId).toBe(TENANT_ID);
    expect(totalDebit).toBe(150000);
    expect(totalCredit).toBe(150000);

    // Le verrou n est pas un appel separe qu on pourrait oublier : l ecriture
    // nait verrouillee, dans la transaction de sa piece.
    expect(tx.journalEntry.update).not.toHaveBeenCalled();
    expect(store.lines.filter((l: any) => l.entryId === entryId)).toHaveLength(2);
  });

  it('refuse une seconde ecriture sur la meme piece — defaut n°2, le verrou est lu', async () => {
    await posterFacture(150000, 'facture-1');

    // C est le changement voulu : au lot 0, verrouiller une ecriture n empechait
    // meme pas d en creer une seconde a la meme reference, parce que le drapeau
    // n etait lu nulle part. Il l est maintenant.
    await expect(posterFacture(150000, 'facture-1', { reference: 'FA-001' })).rejects.toMatchObject({
      status: 409
    });

    expect(store.entries).toHaveLength(1);
  });

  it('ne stocke rien quand l ecriture est desequilibree — defaut n°1', async () => {
    const { journalId, comptes } = await amorcerPlanOperationnel();

    await expect(
      postDocumentEntryTx(tx, {
        tenantId: TENANT_ID,
        journalId,
        entryDate: new Date('2026-03-01T00:00:00.000Z'),
        reference: 'FA-KO',
        description: 'Deux demi-unites au debit',
        documentType: 'SUPPLIER_INVOICE',
        documentId: 'facture-ko',
        lines: [
          { accountId: comptes.get('601')!, debit: 0.5, label: 'Debit 1' },
          { accountId: comptes.get('601')!, debit: 0.5, label: 'Debit 2' },
          { accountId: comptes.get('401')!, credit: 1, label: 'Credit' }
        ]
      })
    ).rejects.toMatchObject({ status: 422 });

    // Le refus precede l ecriture : ni entete, ni lignes.
    expect(store.entries).toHaveLength(0);
    expect(store.lines).toHaveLength(0);
  });

  it('refuse un journal qui appartient a une autre agence', async () => {
    const { journalId } = await amorcerPlanOperationnel(AUTRE_TENANT_ID);
    const comptes = await ensureOperationalChartOfAccountsTx(tx, TENANT_ID);

    await expect(
      postDocumentEntryTx(tx, {
        tenantId: TENANT_ID,
        journalId,
        entryDate: new Date('2026-03-01T00:00:00.000Z'),
        reference: 'FA-002',
        description: 'Journal d une autre agence',
        documentType: 'SUPPLIER_INVOICE',
        documentId: 'facture-2',
        lines: [
          { accountId: comptes.get('601')!, debit: 1000, label: 'Achats' },
          { accountId: comptes.get('401')!, credit: 1000, label: 'Fournisseur' }
        ]
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('refuse un compte etranger au plan operationnel de l agence', async () => {
    const { journalId, comptes } = await amorcerPlanOperationnel();
    const etranger = await ensureOperationalChartOfAccountsTx(tx, AUTRE_TENANT_ID);

    await expect(
      postDocumentEntryTx(tx, {
        tenantId: TENANT_ID,
        journalId,
        entryDate: new Date('2026-03-01T00:00:00.000Z'),
        reference: 'FA-003',
        description: 'Compte d une autre agence',
        documentType: 'SUPPLIER_INVOICE',
        documentId: 'facture-3',
        lines: [
          { accountId: etranger.get('601')!, debit: 1000, label: 'Achats' },
          { accountId: comptes.get('401')!, credit: 1000, label: 'Fournisseur' }
        ]
      })
    ).rejects.toMatchObject({ status: 422 });

    expect(store.entries).toHaveLength(0);
  });

  it('refuse une ecriture sans piece : la piece precede l ecriture (principe P-2)', async () => {
    const { journalId, comptes } = await amorcerPlanOperationnel();

    await expect(
      postDocumentEntryTx(tx, {
        tenantId: TENANT_ID,
        journalId,
        entryDate: new Date('2026-03-01T00:00:00.000Z'),
        reference: 'LIBRE',
        description: 'Ecriture libre',
        documentType: 'SUPPLIER_INVOICE',
        documentId: '',
        lines: [
          { accountId: comptes.get('601')!, debit: 1000, label: 'Achats' },
          { accountId: comptes.get('401')!, credit: 1000, label: 'Fournisseur' }
        ]
      })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('arrondit chaque ligne a l unite avant de la stocker — defaut n°4', async () => {
    const { journalId, comptes } = await amorcerPlanOperationnel();

    await postDocumentEntryTx(tx, {
      tenantId: TENANT_ID,
      journalId,
      entryDate: new Date('2026-03-01T00:00:00.000Z'),
      reference: 'FA-XOF',
      description: 'Le franc CFA n a pas de centime',
      documentType: 'SUPPLIER_INVOICE',
      documentId: 'facture-xof',
      lines: [
        { accountId: comptes.get('601')!, debit: 1200.5, label: 'Achats' },
        { accountId: comptes.get('401')!, credit: 1200.5, label: 'Fournisseur' }
      ]
    });

    expect(store.lines.map((l: any) => l.debit)).toEqual([1201, 0]);
    expect(store.lines.map((l: any) => l.credit)).toEqual([0, 1201]);
  });
});

// ---------------------------------------------------------------------------

describe('voidDocumentTx', () => {
  it('cree la piece d annulation, l ecriture inverse, et les relie', async () => {
    const { entryId } = await posterFacture(150000, 'facture-1');

    const { voidDocumentId, reversingEntryId } = await voidDocumentTx(tx, {
      tenantId: TENANT_ID,
      documentType: 'SUPPLIER_INVOICE',
      documentId: 'facture-1',
      reason: 'Montant errone',
      voidedByUserId: 'user-1'
    });

    const piece = store.voidDocuments.find((v: any) => v.id === voidDocumentId);
    expect(piece.reversingEntryId).toBe(reversingEntryId);
    expect(piece.reason).toBe('Montant errone');
    expect(piece.voidedByUserId).toBe('user-1');

    const inverse = store.entries.find((e: any) => e.id === reversingEntryId);
    expect(inverse.isLocked).toBe(true);
    // Le lien porte de l annulation vers l annulee, pour ne pas avoir a
    // modifier une ecriture verrouillee.
    expect(inverse.voidedByEntryId).toBe(entryId);
  });

  it('remet le compte du fournisseur dans l etat ou il etait avant la piece', async () => {
    await posterFacture(150000, 'facture-1');

    // Le compte du fournisseur, et le mouvement que la facture y a pose.
    store.thirdPartyAccounts.push({ id: 'compte-frs', tenantId: TENANT_ID, balance: 150000 });
    store.movements.push({
      id: 'mvt-facture',
      accountId: 'compte-frs',
      tenantId: TENANT_ID,
      type: 'INVOICE',
      debit: 150000,
      credit: null,
      label: 'Facture fournisseur',
      sourceType: 'SUPPLIER_INVOICE',
      sourceId: 'facture-1'
    });

    await voidDocumentTx(tx, {
      tenantId: TENANT_ID,
      documentType: 'SUPPLIER_INVOICE',
      documentId: 'facture-1',
      reason: 'Montant errone',
      voidedByUserId: 'user-1'
    });

    // Le defaut que ce test epingle : jusqu'au 19 septembre 2026, l ecriture
    // etait inversee et les imputations retirees, mais le compte de tiers
    // n etait jamais touche. Le solde, qui est la raison d etre de ce module,
    // restait donc celui d avant l annulation.
    const compte = store.thirdPartyAccounts.find((c: any) => c.id === 'compte-frs');
    expect(compte.balance).toBe(0);

    // Rien n est efface : le releve montre les deux lignes.
    const inversion = store.movements.find((m: any) => m.sourceType === 'VOID');
    expect(inversion.sourceId).toBe('mvt-facture');
    expect(Number(inversion.credit)).toBe(150000);
    expect(store.movements).toHaveLength(2);
  });

  it('echange les deux sens, ligne a ligne, sans toucher aux montants', async () => {
    const { entryId } = await posterFacture(150000, 'facture-1');
    const origine = store.lines.filter((l: any) => l.entryId === entryId);

    const { reversingEntryId } = await voidDocumentTx(tx, {
      tenantId: TENANT_ID,
      documentType: 'SUPPLIER_INVOICE',
      documentId: 'facture-1',
      reason: 'Montant errone',
      voidedByUserId: 'user-1'
    });

    const inverse = store.lines.filter((l: any) => l.entryId === reversingEntryId);
    expect(inverse).toHaveLength(origine.length);
    expect(inverse.map((l: any) => l.debit)).toEqual(origine.map((l: any) => l.credit));
    expect(inverse.map((l: any) => l.credit)).toEqual(origine.map((l: any) => l.debit));
    expect(inverse.map((l: any) => l.accountId)).toEqual(origine.map((l: any) => l.accountId));
  });

  it('ne modifie ni la piece d origine ni son ecriture : l historique montre les deux', async () => {
    const { entryId } = await posterFacture(150000, 'facture-1');
    const avant = JSON.stringify(store.entries.find((e: any) => e.id === entryId));
    const lignesAvant = JSON.stringify(store.lines.filter((l: any) => l.entryId === entryId));

    await voidDocumentTx(tx, {
      tenantId: TENANT_ID,
      documentType: 'SUPPLIER_INVOICE',
      documentId: 'facture-1',
      reason: 'Montant errone',
      voidedByUserId: 'user-1'
    });

    expect(JSON.stringify(store.entries.find((e: any) => e.id === entryId))).toBe(avant);
    expect(JSON.stringify(store.lines.filter((l: any) => l.entryId === entryId))).toBe(lignesAvant);
    // Les deux mouvements coexistent : rien n a ete efface ni corrige sur place.
    expect(store.entries).toHaveLength(2);
  });

  it('marque les imputations de chantier comme annulees, sans les supprimer', async () => {
    await posterFacture(150000, 'facture-1');
    store.costAllocations.push({
      id: 'alloc-1',
      tenantId: TENANT_ID,
      sourceType: 'SUPPLIER_INVOICE',
      sourceId: 'facture-1',
      amount: 150000,
      voidedAt: null
    });

    await voidDocumentTx(tx, {
      tenantId: TENANT_ID,
      documentType: 'SUPPLIER_INVOICE',
      documentId: 'facture-1',
      reason: 'Montant errone',
      voidedByUserId: 'user-1'
    });

    expect(store.costAllocations).toHaveLength(1);
    expect(store.costAllocations[0].voidedAt).toBeInstanceOf(Date);
  });

  it('refuse une seconde annulation : ce lot n annule pas une annulation', async () => {
    await posterFacture(150000, 'facture-1');
    const params = {
      tenantId: TENANT_ID,
      documentType: 'SUPPLIER_INVOICE' as const,
      documentId: 'facture-1',
      reason: 'Montant errone',
      voidedByUserId: 'user-1'
    };

    await voidDocumentTx(tx, params);

    await expect(voidDocumentTx(tx, params)).rejects.toMatchObject({ status: 409 });
    expect(store.voidDocuments).toHaveLength(1);
  });

  it('refuse d annuler une piece sans ecriture, ou d une autre agence', async () => {
    await posterFacture(150000, 'facture-1');

    await expect(
      voidDocumentTx(tx, {
        tenantId: TENANT_ID,
        documentType: 'SUPPLIER_INVOICE',
        documentId: 'facture-inconnue',
        reason: 'Erreur',
        voidedByUserId: 'user-1'
      })
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      voidDocumentTx(tx, {
        tenantId: AUTRE_TENANT_ID,
        documentType: 'SUPPLIER_INVOICE',
        documentId: 'facture-1',
        reason: 'Erreur',
        voidedByUserId: 'user-1'
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------

describe('getTrialBalance', () => {
  it('agrege par compte, trie par numero, et se declare equilibree', async () => {
    await posterFacture(150000, 'facture-1', { reference: 'FA-001' });
    await posterFacture(50000, 'facture-2', { reference: 'FA-002' });

    const balance = await getTrialBalance(TENANT_ID, 'OPERATIONS' as any);

    expect(balance.lines.map(l => l.accountNumber)).toEqual(['401', '601']);
    expect(balance.lines.find(l => l.accountNumber === '401')).toMatchObject({
      accountName: 'Fournisseurs',
      totalBilled: 0,
      totalSettled: 200000,
      balance: -200000
    });
    expect(balance.lines.find(l => l.accountNumber === '601')).toMatchObject({
      totalBilled: 200000,
      totalSettled: 0,
      balance: 200000
    });
    expect(balance.totalBilled).toBe(200000);
    expect(balance.totalSettled).toBe(200000);
    expect(balance.isBalanced).toBe(true);
  });

  it('agrege en SQL et non en memoire : aucune ligne d ecriture n est chargee', async () => {
    await posterFacture(150000, 'facture-1');
    tx.journalEntryLine.groupBy.mockClear();

    await getTrialBalance(TENANT_ID, 'OPERATIONS' as any);

    // Le banc de charge du lot 0 mesure un facteur trente entre les deux
    // approches : la balance ne ramene qu une ligne par compte.
    expect(tx.journalEntryLine.groupBy).toHaveBeenCalledTimes(1);
    expect(tx.journalEntryLine.findMany).toBeUndefined();
  });

  it('borne l agregation a la periode demandee', async () => {
    const { journalId, comptes } = await amorcerPlanOperationnel();
    for (const [index, mois] of ['01', '06'].entries()) {
      await postDocumentEntryTx(tx, {
        tenantId: TENANT_ID,
        journalId,
        entryDate: new Date(`2026-${mois}-15T00:00:00.000Z`),
        reference: `FA-${mois}`,
        description: 'Facture',
        documentType: 'SUPPLIER_INVOICE',
        documentId: `facture-${index}`,
        lines: [
          { accountId: comptes.get('601')!, debit: 10000, label: 'Achats' },
          { accountId: comptes.get('401')!, credit: 10000, label: 'Fournisseur' }
        ]
      });
    }

    const balance = await getTrialBalance(TENANT_ID, 'OPERATIONS' as any, {
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-03-31T00:00:00.000Z')
    });

    expect(balance.totalBilled).toBe(10000);
    expect(balance.isBalanced).toBe(true);
  });

  it('ne voit pas les ecritures d une autre agence', async () => {
    await posterFacture(150000, 'facture-1', { tenantId: AUTRE_TENANT_ID });

    const balance = await getTrialBalance(TENANT_ID, 'OPERATIONS' as any);

    expect(balance.lines).toEqual([]);
    expect(balance.totalBilled).toBe(0);
    expect(balance.isBalanced).toBe(true);
  });

  it('ne voit pas les ecritures de la copropriete, qui gardent leur propre chemin', async () => {
    await posterFacture(150000, 'facture-1');
    // La copropriete ecrit dans la meme table, avec la portee SYNDICATE.
    store.accounts.push({
      id: 'acc-syndic',
      tenantId: TENANT_ID,
      syndicateId: 'syndic-1',
      scope: 'SYNDICATE',
      accountNumber: '401',
      accountName: 'Fournisseurs copropriete'
    });
    store.entries.push({
      id: 'entry-syndic',
      tenantId: TENANT_ID,
      journalId: 'journal-syndic',
      entryDate: new Date('2026-03-01T00:00:00.000Z')
    });
    store.lines.push({ id: 'line-syndic', entryId: 'entry-syndic', accountId: 'acc-syndic', debit: 999, credit: 0 });

    const balance = await getTrialBalance(TENANT_ID, 'OPERATIONS' as any);

    expect(balance.totalBilled).toBe(150000);
    expect(balance.lines.every(l => l.accountName !== 'Fournisseurs copropriete')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveExpenseAccountsByCostCategoryTx
//
// La dette du lot 2, promise au lot 3 par son rapport, oubliee de sa
// specification, et tenue le 19 septembre 2026 : sans ce lien, toute depense de
// chantier frappait le meme compte et le grand livre ne distinguait pas le
// ciment de la main-d'oeuvre.
// ---------------------------------------------------------------------------

describe('resolveExpenseAccountsByCostCategoryTx', () => {
  const PAR_DEFAUT = 'compte-par-defaut';

  function semerCompte(surcharges: Record<string, unknown> = {}): Record<string, any> {
    const compte = {
      id: `coa-${store.accounts.length + 1}`,
      tenantId: TENANT_ID,
      scope: 'OPERATIONS',
      isActive: true,
      ...surcharges
    };
    store.accounts.push(compte);
    return compte;
  }

  function semerPoste(chartOfAccountId: string | null, surcharges: Record<string, unknown> = {}): Record<string, any> {
    const poste = {
      id: `poste-${store.costCategories.length + 1}`,
      tenantId: TENANT_ID,
      chartOfAccountId,
      ...surcharges
    };
    store.costCategories.push(poste);
    return poste;
  }

  it('rend le compte du poste quand il en porte un', async () => {
    const compte = semerCompte();
    const poste = semerPoste(compte.id);

    const comptes = await resolveExpenseAccountsByCostCategoryTx(tx, TENANT_ID, [poste.id], PAR_DEFAUT);

    expect(comptes.get(poste.id)).toBe(compte.id);
  });

  it('retombe sur le defaut quand le poste n en porte aucun', async () => {
    const poste = semerPoste(null);

    const comptes = await resolveExpenseAccountsByCostCategoryTx(tx, TENANT_ID, [poste.id], PAR_DEFAUT);

    // C'est ce cas qui garantit qu'aucune donnee existante ne change de
    // comportement du seul fait de la nouvelle colonne.
    expect(comptes.get(poste.id)).toBe(PAR_DEFAUT);
  });

  it('retombe sur le defaut quand le compte designe est desactive', async () => {
    const compte = semerCompte({ isActive: false });
    const poste = semerPoste(compte.id);

    const comptes = await resolveExpenseAccountsByCostCategoryTx(tx, TENANT_ID, [poste.id], PAR_DEFAUT);

    // Un compte desactive porte deja des mouvements — c'est pour cela qu'on le
    // desactive au lieu de le supprimer — mais il n'en accepte plus de
    // nouveaux. On retombe plutot que de lever : une facture qui a bien eu lieu
    // doit pouvoir s'enregistrer, meme si le parametrage d'un poste est douteux.
    expect(comptes.get(poste.id)).toBe(PAR_DEFAUT);
  });

  it('retombe sur le defaut quand le compte releve de la copropriete', async () => {
    const compte = semerCompte({ scope: 'SYNDIC' });
    const poste = semerPoste(compte.id);

    const comptes = await resolveExpenseAccountsByCostCategoryTx(tx, TENANT_ID, [poste.id], PAR_DEFAUT);

    // Une ecriture d'agence ne doit jamais frapper un compte de copropriete :
    // la generalisation du lot 2 aurait ouvert une porte qu'elle voulait fermer.
    expect(comptes.get(poste.id)).toBe(PAR_DEFAUT);
  });

  it('retombe sur le defaut quand le poste appartient a une autre agence', async () => {
    const compte = semerCompte();
    const poste = semerPoste(compte.id, { tenantId: 'autre-agence' });

    const comptes = await resolveExpenseAccountsByCostCategoryTx(tx, TENANT_ID, [poste.id], PAR_DEFAUT);

    expect(comptes.get(poste.id)).toBe(PAR_DEFAUT);
  });

  it('resout plusieurs postes en UNE seule requete', async () => {
    const compteA = semerCompte();
    const posteA = semerPoste(compteA.id);
    const posteB = semerPoste(null);
    tx.costCategory.findMany.mockClear();

    const comptes = await resolveExpenseAccountsByCostCategoryTx(
      tx,
      TENANT_ID,
      [posteA.id, posteB.id, posteA.id],
      PAR_DEFAUT
    );

    expect(comptes.get(posteA.id)).toBe(compteA.id);
    expect(comptes.get(posteB.id)).toBe(PAR_DEFAUT);
    // Une requete par lot, jamais une par poste : la lecon du compte rendu de
    // campagne du lot 1.
    expect(tx.costCategory.findMany).toHaveBeenCalledTimes(1);
  });
});
