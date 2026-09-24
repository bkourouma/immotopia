import type { PrismaTransactionClient } from '../../utils/database';

/**
 * Résolution des noms affichés (DTO plats, `propertyLabel`, `sellerName`,
 * `buyerName`, `agentName` — voir `types.ts`).
 *
 * Même motif que `getOrCreateOwnerAccountTx` (`lib/owner-account/sync.ts`) et
 * `userNames` (`lib/treasury/service.ts`) : un vendeur ou un négociateur est un
 * `User` par `TenantClient.user`, affiché par son `fullName` sinon son
 * `email` ; un acquéreur est un `CrmContact`, affiché par sa raison sociale si
 * elle existe (contact « société »), sinon prénom + nom.
 */

export async function tenantClientNames(
  client: PrismaTransactionClient,
  tenantId: string,
  ids: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (!unique.length) return new Map();
  const rows = await client.tenantClient.findMany({
    where: { id: { in: unique }, tenantId },
    select: { id: true, user: { select: { fullName: true, email: true } } }
  });
  return new Map(rows.map(row => [row.id, row.user.fullName || row.user.email]));
}

export async function userNames(
  client: PrismaTransactionClient,
  ids: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (!unique.length) return new Map();
  const rows = await client.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, fullName: true, email: true }
  });
  return new Map(rows.map(row => [row.id, row.fullName || row.email]));
}

export async function crmContactNames(
  client: PrismaTransactionClient,
  tenantId: string,
  ids: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (!unique.length) return new Map();
  const rows = await client.crmContact.findMany({
    where: { id: { in: unique }, tenantId },
    select: { id: true, legalName: true, firstName: true, lastName: true }
  });
  return new Map(rows.map(row => [row.id, row.legalName || `${row.firstName} ${row.lastName}`.trim()]));
}

export async function propertyLabels(
  client: PrismaTransactionClient,
  tenantId: string,
  ids: Array<string | null | undefined>
): Promise<Map<string, { label: string; status: string }>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (!unique.length) return new Map();
  const rows = await client.property.findMany({
    where: { id: { in: unique }, tenantId },
    select: { id: true, title: true, internalReference: true, status: true }
  });
  return new Map(rows.map(row => [row.id, { label: row.title || row.internalReference, status: row.status }]));
}
