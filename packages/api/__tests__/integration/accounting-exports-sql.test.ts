/**
 * Lot C (comptabilité agence) — lectures SQL prouvées sur une VRAIE base PostgreSQL.
 *
 * Les tests unitaires de `accounting-exports` mockent Prisma : le SQL brut
 * (`$queryRaw`, fonctions de fenêtre, casts `::timestamp`, `::"AccountingScope"`,
 * `::uuid`) n'y tourne jamais. Cette suite sème deux agences (A et B) en
 * Prisma direct, puis compare chaque lecture SQL à un calcul JavaScript
 * indépendant, fait à partir des fixtures en mémoire (entiers en centimes).
 *
 * Base : DÉDIÉE aux tests, résolue via `DATABASE_URL_TEST` (voir env.example).
 * Absente (ou exécution hors `npm run test:isolation`, `DATABASE_URL` différente
 * de `DATABASE_URL_TEST`) : la suite est ignorée (`describe.skip`) pour ne pas
 * casser `npm test`. Lancement ciblé :
 *   DATABASE_URL_TEST=<url> TEST_DATABASE_URL=<url> DATABASE_URL=<url> \
 *     npx jest --runInBand __tests__/integration/accounting-exports-sql.test.ts
 * (les migrations doivent être appliquées : `npx prisma migrate deploy`).
 *
 * La synchronisation des comptes propriétaires n'est pas testée ici : on lit.
 */

import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';
import { MandantFundsNature, TenantStatus } from '@prisma/client';
import { prisma } from '../../src/utils/database';
import { NotFoundError } from '../../src/middleware/error-middleware';
import {
  getGeneralLedger,
  ledgerTable,
  parseAsOfDate,
  parsePeriod,
  toCsv,
  toXlsx,
  trialBalanceTable,
  type Period
} from '../../src/lib/accounting-exports/service';
import { getJournalPage, journalPageTable } from '../../src/lib/accounting-exports/queries/journal';
import {
  accountLedgerTable,
  getAccountLedger,
  getLedgerSummary,
  listAccounts
} from '../../src/lib/accounting-exports/queries/ledger';
import { getTrialBalanceData } from '../../src/lib/accounting-exports/queries/balance';
import { getAccountBalances } from '../../src/lib/accounting-exports/queries/account-balances';
import { getAccountingMeta } from '../../src/lib/accounting-exports/meta';
import {
  getMandantOwnerLedger,
  getMandantOwnersPage,
  getMandantSubledger,
  getMandantTrialBalance,
  getMandantTrialBalancePage
} from '../../src/lib/accounting-exports/mandants';
import { UNASSIGNED_OWNER } from '../../src/lib/accounting-exports/types';

// La synchronisation (écritures de gestion locative) est hors sujet : on lit.
jest.mock('../../src/lib/accounting-exports/sync-scheduler', () => ({
  SYNC_FRESHNESS_MS: 60000,
  getSyncState: jest.fn(() => ({ status: 'idle', lastSyncedAt: null })),
  requestBackgroundSync: jest.fn(() => ({ status: 'idle', lastSyncedAt: null })),
  awaitFreshSync: jest.fn(async () => ({ status: 'idle', lastSyncedAt: null })),
  forceSync: jest.fn(async () => ({ status: 'idle', lastSyncedAt: null })),
  resetSyncSchedulerForTests: jest.fn()
}));

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

if (!HAS_TEST_DATABASE) {
  // eslint-disable-next-line no-console
  console.log(
    'DATABASE_URL_TEST absente (ou DATABASE_URL différente) : accounting-exports-sql.test.ts est ignorée. ' +
      'Voir env.example et __tests__/helpers/run-isolation-tests.js.'
  );
}

jest.setTimeout(180_000);

// ---------------------------------------------------------------------------
// Fixtures : spécification compacte, montants en CENTIMES
// ---------------------------------------------------------------------------

type Nat = MandantFundsNature | null;
type Scope = 'OPERATIONS' | 'SYNDICATE';
type OwnerName = 'O1' | 'O2' | 'O3';

interface SpecLine {
  acct: string;
  d: number;
  c: number;
  label: string;
  tp?: OwnerName | null;
  nat?: Nat;
}
interface EntrySpec {
  key: string;
  journal: 'BQ' | 'VT' | 'VT25' | 'SY';
  date: string;
  ref: string;
  desc: string;
  lines: SpecLine[];
  docType?: string;
  voidedByKey?: string;
  sameCreatedAsKey?: string;
}

const D = (acct: string, cents: number, label: string, tp?: OwnerName | null, nat?: Nat): SpecLine => ({
  acct,
  d: cents,
  c: 0,
  label,
  tp,
  nat
});
const C = (acct: string, cents: number, label: string, tp?: OwnerName | null, nat?: Nat): SpecLine => ({
  acct,
  d: 0,
  c: cents,
  label,
  tp,
  nat
});
const { CURRENT, DEPOSIT, UNALLOCATED } = MandantFundsNature;

const SPECS_A: EntrySpec[] = [
  // --- Avant la période (solde d'ouverture) ---
  {
    key: 'E1',
    journal: 'BQ',
    date: '2025-12-15T09:00:00.000Z',
    ref: 'OUV-01',
    desc: 'Ouverture loyers O1',
    lines: [D('512', 1000000, 'Encaissement loyers decembre'), C('4731', 1000000, 'Loyers decembre O1', 'O1', CURRENT)]
  },
  {
    key: 'E2',
    journal: 'BQ',
    date: '2026-01-10T00:00:00.000Z',
    ref: 'LOY-0110',
    desc: 'Loyers janvier O2',
    lines: [
      D('512', 400050, 'Encaissement loyers janvier'),
      C('4731', 300050, 'Loyer janvier O2', 'O2', CURRENT),
      C('4731', 100000, 'Depot de garantie O2', 'O2', DEPOSIT)
    ]
  },
  {
    key: 'E3',
    journal: 'VT25',
    date: '2026-02-05T10:00:00.000Z',
    ref: 'FA-0001',
    desc: 'Honoraires janvier',
    lines: [D('411', 250000, 'Facture FA-0001'), C('706', 250000, 'Honoraires janvier')]
  },
  {
    key: 'E4',
    journal: 'BQ',
    date: '2026-02-28T23:59:59.999Z',
    ref: 'RET-01',
    desc: 'Retrait caisse',
    lines: [D('571', 50000, 'Retrait pour caisse'), C('512', 50000, 'Retrait pour caisse')]
  },
  {
    key: 'E5',
    journal: 'BQ',
    date: '2026-01-20T00:00:00.000Z',
    ref: 'REV-0120',
    desc: 'Reversement O1 janvier',
    lines: [D('4731', 150000, 'Reversement O1 janvier', 'O1', CURRENT), C('512', 150000, 'Reversement O1 janvier')]
  },
  {
    key: 'E6',
    journal: 'BQ',
    date: '2026-02-01T00:00:00.000Z',
    ref: 'ENC-0201',
    desc: 'Encaissement non affecte',
    lines: [D('512', 20000, 'Encaissement non affecte'), C('4731', 20000, 'Fonds non repartis', null, UNALLOCATED)]
  },
  {
    key: 'E7',
    journal: 'BQ',
    date: '2026-02-15T00:00:00.000Z',
    ref: 'HIS-0215',
    desc: 'Ligne historique',
    lines: [D('512', 10000, 'Encaissement historique'), C('4731', 10000, 'Ligne historique O1', 'O1', null)]
  },
  {
    key: 'E8',
    journal: 'VT25',
    date: '2026-01-05T00:00:00.000Z',
    ref: 'CTX-01',
    desc: 'Transfert contentieux',
    lines: [D('4112', 10000, 'Transfert contentieux'), C('411', 10000, 'Transfert contentieux')]
  },
  {
    key: 'E9',
    journal: 'VT25',
    date: '2026-01-06T00:00:00.000Z',
    ref: 'CTX-02',
    desc: 'Retour contentieux',
    lines: [D('411', 10000, 'Retour contentieux'), C('4112', 10000, 'Retour contentieux')]
  },
  // --- Dans la période (mars 2026) ---
  {
    key: 'M1',
    journal: 'BQ',
    date: '2026-03-01T00:00:00.000Z',
    ref: 'LOY-0301',
    desc: 'Loyer mars O1',
    lines: [D('512', 120000, 'LOYER MARS Bamba'), C('4731', 120000, 'Loyer mars O1', 'O1', CURRENT)]
  },
  {
    key: 'M2',
    journal: 'BQ',
    date: '2026-03-01T00:00:00.000Z',
    ref: 'LOY-0302',
    desc: 'Loyer mars O2',
    sameCreatedAsKey: 'M1',
    lines: [D('512', 80000, 'Loyer mars Konan'), C('4731', 80000, 'Loyer mars O2', 'O2', CURRENT)]
  },
  {
    key: 'M3',
    journal: 'VT',
    date: '2026-03-03T08:00:00.000Z',
    ref: 'FA-0010',
    desc: 'Honoraires gestion Mars',
    lines: [D('411', 150050, 'Facture FA-0010'), C('706', 150050, 'Honoraires mars')]
  },
  {
    key: 'M4',
    journal: 'VT',
    date: '2026-03-03T14:30:00.000Z',
    ref: 'FA-0011',
    desc: 'Honoraires sous-compte',
    lines: [D('4111', 75000, 'Facture FA-0011'), C('706', 75000, 'Honoraires sous compte')]
  },
  {
    key: 'M5',
    journal: 'BQ',
    date: '2026-03-05T00:00:00.000Z',
    ref: 'REV-0305',
    desc: 'Reversement partiel O1',
    lines: [D('4731', 30000, 'Reversement partiel', 'O1', CURRENT), C('512', 30000, 'Reversement partiel O1')]
  },
  {
    key: 'M6',
    journal: 'BQ',
    date: '2026-03-07T00:00:00.000Z',
    ref: 'ENC-0307',
    desc: 'Encaissement client',
    lines: [
      D('512', 200000, 'Encaissement client A'),
      D('512', 100000, 'Encaissement client B'),
      C('411', 300000, 'Encaissement clients')
    ]
  },
  {
    key: 'M7',
    journal: 'BQ',
    date: '2026-03-07T00:00:00.000Z',
    ref: 'ENC-0308',
    desc: 'Depot et loyer avance O2',
    lines: [
      D('512', 500000, 'Depot et loyer O2'),
      C('4731', 250000, 'Depot garantie O2 mars', 'O2', DEPOSIT),
      C('4731', 250000, 'Loyer avance O2', 'O2', CURRENT)
    ]
  },
  {
    key: 'M8',
    journal: 'BQ',
    date: '2026-03-10T00:00:00.000Z',
    ref: 'FRAIS-03',
    desc: 'Frais bancaires',
    lines: [D('622', 40075, 'Frais bancaires mars'), C('512', 40075, 'Frais bancaires mars')]
  },
  {
    key: 'M9',
    journal: 'VT',
    date: '2026-03-12T00:00:00.000Z',
    ref: 'AV-0001',
    desc: 'Remise commerciale',
    lines: [D('622', 12010, 'Remise 10% accordee'), C('411', 12010, 'Remise accordee client')]
  },
  {
    key: 'M10',
    journal: 'BQ',
    date: '2026-03-15T00:00:00.000Z',
    ref: 'RES-0315',
    desc: 'Restitution depot O2',
    lines: [D('4731', 50000, 'Restitution depot', 'O2', DEPOSIT), C('512', 50000, 'Restitution depot O2')]
  },
  {
    key: 'M11',
    journal: 'BQ',
    date: '2026-03-15T00:00:00.000Z',
    ref: 'ENC-0315',
    desc: 'Encaissement non affecte',
    lines: [
      D('512', 100000, 'Encaissement a affecter'),
      C('4731', 100000, 'Encaissement a affecter', null, UNALLOCATED)
    ]
  },
  {
    key: 'M12',
    journal: 'VT',
    date: '2026-03-18T00:00:00.000Z',
    ref: 'FA-0020',
    desc: 'Facture annulee',
    docType: 'INVOICE',
    voidedByKey: 'M13',
    lines: [D('411', 9999, 'Facture FA-0020'), C('706', 9999, 'Honoraires annules')]
  },
  {
    key: 'M13',
    journal: 'VT',
    date: '2026-03-19T00:00:00.000Z',
    ref: 'AN-0020',
    desc: 'Annulation facture',
    docType: 'VOID',
    lines: [D('706', 9999, 'Annulation FA-0020'), C('411', 9999, 'Annulation FA-0020')]
  },
  {
    key: 'M14',
    journal: 'BQ',
    date: '2026-03-20T00:00:00.000Z',
    ref: 'AFF-0320',
    desc: 'Affectation fonds',
    lines: [D('4731', 40000, 'Affectation', null, UNALLOCATED), C('4731', 40000, 'Affectation vers O1', 'O1', CURRENT)]
  },
  {
    key: 'M15',
    journal: 'VT',
    date: '2026-03-25T00:00:00.000Z',
    ref: 'FA-0030',
    desc: 'Echeance de mars',
    lines: [D('411', 60000, 'ECHEANCE MARS'), C('706', 60000, 'Echeance mars')]
  },
  {
    key: 'M16',
    journal: 'BQ',
    date: '2026-03-31T23:59:59.999Z',
    ref: 'VERS-01',
    desc: 'Versement caisse en banque',
    lines: [D('512', 50000, 'Versement caisse'), C('571', 50000, 'Versement caisse')]
  },
  // --- Après la période ---
  {
    key: 'A1',
    journal: 'VT',
    date: '2026-04-02T00:00:00.000Z',
    ref: 'FA-0040',
    desc: 'Honoraires avril',
    lines: [D('411', 77700, 'Facture FA-0040'), C('706', 77700, 'Honoraires avril')]
  },
  {
    key: 'A2',
    journal: 'BQ',
    date: '2026-04-01T00:00:00.000Z',
    ref: 'LOY-0401',
    desc: 'Loyer avril O3',
    lines: [D('512', 11100, 'Loyer avril O3'), C('4731', 11100, 'Loyer avril O3', 'O3', CURRENT)]
  },
  // --- Copropriété (portée SYNDICATE) : jamais lue (le plan est unique par agence et par numéro) ---
  {
    key: 'S1',
    journal: 'SY',
    date: '2024-06-01T00:00:00.000Z',
    ref: 'SY-01',
    desc: 'Syndic ancien',
    lines: [D('5121', 999900, 'Syndic banque'), C('999', 999900, 'Syndic contrepartie')]
  },
  {
    key: 'S2',
    journal: 'SY',
    date: '2026-03-10T00:00:00.000Z',
    ref: 'SY-02',
    desc: 'Syndic mars',
    lines: [D('5121', 888800, 'Syndic banque mars'), C('999', 888800, 'Syndic contrepartie mars')]
  }
];

const SPECS_B: EntrySpec[] = [
  {
    key: 'B1',
    journal: 'BQ',
    date: '2026-01-15T00:00:00.000Z',
    ref: 'B-LOY-01',
    desc: 'Loyer janvier B',
    lines: [D('512', 500000, 'Loyer mars B ancien'), C('706', 500000, 'Honoraires B')]
  },
  {
    key: 'B2',
    journal: 'BQ',
    date: '2026-03-04T00:00:00.000Z',
    ref: 'LOY-0301',
    desc: 'Loyer mars B',
    lines: [D('512', 700000, 'LOYER MARS B'), C('4731', 700000, 'Loyer mars OB', 'O1', CURRENT)]
  },
  {
    key: 'B3',
    journal: 'VT',
    date: '2026-03-06T00:00:00.000Z',
    ref: 'FA-0010',
    desc: 'Honoraires gestion Mars B',
    lines: [D('512', 30000, 'Facture FA-0010 B'), C('706', 30000, 'Honoraires mars B')]
  },
  {
    key: 'B4',
    journal: 'BQ',
    date: '2026-03-09T00:00:00.000Z',
    ref: 'B-9999',
    desc: 'Compte propre a B',
    lines: [D('9999', 5000, 'Compte B seul'), C('706', 5000, 'Compte B seul')]
  }
];

const ACCOUNTS_A: Array<[string, string, number, 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE']> = [
  ['512', 'Banque principale', 5, 'ASSET'],
  ['571', 'Caisse agence', 5, 'ASSET'],
  ['411', 'Clients locataires', 4, 'ASSET'],
  ['4111', 'Clients douteux', 4, 'ASSET'],
  ['4112', 'Clients contentieux', 4, 'ASSET'],
  ['4731', 'Fonds des proprietaires mandants', 4, 'LIABILITY'],
  ['706', 'Honoraires de gestion', 7, 'INCOME'],
  ['622', 'Frais bancaires et commissions', 6, 'EXPENSE'],
  ['601', 'Achats', 6, 'EXPENSE']
];
const ACCOUNTS_B: typeof ACCOUNTS_A = [
  ['512', 'Banque principale', 5, 'ASSET'],
  ['4731', 'Fonds des proprietaires mandants', 4, 'LIABILITY'],
  ['706', 'Honoraires de gestion', 7, 'INCOME'],
  ['9999', 'Compte B seul', 9, 'ASSET']
];

interface RLine {
  id: string;
  acct: string;
  d: number;
  c: number;
  label: string;
  tp: string | null;
  nat: Nat;
}
interface REntry {
  id: string;
  key: string;
  journalKey: string;
  code: string;
  scope: Scope;
  date: Date;
  createdAt: number;
  ref: string;
  desc: string;
  docType: string | null;
  voidedBy: string | null;
  lines: RLine[];
}
interface Fx {
  tenantId: string;
  entries: REntry[];
  accounts: Map<string, { id: string; number: string; name: string; cls: number }>; // clé « SCOPE:numéro »
  owners: Record<OwnerName, { id: string; label: string }>;
  opsEntries: REntry[];
}

const JOURNALS: Record<
  string,
  { code: string; scope: Scope; type: 'GENERAL' | 'BANK'; fiscalYear: number; label: string }
> = {
  BQ: { code: 'BQ', scope: 'OPERATIONS', type: 'BANK', fiscalYear: 2026, label: 'Journal de banque' },
  VT: { code: 'VT', scope: 'OPERATIONS', type: 'GENERAL', fiscalYear: 2026, label: 'Journal des ventes' },
  VT25: { code: 'VT', scope: 'OPERATIONS', type: 'GENERAL', fiscalYear: 2025, label: 'Journal des ventes 2025' },
  SY: { code: 'SY', scope: 'SYNDICATE', type: 'GENERAL', fiscalYear: 2026, label: 'Journal copropriete' }
};

const BASE_CREATED = Date.UTC(2026, 0, 1);
const BULK_ACCOUNTS = 60;

const tenantsToClean: string[] = [];

async function createTenant(prefix: string): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({
    data: { name: `${prefix} ${suffix}`, slug: `${prefix}-${suffix}`, type: 'AGENCY', status: TenantStatus.ACTIVE }
  });
  tenantsToClean.push(tenant.id);
  return tenant.id;
}

async function seedAgency(
  prefix: string,
  specs: EntrySpec[],
  accountDefs: typeof ACCOUNTS_A,
  ownerLabels: Record<OwnerName, string>,
  extra: { bulkAccounts?: boolean; extraJournal?: string } = {}
): Promise<Fx> {
  const tenantId = await createTenant(prefix);

  // Comptes de tiers propriétaires.
  const owners = {} as Fx['owners'];
  for (const name of ['O1', 'O2', 'O3'] as OwnerName[]) {
    const row = await prisma.thirdPartyAccount.create({
      data: { tenantId, kind: 'OWNER', label: ownerLabels[name] },
      select: { id: true }
    });
    owners[name] = { id: row.id, label: ownerLabels[name] };
  }

  // Plan comptable (OPERATIONS) + comptes de copropriété aux numéros identiques.
  const accounts: Fx['accounts'] = new Map();
  const accountRows: Array<{ scope: Scope; number: string; name: string; cls: number; type: string }> = accountDefs.map(
    ([number, name, cls, type]) => ({ scope: 'OPERATIONS' as Scope, number, name, cls, type })
  );
  if (specs.some(s => s.journal === 'SY')) {
    accountRows.push(
      { scope: 'SYNDICATE', number: '5121', name: 'Banque copropriete', cls: 5, type: 'ASSET' },
      { scope: 'SYNDICATE', number: '999', name: 'Contrepartie copropriete', cls: 9, type: 'ASSET' }
    );
  }
  if (extra.bulkAccounts) {
    for (let i = 0; i < BULK_ACCOUNTS; i++) {
      accountRows.push({
        scope: 'OPERATIONS',
        number: String(8000 + i),
        name: `Compte test ${String(i).padStart(2, '0')}`,
        cls: 8,
        type: 'ASSET'
      });
    }
  }
  for (const row of accountRows) {
    const id = randomUUID();
    await prisma.chartOfAccount.create({
      data: {
        id,
        tenantId,
        scope: row.scope,
        accountNumber: row.number,
        accountName: row.name,
        accountClass: row.cls,
        accountType: row.type as 'ASSET'
      }
    });
    accounts.set(`${row.scope}:${row.number}`, { id, number: row.number, name: row.name, cls: row.cls });
  }

  // Journaux.
  const journalIds = new Map<string, string>();
  const usedJournals = new Set(specs.map(s => s.journal));
  if (extra.extraJournal) usedJournals.add(extra.extraJournal as 'BQ');
  for (const key of usedJournals) {
    const def = JOURNALS[key] ?? {
      code: key,
      scope: 'OPERATIONS' as Scope,
      type: 'GENERAL' as const,
      fiscalYear: 2026,
      label: key
    };
    const id = randomUUID();
    await prisma.accountingJournal.create({
      data: {
        id,
        tenantId,
        scope: def.scope,
        journalType: def.type,
        label: def.label,
        code: def.code,
        fiscalYear: def.fiscalYear
      }
    });
    journalIds.set(key, id);
  }

  // Écritures et lignes (identifiants et horodatages maîtrisés pour les égalités de tri).
  const entries: REntry[] = [];
  const byKey = new Map<string, REntry>();
  specs.forEach((spec, index) => {
    const def = JOURNALS[spec.journal];
    const same = spec.sameCreatedAsKey ? byKey.get(spec.sameCreatedAsKey) : undefined;
    const entry: REntry = {
      id: randomUUID(),
      key: spec.key,
      journalKey: spec.journal,
      code: def.code,
      scope: def.scope,
      date: new Date(spec.date),
      createdAt: same ? same.createdAt : BASE_CREATED + index * 60_000,
      ref: spec.ref,
      desc: spec.desc,
      docType: spec.docType ?? null,
      voidedBy: null,
      lines: spec.lines.map(l => ({
        id: randomUUID(),
        acct: l.acct,
        d: l.d,
        c: l.c,
        label: l.label,
        tp: l.tp ? owners[l.tp].id : null,
        nat: l.nat ?? null
      }))
    };
    entries.push(entry);
    byKey.set(spec.key, entry);
  });
  for (const spec of specs) {
    if (spec.voidedByKey) (byKey.get(spec.key) as REntry).voidedBy = (byKey.get(spec.voidedByKey) as REntry).id;
  }

  await prisma.journalEntry.createMany({
    data: entries.map(e => ({
      id: e.id,
      journalId: journalIds.get(e.journalKey) as string,
      tenantId,
      documentType: e.docType,
      entryDate: e.date,
      reference: e.ref,
      description: e.desc,
      sourceType: 'MANUAL' as const,
      createdAt: new Date(e.createdAt)
    }))
  });
  for (const e of entries) {
    if (e.voidedBy) await prisma.journalEntry.update({ where: { id: e.id }, data: { voidedByEntryId: e.voidedBy } });
  }
  await prisma.journalEntryLine.createMany({
    data: entries.flatMap(e =>
      e.lines.map(l => ({
        id: l.id,
        entryId: e.id,
        accountId: (accounts.get(`${e.scope}:${l.acct}`) as { id: string }).id,
        debit: l.d / 100,
        credit: l.c / 100,
        label: l.label,
        thirdPartyAccountId: l.tp,
        fundsNature: l.nat,
        createdAt: new Date(e.createdAt)
      }))
    )
  });

  return { tenantId, entries, accounts, owners, opsEntries: entries.filter(e => e.scope === 'OPERATIONS') };
}

// ---------------------------------------------------------------------------
// Calcul de référence en JavaScript (indépendant du SQL), en centimes
// ---------------------------------------------------------------------------

const cmpS = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const cn = (value: number) => Math.round(value * 100);
const inRange = (d: Date, p: Period) => d.getTime() >= p.from.getTime() && d.getTime() <= p.to.getTime();
const beforeFrom = (d: Date, p: Period) => d.getTime() < p.from.getTime();
const cmpEntry = (a: REntry, b: REntry) =>
  a.date.getTime() - b.date.getTime() || a.createdAt - b.createdAt || cmpS(a.id, b.id);

interface FLine extends RLine {
  e: REntry;
}
const flat = (entries: REntry[]): FLine[] => entries.flatMap(e => e.lines.map(l => ({ ...l, e })));
const cmpLine = (a: FLine, b: FLine) => cmpEntry(a.e, b.e) || cmpS(a.id, b.id);
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

function refJournal(fx: Fx, p: Period, f: { journal?: string; account?: string; search?: string }): REntry[] {
  const s = f.search?.toLowerCase();
  return fx.opsEntries
    .filter(
      e =>
        inRange(e.date, p) &&
        (!f.journal || e.code === f.journal) &&
        (!f.account || e.lines.some(l => l.acct.startsWith(f.account as string))) &&
        (!s ||
          e.ref.toLowerCase().includes(s) ||
          e.desc.toLowerCase().includes(s) ||
          e.lines.some(l => l.label.toLowerCase().includes(s)))
    )
    .sort(cmpEntry);
}

interface RefBal {
  number: string;
  name: string;
  cls: number;
  id: string;
  opening: number;
  pd: number;
  pc: number;
  closing: number;
}
function refBalances(fx: Fx, p: Period): RefBal[] {
  const byAcct = new Map<string, FLine[]>();
  for (const l of flat(fx.opsEntries)) {
    if (l.e.date.getTime() > p.to.getTime()) continue;
    byAcct.set(l.acct, [...(byAcct.get(l.acct) ?? []), l]);
  }
  const out: RefBal[] = [];
  for (const [number, lines] of byAcct) {
    const acc = fx.accounts.get(`OPERATIONS:${number}`) as { id: string; name: string; cls: number };
    const opening = sum(lines.filter(l => beforeFrom(l.e.date, p)).map(l => l.d - l.c));
    const pd = sum(lines.filter(l => !beforeFrom(l.e.date, p)).map(l => l.d));
    const pc = sum(lines.filter(l => !beforeFrom(l.e.date, p)).map(l => l.c));
    if (opening === 0 && pd === 0 && pc === 0) continue;
    out.push({ number, name: acc.name, cls: acc.cls, id: acc.id, opening, pd, pc, closing: opening + pd - pc });
  }
  return out.sort((a, b) => cmpS(a.number, b.number));
}

interface RefLedgerLine {
  line: FLine;
  balance: number;
}
function refAccountLedger(fx: Fx, p: Period, acct: string, f: { search?: string; journal?: string } = {}) {
  const all = flat(fx.opsEntries).filter(l => l.acct === acct);
  const opening = sum(all.filter(l => beforeFrom(l.e.date, p)).map(l => l.d - l.c));
  const inPeriod = all.filter(l => inRange(l.e.date, p)).sort(cmpLine);
  let running = opening;
  const withBalance: RefLedgerLine[] = inPeriod.map(line => {
    running += line.d - line.c;
    return { line, balance: running };
  });
  const s = f.search?.toLowerCase();
  const filtered = withBalance.filter(
    ({ line }) =>
      (!s || line.label.toLowerCase().includes(s) || line.e.ref.toLowerCase().includes(s)) &&
      (!f.journal || line.e.code === f.journal)
  );
  return {
    opening,
    debit: sum(inPeriod.map(l => l.d)),
    credit: sum(inPeriod.map(l => l.c)),
    closing: running,
    all: withBalance,
    filtered
  };
}

const isFunds = (l: FLine) => l.nat !== null || l.acct === '4731';
const fundsLines = (fx: Fx) => flat(fx.opsEntries).filter(isFunds);
const ownerKeyOf = (l: { tp: string | null }) => l.tp ?? UNASSIGNED_OWNER;
const natOf = (l: { nat: Nat }): MandantFundsNature => l.nat ?? CURRENT;
const ownerLabelOf = (fx: Fx, key: string) =>
  key === UNASSIGNED_OWNER
    ? 'Non réparti'
    : (Object.values(fx.owners).find(o => o.id === key) as { label: string }).label;

function refOwnerRows(fx: Fx, p: Period) {
  const rows = new Map<string, { opening: number; debit: number; credit: number }>();
  for (const l of fundsLines(fx)) {
    if (l.e.date.getTime() > p.to.getTime()) continue;
    const row = rows.get(ownerKeyOf(l)) ?? { opening: 0, debit: 0, credit: 0 };
    if (beforeFrom(l.e.date, p)) row.opening += l.c - l.d;
    else {
      row.debit += l.d;
      row.credit += l.c;
    }
    rows.set(ownerKeyOf(l), row);
  }
  return Array.from(rows.entries())
    .filter(([, v]) => v.opening !== 0 || v.debit !== 0 || v.credit !== 0)
    .map(([key, v]) => ({
      key,
      label: ownerLabelOf(fx, key),
      opening: v.opening,
      debit: v.debit,
      credit: v.credit,
      closing: v.opening + v.credit - v.debit
    }))
    .sort((a, b) =>
      a.key === UNASSIGNED_OWNER ? 1 : b.key === UNASSIGNED_OWNER ? -1 : a.label.localeCompare(b.label)
    );
}

const generalFundsBalance = (fx: Fx, upTo: Date) =>
  sum(
    flat(fx.opsEntries)
      .filter(l => l.acct === '4731' && l.e.date.getTime() <= upTo.getTime())
      .map(l => l.c - l.d)
  );

function refOwnerLedger(fx: Fx, p: Period, ownerKey: string) {
  const own = fundsLines(fx).filter(l => ownerKeyOf(l) === ownerKey);
  const nats: MandantFundsNature[] = [CURRENT, DEPOSIT, UNALLOCATED];
  const opening = new Map<MandantFundsNature, number>();
  for (const n of nats)
    opening.set(n, sum(own.filter(l => natOf(l) === n && beforeFrom(l.e.date, p)).map(l => l.c - l.d)));
  const inPeriod = own.filter(l => inRange(l.e.date, p)).sort(cmpLine);
  const running = new Map<MandantFundsNature, number>();
  const lines = inPeriod.map(line => {
    const n = natOf(line);
    const bal = (running.get(n) ?? 0) + line.c - line.d;
    running.set(n, bal);
    return { line, nature: n, balance: (opening.get(n) as number) + bal };
  });
  const natures = nats
    .map(n => {
      const mine = inPeriod.filter(l => natOf(l) === n);
      return {
        nature: n,
        opening: opening.get(n) as number,
        debit: sum(mine.map(l => l.d)),
        credit: sum(mine.map(l => l.c)),
        count: mine.length
      };
    })
    .filter(n => n.opening !== 0 || n.debit !== 0 || n.credit !== 0 || n.count > 0)
    .map(n => ({ ...n, closing: n.opening + n.credit - n.debit }));
  return { lines, natures };
}

/** Parcourt toutes les pages d'une lecture paginée. */
async function allPages<T extends { id?: string }>(
  read: (page: { page: number; limit: number }) => Promise<{ items: T[]; total: number }>,
  limit: number
): Promise<{ items: T[]; total: number; pages: number }> {
  const items: T[] = [];
  let total = 0;
  let pages = 0;
  for (let page = 1; page <= 50; page++) {
    const result = await read({ page, limit });
    total = result.total;
    pages++;
    items.push(...result.items);
    if (result.items.length < limit) break;
  }
  return { items, total, pages };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

maybeDescribe('Lot C — lectures comptables SQL sur base réelle', () => {
  let A: Fx;
  let B: Fx;
  const period = parsePeriod({ from: '2026-03-01', to: '2026-03-31' });
  const OWNER_LABELS_A: Record<OwnerName, string> = { O1: 'Bamba Awa', O2: 'Konan Yaô', O3: 'Zadi Koffi' };
  const OWNER_LABELS_B: Record<OwnerName, string> = { O1: 'Bamba Awa', O2: 'Kouassi B', O3: 'Zadi B' };

  beforeAll(async () => {
    A = await seedAgency('compta-a', SPECS_A, ACCOUNTS_A, OWNER_LABELS_A, { bulkAccounts: true });
    B = await seedAgency('compta-b', SPECS_B, ACCOUNTS_B, OWNER_LABELS_B, { extraJournal: 'ZB' });
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

  // -------------------------------------------------------------------------
  describe('1. Journal', () => {
    it('pagination : pages 1 et 2 sans doublon ni trou, total exact, ordre stable', async () => {
      const expected = refJournal(A, period, {});
      expect(expected.length).toBe(16); // M1 à M16 (A1/A2 après, E1-E9 avant, SY exclus)

      const r = await allPages(page => getJournalPage(A.tenantId, period, {}, page), 5);
      expect(r.total).toBe(expected.length);
      expect(r.pages).toBe(4);
      expect(r.items.map(i => i.id)).toEqual(expected.map(e => e.id));
      expect(new Set(r.items.map(i => i.id)).size).toBe(expected.length);

      const p1 = await getJournalPage(A.tenantId, period, {}, { page: 1, limit: 5 });
      const p2 = await getJournalPage(A.tenantId, period, {}, { page: 2, limit: 5 });
      expect(p1.items.length).toBe(5);
      expect(p2.items.length).toBe(5);
      expect(p1.page).toBe(1);
      expect(p2.page).toBe(2);
      expect(p1.from).toBe('2026-03-01');
      expect(p1.to).toBe('2026-03-31');
      expect(p1.items.some(i => p2.items.some(j => j.id === i.id))).toBe(false);

      // Tri stable : deux lectures successives rendent le même ordre (égalité M1/M2 départagée par id).
      const again = await getJournalPage(A.tenantId, period, {}, { page: 1, limit: 5 });
      expect(again.items.map(i => i.id)).toEqual(p1.items.map(i => i.id));
    });

    it('contenu des écritures : totaux, lignes débit d’abord, contre-passation', async () => {
      const all = await getJournalPage(A.tenantId, period, {}, 'all');
      expect(all.items.length).toBe(16);
      expect(all.total).toBe(16);
      for (const item of all.items) {
        const ref = A.opsEntries.find(e => e.id === item.id) as REntry;
        expect(cn(item.debit)).toBe(sum(ref.lines.map(l => l.d)));
        expect(cn(item.credit)).toBe(sum(ref.lines.map(l => l.c)));
        expect(item.debit).toBe(item.credit);
        expect(item.lines.length).toBe(ref.lines.length);
        expect(item.journalCode).toBe(ref.code);
        expect(item.reference).toBe(ref.ref);
        expect(item.reversed).toBe(Boolean(ref.voidedBy));
        const firstCredit = item.lines.findIndex(l => l.debit === 0);
        if (firstCredit >= 0) expect(item.lines.slice(firstCredit).every(l => l.debit === 0)).toBe(true);
      }
      expect(all.items.filter(i => i.reversed).map(i => i.reference)).toEqual(['FA-0020']);
      const funds = all.items.find(i => i.reference === 'ENC-0308') as (typeof all.items)[number];
      expect(funds.lines.map(l => l.nature)).toEqual(expect.arrayContaining(['Dépôt de garantie', 'Compte courant']));
      const tp = all.items.find(i => i.reference === 'LOY-0301') as (typeof all.items)[number];
      expect(tp.lines.find(l => l.accountNumber === '4731')?.thirdParty).toBe('Bamba Awa');
    });

    it('totaux débit = crédit sur TOUT le filtre (toutes pages)', async () => {
      const expected = refJournal(A, period, {});
      const expDebit = sum(expected.flatMap(e => e.lines.map(l => l.d)));
      const expCredit = sum(expected.flatMap(e => e.lines.map(l => l.c)));
      const p1 = await getJournalPage(A.tenantId, period, {}, { page: 1, limit: 3 });
      expect(cn(p1.totals.debit)).toBe(expDebit);
      expect(cn(p1.totals.credit)).toBe(expCredit);
      expect(p1.totals.debit).toBe(p1.totals.credit);
      const pageSum = sum(p1.items.map(i => cn(i.debit)));
      expect(pageSum).toBeLessThan(expDebit);
    });

    it('filtre journal (code partagé par deux exercices) et journal inconnu', async () => {
      for (const journal of ['BQ', 'VT']) {
        const expected = refJournal(A, period, { journal });
        const r = await getJournalPage(A.tenantId, period, { journal }, 'all');
        expect(r.items.map(i => i.id)).toEqual(expected.map(e => e.id));
        expect(r.total).toBe(expected.length);
        expect(cn(r.totals.debit)).toBe(sum(expected.flatMap(e => e.lines.map(l => l.d))));
      }
      await expect(getJournalPage(A.tenantId, period, { journal: 'SY' }, 'all')).rejects.toBeInstanceOf(NotFoundError);
      await expect(getJournalPage(A.tenantId, period, { journal: 'NOPE' }, 'all')).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('filtre compte : numéro exact et préfixe', async () => {
      for (const account of ['4731', '411', '41', '4', '706', '9999', '5', '4%', '4_3']) {
        const expected = refJournal(A, period, { account });
        const r = await getJournalPage(A.tenantId, period, { account }, 'all');
        expect(r.items.map(i => i.id)).toEqual(expected.map(e => e.id));
        expect(r.total).toBe(expected.length);
        // Les totaux portent sur toutes les lignes des écritures retenues (pas seulement celles du compte).
        expect(cn(r.totals.debit)).toBe(sum(expected.flatMap(e => e.lines.map(l => l.d))));
        expect(cn(r.totals.credit)).toBe(sum(expected.flatMap(e => e.lines.map(l => l.c))));
      }
      // 411 exact attrape aussi 4111 par préfixe : l'écriture M4 (4111) est dans le filtre « 411 ».
      const r411 = await getJournalPage(A.tenantId, period, { account: '411' }, 'all');
      expect(r411.items.some(i => i.reference === 'FA-0011')).toBe(true);
    });

    it('recherche insensible à la casse : pièce, description, libellé de ligne', async () => {
      for (const search of [
        'loyer',
        'LOYER',
        'FA-00',
        'fa-0010',
        'gestion mars',
        'ECHEANCE',
        'echeance',
        'zzzz',
        '10%',
        '%',
        '_',
        '1_',
        'Konan'
      ]) {
        const expected = refJournal(A, period, { search });
        const r = await getJournalPage(A.tenantId, period, { search }, 'all');
        expect(r.items.map(i => i.id)).toEqual(expected.map(e => e.id));
        expect(r.total).toBe(expected.length);
        expect(cn(r.totals.debit)).toBe(sum(expected.flatMap(e => e.lines.map(l => l.d))));
      }
      const none = await getJournalPage(A.tenantId, period, { search: 'zzzz' }, { page: 1, limit: 10 });
      expect(none.total).toBe(0);
      expect(none.items).toEqual([]);
      expect(none.totals).toEqual({ debit: 0, credit: 0 });
      // Description seule (aucun libellé de ligne ne contient « gestion mars »).
      const byDesc = await getJournalPage(A.tenantId, period, { search: 'gestion mars' }, 'all');
      expect(byDesc.items.map(i => i.reference)).toEqual(['FA-0010']);
    });

    it('filtres combinés', async () => {
      const f = { journal: 'BQ', account: '4731', search: 'loyer' };
      const expected = refJournal(A, period, f);
      const r = await getJournalPage(A.tenantId, period, f, 'all');
      expect(r.items.map(i => i.id)).toEqual(expected.map(e => e.id));
      expect(expected.length).toBeGreaterThan(0);
    });

    it('bornes de période : première et dernière milliseconde incluses, avant/après exclus', async () => {
      const march = await getJournalPage(A.tenantId, period, {}, 'all');
      const refs = march.items.map(i => i.reference);
      expect(refs).toContain('LOY-0301'); // 2026-03-01T00:00:00.000Z
      expect(refs).toContain('VERS-01'); // 2026-03-31T23:59:59.999Z
      expect(refs).not.toContain('RET-01'); // 2026-02-28T23:59:59.999Z
      expect(refs).not.toContain('LOY-0401'); // 2026-04-01T00:00:00.000Z
      expect(refs).not.toContain('SY-02');
    });
  });

  // -------------------------------------------------------------------------
  describe('2. Grand livre', () => {
    const pageSize = 4;

    for (const acct of ['512', '4731', '411', '706', '571', '622', '4111', '4112']) {
      it(`compte ${acct} : ouverture, mouvements, clôture, solde progressif continu entre pages`, async () => {
        const ref = refAccountLedger(A, period, acct);
        const full = await getAccountLedger(A.tenantId, period, acct, {}, 'all');
        expect(full.mode).toBe('account');
        expect(full.account.accountNumber).toBe(acct);
        expect(cn(full.summary.openingBalance)).toBe(ref.opening);
        expect(cn(full.summary.totalDebit)).toBe(ref.debit);
        expect(cn(full.summary.totalCredit)).toBe(ref.credit);
        expect(cn(full.summary.closingBalance)).toBe(ref.closing);
        expect(full.total).toBe(ref.all.length);
        expect(full.items.map(i => i.id)).toEqual(ref.all.map(r => r.line.id));
        expect(full.items.map(i => cn(i.balance))).toEqual(ref.all.map(r => r.balance));
        expect(full.filteredTotals).toBeNull();
        if (ref.all.length > 0) expect(cn(full.items[full.items.length - 1].balance)).toBe(ref.closing);

        // Pages successives : aucun doublon, aucun trou, solde progressif continu.
        const paged = await allPages(page => getAccountLedger(A.tenantId, period, acct, {}, page), pageSize);
        expect(paged.total).toBe(ref.all.length);
        expect(paged.items.map(i => i.id)).toEqual(ref.all.map(r => r.line.id));
        expect(paged.items.map(i => cn(i.balance))).toEqual(ref.all.map(r => r.balance));
        for (const item of paged.items) {
          const src = ref.all.find(r => r.line.id === item.id) as RefLedgerLine;
          expect(cn(item.debit)).toBe(src.line.d);
          expect(cn(item.credit)).toBe(src.line.c);
          expect(item.entryId).toBe(src.line.e.id);
          expect(item.reference).toBe(src.line.e.ref);
          expect(item.journalCode).toBe(src.line.e.code);
          expect(item.date).toBe(src.line.e.date.toISOString());
        }
      });
    }

    it('solde progressif sur la page 2 repart du dernier solde de la page 1 (compte 512)', async () => {
      const ref = refAccountLedger(A, period, '512');
      const p1 = await getAccountLedger(A.tenantId, period, '512', {}, { page: 1, limit: 4 });
      const p2 = await getAccountLedger(A.tenantId, period, '512', {}, { page: 2, limit: 4 });
      expect(ref.all.length).toBeGreaterThan(8);
      const last1 = p1.items[p1.items.length - 1];
      const first2 = p2.items[0];
      expect(cn(first2.balance)).toBe(cn(last1.balance) + cn(first2.debit) - cn(first2.credit));
    });

    it('lignes d’une même écriture sur un même compte départagées par identifiant (512, M6)', async () => {
      const ref = refAccountLedger(A, period, '512');
      const m6 = ref.all.filter(r => r.line.e.key === 'M6');
      expect(m6.length).toBe(2);
      const r = await getAccountLedger(A.tenantId, period, '512', {}, 'all');
      const ids = r.items.filter(i => i.reference === 'ENC-0307').map(i => i.id);
      expect(ids).toEqual(m6.map(x => x.line.id));
    });

    it('avec recherche / filtre journal, le solde affiché reste le vrai solde du compte', async () => {
      const cases: Array<{ acct: string; search?: string; journal?: string }> = [
        { acct: '512', search: 'loyer' },
        { acct: '512', search: 'LOYER' },
        { acct: '512', journal: 'BQ' },
        { acct: '512', search: 'enc-03' }, // par pièce
        { acct: '411', search: 'facture' },
        { acct: '411', journal: 'VT', search: 'fa-00' },
        { acct: '622', search: '%' }, // joker neutralisé : seule la ligne qui porte « % » ressort
        { acct: '622', search: '10%' },
        { acct: '4731', search: 'zzz' }
      ];
      for (const c of cases) {
        const ref = refAccountLedger(A, period, c.acct, { search: c.search, journal: c.journal });
        const full = await getAccountLedger(
          A.tenantId,
          period,
          c.acct,
          { search: c.search, journal: c.journal },
          'all'
        );
        expect(full.items.map(i => i.id)).toEqual(ref.filtered.map(r => r.line.id));
        expect(full.items.map(i => cn(i.balance))).toEqual(ref.filtered.map(r => r.balance));
        expect(full.total).toBe(ref.filtered.length);
        expect(full.filteredTotals).toEqual({
          debit: sum(ref.filtered.map(r => r.line.d)) / 100,
          credit: sum(ref.filtered.map(r => r.line.c)) / 100
        });
        // Synthèse du compte : indépendante du filtre.
        expect(cn(full.summary.closingBalance)).toBe(ref.closing);
        expect(cn(full.summary.openingBalance)).toBe(ref.opening);

        const paged = await allPages(
          page => getAccountLedger(A.tenantId, period, c.acct, { search: c.search, journal: c.journal }, page),
          3
        );
        expect(paged.total).toBe(ref.filtered.length);
        expect(paged.items.map(i => i.id)).toEqual(ref.filtered.map(r => r.line.id));
        expect(paged.items.map(i => cn(i.balance))).toEqual(ref.filtered.map(r => r.balance));
      }
      // « % » seul : une seule ligne (jamais toutes).
      const pct = await getAccountLedger(A.tenantId, period, '622', { search: '%' }, 'all');
      expect(pct.total).toBe(1);
    });

    it('journal inconnu ou d’une autre portée → NotFoundError', async () => {
      await expect(getAccountLedger(A.tenantId, period, '512', { journal: 'SY' }, 'all')).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('comptes précédent / suivant : voisins mouvementés dans l’ordre des numéros', async () => {
      const balances = refBalances(A, period);
      const numbers = balances.map(b => b.number);
      for (const acct of ['411', '4731', '512', '706', '622']) {
        const i = numbers.indexOf(acct);
        expect(i).toBeGreaterThanOrEqual(0);
        const r = await getAccountLedger(A.tenantId, period, acct, {}, { page: 1, limit: 5 });
        expect(r.previousAccount?.accountNumber ?? null).toBe(i > 0 ? numbers[i - 1] : null);
        expect(r.nextAccount?.accountNumber ?? null).toBe(i < numbers.length - 1 ? numbers[i + 1] : null);
      }
      // Un compte sans mouvement (601) garde ses voisins par numéro.
      const r601 = await getAccountLedger(A.tenantId, period, '601', {}, { page: 1, limit: 5 });
      expect(r601.total).toBe(0);
      expect(r601.items).toEqual([]);
      expect(cn(r601.summary.closingBalance)).toBe(0);
      const before601 = numbers.filter(n => n < '601').pop() ?? null;
      const after601 = numbers.find(n => n > '601') ?? null;
      expect(r601.previousAccount?.accountNumber ?? null).toBe(before601);
      expect(r601.nextAccount?.accountNumber ?? null).toBe(after601);
    });

    it('récapitulatif sans compte : paginé, soldes exacts, totaux de tout le filtre', async () => {
      const balances = refBalances(A, period);
      const all = await getLedgerSummary(A.tenantId, period, {}, 'all');
      expect(all.mode).toBe('summary');
      expect(all.items.map(i => i.accountNumber)).toEqual(balances.map(b => b.number));
      for (const item of all.items) {
        const b = balances.find(x => x.number === item.accountNumber) as RefBal;
        expect(item.id).toBe(b.id);
        expect(cn(item.openingBalance)).toBe(b.opening);
        expect(cn(item.totalDebit)).toBe(b.pd);
        expect(cn(item.totalCredit)).toBe(b.pc);
        expect(cn(item.closingBalance)).toBe(b.closing);
        expect(item.accountClass).toBe(b.cls);
      }
      expect(cn(all.totals.totalDebit)).toBe(sum(balances.map(b => b.pd)));
      expect(cn(all.totals.totalCredit)).toBe(sum(balances.map(b => b.pc)));
      expect(cn(all.totals.openingBalance)).toBe(sum(balances.map(b => b.opening)));
      expect(cn(all.totals.closingBalance)).toBe(sum(balances.map(b => b.closing)));
      expect(all.totals.closingBalance).toBe(0); // partie double

      const paged = await allPages(page => getLedgerSummary(A.tenantId, period, {}, page), 3);
      expect(paged.total).toBe(balances.length);
      expect(paged.items.map(i => i.accountNumber)).toEqual(balances.map(b => b.number));

      const filtered = await getLedgerSummary(A.tenantId, period, { search: 'CLIENTS' }, { page: 1, limit: 2 });
      const expected = balances.filter(b => b.number.startsWith('clients') || b.name.toLowerCase().includes('clients'));
      expect(filtered.total).toBe(expected.length);
      expect(filtered.items.length).toBe(Math.min(2, expected.length));
      expect(cn(filtered.totals.totalDebit)).toBe(sum(expected.map(b => b.pd)));
    });
  });

  // -------------------------------------------------------------------------
  describe('3. Balance générale', () => {
    const split = (n: number) => (n >= 0 ? { d: n, c: 0 } : { d: 0, c: -n });

    it('sommes par compte, totaux, équilibre', async () => {
      const balances = refBalances(A, period);
      const tb = await getTrialBalanceData(A.tenantId, period);
      expect(tb.lines.map(l => l.accountNumber)).toEqual(balances.map(b => b.number));
      for (const line of tb.lines) {
        const b = balances.find(x => x.number === line.accountNumber) as RefBal;
        expect(cn(line.openingDebit)).toBe(split(b.opening).d);
        expect(cn(line.openingCredit)).toBe(split(b.opening).c);
        expect(cn(line.periodDebit)).toBe(b.pd);
        expect(cn(line.periodCredit)).toBe(b.pc);
        expect(cn(line.closingDebit)).toBe(split(b.closing).d);
        expect(cn(line.closingCredit)).toBe(split(b.closing).c);
      }
      const totals = {
        openingDebit: sum(balances.map(b => split(b.opening).d)),
        openingCredit: sum(balances.map(b => split(b.opening).c)),
        periodDebit: sum(balances.map(b => b.pd)),
        periodCredit: sum(balances.map(b => b.pc)),
        closingDebit: sum(balances.map(b => split(b.closing).d)),
        closingCredit: sum(balances.map(b => split(b.closing).c))
      };
      for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
        expect(cn(tb.totals[key])).toBe(totals[key]);
        expect(cn(tb.control[key])).toBe(totals[key]);
      }
      expect(tb.totals.openingDebit).toBe(tb.totals.openingCredit);
      expect(tb.totals.periodDebit).toBe(tb.totals.periodCredit);
      expect(tb.totals.closingDebit).toBe(tb.totals.closingCredit);
      expect(tb.isBalanced).toBe(true);
      // Le compte net-zéro avant période (4112) et le compte sans écriture (601) n'apparaissent pas.
      expect(tb.lines.map(l => l.accountNumber)).not.toContain('4112');
      expect(tb.lines.map(l => l.accountNumber)).not.toContain('601');
    });

    it('filtre classe, masquer les soldés, recherche', async () => {
      const balances = refBalances(A, period);
      const full = await getTrialBalanceData(A.tenantId, period);

      const cls4 = await getTrialBalanceData(A.tenantId, period, { accountClass: 4 });
      const exp4 = balances.filter(b => b.cls === 4);
      expect(cls4.lines.map(l => l.accountNumber)).toEqual(exp4.map(b => b.number));
      expect(cn(cls4.totals.periodDebit)).toBe(sum(exp4.map(b => b.pd)));
      expect(cls4.control).toEqual(full.control);

      const noZero = await getTrialBalanceData(A.tenantId, period, { hideZero: true });
      const expNoZero = balances.filter(b => b.closing !== 0);
      expect(balances.some(b => b.closing === 0)).toBe(true); // 571 est soldé
      expect(noZero.lines.map(l => l.accountNumber)).toEqual(expNoZero.map(b => b.number));
      expect(noZero.lines.map(l => l.accountNumber)).not.toContain('571');
      expect(noZero.isBalanced).toBe(true);

      for (const search of ['banque', '41', 'HONORAIRES', 'bancaires']) {
        const r = await getTrialBalanceData(A.tenantId, period, { search });
        const needle = search.toLowerCase();
        const exp = balances.filter(b => b.number.startsWith(needle) || b.name.toLowerCase().includes(needle));
        expect(r.lines.map(l => l.accountNumber)).toEqual(exp.map(b => b.number));
      }
      const combo = await getTrialBalanceData(A.tenantId, period, { accountClass: 4, hideZero: true, search: '41' });
      expect(combo.lines.map(l => l.accountNumber)).toEqual(
        balances.filter(b => b.cls === 4 && b.closing !== 0 && b.number.startsWith('41')).map(b => b.number)
      );
    });

    it('getAccountBalances : soldes SQL = référence', async () => {
      const rows = await getAccountBalances(A.tenantId, period);
      const balances = refBalances(A, period);
      expect(rows.map(r => r.accountNumber)).toEqual(balances.map(b => b.number));
      expect(rows.map(r => cn(r.closingBalance))).toEqual(balances.map(b => b.closing));
    });
  });

  // -------------------------------------------------------------------------
  describe('4. Mandants', () => {
    it('liste des propriétaires : soldes, tri, pagination, contrôle', async () => {
      const rows = refOwnerRows(A, period);
      expect(rows.length).toBe(3); // O1, O2, non réparti (O3 n'a que des écritures d'avril)
      const all = await getMandantOwnersPage(A.tenantId, period, {}, 'all');
      expect(all.mode).toBe('owners');
      expect(all.accountNumber).toBe('4731');
      expect(all.total).toBe(rows.length);
      expect(all.items.map(i => i.ownerKey)).toEqual(rows.map(r => r.key));
      expect(all.items[all.items.length - 1].ownerKey).toBe(UNASSIGNED_OWNER);
      for (const item of all.items) {
        const r = rows.find(x => x.key === item.ownerKey) as (typeof rows)[number];
        expect(item.ownerLabel).toBe(r.label);
        expect(cn(item.openingBalance)).toBe(r.opening);
        expect(cn(item.totalDebit)).toBe(r.debit);
        expect(cn(item.totalCredit)).toBe(r.credit);
        expect(cn(item.closingBalance)).toBe(r.closing);
        expect(item.thirdPartyAccountId).toBe(item.ownerKey === UNASSIGNED_OWNER ? null : item.ownerKey);
      }
      expect(cn(all.totals.closingBalance)).toBe(sum(rows.map(r => r.closing)));
      expect(all.control.generalBalance).toBe(generalFundsBalance(A, period.to) / 100);
      expect(cn(all.control.auxiliaryBalance)).toBe(sum(rows.map(r => r.closing)));
      expect(all.control.difference).toBe(0);
      expect(all.control.isBalanced).toBe(true);

      const p1 = await getMandantOwnersPage(A.tenantId, period, {}, { page: 1, limit: 2 });
      const p2 = await getMandantOwnersPage(A.tenantId, period, {}, { page: 2, limit: 2 });
      expect([...p1.items, ...p2.items].map(i => i.ownerKey)).toEqual(rows.map(r => r.key));
      expect(p1.total).toBe(3);
      expect(p2.items.length).toBe(1);

      // Recherche tolérante aux accents et à la casse ; totaux = lignes filtrées, contrôle = tout.
      const s = await getMandantOwnersPage(A.tenantId, period, { search: 'YAO' }, 'all');
      expect(s.items.map(i => i.ownerLabel)).toEqual(['Konan Yaô']);
      const sRow = rows.find(r => r.label === 'Konan Yaô') as (typeof rows)[number];
      expect(cn(s.totals.closingBalance)).toBe(sRow.closing);
      expect(s.control.isBalanced).toBe(true);
    });

    for (const ownerName of ['O1', 'O2', 'NONE'] as const) {
      it(`détail d’un propriétaire (${ownerName}) : solde progressif par nature, pages, filtre nature`, async () => {
        const key = ownerName === 'NONE' ? UNASSIGNED_OWNER : A.owners[ownerName].id;
        const ref = refOwnerLedger(A, period, key);
        expect(ref.lines.length).toBeGreaterThan(0);

        const full = await getMandantOwnerLedger(A.tenantId, period, key, {}, 'all');
        expect(full.mode).toBe('owner');
        expect(full.owner.ownerLabel).toBe(ownerLabelOf(A, key));
        expect(full.total).toBe(ref.lines.length);
        expect(full.items.map(i => i.id)).toEqual(ref.lines.map(l => l.line.id));
        expect(full.items.map(i => cn(i.balance))).toEqual(ref.lines.map(l => l.balance));
        expect(full.items.map(i => i.nature)).toEqual(ref.lines.map(l => l.nature));
        expect(full.natures.map(n => n.nature)).toEqual(ref.natures.map(n => n.nature));
        for (const n of full.natures) {
          const r = ref.natures.find(x => x.nature === n.nature) as (typeof ref.natures)[number];
          expect(cn(n.openingBalance)).toBe(r.opening);
          expect(cn(n.totalDebit)).toBe(r.debit);
          expect(cn(n.totalCredit)).toBe(r.credit);
          expect(cn(n.closingBalance)).toBe(r.closing);
        }

        const paged = await allPages(page => getMandantOwnerLedger(A.tenantId, period, key, {}, page), 2);
        expect(paged.total).toBe(ref.lines.length);
        expect(paged.items.map(i => i.id)).toEqual(ref.lines.map(l => l.line.id));
        expect(paged.items.map(i => cn(i.balance))).toEqual(ref.lines.map(l => l.balance));

        for (const nature of [CURRENT, DEPOSIT, UNALLOCATED]) {
          const expected = ref.lines.filter(l => l.nature === nature);
          const r = await getMandantOwnerLedger(A.tenantId, period, key, { nature }, 'all');
          expect(r.total).toBe(expected.length);
          expect(r.items.map(i => i.id)).toEqual(expected.map(l => l.line.id));
          // Le solde reste celui de la nature, filtre ou pas.
          expect(r.items.map(i => cn(i.balance))).toEqual(expected.map(l => l.balance));
          const pagedNat = await allPages(page => getMandantOwnerLedger(A.tenantId, period, key, { nature }, page), 2);
          expect(pagedNat.items.map(i => i.id)).toEqual(expected.map(l => l.line.id));
        }
      });
    }

    it('balance auxiliaire : soldes par nature, totaux, contrôle, recherche, pages', async () => {
      const asOf = parseAsOfDate({ date: '2026-03-31' });
      const lines = fundsLines(A).filter(l => l.e.date.getTime() <= asOf.date.getTime());
      const owners = Array.from(new Set(lines.map(ownerKeyOf)));
      const expRows = owners
        .map(key => {
          const mine = lines.filter(l => ownerKeyOf(l) === key);
          const by = (n: MandantFundsNature) => sum(mine.filter(l => natOf(l) === n).map(l => l.c - l.d));
          return {
            key,
            label: ownerLabelOf(A, key),
            current: by(CURRENT),
            deposit: by(DEPOSIT),
            unallocated: by(UNALLOCATED)
          };
        })
        .filter(r => r.current !== 0 || r.deposit !== 0 || r.unallocated !== 0)
        .sort((a, b) =>
          a.key === UNASSIGNED_OWNER ? 1 : b.key === UNASSIGNED_OWNER ? -1 : a.label.localeCompare(b.label)
        );

      const full = await getMandantTrialBalancePage(A.tenantId, asOf, {}, 'all');
      expect(full.items.map(i => i.ownerKey)).toEqual(expRows.map(r => r.key));
      for (const item of full.items) {
        const r = expRows.find(x => x.key === item.ownerKey) as (typeof expRows)[number];
        expect(cn(item.current)).toBe(r.current);
        expect(cn(item.deposit)).toBe(r.deposit);
        expect(cn(item.unallocated)).toBe(r.unallocated);
        expect(cn(item.total)).toBe(r.current + r.deposit + r.unallocated);
      }
      expect(cn(full.totals.total)).toBe(sum(expRows.map(r => r.current + r.deposit + r.unallocated)));
      expect(cn(full.control.generalBalance)).toBe(generalFundsBalance(A, asOf.date));
      expect(full.control.isBalanced).toBe(true);

      const p1 = await getMandantTrialBalancePage(A.tenantId, asOf, {}, { page: 1, limit: 2 });
      expect(p1.total).toBe(expRows.length);
      expect(p1.items.length).toBe(2);

      const s = await getMandantTrialBalancePage(A.tenantId, asOf, { search: 'bamba' }, 'all');
      expect(s.items.map(i => i.ownerLabel)).toEqual(['Bamba Awa']);
      expect(s.control.isBalanced).toBe(true);

      // Cohérence entre les trois lectures sur la même date : clôture de la liste = balance = grand livre auxiliaire.
      const owners2 = await getMandantOwnersPage(A.tenantId, period, {}, 'all');
      for (const o of owners2.items) {
        const row = full.items.find(i => i.ownerKey === o.ownerKey) as (typeof full.items)[number];
        expect(row.total).toBe(o.closingBalance);
      }
      const tbLegacy = await getMandantTrialBalance(A.tenantId, asOf);
      expect(tbLegacy.totals.total).toBe(full.totals.total);
    });

    // BUG CONNU (hors lot C, mandants.ts getMandantSubledger) : le grand livre auxiliaire historique
    // (export « mandant-subledger ») groupe les soldes d'ouverture par [tiers, nature] ; un groupe
    // `fundsNature = NULL` (ligne historique) et un groupe CURRENT du même propriétaire sont deux
    // groupes SQL qui tombent sur la même clé `mandantGroupKey` : `openingByGroup.set` ECRASE au lieu
    // d'additionner. Le contrôle affiche alors un écart.
    it('grand livre auxiliaire historique : contrôle équilibré et clôture = liste des propriétaires', async () => {
      const sub = await getMandantSubledger(A.tenantId, period);
      const owners = await getMandantOwnersPage(A.tenantId, period, {}, 'all');
      expect(sub.totals.closingBalance).toBe(owners.totals.closingBalance);
      expect(sub.control.isBalanced).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('5. Méta et sélecteur de comptes', () => {
    it('journaux, années, dates min/max (portée OPERATIONS seulement)', async () => {
      const meta = await getAccountingMeta(A.tenantId);
      expect(meta.journals).toEqual([
        { code: 'BQ', label: expect.any(String) },
        { code: 'VT', label: expect.any(String) }
      ]);
      expect(meta.journals.length).toBe(2); // VT existe pour 2025 et 2026 : un seul code
      expect(meta.years).toEqual([2026, 2025]);
      expect(meta.minDate).toBe('2025-12-15');
      expect(meta.maxDate).toBe('2026-04-02');

      const metaB = await getAccountingMeta(B.tenantId);
      expect(metaB.journals.map(j => j.code)).toEqual(['BQ', 'VT', 'ZB']);
      expect(metaB.minDate).toBe('2026-01-15');
      expect(metaB.maxDate).toBe('2026-03-09');
      expect(metaB.years).toEqual([2026]);
    });

    it('agence sans écriture : méta vide', async () => {
      const empty = await createTenant('compta-vide');
      const meta = await getAccountingMeta(empty);
      expect(meta).toEqual({ journals: [], years: [], minDate: null, maxDate: null });
    });

    it('liste des comptes : recherche, limites 20 / 50, ordre', async () => {
      const r20 = await listAccounts(A.tenantId, { search: 'Compte test', limit: 20 });
      expect(r20.length).toBe(20);
      expect(r20.map(a => a.accountNumber)).toEqual(Array.from({ length: 20 }, (_, i) => String(8000 + i)));
      const r50 = await listAccounts(A.tenantId, { search: 'compte TEST', limit: 50 });
      expect(r50.length).toBe(50);
      expect(r50.map(a => a.accountNumber)).toEqual(Array.from({ length: 50 }, (_, i) => String(8000 + i)));

      const byPrefix = await listAccounts(A.tenantId, { search: '41', limit: 20 });
      expect(byPrefix.map(a => a.accountNumber)).toEqual(['411', '4111', '4112', '8041']); // 8041 : « Compte test 41 » (intitulé)
      expect(await listAccounts(A.tenantId, { search: '%', limit: 20 })).toEqual([]); // jokers neutralisés
      expect(await listAccounts(A.tenantId, { search: '4_1', limit: 20 })).toEqual([]);
      const byName = await listAccounts(A.tenantId, { search: 'BANQUE', limit: 20 });
      expect(byName.map(a => a.accountNumber)).toEqual(['512']); // pas le 512 de copropriété
      const byNameMid = await listAccounts(A.tenantId, { search: 'bancaires', limit: 20 });
      expect(byNameMid.map(a => a.accountNumber)).toEqual(['622']);
      const none = await listAccounts(A.tenantId, { search: 'inexistant', limit: 20 });
      expect(none).toEqual([]);
      const first = await listAccounts(A.tenantId, { limit: 5 });
      expect(first.map(a => a.accountNumber)).toEqual(['4111', '4112', '411', '4731', '512'].sort());
      expect(first[0]).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          accountClass: expect.any(Number),
          accountName: expect.any(String)
        })
      );
      await expect(listAccounts(A.tenantId, { withMovements: true, limit: 20 })).rejects.toThrow();
    });

    it('comptes mouvementés (période) : uniquement des comptes qui portent des lignes jusqu’à la fin de période', async () => {
      const r = await listAccounts(A.tenantId, { withMovements: true, period, limit: 50 });
      const withLines = new Set(
        flat(A.opsEntries)
          .filter(l => l.e.date.getTime() <= period.to.getTime())
          .map(l => l.acct)
      );
      expect(r.length).toBeGreaterThan(0);
      expect(r.every(a => withLines.has(a.accountNumber))).toBe(true);
    });

    // ECART AU CONTRAT (queries/ledger.ts listAccounts) : types.ts promet « mouvementés sur la période
    // OU solde d'ouverture non nul », mais le filtre SQL retient tout compte qui a une ligne <= fin de période :
    // 4112 (débité puis recrédité avant la période, solde 0, aucun mouvement) est listé. Correctif proposé :
    // `id: { in: (await getAccountBalances(tenantId, period)).map(r => r.id) }` dans le `where` (le test unitaire
    // « cherche les comptes… » doit alors mocker `$queryRaw`).
    it('comptes mouvementés (période) : un compte soldé avant la période est exclu (contrat types.ts)', async () => {
      const r = await listAccounts(A.tenantId, { withMovements: true, period, limit: 50 });
      expect(r.map(a => a.accountNumber)).toEqual(refBalances(A, period).map(b => b.number));
    });
  });

  // -------------------------------------------------------------------------
  describe('6. Isolation entre agences', () => {
    it('rien de B dans les lectures de A (numéros de comptes et codes de journaux identiques)', async () => {
      const bEntryIds = new Set(B.entries.map(e => e.id));
      const bLineIds = new Set(flat(B.entries).map(l => l.id));
      const bOwnerIds = new Set(Object.values(B.owners).map(o => o.id));
      const bAccountIds = new Set(Array.from(B.accounts.values()).map(a => a.id));

      const wide = parsePeriod({ from: '2020-01-01', to: '2030-12-31' });
      const journal = await getJournalPage(A.tenantId, wide, {}, 'all');
      expect(journal.items.every(i => !bEntryIds.has(i.id))).toBe(true);
      expect(journal.total).toBe(A.opsEntries.length);
      expect(cn(journal.totals.debit)).toBe(sum(flat(A.opsEntries).map(l => l.d)));

      for (const acct of ['512', '4731', '706']) {
        const ledger = await getAccountLedger(A.tenantId, wide, acct, {}, 'all');
        expect(ledger.items.every(i => !bLineIds.has(i.id))).toBe(true);
        expect(ledger.account.id).toBe((A.accounts.get(`OPERATIONS:${acct}`) as { id: string }).id);
        const ref = refAccountLedger(A, wide, acct);
        expect(cn(ledger.summary.closingBalance)).toBe(ref.closing);
        expect(ledger.total).toBe(ref.all.length);
      }
      const summary = await getLedgerSummary(A.tenantId, wide, {}, 'all');
      expect(summary.items.every(i => !bAccountIds.has(i.id))).toBe(true);
      expect(summary.items.map(i => i.accountNumber)).not.toContain('9999');
      const tb = await getTrialBalanceData(A.tenantId, wide);
      expect(tb.lines.map(l => l.accountNumber)).not.toContain('9999');
      const owners = await getMandantOwnersPage(A.tenantId, wide, {}, 'all');
      expect(owners.items.every(i => !bOwnerIds.has(i.ownerKey))).toBe(true);
      const meta = await getAccountingMeta(A.tenantId);
      expect(meta.journals.map(j => j.code)).not.toContain('ZB');
      const accounts = await listAccounts(A.tenantId, { search: '9999', limit: 20 });
      expect(accounts).toEqual([]);

      // Et B lit bien ses propres données, pas celles de A.
      const bJournal = await getJournalPage(B.tenantId, wide, {}, 'all');
      expect(bJournal.total).toBe(B.opsEntries.length);
      expect(bJournal.items.every(i => bEntryIds.has(i.id))).toBe(true);
      const bBalances = refBalances(B, wide);
      const bTb = await getTrialBalanceData(B.tenantId, wide);
      expect(bTb.lines.map(l => l.accountNumber)).toEqual(bBalances.map(b => b.number));
      expect(bTb.lines.map(l => cn(l.closingDebit) - cn(l.closingCredit))).toEqual(bBalances.map(b => b.closing));
      const bOwners = await getMandantOwnersPage(B.tenantId, wide, {}, 'all');
      expect(bOwners.items.map(i => i.ownerKey)).toEqual(refOwnerRows(B, wide).map(r => r.key));
    });

    it('compte, journal ou propriétaire d’une autre agence → NotFoundError', async () => {
      await expect(getAccountLedger(A.tenantId, period, '9999', {}, 'all')).rejects.toBeInstanceOf(NotFoundError);
      await expect(getAccountLedger(B.tenantId, period, '411', {}, 'all')).rejects.toBeInstanceOf(NotFoundError);
      await expect(getJournalPage(A.tenantId, period, { journal: 'ZB' }, 'all')).rejects.toBeInstanceOf(NotFoundError);
      await expect(getAccountLedger(A.tenantId, period, '512', { journal: 'ZB' }, 'all')).rejects.toBeInstanceOf(
        NotFoundError
      );
      await expect(getMandantOwnerLedger(A.tenantId, period, B.owners.O1.id, {}, 'all')).rejects.toBeInstanceOf(
        NotFoundError
      );
      await expect(getMandantOwnerLedger(A.tenantId, period, randomUUID(), {}, 'all')).rejects.toBeInstanceOf(
        NotFoundError
      );
      // Même propriétaire demandé par sa propre agence : accepté.
      const ok = await getMandantOwnerLedger(B.tenantId, period, B.owners.O1.id, {}, 'all');
      expect(ok.total).toBe(refOwnerLedger(B, period, B.owners.O1.id).lines.length);
    });
  });

  // -------------------------------------------------------------------------
  describe('7. Exports (sans pagination)', () => {
    it('journal : toutes les lignes, CSV et XLSX', async () => {
      const data = await getJournalPage(A.tenantId, period, {}, 'all');
      const expectedLines = sum(refJournal(A, period, {}).map(e => e.lines.length));
      const table = journalPageTable(data);
      expect(data.items.length).toBe(16);
      expect(data.limit).toBe(data.total);
      expect(table.rows.length).toBe(expectedLines);

      const csv = toCsv(table);
      expect(csv.split('\r\n').filter(Boolean).length).toBe(expectedLines + 1);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await toXlsx([table])) as unknown as ArrayBuffer);
      expect(wb.getWorksheet('Journal')?.rowCount).toBe(expectedLines + 1);
    });

    it('grand livre d’un compte : toutes les lignes + ouverture et clôture', async () => {
      const data = await getAccountLedger(A.tenantId, period, '512', {}, 'all');
      const ref = refAccountLedger(A, period, '512');
      const table = accountLedgerTable(data);
      expect(table.rows.length).toBe(ref.all.length + 2);
      expect(table.rows[table.rows.length - 1][10]).toBe(ref.closing / 100);
    });

    it('grand livre complet (tous comptes) = référence', async () => {
      const data = await getGeneralLedger(A.tenantId, period);
      const balances = refBalances(A, period);
      expect(data.accounts.map(a => a.accountNumber)).toEqual(balances.map(b => b.number));
      for (const acc of data.accounts) {
        const b = balances.find(x => x.number === acc.accountNumber) as RefBal;
        const ref = refAccountLedger(A, period, acc.accountNumber);
        expect(cn(acc.openingBalance)).toBe(b.opening);
        expect(cn(acc.closingBalance)).toBe(b.closing);
        expect(acc.lines.length).toBe(ref.all.length);
        expect(acc.lines.map(l => cn(l.balance))).toEqual(ref.all.map(r => r.balance));
        // Même résultat que la lecture SQL paginée, ligne à ligne.
        const sql = await getAccountLedger(A.tenantId, period, acc.accountNumber, {}, 'all');
        expect(sql.items.map(i => cn(i.balance))).toEqual(acc.lines.map(l => cn(l.balance)));
      }
      const table = ledgerTable(data);
      expect(table.rows.length).toBe(sum(data.accounts.map(a => a.lines.length + 2)));
    });

    it('balance : fichier = lignes + total', async () => {
      const tb = await getTrialBalanceData(A.tenantId, period);
      const table = trialBalanceTable(tb);
      expect(table.rows.length).toBe(tb.lines.length + 1);
      const csv = toCsv(table);
      expect(csv.split('\r\n').filter(Boolean).length).toBe(tb.lines.length + 2);
    });
  });
});
