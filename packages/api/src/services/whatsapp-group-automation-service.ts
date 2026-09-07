import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { sendWhatsappNotification } from './whatsapp-notification-send-service';
import { getWhatsappNotificationConfig } from './whatsapp-notification-config-service';
import { WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES } from '../constants/whatsapp-notification-default-templates';
import { configureWhatsAppProvider, sendImage, sendText } from './providers/whatsapp.provider';
import crypto from 'crypto';
import * as fs from 'fs/promises';

interface PropertyBroadcastOptions {
  tenantId: string;
  propertyId: string;
  propertyTitle: string;
  propertyDescription?: string | null;
  propertyReference: string;
  propertyType?: string | null;
  propertyAddress?: string | null;
  locationZone?: string | null;
  propertyPrice?: number | string | null;
  propertyCurrency?: string | null;
  transactionModes?: string[] | null;
  surfaceArea?: number | string | null;
  rooms?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  furnishingStatus?: string | null;
  availability?: string | null;
  publishedAt?: Date | null;
  primaryImageUrl?: string | null;
  primaryImagePath?: string | null;
  primaryImageMimeType?: string | null;
}

interface BulkInviteResult {
  totalEligible: number;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
}

type InviteSendOutcome = 'sent' | 'skipped_duplicate' | 'failed';

function isFeatureEnabled(value: string | undefined, defaultValue: boolean): boolean {
  const raw = value?.trim().toLowerCase();
  if (!raw) return defaultValue;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

function getGroupBroadcastTarget(): string | null {
  const target = process.env.WHATSAPP_GROUP_BROADCAST_TO?.trim();
  return target || null;
}

function getInviteLink(): string {
  const raw =
    process.env.WHATSAPP_GROUP_INVITE_LINK?.trim() || 'https://chat.whatsapp.com/FigaM5mUQaqDHRk6YAaS0l?mode=gi_t';
  const trimmed = raw
    .trim()
    .replace(/^['"`<\s]+/, '')
    .replace(/['"`>\s]+$/, '');
  const withProtocol =
    /^https?:\/\//i.test(trimmed) || !/^chat\.whatsapp\.com\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.hostname.toLowerCase() === 'chat.whatsapp.com') {
      return `${parsed.origin}${parsed.pathname}`;
    }
  } catch {
    // Keep original raw link if parsing fails.
  }

  return withProtocol;
}

function getInviteLinkHash(inviteLink: string): string {
  return crypto.createHash('sha256').update(inviteLink).digest('hex');
}

function formatPrice(input: number | string | null | undefined, currency: string | null | undefined): string {
  if (input === null || input === undefined || input === '') return '';
  const raw = typeof input === 'number' ? input : Number(input);
  if (Number.isFinite(raw)) {
    const curr = currency?.trim() || 'XOF';
    return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(raw)} ${curr}`;
  }
  return String(input);
}

function formatSurface(input: number | string | null | undefined): string {
  if (input === null || input === undefined || input === '') return '';
  const raw = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(raw)) return '';
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(raw)} m2`;
}

function truncateText(input: string | null | undefined, max = 150): string {
  const text = String(input || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}...`;
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  APPARTEMENT: 'Appartement',
  MAISON_VILLA: 'Maison / Villa',
  STUDIO: 'Studio',
  DUPLEX_TRIPLEX: 'Duplex / Triplex',
  CHAMBRE_COLOCATION: 'Chambre / Colocation',
  BUREAU: 'Bureau',
  BOUTIQUE_COMMERCIAL: 'Boutique / Local commercial',
  ENTREPOT_INDUSTRIEL: 'Entrepot / Industriel',
  TERRAIN: 'Terrain',
  IMMEUBLE: 'Immeuble',
  PARKING_BOX: 'Parking / Box',
  LOT_PROGRAMME_NEUF: 'Lot programme neuf'
};

const TRANSACTION_MODE_LABELS: Record<string, string> = {
  SALE: 'Vente',
  RENTAL: 'Location',
  SHORT_TERM: 'Courte duree'
};

const FURNISHING_STATUS_LABELS: Record<string, string> = {
  FURNISHED: 'Meuble',
  UNFURNISHED: 'Non meuble',
  PARTIALLY_FURNISHED: 'Partiellement meuble'
};

const AVAILABILITY_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponible',
  UNAVAILABLE: 'Indisponible',
  SOON_AVAILABLE: 'Bientot disponible'
};

function getLabel(raw: string | null | undefined, map: Record<string, string>): string {
  const key = String(raw || '').trim();
  if (!key) return '';
  if (map[key]) return map[key];
  return key
    .toLowerCase()
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTransactionModes(modes: string[] | null | undefined): string {
  if (!modes || !modes.length) return '';
  return modes
    .map(mode => getLabel(mode, TRANSACTION_MODE_LABELS))
    .filter(Boolean)
    .join(' / ');
}

function formatPublishedAt(input: Date | null | undefined): string {
  const date = input || new Date();
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function buildDefaultPropertyPublishedBody(vars: Record<string, string>): string {
  const lines: string[] = [];

  lines.push('✨ *NOUVEAU BIEN DISPONIBLE*');
  lines.push(`🏠 *${vars.propertyTitle || 'Bien immobilier'}*`);
  lines.push('');

  if (vars.propertyTypeLabel) lines.push(`🏷️ Type: ${vars.propertyTypeLabel}`);
  if (vars.transactionModesLabel) lines.push(`🔁 Transaction: ${vars.transactionModesLabel}`);
  if (vars.propertyPrice) lines.push(`💰 Prix: *${vars.propertyPrice}*`);
  if (vars.propertyAddress) lines.push(`📍 Adresse: ${vars.propertyAddress}`);
  if (vars.locationZone) lines.push(`🧭 Zone: ${vars.locationZone}`);

  const characteristics: string[] = [];
  if (vars.surfaceAreaLabel) characteristics.push(`• Surface: ${vars.surfaceAreaLabel}`);
  if (vars.roomsLabel) characteristics.push(`• Pièces: ${vars.roomsLabel}`);
  if (vars.bedroomsLabel) characteristics.push(`• Chambres: ${vars.bedroomsLabel}`);
  if (vars.bathroomsLabel) characteristics.push(`• SDB: ${vars.bathroomsLabel}`);
  if (vars.furnishingStatusLabel) characteristics.push(`• Ameublement: ${vars.furnishingStatusLabel}`);
  if (vars.availabilityLabel) characteristics.push(`• Disponibilité: ${vars.availabilityLabel}`);

  if (characteristics.length > 0) {
    lines.push('');
    lines.push('📌 *Caractéristiques*');
    lines.push(...characteristics);
  }

  if (vars.propertySummary) {
    lines.push('');
    lines.push(`📝 ${vars.propertySummary}`);
  }

  if (vars.propertyPublicUrl) {
    lines.push('');
    lines.push('👉 Voir l’annonce:');
    lines.push(vars.propertyPublicUrl);
  }

  if (vars.publishedAtLabel) {
    lines.push('');
    lines.push(`⏱️ Publié le ${vars.publishedAtLabel}`);
  }

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

function getDefaultCountryCode(): string {
  const value = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE?.trim();
  return value && /^\d{1,4}$/.test(value) ? value : '33';
}

function getPropertyPublicUrl(propertyId: string): string {
  const template = process.env.WHATSAPP_GROUP_PROPERTY_URL_TEMPLATE?.trim();
  if (!template) {
    const apiBaseUrl = (
      process.env.API_URL?.trim() ||
      process.env.BACKEND_URL?.trim() ||
      `http://localhost:${process.env.PORT || '8001'}`
    ).replace(/\/+$/, '');
    return `${apiBaseUrl}/api/public/properties/${propertyId}`;
  }
  return template.replace(/\{\{\s*propertyId\s*\}\}/gi, propertyId);
}

function getApiBaseUrl(): string {
  return (
    process.env.API_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    `http://localhost:${process.env.PORT || '8001'}`
  ).replace(/\/+$/, '');
}

function toAbsoluteMediaUrl(url: string | null | undefined): string {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!raw.startsWith('/')) return '';
  return `${getApiBaseUrl()}${raw}`;
}

async function toMediaBuffer(filePath: string | null | undefined): Promise<Buffer | undefined> {
  const fullPath = String(filePath || '').trim();
  if (!fullPath) return undefined;
  try {
    return await fs.readFile(fullPath);
  } catch (error) {
    logger.warn('Unable to read property image from disk for WhatsApp broadcast', {
      filePath: fullPath,
      error: error instanceof Error ? error.message : String(error)
    });
    return undefined;
  }
}

async function sendGroupInviteToContactWithOutcome(
  tenantId: string,
  contactId: string,
  options?: { force?: boolean }
): Promise<InviteSendOutcome> {
  const inviteLink = getInviteLink();
  const inviteLinkHash = getInviteLinkHash(inviteLink);

  try {
    const existing = await prisma.whatsappGroupInviteLog.findUnique({
      where: {
        tenant_id_contact_id_invite_link_hash: {
          tenant_id: tenantId,
          contact_id: contactId,
          invite_link_hash: inviteLinkHash
        }
      },
      select: { status: true }
    });

    if (existing?.status === 'SENT' && !options?.force) {
      return 'skipped_duplicate';
    }

    const contact = await prisma.crmContact.findFirst({
      where: { id: contactId, tenantId },
      select: { firstName: true, lastName: true, whatsappNumber: true, phonePrimary: true }
    });
    const contactName = `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim();
    const sent = await sendWhatsappNotification({
      tenantId,
      notificationKey: 'CRM_CONTACT_GROUP_INVITE',
      contactId,
      variables: {
        contactName,
        inviteLink
      }
    });

    if (
      sent &&
      isFeatureEnabled(process.env.WHATSAPP_GROUP_INVITE_APPEND_LINK_MESSAGE, true) &&
      (contact?.whatsappNumber?.trim() || contact?.phonePrimary?.trim())
    ) {
      const rawPhone = contact.whatsappNumber?.trim() || contact.phonePrimary?.trim() || '';
      const to = normalizePhone(rawPhone, getDefaultCountryCode());
      if (to) {
        // Send URL alone in a second message to maximize link auto-detection by WhatsApp clients.
        await sendText({ to, body: inviteLink });
      }
    }

    await prisma.whatsappGroupInviteLog.upsert({
      where: {
        tenant_id_contact_id_invite_link_hash: {
          tenant_id: tenantId,
          contact_id: contactId,
          invite_link_hash: inviteLinkHash
        }
      },
      create: {
        tenant_id: tenantId,
        contact_id: contactId,
        invite_link: inviteLink,
        invite_link_hash: inviteLinkHash,
        status: sent ? 'SENT' : 'FAILED',
        attempts: 1,
        first_sent_at: sent ? new Date() : null,
        last_attempt_at: new Date(),
        last_error: sent ? null : 'Provider send returned false'
      },
      update: {
        status: sent ? 'SENT' : 'FAILED',
        attempts: { increment: 1 },
        first_sent_at: sent ? new Date() : undefined,
        last_attempt_at: new Date(),
        last_error: sent ? null : 'Provider send returned false'
      }
    });

    return sent ? 'sent' : 'failed';
  } catch (error) {
    await prisma.whatsappGroupInviteLog
      .upsert({
        where: {
          tenant_id_contact_id_invite_link_hash: {
            tenant_id: tenantId,
            contact_id: contactId,
            invite_link_hash: inviteLinkHash
          }
        },
        create: {
          tenant_id: tenantId,
          contact_id: contactId,
          invite_link: inviteLink,
          invite_link_hash: inviteLinkHash,
          status: 'FAILED',
          attempts: 1,
          last_attempt_at: new Date(),
          last_error: error instanceof Error ? error.message : String(error)
        },
        update: {
          status: 'FAILED',
          attempts: { increment: 1 },
          last_attempt_at: new Date(),
          last_error: error instanceof Error ? error.message : String(error)
        }
      })
      .catch(() => undefined);

    logger.warn('CRM contact group invite failed', {
      tenantId,
      contactId,
      error: error instanceof Error ? error.message : String(error)
    });
    return 'failed';
  }
}

export async function sendGroupInviteToContact(
  tenantId: string,
  contactId: string,
  options?: { force?: boolean }
): Promise<boolean> {
  const outcome = await sendGroupInviteToContactWithOutcome(tenantId, contactId, options);
  return outcome === 'sent';
}

export async function autoInviteContactToWhatsappGroup(
  tenantId: string,
  contactId: string,
  options?: { force?: boolean }
): Promise<void> {
  if (!isFeatureEnabled(process.env.WHATSAPP_GROUP_AUTO_INVITE_ON_CONTACT_CREATE, true)) {
    return;
  }

  await sendGroupInviteToContactWithOutcome(tenantId, contactId, options);
}

export async function sendGroupInviteToEligibleContacts(
  tenantId: string,
  limit: number = 300,
  options?: { force?: boolean }
): Promise<BulkInviteResult> {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 300, 2000));
  const contacts = await prisma.crmContact.findMany({
    where: {
      tenantId,
      consentWhatsapp: true,
      OR: [{ whatsappNumber: { not: null } }, { phonePrimary: { not: null } }]
    },
    select: { id: true, whatsappNumber: true, phonePrimary: true },
    take: safeLimit,
    orderBy: { createdAt: 'desc' }
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const contact of contacts) {
    const hasNumber = (contact.whatsappNumber?.trim() || contact.phonePrimary?.trim() || '').length > 0;
    if (!hasNumber) {
      skipped += 1;
      continue;
    }
    const outcome = await sendGroupInviteToContactWithOutcome(tenantId, contact.id, options);
    if (outcome === 'sent') {
      sent += 1;
      continue;
    }
    if (outcome === 'skipped_duplicate') {
      skipped += 1;
      continue;
    }
    failed += 1;
  }

  return {
    totalEligible: contacts.length,
    processed: contacts.length,
    sent,
    skipped,
    failed
  };
}

export async function sendPropertyPublishedGroupBroadcast(options: PropertyBroadcastOptions): Promise<boolean> {
  if (!isFeatureEnabled(process.env.WHATSAPP_GROUP_NOTIFY_ON_PROPERTY_PUBLISH, true)) {
    return false;
  }

  const target = getGroupBroadcastTarget();
  if (!target) {
    logger.info('Property WhatsApp group broadcast skipped: WHATSAPP_GROUP_BROADCAST_TO is not set', {
      tenantId: options.tenantId,
      propertyId: options.propertyId
    });
    return false;
  }

  if (!configureWhatsAppProvider()) {
    logger.warn('Property WhatsApp group broadcast skipped: provider not configured', {
      tenantId: options.tenantId,
      propertyId: options.propertyId
    });
    return false;
  }

  const config = await getWhatsappNotificationConfig(options.tenantId, 'PROPERTY_PUBLISHED_GROUP_BROADCAST');
  if (!config.enabled) return false;

  const defaultTemplate = WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES.PROPERTY_PUBLISHED_GROUP_BROADCAST;
  const vars: Record<string, string> = {
    propertyId: options.propertyId,
    propertyTitle: options.propertyTitle || '',
    propertySummary: truncateText(options.propertyDescription || ''),
    propertyReference: options.propertyReference || '',
    propertyType: options.propertyType || '',
    propertyTypeLabel: getLabel(options.propertyType, PROPERTY_TYPE_LABELS),
    propertyAddress: options.propertyAddress || '',
    locationZone: options.locationZone || '',
    propertyPrice: formatPrice(options.propertyPrice, options.propertyCurrency),
    propertyCurrency: options.propertyCurrency || '',
    transactionModesLabel: formatTransactionModes(options.transactionModes),
    surfaceAreaLabel: formatSurface(options.surfaceArea),
    roomsLabel: options.rooms != null ? String(options.rooms) : '',
    bedroomsLabel: options.bedrooms != null ? String(options.bedrooms) : '',
    bathroomsLabel: options.bathrooms != null ? String(options.bathrooms) : '',
    furnishingStatusLabel: getLabel(options.furnishingStatus, FURNISHING_STATUS_LABELS),
    availabilityLabel: getLabel(options.availability, AVAILABILITY_LABELS),
    publishedAt: options.publishedAt ? options.publishedAt.toISOString() : new Date().toISOString(),
    publishedAtLabel: formatPublishedAt(options.publishedAt),
    propertyPublicUrl: getPropertyPublicUrl(options.propertyId),
    inviteLink: getInviteLink()
  };

  let body = '';
  if (config.bodyOverride) {
    body = applyTemplate(config.bodyOverride, vars).trim();
  } else if (defaultTemplate) {
    body = applyTemplate(defaultTemplate, vars).trim();
  } else {
    body = buildDefaultPropertyPublishedBody(vars);
  }

  if (!config.bodyOverride) {
    body = buildDefaultPropertyPublishedBody(vars);
  }

  // Remove internal property reference line from any template variant.
  body = body.replace(/^\s*(?:🔖\s*)?Ref\s*:\s*[^\n]*\n?/gim, '').trim();

  if (!vars.propertyPublicUrl) {
    body = body.replace(/\s*Plus de details:\s*$/i, '').trim();
  }
  if (!body) return false;

  const mediaUrl = toAbsoluteMediaUrl(options.primaryImageUrl);
  const mediaBuffer = await toMediaBuffer(options.primaryImagePath);
  if (mediaUrl || mediaBuffer) {
    try {
      await sendImage({
        to: target,
        mediaUrl: mediaUrl || undefined,
        mediaBuffer,
        mediaMimeType: options.primaryImageMimeType || 'image/jpeg',
        caption: body
      });
    } catch (error) {
      logger.warn('Property WhatsApp group image broadcast failed, falling back to text', {
        tenantId: options.tenantId,
        propertyId: options.propertyId,
        mediaUrl,
        hasMediaBuffer: Boolean(mediaBuffer),
        error: error instanceof Error ? error.message : String(error)
      });
      await sendText({ to: target, body });
    }
  } else {
    await sendText({ to: target, body });
  }

  if (vars.propertyPublicUrl && isFeatureEnabled(process.env.WHATSAPP_GROUP_PROPERTY_APPEND_LINK_MESSAGE, true)) {
    // Send URL alone in a second message to maximize link auto-detection by WhatsApp clients.
    await sendText({ to: target, body: vars.propertyPublicUrl });
  }

  logger.info('Property WhatsApp group broadcast sent', {
    tenantId: options.tenantId,
    propertyId: options.propertyId
  });
  return true;
}
