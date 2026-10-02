import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { t } from '../../i18n';
import { BadRequestError, ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { env } from '../../config/env';
import { countActiveSecureLinksByObject, createSecureLink, revokeSecureLinksForObject } from '../secure-links';
import { type CreateGrantInput, type SendLinkInput, type UpdateGrantInput } from './schemas';
import { agencyPropertyWhere, entitiesInAgency, propertiesInAgencyScope, propertyIdsHeldByEntities } from './scope';
import {
  MAX_SCOPE_PROPERTIES,
  DEFAULT_SECTIONS_BY_TYPE,
  EXPIRING_WINDOW_DAYS,
  EXTERNAL_ACCESS_LINK_SCOPE,
  EXTERNAL_ACCESS_OBJECT_TYPE,
  EXTERNAL_ACCESS_SECTIONS,
  EXTERNAL_ACCESS_TYPES,
  defaultSectionsFor,
  normalizeSections,
  type ExternalAccessSectionKey
} from './sections';
import { NOT_REQUESTED, sendExternalAccessLinkEmail, type ExternalAccessEmailResult } from './mailer';

/**
 * Accès en lecture seule des tiers de confiance : API d'agence (lot B3,
 * spec 034). Chaque identifiant reçu (biens, entités, propriétaire, documents,
 * grant) est vérifié par agence avant écriture ; une référence d'une autre
 * agence lève la même `NotFoundError` qu'un objet inexistant.
 *
 * Jamais de jeton ni d'empreinte dans une réponse de liste ou de détail : le
 * jeton en clair n'est renvoyé qu'une fois, à la création du lien
 * (`link.url`), et n'est ni stocké ni journalisé. Les journaux d'audit ne
 * portent pas l'e-mail du bénéficiaire.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Clients que le formulaire propose comme « propriétaires » (clients de type
 * propriétaire, désignés sur un bail, ou indivisaires). Le MÊME filtre sert à
 * `scope-options` et à la vérification de `ownerClientId` à l'écriture.
 */
const OWNER_CLIENT_FILTER = {
  OR: [{ clientType: 'OWNER' }, { ownerLeases: { some: {} } }, { ownershipShares: { some: {} } }]
} satisfies Prisma.TenantClientWhereInput;

export type GrantStatus = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'REVOKED';

const GRANT_SUMMARY_SELECT = {
  id: true,
  type: true,
  recipientName: true,
  recipientEmail: true,
  ownerClientId: true,
  sections: true,
  expiresAt: true,
  revokedAt: true,
  viewCount: true,
  lastViewedAt: true,
  lastLinkSentAt: true,
  createdAt: true,
  // Nom seulement : jamais l'e-mail ni le téléphone du propriétaire.
  ownerClient: { select: { user: { select: { fullName: true } } } },
  _count: { select: { properties: true, entities: true, documents: true } }
} satisfies Prisma.ExternalAccessGrantSelect;

type GrantSummaryRow = Prisma.ExternalAccessGrantGetPayload<{ select: typeof GRANT_SUMMARY_SELECT }>;

export interface GrantSummary {
  id: string;
  type: string;
  recipientName: string;
  recipientEmail: string;
  ownerClientId: string | null;
  ownerName: string | null;
  sections: string[];
  expiresAt: Date | null;
  permanent: boolean;
  revokedAt: Date | null;
  status: GrantStatus;
  propertyCount: number;
  entityCount: number;
  documentCount: number;
  viewCount: number;
  lastViewedAt: Date | null;
  lastLinkSentAt: Date | null;
  activeLinkCount: number;
  createdAt: Date;
}

export interface GrantDetail extends GrantSummary {
  properties: Array<{ id: string; title: string; reference: string }>;
  entities: Array<{ id: string; name: string }>;
  documents: Array<{ id: string; propertyId: string; fileName: string }>;
}

export interface IssuedLink {
  id: string;
  /** URL complète, jeton compris : remise UNE seule fois. */
  url: string;
  expiresAt: Date;
}

export function grantStatus(
  grant: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date = new Date()
): GrantStatus {
  if (grant.revokedAt) return 'REVOKED';
  if (grant.expiresAt) {
    if (grant.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
    if (grant.expiresAt.getTime() - now.getTime() <= EXPIRING_WINDOW_DAYS * DAY_MS) return 'EXPIRING';
  }
  return 'ACTIVE';
}

function toSummary(row: GrantSummaryRow, activeLinkCount: number): GrantSummary {
  return {
    id: row.id,
    type: row.type,
    recipientName: row.recipientName,
    recipientEmail: row.recipientEmail,
    ownerClientId: row.ownerClientId,
    ownerName: row.ownerClient ? row.ownerClient.user?.fullName || t('Propriétaire') : null,
    sections: row.sections,
    expiresAt: row.expiresAt,
    permanent: row.expiresAt === null,
    revokedAt: row.revokedAt,
    status: grantStatus(row),
    propertyCount: row._count.properties,
    entityCount: row._count.entities,
    documentCount: row._count.documents,
    viewCount: row.viewCount,
    lastViewedAt: row.lastViewedAt,
    lastLinkSentAt: row.lastLinkSentAt,
    activeLinkCount,
    createdAt: row.createdAt
  };
}

function notFound(): NotFoundError {
  return new NotFoundError(t('Accès introuvable.'));
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function listExternalAccessGrants(tenantId: string): Promise<{ items: GrantSummary[] }> {
  const rows = await prisma.externalAccessGrant.findMany({
    where: { tenantId },
    select: GRANT_SUMMARY_SELECT,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 500
  });
  const activeLinks = await countActiveSecureLinksByObject(
    tenantId,
    EXTERNAL_ACCESS_LINK_SCOPE,
    EXTERNAL_ACCESS_OBJECT_TYPE,
    rows.map(row => row.id)
  );
  return { items: rows.map(row => toSummary(row, activeLinks.get(row.id) ?? 0)) };
}

export async function getExternalAccessGrantDetail(tenantId: string, grantId: string): Promise<GrantDetail> {
  const row = await prisma.externalAccessGrant.findFirst({
    where: { id: grantId, tenantId },
    select: {
      ...GRANT_SUMMARY_SELECT,
      properties: {
        select: { property: { select: { id: true, title: true, internalReference: true } } },
        orderBy: { createdAt: 'asc' }
      },
      entities: { select: { entity: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
      documents: {
        select: { propertyId: true, document: { select: { id: true, fileName: true } } },
        orderBy: { createdAt: 'asc' }
      }
    }
  });
  if (!row) throw notFound();

  const activeLinks = await countActiveSecureLinksByObject(
    tenantId,
    EXTERNAL_ACCESS_LINK_SCOPE,
    EXTERNAL_ACCESS_OBJECT_TYPE,
    [row.id]
  );
  return {
    ...toSummary(row, activeLinks.get(row.id) ?? 0),
    properties: row.properties.map(link => ({
      id: link.property.id,
      title: link.property.title,
      reference: link.property.internalReference
    })),
    entities: row.entities.map(link => ({ id: link.entity.id, name: link.entity.name })),
    documents: row.documents.map(link => ({
      id: link.document.id,
      propertyId: link.propertyId,
      fileName: link.document.fileName
    }))
  };
}

/** Données du formulaire de création : rubriques, défauts par type, propriétaires, biens, entités. */
export async function getExternalAccessScopeOptions(tenantId: string) {
  const [owners, properties, entities] = await Promise.all([
    prisma.tenantClient.findMany({
      where: { tenantId, ...OWNER_CLIENT_FILTER },
      // Nom seulement : jamais l'e-mail dans cette liste.
      select: { id: true, user: { select: { fullName: true } } },
      orderBy: { user: { fullName: 'asc' } },
      take: 500
    }),
    prisma.property.findMany({
      where: agencyPropertyWhere(tenantId),
      select: { id: true, title: true, internalReference: true, ownerUserId: true },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      take: 500
    }),
    prisma.holdingEntity.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 500
    })
  ]);

  // Propriétaire d'un bien : le client dont le compte est `ownerUserId`, à défaut
  // l'indivisaire à la plus forte quote-part. Indicatif : filtre du formulaire.
  const ownerUserIds = Array.from(new Set(properties.map(p => p.ownerUserId).filter((id): id is string => !!id)));
  const propertyIds = properties.map(p => p.id);
  const [clientsByUser, shares] = await Promise.all([
    ownerUserIds.length
      ? prisma.tenantClient.findMany({
          where: { tenantId, userId: { in: ownerUserIds } },
          select: { id: true, userId: true }
        })
      : Promise.resolve([] as Array<{ id: string; userId: string }>),
    propertyIds.length
      ? prisma.propertyOwnershipShare.findMany({
          where: { tenantId, propertyId: { in: propertyIds } },
          select: { propertyId: true, ownerClientId: true, sharePercent: true }
        })
      : Promise.resolve([] as Array<{ propertyId: string; ownerClientId: string; sharePercent: Prisma.Decimal }>)
  ]);
  const clientIdByUser = new Map(clientsByUser.map(client => [client.userId, client.id]));
  const topShare = new Map<string, { ownerClientId: string; percent: number }>();
  for (const share of shares) {
    const percent = Number(share.sharePercent);
    const current = topShare.get(share.propertyId);
    if (!current || percent > current.percent)
      topShare.set(share.propertyId, { ownerClientId: share.ownerClientId, percent });
  }

  return {
    sections: [...EXTERNAL_ACCESS_SECTIONS],
    types: [...EXTERNAL_ACCESS_TYPES],
    defaultsByType: Object.fromEntries(
      EXTERNAL_ACCESS_TYPES.map(type => [type, [...DEFAULT_SECTIONS_BY_TYPE[type]]])
    ) as Record<(typeof EXTERNAL_ACCESS_TYPES)[number], ExternalAccessSectionKey[]>,
    maxLinkTtlDays: env.SECURE_LINK_MAX_TTL_DAYS,
    owners: owners.map(owner => ({ id: owner.id, name: owner.user?.fullName || t('Propriétaire') })),
    properties: properties.map(property => ({
      id: property.id,
      title: property.title,
      reference: property.internalReference,
      ownerClientId:
        (property.ownerUserId ? clientIdByUser.get(property.ownerUserId) : undefined) ??
        topShare.get(property.id)?.ownerClientId ??
        null
    })),
    entities: entities.map(entity => ({ id: entity.id, name: entity.name }))
  };
}

/** Documents d'un bien proposés au partage : le bien doit être dans le périmètre de l'agence. */
export async function listPropertyDocumentsForSharing(tenantId: string, propertyId: string) {
  const inScope = await propertiesInAgencyScope(tenantId, [propertyId]);
  if (inScope.length === 0) throw new NotFoundError(t('Bien introuvable.'));

  const documents = await prisma.propertyDocument.findMany({
    where: { propertyId, OR: [{ tenantId }, { tenantId: null }] },
    // Jamais `filePath` ni `fileUrl`.
    select: { id: true, fileName: true, documentType: true, fileSize: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 500
  });
  return { items: documents };
}

const ACCESS_LOG_ACTIONS: Record<string, string> = {
  [AuditActionKey.EXTERNAL_ACCESS_GRANT_CREATED]: 'CREATED',
  [AuditActionKey.EXTERNAL_ACCESS_GRANT_UPDATED]: 'UPDATED',
  [AuditActionKey.EXTERNAL_ACCESS_GRANT_REVOKED]: 'REVOKED',
  [AuditActionKey.EXTERNAL_ACCESS_GRANT_LINK_SENT]: 'LINK_SENT',
  [AuditActionKey.EXTERNAL_ACCESS_GRANT_VIEWED]: 'VIEWED',
  [AuditActionKey.EXTERNAL_ACCESS_GRANT_DOCUMENT_DOWNLOADED]: 'DOCUMENT_DOWNLOADED'
};

/** Journal d'un accès, lu dans `AuditLog` : seules des clés connues sortent, jamais le payload brut. */
export async function listExternalAccessLog(tenantId: string, grantId: string, limit = 50) {
  const grant = await prisma.externalAccessGrant.findFirst({ where: { id: grantId, tenantId }, select: { id: true } });
  if (!grant) throw notFound();

  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId,
      entityType: EXTERNAL_ACCESS_OBJECT_TYPE,
      entityId: grant.id,
      actionKey: { in: Object.keys(ACCESS_LOG_ACTIONS) }
    },
    select: { id: true, actionKey: true, ipAddress: true, userAgent: true, payload: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100)
  });

  return {
    items: rows.map(row => {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const sections = Array.isArray(payload.sections)
        ? payload.sections.filter(
            (section): section is string =>
              typeof section === 'string' && (EXTERNAL_ACCESS_SECTIONS as readonly string[]).includes(section)
          )
        : undefined;
      return {
        id: row.id,
        at: row.createdAt,
        action: ACCESS_LOG_ACTIONS[row.actionKey] ?? row.actionKey,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        ...(sections && sections.length ? { sections } : {}),
        ...(typeof payload.documentName === 'string' ? { documentName: payload.documentName } : {})
      };
    })
  };
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

interface ScopeReferences {
  ownerClientId?: string | null;
  propertyIds: string[];
  entityIds: string[];
}

/** Clients proposés comme « propriétaires » par `scope-options` : le même filtre sert à l'écriture. */
async function assertOwnerClient(tenantId: string, ownerClientId: string | null | undefined): Promise<void> {
  if (!ownerClientId) return;
  const found = await prisma.tenantClient.findFirst({
    where: { id: ownerClientId, tenantId, ...OWNER_CLIENT_FILTER },
    select: { id: true }
  });
  if (!found) throw new NotFoundError(t('Propriétaire introuvable.'));
}

/**
 * Vérifie, par agence, les identifiants reçus (propriétaire, biens, entités)
 * avant écriture. Une référence d'une autre agence, hors périmètre ou
 * inexistante : même `NotFoundError`.
 */
async function assertScopeReferences(tenantId: string, refs: ScopeReferences): Promise<void> {
  await assertOwnerClient(tenantId, refs.ownerClientId);

  if (refs.propertyIds.length > 0) {
    const explicit = await propertiesInAgencyScope(tenantId, refs.propertyIds, { limit: refs.propertyIds.length });
    if (explicit.length !== refs.propertyIds.length) throw new NotFoundError(t('Bien introuvable.'));
  }

  if (refs.entityIds.length > 0) {
    const known = await entitiesInAgency(tenantId, refs.entityIds);
    if (known.length !== refs.entityIds.length) throw new NotFoundError(t('Entité introuvable.'));
  }
}

/**
 * Biens du périmètre final : liste explicite + entités développées, refiltrés
 * par agence. Au plus `MAX_SCOPE_PROPERTIES` biens (400 au-delà). Avec
 * `requireHoldings`, une entité sans aucune détention est refusée (400).
 */
async function resolveFinalScopeIds(
  tenantId: string,
  propertyIds: string[],
  entityIds: string[],
  options: { requireHoldings: boolean }
): Promise<string[]> {
  const held = await propertyIdsHeldByEntities(tenantId, entityIds);
  if (options.requireHoldings && entityIds.length > 0 && held.length === 0) {
    throw new BadRequestError(t('Cette entité ne détient aucun bien.'));
  }
  const scope = await propertiesInAgencyScope(tenantId, [...propertyIds, ...held]);
  if (scope.length === 0) throw new NotFoundError(t('Bien introuvable.'));
  if (scope.length > MAX_SCOPE_PROPERTIES) {
    throw new BadRequestError(
      t('Un accès partagé ne peut couvrir plus de {{max}} biens.', { max: MAX_SCOPE_PROPERTIES })
    );
  }
  return scope.map(property => property.id);
}

/** Parmi `documentIds`, ceux qui appartiennent à un bien du périmètre (et à l'agence) ; sans lever. */
async function findShareableDocuments(
  tenantId: string,
  scopePropertyIds: string[],
  documentIds: string[]
): Promise<Array<{ id: string; propertyId: string }>> {
  if (documentIds.length === 0) return [];
  return prisma.propertyDocument.findMany({
    where: {
      id: { in: documentIds },
      propertyId: { in: scopePropertyIds },
      OR: [{ tenantId }, { tenantId: null }]
    },
    select: { id: true, propertyId: true }
  });
}

/** Documents à partager : chacun doit appartenir à un bien du périmètre (et à l'agence). */
async function loadShareableDocuments(
  tenantId: string,
  scopePropertyIds: string[],
  documentIds: string[]
): Promise<Array<{ id: string; propertyId: string }>> {
  const documents = await findShareableDocuments(tenantId, scopePropertyIds, documentIds);
  if (documents.length !== documentIds.length) throw new NotFoundError(t('Document introuvable.'));
  return documents;
}

function assertDocumentsAllowed(sections: readonly string[], documentIds: readonly string[]): void {
  if (documentIds.length > 0 && !sections.includes('DOCUMENTS')) {
    throw new BadRequestError(t('Ajoutez la rubrique « Documents » pour partager des documents.'));
  }
}

/** Durée d'un lien : validée AVANT toute écriture ou révocation. */
function assertLinkTtl(days: number | undefined): void {
  if (days === undefined) return;
  const max = env.SECURE_LINK_MAX_TTL_DAYS;
  if (!Number.isInteger(days) || days < 1 || days > max) {
    throw new BadRequestError(t('La durée du lien doit être comprise entre 1 et {{max}} jours.', { max }));
  }
}

async function agencyNameOf(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return tenant?.name ?? '';
}

interface LinkableGrant {
  id: string;
  type: 'NOTARY' | 'ACCOUNTANT' | 'BANKER';
  recipientName: string;
  recipientEmail: string;
  expiresAt: Date | null;
}

/** Crée le lien du grant (plafonné à son expiration). */
function mintLink(tenantId: string, actorUserId: string | null, grant: LinkableGrant, linkTtlDays?: number) {
  return createSecureLink({
    tenantId,
    scope: EXTERNAL_ACCESS_LINK_SCOPE,
    objectType: EXTERNAL_ACCESS_OBJECT_TYPE,
    objectId: grant.id,
    createdByUserId: actorUserId,
    ttlDays: linkTtlDays,
    maxExpiresAt: grant.expiresAt
  });
}

/** Envoie l'e-mail demandé, met à jour `lastLinkSentAt` et journalise. Jamais de jeton ni d'adresse en journal. */
async function deliverLink(
  tenantId: string,
  actorUserId: string | null,
  grant: LinkableGrant,
  link: { id: string; url: string; expiresAt: Date },
  sendEmail: boolean
): Promise<{ link: IssuedLink; email: ExternalAccessEmailResult }> {
  let email: ExternalAccessEmailResult = NOT_REQUESTED;
  if (sendEmail) {
    email = await sendExternalAccessLinkEmail({
      tenantId,
      agencyName: await agencyNameOf(tenantId),
      recipientName: grant.recipientName,
      recipientEmail: grant.recipientEmail,
      type: grant.type,
      accessUrl: link.url,
      linkExpiresAt: link.expiresAt
    });
  }

  await prisma.externalAccessGrant.updateMany({
    where: { id: grant.id, tenantId },
    data: { lastLinkSentAt: new Date() }
  });

  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.EXTERNAL_ACCESS_GRANT_LINK_SENT,
    entityType: EXTERNAL_ACCESS_OBJECT_TYPE,
    entityId: grant.id,
    // Ni jeton, ni URL, ni adresse e-mail : l'identifiant du lien suffit.
    payload: { grantId: grant.id, linkId: link.id, emailSent: email.sent }
  });

  return { link: { id: link.id, url: link.url, expiresAt: link.expiresAt }, email };
}

export async function createExternalAccessGrant(tenantId: string, actorUserId: string | null, input: CreateGrantInput) {
  if (input.propertyIds.length === 0 && input.entityIds.length === 0) {
    throw new BadRequestError(t('Choisissez au moins un bien ou une entité.'));
  }
  assertLinkTtl(input.linkTtlDays);
  const sections = normalizeSections(input.sections ?? defaultSectionsFor(input.type));
  assertDocumentsAllowed(sections, input.documentIds);

  await assertScopeReferences(tenantId, input);
  const scopePropertyIds = await resolveFinalScopeIds(tenantId, input.propertyIds, input.entityIds, {
    requireHoldings: true
  });
  const documents = await loadShareableDocuments(tenantId, scopePropertyIds, input.documentIds);

  const grant = await prisma.$transaction(async tx => {
    const created = await tx.externalAccessGrant.create({
      data: {
        tenantId,
        type: input.type,
        recipientName: input.recipientName,
        recipientEmail: input.recipientEmail,
        ownerClientId: input.ownerClientId ?? null,
        sections,
        expiresAt: input.expiresAt ?? null,
        createdByUserId: actorUserId
      },
      select: { id: true, type: true, recipientName: true, recipientEmail: true, expiresAt: true }
    });
    if (input.propertyIds.length) {
      await tx.externalAccessGrantProperty.createMany({
        data: input.propertyIds.map(propertyId => ({ tenantId, grantId: created.id, propertyId }))
      });
    }
    if (input.entityIds.length) {
      await tx.externalAccessGrantEntity.createMany({
        data: input.entityIds.map(entityId => ({ tenantId, grantId: created.id, entityId }))
      });
    }
    if (documents.length) {
      await tx.externalAccessGrantDocument.createMany({
        data: documents.map(document => ({
          tenantId,
          grantId: created.id,
          propertyId: document.propertyId,
          documentId: document.id
        }))
      });
    }
    return created;
  });

  // La compensation ne couvre QUE la création du lien : un grant dont l'e-mail est
  // déjà parti n'est jamais supprimé (la suite ne lève pas pour un échec d'envoi).
  let link: Awaited<ReturnType<typeof mintLink>>;
  try {
    link = await mintLink(tenantId, actorUserId, grant, input.linkTtlDays);
  } catch (error) {
    await prisma.externalAccessGrant.deleteMany({ where: { id: grant.id, tenantId } });
    throw error;
  }
  // Audit « créé » seulement une fois le lien créé : jamais pour un grant supprimé par compensation.
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.EXTERNAL_ACCESS_GRANT_CREATED,
    entityType: EXTERNAL_ACCESS_OBJECT_TYPE,
    entityId: grant.id,
    payload: {
      grantId: grant.id,
      type: input.type,
      sections,
      propertyCount: input.propertyIds.length,
      entityCount: input.entityIds.length,
      documentCount: documents.length,
      permanent: !input.expiresAt
    }
  });

  const issued = await deliverLink(tenantId, actorUserId, grant, link, input.sendEmail ?? true);

  return { grant: await getExternalAccessGrantDetail(tenantId, grant.id), ...issued };
}

export async function updateExternalAccessGrant(
  tenantId: string,
  actorUserId: string | null,
  grantId: string,
  input: UpdateGrantInput
) {
  const existing = await prisma.externalAccessGrant.findFirst({
    where: { id: grantId, tenantId },
    select: {
      id: true,
      recipientEmail: true,
      sections: true,
      revokedAt: true,
      properties: { select: { propertyId: true } },
      entities: { select: { entityId: true } },
      documents: { select: { documentId: true } }
    }
  });
  if (!existing) throw notFound();
  if (existing.revokedAt) throw new ConflictError(t('Cet accès est révoqué : il ne peut plus être modifié.'));

  const sections = input.sections
    ? normalizeSections(input.sections)
    : (existing.sections as ExternalAccessSectionKey[]);
  const existingPropertyIds = existing.properties.map(row => row.propertyId);
  const existingEntityIds = existing.entities.map(row => row.entityId);
  const existingDocumentIds = existing.documents.map(row => row.documentId);
  if (input.documentIds !== undefined) assertDocumentsAllowed(sections, input.documentIds);
  // Retirer la rubrique DOCUMENTS referme aussi les partages : pas de document dormant.
  const dropDocuments = input.sections !== undefined && !sections.includes('DOCUMENTS');

  // Seuls les identifiants AJOUTÉS sont revérifiés (404 s'ils sont d'une autre agence ou hors
  // périmètre) ; ceux déjà présents mais sortis du périmètre (mandat échu...) sont élagués en silence.
  const addedPropertyIds = (input.propertyIds ?? []).filter(id => !existingPropertyIds.includes(id));
  const addedEntityIds = (input.entityIds ?? []).filter(id => !existingEntityIds.includes(id));
  await assertScopeReferences(tenantId, {
    ownerClientId: null,
    propertyIds: addedPropertyIds,
    entityIds: addedEntityIds
  });

  let finalPropertyIds = existingPropertyIds;
  if (input.propertyIds !== undefined) {
    const inScope = new Set(
      (await propertiesInAgencyScope(tenantId, input.propertyIds, { limit: input.propertyIds.length })).map(
        property => property.id
      )
    );
    finalPropertyIds = input.propertyIds.filter(id => inScope.has(id));
  }
  let finalEntityIds = existingEntityIds;
  if (input.entityIds !== undefined) {
    const inAgency = new Set(await entitiesInAgency(tenantId, input.entityIds));
    finalEntityIds = input.entityIds.filter(id => inAgency.has(id));
  }
  const scopeChanged = input.propertyIds !== undefined || input.entityIds !== undefined;
  if (scopeChanged && finalPropertyIds.length === 0 && finalEntityIds.length === 0) {
    throw new BadRequestError(t('Choisissez au moins un bien ou une entité.'));
  }

  let scopePropertyIds: string[] = [];
  let documentRows: Array<{ id: string; propertyId: string }> | null = null;
  if (scopeChanged || input.documentIds !== undefined) {
    scopePropertyIds = await resolveFinalScopeIds(tenantId, finalPropertyIds, finalEntityIds, {
      requireHoldings: input.entityIds !== undefined
    });
    if (input.documentIds !== undefined && !dropDocuments) {
      documentRows = await findShareableDocuments(tenantId, scopePropertyIds, input.documentIds);
      const found = new Set(documentRows.map(row => row.id));
      const missingAdded = input.documentIds.some(id => !existingDocumentIds.includes(id) && !found.has(id));
      if (missingAdded) throw new NotFoundError(t('Document introuvable.'));
    }
  }

  const emailChanged = input.recipientEmail !== undefined && input.recipientEmail !== existing.recipientEmail;

  // Un nouveau destinataire ne doit pas hériter des liens du précédent. Révocation AVANT
  // l'écriture du nouvel e-mail (échec fermé) : si elle échoue, rien n'a changé ; si l'écriture
  // échoue ensuite, les anciens liens sont déjà fermés (l'agence peut en renvoyer un).
  const linksRevoked = emailChanged
    ? await revokeSecureLinksForObject(tenantId, EXTERNAL_ACCESS_OBJECT_TYPE, grantId, actorUserId)
    : 0;

  await prisma.$transaction(async tx => {
    await tx.externalAccessGrant.updateMany({
      where: { id: grantId, tenantId, revokedAt: null },
      data: {
        ...(input.sections ? { sections } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
        ...(input.recipientName !== undefined ? { recipientName: input.recipientName } : {}),
        ...(input.recipientEmail !== undefined ? { recipientEmail: input.recipientEmail } : {})
      }
    });
    if (input.propertyIds !== undefined) {
      await tx.externalAccessGrantProperty.deleteMany({ where: { tenantId, grantId } });
      if (finalPropertyIds.length) {
        await tx.externalAccessGrantProperty.createMany({
          data: finalPropertyIds.map(propertyId => ({ tenantId, grantId, propertyId }))
        });
      }
    }
    if (input.entityIds !== undefined) {
      await tx.externalAccessGrantEntity.deleteMany({ where: { tenantId, grantId } });
      if (finalEntityIds.length) {
        await tx.externalAccessGrantEntity.createMany({
          data: finalEntityIds.map(entityId => ({ tenantId, grantId, entityId }))
        });
      }
    }
    if (dropDocuments) {
      await tx.externalAccessGrantDocument.deleteMany({ where: { tenantId, grantId } });
    } else if (documentRows) {
      await tx.externalAccessGrantDocument.deleteMany({ where: { tenantId, grantId } });
      if (documentRows.length) {
        await tx.externalAccessGrantDocument.createMany({
          data: documentRows.map(document => ({
            tenantId,
            grantId,
            propertyId: document.propertyId,
            documentId: document.id
          }))
        });
      }
    } else if (scopeChanged) {
      // Un document dont le bien a quitté le périmètre n'est plus partageable.
      await tx.externalAccessGrantDocument.deleteMany({
        where: { tenantId, grantId, propertyId: { notIn: scopePropertyIds } }
      });
    }
  });

  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.EXTERNAL_ACCESS_GRANT_UPDATED,
    entityType: EXTERNAL_ACCESS_OBJECT_TYPE,
    entityId: grantId,
    // Les NOMS des champs modifiés, jamais leurs valeurs (l'e-mail du bénéficiaire reste hors journal).
    payload: {
      grantId,
      changed: Object.keys(input),
      linksRevoked,
      ...(input.sections ? { sections } : {})
    }
  });

  return getExternalAccessGrantDetail(tenantId, grantId);
}

/** Révoque le grant ET tous ses liens ; idempotent. */
export async function revokeExternalAccessGrant(tenantId: string, actorUserId: string | null, grantId: string) {
  const existing = await prisma.externalAccessGrant.findFirst({
    where: { id: grantId, tenantId },
    select: { id: true, revokedAt: true }
  });
  if (!existing) throw notFound();

  if (!existing.revokedAt) {
    await prisma.externalAccessGrant.updateMany({
      where: { id: grantId, tenantId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }
  // Même sur un grant déjà révoqué : on referme tout lien resté actif.
  const linksRevoked = await revokeSecureLinksForObject(tenantId, EXTERNAL_ACCESS_OBJECT_TYPE, grantId, actorUserId);

  if (!existing.revokedAt) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.EXTERNAL_ACCESS_GRANT_REVOKED,
      entityType: EXTERNAL_ACCESS_OBJECT_TYPE,
      entityId: grantId,
      payload: { grantId, linksRevoked }
    });
  }
  return getExternalAccessGrantDetail(tenantId, grantId);
}

/** « Renvoyer un lien » : un nouveau lien pour un grant actif. */
export async function sendExternalAccessLink(
  tenantId: string,
  actorUserId: string | null,
  grantId: string,
  input: SendLinkInput
) {
  // Durée validée AVANT toute révocation : un refus ne doit rien avoir fermé.
  assertLinkTtl(input.linkTtlDays);
  const grant = await prisma.externalAccessGrant.findFirst({
    where: { id: grantId, tenantId },
    select: { id: true, type: true, recipientName: true, recipientEmail: true, expiresAt: true, revokedAt: true }
  });
  if (!grant) throw notFound();
  if (grant.revokedAt) throw new ConflictError(t('Cet accès est révoqué : aucun lien ne peut être envoyé.'));
  if (grant.expiresAt && grant.expiresAt.getTime() <= Date.now()) {
    throw new ConflictError(t('Cet accès est expiré : prolongez-le avant de renvoyer un lien.'));
  }

  if (input.revokePreviousLinks) {
    await revokeSecureLinksForObject(tenantId, EXTERNAL_ACCESS_OBJECT_TYPE, grantId, actorUserId);
  }
  const link = await mintLink(tenantId, actorUserId, grant, input.linkTtlDays);
  return deliverLink(tenantId, actorUserId, grant, link, input.sendEmail ?? true);
}
