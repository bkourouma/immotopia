import {
  PropertyStatus,
  PropertyTransactionMode,
  PropertyType,
  RentalLeaseStatus,
  RentalPaymentMethod,
  RentalPaymentStatus,
  SaleMandateStatus
} from '@prisma/client';
import type { ChatRequest } from './contracts';
import { NotFoundError } from '../../middleware/error-middleware';
import { prisma } from '../../utils/database';
import { getPropertyForTenant } from '../../utils/property-tenant-guard';
import { logger } from '../../utils/logger';

/**
 * Contexte d'écran d'ImmoCopilot : l'écran que l'utilisateur regarde.
 *
 * Le navigateur l'envoie, donc il n'est PAS digne de confiance. Il n'atteint
 * le modèle qu'après vérification :
 * - un chemin dont l'agence n'est pas celle de la route est ignoré en bloc ;
 * - l'entité active doit exister DANS l'agence (même erreur, donc même
 *   silence, pour une entité absente et pour celle d'une autre agence) ;
 * - l'utilisateur doit détenir la permission de l'outil correspondant ;
 * - seule une référence courte, assainie, est transmise : jamais le titre ni
 *   un texte libre du bien ou du bail.
 * - les filtres des listes reconnues sont validés et restent des indications de lecture.
 * Le bloc produit est une donnée : le prompt système interdit d'y lire des
 * instructions.
 */

interface ResolvedEntityContext {
  entityType: 'PROPERTY' | 'LEASE';
  entityId: string;
  /** Référence interne du bien ou numéro de bail, assainie. */
  reference: string;
}

type ListScreen = 'properties' | 'rental_installments' | 'rental_payments' | 'rental_leases' | 'sale_mandates';
type ScreenFilters = Record<string, string | number | boolean>;

interface ResolvedListContext {
  screen: ListScreen;
  filters: ScreenFilters;
}

export type ResolvedPageContext = ResolvedEntityContext | ResolvedListContext;

const ENTITY_PERMISSION = {
  PROPERTY: 'PROPERTIES_VIEW',
  LEASE: 'RENTAL_LEASES_VIEW'
} as const;

const MAX_REFERENCE_LENGTH = 40;
const TENANT_IN_PATH = /\/tenants?\/([^/?#]+)/;

const LIST_SCREENS = new Map<string, { screen: ListScreen; permission: string; statuses: readonly string[] }>([
  ['properties', { screen: 'properties', permission: 'PROPERTIES_VIEW', statuses: Object.values(PropertyStatus) }],
  [
    'rental/installments',
    {
      screen: 'rental_installments',
      permission: 'RENTAL_INSTALLMENTS_VIEW',
      statuses: ['DUE', 'PARTIAL', 'PAID', 'OVERDUE']
    }
  ],
  [
    'rental/payments',
    {
      screen: 'rental_payments',
      permission: 'RENTAL_PAYMENTS_VIEW',
      statuses: Object.values(RentalPaymentStatus)
    }
  ],
  [
    'rental/leases',
    {
      screen: 'rental_leases',
      permission: 'RENTAL_LEASES_VIEW',
      statuses: Object.values(RentalLeaseStatus)
    }
  ],
  [
    'sales/mandates',
    {
      screen: 'sale_mandates',
      permission: 'CRM_DEALS_VIEW',
      statuses: Object.values(SaleMandateStatus)
    }
  ]
]);

function readDay(value: string | null): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined;
}

function readAmount(value: string | null): number | undefined {
  return value && /^\d{1,12}(?:\.\d{1,2})?$/.test(value) ? Number(value) : undefined;
}

function readCount(value: string | null): number | undefined {
  return value && /^\d{1,4}$/.test(value) ? Number(value) : undefined;
}

function addRange<T extends string | number>(
  filters: ScreenFilters,
  fromKey: string,
  toKey: string,
  from: T | undefined,
  to: T | undefined
): void {
  if (from !== undefined && to !== undefined && from > to) return;
  if (from !== undefined) filters[fromKey] = from;
  if (to !== undefined) filters[toKey] = to;
}

function resolveListContext(
  currentPath: string,
  tenantId: string,
  permissions: ReadonlySet<string>
): ResolvedListContext | null {
  const [pathname, query] = currentPath.split('?', 2);
  if (!query) return null;
  const route = /^\/tenant\/([^/]+)\/(.+?)\/?$/.exec(pathname);
  if (!route || route[1] !== tenantId) return null;
  const definition = LIST_SCREENS.get(route[2]);
  if (!definition || !permissions.has(definition.permission)) return null;

  const search = new URLSearchParams(query);
  const filters: ScreenFilters = {};
  const status = search.get('status');
  if (status && definition.statuses.includes(status)) filters.status = status;
  if (definition.screen === 'properties') {
    const type = search.get('propertyType');
    const mode = search.get('transactionMode');
    if (type && Object.values<string>(PropertyType).includes(type)) filters.propertyType = type;
    if (mode && Object.values<string>(PropertyTransactionMode).includes(mode)) filters.transactionMode = mode;
    addRange(filters, 'minPrice', 'maxPrice', readAmount(search.get('minPrice')), readAmount(search.get('maxPrice')));
    addRange(
      filters,
      'minBedrooms',
      'maxBedrooms',
      readCount(search.get('minBedrooms')),
      readCount(search.get('maxBedrooms'))
    );
  }
  if (definition.screen === 'rental_installments') {
    if (search.get('overdue') === '1') filters.overdue = true;
    addRange(filters, 'dueFrom', 'dueTo', readDay(search.get('dueFrom')), readDay(search.get('dueTo')));
  }
  if (definition.screen === 'rental_payments') {
    const method = search.get('method');
    if (method && Object.values<string>(RentalPaymentMethod).includes(method)) filters.method = method;
    addRange(filters, 'startDate', 'endDate', readDay(search.get('periodeFrom')), readDay(search.get('periodeTo')));
    addRange(
      filters,
      'receivedFrom',
      'receivedTo',
      readDay(search.get('receivedFrom')),
      readDay(search.get('receivedTo'))
    );
    addRange(
      filters,
      'minAmount',
      'maxAmount',
      readAmount(search.get('montantMin')),
      readAmount(search.get('montantMax'))
    );
  }
  return Object.keys(filters).length ? { screen: definition.screen, filters } : null;
}

/** Ne garde que des caractères de référence : jamais de balise, de guillemet ni de retour à la ligne. */
export function sanitizeReference(value: string): string {
  return value.replace(/[^\p{L}\p{N}._/-]+/gu, '').slice(0, MAX_REFERENCE_LENGTH);
}

/**
 * Résout le contexte d'écran ; `null` = aucun contexte exploitable (ignoré,
 * jamais une erreur : un contexte invalide ne doit pas empêcher de discuter).
 */
export async function resolvePageContext(
  context: ChatRequest['context'],
  tenantId: string,
  permissions: ReadonlySet<string>
): Promise<ResolvedPageContext | null> {
  if (!context) return null;

  const pathTenant = context.currentPath ? TENANT_IN_PATH.exec(context.currentPath)?.[1] : undefined;
  if (pathTenant && pathTenant !== tenantId) return null;

  const { activeEntityType, activeEntityId } = context;
  if (!activeEntityType || !activeEntityId) {
    return context.currentPath ? resolveListContext(context.currentPath, tenantId, permissions) : null;
  }
  if (!permissions.has(ENTITY_PERMISSION[activeEntityType])) return null;

  try {
    if (activeEntityType === 'PROPERTY') {
      const property = await getPropertyForTenant(activeEntityId, tenantId);
      return {
        entityType: 'PROPERTY',
        entityId: property.id,
        reference: sanitizeReference(String(property.internalReference ?? ''))
      };
    }
    const lease = await prisma.rentalLease.findFirst({
      where: { id: activeEntityId, tenant_id: tenantId },
      select: { id: true, lease_number: true }
    });
    if (!lease) return null;
    return { entityType: 'LEASE', entityId: lease.id, reference: sanitizeReference(lease.lease_number) };
  } catch (error) {
    if (!(error instanceof NotFoundError)) {
      logger.warn('ImmoCopilot : contexte d’écran ignoré (vérification en échec)', { tenantId, error });
    }
    return null;
  }
}

/**
 * Bloc de données placé en tête du dernier message utilisateur. Du JSON
 * sérialisé par le serveur (valeurs vérifiées), sans texte libre. La date du
 * jour vit ici et non dans le prompt système, qui reste stable. Format
 * JJ/MM/AAAA à dessein : le modèle en tire des périodes AAAA-MM lui-même.
 */
export function formatContextBlock(page: ResolvedPageContext | null, now: Date = new Date()): string {
  const today = `${String(now.getUTCDate()).padStart(2, '0')}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${now.getUTCFullYear()}`;
  const data: Record<string, string | ScreenFilters> = { today };
  if (page && 'entityType' in page) {
    data.entity_type = page.entityType;
    data.entity_id = page.entityId;
    if (page.reference) data.reference = page.reference;
  } else if (page) {
    data.screen = page.screen;
    data.filters = page.filters;
  }
  return `<screen_context>${JSON.stringify(data)}</screen_context>`;
}
