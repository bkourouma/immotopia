import { logger } from './logger';
import { getTenantContext } from './tenant-context';

/**
 * Second line of defence against cross-tenant reads and writes.
 *
 * Every service is supposed to filter by `tenantId` itself. This extension
 * checks that it actually did: when a request is handled on behalf of a tenant
 * and a query touches a tenant-scoped model without naming a tenant in its
 * `where`, the extension reacts.
 *
 * Two modes, chosen by `TENANT_GUARD_MODE`:
 *   - `warn` (default) — logs the offending call and lets it through. Safe to
 *     enable everywhere; use the logs to find the gaps.
 *   - `enforce` — throws. Turn this on once the warnings have stopped.
 *
 * Deliberately does not *inject* the filter: silently rewriting a query would
 * mask the bug and would be wrong for the platform-admin endpoints that read
 * across tenants on purpose.
 */

/** Models whose rows belong to exactly one tenant, keyed by their filter field. */
const TENANT_FIELD_BY_MODEL: Record<string, string> = {
  // camelCase tenantId
  Property: 'tenantId',
  PropertyMedia: 'tenantId',
  PropertyDocument: 'tenantId',
  PropertyStatusHistory: 'tenantId',
  PropertyVisit: 'tenantId',
  PropertyMandate: 'tenantId',
  CrmContact: 'tenantId',
  CrmDeal: 'tenantId',
  CrmActivity: 'tenantId',
  CrmTag: 'tenantId',
  CrmDealProperty: 'tenantId',
  Syndicate: 'tenantId',
  OwnerStatement: 'tenantId',
  AgencyFinanceSettings: 'tenantId',
  OwnerManagementTerms: 'tenantId',
  LeaseManagementTerms: 'tenantId',
  AgentCommissionRate: 'tenantId',
  ManagementFee: 'tenantId',
  OwnerPayout: 'tenantId',
  LeaseInspection: 'tenantId',
  LeaseInspectionPhoto: 'tenantId',
  LeaseEvent: 'tenantId',
  PropertyOwnershipShare: 'tenantId',
  CashSession: 'tenantId',
  PropertyLoan: 'tenantId',
  PropertyExpense: 'tenantId',
  PropertyValuation: 'tenantId',
  Membership: 'tenantId',
  TenantClient: 'tenantId',
  Invitation: 'tenantId',
  Invoice: 'tenantId',
  // Lot 9 : ventes immobilieres.
  SaleMandate: 'tenantId',
  SaleOffer: 'tenantId',
  SaleAgreement: 'tenantId',
  SaleAgreementCondition: 'tenantId',
  SalePaymentMilestone: 'tenantId',
  SaleCommission: 'tenantId',
  SaleCommissionPayment: 'tenantId',

  // snake_case tenant_id (rental / maintenance / document modules)
  RentalLease: 'tenant_id',
  RentalInstallment: 'tenant_id',
  RentalPayment: 'tenant_id',
  RentalPenalty: 'tenant_id',
  RentalDocument: 'tenant_id',
  RentalSecurityDeposit: 'tenant_id',
  MaintenanceTicket: 'tenant_id',
  MaintenanceVendor: 'tenant_id',
  DocumentTemplate: 'tenant_id'
};

/** Operations that read or write a set of rows rather than one addressed by id. */
const GUARDED_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany'
]);

type Mode = 'off' | 'warn' | 'enforce';

function currentMode(): Mode {
  const raw = (process.env.TENANT_GUARD_MODE || 'warn').toLowerCase();
  return raw === 'off' || raw === 'enforce' ? raw : 'warn';
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

        const field = TENANT_FIELD_BY_MODEL[model];
        if (!field || !GUARDED_OPERATIONS.has(operation)) {
          return query(args);
        }

        // Outside a request (jobs, seeds, scripts) there is no tenant to check
        // against, and platform admins read across tenants by design.
        const context = getTenantContext();
        if (!context || context.isSuperAdmin) {
          return query(args);
        }

        const where = (args as { where?: unknown })?.where;
        if (mentionsTenant(where, field)) {
          return query(args);
        }

        const message = `Requête ${model}.${operation} sans filtre ${field} alors qu'un contexte tenant est actif`;

        if (mode === 'enforce') {
          throw new Error(message);
        }

        logger.warn('Tenant guard: unscoped query', {
          model,
          operation,
          field,
          tenantId: context.tenantId
        });

        return query(args);
      }
    }
  }
};
