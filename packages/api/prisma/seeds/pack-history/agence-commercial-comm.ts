/**
 * Communication de l'agence « 3 ans » : newsletters (listes, abonnés, modèles,
 * campagnes envoyées avec leurs ouvertures, une programmée, un brouillon),
 * personnalisation des notifications e-mail et WhatsApp, invitations au groupe
 * WhatsApp.
 *
 * Rien n'est envoyé : on écrit directement l'historique (envoyé, ouvert, échec).
 * Les adresses des contacts sont des adresses de démonstration.
 */
import { createHash } from 'crypto';
import { between, pick } from './types';
import { randomPerson, slugify } from './agence-data';
import { CAMPAIGNS, NEWSLETTER_TEMPLATES, addDays } from './agence-commercial-data';
import type { CampaignDef, CommercialEnv } from './agence-commercial-data';

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

interface Member {
  email: string;
  name: string;
  since: Date;
  subscriberId?: string;
}

export async function seedNewsletters(env: CommercialEnv): Promise<void> {
  const { prisma, tenantId, rng, ctx, staff, log } = env;
  if ((await prisma.newsletterList.count({ where: { tenantId } })) > 0) {
    log('commercial : newsletters déjà présentes.');
    return;
  }

  // ───────────────────────────────────────────────────────────── consentements
  await prisma.tenantClient.updateMany({
    where: { tenantId, clientType: 'OWNER' },
    data: { newsletterConsent: true }
  });
  const renters = await prisma.tenantClient.findMany({
    where: { tenantId, clientType: 'RENTER' },
    select: { id: true, createdAt: true, user: { select: { email: true, fullName: true } } },
    orderBy: { createdAt: 'asc' }
  });
  const consentingRenters = renters.filter(() => rng() < 0.78);
  if (consentingRenters.length > 0) {
    await prisma.tenantClient.updateMany({
      where: { id: { in: consentingRenters.map(r => r.id) } },
      data: { newsletterConsent: true }
    });
  }
  const owners = await prisma.tenantClient.findMany({
    where: { tenantId, clientType: 'OWNER' },
    select: { createdAt: true, user: { select: { email: true, fullName: true } } },
    orderBy: { createdAt: 'asc' }
  });

  // ─────────────────────────────────────────────────────────────────── modèles
  const templateIds: string[] = [];
  for (const t of NEWSLETTER_TEMPLATES) {
    const row = await prisma.newsletterTemplate.create({
      data: { tenantId, name: t.name, html: t.html, createdAt: addDays(ctx.start, between(rng, 5, 40)) },
      select: { id: true }
    });
    templateIds.push(row.id);
  }

  // ───────────────────────────────────────────────────────────────────- listes
  const listDefs = [
    { key: 'PROSPECTS', name: 'Prospects et abonnés du site web', type: 'MANUAL', doubleOptIn: true, ago: 1030 },
    { key: 'PROPRIOS', name: 'Propriétaires bailleurs', type: 'FROM_OWNERS', doubleOptIn: false, ago: 1020 },
    { key: 'LOCATAIRES', name: 'Locataires en place', type: 'FROM_RENTERS', doubleOptIn: false, ago: 1010 },
    { key: 'VIP', name: 'Clients investisseurs', type: 'MANUAL', doubleOptIn: true, ago: 700 },
    { key: 'CRM', name: 'Base CRM — contacts consentants', type: 'FROM_CRM_CONTACTS', doubleOptIn: false, ago: 400 }
  ] as const;
  const lists = new Map<string, string>();
  for (const l of listDefs) {
    const row = await prisma.newsletterList.create({
      data: {
        tenantId,
        name: l.name,
        type: l.type,
        doubleOptIn: l.doubleOptIn,
        publicSubscribeToken: l.type === 'MANUAL' ? `lst_${hex(rng, 32)}` : null,
        createdAt: addDays(ctx.end, -l.ago)
      },
      select: { id: true }
    });
    lists.set(l.key, row.id);
  }

  // ─────────────────────────────────────────────────────────────── abonnés
  const consenting = await prisma.crmContact.findMany({
    where: { tenantId, consentEmail: true, status: { in: ['LEAD', 'ACTIVE_CLIENT'] } },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      createdAt: true,
      tags: { select: { tag: { select: { name: true } } } }
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  });
  const prospectsMembers: Member[] = [];
  const vipMembers: Member[] = [];
  let pending = 0;
  let unsub = 0;
  for (const c of consenting) {
    const names = c.tags.map(t => t.tag.name);
    const isVip = names.includes('Investisseur') || names.includes('VIP');
    const targetList = isVip ? lists.get('VIP') : c.status === 'LEAD' ? lists.get('PROSPECTS') : undefined;
    if (!targetList) continue;
    let status: 'ACTIVE' | 'PENDING_CONFIRMATION' | 'UNSUBSCRIBED' = 'ACTIVE';
    const r = rng();
    if (r < 0.06 && pending < 5) {
      status = 'PENDING_CONFIRMATION';
      pending += 1;
    } else if (r < 0.16 && unsub < 8) {
      status = 'UNSUBSCRIBED';
      unsub += 1;
    }
    const subscribedAt = addDays(c.createdAt, between(rng, 1, 14));
    const row = await prisma.newsletterSubscriber.create({
      data: {
        tenantId,
        listId: targetList,
        email: c.email,
        name: `${c.firstName} ${c.lastName}`,
        status,
        confirmationToken: status === 'PENDING_CONFIRMATION' ? hex(rng, 64) : null,
        confirmationTokenExpiresAt: status === 'PENDING_CONFIRMATION' ? addDays(ctx.end, 2) : null,
        subscribedAt,
        confirmedAt: status === 'PENDING_CONFIRMATION' ? null : addDays(subscribedAt, 0),
        unsubscribedAt: status === 'UNSUBSCRIBED' ? addDays(subscribedAt, between(rng, 30, 240)) : null,
        sourceEntityType: 'CRM_CONTACT',
        sourceEntityId: c.id,
        createdAt: subscribedAt
      },
      select: { id: true }
    });
    if (status === 'ACTIVE') {
      (isVip ? vipMembers : prospectsMembers).push({
        email: c.email,
        name: c.firstName,
        since: subscribedAt,
        subscriberId: row.id
      });
    }
  }
  // Inscriptions depuis le formulaire public du site de l'agence (liste manuelle avec lien d'abonnement).
  const prospectsList = lists.get('PROSPECTS') as string;
  const webSeen = new Set<string>();
  for (let i = 0; i < 58; i++) {
    const person = randomPerson(rng);
    const email = `${slugify(person.firstName)}.${slugify(person.lastName)}${i + 1}@example.ci`;
    if (webSeen.has(email)) continue;
    webSeen.add(email);
    const subscribedAt = addDays(ctx.end, -between(rng, 6, 1000));
    const r = rng();
    const status = r < 0.07 ? 'PENDING_CONFIRMATION' : r < 0.17 ? 'UNSUBSCRIBED' : 'ACTIVE';
    const row = await prisma.newsletterSubscriber.create({
      data: {
        tenantId,
        listId: prospectsList,
        email,
        name: `${person.firstName} ${person.lastName}`,
        status,
        confirmationToken: status === 'PENDING_CONFIRMATION' ? hex(rng, 64) : null,
        confirmationTokenExpiresAt: status === 'PENDING_CONFIRMATION' ? addDays(ctx.end, 1) : null,
        subscribedAt,
        confirmedAt: status === 'PENDING_CONFIRMATION' ? null : addDays(subscribedAt, 0),
        unsubscribedAt: status === 'UNSUBSCRIBED' ? addDays(subscribedAt, between(rng, 20, 200)) : null,
        sourceEntityType: 'PUBLIC_FORM',
        createdAt: subscribedAt
      },
      select: { id: true }
    });
    if (status === 'ACTIVE') {
      prospectsMembers.push({ email, name: person.firstName, since: subscribedAt, subscriberId: row.id });
    }
  }
  const ownersMembers: Member[] = owners.map(o => ({
    email: o.user.email,
    name: (o.user.fullName ?? '').split(' ')[0] || 'Cher propriétaire',
    since: o.createdAt
  }));
  const rentersMembers: Member[] = consentingRenters.map(r => ({
    email: r.user.email,
    name: (r.user.fullName ?? '').split(' ')[0] || 'Cher locataire',
    since: r.createdAt
  }));
  const membersByList: Record<CampaignDef['listKey'], Member[]> = {
    PROSPECTS: prospectsMembers,
    PROPRIOS: ownersMembers,
    LOCATAIRES: rentersMembers,
    VIP: vipMembers
  };

  // ──────────────────────────────────────────────────────────────── campagnes
  let sentCampaigns = 0;
  let recipientRows = 0;
  for (const def of CAMPAIGNS) {
    const listId = lists.get(def.listKey) as string;
    const templateId = templateIds[def.templateIndex];
    const sentAt = def.sentAgo === null ? null : addDays(ctx.end, -def.sentAgo);
    const createdAt = sentAt ? addDays(sentAt, -between(rng, 1, 5)) : addDays(ctx.end, -between(rng, 2, 12));
    const template = NEWSLETTER_TEMPLATES[def.templateIndex];

    let eligible = membersByList[def.listKey].filter(m => (sentAt ? m.since <= sentAt : true));
    if (sentAt && eligible.length < 6) eligible = membersByList[def.listKey].slice(0, 6);

    const campaign = await prisma.newsletterCampaign.create({
      data: {
        tenantId,
        listId,
        templateId,
        subject: def.subject,
        bodyHtml: def.bodyHtml,
        renderedHtml:
          def.status === 'SENT' && eligible.length > 0
            ? personalize(personalize(template.html, { contenu: def.bodyHtml }), {
                prenom: eligible[0].name,
                lien_desinscription: 'https://app.immotopia.cloud/newsletter/unsubscribe'
              })
            : null,
        status: def.status,
        scheduledAt:
          def.status === 'SCHEDULED'
            ? addDays(ctx.end, -(def.sentAgo ?? 0))
            : def.status === 'SENT' && rng() < 0.4
              ? addDays(createdAt, 1)
              : null,
        sentAt: def.status === 'SENT' ? sentAt : null,
        createdById: pick(rng, staff),
        createdAt
      },
      select: { id: true }
    });

    if (def.status !== 'SENT' || !sentAt) continue;
    sentCampaigns += 1;
    const rows = eligible.map(m => {
      const failed = rng() < 0.03;
      const opened = !failed && rng() < def.openRate;
      const at = new Date(sentAt.getTime() + between(rng, 1, 40) * 60_000);
      return {
        campaignId: campaign.id,
        tenantId,
        email: m.email,
        subscriberId: m.subscriberId ?? null,
        status: failed ? ('FAILED' as const) : ('SENT' as const),
        sentAt: failed ? null : at,
        openedAt: opened ? new Date(at.getTime() + between(rng, 20, 4000) * 60_000) : null,
        failureReason: failed ? 'Boîte de réception pleine ou adresse inexistante (rejet du serveur distant).' : null,
        unsubscribeToken: createHash('sha256').update(`${campaign.id}:${m.email}:u`).digest('hex'),
        openToken: createHash('sha256').update(`${campaign.id}:${m.email}:o`).digest('hex')
      };
    });
    await prisma.newsletterCampaignRecipient.createMany({ data: rows });
    recipientRows += rows.length;
  }
  log(
    `commercial : ${listDefs.length} listes, ${prospectsMembers.length + vipMembers.length} abonnés manuels, ` +
      `${templateIds.length} modèles, ${CAMPAIGNS.length} campagnes (${sentCampaigns} envoyées, ${recipientRows} destinataires).`
  );
}

// ───────────────────────────────────────────────── notifications e-mail / WhatsApp

const EMAIL_CONFIGS: Array<{
  key: string;
  enabled: boolean;
  subject?: string;
  body?: string;
}> = [
  {
    key: 'INSTALLMENT_DUE_REMINDER',
    enabled: true,
    subject: 'Rappel amical : votre loyer de {{dueAmount}} est attendu le {{dueDate}}'
  },
  {
    key: 'INSTALLMENT_OVERDUE',
    enabled: true,
    subject: 'Loyer en retard — bail {{leaseNumber}}',
    body: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#b91c1c;">Loyer en retard</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Sauf erreur de notre part, l'échéance du <strong>{{dueDate}}</strong> ({{dueAmount}}) pour le bail {{leaseLabel}} reste impayée. Merci de la régler rapidement ou de nous contacter pour convenir d'un échéancier.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Bien cordialement,<br/>{{agencyName}}</p>`
  },
  { key: 'LEASE_ENDING_SOON', enabled: true, subject: 'Votre bail arrive bientôt à son terme — {{leaseLabel}}' },
  { key: 'PAYMENT_RECEIVED', enabled: true, subject: 'Merci, nous avons bien reçu votre paiement de {{amount}}' },
  { key: 'DEAL_CREATED', enabled: false },
  { key: 'DEAL_STAGE_CHANGED', enabled: true, subject: 'Votre dossier avance — {{dealId}}' },
  { key: 'APPOINTMENT_REMINDER', enabled: true, subject: 'Rappel : rendez-vous le {{appointmentDate}} avec l’agence' },
  { key: 'PROPERTY_PUBLISHED', enabled: true },
  { key: 'DOCUMENT_EXPIRING', enabled: true, subject: 'Un document de votre bien arrive à expiration' },
  { key: 'PAYMENT_CONFIRMED', enabled: false }
];

const WHATSAPP_CONFIGS: Array<{ key: string; enabled: boolean; body?: string }> = [
  {
    key: 'INSTALLMENT_DUE_REMINDER',
    enabled: true,
    body: 'Bonjour {{tenantName}}, petit rappel : votre loyer de {{amount}} est attendu le {{dueDate}}. Paiement possible par Orange Money, MTN, Wave ou virement. {{agencyName}}.'
  },
  { key: 'INSTALLMENT_OVERDUE', enabled: true },
  {
    key: 'APPOINTMENT_REMINDER',
    enabled: true,
    body: 'Bonjour, nous vous attendons pour votre rendez-vous du {{appointmentDate}}. En cas d’empêchement, prévenez-nous par retour de message. {{agencyName}}.'
  },
  { key: 'LEASE_ENDING_SOON', enabled: true },
  { key: 'PAYMENT_APPROVED_TENANT', enabled: true },
  { key: 'PAYMENT_REJECTED_TENANT', enabled: false },
  {
    key: 'CRM_CONTACT_GROUP_INVITE',
    enabled: true,
    body: 'Bonjour {{contactName}}, rejoignez le groupe WhatsApp de notre agence pour être alerté en premier des nouveaux biens à louer et à vendre.\nLien d’invitation : {{inviteLink}}'
  },
  { key: 'PROPERTY_PUBLISHED_GROUP_BROADCAST', enabled: true },
  { key: 'DEAL_STAGE_CHANGED', enabled: true },
  { key: 'MAINTENANCE_TICKET_STATUS_CHANGED_TENANT', enabled: true }
];

export async function seedNotificationConfigs(env: CommercialEnv): Promise<void> {
  const { prisma, tenantId, rng, ctx, log } = env;
  if ((await prisma.emailNotificationConfig.count({ where: { tenant_id: tenantId } })) === 0) {
    for (const c of EMAIL_CONFIGS) {
      const at = addDays(ctx.end, -between(rng, 60, 900));
      await prisma.emailNotificationConfig.create({
        data: {
          tenant_id: tenantId,
          notification_key: c.key,
          enabled: c.enabled,
          subject_override: c.subject ?? null,
          body_html_override: c.body ?? null,
          created_at: at,
          updated_at: at
        }
      });
    }
    log(`commercial : ${EMAIL_CONFIGS.length} réglages de notifications e-mail.`);
  }
  if ((await prisma.whatsappNotificationConfig.count({ where: { tenant_id: tenantId } })) === 0) {
    for (const c of WHATSAPP_CONFIGS) {
      const at = addDays(ctx.end, -between(rng, 60, 700));
      await prisma.whatsappNotificationConfig.create({
        data: {
          tenant_id: tenantId,
          notification_key: c.key,
          enabled: c.enabled,
          body_override: c.body ?? null,
          created_at: at,
          updated_at: at
        }
      });
    }
    log(`commercial : ${WHATSAPP_CONFIGS.length} réglages de notifications WhatsApp.`);
  }
}

export async function seedWhatsappInvites(env: CommercialEnv): Promise<void> {
  const { prisma, tenantId, rng, ctx, log } = env;
  if ((await prisma.whatsappGroupInviteLog.count({ where: { tenant_id: tenantId } })) > 0) {
    log('commercial : invitations WhatsApp déjà présentes.');
    return;
  }
  const link = 'https://chat.whatsapp.com/Kd3Pq7RtXe9LmN2vB5aYhC?mode=gi_t';
  const hash = createHash('sha256').update(link).digest('hex');
  const contacts = await prisma.crmContact.findMany({
    where: {
      tenantId,
      consentWhatsapp: true,
      whatsappNumber: { not: null },
      status: { in: ['LEAD', 'ACTIVE_CLIENT'] }
    },
    select: { id: true, createdAt: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 120
  });
  const groupStart = addDays(ctx.end, -420);
  let n = 0;
  for (const c of contacts) {
    if (n >= 34) break;
    if (rng() > 0.4) continue;
    const base = c.createdAt > groupStart ? c.createdAt : groupStart;
    const first = new Date(Math.min(addDays(base, between(rng, 0, 12)).getTime(), ctx.end.getTime() - 3_600_000));
    const r = rng();
    const status = r < 0.68 ? 'SENT' : r < 0.8 ? 'FAILED' : r < 0.9 ? 'SKIPPED' : 'PENDING';
    const attempts = status === 'PENDING' ? 0 : status === 'FAILED' ? between(rng, 2, 3) : 1;
    await prisma.whatsappGroupInviteLog.create({
      data: {
        tenant_id: tenantId,
        contact_id: c.id,
        invite_link: link,
        invite_link_hash: hash,
        status,
        attempts,
        first_sent_at: status === 'SENT' ? first : null,
        last_attempt_at: status === 'PENDING' ? null : addDays(first, status === 'FAILED' ? attempts : 0),
        last_error:
          status === 'FAILED'
            ? 'Numéro non enregistré sur WhatsApp ou message refusé par le fournisseur.'
            : status === 'SKIPPED'
              ? 'Contact déjà membre du groupe : invitation non renvoyée.'
              : null,
        created_at: first,
        updated_at: first
      }
    });
    n += 1;
  }
  log(`commercial : ${n} invitations au groupe WhatsApp (historique, rien n'est envoyé).`);
}
