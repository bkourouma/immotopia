import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';

/**
 * Quels tickets de maintenance un client de portail voit-il ? Une seule
 * source pour la liste, le résumé, le détail, les commentaires et les pièces
 * jointes de chaque portail.
 *
 * ---------------------------------------------------------------------------
 * Portail locataire
 * ---------------------------------------------------------------------------
 *
 * Le portail ne connaît que son `TenantClient` (le compte qui ouvre la
 * session) et le bail actif que la garde a résolu (`requireTenantPortalAccess`).
 * Mais `maintenance_tickets.tenant_contact_id` et `created_by_contact_id`
 * référencent `crm_contacts` (clé étrangère) : la création depuis le portail y
 * enregistre la fiche CRM du locataire (`resolveTenantPortalCrmContactId`), ou
 * rien quand aucune fiche ne correspond. Jusqu'ici, la liste et le détail
 * filtraient pourtant sur `tenant_contact_id = TenantClient.id` — une valeur
 * que la clé étrangère interdit d'enregistrer : un locataire ne voyait aucun de
 * ses tickets, pas même ceux qu'il venait de déposer.
 *
 * Un ticket de l'agence est au locataire :
 *   - s'il porte sur son bail actif (`lease_id`) — la clé de tout le reste du
 *     portail (échéances, paiements, dépôt), et celle que la création
 *     enregistre toujours, fiche CRM ou pas ; les colocataires d'un même bail
 *     voient donc les mêmes tickets, comme ils voient les mêmes échéances ;
 *   - ou s'il est rattaché à sa fiche CRM, comme contact locataire ou comme
 *     déclarant — ce qui couvre un ticket saisi par l'agence pour lui sans
 *     bail, ou sur un bail précédent.
 * Aucune donnée existante ne porte `TenantClient.id` dans ces colonnes (la clé
 * étrangère l'en empêche) : la règle n'a rien à rattraper, aucune migration.
 *
 * ---------------------------------------------------------------------------
 * Portail propriétaire
 * ---------------------------------------------------------------------------
 *
 * Un ticket de l'agence portant sur un des biens résolus par
 * `requireOwnerPortalAccess` (propriété directe ou bail dont il est bailleur).
 */

export interface TenantPortalContext {
  tenantId: string;
  tenantClientId: string;
  leaseId: string;
}

export interface TenantPortalTicketScope {
  tenantId: string;
  leaseId: string;
  crmContactId?: string;
}

/**
 * Fiche CRM du locataire connecté. Les deux tables n'ont aucun lien
 * structurel : l'adresse e-mail du compte est la seule correspondance. On la
 * suit, dans l'agence du portail, et on rend `undefined` quand aucune fiche ne
 * répond.
 */
export async function resolveTenantPortalCrmContactId(
  tenantId: string,
  tenantClientId: string
): Promise<string | undefined> {
  const client = await prisma.tenantClient.findFirst({
    where: { id: tenantClientId, tenantId },
    select: { user: { select: { email: true } } }
  });

  const email = client?.user?.email?.trim();
  if (!email) {
    return undefined;
  }

  const contact = await prisma.crmContact.findFirst({
    where: {
      tenantId,
      email: { equals: email, mode: 'insensitive' }
    },
    select: { id: true }
  });

  if (!contact) {
    logger.warn('Aucune fiche CRM pour ce locataire du portail', { tenantId, tenantClientId });
    return undefined;
  }

  return contact.id;
}

/** Filtre Prisma des tickets du locataire (voir l'en-tête). */
export function tenantPortalTicketWhere(scope: TenantPortalTicketScope): Prisma.MaintenanceTicketWhereInput {
  const mine: Prisma.MaintenanceTicketWhereInput[] = [{ lease_id: scope.leaseId }];
  if (scope.crmContactId) {
    mine.push({ tenant_contact_id: scope.crmContactId }, { created_by_contact_id: scope.crmContactId });
  }
  return { tenant_id: scope.tenantId, OR: mine };
}

/** Le filtre, fiche CRM résolue. */
export async function tenantPortalTicketFilter(
  portal: TenantPortalContext
): Promise<Prisma.MaintenanceTicketWhereInput> {
  const crmContactId = await resolveTenantPortalCrmContactId(portal.tenantId, portal.tenantClientId);
  return tenantPortalTicketWhere({ tenantId: portal.tenantId, leaseId: portal.leaseId, crmContactId });
}

const ticketIdSchema = z.string().uuid();

/**
 * Le ticket `ticketId` s'il est visible dans ce portail, sinon `null` — y
 * compris pour un identifiant mal formé.
 */
export async function findTenantPortalTicket(
  portal: TenantPortalContext,
  ticketId: string
): Promise<{ id: string } | null> {
  if (!ticketIdSchema.safeParse(ticketId).success) return null;
  const visibility = await tenantPortalTicketFilter(portal);
  return prisma.maintenanceTicket.findFirst({
    where: { AND: [visibility, { id: ticketId, tenant_id: portal.tenantId }] },
    select: { id: true }
  });
}

/** Portail propriétaire : filtre Prisma des tickets de ses biens. */
export function ownerPortalTicketWhere(portal: {
  tenantId: string;
  propertyIds: string[];
}): Prisma.MaintenanceTicketWhereInput {
  return { tenant_id: portal.tenantId, property_id: { in: portal.propertyIds } };
}
