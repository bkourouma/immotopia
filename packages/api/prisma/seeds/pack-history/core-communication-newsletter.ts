/**
 * Newsletters (listes, abonnés, modèles, campagnes) des packs Syndic, Promoteur
 * et Patrimoine, écrites directement en base : rien n'est envoyé.
 *
 * - IDEMPOTENT par bloc : un modèle, une liste ou une campagne qui existe déjà
 *   (même nom / même objet dans l'agence) est sauté ; jamais de purge ;
 * - aucune campagne SCHEDULED (le job d'envoi du staging l'enverrait vraiment) ;
 * - listes dynamiques (propriétaires, locataires, contacts CRM) : l'application
 *   calcule les destinataires à la volée et ne lit jamais `newsletter_subscribers`
 *   pour elles, MAIS l'onglet « Abonnés » de la liste lit cette table et afficherait
 *   0 alors que le compteur annonce N. On écrit donc, pour chaque liste dynamique,
 *   une ligne d'abonné miroir par destinataire (sourceEntityType renseigné) : les
 *   compteurs et l'envoi restent ceux du service, et l'onglet montre les mêmes
 *   personnes. (Anomalie de l'application : l'onglet devrait résoudre les
 *   destinataires comme le fait `resolveRecipients`.)
 */
import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import { between, pick } from './types';
import type { HistoryContext } from './types';
import { randomPerson, slugify } from './agence-data';
import { addDays } from './agence-commercial-data';
import { newsletterContent } from './core-communication-content';
import type { CampaignDef, ListDef } from './core-communication-content';

interface Member {
  email: string;
  name: string;
  since: Date;
  sourceType: string;
  sourceId?: string;
}

function hex(rng: () => number, length: number): string {
  let out = '';
  while (out.length < length)
    out += Math.floor(rng() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
  return out.slice(0, length);
}

function personalize(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => vars[k] ?? '');
}

const WEB_DOMAINS = ['mail-ci.test', 'courrier-ci.test', 'webmail-abidjan.test'] as const;

export async function seedNewsletterForPack(ctx: HistoryContext, pack: string): Promise<void> {
  const { prisma, tenantId, rng, end, start, log } = ctx;
  const content = newsletterContent(pack);
  if (!content) {
    // Agence et Opérateur intégré : newsletters déjà faites, on ne répare que l'onglet « Abonnés ».
    await mirrorDerivedLists(ctx);
    return;
  }

  const members = await prisma.membership.findMany({
    where: { tenantId, status: 'ACTIVE' },
    select: { userId: true }
  });
  const staff = Array.from(new Set([ctx.adminUserId, ...members.map(m => m.userId)]));
  const tag = tenantId.replace(/-/g, '').slice(0, 6);

  // ─────────────────────────────────────────────────────────────── modèles
  const templateIds: string[] = [];
  let newTemplates = 0;
  for (const t of content.templates) {
    const existing = await prisma.newsletterTemplate.findUnique({
      where: { tenantId_name: { tenantId, name: t.name } },
      select: { id: true }
    });
    if (existing) {
      templateIds.push(existing.id);
      continue;
    }
    const row = await prisma.newsletterTemplate.create({
      data: { tenantId, name: t.name, html: t.html, createdAt: addDays(start, between(rng, 5, 40)) },
      select: { id: true }
    });
    templateIds.push(row.id);
    newTemplates += 1;
  }

  // ───────────────────────────────────────────────────────────────── listes
  const listIds = new Map<string, string>();
  const listCreated = new Map<string, Date>();
  let newLists = 0;
  let newSubscribers = 0;
  for (const def of content.lists) {
    const existing = await prisma.newsletterList.findUnique({
      where: { tenantId_name: { tenantId, name: def.name } },
      select: { id: true, createdAt: true }
    });
    if (existing) {
      listIds.set(def.key, existing.id);
      listCreated.set(def.key, existing.createdAt);
      continue;
    }
    const created = addDays(end, -def.ago);
    if (def.type === 'FROM_RENTERS') await grantRenterConsent(ctx);
    const candidates = await resolveMembers(ctx, def, tag);
    if (candidates.length === 0) {
      log(`core-communication newsletter : liste « ${def.name} » ignorée (aucune source pour l'instant).`);
      continue;
    }

    const list = await prisma.newsletterList.create({
      data: {
        tenantId,
        name: def.name,
        type: def.type,
        doubleOptIn: def.doubleOptIn,
        publicSubscribeToken: def.type === 'MANUAL' ? `lst_${hex(rng, 32)}` : null,
        createdAt: created
      },
      select: { id: true }
    });
    listIds.set(def.key, list.id);
    listCreated.set(def.key, created);
    newLists += 1;
    newSubscribers += await writeSubscribers(ctx, def, list.id, created, candidates);
  }

  // ───────────────────────────────────────────────────────────── campagnes
  let sent = 0;
  let drafts = 0;
  let cancelled = 0;
  let recipientRows = 0;
  for (const def of content.campaigns) {
    const listId = listIds.get(def.listKey);
    if (!listId) continue;
    const existing = await prisma.newsletterCampaign.count({ where: { tenantId, subject: def.subject } });
    if (existing > 0) continue;
    const result = await writeCampaign(ctx, def, {
      listId,
      templateId: templateIds[def.templateIndex],
      templateHtml: content.templates[def.templateIndex].html,
      staff
    });
    if (result.skipped) continue;
    if (def.status === 'SENT') sent += 1;
    else if (def.status === 'DRAFT') drafts += 1;
    else cancelled += 1;
    recipientRows += result.recipients;
  }
  const mirrored = await mirrorDerivedLists(ctx);
  log(
    `core-communication newsletter : ${mirrored} abonnés miroirs, ${newTemplates} modèles, ${newLists} listes, ${newSubscribers} abonnés, ` +
      `${sent} campagnes envoyées (${recipientRows} destinataires), ${drafts} brouillons, ${cancelled} annulée(s).`
  );
}

/** Consentement des locataires à la lettre (comme l'Agence : une large majorité). */
async function grantRenterConsent(ctx: HistoryContext): Promise<void> {
  const { prisma, tenantId, rng } = ctx;
  const renters = await prisma.tenantClient.findMany({
    where: { tenantId, clientType: 'RENTER', newsletterConsent: false },
    select: { id: true },
    orderBy: { id: 'asc' }
  });
  const ids = renters.filter(() => rng() < 0.82).map(r => r.id);
  if (ids.length > 0)
    await prisma.tenantClient.updateMany({ where: { id: { in: ids } }, data: { newsletterConsent: true } });
}

async function resolveMembers(ctx: HistoryContext, def: ListDef, tag: string): Promise<Member[]> {
  const { prisma, tenantId, rng, end } = ctx;
  const src = def.source;
  const out: Member[] = [];
  const contactMember = (c: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    legalName: string | null;
    createdAt: Date;
  }): Member => ({
    email: c.email,
    name: c.legalName ? c.legalName : `${c.firstName} ${c.lastName}`,
    since: c.createdAt,
    sourceType: 'CRM_CONTACT',
    sourceId: c.id
  });
  const contactSelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    legalName: true,
    createdAt: true
  } as const;

  switch (src.kind) {
    case 'DERIVED': {
      if (def.type === 'FROM_RENTERS') {
        const renters = await prisma.tenantClient.findMany({
          where: { tenantId, clientType: 'RENTER', newsletterConsent: true },
          select: { id: true, createdAt: true, user: { select: { email: true, fullName: true } } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
        });
        for (const r of renters)
          out.push({
            email: r.user.email,
            name: r.user.fullName ?? 'Locataire',
            since: r.createdAt,
            sourceType: 'TENANT_CLIENT',
            sourceId: r.id
          });
      } else if (def.type === 'FROM_CRM_CONTACTS') {
        const contacts = await prisma.crmContact.findMany({
          where: { tenantId, consentEmail: true },
          select: contactSelect,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
        });
        out.push(...contacts.map(contactMember));
      } else if (def.type === 'FROM_OWNERS') {
        const owners = await prisma.tenantClient.findMany({
          where: { tenantId, clientType: 'OWNER', newsletterConsent: true },
          select: { id: true, createdAt: true, user: { select: { email: true, fullName: true } } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
        });
        for (const o of owners)
          out.push({
            email: o.user.email,
            name: o.user.fullName ?? 'Propriétaire',
            since: o.createdAt,
            sourceType: 'TENANT_CLIENT',
            sourceId: o.id
          });
      }
      return out;
    }
    case 'CRM_ROLE': {
      const contacts = await prisma.crmContact.findMany({
        where: {
          tenantId,
          consentEmail: true,
          status: { not: 'ARCHIVED' },
          roles: { some: { role: { in: src.roles as Prisma.EnumCrmContactRoleTypeFilter['in'] } } }
        },
        select: contactSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: src.limit
      });
      return contacts.map(contactMember);
    }
    case 'CRM_TAGS': {
      const contacts = await prisma.crmContact.findMany({
        where: {
          tenantId,
          consentEmail: true,
          status: { not: 'ARCHIVED' },
          tags: { some: { tag: { name: { in: src.tags } } } }
        },
        select: contactSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: src.limit
      });
      return contacts.map(contactMember);
    }
    case 'CRM_ACTIVE': {
      const contacts = await prisma.crmContact.findMany({
        where: { tenantId, consentEmail: true, status: 'ACTIVE_CLIENT' },
        select: contactSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: src.limit
      });
      if (contacts.length > 0) return contacts.map(contactMember);
      return webPeople(rng, end, def, src.fallbackWeb, tag);
    }
    case 'WEB':
      return webPeople(rng, end, def, src.count, tag);
    case 'COMPANIES': {
      for (const name of src.names) {
        const slug = slugify(name);
        out.push({
          email: `contact@${slug}.test`,
          name,
          since: addDays(end, -between(rng, 40, def.ago - 20)),
          sourceType: 'IMPORT'
        });
      }
      return out;
    }
  }
}

function webPeople(rng: () => number, end: Date, def: ListDef, count: number, tag: string): Member[] {
  const out: Member[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    const person = randomPerson(rng);
    const email = `${slugify(person.firstName)}.${slugify(person.lastName)}${i + 1}@${pick(rng, WEB_DOMAINS)}`;
    if (seen.has(email)) continue;
    seen.add(email);
    // Quelques inscriptions très récentes pour que le tableau de bord « ce mois-ci » vive.
    const recent = i < 3;
    out.push({
      email,
      name: `${person.firstName} ${person.lastName}`,
      since: recent ? addDays(end, -between(rng, 1, 25)) : addDays(end, -between(rng, 8, Math.max(20, def.ago - 5))),
      sourceType: 'PUBLIC_FORM'
    });
  }
  void tag;
  return out;
}

async function writeSubscribers(
  ctx: HistoryContext,
  def: ListDef,
  listId: string,
  listCreatedAt: Date,
  candidates: Member[]
): Promise<number> {
  const { prisma, tenantId, rng, end } = ctx;
  const derived = def.source.kind === 'DERIVED';
  let pending = 0;
  let unsub = 0;
  const rows: Prisma.NewsletterSubscriberCreateManyInput[] = [];
  const seen = new Set<string>();
  for (const m of candidates) {
    const email = m.email.trim().toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    const base = m.since > listCreatedAt ? m.since : listCreatedAt;
    const subscribedAt = new Date(Math.min(addDays(base, between(rng, 0, 20)).getTime(), end.getTime() - 3_600_000));
    let status: 'ACTIVE' | 'PENDING_CONFIRMATION' | 'UNSUBSCRIBED' = 'ACTIVE';
    if (!derived) {
      const r = rng();
      if (def.doubleOptIn && r < 0.06 && pending < 5) {
        status = 'PENDING_CONFIRMATION';
        pending += 1;
      } else if (r < 0.16 && unsub < Math.max(2, Math.floor(candidates.length * 0.1)) && m.sourceType !== 'IMPORT') {
        status = 'UNSUBSCRIBED';
        unsub += 1;
      }
    }
    // Une personne en attente de confirmation s'est inscrite très récemment.
    const at = status === 'PENDING_CONFIRMATION' ? addDays(end, -between(rng, 1, 4)) : subscribedAt;
    rows.push({
      tenantId,
      listId,
      email,
      name: m.name,
      status,
      confirmationToken: status === 'PENDING_CONFIRMATION' ? hex(rng, 64) : null,
      confirmationTokenExpiresAt: status === 'PENDING_CONFIRMATION' ? addDays(end, 3) : null,
      subscribedAt: at,
      confirmedAt: status === 'PENDING_CONFIRMATION' ? null : at,
      unsubscribedAt:
        status === 'UNSUBSCRIBED'
          ? new Date(Math.min(addDays(at, between(rng, 25, 240)).getTime(), end.getTime() - 86_400_000))
          : null,
      sourceEntityType: m.sourceType,
      sourceEntityId: m.sourceId ?? null,
      createdAt: at
    });
  }
  await prisma.newsletterSubscriber.createMany({ data: rows, skipDuplicates: true });
  return rows.length;
}

async function writeCampaign(
  ctx: HistoryContext,
  def: CampaignDef,
  env: { listId: string; templateId: string; templateHtml: string; staff: string[] }
): Promise<{ skipped: boolean; recipients: number }> {
  const { prisma, tenantId, rng, end } = ctx;
  const sentAt = def.sentAgo === null ? null : addDays(end, -def.sentAgo);
  const createdAt =
    def.status === 'SENT' && sentAt
      ? addDays(sentAt, -between(rng, 1, 5))
      : def.status === 'CANCELLED' && sentAt
        ? addDays(sentAt, 0)
        : addDays(end, -between(rng, 2, 12));

  let eligible: { id: string; email: string; name: string | null; subscribedAt: Date }[] = [];
  if (def.status === 'SENT' && sentAt) {
    const active = await prisma.newsletterSubscriber.findMany({
      where: { tenantId, listId: env.listId, status: 'ACTIVE' },
      select: { id: true, email: true, name: true, subscribedAt: true },
      orderBy: [{ subscribedAt: 'asc' }, { id: 'asc' }]
    });
    eligible = active.filter(s => s.subscribedAt <= sentAt);
    if (eligible.length < 6) eligible = active.slice(0, Math.min(6, active.length));
    if (eligible.length === 0) return { skipped: true, recipients: 0 };
  }

  const first = eligible[0];
  const campaign = await prisma.newsletterCampaign.create({
    data: {
      tenantId,
      listId: env.listId,
      templateId: env.templateId,
      subject: def.subject,
      bodyHtml: def.bodyHtml,
      renderedHtml:
        def.status === 'SENT' && first
          ? personalize(personalize(env.templateHtml, { contenu: def.bodyHtml }), {
              prenom: (first.name ?? '').split(/\s+/)[0] || 'Madame, Monsieur',
              lien_desinscription: 'https://app.immotopia.cloud/newsletter/unsubscribe'
            })
          : null,
      status: def.status,
      // Jamais SCHEDULED. Une campagne annulée garde la date d'envoi qui avait été choisie.
      scheduledAt:
        def.status === 'CANCELLED'
          ? addDays(end, -(def.sentAgo ?? 30) + 3)
          : def.status === 'SENT' && rng() < 0.4 && sentAt
            ? addDays(createdAt, 1)
            : null,
      sentAt: def.status === 'SENT' ? sentAt : null,
      createdById: pick(rng, env.staff),
      createdAt
    },
    select: { id: true }
  });
  if (def.status !== 'SENT' || !sentAt) return { skipped: false, recipients: 0 };

  const failRate = def.failRate ?? 0.03;
  const rows = eligible.map(m => {
    const failed = rng() < failRate;
    const opened = !failed && rng() < def.openRate;
    const at = new Date(sentAt.getTime() + between(rng, 1, 40) * 60_000);
    return {
      campaignId: campaign.id,
      tenantId,
      email: m.email,
      subscriberId: m.id,
      status: failed ? ('FAILED' as const) : ('SENT' as const),
      sentAt: failed ? null : at,
      openedAt: opened ? new Date(at.getTime() + between(rng, 20, 4000) * 60_000) : null,
      failureReason: failed ? 'Boîte de réception pleine ou adresse inexistante (rejet du serveur distant).' : null,
      unsubscribeToken: createHash('sha256').update(`${campaign.id}:${m.email}:u`).digest('hex'),
      openToken: createHash('sha256').update(`${campaign.id}:${m.email}:o`).digest('hex')
    };
  });
  await prisma.newsletterCampaignRecipient.createMany({ data: rows });
  return { skipped: false, recipients: rows.length };
}

/**
 * Répare l'onglet « Abonnés » des listes dynamiques déjà créées sans lignes d'abonnés
 * (Agence, Opérateur intégré) : une ligne miroir par destinataire résolu. Saute toute
 * liste dynamique qui a déjà au moins un abonné.
 */
async function mirrorDerivedLists(ctx: HistoryContext): Promise<number> {
  const { prisma, tenantId } = ctx;
  const lists = await prisma.newsletterList.findMany({
    where: { tenantId, type: { in: ['FROM_OWNERS', 'FROM_RENTERS', 'FROM_CRM_CONTACTS'] } },
    select: { id: true, name: true, type: true, doubleOptIn: true, createdAt: true }
  });
  let total = 0;
  for (const l of lists) {
    if ((await prisma.newsletterSubscriber.count({ where: { listId: l.id } })) > 0) continue;
    const def: ListDef = {
      key: l.id,
      name: l.name,
      type: l.type,
      doubleOptIn: l.doubleOptIn,
      ago: 0,
      source: { kind: 'DERIVED' }
    };
    const members = await resolveMembers(ctx, def, '');
    total += await writeSubscribers(ctx, def, l.id, l.createdAt, members);
  }
  return total;
}
