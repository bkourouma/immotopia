import crypto from 'crypto';
import { BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { t } from '../i18n';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { sanitizeHtml } from '../utils/sanitize-html';
import { emailService } from './email-service';
import { configureWhatsAppProvider, getConfiguredWhatsAppProvider, sendText } from './providers/whatsapp.provider';

export { sanitizeHtml };

/**
 * NewsletterCampaignService - Création, envoi, planification des campagnes
 * @see specs/012-newsletter-mailing/data-model.md
 */

function getBaseUrl(): string {
  return process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
}

function getApiBaseUrl(): string {
  return process.env.API_URL || process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8001}`;
}

function replaceVariables(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

function getDefaultCountryCode(): string {
  const value = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE?.trim();
  return value && /^\d{1,4}$/.test(value) ? value : '33';
}

function normalizePhone(phone: string, defaultCountryCode = '33'): string {
  const cleaned = String(phone).trim().replace(/\s/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`;
  if (/^0\d{8,9}$/.test(cleaned)) return `+${defaultCountryCode}${cleaned.slice(1)}`;
  if (/^\d{9,15}$/.test(cleaned)) return `+${defaultCountryCode}${cleaned}`;
  return `+${cleaned}`;
}

function isNewsletterWhatsappEnabled(): boolean {
  const value = process.env.NEWSLETTER_WHATSAPP_ENABLED?.trim().toLowerCase();
  if (!value) return true;
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function htmlToWhatsappText(html: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  doc.querySelectorAll('a').forEach(anchor => {
    const href = anchor.getAttribute('href');
    if (!href) return;
    const label = (anchor.textContent || '').trim();
    anchor.textContent = label ? `${label} (${href})` : href;
  });
  const text = doc.body.textContent || '';
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildWhatsappBody(subject: string, html: string): string {
  const text = htmlToWhatsappText(html);
  const body = text ? `${subject}\n\n${text}` : subject;
  return body.length > 3500 ? `${body.slice(0, 3497)}...` : body;
}

async function resolveWhatsappByEmail(tenantId: string, emails: string[]): Promise<Record<string, string>> {
  const normalizedEmails = Array.from(
    new Set(
      emails
        .map(email =>
          String(email || '')
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    )
  );
  if (normalizedEmails.length === 0) return {};

  const contacts = await prisma.crmContact.findMany({
    where: { tenantId, email: { in: normalizedEmails }, consentWhatsapp: true },
    select: { email: true, whatsappNumber: true, phonePrimary: true }
  });

  const byEmail: Record<string, string> = {};
  for (const c of contacts) {
    const raw = c.whatsappNumber?.trim() || c.phonePrimary?.trim();
    if (!raw) continue;
    const normalizedPhone = normalizePhone(raw, getDefaultCountryCode());
    if (!normalizedPhone) continue;
    byEmail[c.email.trim().toLowerCase()] = normalizedPhone;
  }
  return byEmail;
}

export interface ResolvedRecipient {
  email: string;
  prenom?: string;
  nom?: string;
  subscriberId?: string;
  whatsappTo?: string;
}

export async function resolveRecipients(tenantId: string, listId: string): Promise<ResolvedRecipient[]> {
  const list = await prisma.newsletterList.findFirst({ where: { id: listId, tenantId } });
  if (!list) return [];

  if (list.type === 'MANUAL') {
    const subs = await prisma.newsletterSubscriber.findMany({
      where: { listId, tenantId, status: 'ACTIVE' }
    });
    const recipients = subs.map(s => ({
      email: s.email,
      prenom: s.name?.split(/\s+/)[0] ?? '',
      nom: s.name?.split(/\s+/).slice(1).join(' ') ?? '',
      subscriberId: s.id
    }));
    const whatsappByEmail = await resolveWhatsappByEmail(
      tenantId,
      recipients.map(r => r.email)
    );
    return recipients.map(r => ({ ...r, whatsappTo: whatsappByEmail[r.email.toLowerCase()] }));
  }

  if (list.type === 'FROM_OWNERS') {
    const owners = await prisma.tenantClient.findMany({
      where: { tenantId, clientType: 'OWNER', newsletterConsent: true },
      include: { user: { select: { id: true, email: true, fullName: true } } }
    });
    const recipients = owners
      .filter(o => o.user?.email)
      .map(o => ({
        email: o.user!.email,
        prenom: o.user!.fullName?.split(/\s+/)[0] ?? '',
        nom: o.user!.fullName?.split(/\s+/).slice(1).join(' ') ?? '',
        subscriberId: undefined
      }));
    const whatsappByEmail = await resolveWhatsappByEmail(
      tenantId,
      recipients.map(r => r.email)
    );
    return recipients.map(r => ({ ...r, whatsappTo: whatsappByEmail[r.email.toLowerCase()] }));
  }

  if (list.type === 'FROM_RENTERS') {
    const renters = await prisma.tenantClient.findMany({
      where: { tenantId, clientType: 'RENTER', newsletterConsent: true },
      include: { user: { select: { id: true, email: true, fullName: true } } }
    });
    const recipients = renters
      .filter(r => r.user?.email)
      .map(r => ({
        email: r.user!.email,
        prenom: r.user!.fullName?.split(/\s+/)[0] ?? '',
        nom: r.user!.fullName?.split(/\s+/).slice(1).join(' ') ?? '',
        subscriberId: undefined
      }));
    const whatsappByEmail = await resolveWhatsappByEmail(
      tenantId,
      recipients.map(r => r.email)
    );
    return recipients.map(r => ({ ...r, whatsappTo: whatsappByEmail[r.email.toLowerCase()] }));
  }

  if (list.type === 'FROM_CRM_CONTACTS') {
    const contacts = await prisma.crmContact.findMany({
      where: { tenantId, consentEmail: true },
      select: {
        email: true,
        firstName: true,
        lastName: true,
        consentWhatsapp: true,
        whatsappNumber: true,
        phonePrimary: true
      }
    });
    return contacts
      .filter(c => c.email)
      .map(c => ({
        email: c.email,
        prenom: c.firstName ?? '',
        nom: c.lastName ?? '',
        subscriberId: undefined,
        whatsappTo:
          c.consentWhatsapp && (c.whatsappNumber?.trim() || c.phonePrimary?.trim())
            ? normalizePhone(c.whatsappNumber?.trim() || c.phonePrimary?.trim() || '', getDefaultCountryCode())
            : undefined
      }));
  }

  return [];
}

export function validateHasUnsubscribeLink(bodyHtml: string): boolean {
  return /\{\{lien_desinscription\}\}/i.test(bodyHtml);
}

/** Un modele d'une autre agence ressemble a un modele inexistant : meme 404. */
async function assertTemplateBelongsToTenant(tenantId: string, templateId?: string | null) {
  if (!templateId) return;
  const template = await prisma.newsletterTemplate.findFirst({
    where: { id: templateId, tenantId },
    select: { id: true }
  });
  if (!template) throw new NotFoundError(t('Template non trouvé.'));
}

export async function createCampaign(
  tenantId: string,
  data: { listId: string; templateId?: string; subject: string; bodyHtml: string },
  createdById?: string
) {
  const list = await prisma.newsletterList.findFirst({ where: { id: data.listId, tenantId } });
  if (!list) throw new NotFoundError(t('Liste non trouvée.'));
  await assertTemplateBelongsToTenant(tenantId, data.templateId);

  const bodyHtml = sanitizeHtml(data.bodyHtml);

  return prisma.newsletterCampaign.create({
    data: {
      tenantId,
      listId: data.listId,
      templateId: data.templateId || null,
      subject: data.subject,
      bodyHtml,
      status: 'DRAFT',
      createdById: createdById || null
    }
  });
}

export async function getCampaign(tenantId: string, campaignId: string) {
  const campaign = await prisma.newsletterCampaign.findFirst({
    where: { id: campaignId, tenantId },
    include: { list: true }
  });
  if (!campaign) return null;

  const [sentCount, failedCount, openCount] = await Promise.all([
    prisma.newsletterCampaignRecipient.count({ where: { campaignId, status: 'SENT' } }),
    prisma.newsletterCampaignRecipient.count({ where: { campaignId, status: 'FAILED' } }),
    prisma.newsletterCampaignRecipient.count({ where: { campaignId, status: 'SENT', openedAt: { not: null } } })
  ]);

  return {
    ...campaign,
    listName: campaign.list.name,
    sentCount,
    failedCount,
    openCount,
    unsubscribeCount: 0
  };
}

export async function updateCampaign(
  tenantId: string,
  campaignId: string,
  data: { subject?: string; bodyHtml?: string; templateId?: string }
) {
  const c = await prisma.newsletterCampaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!c) throw new NotFoundError(t('Campagne non trouvée.'));
  if (c.status !== 'DRAFT') throw new BadRequestError(t('Seules les campagnes en brouillon peuvent être modifiées.'));
  await assertTemplateBelongsToTenant(tenantId, data.templateId);

  const bodyHtml = data.bodyHtml != null ? sanitizeHtml(data.bodyHtml) : undefined;

  return prisma.newsletterCampaign.update({
    where: { id: campaignId, tenantId },
    data: {
      ...(data.subject != null && { subject: data.subject }),
      ...(bodyHtml != null && { bodyHtml }),
      ...(data.templateId != null && { templateId: data.templateId })
    }
  });
}

export async function getPreviewHtml(tenantId: string, campaignId: string): Promise<{ subject: string; html: string }> {
  const campaign = await prisma.newsletterCampaign.findFirst({
    where: { id: campaignId, tenantId },
    include: { template: true }
  });
  if (!campaign) throw new NotFoundError(t('Campagne non trouvée.'));

  let html = campaign.bodyHtml;
  if (campaign.template) {
    html = replaceVariables(sanitizeHtml(campaign.template.html), { contenu: campaign.bodyHtml });
  }

  const vars = {
    prenom: 'Prénom',
    nom: 'Nom',
    email: 'exemple@test.com',
    lien_desinscription: `${getBaseUrl()}/newsletter/unsubscribe?token=preview`
  };
  return {
    subject: replaceVariables(campaign.subject, vars),
    html: replaceVariables(html, vars)
  };
}

export async function sendCampaign(tenantId: string, campaignId: string): Promise<void> {
  const campaign = await prisma.newsletterCampaign.findFirst({
    where: { id: campaignId, tenantId },
    include: { list: true, template: true }
  });
  if (!campaign) throw new NotFoundError(t('Campagne non trouvée.'));
  if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
    throw new BadRequestError(t('Cette campagne ne peut pas être envoyée.'));
  }
  if (!validateHasUnsubscribeLink(campaign.bodyHtml)) {
    throw new BadRequestError(t('Le corps de la campagne doit contenir la variable {{lien_desinscription}}.'));
  }

  const recipients = await resolveRecipients(tenantId, campaign.listId);
  const baseUrl = getBaseUrl();
  const apiBaseUrl = getApiBaseUrl();
  const whatsappFeatureEnabled = isNewsletterWhatsappEnabled();
  const whatsappProviderConfigured = whatsappFeatureEnabled && configureWhatsAppProvider();
  const whatsappProvider = whatsappProviderConfigured ? getConfiguredWhatsAppProvider() : null;

  if (whatsappFeatureEnabled && !whatsappProviderConfigured) {
    logger.warn(
      'Newsletter WhatsApp relay enabled but provider is not configured. Email send will continue without WhatsApp relay.'
    );
  }

  let bodyHtml = campaign.bodyHtml;
  if (campaign.template) {
    bodyHtml = replaceVariables(sanitizeHtml(campaign.template.html), { contenu: campaign.bodyHtml });
  }

  await prisma.newsletterCampaign.update({
    where: { id: campaignId, tenantId },
    data: { status: 'SENDING' }
  });

  let renderedHtml = '';
  let successfulRecipients = 0;
  let whatsappSentCount = 0;
  let whatsappFailureCount = 0;
  let whatsappSkippedCount = 0;

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    const unsubscribeToken = crypto.randomBytes(32).toString('hex');
    const openToken = crypto.randomBytes(32).toString('hex');
    const vars: Record<string, string> = {
      prenom: r.prenom || 'Cher abonné',
      nom: r.nom || '',
      email: r.email,
      lien_desinscription: `${baseUrl}/newsletter/unsubscribe?token=${unsubscribeToken}`
    };
    const subject = replaceVariables(campaign.subject, vars);
    const personalizedHtml = replaceVariables(bodyHtml, vars);
    const whatsappBody = buildWhatsappBody(subject, personalizedHtml);
    let html = personalizedHtml;
    const trackingPixel = `<img src="${apiBaseUrl}/api/newsletter/track/open?token=${openToken}" width="1" height="1" alt="" style="display:none" />`;
    html = html.replace(/<\/body>/i, `${trackingPixel}</body>`);
    if (!/<\/body>/i.test(html)) html += trackingPixel;
    if (i === 0) renderedHtml = html;

    let emailSent = false;
    let whatsappSent = false;
    let emailError: string | null = null;
    let whatsappError: string | null = null;

    try {
      await emailService.sendEmail({ to: r.email, subject, html });
      emailSent = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
    }

    if (whatsappProviderConfigured) {
      if (r.whatsappTo) {
        try {
          await sendText({ to: r.whatsappTo, body: whatsappBody });
          whatsappSent = true;
          whatsappSentCount += 1;
        } catch (err) {
          whatsappFailureCount += 1;
          whatsappError = err instanceof Error ? err.message : String(err);
        }
      } else {
        whatsappSkippedCount += 1;
      }
    }

    if (emailSent && whatsappProviderConfigured && r.whatsappTo && !whatsappSent && whatsappError) {
      logger.warn('Newsletter email sent but WhatsApp relay failed for recipient', {
        tenantId,
        campaignId,
        recipientEmail: r.email,
        recipientPhoneSuffix: r.whatsappTo.slice(-4),
        provider: whatsappProvider,
        error: whatsappError
      });
    }

    const sent = emailSent || whatsappSent;
    if (sent) {
      successfulRecipients += 1;
      await prisma.newsletterCampaignRecipient.create({
        data: {
          campaignId,
          tenantId,
          subscriberId: r.subscriberId || null,
          email: r.email,
          status: 'SENT',
          sentAt: new Date(),
          unsubscribeToken,
          openToken
        }
      });
      continue;
    }

    await prisma.newsletterCampaignRecipient.create({
      data: {
        campaignId,
        tenantId,
        subscriberId: r.subscriberId || null,
        email: r.email,
        status: 'FAILED',
        failureReason: [emailError, whatsappError].filter(Boolean).join(' | ') || 'No channel succeeded'
      }
    });
  }

  const finalStatus = successfulRecipients > 0 ? 'SENT' : 'FAILED';
  await prisma.newsletterCampaign.update({
    where: { id: campaignId, tenantId },
    data: {
      status: finalStatus,
      sentAt: new Date(),
      renderedHtml: renderedHtml || bodyHtml
    }
  });

  logger.info('Newsletter campaign sent', {
    tenantId,
    campaignId,
    recipientCount: recipients.length,
    successfulRecipients,
    finalStatus,
    whatsappRelayEnabled: whatsappProviderConfigured,
    whatsappProvider,
    whatsappSentCount,
    whatsappFailureCount,
    whatsappSkippedCount
  });
}

export async function scheduleCampaign(tenantId: string, campaignId: string, scheduledAt: Date) {
  const c = await prisma.newsletterCampaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!c) throw new NotFoundError(t('Campagne non trouvée.'));
  if (c.status !== 'DRAFT') throw new BadRequestError(t('Seules les campagnes en brouillon peuvent être planifiées.'));
  if (scheduledAt <= new Date()) throw new BadRequestError(t("La date d'envoi doit être dans le futur."));

  return prisma.newsletterCampaign.update({
    where: { id: campaignId, tenantId },
    data: { status: 'SCHEDULED', scheduledAt }
  });
}

export async function cancelCampaign(tenantId: string, campaignId: string) {
  const c = await prisma.newsletterCampaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!c) throw new NotFoundError(t('Campagne non trouvée.'));
  if (c.status !== 'SCHEDULED') throw new BadRequestError(t('Seules les campagnes planifiées peuvent être annulées.'));

  return prisma.newsletterCampaign.update({
    where: { id: campaignId, tenantId },
    data: { status: 'CANCELLED' }
  });
}

export async function listCampaigns(tenantId: string, options: { status?: string; page?: number; limit?: number }) {
  const where: { tenantId: string; status?: string } = { tenantId };
  if (options.status) where.status = options.status as any;

  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const skip = (page - 1) * limit;

  const [campaigns, total] = await Promise.all([
    prisma.newsletterCampaign.findMany({
      where,
      include: { list: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    }),
    prisma.newsletterCampaign.count({ where })
  ]);

  const campaignIds = campaigns.map(c => c.id);
  const sentCounts = await Promise.all(
    campaignIds.map(id => prisma.newsletterCampaignRecipient.count({ where: { campaignId: id, status: 'SENT' } }))
  );
  const failedCounts = await Promise.all(
    campaignIds.map(id => prisma.newsletterCampaignRecipient.count({ where: { campaignId: id, status: 'FAILED' } }))
  );
  const openCounts = await Promise.all(
    campaignIds.map(id =>
      prisma.newsletterCampaignRecipient.count({ where: { campaignId: id, status: 'SENT', openedAt: { not: null } } })
    )
  );

  const sentMap = Object.fromEntries(campaignIds.map((id, i) => [id, sentCounts[i]]));
  const failedMap = Object.fromEntries(campaignIds.map((id, i) => [id, failedCounts[i]]));
  const openMap = Object.fromEntries(campaignIds.map((id, i) => [id, openCounts[i]]));

  return {
    campaigns: campaigns.map(c => ({
      ...c,
      listName: c.list.name,
      sentCount: sentMap[c.id] ?? 0,
      failedCount: failedMap[c.id] ?? 0,
      openCount: openMap[c.id] ?? 0
    })),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
}

/** 1x1 transparent GIF for tracking pixel */
const TRACKING_PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export async function trackOpen(token: string): Promise<Buffer> {
  const recipient = await prisma.newsletterCampaignRecipient.findFirst({
    where: { openToken: token, status: 'SENT' }
  });
  if (recipient && !recipient.openedAt) {
    await prisma.newsletterCampaignRecipient.update({
      where: { id: recipient.id, tenantId: recipient.tenantId },
      data: { openedAt: new Date() }
    });
  }
  return TRACKING_PIXEL_GIF;
}

export async function getCampaignRecipients(
  tenantId: string,
  campaignId: string,
  options: { page?: number; limit?: number }
) {
  const campaign = await prisma.newsletterCampaign.findFirst({
    where: { id: campaignId, tenantId }
  });
  if (!campaign) return null;

  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const skip = (page - 1) * limit;

  const [recipients, total] = await Promise.all([
    prisma.newsletterCampaignRecipient.findMany({
      where: { campaignId, tenantId },
      orderBy: { sentAt: 'desc' },
      skip,
      take: limit
    }),
    prisma.newsletterCampaignRecipient.count({ where: { campaignId, tenantId } })
  ]);

  return {
    recipients,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
}
