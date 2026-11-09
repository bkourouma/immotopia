/**
 * Envoi des relances de loyer (contrat 049 section 3.3/3.4).
 *
 * Unitaire et lot partagent `deliverPlanned` : memes exclusions, memes canaux,
 * meme ecriture. L'eligibilite vient de `planReminders` (jamais du corps de la
 * requete). Chaque canal est tente independamment ; une ligne `RentalPaymentReminder`
 * est ecrite par canal tente. L'URL de paiement (qui contient le jeton) ne vit que
 * dans la variable du message : jamais dans un journal, un audit ou une ligne.
 */
import { AppError, ErrorCode } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { logAuditEvent, flushAuditEvents } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { revokeSecureLink } from '../../secure-links';
import { createInstallmentPaymentLink, INSTALLMENT_OBJECT_TYPE } from '../../payment-gateway/installment-payment-link';
import {
  CHANNEL_SENDERS,
  loadChannelConfigs,
  type ChannelConfigs,
  type NotificationChannel
} from '../../patrimoine/notification-channels';
import { planReminders, REMINDER_EVENT_TARGETS, type ReminderPlan } from './plan';
import type {
  BatchReminderResultDto,
  RentalReminderChannel,
  RentalReminderChannelResultDto,
  RentalReminderEventKey,
  RentalReminderExclusionReason,
  RentalReminderLevel,
  SendReminderResultDto
} from './types';

export const SEND_BATCH_MAX = 100;
const MAX_RECEIVING_NUMBERS = 5;

interface ReceivingNumber {
  operator: string;
  phone: string;
  label: string | null;
}

/** Bloc de paiement du message : lien en ligne puis numeros Mobile Money de l'agence. */
export function buildPaymentBlock(input: { url: string | null; numbers: ReceivingNumber[] }): {
  paymentUrl: string;
  paymentBlock: string;
} {
  const lines: string[] = [];
  if (input.url) lines.push(`${t('Payer en ligne')} : ${input.url}`);
  if (input.numbers.length > 0) {
    lines.push(`${t('Ou par Mobile Money')} :`);
    for (const n of input.numbers) lines.push(`${n.label || n.operator} : ${n.phone}`);
  }
  return { paymentUrl: input.url ?? '', paymentBlock: lines.join('\n') };
}

async function loadReceivingNumbers(tenantId: string): Promise<ReceivingNumber[]> {
  const rows = await prisma.rentalReceivingNumber.findMany({
    where: { tenant_id: tenantId, is_active: true },
    orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    select: { operator: true, phone: true, label: true },
    take: MAX_RECEIVING_NUMBERS
  });
  return rows.map(r => ({ operator: String(r.operator), phone: r.phone, label: r.label ?? null }));
}

/** Etat partage par un appel (unitaire ou lot) : lu une seule fois. */
interface SendContext {
  tenantId: string;
  actorUserId: string | null;
  channels?: RentalReminderChannel[];
  numbers?: Promise<ReceivingNumber[]>;
  configs: Map<RentalReminderEventKey, Promise<ChannelConfigs>>;
}

function numbersOf(ctx: SendContext): Promise<ReceivingNumber[]> {
  ctx.numbers ??= loadReceivingNumbers(ctx.tenantId);
  return ctx.numbers;
}

function configsOf(ctx: SendContext, key: RentalReminderEventKey): Promise<ChannelConfigs> {
  let p = ctx.configs.get(key);
  if (!p) {
    p = loadChannelConfigs(ctx.tenantId, REMINDER_EVENT_TARGETS[key]);
    ctx.configs.set(key, p);
  }
  return p;
}

function skipped(
  installmentId: string,
  reason: RentalReminderExclusionReason,
  level: RentalReminderLevel | null = null
): SendReminderResultDto {
  return { installmentId, status: 'SKIPPED', level, reason, failureCode: null, channels: [], paymentLinkId: null };
}

/** Relance d'une echeance planifiee. Une exclusion est rendue en SKIPPED (l'appelant decide). */
async function deliverPlanned(
  ctx: SendContext,
  plan: ReminderPlan,
  levelOverride: RentalReminderLevel | undefined
): Promise<SendReminderResultDto> {
  const { tenantId, actorUserId } = ctx;
  const item = plan.item;
  const installmentId = item.installmentId;

  if (!item.eligible) {
    return skipped(installmentId, item.exclusions[0] ?? 'NO_CONTACT_CHANNEL');
  }
  const level = levelOverride ?? item.nextLevel;
  if (!level) return skipped(installmentId, 'MAX_LEVEL_REACHED');
  if (!plan.recipient) return skipped(installmentId, 'NO_CONTACT_CHANNEL', level);

  const channels = plan.usableChannels.filter(c => !ctx.channels || ctx.channels.includes(c as RentalReminderChannel));
  if (channels.length === 0) return skipped(installmentId, 'NO_CONTACT_CHANNEL', level);

  // 1. Lien de paiement (un nouveau a chaque relance : seul le hash du jeton est en base).
  let link: { id: string; url: string } | null = null;
  if (item.paymentLinkIncluded) {
    try {
      const created = await createInstallmentPaymentLink(tenantId, installmentId, actorUserId);
      link = { id: created.link.id, url: created.link.url };
    } catch (error) {
      logger.warn('sendReminder: lien de paiement non cree, relance sans lien', {
        tenantId,
        installmentId,
        error: error instanceof Error ? error.name : 'error'
      });
    }
  }

  // 2. Variables du message.
  const numbers = await numbersOf(ctx);
  const { paymentUrl, paymentBlock } = buildPaymentBlock({ url: link?.url ?? null, numbers });
  const amountText = `${item.amountDue.toLocaleString('fr-FR')} ${item.currency}`;
  const variables: Record<string, string> = {
    contactName: plan.contactName ?? '',
    tenantName: plan.contactName ?? '',
    renterName: plan.contactName || t('Locataire'),
    agencyName: plan.agencyName,
    leaseNumber: plan.leaseNumber ?? '',
    leaseLabel: plan.leaseNumber ?? '',
    propertyAddress: plan.propertyAddress ?? '',
    period: `${String(item.periodMonth).padStart(2, '0')}/${item.periodYear}`,
    dueDate: new Date(item.dueDate).toLocaleDateString('fr-FR', { timeZone: 'UTC' }),
    dueAmount: amountText,
    amount: amountText,
    level: String(level),
    paymentUrl,
    paymentBlock
  };

  // 3. Envoi canal par canal, independants.
  const configs = await configsOf(ctx, item.eventKey);
  const attempts: Array<{ channel: NotificationChannel; ok: boolean }> = [];
  for (const channel of channels) {
    let ok = false;
    try {
      ok = await CHANNEL_SENDERS[channel].send({
        tenantId,
        recipient: plan.recipient,
        configs,
        targets: REMINDER_EVENT_TARGETS[item.eventKey],
        variables,
        journal: { relatedEntity: { type: 'RentalInstallment', id: installmentId } }
      });
    } catch (error) {
      logger.warn('sendReminder: echec d envoi sur un canal', {
        tenantId,
        installmentId,
        channel,
        error: error instanceof Error ? error.name : 'error'
      });
    }
    attempts.push({ channel, ok });
  }
  const anySent = attempts.some(a => a.ok);

  // 4. Tous KO : le lien cree est revoque, aucune trace de lien n'est conservee.
  if (!anySent && link) {
    try {
      await revokeSecureLink(tenantId, link.id, actorUserId ?? 'system', {
        objectType: INSTALLMENT_OBJECT_TYPE,
        objectId: installmentId
      });
    } catch (error) {
      logger.error('sendReminder: revocation du lien impossible apres echec', {
        tenantId,
        installmentId,
        linkId: link.id,
        error: error instanceof Error ? error.name : 'error'
      });
    }
    link = null;
  }
  const paymentLinkId = link?.id ?? null;

  // 5. Une ligne par canal tente.
  const sentAt = new Date();
  const channelResults: RentalReminderChannelResultDto[] = [];
  for (const a of attempts) {
    const row = await prisma.rentalPaymentReminder.create({
      data: {
        tenant_id: tenantId,
        installment_id: installmentId,
        lease_id: item.leaseId,
        level,
        channel: a.channel,
        status: a.ok ? 'SENT' : 'FAILED',
        sent_by: actorUserId,
        sent_at: sentAt,
        payment_link_id: paymentLinkId,
        failure_code: a.ok ? null : 'SEND_FAILED'
      },
      select: { id: true }
    });
    channelResults.push({
      channel: a.channel as RentalReminderChannel,
      status: a.ok ? 'SENT' : 'FAILED',
      failureCode: a.ok ? null : 'SEND_FAILED',
      reminderId: row?.id ?? null
    });
  }

  const status = anySent ? 'SENT' : 'FAILED';
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.RENTAL_PAYMENT_REMINDER_SENT,
    entityType: 'RentalInstallment',
    entityId: installmentId,
    // Jamais d'URL, de jeton ni de contenu.
    payload: {
      installmentId,
      leaseId: item.leaseId,
      level,
      channels: attempts.map(a => a.channel),
      status,
      paymentLinkId
    }
  });
  await flushAuditEvents();
  logger.info('sendReminder completed', { tenantId, installmentId, level, status });

  return {
    installmentId,
    status,
    level,
    reason: null,
    failureCode: anySent ? null : 'SEND_FAILED',
    channels: channelResults,
    paymentLinkId
  };
}

function newContext(tenantId: string, actorUserId: string | null, channels?: RentalReminderChannel[]): SendContext {
  return { tenantId, actorUserId, channels, configs: new Map() };
}

export async function sendInstallmentReminder(
  tenantId: string,
  actorUserId: string | null,
  installmentId: string,
  body: { channels?: RentalReminderChannel[]; level?: RentalReminderLevel }
): Promise<SendReminderResultDto> {
  const [plan] = await planReminders(tenantId, [installmentId]);
  const result = await deliverPlanned(newContext(tenantId, actorUserId, body.channels), plan, body.level);
  if (result.status === 'SKIPPED') {
    const reason = result.reason ?? 'NO_CONTACT_CHANNEL';
    const tooSoon = reason === 'TOO_SOON';
    throw new AppError(
      tooSoon
        ? t('Une relance a déjà été envoyée il y a moins de 7 jours pour cette échéance.')
        : t("Cette échéance n'est pas éligible à une relance."),
      409,
      tooSoon ? ErrorCode.RENTAL_REMINDER_TOO_SOON : ErrorCode.RENTAL_REMINDER_NOT_ELIGIBLE,
      undefined,
      { installmentId, reason, exclusions: plan.item.exclusions }
    );
  }
  return result;
}

export async function sendReminderBatch(
  tenantId: string,
  actorUserId: string | null,
  body: { installmentIds: string[]; channels?: RentalReminderChannel[] }
): Promise<BatchReminderResultDto> {
  // 404 uniforme avant tout envoi : un id etranger a l'agence interrompt tout le lot.
  const plans = await planReminders(tenantId, body.installmentIds);
  const ctx = newContext(tenantId, actorUserId, body.channels);
  const results: SendReminderResultDto[] = [];
  for (const plan of plans) {
    try {
      results.push(await deliverPlanned(ctx, plan, undefined));
    } catch (error) {
      logger.error('sendReminderBatch: echec inattendu sur une ligne', {
        tenantId,
        installmentId: plan.item.installmentId,
        error: error instanceof Error ? error.name : 'error'
      });
      results.push({
        installmentId: plan.item.installmentId,
        status: 'FAILED',
        level: null,
        reason: null,
        failureCode: 'SEND_FAILED',
        channels: [],
        paymentLinkId: null
      });
    }
  }
  return {
    results,
    totals: {
      sent: results.filter(r => r.status === 'SENT').length,
      skipped: results.filter(r => r.status === 'SKIPPED').length,
      failed: results.filter(r => r.status === 'FAILED').length
    }
  };
}
