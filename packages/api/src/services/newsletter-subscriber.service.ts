import crypto from 'crypto';
import type { NewsletterSubscriberStatus } from '@prisma/client';
import { prisma } from '../utils/database';
import { emailService } from './email-service';
import { resolveRecipients } from './newsletter-campaign.service';

/** Parse CSV buffer to array of { email?, name? } */
function parseCsvBuffer(buffer: Buffer): Array<{ email?: string; name?: string }> {
  const text = buffer.toString('utf-8');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const emailIdx = headers.findIndex(h => h === 'email' || h === 'e-mail');
  const nameIdx = headers.findIndex(h => h === 'name' || h === 'nom');
  const result: Array<{ email?: string; name?: string }> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    result.push({
      email: emailIdx >= 0 ? cols[emailIdx] : cols[0],
      name: nameIdx >= 0 ? cols[nameIdx] : cols[1]
    });
  }
  return result;
}

/**
 * NewsletterSubscriberService - Gestion des abonnés (add, list, import CSV, export, remove)
 * @see specs/012-newsletter-mailing/data-model.md
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(String(email).trim().toLowerCase());
}

export async function addSubscriber(tenantId: string, listId: string, data: { email: string; name?: string }) {
  const list = await prisma.newsletterList.findFirst({ where: { id: listId, tenantId } });
  if (!list) throw new Error('Liste non trouvée.');
  if (list.type !== 'MANUAL') throw new Error("Les listes dérivées ne peuvent pas recevoir d'ajout manuel.");

  const email = data.email.trim().toLowerCase();
  if (!isValidEmail(email)) throw new Error('Adresse email invalide.');

  const existing = await prisma.newsletterSubscriber.findUnique({
    where: { listId_email: { listId, email } }
  });
  if (existing) throw new Error('Cet email est déjà inscrit à cette liste.');

  return prisma.newsletterSubscriber.create({
    data: {
      tenantId,
      listId,
      email,
      name: data.name?.trim() || null,
      status: 'ACTIVE'
    }
  });
}

export async function listSubscribers(
  tenantId: string,
  listId: string,
  options: { status?: string; page?: number; limit?: number }
) {
  const where: { listId: string; tenantId: string; status?: NewsletterSubscriberStatus } = { listId, tenantId };
  if (options.status) where.status = options.status as NewsletterSubscriberStatus;

  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const skip = (page - 1) * limit;

  const [subscribers, total] = await Promise.all([
    prisma.newsletterSubscriber.findMany({
      where,
      orderBy: { subscribedAt: 'desc' },
      skip,
      take: limit
    }),
    prisma.newsletterSubscriber.count({ where })
  ]);

  return {
    subscribers,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
}

export interface ImportResult {
  accepted: number;
  rejected: number;
  duplicateCount: number;
  errors: string[];
}

export async function importFromCsv(tenantId: string, listId: string, buffer: Buffer): Promise<ImportResult> {
  const list = await prisma.newsletterList.findFirst({ where: { id: listId, tenantId } });
  if (!list) throw new Error('Liste non trouvée.');
  if (list.type !== 'MANUAL') throw new Error('Les listes dérivées ne peuvent pas être importées.');

  const result: ImportResult = { accepted: 0, rejected: 0, duplicateCount: 0, errors: [] };
  const records = parseCsvBuffer(buffer);

  for (const row of records) {
    const email = (row.email ?? '').trim().toLowerCase();
    if (!email) {
      result.rejected++;
      continue;
    }
    if (!isValidEmail(email)) {
      result.rejected++;
      result.errors.push(`Email invalide: ${email}`);
      continue;
    }

    const existing = await prisma.newsletterSubscriber.findUnique({
      where: { listId_email: { listId, email } }
    });
    if (existing) {
      result.duplicateCount++;
      continue;
    }

    try {
      await prisma.newsletterSubscriber.create({
        data: { tenantId, listId, email, name: row.name?.trim() || null, status: 'ACTIVE' }
      });
      result.accepted++;
    } catch {
      result.rejected++;
    }
  }

  return result;
}

export async function exportToCsv(tenantId: string, listId: string): Promise<string> {
  const list = await prisma.newsletterList.findFirst({ where: { id: listId, tenantId } });
  if (!list) throw new Error('Liste non trouvée.');

  const headers = ['email', 'name', 'status', 'subscribed_at', 'confirmed_at', 'unsubscribed_at'];

  if (list.type === 'MANUAL') {
    const subscribers = await prisma.newsletterSubscriber.findMany({
      where: { listId, tenantId },
      orderBy: { subscribedAt: 'asc' }
    });
    const rows = subscribers.map(s =>
      [
        s.email,
        s.name ?? '',
        s.status,
        s.subscribedAt?.toISOString() ?? '',
        s.confirmedAt?.toISOString() ?? '',
        s.unsubscribedAt?.toISOString() ?? ''
      ].join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  }

  const recipients = await resolveRecipients(tenantId, listId);
  const rows = recipients.map(r =>
    [r.email, [r.prenom, r.nom].filter(Boolean).join(' ').trim() || '', 'DESTINATAIRE', '', '', ''].join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

/**
 * Add multiple subscribers from CRM contact IDs (for manual lists only).
 * Each contact's email (and name) is added; duplicates are skipped.
 */
export async function addSubscribersFromContactIds(
  tenantId: string,
  listId: string,
  contactIds: string[]
): Promise<{ added: number; skipped: number; errors: string[] }> {
  const list = await prisma.newsletterList.findFirst({ where: { id: listId, tenantId } });
  if (!list) throw new Error('Liste non trouvée.');
  if (list.type !== 'MANUAL') throw new Error("Les listes dérivées ne peuvent pas recevoir d'ajout manuel.");

  const contacts = await prisma.crmContact.findMany({
    where: { id: { in: contactIds }, tenantId },
    select: { id: true, email: true, firstName: true, lastName: true }
  });

  const result = { added: 0, skipped: 0, errors: [] as string[] };

  for (const c of contacts) {
    const email = c.email.trim().toLowerCase();
    if (!isValidEmail(email)) {
      result.errors.push(`Email invalide pour ${c.firstName} ${c.lastName}: ${email}`);
      result.skipped++;
      continue;
    }

    const existing = await prisma.newsletterSubscriber.findUnique({
      where: { listId_email: { listId, email } }
    });
    if (existing) {
      result.skipped++;
      continue;
    }

    try {
      await prisma.newsletterSubscriber.create({
        data: {
          tenantId,
          listId,
          email,
          name: [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || null,
          status: 'ACTIVE'
        }
      });
      result.added++;
    } catch {
      result.skipped++;
      result.errors.push(`Impossible d'ajouter: ${email}`);
    }
  }

  return result;
}

export async function removeSubscriber(tenantId: string, subscriberId: string) {
  const sub = await prisma.newsletterSubscriber.findFirst({
    where: { id: subscriberId, tenantId },
    include: { list: true }
  });
  if (!sub) throw new Error('Abonné non trouvé.');
  if (sub.list.type !== 'MANUAL') throw new Error("Impossible de retirer un abonné d'une liste dérivée.");

  await prisma.newsletterSubscriber.delete({ where: { id: subscriberId, tenantId } });
  return { success: true };
}

const CONFIRMATION_TOKEN_EXPIRY_DAYS = 7;

export function generateConfirmationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function getBaseUrl(): string {
  return process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
}

export interface SubscribePublicInput {
  listToken?: string;
  listId?: string;
  email: string;
  name?: string;
}

export interface SubscribePublicResult {
  success: boolean;
  message: string;
  pendingConfirmation?: boolean;
}

/**
 * Inscription publique à une newsletter (double opt-in).
 * Utilise listToken (public_subscribe_token) ou listId pour identifier la liste.
 */
export async function subscribePublic(input: SubscribePublicInput): Promise<SubscribePublicResult> {
  let list;
  if (input.listToken) {
    list = await prisma.newsletterList.findFirst({
      where: { publicSubscribeToken: input.listToken, type: 'MANUAL' }
    });
  } else if (input.listId) {
    list = await prisma.newsletterList.findFirst({
      where: { id: input.listId, type: 'MANUAL' }
    });
  }
  if (!list) {
    return { success: false, message: 'Liste non trouvée ou non accessible.' };
  }
  if (!list.publicSubscribeToken) {
    return { success: false, message: "Cette liste n'accepte pas les inscriptions publiques." };
  }

  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { success: false, message: 'Adresse email invalide.' };
  }

  const existing = await prisma.newsletterSubscriber.findUnique({
    where: { listId_email: { listId: list.id, email } }
  });
  if (existing) {
    if (existing.status === 'ACTIVE') {
      return { success: true, message: 'Vous êtes déjà inscrit à cette newsletter.' };
    }
    if (existing.status === 'PENDING_CONFIRMATION') {
      return {
        success: true,
        message: 'Un email de confirmation vous a déjà été envoyé. Vérifiez votre boîte de réception.',
        pendingConfirmation: true
      };
    }
    if (existing.status === 'UNSUBSCRIBED') {
      // Ré-inscription : on met à jour au lieu de créer
      if (!list.doubleOptIn) {
        await prisma.newsletterSubscriber.update({
          where: { id: existing.id },
          data: {
            status: 'ACTIVE',
            confirmationToken: null,
            confirmationTokenExpiresAt: null,
            subscribedAt: new Date(),
            confirmedAt: new Date(),
            unsubscribedAt: null,
            name: input.name?.trim() || existing.name
          }
        });
        return { success: true, message: 'Votre inscription est confirmée.' };
      }
      const token = generateConfirmationToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + CONFIRMATION_TOKEN_EXPIRY_DAYS);
      await prisma.newsletterSubscriber.update({
        where: { id: existing.id },
        data: {
          status: 'PENDING_CONFIRMATION',
          confirmationToken: token,
          confirmationTokenExpiresAt: expiresAt,
          subscribedAt: new Date(),
          confirmedAt: null,
          unsubscribedAt: null,
          name: input.name?.trim() || existing.name
        }
      });
      await sendConfirmationEmail(email, token, input.name);
      return { success: true, message: 'Un email de confirmation vous a été envoyé.', pendingConfirmation: true };
    }
  }

  // Liste sans double opt-in : l'abonné est actif tout de suite, sans e-mail.
  if (!list.doubleOptIn) {
    const now = new Date();
    await prisma.newsletterSubscriber.create({
      data: {
        tenantId: list.tenantId,
        listId: list.id,
        email,
        name: input.name?.trim() || null,
        status: 'ACTIVE',
        confirmedAt: now
      }
    });
    return { success: true, message: 'Votre inscription est confirmée.' };
  }

  const token = generateConfirmationToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + CONFIRMATION_TOKEN_EXPIRY_DAYS);

  await prisma.newsletterSubscriber.create({
    data: {
      tenantId: list.tenantId,
      listId: list.id,
      email,
      name: input.name?.trim() || null,
      status: 'PENDING_CONFIRMATION',
      confirmationToken: token,
      confirmationTokenExpiresAt: expiresAt
    }
  });

  await sendConfirmationEmail(email, token, input.name);
  return { success: true, message: 'Un email de confirmation vous a été envoyé.', pendingConfirmation: true };
}

async function sendConfirmationEmail(to: string, token: string, name?: string): Promise<void> {
  const confirmUrl = `${getBaseUrl()}/newsletter/confirm?token=${token}`;
  const prenom = name?.split(/\s+/)[0] || 'Cher abonné';
  await emailService.sendEmail({
    to,
    subject: 'Confirmez votre inscription à notre newsletter',
    html: `
      <p>Bonjour ${prenom},</p>
      <p>Vous avez demandé à vous inscrire à notre newsletter. Pour confirmer votre inscription, cliquez sur le lien ci-dessous :</p>
      <p><a href="${confirmUrl}">${confirmUrl}</a></p>
      <p>Ce lien expire sous 7 jours.</p>
      <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
      <p>— L'équipe ImmoTopia</p>
    `
  });
}

export async function confirmSubscription(token: string) {
  const sub = await prisma.newsletterSubscriber.findFirst({
    where: { confirmationToken: token }
  });
  if (!sub) return { success: false, alreadyActive: false };
  if (sub.status === 'ACTIVE') return { success: true, alreadyActive: true };
  // Un abonné désabonné depuis l'envoi du lien ne doit pas être réactivé par lui.
  if (sub.status !== 'PENDING_CONFIRMATION') return { success: false, alreadyActive: false };
  if (sub.confirmationTokenExpiresAt && sub.confirmationTokenExpiresAt < new Date()) {
    return { success: false, alreadyActive: false };
  }

  await prisma.newsletterSubscriber.update({
    where: { id: sub.id },
    // Le jeton est conservé : un second clic sur le même lien répond « déjà inscrit ».
    data: { status: 'ACTIVE', confirmedAt: new Date() }
  });
  return { success: true, alreadyActive: false };
}

export async function unsubscribeByToken(token: string, unsubscribeAll = false) {
  const recipient = await prisma.newsletterCampaignRecipient.findFirst({
    where: { unsubscribeToken: token },
    include: { subscriber: true, campaign: true }
  });

  if (!recipient) return { success: false };

  if (recipient.subscriberId && recipient.subscriber) {
    if (unsubscribeAll) {
      await prisma.newsletterSubscriber.updateMany({
        where: {
          tenantId: recipient.tenantId,
          email: recipient.subscriber.email
        },
        data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() }
      });
    } else {
      await prisma.newsletterSubscriber.update({
        where: { id: recipient.subscriberId!, tenantId: recipient.tenantId },
        data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() }
      });
    }
  }
  return { success: true };
}
