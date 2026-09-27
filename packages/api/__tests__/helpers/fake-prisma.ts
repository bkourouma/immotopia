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
 *     `update`, `updateMany`, et `$transaction(fn)`.
 *
 * `select` et `include` sont ignorés : la ligne complète est rendue. Les
 * relations dont un appelant a besoin (ex. `userRole.role.permissions`) sont
 * donc stockées directement dans la ligne par le test.
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
        if (!same(actual, expected)) return false;
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
    if (!(key in row) && isPlainObject(condition) && !Object.keys(condition).some(k => OPERATORS.has(k))) {
      // Clé unique composée : chaque sous-champ doit correspondre.
      if (!matchesWhere(row, condition)) return false;
      continue;
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

function copy<T>(row: T): T {
  return row && typeof row === 'object' ? { ...(row as any) } : row;
}

export interface FakeModel {
  rows: Row[];
  findMany: jest.Mock;
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  count: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
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
    return sliced.map(copy);
  });
  model.findFirst = jest.fn(async (args: any = {}) => copy(find(args)[0] ?? null));
  model.findUnique = jest.fn(async (args: any = {}) => copy(find(args)[0] ?? null));
  model.count = jest.fn(async (args: any = {}) => find(args).length);
  model.create = jest.fn(async (args: any) => {
    const row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...args.data };
    model.rows.push(row);
    return copy(row);
  });
  model.update = jest.fn(async (args: any) => {
    const row = model.rows.find((candidate: Row) => matchesWhere(candidate, args.where));
    if (!row) throw Object.assign(new Error(`${name}.update : aucune ligne`), { code: 'P2025' });
    Object.assign(row, args.data, { updatedAt: new Date() });
    return copy(row);
  });
  model.updateMany = jest.fn(async (args: any) => {
    const rows = model.rows.filter((candidate: Row) => matchesWhere(candidate, args.where));
    rows.forEach((row: Row) => Object.assign(row, args.data));
    return { count: rows.length };
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
  'syndicateDocument',
  'generalMeeting',
  'gMAgendaItem',
  'gMResolution',
  'gMVote',
  'user',
  'passwordResetToken',
  'membership',
  'userRole',
  'permission'
] as const;

export type FakePrisma = Record<(typeof FAKE_MODEL_NAMES)[number], FakeModel> & {
  $transaction: jest.Mock;
  $executeRaw: jest.Mock;
  reset: () => void;
};

export function createFakePrisma(): FakePrisma {
  const fake: any = {};
  for (const name of FAKE_MODEL_NAMES) fake[name] = createModel(name);
  fake.$transaction = jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(fake) : Promise.all(arg)));
  fake.$executeRaw = jest.fn(async () => 0);
  fake.reset = () => {
    for (const name of FAKE_MODEL_NAMES) {
      fake[name].rows = [];
    }
  };
  return fake as FakePrisma;
}
