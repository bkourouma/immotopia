/**
 * Tests de caracterisation du moteur comptable de copropriete.
 *
 * Objectif : figer le comportement ACTUEL de bout en bout (route -> controleur ->
 * `lib/syndics/queries`) avant la generalisation multi-tenant du lot 2. Contrairement
 * a `syndics.accounting.test.ts`, qui mocke la couche requete, ce fichier mocke
 * uniquement Prisma : le plan de comptes, les journaux, les ecritures, le
 * verrouillage et la balance sont donc reellement executes.
 *
 * Au lot 0, aucun test d'ici ne corrigeait le comportement : il le decrivait, y
 * compris quand il surprenait (cas annotes SURPRISE). Le lot 2 fait evoluer
 * deux de ces cas — les defauts n°1 et n°5 du §6.1 bis du plan — et chacun
 * porte au-dessus de lui le commentaire qui dit pourquoi le changement est
 * voulu, avec le renvoi vers la section de la specification qui l'a decide. Les
 * SURPRISE restants decrivent des comportements deliberement laisses
 * identiques : les corriger changerait la copropriete deja en service, hors du
 * perimetre de ce lot.
 */

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isClient: false };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  enforcePropertyTenantIsolation: (_req: any, _res: any, next: any) => next()
}));

jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requireAnyPropertyPermission: () => (_req: any, _res: any, next: any) => next(),
  requirePropertyPermission: () => (_req: any, _res: any, next: any) => next()
}));

jest.mock('../../src/lib/syndics/notifications', () => ({
  notifyChargeCall: jest.fn().mockResolvedValue({ emailSent: true, whatsappSent: false }),
  notifyMeetingConvocation: jest.fn().mockResolvedValue({ emailSent: 0, whatsappSent: 0 }),
  notifyChargeCallReminder: jest.fn().mockResolvedValue({ emailSent: true, whatsappSent: false })
}));

jest.mock('../../src/lib/syndics/owner-account-statement', () => ({
  buildOwnerAccountStatementPdf: jest.fn().mockResolvedValue(Buffer.from('PDF-STATEMENT'))
}));

jest.mock('@prisma/client', () => {
  type Row = Record<string, any>;

  const store = {
    syndicates: [] as Row[],
    accounts: [] as Row[],
    journals: [] as Row[],
    entries: [] as Row[],
    lines: [] as Row[],
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

  const compareValues = (left: any, right: any) => {
    if (left instanceof Date || right instanceof Date) {
      return new Date(left).getTime() - new Date(right).getTime();
    }
    if (typeof left === 'number' && typeof right === 'number') {
      return left - right;
    }
    return String(left).localeCompare(String(right));
  };

  /** Construit un comparateur a partir d'un `orderBy` Prisma de la forme [{champ: 'asc'}]. */
  const buildComparator = (orderBy?: Row[]) => (a: Row, b: Row) => {
    for (const clause of orderBy ?? []) {
      const [field, direction] = Object.entries(clause)[0] as [string, string];
      const delta = compareValues(a[field], b[field]);
      if (delta !== 0) {
        return direction === 'desc' ? -delta : delta;
      }
    }
    return 0;
  };

  const journalOf = (entry: Row) => store.journals.find(j => j.id === entry.journalId);
  const accountOf = (line: Row) => store.accounts.find(a => a.id === line.accountId);

  const hydrateEntry = (entry: Row) => ({
    ...entry,
    journal: journalOf(entry) ?? null,
    lines: store.lines
      .filter(l => l.entryId === entry.id)
      .sort(buildComparator([{ createdAt: 'asc' }]))
      .map(l => ({ ...l, account: accountOf(l) ?? null, lot: null }))
  });

  const client: Row = {
    syndicate: {
      findFirst: jest.fn(async (args: Row) => {
        const found = store.syndicates.find(
          s => s.id === args.where.id && s.tenantId === args.where.tenantId && s.status !== 'IN_LIQUIDATION'
        );
        return found ? { id: found.id } : null;
      })
    },
    chartOfAccount: {
      findMany: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        return store.accounts
          .filter(a => a.syndicateId === where.syndicateId)
          .filter(a => where.isActive === undefined || a.isActive === where.isActive)
          .sort(buildComparator(args.orderBy))
          .map(a =>
            args.include?.parent
              ? { ...a, parent: store.accounts.find(p => p.id === a.parentAccountId) ?? null }
              : { ...a }
          );
      }),
      findFirst: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        const found = store.accounts.find(a => a.id === where.id && a.syndicateId === where.syndicateId);
        return found ? { id: found.id } : null;
      }),
      count: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        const ids: string[] = where.id?.in ?? [];
        return store.accounts.filter(a => a.syndicateId === where.syndicateId && ids.includes(a.id)).length;
      }),
      create: jest.fn(async (args: Row) => {
        const data = args.data;
        const duplicate = store.accounts.some(
          a => a.syndicateId === data.syndicateId && a.accountNumber === data.accountNumber
        );
        if (duplicate) {
          // Reproduit l erreur Prisma P2002 sur @@unique([syndicateId, accountNumber]).
          const error: any = new Error('Unique constraint failed on the fields: (`syndicate_id`,`account_number`)');
          error.code = 'P2002';
          error.meta = { target: ['syndicate_id', 'account_number'] };
          throw error;
        }
        const created = {
          id: `acc-${nextSeq()}`,
          isActive: true,
          parentAccountId: null,
          createdAt: nextCreatedAt(),
          ...data
        };
        store.accounts.push(created);
        return created;
      })
    },
    accountingJournal: {
      findMany: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        return store.journals
          .filter(j => j.syndicateId === where.syndicateId)
          .filter(j => where.fiscalYear === undefined || j.fiscalYear === where.fiscalYear)
          .sort(buildComparator(args.orderBy))
          .map(j => ({ ...j }));
      }),
      findFirst: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        const found = store.journals.find(j => j.id === where.id && j.syndicateId === where.syndicateId);
        return found ? { id: found.id, fiscalYear: found.fiscalYear } : null;
      }),
      create: jest.fn(async (args: Row) => {
        const created = { id: `journal-${nextSeq()}`, createdAt: nextCreatedAt(), ...args.data };
        store.journals.push(created);
        return created;
      })
    },
    journalEntry: {
      findMany: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        const syndicateId = where.journal?.syndicateId;
        const rows = store.entries
          .filter(e => (syndicateId === undefined ? true : journalOf(e)?.syndicateId === syndicateId))
          .filter(e => where.journalId === undefined || e.journalId === where.journalId)
          .filter(e => matchesDateFilter(new Date(e.entryDate), where.entryDate))
          .sort(buildComparator(args.orderBy));
        const skip = args.skip ?? 0;
        const take = args.take ?? rows.length;
        return rows.slice(skip, skip + take).map(hydrateEntry);
      }),
      findFirst: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        const syndicateId = where.journal?.syndicateId;
        const found = store.entries.find(
          e => e.id === where.id && (syndicateId === undefined || journalOf(e)?.syndicateId === syndicateId)
        );
        return found ? { id: found.id, isLocked: found.isLocked } : null;
      }),
      findUnique: jest.fn(async (args: Row) => {
        const found = store.entries.find(e => e.id === args.where.id);
        if (!found) {
          return null;
        }
        return args.include ? hydrateEntry(found) : { ...found };
      }),
      create: jest.fn(async (args: Row) => {
        const created = {
          id: `entry-${nextSeq()}`,
          isLocked: false,
          sourceId: null,
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
      findMany: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        const syndicateId = where.entry?.journal?.syndicateId ?? where.account?.syndicateId;
        return store.lines
          .filter(l => {
            const entry = store.entries.find(e => e.id === l.entryId);
            if (!entry) {
              return false;
            }
            if (syndicateId !== undefined && journalOf(entry)?.syndicateId !== syndicateId) {
              return false;
            }
            if (where.accountId !== undefined && l.accountId !== where.accountId) {
              return false;
            }
            return matchesDateFilter(new Date(entry.entryDate), where.entry?.entryDate);
          })
          .map(l => ({ ...l, account: accountOf(l) ?? null }));
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

import express from 'express';
import request from 'supertest';
import syndicRoutes from '../../src/routes/syndic-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const { __store: store } = jest.requireMock('@prisma/client') as { __store: any };

const TENANT_ID = 'tenant-1';
const AUTRE_TENANT_ID = 'tenant-2';
const SYNDIC_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_1_ID = '33333333-3333-4333-8333-333333333333';
const ACCOUNT_2_ID = '44444444-4444-4444-8444-444444444444';
const JOURNAL_ID = '22222222-2222-4222-8222-222222222222';

const base = (tenantId = TENANT_ID) => `/api/tenants/${tenantId}/syndics/${SYNDIC_ID}/comptabilite`;

/** Ajoute un compte comptable directement dans le magasin Prisma simule. */
function seedAccount(id: string, accountNumber: string, accountName: string, extra: Record<string, any> = {}) {
  const account = {
    id,
    syndicateId: SYNDIC_ID,
    accountNumber,
    accountName,
    accountClass: Number(accountNumber[0]),
    accountType: 'ASSET',
    isAuxiliary: false,
    parentAccountId: null,
    isActive: true,
    createdAt: new Date(Date.UTC(2026, 0, 1)),
    ...extra
  };
  store.accounts.push(account);
  return account;
}

function seedJournal(id = JOURNAL_ID, fiscalYear = 2026, code = 'JG') {
  const journal = {
    id,
    syndicateId: SYNDIC_ID,
    journalType: 'GENERAL',
    label: `Journal ${code}`,
    code,
    fiscalYear,
    createdAt: new Date(Date.UTC(2026, 0, 1))
  };
  store.journals.push(journal);
  return journal;
}

const app = express();
app.use(express.json());
app.use('/api', syndicRoutes);
// Sans ceci, une erreur typee (throw + asyncHandler) tombe sur le
// gestionnaire par defaut d'Express : le corps JSON est vide ({}) et le
// statut retombe sur err.status s'il existe, sinon 500 — ce qui masquait,
// avant ce correctif, a la fois l'absence de `error` dans le corps (lot 2,
// controleurs syndic/biens/baux -> errorHandler) et deux ecarts de statut
// qui n'etaient qu'un artefact du gestionnaire par defaut (voir plus bas).
app.use(errorHandler);

/** Poste une ecriture equilibree simple entre les deux comptes de base. */
async function posterEcriture(montant: number, entryDate: string, reference: string, extra: Record<string, any> = {}) {
  return request(app)
    .post(`${base()}/ecritures`)
    .send({
      journalId: JOURNAL_ID,
      entryDate,
      reference,
      description: `Ecriture ${reference}`,
      sourceType: 'MANUAL',
      lines: [
        { accountId: ACCOUNT_1_ID, debit: montant, credit: 0, label: 'Debit' },
        { accountId: ACCOUNT_2_ID, debit: 0, credit: montant, label: 'Credit' }
      ],
      ...extra
    });
}

describe('Caracterisation - moteur comptable de copropriete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    store.syndicates.length = 0;
    store.accounts.length = 0;
    store.journals.length = 0;
    store.entries.length = 0;
    store.lines.length = 0;
    store.seq = 0;

    store.syndicates.push({ id: SYNDIC_ID, tenantId: TENANT_ID, status: 'ACTIVE' });
  });

  describe('Plan de comptes', () => {
    it('cree un compte et applique les valeurs par defaut isAuxiliary=false et isActive=true', async () => {
      const response = await request(app).post(`${base()}/comptes`).send({
        accountNumber: '401',
        accountName: 'Fournisseurs',
        accountClass: 4,
        accountType: 'LIABILITY'
      });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        accountNumber: '401',
        accountName: 'Fournisseurs',
        accountType: 'LIABILITY',
        isAuxiliary: false,
        isActive: true,
        syndicateId: SYNDIC_ID
      });
    });

    // Corrige au lot 2 (defaut n°5, voir
    // `specs/017-finance-fournisseurs-chantiers/data-model.md#defaut-5`).
    //
    // Ce cas change sa propre assertion, et c'est voulu : la correction porte
    // des deux cotes, copropriete comprise, parce qu'elle est le garde-fou exact
    // de la migration `generalize_accounting_scope`. C'est justement l'ancienne
    // contrainte `@@unique([syndicateId, accountNumber])` que cette migration
    // remplace par deux index uniques partiels : le chemin d'erreur qui la
    // couvre devait etre juste avant que la contrainte ne change de forme.
    //
    // Le message technique de Prisma ne fuit plus vers la gestionnaire, et un
    // doublon est un conflit (409), pas une requete malformee (400).
    it('corrige (lot 2) : la violation d unicite (syndicateId, accountNumber) renvoie 409 avec un message metier', async () => {
      seedAccount(ACCOUNT_1_ID, '401', 'Fournisseurs');

      const response = await request(app).post(`${base()}/comptes`).send({
        accountNumber: '401',
        accountName: 'Fournisseurs bis',
        accountClass: 4,
        accountType: 'LIABILITY'
      });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('401');
      expect(response.body.error).not.toContain('Unique constraint failed');
    });

    it('le meme numero de compte reste acceptable dans une autre copropriete', async () => {
      store.syndicates.push({ id: 'syndic-2', tenantId: TENANT_ID, status: 'ACTIVE' });
      store.accounts.push({
        id: 'acc-autre',
        syndicateId: 'syndic-2',
        accountNumber: '401',
        accountName: 'Fournisseurs',
        accountClass: 4,
        accountType: 'LIABILITY',
        isAuxiliary: false,
        parentAccountId: null,
        isActive: true,
        createdAt: new Date(Date.UTC(2026, 0, 1))
      });

      const response = await request(app).post(`${base()}/comptes`).send({
        accountNumber: '401',
        accountName: 'Fournisseurs',
        accountClass: 4,
        accountType: 'LIABILITY'
      });

      expect(response.status).toBe(201);
    });

    it('ne liste que les comptes actifs par defaut, tries par numero croissant', async () => {
      seedAccount(ACCOUNT_2_ID, '512', 'Banque');
      seedAccount(ACCOUNT_1_ID, '401', 'Fournisseurs');
      seedAccount('acc-inactif', '606', 'Achats non stockes', { isActive: false });

      const response = await request(app).get(`${base()}/comptes`);

      expect(response.status).toBe(200);
      expect(response.body.data.map((a: any) => a.accountNumber)).toEqual(['401', '512']);
    });

    it('inclut les comptes inactifs quand onlyActive=false', async () => {
      seedAccount(ACCOUNT_1_ID, '401', 'Fournisseurs');
      seedAccount('acc-inactif', '606', 'Achats non stockes', { isActive: false });

      const response = await request(app).get(`${base()}/comptes`).query({ onlyActive: 'false' });

      expect(response.status).toBe(200);
      expect(response.body.data.map((a: any) => a.accountNumber)).toEqual(['401', '606']);
    });

    it('SURPRISE : toute valeur autre que la chaine "false" active le filtre onlyActive', async () => {
      seedAccount('acc-inactif', '606', 'Achats non stockes', { isActive: false });

      // `req.query.onlyActive !== 'false'` : ni 0, ni false booleen, ni "FALSE" ne desactivent le filtre.
      const response = await request(app).get(`${base()}/comptes`).query({ onlyActive: '0' });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
    });

    it('rattache un compte enfant a son parent et hydrate le parent au listage', async () => {
      seedAccount(ACCOUNT_1_ID, '401', 'Fournisseurs');

      const creation = await request(app).post(`${base()}/comptes`).send({
        accountNumber: '4011',
        accountName: 'Fournisseurs prestataires',
        accountClass: 4,
        accountType: 'LIABILITY',
        parentAccountId: ACCOUNT_1_ID
      });

      expect(creation.status).toBe(201);
      expect(creation.body.data.parentAccountId).toBe(ACCOUNT_1_ID);

      const listage = await request(app).get(`${base()}/comptes`);
      const enfant = listage.body.data.find((a: any) => a.accountNumber === '4011');
      expect(enfant.parent.accountNumber).toBe('401');
    });

    it('refuse en 404 un parent appartenant a une autre copropriete', async () => {
      store.syndicates.push({ id: 'syndic-2', tenantId: TENANT_ID, status: 'ACTIVE' });
      store.accounts.push({
        id: 'acc-parent-ailleurs',
        syndicateId: 'syndic-2',
        accountNumber: '401',
        accountName: 'Fournisseurs',
        accountClass: 4,
        accountType: 'LIABILITY',
        isActive: true,
        parentAccountId: null,
        createdAt: new Date(Date.UTC(2026, 0, 1))
      });

      const response = await request(app).post(`${base()}/comptes`).send({
        accountNumber: '4011',
        accountName: 'Fournisseurs prestataires',
        accountClass: 4,
        accountType: 'LIABILITY',
        parentAccountId: '55555555-5555-4555-8555-555555555555'
      });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Compte parent introuvable pour cette copropriete');
    });
  });

  describe('Journaux', () => {
    it('cree un journal comptable rattache a la copropriete', async () => {
      const response = await request(app).post(`${base()}/journaux`).send({
        journalType: 'BANK',
        label: 'Journal de banque',
        code: 'BQ',
        fiscalYear: 2026
      });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({ code: 'BQ', fiscalYear: 2026, syndicateId: SYNDIC_ID });
    });

    it('filtre les journaux par exercice et les trie par exercice decroissant puis code', async () => {
      seedJournal('journal-2025', 2025, 'JG');
      seedJournal('journal-2026-bq', 2026, 'BQ');
      seedJournal('journal-2026-jg', 2026, 'JG');

      const tous = await request(app).get(`${base()}/journaux`);
      expect(tous.body.data.map((j: any) => `${j.fiscalYear}-${j.code}`)).toEqual(['2026-BQ', '2026-JG', '2025-JG']);

      const filtres = await request(app).get(`${base()}/journaux`).query({ fiscalYear: '2025' });
      expect(filtres.body.data.map((j: any) => j.id)).toEqual(['journal-2025']);
    });
  });

  describe('Isolation multi-tenant', () => {
    it('renvoie 403 TENANT_ISOLATION_ERROR sur le plan de comptes d un autre tenant', async () => {
      seedAccount(ACCOUNT_1_ID, '401', 'Fournisseurs');

      const response = await request(app).get(`${base(AUTRE_TENANT_ID)}/comptes`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Copropriete introuvable pour ce tenant');
    });

    it('bloque aussi la creation d une ecriture pour un autre tenant', async () => {
      seedJournal();
      seedAccount(ACCOUNT_1_ID, '401', 'Fournisseurs');
      seedAccount(ACCOUNT_2_ID, '512', 'Banque');

      const response = await request(app)
        .post(`${base(AUTRE_TENANT_ID)}/ecritures`)
        .send({
          journalId: JOURNAL_ID,
          entryDate: '2026-03-01T00:00:00.000Z',
          reference: 'JE-ISOL',
          description: 'Tentative inter-tenant',
          sourceType: 'MANUAL',
          lines: [
            { accountId: ACCOUNT_1_ID, debit: 1000, credit: 0, label: 'Debit' },
            { accountId: ACCOUNT_2_ID, debit: 0, credit: 1000, label: 'Credit' }
          ]
        });

      expect(response.status).toBe(403);
      expect(store.entries).toHaveLength(0);
    });
  });

  describe('Ecritures', () => {
    beforeEach(() => {
      seedJournal();
      seedAccount(ACCOUNT_1_ID, '401', 'Fournisseurs');
      seedAccount(ACCOUNT_2_ID, '512', 'Banque');
    });

    it('cree une ecriture equilibree avec ses deux lignes', async () => {
      const response = await posterEcriture(10000, '2026-03-01T00:00:00.000Z', 'JE-001');

      expect(response.status).toBe(201);
      expect(response.body.data.lines).toHaveLength(2);
      expect(response.body.data.lines.map((l: any) => [l.debit, l.credit])).toEqual([
        [10000, 0],
        [0, 10000]
      ]);
      expect(response.body.data.isLocked).toBe(false);
    });

    it('refuse une ecriture desequilibree en 422 avec un message explicite', async () => {
      const response = await request(app)
        .post(`${base()}/ecritures`)
        .send({
          journalId: JOURNAL_ID,
          entryDate: '2026-03-01T00:00:00.000Z',
          reference: 'JE-KO',
          description: 'Ecriture non equilibree',
          sourceType: 'MANUAL',
          lines: [
            { accountId: ACCOUNT_1_ID, debit: 10000, credit: 0, label: 'Debit' },
            { accountId: ACCOUNT_2_ID, debit: 0, credit: 9000, label: 'Credit' }
          ]
        });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe('Ecriture non equilibree: total debit doit etre egal au total credit');
      expect(store.entries).toHaveLength(0);
      expect(store.lines).toHaveLength(0);
    });

    it('refuse en 422 une ligne pointant un compte d une autre copropriete', async () => {
      const response = await request(app)
        .post(`${base()}/ecritures`)
        .send({
          journalId: JOURNAL_ID,
          entryDate: '2026-03-01T00:00:00.000Z',
          reference: 'JE-CPT',
          description: 'Compte etranger',
          sourceType: 'MANUAL',
          lines: [
            { accountId: ACCOUNT_1_ID, debit: 1000, credit: 0, label: 'Debit' },
            { accountId: '66666666-6666-4666-8666-666666666666', debit: 0, credit: 1000, label: 'Credit' }
          ]
        });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe('Au moins un compte comptable est invalide pour cette copropriete');
    });

    it('refuse en 404 un journal inconnu pour la copropriete', async () => {
      const response = await request(app)
        .post(`${base()}/ecritures`)
        .send({
          journalId: '77777777-7777-4777-8777-777777777777',
          entryDate: '2026-03-01T00:00:00.000Z',
          reference: 'JE-JNL',
          description: 'Journal inconnu',
          sourceType: 'MANUAL',
          lines: [
            { accountId: ACCOUNT_1_ID, debit: 1000, credit: 0, label: 'Debit' },
            { accountId: ACCOUNT_2_ID, debit: 0, credit: 1000, label: 'Credit' }
          ]
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Journal comptable introuvable pour cette copropriete');
    });

    it('conserve sourceType et sourceId sur l ecriture', async () => {
      const response = await posterEcriture(5000, '2026-03-05T00:00:00.000Z', 'JE-SRC', {
        sourceType: 'CHARGE_PAYMENT',
        sourceId: 'payment-42'
      });

      expect(response.status).toBe(201);
      expect(response.body.data.sourceType).toBe('CHARGE_PAYMENT');
      expect(response.body.data.sourceId).toBe('payment-42');
    });

    it('arrondit chaque ligne au centime avec roundMoney', async () => {
      const response = await request(app)
        .post(`${base()}/ecritures`)
        .send({
          journalId: JOURNAL_ID,
          entryDate: '2026-03-01T00:00:00.000Z',
          reference: 'JE-ARR',
          description: 'Repartition par tantiemes',
          sourceType: 'MANUAL',
          lines: [
            { accountId: ACCOUNT_1_ID, debit: 33.333, credit: 0, label: 'Quote-part 1' },
            { accountId: ACCOUNT_1_ID, debit: 66.667, credit: 0, label: 'Quote-part 2' },
            { accountId: ACCOUNT_2_ID, debit: 0, credit: 100, label: 'Contrepartie' }
          ]
        });

      expect(response.status).toBe(201);
      expect(response.body.data.lines.map((l: any) => l.debit)).toEqual([33.33, 66.67, 0]);
    });

    // Corrige au lot 2 (defaut n°1, voir
    // `specs/017-finance-fournisseurs-chantiers/data-model.md#defaut-1`).
    //
    // Ce cas perd son prefixe SURPRISE et change d attente, et c est voulu :
    // `isJournalEntryBalanced` arrondit desormais chaque ligne AVANT de la
    // sommer, exactement comme l insertion le fait. Le controle porte donc sur
    // les memes nombres que la base. Les deux demi-centimes ne se compensent
    // pas plus qu avant — 0.01 + 0.01 = 0.02 contre 0.01 — mais le refus
    // intervient maintenant AVANT stockage, au lieu de laisser entrer une
    // ecriture qui rendait la balance fausse en silence.
    //
    // Un autre cas de ce fichier verifie qu une repartition legitime
    // (33.333 + 66.667 contre 100) reste acceptee : la correction ferme le
    // trou sans durcir l arrondi.
    it('corrige (lot 2) : l equilibre est verifie APRES arrondi, une ecriture desequilibree est refusee', async () => {
      const response = await request(app)
        .post(`${base()}/ecritures`)
        .send({
          journalId: JOURNAL_ID,
          entryDate: '2026-03-01T00:00:00.000Z',
          reference: 'JE-ARR-KO',
          description: 'Deux demi-centimes au debit',
          sourceType: 'MANUAL',
          lines: [
            { accountId: ACCOUNT_1_ID, debit: 0.005, credit: 0, label: 'Debit 1' },
            { accountId: ACCOUNT_1_ID, debit: 0.005, credit: 0, label: 'Debit 2' },
            { accountId: ACCOUNT_2_ID, debit: 0, credit: 0.01, label: 'Credit' }
          ]
        });

      expect(response.status).toBe(422);
      expect(response.body.error).toContain('Ecriture non equilibree');
      // Et rien n a ete stocke : le refus precede l ecriture.
      expect(store.entries).toHaveLength(0);
      expect(store.lines).toHaveLength(0);
    });

    it('liste les ecritures de la plus recente a la plus ancienne', async () => {
      await posterEcriture(1000, '2026-01-10T00:00:00.000Z', 'JE-JAN');
      await posterEcriture(2000, '2026-03-10T00:00:00.000Z', 'JE-MAR');
      await posterEcriture(3000, '2026-02-10T00:00:00.000Z', 'JE-FEV');

      const response = await request(app).get(`${base()}/ecritures`);

      expect(response.status).toBe(200);
      expect(response.body.data.map((e: any) => e.reference)).toEqual(['JE-MAR', 'JE-FEV', 'JE-JAN']);
    });

    it('borne le listage des ecritures par from et to (bornes incluses)', async () => {
      await posterEcriture(1000, '2026-01-10T00:00:00.000Z', 'JE-JAN');
      await posterEcriture(2000, '2026-02-10T00:00:00.000Z', 'JE-FEV');
      await posterEcriture(3000, '2026-03-10T00:00:00.000Z', 'JE-MAR');

      const response = await request(app)
        .get(`${base()}/ecritures`)
        .query({ from: '2026-02-10T00:00:00.000Z', to: '2026-03-10T00:00:00.000Z' });

      expect(response.status).toBe(200);
      expect(response.body.data.map((e: any) => e.reference)).toEqual(['JE-MAR', 'JE-FEV']);
    });

    // Etait : "SURPRISE : un intervalle de dates invalide renvoie 500 sur les
    // ecritures mais 400 sur la balance". Ce n'etait pas une regle voulue :
    // chaque controleur avait son propre `catch` avec un repli de statut
    // arbitraire (`error.status || 500` ici, `error.status || 400` la-bas)
    // pour la meme ZodError, sans statut porte par l'erreur elle-meme. Le
    // lot 2 fait remonter les deux vers le meme `errorHandler`, qui mappe
    // toute ZodError sur 400 (middleware/error-middleware.ts) : l'ecart
    // disparait, et les deux routes sont maintenant coherentes.
    it('un intervalle de dates invalide renvoie 400 de la meme facon sur les ecritures et sur la balance', async () => {
      const ecritures = await request(app)
        .get(`${base()}/ecritures`)
        .query({ from: '2026-06-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' });
      const balance = await request(app)
        .get(`${base()}/balance`)
        .query({ from: '2026-06-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' });

      expect(ecritures.status).toBe(400);
      expect(balance.status).toBe(400);
    });
  });

  describe('Verrouillage des ecritures', () => {
    beforeEach(() => {
      seedJournal();
      seedAccount(ACCOUNT_1_ID, '401', 'Fournisseurs');
      seedAccount(ACCOUNT_2_ID, '512', 'Banque');
    });

    it('verrouille une ecriture non verrouillee', async () => {
      const creation = await posterEcriture(1000, '2026-03-01T00:00:00.000Z', 'JE-LOCK');
      const entryId = creation.body.data.id;

      const response = await request(app).patch(`${base()}/ecritures/${entryId}/verrouiller`).send({ lock: true });

      expect(response.status).toBe(200);
      expect(response.body.data.isLocked).toBe(true);
      expect(store.entries[0].isLocked).toBe(true);
    });

    it('est idempotent : reverrouiller ne leve pas et ne redeclenche pas d update', async () => {
      const creation = await posterEcriture(1000, '2026-03-01T00:00:00.000Z', 'JE-LOCK2');
      const entryId = creation.body.data.id;
      await request(app).patch(`${base()}/ecritures/${entryId}/verrouiller`).send({ lock: true });

      const mockPrisma = jest.requireMock('@prisma/client').__mockPrisma;
      mockPrisma.journalEntry.update.mockClear();

      const response = await request(app).patch(`${base()}/ecritures/${entryId}/verrouiller`).send({ lock: true });

      expect(response.status).toBe(200);
      expect(response.body.data.isLocked).toBe(true);
      expect(mockPrisma.journalEntry.update).not.toHaveBeenCalled();
    });

    it('renvoie 404 pour une ecriture inexistante', async () => {
      const response = await request(app)
        .patch(`${base()}/ecritures/88888888-8888-4888-8888-888888888888/verrouiller`)
        .send({ lock: true });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Ecriture comptable introuvable');
    });

    it('IMMUTABILITE : aucune route n expose la modification ni la suppression d une ecriture', async () => {
      const creation = await posterEcriture(1000, '2026-03-01T00:00:00.000Z', 'JE-IMM');
      const entryId = creation.body.data.id;
      await request(app).patch(`${base()}/ecritures/${entryId}/verrouiller`).send({ lock: true });

      const modification = await request(app).put(`${base()}/ecritures/${entryId}`).send({ description: 'Falsifiee' });
      const suppression = await request(app).delete(`${base()}/ecritures/${entryId}`);

      // Express ne trouve aucune route : la question de l immuabilite n est pas tranchee
      // par le code, elle l est par l absence de point d entree.
      expect(modification.status).toBe(404);
      expect(suppression.status).toBe(404);
      expect(store.entries[0]).toMatchObject({ description: 'Ecriture JE-IMM', isLocked: true });
    });

    it('IMMUTABILITE : aucune route ne permet de deverrouiller une ecriture', async () => {
      const creation = await posterEcriture(1000, '2026-03-01T00:00:00.000Z', 'JE-UNLOCK');
      const entryId = creation.body.data.id;
      await request(app).patch(`${base()}/ecritures/${entryId}/verrouiller`).send({ lock: true });

      // `lockJournalEntrySchema` impose z.literal(true) : lock=false est rejete par Zod.
      const response = await request(app).patch(`${base()}/ecritures/${entryId}/verrouiller`).send({ lock: false });

      expect(response.status).toBe(400);
      expect(store.entries[0].isLocked).toBe(true);
    });

    it('IMMUTABILITE : la surface publique du module ne contient que list, create et lock', async () => {
      const queries = jest.requireActual('../../src/lib/syndics/queries');
      const surface = Object.keys(queries)
        .filter(name => /JournalEntr/i.test(name))
        .sort();

      // Si le lot 2 ajoute un update/delete d ecriture, ce test echoue : la decision
      // sur le principe d immuabilite devra alors etre prise explicitement.
      expect(surface).toEqual([
        'createJournalEntryBySyndicate',
        'listJournalEntriesBySyndicate',
        'lockJournalEntryBySyndicate'
      ]);
    });

    it('SURPRISE : une ecriture verrouillee n empeche pas d en creer une autre a la meme reference', async () => {
      const creation = await posterEcriture(1000, '2026-03-01T00:00:00.000Z', 'JE-DOUBLON');
      await request(app).patch(`${base()}/ecritures/${creation.body.data.id}/verrouiller`).send({ lock: true });

      const doublon = await posterEcriture(1000, '2026-03-01T00:00:00.000Z', 'JE-DOUBLON');

      // Aucune contrainte d unicite sur (journalId, reference) : le doublon passe.
      expect(doublon.status).toBe(201);
      expect(store.entries).toHaveLength(2);
    });
  });

  describe('Balance generale', () => {
    beforeEach(() => {
      seedJournal();
      seedAccount(ACCOUNT_2_ID, '512', 'Banque');
      seedAccount(ACCOUNT_1_ID, '401', 'Fournisseurs');
    });

    it('agrege les mouvements par compte et trie par numero de compte', async () => {
      await posterEcriture(10000, '2026-01-10T00:00:00.000Z', 'JE-1');
      await posterEcriture(2500, '2026-02-10T00:00:00.000Z', 'JE-2');

      const response = await request(app).get(`${base()}/balance`);

      expect(response.status).toBe(200);
      expect(response.body.data.items).toEqual([
        {
          accountId: ACCOUNT_1_ID,
          accountNumber: '401',
          accountName: 'Fournisseurs',
          totalDebit: 12500,
          totalCredit: 0,
          balance: 12500
        },
        {
          accountId: ACCOUNT_2_ID,
          accountNumber: '512',
          accountName: 'Banque',
          totalDebit: 0,
          totalCredit: 12500,
          balance: -12500
        }
      ]);
    });

    it('produit des totaux de controle equilibres', async () => {
      await posterEcriture(10000, '2026-01-10T00:00:00.000Z', 'JE-1');
      await posterEcriture(2500, '2026-02-10T00:00:00.000Z', 'JE-2');

      const response = await request(app).get(`${base()}/balance`);

      expect(response.body.data.totals).toEqual({ totalDebit: 12500, totalCredit: 12500, isBalanced: true });
    });

    it('restreint l agregation a la periode demandee', async () => {
      await posterEcriture(10000, '2026-01-10T00:00:00.000Z', 'JE-JAN');
      await posterEcriture(2500, '2026-02-10T00:00:00.000Z', 'JE-FEV');

      const response = await request(app)
        .get(`${base()}/balance`)
        .query({ from: '2026-02-01T00:00:00.000Z', to: '2026-02-28T00:00:00.000Z' });

      expect(response.status).toBe(200);
      expect(response.body.data.totals).toEqual({ totalDebit: 2500, totalCredit: 2500, isBalanced: true });
    });

    it('SURPRISE : une periode sans aucune ecriture renvoie une balance vide declaree equilibree', async () => {
      await posterEcriture(10000, '2026-01-10T00:00:00.000Z', 'JE-JAN');

      const response = await request(app)
        .get(`${base()}/balance`)
        .query({ from: '2025-01-01T00:00:00.000Z', to: '2025-12-31T00:00:00.000Z' });

      expect(response.status).toBe(200);
      expect(response.body.data.items).toEqual([]);
      // 0 === 0 : isBalanced vaut true meme quand il n y a rien a equilibrer.
      expect(response.body.data.totals).toEqual({ totalDebit: 0, totalCredit: 0, isBalanced: true });
    });
  });
});
