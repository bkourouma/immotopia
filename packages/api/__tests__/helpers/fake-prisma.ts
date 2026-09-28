/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Petite base Prisma en mémoire, pour les tests du portail copropriétaire.
 *
 * Elle applique VRAIMENT les filtres `where` — c'est tout son intérêt : un
 * test d'isolation qui se contenterait de renvoyer ce qu'on lui a préparé ne
 * prouverait rien. Couvre le sous-ensemble dont ont besoin la garde de
 * portail, les lectures du portail, l'invitation, `requireTenantAccess` et
 * `permission-service` :
 *
 *   - opérateurs : égalité (dates comprises), `in`, `not`, `gt/gte/lt/lte`,
 *     `equals`, `AND` / `OR` / `NOT`, filtre JSON `path` + `array_contains`,
 *     et clés uniques composées (`userId_tenantId: { ... }`) ;
 *   - opérations : `findMany`, `findFirst`, `findUnique`, `count`, `create`,
 *     `update`, `updateMany`, `upsert`, `delete`, `deleteMany`, et
 *     `$transaction(fn)` (sans retour arrière sur erreur).
 *
 * Les relations dont un appelant a besoin (ex. `userRole.role.permissions`)
 * sont stockées directement dans la ligne par le test. `select` est appliqué
 * — seuls les champs demandés sortent, relations comprises (`select`
 * imbriqué) — : une réponse qui laisserait fuir un champ non sélectionné s'y
 * verrait comme sur Postgres. `include` rend la ligne entière, en appliquant
 * le `select` d'une relation incluse. `aggregate` (`_sum`, `_count`) et
 * `groupBy` (`by`, `_count`) couvrent les tableaux de bord des portails.
 */

import { randomUUID } from 'crypto';

type Row = Record<string, any>;

const OPERATORS = new Set(['in', 'notIn', 'not', 'gt', 'gte', 'lt', 'lte', 'equals', 'path', 'array_contains']);

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function same(a: any, b: any): boolean {
  if (a instanceof Date || b instanceof Date) {
    return a != null && b != null && new Date(a).getTime() === new Date(b).getTime();
  }
  if (a === undefined) return b === null || b === undefined;
  return a === b;
}

function compare(a: any, b: any): number {
  const left = a instanceof Date ? a.getTime() : a;
  const right = b instanceof Date ? b.getTime() : b;
  return left < right ? -1 : left > right ? 1 : 0;
}

function readPath(value: any, path: string[]): any {
  return path.reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), value);
}

function matchValue(actual: any, condition: any): boolean {
  if (!isPlainObject(condition)) return same(actual, condition);
  const keys = Object.keys(condition);
  if (!keys.some(key => OPERATORS.has(key))) {
    // Clé composée (`userId_tenantId: { userId, tenantId }`) : traitée à part.
    return false;
  }
  if ('path' in condition) {
    const target = readPath(actual, condition.path);
    if ('array_contains' in condition) {
      const wanted: any[] = Array.isArray(condition.array_contains)
        ? condition.array_contains
        : [condition.array_contains];
      return Array.isArray(target) && wanted.every(item => target.includes(item));
    }
    if ('equals' in condition) return same(target, condition.equals);
    return true;
  }
  for (const key of keys) {
    const expected = condition[key];
    if (expected === undefined) continue;
    switch (key) {
      case 'in':
        if (!expected.some((candidate: any) => same(actual, candidate))) return false;
        break;
      case 'notIn':
        if (expected.some((candidate: any) => same(actual, candidate))) return false;
        break;
      case 'not':
        if (isPlainObject(expected) ? matchValue(actual, expected) : same(actual, expected)) return false;
        break;
      case 'equals':
        // `mode: 'insensitive'` (Postgres via Prisma) : comparaison de
        // chaines insensible a la casse — necessaire pour les tests du
        // correctif securite invitations (recherche d'un compte existant
        // sans tenir compte de la casse de l'e-mail).
        if (condition.mode === 'insensitive' && typeof actual === 'string' && typeof expected === 'string') {
          if (actual.toLowerCase() !== expected.toLowerCase()) return false;
        } else if (!same(actual, expected)) {
          return false;
        }
        break;
      case 'gt':
        if (actual == null || compare(actual, expected) <= 0) return false;
        break;
      case 'gte':
        if (actual == null || compare(actual, expected) < 0) return false;
        break;
      case 'lt':
        if (actual == null || compare(actual, expected) >= 0) return false;
        break;
      case 'lte':
        if (actual == null || compare(actual, expected) > 0) return false;
        break;
      default:
        break;
    }
  }
  return true;
}

export function matchesWhere(row: Row, where: any): boolean {
  if (!where) return true;
  for (const [key, condition] of Object.entries(where)) {
    if (condition === undefined) continue;
    if (key === 'AND') {
      const branches = Array.isArray(condition) ? condition : [condition];
      if (!branches.every(branch => matchesWhere(row, branch))) return false;
      continue;
    }
    if (key === 'OR') {
      if (!(condition as any[]).some(branch => matchesWhere(row, branch))) return false;
      continue;
    }
    if (key === 'NOT') {
      const branches = Array.isArray(condition) ? condition : [condition];
      if (branches.some(branch => matchesWhere(row, branch))) return false;
      continue;
    }
    if (isPlainObject(condition) && !Object.keys(condition).some(k => OPERATORS.has(k))) {
      if (isPlainObject(row[key])) {
        // Filtre sur une relation stockée dans la ligne (`role: { scope }`).
        if (!matchesWhere(row[key], condition)) return false;
        continue;
      }
      if (!(key in row)) {
        // Clé unique composée : chaque sous-champ doit correspondre.
        if (!matchesWhere(row, condition)) return false;
        continue;
      }
    }
    if (!matchValue(row[key], condition)) return false;
  }
  return true;
}

function sortRows(rows: Row[], orderBy: any): Row[] {
  if (!orderBy) return rows;
  const clauses: Array<[string, 'asc' | 'desc']> = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap(
    (clause: Record<string, 'asc' | 'desc'>) => Object.entries(clause)
  );
  return [...rows].sort((a, b) => {
    for (const [field, direction] of clauses) {
      const result = compare(a[field], b[field]);
      if (result !== 0) return direction === 'desc' ? -result : result;
    }
    return 0;
  });
}

/**
 * Ecrit `data` dans la ligne, en appliquant les operations atomiques de
 * Prisma (`{ increment }`, `{ decrement }`) sur les champs numeriques.
 */
function applyData(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data ?? {})) {
    if (isPlainObject(value) && ('increment' in value || 'decrement' in value)) {
      const delta = 'increment' in value ? Number(value.increment) : -Number(value.decrement);
      row[key] = Math.round((Number(row[key] ?? 0) + delta) * 100) / 100;
      continue;
    }
    row[key] = value;
  }
}

function copy<T>(row: T): T {
  return row && typeof row === 'object' ? { ...(row as any) } : row;
}

/** Applique `select` / `include` (voir l'en-tête). */
function project(row: any, args: any): any {
  if (row === null || row === undefined || typeof row !== 'object') return row;
  if (Array.isArray(row)) return row.map(item => project(item, args));
  if (args?.select) {
    const out: Row = {};
    for (const [key, wanted] of Object.entries(args.select)) {
      if (!wanted) continue;
      out[key] = wanted === true ? row[key] : project(row[key], wanted);
    }
    return out;
  }
  if (args?.include) {
    const out: Row = { ...row };
    for (const [key, wanted] of Object.entries(args.include)) {
      if (wanted && typeof wanted === 'object') out[key] = project(row[key], wanted);
    }
    return out;
  }
  return copy(row);
}

export interface FakeModel {
  rows: Row[];
  findMany: jest.Mock;
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  count: jest.Mock;
  aggregate: jest.Mock;
  groupBy: jest.Mock;
  create: jest.Mock;
  createMany: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  upsert: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
}

function createModel(name: string): FakeModel {
  const model: any = { rows: [] as Row[] };
  const find = (args: any = {}) =>
    sortRows(
      model.rows.filter((row: Row) => matchesWhere(row, args.where)),
      args.orderBy
    );
  model.findMany = jest.fn(async (args: any = {}) => {
    const rows = find(args);
    const sliced = args.take !== undefined ? rows.slice(args.skip ?? 0, (args.skip ?? 0) + args.take) : rows;
    return sliced.map((row: Row) => project(row, args));
  });
  model.findFirst = jest.fn(async (args: any = {}) => project(find(args)[0] ?? null, args));
  model.findUnique = jest.fn(async (args: any = {}) => project(find(args)[0] ?? null, args));
  model.count = jest.fn(async (args: any = {}) => find(args).length);
  model.aggregate = jest.fn(async (args: any = {}) => {
    const rows = find(args);
    const result: Row = {};
    if (args._sum) {
      result._sum = {};
      for (const field of Object.keys(args._sum)) {
        const values = rows.map((row: Row) => row[field]).filter((value: any) => value !== null && value !== undefined);
        result._sum[field] = values.length ? values.reduce((sum: number, value: any) => sum + Number(value), 0) : null;
      }
    }
    if (args._count) result._count = rows.length;
    return result;
  });
  model.groupBy = jest.fn(async (args: any = {}) => {
    const groups = new Map<string, Row[]>();
    for (const row of find(args)) {
      const key = JSON.stringify(args.by.map((field: string) => row[field]));
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return Array.from(groups.values()).map(rows => ({
      ...Object.fromEntries(args.by.map((field: string) => [field, rows[0][field]])),
      _count: rows.length
    }));
  });
  model.create = jest.fn(async (args: any) => {
    const row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...args.data };
    model.rows.push(row);
    return project(row, args);
  });
  model.createMany = jest.fn(async (args: any) => {
    const data: Row[] = Array.isArray(args.data) ? args.data : [args.data];
    const skipDuplicates = Boolean(args.skipDuplicates);
    let created = 0;
    for (const entry of data) {
      if (
        skipDuplicates &&
        model.rows.some((row: Row) => Object.keys(entry).every(key => same(row[key], entry[key])))
      ) {
        continue;
      }
      model.rows.push({ id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...entry });
      created++;
    }
    return { count: created };
  });
  model.update = jest.fn(async (args: any) => {
    const row = model.rows.find((candidate: Row) => matchesWhere(candidate, args.where));
    if (!row) throw Object.assign(new Error(`${name}.update : aucune ligne`), { code: 'P2025' });
    applyData(row, args.data);
    row.updatedAt = new Date();
    return copy(row);
  });
  model.upsert = jest.fn(async (args: any) => {
    const row = model.rows.find((candidate: Row) => matchesWhere(candidate, args.where));
    if (row) {
      Object.assign(row, args.update, { updatedAt: new Date() });
      return project(row, args);
    }
    const created = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...args.create };
    model.rows.push(created);
    return project(created, args);
  });
  model.updateMany = jest.fn(async (args: any) => {
    const rows = model.rows.filter((candidate: Row) => matchesWhere(candidate, args.where));
    rows.forEach((row: Row) => applyData(row, args.data));
    return { count: rows.length };
  });
  model.delete = jest.fn(async (args: any) => {
    const index = model.rows.findIndex((candidate: Row) => matchesWhere(candidate, args.where));
    if (index < 0) throw Object.assign(new Error(`${name}.delete : aucune ligne`), { code: 'P2025' });
    const [row] = model.rows.splice(index, 1);
    return project(row, args);
  });
  model.deleteMany = jest.fn(async (args: any = {}) => {
    const before = model.rows.length;
    model.rows = model.rows.filter((candidate: Row) => !matchesWhere(candidate, args.where));
    return { count: before - model.rows.length };
  });
  return model as FakeModel;
}

export const FAKE_MODEL_NAMES = [
  'tenant',
  'tenantClient',
  'crmContact',
  'lotOwnerProfile',
  'syndicateLot',
  'syndicate',
  'ownerAccount',
  'ownerAccountTransaction',
  'chargeCall',
  'chargePayment',
  'chargePaymentAllocation',
  'paymentReminder',
  'syndicateDocument',
  'generalMeeting',
  'gMAgendaItem',
  'gMResolution',
  'gMVote',
  'user',
  'passwordResetToken',
  'membership',
  'userRole',
  'permission',
  'property',
  'rentalPenalty',
  'rentalLease',
  'maintenanceTicket',
  'maintenanceTicketAttachment',
  'maintenanceTicketStatusHistory',
  'maintenanceTicketComment',
  'propertyDocument',
  'rentalPaymentDeclaration',
  'propertyMedia',
  'rentalDocument',
  'rentalLeaseCoRenter',
  'rentalPayment',
  'rentalPaymentAllocation',
  // Lot S3 : recus et quittances de charges.
  'syndicChargeReceipt',
  'syndicMandatingAgency',
  // Lot S4 : programmations d'appels automatiques.
  'chargeCallBatch',
  'syndicateBudget',
  'budgetAllocation',
  'syndicPaymentMethod',
  'syndicChargeSchedule',
  'syndicChargeScheduleRun',
  // Fonds de copropriete credites par les paiements (fund-credits.ts).
  'syndicateFund',
  'syndicateFundMovement',
  'budgetLineItem',
  // Correctif securite invitations (IDOR resend/revoke, prise de compte).
  'invitation',
  'role',
  'auditLog'
] as const;

export type FakePrisma = Record<(typeof FAKE_MODEL_NAMES)[number], FakeModel> & {
  $transaction: jest.Mock;
  $executeRaw: jest.Mock;
  /**
   * Seule requete brute simulee : le compteur des numeros de recus et
   * quittances (lot S3, `nextChargeReceiptNumberTx`), cle (agence, emetteur,
   * type, annee) — les valeurs interpolees du gabarit, dans cet ordre.
   */
  $queryRaw: jest.Mock;
  receiptSequences: Map<string, number>;
  reset: () => void;
};

export function createFakePrisma(): FakePrisma {
  const fake: any = {};
  for (const name of FAKE_MODEL_NAMES) fake[name] = createModel(name);
  fake.$transaction = jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(fake) : Promise.all(arg)));
  fake.$executeRaw = jest.fn(async () => 0);
  fake.receiptSequences = new Map<string, number>();
  fake.$queryRaw = jest.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
    const key = values.slice(0, 4).join('|');
    const next = (fake.receiptSequences.get(key) ?? 0) + 1;
    fake.receiptSequences.set(key, next);
    return [{ last_value: next }];
  });
  fake.reset = () => {
    for (const name of FAKE_MODEL_NAMES) {
      fake[name].rows = [];
    }
    fake.receiptSequences.clear();
  };
  return fake as FakePrisma;
}
