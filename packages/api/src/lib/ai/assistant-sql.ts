import { Prisma } from '@prisma/client';
import { parse, type Expr } from 'pgsql-ast-parser';
import { z } from 'zod';
import { t } from '../../i18n';
import { BadRequestError } from '../../middleware/error-middleware';

type ColumnKind = 'string' | 'date' | 'currency' | 'number';
export interface AssistantSqlView {
  name: string;
  columns: Readonly<Record<string, ColumnKind>>;
}

export const sqlViews = {
  receipts: {
    name: 'rental_receipts',
    columns: { received_on: 'date', currency: 'string', amount: 'currency', method: 'string' }
  },
  installments: {
    name: 'rental_installments',
    columns: {
      due_on: 'date',
      currency: 'string',
      status: 'string',
      gross_amount: 'currency',
      allocated_amount: 'currency',
      outstanding_amount: 'currency'
    }
  }
} satisfies Record<string, AssistantSqlView>;

export const SQL_MAX_CHARS = 2_000;
const maxRows = 200;
const date = z.string().date();
const comparisons = new Set(['=', '<>', '!=', '<', '<=', '>', '>=']);
const identifier = /^[a-z][a-z0-9_]{0,39}$/;

function invalid(): never {
  throw new BadRequestError(t('Requête analytique invalide ou hors du périmètre autorisé.'));
}

function quoted(name: string): Prisma.Sql {
  if (!identifier.test(name)) invalid();
  return Prisma.raw('"' + name + '"');
}

function ref(expr: Expr): string {
  if (expr.type !== 'ref' || expr.table) invalid();
  return expr.name;
}

function column(view: AssistantSqlView, name: string) {
  if (!Object.prototype.hasOwnProperty.call(view.columns, name)) invalid();
  return { sql: quoted(name), kind: view.columns[name] };
}

function filter(view: AssistantSqlView, expr: Expr, depth = 0): Prisma.Sql {
  if (depth > 8 || expr.type !== 'binary' || expr.opSchema) invalid();
  const { op, left, right } = expr;
  if (op === 'AND' || op === 'OR')
    return Prisma.sql`(${filter(view, left, depth + 1)} ${Prisma.raw(op)} ${filter(view, right, depth + 1)})`;
  if (!comparisons.has(op)) invalid();
  const field = column(view, ref(left));
  const operator = Prisma.raw(op);
  if (field.kind === 'currency' || field.kind === 'number') {
    if ((right.type !== 'integer' && right.type !== 'numeric') || !Number.isFinite(right.value)) invalid();
    return Prisma.sql`${field.sql} ${operator} ${new Prisma.Decimal(right.value)}`;
  }
  if (right.type !== 'string' || right.value.length > 80 || right.value.includes('\0')) invalid();
  if (field.kind === 'date') {
    if (!date.safeParse(right.value).success) invalid();
    return Prisma.sql`${field.sql} ${operator} ${right.value}::date`;
  }
  return Prisma.sql`${field.sql} ${operator} ${right.value}`;
}

function selection(view: AssistantSqlView, expr: Expr) {
  if (expr.type !== 'call') {
    const name = ref(expr);
    return { ...column(view, name), name, aggregate: false };
  }
  const name = expr.function.name;
  if (
    expr.function.schema ||
    expr.args.length !== 1 ||
    expr.distinct ||
    expr.filter ||
    expr.orderBy ||
    expr.withinGroup ||
    expr.over
  )
    invalid();
  const argument = ref(expr.args[0]);
  if (name === 'count') {
    const input = argument === '*' ? Prisma.sql`*` : column(view, argument).sql;
    return { sql: Prisma.sql`pg_catalog.count(${input})`, kind: 'number' as const, name: 'count', aggregate: true };
  }
  if (name !== 'sum' && name !== 'avg') invalid();
  const field = column(view, argument);
  if (field.kind !== 'currency' && field.kind !== 'number') invalid();
  return {
    sql: Prisma.sql`${Prisma.raw('pg_catalog.' + name)}(${field.sql})`,
    kind: field.kind,
    name: name + '_' + argument,
    aggregate: true
  };
}

/** Ne transmet jamais le SQL du modèle, uniquement un fragment reconstruit à paramètres liés. */
export function compileAssistantSql(source: string, view: AssistantSqlView) {
  if (!source.trim() || source.length > SQL_MAX_CHARS) invalid();
  let statements: ReturnType<typeof parse>;
  try {
    statements = parse(source);
  } catch {
    return invalid();
  }
  const [query] = statements;
  if (
    statements.length !== 1 ||
    query?.type !== 'select' ||
    query.for ||
    query.skip ||
    query.having ||
    query.distinct ||
    query.limit?.offset
  )
    invalid();
  const [from] = query.from ?? [];
  if (
    query.from?.length !== 1 ||
    from?.type !== 'table' ||
    from.join ||
    from.lateral ||
    from.name.schema ||
    from.name.alias ||
    from.name.columnNames ||
    from.name.name !== view.name
  )
    invalid();
  if (
    !query.columns?.length ||
    query.columns.length > 12 ||
    (query.groupBy?.length ?? 0) > 5 ||
    (query.orderBy?.length ?? 0) > 5
  )
    invalid();
  const selected = query.columns.map(({ expr, alias }) => {
    const item = selection(view, expr);
    return { ...item, label: alias?.name ?? item.name };
  });
  const groups = (query.groupBy ?? []).map(ref);
  const hasAggregate = selected.some(item => item.aggregate);
  if ((hasAggregate || groups.length) && selected.some(item => !item.aggregate && !groups.includes(item.name)))
    invalid();
  if (
    selected.some(item => item.kind === 'currency') &&
    !selected.some(item => !item.aggregate && item.name === 'currency' && item.label === 'currency')
  )
    invalid();
  if (new Set(selected.map(item => item.label)).size !== selected.length) invalid();
  const order = (query.orderBy ?? []).map(({ by, order: direction, nulls }) => {
    const name = ref(by);
    const item = selected.find(candidate => candidate.label === name);
    if (!item || nulls || (direction && direction !== 'ASC' && direction !== 'DESC')) invalid();
    return Prisma.sql`${quoted(item.label)} ${direction === 'DESC' ? Prisma.sql`DESC` : Prisma.sql`ASC`}`;
  });
  const limit = query.limit?.limit;
  if (query.limit && (!limit || limit.type !== 'integer' || !Number.isSafeInteger(limit.value) || limit.value < 1))
    invalid();
  const rowLimit = limit?.type === 'integer' ? Math.min(limit.value, maxRows) : maxRows;
  const queryLimit = limit?.type === 'integer' && limit.value <= maxRows ? rowLimit : rowLimit + 1;
  const where = query.where ? Prisma.sql`WHERE ${filter(view, query.where)}` : Prisma.empty;
  const groupBy = groups.length
    ? Prisma.sql`GROUP BY ${Prisma.join(groups.map(name => column(view, name).sql))}`
    : Prisma.empty;
  const orderBy = order.length ? Prisma.sql`ORDER BY ${Prisma.join(order)}` : Prisma.empty;
  const fields = selected.map(item => Prisma.sql`${item.sql} AS ${quoted(item.label)}`);
  return {
    sql: Prisma.sql`SELECT ${Prisma.join(fields)} FROM assistant_read.${quoted(view.name)} ${where} ${groupBy} ${orderBy} LIMIT ${queryLimit}::integer`,
    columns: selected.map(({ label, kind }) => ({ key: label, label, type: kind === 'string' ? undefined : kind })),
    rowLimit
  };
}
