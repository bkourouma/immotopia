/**
 * Inventaire LECTURE SEULE des liaisons croisées entre agences écrites avant
 * les correctifs d'isolation (TEN-01 et suivants).
 *
 * Trois familles sont listées :
 *  - CONTAINER_PARENT : un bien rattaché (`Property.containerParentId`) à un
 *    immeuble d'une autre agence, sans mandat actif de son agence sur cet
 *    immeuble (même règle d'accès que `childAccessWhere`, property-service) ;
 *  - SYNDICATE_LOT_PROPERTY : un lot de copropriété (`SyndicateLot.propertyId`)
 *    lié à un bien dont l'agence n'est pas celle de la copropriété ;
 *  - PROPERTY_OWNER : un bien dont le propriétaire (`Property.ownerUserId`)
 *    n'est ni membre ACTIF ni client de l'agence du bien (même règle que le
 *    contrôle d'écriture de property-service).
 *
 * Seuls des identifiants techniques sortent (bien, lot, immeuble, compte,
 * agences) : aucun nom, e-mail, adresse ni montant. Le script n'écrit, ne
 * corrige et ne supprime RIEN ; chaque ligne est à examiner à la main.
 *
 * Usage (depuis packages/api) :
 *   npm run ops:list-cross-tenant-links
 * Sur un serveur (image sans ts-node) :
 *   node dist/scripts/list-cross-tenant-links.js
 */
import { MembershipStatus } from '@prisma/client';
import { prisma, disconnectDatabase } from '../utils/database';

/** Lignes lues par page (pagination par curseur sur l'id). */
const BATCH_SIZE = 500;

export type CrossTenantLinkKind = 'CONTAINER_PARENT' | 'SYNDICATE_LOT_PROPERTY' | 'PROPERTY_OWNER';

export interface CrossTenantLink {
  kind: CrossTenantLinkKind;
  /** Enregistrement porteur de la liaison (bien enfant, lot, bien). */
  id: string;
  /** Cible de la liaison (immeuble parent, bien du lot, compte propriétaire). */
  relatedId: string;
  /** Agences concernées : celle du porteur, puis celle de la cible (`null` : sans agence). */
  tenantIds: Array<string | null>;
}

export type CrossTenantLinksClient = Pick<typeof prisma, 'property' | 'syndicateLot' | 'membership' | 'tenantClient'>;

/** Parcourt une table par pages de `BATCH_SIZE`, triées par id. */
async function forEachPage<T extends { id: string }>(
  fetchPage: (cursor: string | undefined) => Promise<T[]>,
  onPage: (rows: T[]) => Promise<void> | void
): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await fetchPage(cursor);
    if (rows.length === 0) return;
    await onPage(rows);
    if (rows.length < BATCH_SIZE) return;
    cursor = rows[rows.length - 1].id;
  }
}

function pageArgs(cursor: string | undefined) {
  return {
    orderBy: { id: 'asc' as const },
    take: BATCH_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  };
}

/** Biens rattachés à un immeuble d'une autre agence sans mandat actif de leur agence. */
export async function listContainerParentLinks(client: CrossTenantLinksClient = prisma): Promise<CrossTenantLink[]> {
  const links: CrossTenantLink[] = [];
  await forEachPage(
    cursor =>
      client.property.findMany({
        where: { containerParentId: { not: null } },
        select: {
          id: true,
          tenantId: true,
          containerParent: {
            select: {
              id: true,
              tenantId: true,
              mandates: { where: { isActive: true }, select: { tenantId: true } }
            }
          }
        },
        ...pageArgs(cursor)
      }),
    rows => {
      for (const child of rows) {
        const parent = child.containerParent;
        if (!parent || parent.tenantId === child.tenantId) continue;
        if (child.tenantId && parent.mandates.some(mandate => mandate.tenantId === child.tenantId)) continue;
        links.push({
          kind: 'CONTAINER_PARENT',
          id: child.id,
          relatedId: parent.id,
          tenantIds: [child.tenantId, parent.tenantId]
        });
      }
    }
  );
  return links;
}

/** Lots de copropriété liés à un bien d'une autre agence que la copropriété. */
export async function listSyndicateLotPropertyLinks(
  client: CrossTenantLinksClient = prisma
): Promise<CrossTenantLink[]> {
  const links: CrossTenantLink[] = [];
  await forEachPage(
    cursor =>
      client.syndicateLot.findMany({
        where: { propertyId: { not: null } },
        select: {
          id: true,
          syndicate: { select: { tenantId: true } },
          property: { select: { id: true, tenantId: true } }
        },
        ...pageArgs(cursor)
      }),
    rows => {
      for (const lot of rows) {
        if (!lot.property || lot.property.tenantId === lot.syndicate.tenantId) continue;
        links.push({
          kind: 'SYNDICATE_LOT_PROPERTY',
          id: lot.id,
          relatedId: lot.property.id,
          tenantIds: [lot.syndicate.tenantId, lot.property.tenantId]
        });
      }
    }
  );
  return links;
}

/** Biens dont le propriétaire n'est ni membre ACTIF ni client de l'agence du bien. */
export async function listPropertyOwnerLinks(client: CrossTenantLinksClient = prisma): Promise<CrossTenantLink[]> {
  const links: CrossTenantLink[] = [];
  await forEachPage(
    cursor =>
      client.property.findMany({
        where: { ownerUserId: { not: null }, tenantId: { not: null } },
        select: { id: true, tenantId: true, ownerUserId: true },
        ...pageArgs(cursor)
      }),
    async rows => {
      const userIds = [...new Set(rows.map(row => row.ownerUserId as string))];
      const tenantIds = [...new Set(rows.map(row => row.tenantId as string))];
      const [members, clients] = await Promise.all([
        client.membership.findMany({
          where: { userId: { in: userIds }, tenantId: { in: tenantIds }, status: MembershipStatus.ACTIVE },
          select: { userId: true, tenantId: true }
        }),
        client.tenantClient.findMany({
          where: { userId: { in: userIds }, tenantId: { in: tenantIds } },
          select: { userId: true, tenantId: true }
        })
      ]);
      const allowed = new Set([...members, ...clients].map(link => `${link.userId}:${link.tenantId}`));
      for (const row of rows) {
        if (allowed.has(`${row.ownerUserId}:${row.tenantId}`)) continue;
        links.push({
          kind: 'PROPERTY_OWNER',
          id: row.id,
          relatedId: row.ownerUserId as string,
          tenantIds: [row.tenantId]
        });
      }
    }
  );
  return links;
}

export async function listCrossTenantLinks(client: CrossTenantLinksClient = prisma): Promise<CrossTenantLink[]> {
  const containerParents = await listContainerParentLinks(client);
  const syndicateLots = await listSyndicateLotPropertyLinks(client);
  const owners = await listPropertyOwnerLinks(client);
  return [...containerParents, ...syndicateLots, ...owners];
}

export function formatReport(links: CrossTenantLink[]): string[] {
  const lines = links.map(
    link =>
      `${link.kind}\t${link.id}\tcible : ${link.relatedId}\tagences : ${link.tenantIds
        .map(tenantId => tenantId ?? '(aucune)')
        .join(' -> ')}`
  );
  const kinds: CrossTenantLinkKind[] = ['CONTAINER_PARENT', 'SYNDICATE_LOT_PROPERTY', 'PROPERTY_OWNER'];
  for (const kind of kinds) {
    lines.push(`Total ${kind} : ${links.filter(link => link.kind === kind).length}`);
  }
  lines.push(`Total : ${links.length} liaison(s) croisée(s)`);
  return lines;
}

async function main(): Promise<void> {
  try {
    const links = await listCrossTenantLinks();
    for (const line of formatReport(links)) console.log(line);
  } finally {
    await disconnectDatabase();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
