/**
 * Accès externes en lecture seule donnés à des tiers de confiance (notaire,
 * comptable, banquier) : accès en cours, bientôt échus, échus, révoqués et
 * permanents, avec leurs biens, leurs documents partagés, leurs liens sécurisés
 * et le journal des consultations lu par l'écran « Accès partagés ».
 *
 * Aucun e-mail n'est envoyé : les envois de lien sont de simples lignes d'historique.
 */
import { Prisma } from '@prisma/client';
import { generateToken, hashToken } from '../../../src/lib/secure-links/token';
import { between } from './types';
import { pickOne, plusDays } from './agence-locatif-base';
import type { LocatifBase } from './agence-locatif-base';

type GrantType = 'NOTARY' | 'ACCOUNTANT' | 'BANKER';
type Section = 'VALUATIONS' | 'YIELD_RATIOS' | 'LOANS' | 'EXPENSES' | 'RENTS' | 'DOCUMENTS' | 'TITLES_OWNERSHIP';

interface GrantPlan {
  type: GrantType;
  recipientName: string;
  recipientEmail: string;
  sections: Section[];
  createdDaysAgo: number;
  expiresInDays: number | null;
  revokedDaysAgo?: number;
  views: number;
  lastViewedDaysAgo: number | null;
  sentDaysAgo: number;
}

const PLANS: GrantPlan[] = [
  {
    type: 'NOTARY',
    recipientName: 'Me Adjoua Koffi — Étude Koffi & Associés',
    recipientEmail: 'etude.koffi@example.ci',
    sections: ['TITLES_OWNERSHIP', 'DOCUMENTS', 'VALUATIONS'],
    createdDaysAgo: 35,
    expiresInDays: 47,
    views: 4,
    lastViewedDaysAgo: 6,
    sentDaysAgo: 35
  },
  {
    type: 'ACCOUNTANT',
    recipientName: 'Mariam Sidibé — Cabinet Sidibé Audit & Conseil',
    recipientEmail: 'm.sidibe@example.ci',
    sections: ['EXPENSES', 'RENTS', 'LOANS'],
    createdDaysAgo: 300,
    expiresInDays: null,
    views: 31,
    lastViewedDaysAgo: 2,
    sentDaysAgo: 28
  },
  {
    type: 'BANKER',
    recipientName: 'Yves Gbané — Banque du Plateau, agence Cocody',
    recipientEmail: 'y.gbane@example.ci',
    sections: ['VALUATIONS', 'YIELD_RATIOS', 'LOANS'],
    createdDaysAgo: 55,
    expiresInDays: 5,
    views: 9,
    lastViewedDaysAgo: 3,
    sentDaysAgo: 12
  },
  {
    type: 'NOTARY',
    recipientName: 'Me Seydou Bamba — Étude Bamba',
    recipientEmail: 'etude.bamba@example.ci',
    sections: ['TITLES_OWNERSHIP', 'DOCUMENTS'],
    createdDaysAgo: 110,
    expiresInDays: -20,
    views: 3,
    lastViewedDaysAgo: 40,
    sentDaysAgo: 110
  },
  {
    type: 'ACCOUNTANT',
    recipientName: 'Cabinet Diaby Expertise Comptable',
    recipientEmail: 'contact.diaby@example.ci',
    sections: ['EXPENSES', 'RENTS'],
    createdDaysAgo: 200,
    expiresInDays: 160,
    revokedDaysAgo: 40,
    views: 14,
    lastViewedDaysAgo: 41,
    sentDaysAgo: 150
  },
  {
    type: 'BANKER',
    recipientName: 'Aïcha Ouattara — Banque de l’Atlantique Ivoirienne',
    recipientEmail: 'a.ouattara@example.ci',
    sections: ['VALUATIONS', 'YIELD_RATIOS'],
    createdDaysAgo: 400,
    expiresInDays: -150,
    views: 6,
    lastViewedDaysAgo: 170,
    sentDaysAgo: 400
  },
  {
    type: 'ACCOUNTANT',
    recipientName: 'Fabrice Yapi — Yapi Gestion & Fiscalité',
    recipientEmail: 'f.yapi@example.ci',
    sections: ['EXPENSES', 'RENTS', 'LOANS'],
    createdDaysAgo: 80,
    expiresInDays: 20,
    views: 11,
    lastViewedDaysAgo: 1,
    sentDaysAgo: 18
  },
  {
    type: 'NOTARY',
    recipientName: 'Me Clarisse Gnamien — Office notarial Gnamien',
    recipientEmail: 'office.gnamien@example.ci',
    sections: ['TITLES_OWNERSHIP', 'DOCUMENTS', 'VALUATIONS'],
    createdDaysAgo: 12,
    expiresInDays: 90,
    views: 2,
    lastViewedDaysAgo: 4,
    sentDaysAgo: 12
  },
  {
    type: 'BANKER',
    recipientName: 'Koffi Bédié — Caisse d’Épargne du Plateau',
    recipientEmail: 'k.bedie@example.ci',
    sections: ['VALUATIONS', 'LOANS'],
    createdDaysAgo: 30,
    expiresInDays: 60,
    revokedDaysAgo: 5,
    views: 1,
    lastViewedDaysAgo: 8,
    sentDaysAgo: 30
  }
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
];

/** Partage les documents des biens d'un accès « Documents » qui n'en porte encore aucun. */
async function linkMissingDocuments(base: LocatifBase): Promise<number> {
  const { prisma, tenantId } = base.ctx;
  const grants = await prisma.externalAccessGrant.findMany({
    where: { tenantId, sections: { has: 'DOCUMENTS' }, documents: { none: {} } },
    select: { id: true, createdAt: true, properties: { select: { propertyId: true } } }
  });
  let linked = 0;
  for (const grant of grants) {
    const documents = await prisma.propertyDocument.findMany({
      where: { tenantId, propertyId: { in: grant.properties.map(p => p.propertyId) } },
      select: { id: true, propertyId: true },
      take: 6,
      orderBy: { createdAt: 'asc' }
    });
    if (documents.length === 0) continue;
    await prisma.externalAccessGrantDocument.createMany({
      data: documents.map(d => ({
        tenantId,
        grantId: grant.id,
        propertyId: d.propertyId,
        documentId: d.id,
        createdAt: grant.createdAt
      })),
      skipDuplicates: true
    });
    linked += documents.length;
  }
  return linked;
}

export async function seedExternalAccess(base: LocatifBase): Promise<void> {
  const { prisma, tenantId, rng, end, log } = base.ctx;
  if ((await prisma.externalAccessGrant.count({ where: { tenantId } })) > 0) {
    // Les documents de biens peuvent avoir été déposés après les accès : on rattache ceux qui manquent.
    const linked = await linkMissingDocuments(base);
    log(`accès externes : déjà présents, bloc sauté (${linked} documents rattachés).`);
    return;
  }

  // Biens par propriétaire (quote-part), du plus doté au moins doté.
  const shares = await prisma.propertyOwnershipShare.findMany({
    where: { tenantId },
    select: { propertyId: true, ownerClientId: true }
  });
  const byOwner = new Map<string, string[]>();
  for (const s of shares) byOwner.set(s.ownerClientId, [...(byOwner.get(s.ownerClientId) ?? []), s.propertyId]);
  const owners = Array.from(byOwner.entries()).sort((a, b) => b[1].length - a[1].length);
  if (owners.length === 0) {
    log('accès externes : aucun propriétaire avec biens, bloc sauté.');
    return;
  }

  let grants = 0;
  let links = 0;
  let audits = 0;
  for (let i = 0; i < PLANS.length; i++) {
    const plan = PLANS[i];
    const [ownerClientId, ownerProperties] = owners[i % owners.length];
    const propertyIds = ownerProperties.slice(0, between(rng, 2, 6));
    const createdAt = plusDays(end, -plan.createdDaysAgo);
    const expiresAt = plan.expiresInDays === null ? null : plusDays(end, plan.expiresInDays);
    const revokedAt = plan.revokedDaysAgo ? plusDays(end, -plan.revokedDaysAgo) : null;
    const lastLinkSentAt = plusDays(end, -plan.sentDaysAgo);
    const lastViewedAt = plan.lastViewedDaysAgo === null ? null : plusDays(end, -plan.lastViewedDaysAgo);
    const author = pickOne(rng, base.signers).id;

    const grant = await prisma.externalAccessGrant.create({
      data: {
        tenantId,
        type: plan.type,
        recipientName: plan.recipientName,
        recipientEmail: plan.recipientEmail,
        ownerClientId,
        sections: plan.sections,
        expiresAt,
        revokedAt,
        createdByUserId: author,
        viewCount: plan.views,
        lastViewedAt,
        lastLinkSentAt,
        createdAt,
        updatedAt: revokedAt ?? lastViewedAt ?? createdAt
      },
      select: { id: true }
    });
    grants += 1;

    await prisma.externalAccessGrantProperty.createMany({
      data: propertyIds.map(propertyId => ({ tenantId, grantId: grant.id, propertyId, createdAt })),
      skipDuplicates: true
    });

    // Documents partagés : ceux que l'agence a déposés sur ces biens, s'il y en a.
    let documentNames: string[] = [];
    if (plan.sections.includes('DOCUMENTS')) {
      const documents = await prisma.propertyDocument.findMany({
        where: { tenantId, propertyId: { in: propertyIds } },
        select: { id: true, propertyId: true, fileName: true },
        take: 6,
        orderBy: { createdAt: 'asc' }
      });
      if (documents.length > 0) {
        await prisma.externalAccessGrantDocument.createMany({
          data: documents.map(d => ({
            tenantId,
            grantId: grant.id,
            propertyId: d.propertyId,
            documentId: d.id,
            createdAt
          })),
          skipDuplicates: true
        });
        documentNames = documents.map(d => d.fileName);
      }
    }

    // Liens sécurisés : l'envoi initial, et un renvoi pour les accès les plus anciens.
    const linkDates = [createdAt];
    if (plan.createdDaysAgo > 60) linkDates.push(plusDays(end, -Math.min(plan.sentDaysAgo, plan.createdDaysAgo - 10)));
    for (const sentAt of linkDates) {
      const natural = plusDays(sentAt, 14);
      const cap = expiresAt && expiresAt.getTime() < natural.getTime() ? expiresAt : natural;
      await prisma.secureLink.create({
        data: {
          tenantId,
          scope: 'EXTERNAL_ACCESS_GRANT',
          objectType: 'ExternalAccessGrant',
          objectId: grant.id,
          tokenHash: hashToken(generateToken()),
          expiresAt: cap,
          revokedAt: revokedAt && sentAt.getTime() < revokedAt.getTime() ? revokedAt : null,
          createdByUserId: author,
          viewCount: Math.max(1, Math.round(plan.views / linkDates.length)),
          lastViewedAt: lastViewedAt,
          createdAt: sentAt,
          updatedAt: sentAt
        }
      });
      links += 1;
    }

    // Journal des consultations (lu depuis les journaux d'audit).
    const audit = (
      actionKey: string,
      at: Date,
      payload: Record<string, unknown>,
      external: boolean
    ): Prisma.AuditLogCreateManyInput => ({
      actorUserId: external ? null : author,
      tenantId,
      actionKey,
      entityType: 'ExternalAccessGrant',
      entityId: grant.id,
      ipAddress: external ? `41.${between(rng, 66, 207)}.${between(rng, 0, 255)}.${between(rng, 1, 254)}` : null,
      userAgent: external ? pickOne(rng, USER_AGENTS) : null,
      payload: payload as Prisma.InputJsonValue,
      createdAt: at,
      scope: 'TENANT',
      visibility: 'TENANT',
      category: 'DATA',
      outcome: 'SUCCESS',
      actorType: external ? 'SYSTEM' : 'USER',
      actorLabel: external
        ? plan.recipientName
        : (base.signers.find(s => s.id === author)?.name ?? base.signers[0].name),
      source: external ? 'http' : 'script'
    });
    const entries: Prisma.AuditLogCreateManyInput[] = [
      audit(
        'EXTERNAL_ACCESS_GRANT_CREATED',
        createdAt,
        { grantId: grant.id, type: plan.type, sections: plan.sections },
        false
      ),
      audit('EXTERNAL_ACCESS_GRANT_LINK_SENT', lastLinkSentAt, { grantId: grant.id }, false)
    ];
    const viewLogs = Math.min(plan.views, 8);
    for (let v = 0; v < viewLogs; v++) {
      const span = Math.max(1, (lastViewedAt ?? createdAt).getTime() - createdAt.getTime());
      const at = new Date((lastViewedAt ?? createdAt).getTime() - (span * (viewLogs - 1 - v)) / Math.max(1, viewLogs));
      entries.push(audit('EXTERNAL_ACCESS_GRANT_VIEWED', at, { grantId: grant.id, sections: plan.sections }, true));
      if (documentNames.length > 0 && v % 3 === 1) {
        entries.push(
          audit(
            'EXTERNAL_ACCESS_GRANT_DOCUMENT_DOWNLOADED',
            new Date(at.getTime() + 90_000),
            { grantId: grant.id, documentName: documentNames[v % documentNames.length] },
            true
          )
        );
      }
    }
    if (revokedAt) entries.push(audit('EXTERNAL_ACCESS_GRANT_REVOKED', revokedAt, { grantId: grant.id }, false));
    await prisma.auditLog.createMany({ data: entries });
    audits += entries.length;
  }
  log(`accès externes : ${grants} accès, ${links} liens sécurisés, ${audits} lignes de journal.`);
}
