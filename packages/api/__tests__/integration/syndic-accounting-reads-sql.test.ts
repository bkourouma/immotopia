/**
 * Lot SYN-A (comptabilité des copropriétés) — lectures SQL prouvées sur une VRAIE base PostgreSQL.
 *
 * Les tests unitaires mockent Prisma : le SQL brut de `lib/syndics/accounting-reads.ts`
 * (`$queryRaw`, fonction de fenêtre, casts `::timestamp` et `::uuid`, ILIKE échappé,
 * LIMIT/OFFSET liés) n'y tourne jamais. Cette suite sème des copropriétés en Prisma
 * direct et compare chaque lecture à un calcul JavaScript indépendant fait sur les
 * fixtures en mémoire (entiers en centimes), plus quelques montants calculés à la
 * main (valeurs littérales).
 *
 * Données (agence A) : copropriété S1 (6 comptes de classes 1, 2, 4, 5, 6, 7 ; 2 journaux
 * BQ et OD ; 32 écritures de janvier à avril 2026), S2 (mêmes numéros de compte, gros
 * montants), S3 (plan comptable piégé par les jokers LIKE). Agence B : une copropriété
 * SB aux mêmes numéros de compte.
 *
 * Base : DÉDIÉE aux tests, résolue via `DATABASE_URL_TEST`. Absente (ou `DATABASE_URL`
 * différente) : la suite est ignorée (`describe.skip`) pour ne pas casser `npm test`.
 * Lancement ciblé :
 *   DATABASE_URL_TEST=<url> TEST_DATABASE_URL=<url> DATABASE_URL=<url> \
 *     npx jest --runInBand --forceExit __tests__/integration/syndic-accounting-reads-sql.test.ts
 * (les migrations doivent être appliquées : `npx prisma migrate deploy`).
 */

import { randomUUID } from 'crypto';
import { TenantStatus } from '@prisma/client';
import { prisma } from '../../src/utils/database';
import { NotFoundError } from '../../src/middleware/error-middleware';
import {
  accountLedgerQuerySchema,
  accountingEntriesPageQuerySchema,
  buildLedgerPageSql,
  chartOfAccountsSearchQuerySchema,
  getAccountLedger,
  getTrialBalanceAggregated,
  listAccountingEntriesPage,
  searchChartOfAccounts,
  trialBalanceQuerySchema
} from '../../src/lib/syndics/accounting-reads';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

if (!HAS_TEST_DATABASE) {
  // eslint-disable-next-line no-console
  console.log(
    'DATABASE_URL_TEST absente (ou DATABASE_URL différente) : syndic-accounting-reads-sql.test.ts est ignorée. ' +
      'Voir env.example et __tests__/helpers/run-isolation-tests.js.'
  );
}

jest.setTimeout(180_000);

// ---------------------------------------------------------------------------
// Fixtures : montants en CENTIMES
// ---------------------------------------------------------------------------

interface SpecLine {
  acct: string;
  d: number;
  c: number;
  label: string;
  lot?: boolean;
}
interface Spec {
  ref: string;
  desc: string;
  date: string;
  j: 'BQ' | 'OD';
  lines: SpecLine[];
  locked?: boolean;
}

const two = (
  date: string,
  j: 'BQ' | 'OD',
  debitAcct: string,
  creditAcct: string,
  cents: number,
  ref: string,
  desc: string,
  extra: { label?: string; locked?: boolean; lot?: boolean } = {}
): Spec => ({
  ref,
  desc,
  date,
  j,
  locked: extra.locked,
  lines: [
    { acct: debitAcct, d: cents, c: 0, label: extra.label ?? desc, lot: extra.lot },
    { acct: creditAcct, d: 0, c: cents, label: extra.label ?? desc }
  ]
});

const SPECS_S1: Spec[] = [
  // --- Janvier (avant la période) ---
  two('2026-01-05T09:00:00.000Z', 'BQ', '512', '101', 500_000_000_055, 'E01', 'Apport initial'), // 5 000 000 000,55 (> 2^31)
  two('2026-01-12T10:00:00.000Z', 'BQ', '512', '411', 150_000, 'E02', 'Appel T1 lot 1', { locked: true }),
  two('2026-01-20T00:00:00.000Z', 'OD', '622', '512', 4_575, 'E03', 'Frais bancaires janvier', { locked: true }),
  two('2026-01-31T23:59:59.999Z', 'BQ', '411', '706', 120_000, 'E04', 'Honoraires janvier', { locked: true }),
  // --- Février ---
  two('2026-02-01T00:00:00.000Z', 'BQ', '512', '411', 250_050, 'E05', 'Appel T2 lot 1'),
  two('2026-02-01T08:00:00.000Z', 'BQ', '512', '411', 10_000, 'E06', 'Appel T2 lot 2'),
  two('2026-02-01T16:30:00.000Z', 'OD', '622', '512', 2_500, 'E07', 'Frais virement'),
  two('2026-02-10T09:15:00.000Z', 'BQ', '512', '706', 80_025, 'E08', 'Honoraires fevrier'),
  two('2026-02-10T09:15:00.000Z', 'BQ', '512', '706', 5_025, 'E09', 'Complement honoraires'), // même instant que E08
  {
    ref: 'E10',
    desc: 'Encaissement groupe',
    date: '2026-02-12T11:00:00.000Z',
    j: 'BQ',
    lines: [
      { acct: '512', d: 20_000, c: 0, label: 'Part A' }, // deux lignes du même compte dans une écriture
      { acct: '512', d: 30_000, c: 0, label: 'Part B' },
      { acct: '411', d: 0, c: 50_000, label: 'Encaissement groupe' }
    ]
  },
  two('2026-02-14T12:00:00.000Z', 'OD', '411', '706', 300_000, 'E11', 'Facture fevrier'),
  two('2026-02-20T00:00:00.000Z', 'OD', '622', '512', 12_345, 'E12', 'Commission bancaire'),
  two('2026-02-28T23:59:59.999Z', 'BQ', '512', '411', 99_999, 'E13', 'Cloture fevrier'),
  // --- Mars ---
  two('2026-03-01T00:00:00.000Z', 'BQ', '512', '101', 1_000, 'E14', 'Cotisation mars'),
  two('2026-03-03T10:00:00.000Z', 'BQ', '512', '411', 70_000, 'E15', 'Appel T3 lot 1'),
  two('2026-03-03T15:00:00.000Z', 'BQ', '512', '411', 30_000, 'E16', 'Appel T3 lot 2'),
  two('2026-03-05T09:00:00.000Z', 'OD', '622', '512', 1, 'E17', 'Frais centime'), // 0,01
  two('2026-03-10T09:00:00.000Z', 'BQ', '512', '706', 123_457, 'E18', 'Honoraires mars', { lot: true }),
  two('2026-03-10T09:00:00.000Z', 'OD', '622', '512', 33, 'E19', 'Frais divers'),
  two('2026-03-15T00:00:00.000Z', 'BQ', '512', '411', 300_000_000_000, 'E20', 'Appel exceptionnel'), // 3 000 000 000,00
  two('2026-03-18T14:00:00.000Z', 'OD', '411', '706', 450_000, 'E21', 'Facture mars'),
  two('2026-03-20T10:00:00.000Z', 'BQ', '512', '101', 25_025, 'E22', 'Cotisation exceptionnelle'),
  two('2026-03-22T10:00:00.000Z', 'BQ', '512', '411', 10_100, 'J-PCT', 'Reglement partiel', { label: '100% payé' }),
  two('2026-03-22T11:00:00.000Z', 'BQ', '512', '411', 10_200, 'J-DEC', 'Reglement complet', { label: '1000 payé' }),
  two('2026-03-23T10:00:00.000Z', 'OD', '281', '512', 7_000, 'E25', 'Dotation amortissement'),
  two('2026-03-24T10:00:00.000Z', 'OD', '512', '281', 7_000, 'E26', 'Reprise amortissement'),
  two('2026-03-25T00:00:00.000Z', 'BQ', '512', '411', 5_500, 'J-LOT', 'Charges du lot sept', { label: 'lot_7' }),
  two('2026-03-26T00:00:00.000Z', 'BQ', '512', '411', 6_600, 'J-LOTA', 'Charges du lot huit', { label: 'lotA7' }),
  two('2026-03-31T18:00:00.000Z', 'BQ', '512', '411', 17_500, 'E-LAST', 'Dernier jour du trimestre'),
  // --- Après la période ---
  two('2026-04-01T00:00:00.000Z', 'BQ', '512', '411', 999, 'E31', 'Apres periode'),
  two('2026-04-15T10:00:00.000Z', 'OD', '622', '512', 1_234, 'E32', 'Frais avril')
];
// Inséré après E-LAST dans le temps mais avec l'écriture « abc » de fin mars : on la place avant E-LAST.
SPECS_S1.splice(
  SPECS_S1.findIndex(s => s.ref === 'E-LAST'),
  0,
  two('2026-03-27T00:00:00.000Z', 'BQ', '512', '411', 7_700, 'J-ABC', 'Reglement divers', { label: 'abc' })
);

// Mêmes numéros de compte, montants énormes et libellé « 100% payé » : ne doivent jamais fuir dans S1.
const SPECS_S2: Spec[] = [
  two('2026-03-02T09:00:00.000Z', 'BQ', '512', '411', 77_777_777_700, 'S2-1', 'Ecriture S2'),
  two('2026-03-03T09:00:00.000Z', 'OD', '622', '512', 123_456, 'S2-2', 'Frais S2'),
  two('2026-02-10T09:00:00.000Z', 'BQ', '512', '706', 55_555, 'S2-3', 'Honoraires S2'),
  two('2026-03-31T18:00:00.000Z', 'BQ', '512', '411', 4_242, 'S2-4', 'Dernier jour S2'),
  two('2026-03-20T09:00:00.000Z', 'BQ', '512', '411', 3_000, 'S2-PCT', 'Reglement S2', { label: '100% payé' })
];
const SPECS_SB: Spec[] = [
  two('2026-03-04T09:00:00.000Z', 'BQ', '512', '411', 88_888_888_800, 'SB-1', 'Ecriture SB'),
  two('2026-03-05T09:00:00.000Z', 'OD', '622', '512', 654_321, 'SB-2', 'Frais SB'),
  two('2026-01-10T09:00:00.000Z', 'BQ', '512', '706', 99_999, 'SB-3', 'Honoraires SB'),
  two('2026-03-31T18:00:00.000Z', 'BQ', '512', '411', 5_151, 'SB-4', 'Dernier jour SB'),
  two('2026-03-21T09:00:00.000Z', 'BQ', '512', '411', 2_000, 'SB-PCT', 'Reglement SB', { label: '100% payé' })
];

const ACCOUNTS: Array<[string, string, number, 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE']> = [
  ['101', 'Capital et reserves', 1, 'EQUITY'],
  ['281', 'Amortissements', 2, 'ASSET'],
  ['411', 'Appels de fonds coproprietaires', 4, 'ASSET'],
  ['512', 'Banque principale', 5, 'ASSET'],
  ['622', 'Frais bancaires', 6, 'EXPENSE'],
  ['706', 'Honoraires', 7, 'INCOME']
];

// Plan piégé par les jokers LIKE (copropriété S3, sans écriture).
const ACCOUNTS_S3: typeof ACCOUNTS = [
  ['701', '100% payé', 7, 'INCOME'],
  ['702', '1000 payé', 7, 'INCOME'],
  ['703', 'lot_7', 7, 'INCOME'],
  ['704', 'lotA7', 7, 'INCOME'],
  ['705', 'abc', 7, 'INCOME']
];

const JOURNALS = {
  BQ: { code: 'BQ', label: 'Journal de banque', type: 'BANK' as const },
  OD: { code: 'OD', label: 'Operations diverses', type: 'GENERAL' as const }
};

interface RLine {
  id: string;
  acct: string;
  d: number;
  c: number;
  label: string;
}
interface REntry {
  id: string;
  ref: string;
  desc: string;
  j: 'BQ' | 'OD';
  journalId: string;
  date: Date;
  createdAt: number;
  locked: boolean;
  lines: RLine[];
}
interface Fx {
  tenantId: string;
  syndicateId: string;
  accounts: Map<string, { id: string; name: string; cls: number }>;
  journals: Record<'BQ' | 'OD', string>;
  entries: REntry[];
}

const BASE_CREATED = Date.UTC(2026, 0, 1);
const tenantsToClean: string[] = [];

async function createTenant(prefix: string): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({
    data: { name: `${prefix} ${suffix}`, slug: `${prefix}-${suffix}`, type: 'AGENCY', status: TenantStatus.ACTIVE }
  });
  tenantsToClean.push(tenant.id);
  return tenant.id;
}

async function seedSyndicate(tenantId: string, name: string, accountDefs: typeof ACCOUNTS, specs: Spec[]): Promise<Fx> {
  const syndicate = await prisma.syndicate.create({
    data: { tenantId, name: `${name} ${randomUUID().slice(0, 6)}`, address: 'Abidjan' },
    select: { id: true }
  });
  const syndicateId = syndicate.id;

  const accounts: Fx['accounts'] = new Map();
  for (const [number, accountName, cls, type] of accountDefs) {
    const id = randomUUID();
    await prisma.chartOfAccount.create({
      data: {
        id,
        tenantId,
        syndicateId,
        scope: 'SYNDICATE',
        accountNumber: number,
        accountName,
        accountClass: cls,
        accountType: type
      }
    });
    accounts.set(number, { id, name: accountName, cls });
  }

  const journals = {} as Fx['journals'];
  for (const key of ['BQ', 'OD'] as const) {
    const id = randomUUID();
    await prisma.accountingJournal.create({
      data: {
        id,
        tenantId,
        syndicateId,
        scope: 'SYNDICATE',
        journalType: JOURNALS[key].type,
        label: JOURNALS[key].label,
        code: JOURNALS[key].code,
        fiscalYear: 2026
      }
    });
    journals[key] = id;
  }

  const lot = await prisma.syndicateLot.create({
    data: { syndicateId, lotNumber: 'A12', lotType: 'APARTMENT', generalShares: 100 },
    select: { id: true }
  });

  const entries: REntry[] = specs.map((spec, index) => ({
    id: randomUUID(),
    ref: spec.ref,
    desc: spec.desc,
    j: spec.j,
    journalId: journals[spec.j],
    date: new Date(spec.date),
    createdAt: BASE_CREATED + index * 60_000,
    locked: Boolean(spec.locked),
    lines: spec.lines.map(l => ({ id: randomUUID(), acct: l.acct, d: l.d, c: l.c, label: l.label }))
  }));

  await prisma.journalEntry.createMany({
    data: entries.map(e => ({
      id: e.id,
      journalId: e.journalId,
      tenantId,
      entryDate: e.date,
      reference: e.ref,
      description: e.desc,
      sourceType: 'MANUAL' as const,
      isLocked: e.locked,
      createdAt: new Date(e.createdAt)
    }))
  });
  await prisma.journalEntryLine.createMany({
    data: entries.flatMap((e, ei) =>
      e.lines.map((l, li) => ({
        id: l.id,
        entryId: e.id,
        accountId: (accounts.get(l.acct) as { id: string }).id,
        lotId: specs[ei].lines[li].lot ? lot.id : null,
        debit: l.d / 100,
        credit: l.c / 100,
        label: l.label,
        createdAt: new Date(e.createdAt)
      }))
    )
  });

  return { tenantId, syndicateId, accounts, journals, entries };
}

// ---------------------------------------------------------------------------
// Calcul de référence en JavaScript (indépendant du SQL), en centimes
// ---------------------------------------------------------------------------

const cn = (value: number) => Math.round(value * 100);
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const cmpS = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const startMs = (day: string) => Date.parse(`${day}T00:00:00.000Z`);
const endMs = (day: string) => Date.parse(`${day}T23:59:59.999Z`);
const includesCi = (text: string, needle: string) => text.toLowerCase().includes(needle.toLowerCase());

type Range = {
  from?: string;
  to?: string;
};
const inRange = (date: Date, r: Range) =>
  (!r.from || date.getTime() >= startMs(r.from)) && (!r.to || date.getTime() <= endMs(r.to));

interface FLine extends RLine {
  e: REntry;
}
const flat = (fx: Fx): FLine[] => fx.entries.flatMap(e => e.lines.map(l => ({ ...l, e })));
const cmpLine = (a: FLine, b: FLine) =>
  a.e.date.getTime() - b.e.date.getTime() || a.e.createdAt - b.e.createdAt || cmpS(a.id, b.id);

function refLedger(fx: Fx, acct: string, r: Range = {}, search?: string) {
  const all = flat(fx).filter(l => l.acct === acct);
  const opening = r.from ? sum(all.filter(l => l.e.date.getTime() < startMs(r.from as string)).map(l => l.d - l.c)) : 0;
  const inPeriod = all.filter(l => inRange(l.e.date, r)).sort(cmpLine);
  let running = opening;
  const withBalance = inPeriod.map(line => {
    running += line.d - line.c;
    return { line, balance: running };
  });
  const filtered = search
    ? withBalance.filter(
        ({ line }) =>
          includesCi(line.e.ref, search) || includesCi(line.e.desc, search) || includesCi(line.label, search)
      )
    : withBalance;
  return {
    opening,
    debit: sum(inPeriod.map(l => l.d)),
    credit: sum(inPeriod.map(l => l.c)),
    closing: running,
    all: withBalance,
    filtered
  };
}

function refBalance(fx: Fx, r: Range = {}) {
  const byAcct = new Map<string, { d: number; c: number }>();
  for (const l of flat(fx).filter(x => inRange(x.e.date, r))) {
    const row = byAcct.get(l.acct) ?? { d: 0, c: 0 };
    row.d += l.d;
    row.c += l.c;
    byAcct.set(l.acct, row);
  }
  return Array.from(byAcct.entries())
    .map(([number, v]) => ({ number, d: v.d, c: v.c, bal: v.d - v.c }))
    .sort((a, b) => cmpS(a.number, b.number));
}

const cmpEntryDesc = (a: REntry, b: REntry) =>
  b.date.getTime() - a.date.getTime() || b.createdAt - a.createdAt || cmpS(b.id, a.id);

function refEntries(
  fx: Fx,
  f: { journal?: 'BQ' | 'OD'; acct?: string; status?: 'locked' | 'open'; search?: string } & Range
): REntry[] {
  return fx.entries
    .filter(
      e =>
        inRange(e.date, f) &&
        (!f.journal || e.j === f.journal) &&
        (!f.acct || e.lines.some(l => l.acct === f.acct)) &&
        (!f.status || e.locked === (f.status === 'locked')) &&
        (!f.search ||
          includesCi(e.ref, f.search) ||
          includesCi(e.desc, f.search) ||
          e.lines.some(l => includesCi(l.label, f.search as string)))
    )
    .sort(cmpEntryDesc);
}

const PERIOD: Range = { from: '2026-02-01', to: '2026-03-31' };

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

maybeDescribe('Lot SYN-A — lectures comptables des copropriétés sur base réelle', () => {
  let S1: Fx;
  let S2: Fx;
  let S3: Fx;
  let SB: Fx;
  let tenantB: string;

  const ledger = (fx: Fx, q: Record<string, unknown>) =>
    getAccountLedger(fx.tenantId, fx.syndicateId, accountLedgerQuerySchema.parse(q));
  const ledger512 = (q: Record<string, unknown> = {}) =>
    ledger(S1, { accountId: S1.accounts.get('512')?.id, ...PERIOD, limit: 100, ...q });
  const balance = (fx: Fx, q: Record<string, unknown> = {}) =>
    getTrialBalanceAggregated(fx.tenantId, fx.syndicateId, trialBalanceQuerySchema.parse(q));
  const entries = (fx: Fx, q: Record<string, unknown> = {}) =>
    listAccountingEntriesPage(fx.tenantId, fx.syndicateId, accountingEntriesPageQuerySchema.parse(q));
  const plan = (fx: Fx, q: Record<string, unknown> = {}) =>
    searchChartOfAccounts(fx.tenantId, fx.syndicateId, chartOfAccountsSearchQuerySchema.parse(q));

  beforeAll(async () => {
    const tenantA = await createTenant('syn-a');
    tenantB = await createTenant('syn-b');
    S1 = await seedSyndicate(tenantA, 'S1', ACCOUNTS, SPECS_S1);
    S2 = await seedSyndicate(tenantA, 'S2', ACCOUNTS, SPECS_S2);
    S3 = await seedSyndicate(tenantA, 'S3', ACCOUNTS_S3, []);
    SB = await seedSyndicate(tenantB, 'SB', ACCOUNTS, SPECS_SB);
  }, 180_000);

  afterAll(async () => {
    for (const id of tenantsToClean) {
      try {
        await prisma.journalEntryLine.deleteMany({ where: { entry: { tenantId: id } } });
        await prisma.tenant.delete({ where: { id } });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`nettoyage agence ${id} : ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await prisma.$disconnect();
  });

  it('fixtures : 32 écritures équilibrées dans S1 (janvier à mars, plus deux en avril)', () => {
    expect(S1.entries.length).toBe(32);
    for (const e of S1.entries) {
      expect(sum(e.lines.map(l => l.d))).toBe(sum(e.lines.map(l => l.c)));
    }
  });

  // -------------------------------------------------------------------------
  describe('2. Grand livre', () => {
    it('compte 512 : ouverture, mouvements et clôture calculés à la main', async () => {
      const r = await ledger512();
      // Ouverture : E01 +500 000 000 055, E02 +150 000, E03 -4 575 = 500 000 145 480 centimes.
      expect(cn(r.summary.openingBalance)).toBe(500_000_145_480);
      // Débits 300 000 809 181 (19 écritures, dont E10 en 2 lignes), crédits 21 879 (5 lignes).
      expect(cn(r.summary.periodDebit)).toBe(300_000_809_181);
      expect(cn(r.summary.periodCredit)).toBe(21_879);
      expect(r.summary.lineCount).toBe(25);
      // Clôture = ouverture + débit - crédit.
      expect(cn(r.summary.closingBalance)).toBe(800_000_932_782);
      expect(r.summary.closingBalance).toBe(8_000_009_327.82);
      expect(r.pagination.total).toBe(25);
      expect(r.account.accountNumber).toBe('512');
    });

    it('cohérence avec le calcul de référence, ligne à ligne, et dernière ligne = clôture', async () => {
      const ref = refLedger(S1, '512', PERIOD);
      const r = await ledger512();
      expect(cn(r.summary.openingBalance)).toBe(ref.opening);
      expect(cn(r.summary.periodDebit)).toBe(ref.debit);
      expect(cn(r.summary.periodCredit)).toBe(ref.credit);
      expect(cn(r.summary.closingBalance)).toBe(ref.closing);
      expect(r.items.map(i => i.id)).toEqual(ref.all.map(x => x.line.id));
      expect(r.items.map(i => cn(i.runningBalance))).toEqual(ref.all.map(x => x.balance));
      expect(cn(r.items[r.items.length - 1].runningBalance)).toBe(cn(r.summary.closingBalance));
      for (const item of r.items) {
        const src = ref.all.find(x => x.line.id === item.id)!.line;
        expect(cn(item.debit)).toBe(src.d);
        expect(cn(item.credit)).toBe(src.c);
        expect(item.entryId).toBe(src.e.id);
        expect(item.reference).toBe(src.e.ref);
        expect(item.journalCode).toBe(src.e.j);
        expect(item.entryDate).toBe(src.e.date.toISOString());
      }
    });

    it('3 pages : solde progressif identique, ligne à ligne, à la lecture en une fois', async () => {
      const all = await ledger512();
      const limit = Math.ceil(all.items.length / 3);
      const paged: typeof all.items = [];
      for (let page = 1; page <= 3; page++) {
        const p = await ledger512({ page, limit });
        expect(p.pagination.total).toBe(all.items.length);
        expect(p.pagination.totalPages).toBe(3);
        expect(p.items.length).toBe(page < 3 ? limit : all.items.length - 2 * limit);
        // Le résumé ne dépend pas de la page.
        expect(p.summary).toEqual(all.summary);
        paged.push(...p.items);
      }
      expect(paged.map(i => i.id)).toEqual(all.items.map(i => i.id));
      expect(paged.map(i => i.runningBalance)).toEqual(all.items.map(i => i.runningBalance));
      expect(new Set(paged.map(i => i.id)).size).toBe(all.items.length);
    });

    it('avec search, les lignes retenues gardent le solde progressif de la suite complète', async () => {
      const all = await ledger512();
      const balanceById = new Map(all.items.map(i => [i.id, i.runningBalance]));
      for (const search of ['frais', 'FRAIS', 'appel', 'honoraires', 'E-LAST', 'zzzz']) {
        const ref = refLedger(S1, '512', PERIOD, search);
        const r = await ledger512({ search });
        expect(r.items.map(i => i.id)).toEqual(ref.filtered.map(x => x.line.id));
        expect(r.pagination.total).toBe(ref.filtered.length);
        for (const item of r.items) expect(item.runningBalance).toBe(balanceById.get(item.id));
        expect(r.items.map(i => cn(i.runningBalance))).toEqual(ref.filtered.map(x => x.balance));
        // La recherche ne touche pas la synthèse.
        expect(r.summary).toEqual(all.summary);
      }
      // Recherche paginée : 2 lignes par page, mêmes soldes.
      const ref = refLedger(S1, '512', PERIOD, 'appel');
      expect(ref.filtered.length).toBeGreaterThan(4);
      const got: typeof all.items = [];
      for (let page = 1; page <= Math.ceil(ref.filtered.length / 2); page++) {
        got.push(...(await ledger512({ search: 'appel', page, limit: 2 })).items);
      }
      expect(got.map(i => i.id)).toEqual(ref.filtered.map(x => x.line.id));
      expect(got.map(i => cn(i.runningBalance))).toEqual(ref.filtered.map(x => x.balance));
    });

    it('l’écriture du dernier jour à 18:00 est incluse (borne to inclusive sur le jour entier)', async () => {
      const r = await ledger512();
      expect(r.items.map(i => i.reference)).toContain('E-LAST');
      expect(r.items[r.items.length - 1].reference).toBe('E-LAST');
      expect(r.items[r.items.length - 1].entryDate).toBe('2026-03-31T18:00:00.000Z');
      // La veille, elle est exclue ; l'écriture du 1er avril aussi.
      const before = await ledger512({ to: '2026-03-30' });
      expect(before.items.map(i => i.reference)).not.toContain('E-LAST');
      expect(r.items.map(i => i.reference)).not.toContain('E31');
      // Fin de février : E13 (23:59:59.999) incluse, E14 (1er mars 00:00) exclue.
      const feb = await ledger512({ to: '2026-02-28' });
      expect(feb.items.map(i => i.reference)).toContain('E13');
      expect(feb.items.map(i => i.reference)).not.toContain('E14');
      expect(cn(feb.summary.closingBalance)).toBe(
        refLedger(S1, '512', { from: '2026-02-01', to: '2026-02-28' }).closing
      );
    });

    it('bornes variées : ouverture = mouvements avant from, sans from = 0, un seul jour', async () => {
      const ranges: Range[] = [
        {},
        { from: '2026-03-01' },
        { to: '2026-02-15' },
        { from: '2026-01-31', to: '2026-02-01' },
        { from: '2026-03-31', to: '2026-03-31' },
        { from: '2026-05-01' }
      ];
      for (const range of ranges) {
        const ref = refLedger(S1, '512', range);
        const r = await ledger512({ from: undefined, to: undefined, ...range });
        expect(cn(r.summary.openingBalance)).toBe(ref.opening);
        expect(cn(r.summary.periodDebit)).toBe(ref.debit);
        expect(cn(r.summary.periodCredit)).toBe(ref.credit);
        expect(cn(r.summary.closingBalance)).toBe(ref.closing);
        expect(r.summary.lineCount).toBe(ref.all.length);
        expect(r.items.map(i => cn(i.runningBalance))).toEqual(ref.all.map(x => x.balance));
      }
      const noFrom = await ledger512({ from: undefined, to: undefined });
      expect(noFrom.summary.openingBalance).toBe(0);
    });

    it('tous les comptes de S1 : synthèse et soldes alignés sur la référence', async () => {
      for (const [number] of ACCOUNTS) {
        const ref = refLedger(S1, number, PERIOD);
        const r = await ledger(S1, { accountId: S1.accounts.get(number)?.id, ...PERIOD, limit: 100 });
        expect(cn(r.summary.openingBalance)).toBe(ref.opening);
        expect(cn(r.summary.periodDebit)).toBe(ref.debit);
        expect(cn(r.summary.periodCredit)).toBe(ref.credit);
        expect(cn(r.summary.closingBalance)).toBe(ref.closing);
        expect(r.items.map(i => cn(i.runningBalance))).toEqual(ref.all.map(x => x.balance));
      }
    });

    it('lignes du même compte, même écriture, départagées de façon stable (E10)', async () => {
      const ref = refLedger(S1, '512', PERIOD);
      const e10 = ref.all.filter(x => x.line.e.ref === 'E10');
      expect(e10.length).toBe(2);
      const r = await ledger512();
      expect(r.items.filter(i => i.reference === 'E10').map(i => i.id)).toEqual(e10.map(x => x.line.id));
    });

    it('lot lié : le numéro de lot est lu dans la copropriété', async () => {
      const r = await ledger512();
      expect(r.items.find(i => i.reference === 'E18')?.lotNumber).toBe('A12');
      expect(r.items.find(i => i.reference === 'E15')?.lotNumber).toBeNull();
    });

    it('page très élevée : page vide, total conservé, sans erreur PostgreSQL', async () => {
      const r = await ledger512({ page: 99_999, limit: 10 });
      expect(r.items).toEqual([]);
      expect(r.pagination.total).toBe(25);
      expect(r.pagination.page).toBe(99_999);
      const s = await ledger512({ page: 99_999, limit: 10, search: 'frais' });
      expect(s.items).toEqual([]);
      expect(s.pagination.total).toBe(refLedger(S1, '512', PERIOD, 'frais').filtered.length);
    });
  });

  // -------------------------------------------------------------------------
  describe('3. Balance', () => {
    it('totals sur tous les comptes, montants calculés à la main pour 512, débit = crédit', async () => {
      const r = await balance(S1, PERIOD);
      const row512 = r.items.find(i => i.accountNumber === '512')!;
      expect(cn(row512.totalDebit)).toBe(300_000_809_181);
      expect(cn(row512.totalCredit)).toBe(21_879);
      expect(cn(row512.balance)).toBe(300_000_787_302);
      expect(row512.accountClass).toBe(5);
      // Grands montants (> 2^31) et centimes convertis sans perte.
      expect(row512.totalDebit).toBe(3_000_008_091.81);
      expect(row512.totalCredit).toBe(218.79);
      expect(row512.balance).toBe(3_000_007_873.02);

      const ref = refBalance(S1, PERIOD);
      expect(r.items.map(i => i.accountNumber)).toEqual(ref.map(x => x.number));
      for (const item of r.items) {
        const src = ref.find(x => x.number === item.accountNumber)!;
        expect(cn(item.totalDebit)).toBe(src.d);
        expect(cn(item.totalCredit)).toBe(src.c);
        expect(cn(item.balance)).toBe(src.bal);
      }
      expect(cn(r.totals.totalDebit)).toBe(sum(ref.map(x => x.d)));
      expect(cn(r.totals.totalCredit)).toBe(sum(ref.map(x => x.c)));
      expect(r.totals.totalDebit).toBe(r.totals.totalCredit);
      expect(r.totals.isBalanced).toBe(true);
      expect(r.filteredTotals).toEqual({ totalDebit: r.totals.totalDebit, totalCredit: r.totals.totalCredit });
    });

    it('sans bornes, la balance inclut les écritures d’avril ; la période exclut janvier', async () => {
      const everything = await balance(S1);
      const ref = refBalance(S1);
      expect(cn(everything.totals.totalDebit)).toBe(sum(ref.map(x => x.d)));
      expect(everything.totals.isBalanced).toBe(true);
      const period = await balance(S1, PERIOD);
      expect(cn(everything.totals.totalDebit)).toBeGreaterThan(cn(period.totals.totalDebit));
    });

    it('totals inchangés quels que soient les filtres ; filteredTotals = somme des lignes renvoyées', async () => {
      const base = await balance(S1, PERIOD);
      const cases: Array<Record<string, unknown>> = [
        { accountClass: '5' },
        { accountClass: '4,7' },
        { accountClass: '2' },
        { hideZero: 'true' },
        { search: 'ban' },
        { search: '51' },
        { search: '1' },
        { search: 'zzzz' },
        { accountClass: '4,5,6', hideZero: 'true', search: 'a' }
      ];
      for (const c of cases) {
        const r = await balance(S1, { ...PERIOD, ...c });
        expect(r.totals).toEqual(base.totals);
        const d = sum(r.items.map(i => cn(i.totalDebit)));
        const cr = sum(r.items.map(i => cn(i.totalCredit)));
        expect(cn(r.filteredTotals.totalDebit)).toBe(d);
        expect(cn(r.filteredTotals.totalCredit)).toBe(cr);
      }
      const byClass = await balance(S1, { ...PERIOD, accountClass: '5' });
      expect(byClass.items.map(i => i.accountNumber)).toEqual(['512']);
      expect(byClass.filteredTotals.totalDebit).toBe(3_000_008_091.81);
      expect(byClass.filteredTotals.totalCredit).not.toBe(byClass.totals.totalCredit);

      // 281 : débit 70,00 = crédit 70,00 sur la période, donc solde nul, masqué par hideZero.
      const all = await balance(S1, PERIOD);
      expect(all.items.find(i => i.accountNumber === '281')?.balance).toBe(0);
      const hidden = await balance(S1, { ...PERIOD, hideZero: 'true' });
      expect(hidden.items.map(i => i.accountNumber)).not.toContain('281');
      expect(hidden.items.length).toBe(all.items.length - 1);

      expect((await balance(S1, { ...PERIOD, search: 'ban' })).items.map(i => i.accountNumber)).toEqual(['512', '622']);
      expect((await balance(S1, { ...PERIOD, search: '51' })).items.map(i => i.accountNumber)).toEqual(['512']);
      expect((await balance(S1, { ...PERIOD, search: 'zzzz' })).filteredTotals).toEqual({
        totalDebit: 0,
        totalCredit: 0
      });
    });

    it('centimes : 622 cumule 0,01 et 0,33 sans erreur d’arrondi', async () => {
      const r = await balance(S1, { from: '2026-03-01', to: '2026-03-31' });
      const row = r.items.find(i => i.accountNumber === '622')!;
      expect(cn(row.totalDebit)).toBe(1 + 33);
      expect(row.totalDebit).toBe(0.34);
    });
  });

  // -------------------------------------------------------------------------
  describe('4. Écritures paginées', () => {
    it('total exact, pages sans doublon ni trou, ordre décroissant stable', async () => {
      const ref = refEntries(S1, {});
      expect(ref.length).toBe(32);
      const first = await entries(S1, { limit: 10 });
      expect(first.pagination.total).toBe(32);
      expect(first.pagination.totalPages).toBe(4);
      const got: string[] = [];
      for (let page = 1; page <= 4; page++) {
        const p = await entries(S1, { limit: 10, page });
        expect(p.items.length).toBe(page < 4 ? 10 : 2);
        got.push(...p.items.map(i => i.id));
      }
      expect(got).toEqual(ref.map(e => e.id));
      expect(new Set(got).size).toBe(32);
    });

    it('contenu : lignes avec montants numériques, compte et journal', async () => {
      const r = await entries(S1, { limit: 100 });
      for (const item of r.items) {
        const src = S1.entries.find(e => e.id === item.id)!;
        expect(item.lines.length).toBe(src.lines.length);
        expect(sum(item.lines.map(l => cn(l.debit)))).toBe(sum(src.lines.map(l => l.d)));
        expect(sum(item.lines.map(l => cn(l.credit)))).toBe(sum(src.lines.map(l => l.c)));
        expect(item.journal.code).toBe(src.j);
        expect(item.journal.id).toBe(src.journalId);
      }
      const e01 = r.items.find(i => i.reference === 'E01')!;
      expect(e01.lines.find(l => l.debit > 0)?.debit).toBe(5_000_000_000.55);
    });

    it('filtres journal, compte, statut, période, recherche et combinaisons', async () => {
      const cases: Array<{
        q: Record<string, unknown>;
        f: Parameters<typeof refEntries>[1];
      }> = [
        { q: { journalId: S1.journals.BQ }, f: { journal: 'BQ' } },
        { q: { journalId: S1.journals.OD }, f: { journal: 'OD' } },
        { q: { accountId: S1.accounts.get('281')?.id }, f: { acct: '281' } },
        { q: { accountId: S1.accounts.get('706')?.id }, f: { acct: '706' } },
        { q: { status: 'locked' }, f: { status: 'locked' } },
        { q: { status: 'open' }, f: { status: 'open' } },
        { q: { from: '2026-03-01', to: '2026-03-31' }, f: { from: '2026-03-01', to: '2026-03-31' } },
        { q: { from: '2026-02-28', to: '2026-02-28' }, f: { from: '2026-02-28', to: '2026-02-28' } },
        { q: { to: '2026-01-31' }, f: { to: '2026-01-31' } },
        { q: { search: 'frais' }, f: { search: 'frais' } },
        { q: { search: 'PART a' }, f: { search: 'PART a' } },
        {
          q: { journalId: S1.journals.BQ, status: 'open', from: '2026-02-01', to: '2026-03-31', search: 'appel' },
          f: { journal: 'BQ', status: 'open', from: '2026-02-01', to: '2026-03-31', search: 'appel' }
        },
        {
          q: { accountId: S1.accounts.get('512')?.id, journalId: S1.journals.OD, to: '2026-03-31' },
          f: { acct: '512', journal: 'OD', to: '2026-03-31' }
        }
      ];
      for (const { q, f } of cases) {
        const ref = refEntries(S1, f);
        const r = await entries(S1, { ...q, limit: 100 });
        expect(r.pagination.total).toBe(ref.length);
        expect(r.items.map(i => i.id)).toEqual(ref.map(e => e.id));
      }
      expect(refEntries(S1, { status: 'locked' }).length).toBe(3);
      // Filtre + pagination : le total reste celui du filtre.
      const p2 = await entries(S1, { status: 'open', limit: 10, page: 2 });
      expect(p2.pagination.total).toBe(29);
      expect(p2.items.length).toBe(10);
    });

    it('page très élevée : page vide, total conservé, sans erreur', async () => {
      const r = await entries(S1, { page: 99_999, limit: 10 });
      expect(r.items).toEqual([]);
      expect(r.pagination.total).toBe(32);
    });
  });

  // -------------------------------------------------------------------------
  describe('5. Isolation', () => {
    it('un accountId d’une autre copropriété ou d’une autre agence est rejeté (NotFoundError)', async () => {
      const s2 = S2.accounts.get('512')!.id;
      const b = SB.accounts.get('512')!.id;
      await expect(ledger(S1, { accountId: s2, ...PERIOD })).rejects.toBeInstanceOf(NotFoundError);
      await expect(ledger(S1, { accountId: b, ...PERIOD })).rejects.toBeInstanceOf(NotFoundError);
      await expect(ledger(S1, { accountId: randomUUID(), ...PERIOD })).rejects.toBeInstanceOf(NotFoundError);
    });

    it('accountId et journalId étrangers dans la liste des écritures : aucune ligne, aucun montant', async () => {
      for (const accountId of [S2.accounts.get('512')!.id, SB.accounts.get('512')!.id]) {
        const r = await entries(S1, { accountId, limit: 100 });
        expect(r.items).toEqual([]);
        expect(r.pagination.total).toBe(0);
      }
      for (const journalId of [S2.journals.BQ, SB.journals.BQ, S2.journals.OD]) {
        const r = await entries(S1, { journalId, limit: 100 });
        expect(r.items).toEqual([]);
        expect(r.pagination.total).toBe(0);
      }
      // Combinés à un filtre valide de S1 : toujours rien.
      const mixed = await entries(S1, { journalId: S2.journals.BQ, accountId: S1.accounts.get('512')!.id });
      expect(mixed.pagination.total).toBe(0);
    });

    it('aucune lecture ne mélange les copropriétés ni les agences', async () => {
      const s1Journals = new Set(Object.values(S1.journals));
      const s1Accounts = new Set(Array.from(S1.accounts.values()).map(a => a.id));
      const s1Entries = new Set(S1.entries.map(e => e.id));

      const list = await entries(S1, { limit: 100 });
      expect(list.items.every(i => s1Entries.has(i.id) && s1Journals.has(i.journal.id))).toBe(true);
      expect(list.items.every(i => i.lines.every(l => s1Accounts.has(l.accountId)))).toBe(true);
      expect(list.items.map(i => i.reference).some(r => r.startsWith('S2-') || r.startsWith('SB-'))).toBe(false);

      const led = await ledger512();
      expect(led.items.every(i => s1Entries.has(i.entryId))).toBe(true);

      const bal = await balance(S1);
      expect(bal.items.every(i => s1Accounts.has(i.accountId))).toBe(true);
      const ref = refBalance(S1);
      expect(cn(bal.totals.totalDebit)).toBe(sum(ref.map(x => x.d)));
      // S2 et SB ont leurs propres totaux (aucun mélange dans l'autre sens).
      const bal2 = await balance(S2);
      expect(cn(bal2.totals.totalDebit)).toBe(sum(refBalance(S2).map(x => x.d)));
      const balB = await balance(SB);
      expect(cn(balB.totals.totalDebit)).toBe(sum(refBalance(SB).map(x => x.d)));
      const led2 = await ledger(S2, { accountId: S2.accounts.get('512')!.id, ...PERIOD });
      expect(cn(led2.summary.closingBalance)).toBe(refLedger(S2, '512', PERIOD).closing);
      const ledB = await ledger(SB, { accountId: SB.accounts.get('512')!.id, ...PERIOD });
      expect(cn(ledB.summary.closingBalance)).toBe(refLedger(SB, '512', PERIOD).closing);

      const chart = await plan(S1);
      expect(chart.map(a => a.id).sort()).toEqual(Array.from(s1Accounts).sort());
    });

    it('grand livre : la recherche « % » ne ramène jamais les libellés « 100% payé » de S2 ou de SB', async () => {
      const led = await ledger512({ search: '%' });
      expect(led.items.map(i => i.reference)).toEqual(['J-PCT']);
    });

    it('liste des écritures : la recherche « % » ne ramène que « 100% payé » de S1', async () => {
      const list = await entries(S1, { search: '%', limit: 100 });
      expect(list.items.map(i => i.reference)).toEqual(['J-PCT']);
    });

    it('une copropriété d’une autre agence est refusée (erreur d’isolation), mal formée aussi', async () => {
      const wrongTenant = (call: () => Promise<unknown>) =>
        expect(call()).rejects.toMatchObject({ code: 'TENANT_ISOLATION_ERROR', status: 403 });
      await wrongTenant(() =>
        getAccountLedger(
          tenantB,
          S1.syndicateId,
          accountLedgerQuerySchema.parse({ accountId: S1.accounts.get('512')!.id })
        )
      );
      await wrongTenant(() => getTrialBalanceAggregated(tenantB, S1.syndicateId, trialBalanceQuerySchema.parse({})));
      await wrongTenant(() =>
        listAccountingEntriesPage(tenantB, S1.syndicateId, accountingEntriesPageQuerySchema.parse({}))
      );
      await wrongTenant(() =>
        searchChartOfAccounts(tenantB, S1.syndicateId, chartOfAccountsSearchQuerySchema.parse({}))
      );
      await wrongTenant(() =>
        listAccountingEntriesPage(S1.tenantId, 'pas-un-uuid', accountingEntriesPageQuerySchema.parse({}))
      );
      // Copropriété inexistante.
      await wrongTenant(() => getTrialBalanceAggregated(S1.tenantId, randomUUID(), trialBalanceQuerySchema.parse({})));
    });
  });

  // -------------------------------------------------------------------------
  describe('6. Jokers LIKE (% et _)', () => {
    describe('chemins SQL bruts (grand livre, ILIKE échappé)', () => {
      const refsOf = async (search: string) => (await ledger512({ search })).items.map(i => i.reference);

      it('« % » ne trouve que le libellé qui contient « % »', async () => {
        expect(await refsOf('%')).toEqual(['J-PCT']);
        expect(await refsOf('100% p')).toEqual(['J-PCT']); // « 1000 payé » ne doit pas correspondre
        const r = await ledger512({ search: '%' });
        expect(r.pagination.total).toBe(1);
      });

      it('« _ » ne trouve que « lot_7 », pas « lotA7 »', async () => {
        expect(await refsOf('_')).toEqual(['J-LOT']);
        expect(await refsOf('lot_7')).toEqual(['J-LOT']);
        expect((await ledger512({ search: 'lot_7' })).pagination.total).toBe(1);
      });

      it('« a_c » ne correspond pas à « abc »', async () => {
        expect(await refsOf('a_c')).toEqual([]);
        expect((await ledger512({ search: 'a_c' })).pagination.total).toBe(0);
        expect(await refsOf('abc')).toEqual(['J-ABC']);
      });

      it('antislash littéral sans erreur', async () => {
        expect(await refsOf('\\')).toEqual([]);
        expect(await refsOf('100\\%')).toEqual([]);
      });
    });

    describe('chemins Prisma `contains` (liste des écritures)', () => {
      const refsOf = async (search: string) =>
        (await entries(S1, { search, limit: 100 })).items.map(i => i.reference).sort();

      it('« % » ne trouve que le libellé qui contient « % »', async () => {
        expect(await refsOf('%')).toEqual(['J-PCT']);
        expect(await refsOf('100% p')).toEqual(['J-PCT']);
      });

      it('« _ » ne trouve que « lot_7 », pas « lotA7 »', async () => {
        expect(await refsOf('_')).toEqual(['J-LOT']);
        expect(await refsOf('lot_7')).toEqual(['J-LOT']);
      });

      it('« a_c » ne correspond pas à « abc »', async () => {
        expect(await refsOf('a_c')).toEqual([]);
        expect(await refsOf('abc')).toEqual(['J-ABC']);
      });
    });

    describe('chemins Prisma `contains` (plan comptable, copropriété S3)', () => {
      const namesOf = async (search: string) => (await plan(S3, { search })).map(a => a.accountName).sort();

      it('« % » ne trouve que « 100% payé »', async () => {
        expect(await namesOf('%')).toEqual(['100% payé']);
        expect(await namesOf('100% p')).toEqual(['100% payé']);
      });

      it('« _ » ne trouve que « lot_7 », pas « lotA7 »', async () => {
        expect(await namesOf('_')).toEqual(['lot_7']);
        expect(await namesOf('lot_7')).toEqual(['lot_7']);
      });

      it('« a_c » ne correspond pas à « abc »', async () => {
        expect(await namesOf('a_c')).toEqual([]);
        expect(await namesOf('abc')).toEqual(['abc']);
      });

      it('recherche par préfixe de numéro « 70 » (sans joker)', async () => {
        expect((await plan(S3, { search: '70' })).length).toBe(5);
      });

      it('recherche par préfixe de numéro « 7_ » : « _ » est un caractère littéral', async () => {
        expect((await plan(S3, { search: '7_' })).length).toBe(0);
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('7. Types des paramètres SQL', () => {
    it('bornes liées en ::timestamp, LIMIT et OFFSET liés (valeurs séparées du texte SQL)', () => {
      const query = buildLedgerPageSql(S1.tenantId, S1.syndicateId, S1.accounts.get('512')!.id, {
        from: new Date('2026-02-01T00:00:00.000Z'),
        to: new Date('2026-03-31T23:59:59.999Z'),
        search: 'x',
        page: 3,
        limit: 7
      });
      expect(query.sql).toContain('::timestamp');
      expect(query.sql).toMatch(/LIMIT \? OFFSET \?/);
      expect(query.values).toEqual(
        expect.arrayContaining([7, 14, '2026-02-01 00:00:00.000', '2026-03-31 23:59:59.999'])
      );
      expect(query.sql).not.toContain('2026-02-01');
    });

    it('limit 1 et page haute, bornes seules, sans bornes : aucune erreur PostgreSQL', async () => {
      const one = await ledger512({ limit: 1, page: 25 });
      expect(one.items.length).toBe(1);
      expect(one.items[0].reference).toBe('E-LAST');
      const high = await ledger512({ limit: 1, page: 26 });
      expect(high.items).toEqual([]);
      await expect(ledger512({ from: undefined, to: undefined, limit: 100 })).resolves.toBeDefined();
      await expect(ledger512({ from: '2026-03-31', to: '2026-03-31' })).resolves.toBeDefined();
      await expect(balance(S1, { to: '2026-03-31' })).resolves.toBeDefined();
      await expect(balance(S1, { from: '2026-03-31' })).resolves.toBeDefined();
    });

    it('le schéma refuse une période inversée et un jour impossible', () => {
      expect(() =>
        accountLedgerQuerySchema.parse({ accountId: randomUUID(), from: '2026-03-02', to: '2026-03-01' })
      ).toThrow();
      expect(() => trialBalanceQuerySchema.parse({ from: '2026-02-31' })).toThrow();
    });
  });
});
