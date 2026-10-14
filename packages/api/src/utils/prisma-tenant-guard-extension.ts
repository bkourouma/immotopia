import { Prisma } from '@prisma/client';
import { logger } from './logger';
import { getTenantContext } from './tenant-context';
import { env } from '../config/env';
import { AppError, ErrorCode } from '../middleware/error-middleware';

/**
 * Second line of defence against cross-tenant reads and writes.
 *
 * Every service is supposed to filter by `tenantId` itself. This extension
 * checks that it actually did: when a request is handled on behalf of a tenant
 * and a query touches a tenant-scoped model without naming a tenant in its
 * `where` (or, for `create`/`createMany`, writes a different tenant into its
 * `data`, or, for a read, returns a row belonging to another tenant), the
 * extension reacts.
 *
 * Two modes, chosen by `TENANT_GUARD_MODE` (`src/config/env.ts`):
 *   - `warn` (default) — logs the offending call and lets it through. Safe to
 *     enable everywhere; use the logs to find the gaps.
 *   - `enforce` — throws a generic 500 `AppError` (the client never sees which
 *     model or field was involved; the detail goes to the log). Turn this on
 *     once the warnings have stopped.
 *
 * Deliberately does not *inject* the filter: silently rewriting a query would
 * mask the bug and would be wrong for the platform-admin endpoints that read
 * across tenants on purpose (no context is pushed for those, see
 * `getTenantContext`).
 *
 * ---------------------------------------------------------------------------
 * D2 — which models are guarded, and how the list is built
 * ---------------------------------------------------------------------------
 *
 * The list used to be maintained by hand (47 models). It is now **derived
 * from the Prisma schema** at first use: every model in `Prisma.dmmf` that has
 * a field named `tenantId` or `tenant_id` is guarded on that field. A new
 * model that carries either field is covered automatically, with no edit
 * here.
 *
 * Three categories result from the derivation (see `deriveTenantFieldMap`):
 *   - `guarded`: model → field name. Checked by this extension.
 *   - `exempt`: has the field, but it is optional *by design* and a missing
 *     filter is not a bug. See `EXEMPT_MODELS` below.
 *   - `childrenWithoutTenantField`: no such field at all — cannot be checked
 *     by a `where` clause. See D4 below. Logged once, at debug level, the
 *     first time the map is built (`npm run dev` with `LOG_LEVEL=debug`, or
 *     any run in a non-production `NODE_ENV`, which defaults winston to
 *     `debug`).
 *
 * `Prisma.dmmf` is only present on the real generated client. Several unit
 * test suites replace `@prisma/client` with a plain mock exposing neither
 * `Prisma` nor `dmmf` (see `utils/database.ts`); `deriveTenantFieldMap` falls
 * back to an empty guarded map in that case rather than throwing at import
 * time — the same defensive posture `database.ts` already takes for
 * `$extends`.
 *
 * ---------------------------------------------------------------------------
 * D2/D3 — exemptions and per-model treatment
 * ---------------------------------------------------------------------------
 *
 * - `Tenant`, `User`, `Role`, `Permission` carry no `tenantId`/`tenant_id`
 *   field at all (they are platform-wide models): they never appear in the
 *   derived map, nothing to special-case.
 * - `UserRole.tenantId`, `AuditLog.tenantId` and `RoleMenuAccess.tenantId` are nullable **by design**: a
 *   platform-scope role (`UserRole.tenantId = null`) or a platform action
 *   (`AuditLog` written outside any agency, e.g. a super-admin login) or a
 *   platform-scope menu setting (`RoleMenuAccess.tenantId = null`) is a
 *   legitimate, expected case, not a forgotten filter. These models are listed
 *   in `EXEMPT_MODELS` and are never checked, even with a tenant context
 *   active.
 * - `DocumentTemplate.tenant_id` is nullable too (a `null` row is a global
 *   template, visible to every agency), but here a missing filter usually
 *   *is* a bug: a service reading a specific agency's templates must still
 *   name the field, typically as `OR: [{ tenant_id }, { tenant_id: null }]`.
 *   `DocumentTemplate` stays in the guarded map; `mentionsTenant` below
 *   already accepts that `OR` shape (every branch — including the
 *   `tenant_id: null` one — names the field), so no special case is needed
 *   beyond leaving it guarded.
 *
 * ---------------------------------------------------------------------------
 * D4 — children with no tenant field of their own
 * ---------------------------------------------------------------------------
 *
 * Plenty of models hang off a tenant-scoped parent without carrying the field
 * themselves — for example `SyndicateLot`, `ChargeCall`, `GeneralMeeting`,
 * `JournalEntryLine` and `SupplierInvoiceLine` (rattachés respectivement à
 * `Syndicate`, `Syndicate`, `Syndicate`, `JournalEntry`/`ChartOfAccount` et
 * `SupplierInvoice`). A `where` clause on these models has nothing to check:
 * the extension cannot see the parent's tenant from here. This is not a gap
 * this extension can close — the parent must be loaded/verified first (see
 * `utils/property-tenant-guard.ts` for the equivalent pattern on `Property`
 * children). The full, current list is derived from the schema alongside the
 * guarded map and logged once at debug level; it is informational only and
 * never blocks anything.
 *
 * ---------------------------------------------------------------------------
 * D3 — operations covered
 * ---------------------------------------------------------------------------
 *
 * `where`-based check (the `where` must name the tenant field, including
 * through `AND`/`OR`/`NOT`): `findMany`, `findFirst`, `findFirstOrThrow`,
 * `findUnique`, `findUniqueOrThrow`, `count`, `aggregate`, `groupBy`,
 * `updateMany`, `deleteMany`, `update`, `delete`, `upsert`.
 *
 * Result-based check, on top of the `where` check, for the five read
 * operations (`findUnique(OrThrow)`, `findFirst(OrThrow)`, `findMany`): if the
 * tenant field was selected and a returned row's value differs from the
 * context's tenant, that row is a leak — reported exactly like a missing
 * filter (and, in `enforce`, the leaked data is never returned: the call
 * throws instead).
 *
 * `create`/`createMany`: no `where` to check, so instead the `data` (each row,
 * for `createMany`) is checked when it names the tenant field explicitly. A
 * relation `connect` to the tenant (e.g. `tenant: { connect: { id } }`)
 * carries no top-level `tenantId`/`tenant_id` key and is invisible to this
 * check — detecting it reliably would mean walking arbitrary nested `connect`
 * shapes, which is fragile enough to be out of scope here. So: flagged only
 * when `data.tenantId`/`data.tenant_id` is present and differs from the
 * context; silent (not a false negative we can close cheaply) when the field
 * is simply absent from `data`.
 */

/** Models whose tenant field is optional by design; never checked. */
const EXEMPT_MODELS = new Set([
  'UserRole', // tenantId null = platform-scope role.
  'AuditLog', // tenantId null = action logged outside any agency context.
  // tenantId null = menu des rôles PLATFORM (super-admin hors agence), distinct de
  // toute agence et sans héritage ; les routes lisent toujours un périmètre explicite.
  'RoleMenuAccess',
  // Name collision: here `tenantId` is the RENTER (a CrmContact), not the
  // agency. The model is scoped through its lot's syndicate instead.
  'LotTenantAssignment'
]);

/** Minimal shape read out of `Prisma.dmmf.datamodel.models`. */
interface DmmfField {
  name: string;
}
interface DmmfModel {
  name: string;
  fields: DmmfField[];
}

interface TenantFieldMap {
  /** model name → tenant field name (`tenantId` or `tenant_id`), guarded. */
  guarded: Record<string, string>;
  /** model names with a tenant field that is deliberately never checked. */
  exempt: string[];
  /** model names with no tenant field at all (D4). */
  childrenWithoutTenantField: string[];
}

let cachedMap: TenantFieldMap | null = null;

/** Builds (once) and returns the schema-derived tenant field map (D2). */
function deriveTenantFieldMap(): TenantFieldMap {
  if (cachedMap) {
    return cachedMap;
  }

  const guarded: Record<string, string> = {};
  const exempt: string[] = [];
  const childrenWithoutTenantField: string[] = [];

  try {
    const models = (Prisma as unknown as { dmmf?: { datamodel?: { models?: DmmfModel[] } } })?.dmmf?.datamodel?.models;

    if (Array.isArray(models)) {
      for (const model of models) {
        const tenantField = model.fields.find(f => f.name === 'tenantId' || f.name === 'tenant_id');
        if (!tenantField) {
          childrenWithoutTenantField.push(model.name);
          continue;
        }
        if (EXEMPT_MODELS.has(model.name)) {
          exempt.push(model.name);
          continue;
        }
        guarded[model.name] = tenantField.name;
      }
    }
  } catch (error) {
    // `Prisma.dmmf` absent (mocked client in unit tests) or shaped
    // unexpectedly: guard nothing rather than fail the whole process.
    logger.warn('Tenant guard: dmmf indisponible, aucun modèle contrôlé', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  cachedMap = { guarded, exempt, childrenWithoutTenantField };

  logger.debug('Tenant guard: modèles dérivés du schéma', {
    guardedCount: Object.keys(guarded).length,
    exempt,
    childrenWithoutTenantFieldCount: childrenWithoutTenantField.length,
    childrenWithoutTenantField
  });

  return cachedMap;
}

/** Operations whose `where` clause must name the tenant field (D3). */
const WHERE_GUARDED_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
  'update',
  'delete',
  'upsert'
]);

/** Read operations whose result rows are checked against the context (D3). */
const READ_RESULT_CHECKED_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany'
]);

/** Operations whose `data` is checked for a mismatched tenant field (D3). */
const CREATE_OPERATIONS = new Set(['create', 'createMany']);

type Mode = 'off' | 'warn' | 'enforce';

function currentMode(): Mode {
  return env.TENANT_GUARD_MODE;
}

/**
 * Whether a `where` clause constrains the tenant field, including through the
 * AND / OR / NOT combinators services use.
 */
function mentionsTenant(where: unknown, field: string, depth = 0): boolean {
  if (!where || typeof where !== 'object' || depth > 5) {
    return false;
  }

  const clause = where as Record<string, unknown>;

  if (clause[field] !== undefined) {
    return true;
  }

  for (const key of ['AND', 'OR', 'NOT'] as const) {
    const branch = clause[key];
    if (Array.isArray(branch)) {
      // OR only constrains the tenant if *every* branch does.
      const check = key === 'OR' ? branch.every.bind(branch) : branch.some.bind(branch);
      if (branch.length > 0 && check((b: unknown) => mentionsTenant(b, field, depth + 1))) {
        return true;
      }
    } else if (branch && mentionsTenant(branch, field, depth + 1)) {
      return true;
    }
  }

  return false;
}

/** True when `row[field]` is present, non-null, and not the context tenant. */
function fieldNamesAnotherTenant(row: unknown, field: string, tenantId: string): boolean {
  if (!row || typeof row !== 'object') {
    return false;
  }
  const value = (row as Record<string, unknown>)[field];
  return value !== undefined && value !== null && value !== tenantId;
}

/** D3 read check: any returned row (single or array) from another tenant. */
function resultLeaksAnotherTenant(result: unknown, field: string, tenantId: string): boolean {
  if (Array.isArray(result)) {
    return result.some(row => fieldNamesAnotherTenant(row, field, tenantId));
  }
  return fieldNamesAnotherTenant(result, field, tenantId);
}

/** D3 create check: `data` (or each row of `createMany`) naming another tenant. */
function createDataNamesAnotherTenant(args: unknown, field: string, tenantId: string, operation: string): boolean {
  const data = (args as { data?: unknown })?.data;
  if (operation === 'createMany') {
    return Array.isArray(data) && data.some(row => fieldNamesAnotherTenant(row, field, tenantId));
  }
  return fieldNamesAnotherTenant(data, field, tenantId);
}

/** Three to four call-site lines, node_modules and this file filtered out (D5). */
function shortCallStack(): string[] {
  const stack = new Error().stack?.split('\n').slice(1) ?? [];
  return stack
    .filter(line => !line.includes('node_modules') && !line.includes('prisma-tenant-guard-extension'))
    .slice(0, 4)
    .map(line => line.trim());
}

interface AllOperationsArgs {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}

/**
 * Plain extension object rather than `Prisma.defineExtension(...)`.
 *
 * `defineExtension` is only a typing helper; at runtime `$extends` accepts the
 * object as-is. Avoiding it keeps this module importable in unit tests that
 * replace `@prisma/client` with a mock exposing no `Prisma` namespace.
 */
export const tenantGuardExtension = {
  name: 'tenantGuard',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }: AllOperationsArgs) {
        const mode = currentMode();
        if (mode === 'off' || !model) {
          return query(args);
        }

        const { guarded } = deriveTenantFieldMap();
        const field = guarded[model];
        if (!field) {
          return query(args);
        }

        // Outside a request (jobs, seeds, scripts) there is no tenant to check
        // against, and platform admins read across tenants by design.
        const context = getTenantContext();
        if (!context || context.isSuperAdmin) {
          return query(args);
        }

        const tenantId = context.tenantId;

        /** Report a violation: warn-and-continue, or throw a generic 500. */
        const report = (message: string, extra?: Record<string, unknown>) => {
          const detail = { model, operation, field, tenantId, callStack: shortCallStack(), ...extra };

          if (mode === 'enforce') {
            logger.error(`Tenant guard (enforce) — ${message}`, detail);
            // Client never sees the model/field involved: this is a server
            // bug, not a business-level refusal.
            throw new AppError('Erreur interne du serveur.', 500, ErrorCode.INTERNAL);
          }

          logger.warn(`Tenant guard — ${message}`, detail);
        };

        if (WHERE_GUARDED_OPERATIONS.has(operation)) {
          const where = (args as { where?: unknown })?.where;
          if (!mentionsTenant(where, field)) {
            report(`requête ${model}.${operation} sans filtre ${field}`);
          }
        }

        if (CREATE_OPERATIONS.has(operation) && createDataNamesAnotherTenant(args, field, tenantId, operation)) {
          report(`écriture ${model}.${operation} avec ${field} différent de l'agence active`);
        }

        const result = await query(args);

        if (READ_RESULT_CHECKED_OPERATIONS.has(operation) && resultLeaksAnotherTenant(result, field, tenantId)) {
          report(`lecture ${model}.${operation} a renvoyé une ligne d'une autre agence`);
        }

        return result;
      }
    }
  }
};
