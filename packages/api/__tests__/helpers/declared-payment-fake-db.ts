/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Base Prisma en mémoire pour les suites de lecture du paiement déclaré
 * (spec 047, `declaration-alerts` et `declaration-queries`).
 *
 * Comme `fake-prisma.ts`, elle applique VRAIMENT les filtres `where` (un test
 * d'isolation qui renverrait ce qu'on a préparé ne prouverait rien), et elle
 * applique `select` (seuls les champs demandés sortent : un `passwordHash`
 * stocké sur un utilisateur ne sort que s'il est sélectionné). En plus de
 * `fake-prisma.ts` elle comprend :
 *   - `lines: { some, every }` sur les déclarations ;
 *   - `where` imbriqué dans un `select` de relation ;
 *   - `orderBy` avec `{ sort, nulls }` ;
 * Les relations (`lines`, `lot`, `allocations`) sont stockées dans la ligne.
 */

import { matchesWhere } from './fake-prisma';

type Row = Record<string, any>;

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

/** `where` d'une déclaration : traite `lines` à la main, le reste par `matchesWhere`. */
function matches(row: Row, where: any): boolean {
  if (!where) return true;
  const { lines, ...rest } = where;
  if (!matchesWhere(row, rest)) return false;
  if (lines === undefined) return true;
  // Chaque ligne voit sa déclaration (`declaration: { createdAt }`), comme la relation Prisma.
  const own: Row[] = (row.lines ?? []).map((line: Row) => ({ ...line, declaration: row }));
  if (lines.some && !own.some(line => matchesWhere(line, lines.some))) return false;
  if (lines.every && !own.every(line => matchesWhere(line, lines.every))) return false;
  return true;
}

function project(row: any, select: any): any {
  if (!select) return { ...row };
  if (Array.isArray(row)) return row.map(item => project(item, select));
  const out: Row = {};
  for (const [key, wanted] of Object.entries(select)) {
    if (!wanted) continue;
    if (wanted === true) {
      out[key] = row[key];
      continue;
    }
    const value = row[key];
    if (Array.isArray(value)) {
      const filtered = (wanted as any).where
        ? value.filter((item: Row) => matchesWhere(item, (wanted as any).where))
        : value;
      out[key] = filtered.map((item: Row) => project(item, (wanted as any).select));
    } else {
      out[key] = value == null ? value : project(value, (wanted as any).select);
    }
  }
  return out;
}

function orderRows(rows: Row[], orderBy: any): Row[] {
  if (!orderBy) return rows;
  const clauses: Array<[string, any]> = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((clause: Row) =>
    Object.entries(clause)
  );
  const value = (v: any) => (v instanceof Date ? v.getTime() : v);
  return [...rows].sort((a, b) => {
    for (const [field, spec] of clauses) {
      const direction = isObject(spec) ? spec.sort : spec;
      const nullsLast = isObject(spec) && spec.nulls === 'last';
      const left = value(a[field]);
      const right = value(b[field]);
      if (left == null || right == null) {
        if (left == null && right == null) continue;
        if (nullsLast) return left == null ? 1 : -1;
        return left == null ? -1 : 1;
      }
      if (left === right) continue;
      const result = left < right ? -1 : 1;
      return direction === 'desc' ? -result : result;
    }
    return 0;
  });
}

function model(name: string) {
  const self: any = { name, rows: [] as Row[] };
  const find = (args: any = {}) =>
    orderRows(
      self.rows.filter((row: Row) => matches(row, args.where)),
      args.orderBy
    );
  self.findMany = jest.fn(async (args: any = {}) => {
    const rows = find(args);
    const skip = args.skip ?? 0;
    const sliced = args.take !== undefined ? rows.slice(skip, skip + args.take) : rows.slice(skip);
    return sliced.map((row: Row) => project(row, args.select));
  });
  self.findFirst = jest.fn(async (args: any = {}) => {
    const row = find(args)[0];
    return row ? project(row, args.select) : null;
  });
  self.count = jest.fn(async (args: any = {}) => find(args).length);
  return self;
}

export const DECLARED_FAKE_MODELS = [
  'syndicate',
  'syndicPaymentDeclaration',
  'syndicDeclaredPaymentSettings',
  'chargeCall',
  'syndicateLot',
  'chargePayment',
  'chargePaymentAllocation',
  'lotOwnerProfile',
  'syndicateBudget',
  'crmContact',
  'user',
  'syndicChargeReceipt'
] as const;

export type DeclaredFakeDb = Record<(typeof DECLARED_FAKE_MODELS)[number], ReturnType<typeof model>> & {
  reset: () => void;
};

export function createDeclaredFakeDb(): DeclaredFakeDb {
  const db: any = {};
  for (const name of DECLARED_FAKE_MODELS) db[name] = model(name);
  db.reset = () => {
    for (const name of DECLARED_FAKE_MODELS) {
      db[name].rows = [];
      for (const method of ['findMany', 'findFirst', 'count']) db[name][method].mockClear();
    }
  };
  return db as DeclaredFakeDb;
}
