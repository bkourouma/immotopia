/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Petit Prisma en memoire pour les tests de la messagerie (menu lot 3).
 * Il implemente seulement ce que lib/messaging utilise : filtres scalaires
 * (equals, in, not, contains, lt/lte/gt/gte), AND / OR, relations a un
 * (`user`, `conversation`) et a plusieurs (`participants.some`), select
 * imbrique (avec `where`), orderBy, skip / take, creation imbriquee et
 * contraintes d'unicite (code P2002).
 */

type Row = Record<string, any>;
type Table = Row[];

const RELATIONS: Record<string, Record<string, { table: string; local: string; foreign: string; many?: boolean }>> = {
  membership: { user: { table: 'user', local: 'userId', foreign: 'id' } },
  tenantClient: { user: { table: 'user', local: 'userId', foreign: 'id' } },
  conversationParticipant: {
    user: { table: 'user', local: 'userId', foreign: 'id' },
    conversation: { table: 'conversation', local: 'conversationId', foreign: 'id' }
  },
  conversation: {
    participants: { table: 'conversationParticipant', local: 'id', foreign: 'conversationId', many: true }
  }
};

const UNIQUES: Record<string, string[][]> = {
  conversation: [['tenantId', 'directKey']],
  conversationParticipant: [['conversationId', 'userId']]
};

/** Appels de verrou (`$queryRaw ... FOR UPDATE`) et crochet de test pour simuler une insertion concurrente. */
export const locks: { calls: Array<{ sql: string; values: any[] }>; onLock: (() => void) | null } = {
  calls: [],
  onLock: null
};

export const tables: Record<string, Table> = {};
/** Compteurs d'appels, pour verifier qu'une liste n'emet pas une requete par ligne. */
export const stats = { findFirst: 0, groupBy: 0, findMany: 0 };
let seq = 0;

export function resetFake(): void {
  for (const name of [
    'user',
    'membership',
    'tenantClient',
    'conversation',
    'conversationParticipant',
    'message',
    'userNotification'
  ]) {
    tables[name] = [];
  }
  seq = 0;
  locks.calls = [];
  locks.onLock = null;
  stats.findFirst = 0;
  stats.groupBy = 0;
  stats.findMany = 0;
}
resetFake();

const isPlainObject = (v: any) => v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v);

function eq(a: any, b: any): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function cmp(a: any, b: any): number {
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  return x < y ? -1 : x > y ? 1 : 0;
}

function matchScalar(value: any, cond: any): boolean {
  if (!isPlainObject(cond)) return eq(value ?? null, cond);
  return Object.entries(cond).every(([op, arg]) => {
    switch (op) {
      case 'equals':
        return eq(value ?? null, arg);
      case 'in':
        return (arg as any[]).some(a => eq(a, value));
      case 'not':
        return isPlainObject(arg) ? !matchScalar(value, arg) : !eq(value ?? null, arg);
      case 'contains':
        return typeof value === 'string' && value.toLowerCase().includes(String(arg).toLowerCase());
      case 'mode':
        return true;
      case 'lt':
        return value != null && cmp(value, arg) < 0;
      case 'lte':
        return value != null && cmp(value, arg) <= 0;
      case 'gt':
        return value != null && cmp(value, arg) > 0;
      case 'gte':
        return value != null && cmp(value, arg) >= 0;
      default:
        throw new Error(`fake prisma: operateur non gere ${op}`);
    }
  });
}

function related(model: string, row: Row, key: string): Row | Row[] | null {
  const rel = RELATIONS[model]?.[key];
  if (!rel) return null;
  const rows = tables[rel.table].filter(r => eq(r[rel.foreign], row[rel.local]));
  return rel.many ? rows : (rows[0] ?? null);
}

function matches(model: string, row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (Array.isArray(cond) ? cond : [cond]).every((c: Row) => matches(model, row, c));
    if (key === 'OR') return (cond as Row[]).some(c => matches(model, row, c));
    if (key === 'NOT') return !matches(model, row, cond);
    const rel = RELATIONS[model]?.[key];
    if (rel) {
      const target = related(model, row, key);
      if (rel.many) {
        const some = (cond as Row).some;
        return (target as Row[]).some(r => matches(rel.table, r, some));
      }
      return target !== null && matches(rel.table, target as Row, cond as Row);
    }
    return matchScalar(row[key], cond);
  });
}

function project(model: string, row: Row, select: Row | undefined): Row {
  if (!select) return { ...row };
  const out: Row = {};
  for (const [key, spec] of Object.entries(select)) {
    if (!spec) continue;
    const rel = RELATIONS[model]?.[key];
    if (rel) {
      const target = related(model, row, key);
      const sub = isPlainObject(spec) ? (spec as Row) : {};
      if (rel.many) {
        out[key] = (target as Row[])
          .filter(r => matches(rel.table, r, sub.where))
          .map(r => project(rel.table, r, sub.select));
      } else {
        out[key] = target ? project(rel.table, target as Row, sub.select) : null;
      }
    } else {
      out[key] = row[key];
    }
  }
  return out;
}

function sortRows(rows: Row[], orderBy: any): Row[] {
  const specs: Row[] = orderBy ? (Array.isArray(orderBy) ? orderBy : [orderBy]) : [];
  return [...rows].sort((a, b) => {
    for (const spec of specs) {
      const [field, dirSpec] = Object.entries(spec)[0] as [string, any];
      const dir = typeof dirSpec === 'string' ? dirSpec : dirSpec.sort;
      const nullsLast = typeof dirSpec === 'object' && dirSpec.nulls === 'last';
      const av = a[field] ?? null;
      const bv = b[field] ?? null;
      if (av === null || bv === null) {
        if (av === bv) continue;
        const aFirst = nullsLast ? av !== null : av === null;
        return aFirst ? -1 : 1;
      }
      const c = cmp(av, bv);
      if (c !== 0) return dir === 'desc' ? -c : c;
    }
    return 0;
  });
}

function checkUnique(model: string, data: Row): void {
  for (const fields of UNIQUES[model] ?? []) {
    if (fields.some(f => data[f] == null)) continue;
    const clash = tables[model].some(r => fields.every(f => eq(r[f], data[f])));
    if (clash) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  }
}

function insert(model: string, data: Row): Row {
  const { participants, ...scalar } = data;
  const row: Row = {
    id: `${model}-${String(++seq).padStart(6, '0')}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    leftAt: null,
    deletedAt: null,
    lastReadAt: null,
    readAt: null,
    ...scalar
  };
  if (model === 'conversationParticipant') row.joinedAt = scalar.joinedAt ?? new Date();
  if (model === 'conversation') {
    row.lastMessageAt = null;
    row.title = scalar.title ?? null;
    row.directKey = scalar.directKey ?? null;
  }
  checkUnique(model, row);
  tables[model].push(row);
  for (const p of participants?.create ?? []) insert('conversationParticipant', { ...p, conversationId: row.id });
  return row;
}

function delegate(model: string) {
  return {
    findMany: async (args: Row = {}) => {
      stats.findMany += 1;
      let rows = sortRows(
        tables[model].filter(r => matches(model, r, args.where)),
        args.orderBy
      );
      if (args.skip) rows = rows.slice(args.skip);
      if (args.take !== undefined) rows = rows.slice(0, args.take);
      return rows.map(r => project(model, r, args.select));
    },
    findFirst: async (args: Row = {}) => {
      stats.findFirst += 1;
      const rows = sortRows(
        tables[model].filter(r => matches(model, r, args.where)),
        args.orderBy
      );
      return rows[0] ? project(model, rows[0], args.select) : null;
    },
    findUnique: async (args: Row) => {
      const row = tables[model].find(r => matches(model, r, args.where));
      return row ? project(model, row, args.select) : null;
    },
    count: async (args: Row = {}) => tables[model].filter(r => matches(model, r, args.where)).length,
    // Agregat minimal : `by` + `_count._all`. Compte aussi les appels (voir `stats`).
    groupBy: async (args: Row) => {
      stats.groupBy += 1;
      const by: string[] = args.by;
      const groups = new Map<string, Row>();
      for (const r of tables[model].filter(x => matches(model, x, args.where))) {
        const key = by.map(f => String(r[f])).join('|');
        const g = groups.get(key) ?? { ...Object.fromEntries(by.map(f => [f, r[f]])), _count: { _all: 0 } };
        g._count._all += 1;
        groups.set(key, g);
      }
      return [...groups.values()];
    },
    create: async (args: Row) => project(model, insert(model, args.data), args.select),
    updateMany: async (args: Row) => {
      const rows = tables[model].filter(r => matches(model, r, args.where));
      for (const r of rows) Object.assign(r, args.data, { updatedAt: new Date() });
      return { count: rows.length };
    }
  };
}

export const fakePrisma: Record<string, any> = {
  /** Transaction en memoire : meme client, avec retour arriere des tables si le callback leve. */
  $transaction: async (fn: (tx: any) => Promise<any>) => {
    const snapshot = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.map(r => ({ ...r }))]));
    try {
      return await fn(fakePrisma);
    } catch (error) {
      for (const [k, v] of Object.entries(snapshot)) tables[k] = v;
      throw error;
    }
  },
  /** Tag de gabarit : on retient le SQL et les valeurs (verrou de ligne), sans l'executer. */
  $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
    locks.calls.push({ sql: strings.join('?'), values });
    locks.onLock?.();
    return [];
  },
  user: delegate('user'),
  membership: delegate('membership'),
  tenantClient: delegate('tenantClient'),
  conversation: delegate('conversation'),
  conversationParticipant: delegate('conversationParticipant'),
  message: delegate('message'),
  userNotification: delegate('userNotification')
};

// --- aides de mise en place -------------------------------------------------

export function addUser(id: string, opts: { fullName?: string | null; isActive?: boolean } = {}): void {
  tables.user.push({
    id,
    email: `${id}@exemple.test`,
    fullName: opts.fullName === undefined ? `Nom ${id}` : opts.fullName,
    isActive: opts.isActive ?? true,
    passwordHash: 'SECRET'
  });
}

export function addStaff(tenantId: string, id: string, opts: { status?: string; isActive?: boolean } = {}): void {
  if (!tables.user.some(u => u.id === id)) addUser(id, { isActive: opts.isActive });
  tables.membership.push({ id: `m-${tenantId}-${id}`, tenantId, userId: id, status: opts.status ?? 'ACTIVE' });
}

export function addClient(tenantId: string, id: string, opts: { isActive?: boolean } = {}): void {
  if (!tables.user.some(u => u.id === id)) addUser(id, { isActive: opts.isActive });
  tables.tenantClient.push({ id: `c-${tenantId}-${id}`, tenantId, userId: id });
}
