/**
 * Plan des relances de loyer (contrat 049 section 3.1/3.2).
 *
 * Source unique de verite de l'eligibilite d'une echeance a une relance :
 * `computeReminderPlan` (fonction pure). `planReminders` (chemin d'envoi,
 * unitaire et lot) et `buildReminderPreview` (apercu) l'appellent avec les memes
 * faits, lus en requetes groupees (pas de N+1) et TOUJOURS filtres par agence.
 *
 * Ce module ne fait aucune ecriture, aucun envoi et ne journalise aucun contenu.
 */
import { NotFoundError } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';
import { prisma } from '../../../utils/database';
import { computeInstallmentStatus, startOfDay } from '../../finance/installment-status';
import { resolveRentalOnlineAvailability } from '../../payment-gateway/availability';
import { resteDuEcheance } from '../../payment-gateway/checkout';
import {
  CHANNEL_RECIPIENT_SELECT,
  loadChannelConfigs,
  planChannels,
  type ChannelConfigs,
  type ChannelRecipient,
  type ChannelTargets,
  type NotificationChannel
} from '../../patrimoine/notification-channels';
import type {
  RentalReminderEventKey,
  RentalReminderExclusionReason,
  RentalReminderLevel,
  RentalReminderPreviewDto,
  RentalReminderPreviewGroupDto,
  RentalReminderPreviewItemDto,
  RentalReminderPreviewQuery
} from './types';

/** Espacement minimal entre deux niveaux envoyes (SENT). */
export const REMINDER_MIN_GAP_DAYS = 7;
/** Une declaration PENDING creee depuis moins de ce nombre de jours bloque la relance. */
export const PENDING_DECLARATION_WINDOW_DAYS = 7;
/** Une tentative de paiement en ligne PENDING plus recente que ceci bloque la relance. */
export const PENDING_ONLINE_WINDOW_MS = 15 * 60 * 1000;
export const MAX_PREVIEW_ITEMS = 500;
/** Fenetre `daysBefore` utilisee a l'envoi (unitaire et lot). */
export const SEND_DAYS_BEFORE_WINDOW = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LEVEL = 3;

export const REMINDER_EVENT_TARGETS: Record<RentalReminderEventKey, ChannelTargets> = {
  INSTALLMENT_DUE_REMINDER: { email: 'INSTALLMENT_DUE_REMINDER', whatsapp: 'INSTALLMENT_DUE_REMINDER' },
  INSTALLMENT_OVERDUE: { email: 'INSTALLMENT_OVERDUE', whatsapp: 'INSTALLMENT_OVERDUE' }
};

export interface ReminderPlan {
  item: RentalReminderPreviewItemDto;
  recipient: ChannelRecipient | null;
  contactName: string | null;
  agencyName: string;
  leaseNumber: string | null;
  propertyAddress: string | null;
  usableChannels: NotificationChannel[];
}

export interface ReminderPlanFacts {
  now: Date;
  /** Fenetre en jours avant echeance (0..30). */
  daysBefore: number;
  dueDate: Date | string;
  /** Echeance annulee (traitee comme soldee). */
  canceled: boolean;
  /** Brouillon a venir, non emis. */
  draftNotIssued: boolean;
  /** Reste du (FCFA) ; <= 0 : solde. */
  amountDue: number;
  leaseActive: boolean;
  /** Le bail a un locataire principal (TenantClient). */
  hasCurrentTenant: boolean;
  /** Fiche CRM du locataire trouvee. */
  hasContact: boolean;
  /** Raison renvoyee par planChannels quand aucun canal n'est utilisable. */
  channelFailure?: 'EVENT_DISABLED' | 'NO_ELIGIBLE_CHANNEL';
  /** Relances SENT de l'echeance (les FAILED sont ignorees par l'appelant ou ici). */
  reminders: Array<{ level: number; status: string; sentAt: Date }>;
  pendingDeclarations: Array<{ createdAt: Date }>;
  onlineCheckouts: Array<{ status: string; createdAt: Date }>;
}

export interface ReminderPlanOutcome {
  eligible: boolean;
  exclusions: RentalReminderExclusionReason[];
  nextLevel: RentalReminderLevel | null;
  eventKey: RentalReminderEventKey;
  daysLate: number;
  lastLevelSent: number | null;
  lastSentAt: string | null;
}

export function calendarDaysLate(dueDate: Date | string, now: Date): number {
  return Math.round((startOfDay(now).getTime() - startOfDay(new Date(dueDate)).getTime()) / DAY_MS);
}

/** Fonction PURE : exclusions, niveau et eligibilite d'une echeance. */
export function computeReminderPlan(facts: ReminderPlanFacts): ReminderPlanOutcome {
  const { now } = facts;
  const daysLate = calendarDaysLate(facts.dueDate, now);
  const eventKey: RentalReminderEventKey = daysLate > 0 ? 'INSTALLMENT_OVERDUE' : 'INSTALLMENT_DUE_REMINDER';

  const sent = facts.reminders.filter(r => r.status === 'SENT').sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  const lastLevelSent = sent.length > 0 ? Math.max(...sent.map(r => r.level)) : null;
  const lastSent = sent[0] ?? null;

  const exclusions: RentalReminderExclusionReason[] = [];
  if (facts.canceled || facts.amountDue <= 0) exclusions.push('ALREADY_PAID');
  if (!facts.leaseActive) exclusions.push('LEASE_NOT_ACTIVE');
  if (facts.draftNotIssued || daysLate < -facts.daysBefore) exclusions.push('NOT_DUE_YET');

  const declarationSince = now.getTime() - PENDING_DECLARATION_WINDOW_DAYS * DAY_MS;
  if (facts.pendingDeclarations.some(d => d.createdAt.getTime() >= declarationSince)) {
    exclusions.push('PENDING_DECLARATION');
  }
  const onlineSince = now.getTime() - PENDING_ONLINE_WINDOW_MS;
  if (
    facts.onlineCheckouts.some(
      c => c.status === 'REVIEW' || (c.status === 'PENDING' && c.createdAt.getTime() >= onlineSince)
    )
  ) {
    exclusions.push('PENDING_ONLINE_ATTEMPT');
  }

  if (lastSent && now.getTime() - lastSent.sentAt.getTime() < REMINDER_MIN_GAP_DAYS * DAY_MS) {
    exclusions.push('TOO_SOON');
  }

  let nextLevel: RentalReminderLevel | null = Math.max(1, (lastLevelSent ?? 0) + 1) as RentalReminderLevel;
  if ((lastLevelSent ?? 0) >= MAX_LEVEL) {
    exclusions.push('MAX_LEVEL_REACHED');
    nextLevel = null;
  }

  if (!facts.hasCurrentTenant) {
    exclusions.push('NO_CURRENT_TENANT');
  } else if (!facts.hasContact) {
    exclusions.push('NO_CONTACT_CHANNEL');
  } else if (facts.channelFailure === 'EVENT_DISABLED') {
    exclusions.push('EVENT_DISABLED');
  } else if (facts.channelFailure === 'NO_ELIGIBLE_CHANNEL') {
    exclusions.push('NO_CONTACT_CHANNEL');
  }

  return {
    eligible: exclusions.length === 0,
    exclusions,
    nextLevel,
    eventKey,
    daysLate,
    lastLevelSent,
    lastSentAt: lastSent ? lastSent.sentAt.toISOString() : null
  };
}

/** La relance ne joint un lien que si le paiement en ligne locatif est utilisable (contrat 049 2.8). */
export async function isRentalGatewayUsableForReminders(tenantId: string): Promise<boolean> {
  return (await resolveRentalOnlineAvailability(tenantId)).usable;
}

const INSTALLMENT_SELECT = {
  id: true,
  lease_id: true,
  period_year: true,
  period_month: true,
  due_date: true,
  status: true,
  currency: true,
  amount_rent: true,
  amount_service: true,
  amount_other_fees: true,
  penalty_amount: true,
  amount_paid: true,
  payments: { select: { amount: true, payment: { select: { status: true } } } },
  tenant: { select: { name: true } },
  lease: {
    select: {
      status: true,
      lease_number: true,
      primary_renter_client_id: true,
      property: { select: { title: true, address: true } }
    }
  }
} as const;

type InstallmentRow = {
  id: string;
  lease_id: string;
  period_year: number;
  period_month: number;
  due_date: Date;
  status: any;
  currency: string;
  amount_rent: unknown;
  amount_service: unknown;
  amount_other_fees: unknown;
  penalty_amount: unknown;
  amount_paid: unknown;
  payments: Array<{ amount: unknown; payment: { status: string } | null }>;
  tenant: { name: string } | null;
  lease: {
    status: string;
    lease_number: string | null;
    primary_renter_client_id: string | null;
    property: { title: string | null; address: string | null } | null;
  } | null;
};

interface RenterInfo {
  recipient: ChannelRecipient | null;
  contactName: string | null;
}

/**
 * Locataires actuels des baux : TenantClient -> e-mail du compte -> fiche CRM de l'agence
 * (insensible a la casse, plus ancienne fiche en depart age). Requetes groupees.
 */
async function loadRenters(tenantId: string, clientIds: string[]): Promise<Map<string, RenterInfo | null>> {
  const result = new Map<string, RenterInfo | null>();
  if (clientIds.length === 0) return result;

  const clients = await prisma.tenantClient.findMany({
    where: { tenantId, id: { in: clientIds } },
    select: { id: true, user: { select: { email: true, fullName: true } } }
  });
  const emails = new Map<string, string>();
  for (const c of clients) {
    const email = c.user?.email?.trim();
    if (email) emails.set(email.toLowerCase(), email);
  }
  const contacts = emails.size
    ? await prisma.crmContact.findMany({
        where: {
          tenantId,
          OR: [...emails.values()].map(email => ({ email: { equals: email, mode: 'insensitive' as const } }))
        },
        select: { ...CHANNEL_RECIPIENT_SELECT, firstName: true, lastName: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
      })
    : [];
  const contactByEmail = new Map<string, (typeof contacts)[number]>();
  for (const contact of contacts) {
    const key = contact.email?.trim().toLowerCase();
    if (key && !contactByEmail.has(key)) contactByEmail.set(key, contact);
  }

  for (const id of clientIds) {
    const client = clients.find(c => c.id === id);
    if (!client) {
      result.set(id, null);
      continue;
    }
    const email = client.user?.email?.trim().toLowerCase();
    const contact = email ? contactByEmail.get(email) : undefined;
    const userName = client.user?.fullName?.trim() || null;
    if (!contact) {
      result.set(id, { recipient: null, contactName: userName });
      continue;
    }
    const crmName = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
    result.set(id, {
      recipient: {
        contactId: contact.id,
        email: contact.email?.trim() || null,
        consentEmail: contact.consentEmail ?? null,
        whatsappNumber: contact.whatsappNumber ?? null,
        phonePrimary: contact.phonePrimary ?? null,
        consentWhatsapp: contact.consentWhatsapp ?? null,
        preferredContactChannel: contact.preferredContactChannel ?? null
      },
      contactName: crmName || userName
    });
  }
  return result;
}

async function buildPlans(
  tenantId: string,
  rows: InstallmentRow[],
  now: Date,
  daysBefore: number
): Promise<ReminderPlan[]> {
  if (rows.length === 0) return [];
  const ids = rows.map(r => r.id);
  const clientIds = [
    ...new Set(rows.map(r => r.lease?.primary_renter_client_id).filter((v): v is string => Boolean(v)))
  ];
  const keys = [
    ...new Set(
      rows.map(r => (calendarDaysLate(r.due_date, now) > 0 ? 'INSTALLMENT_OVERDUE' : 'INSTALLMENT_DUE_REMINDER'))
    )
  ] as RentalReminderEventKey[];

  const [reminders, declarations, checkouts, renters, gatewayUsable, configEntries] = await Promise.all([
    prisma.rentalPaymentReminder.findMany({
      where: { tenant_id: tenantId, installment_id: { in: ids }, status: 'SENT' },
      select: { installment_id: true, level: true, status: true, sent_at: true }
    }),
    prisma.rentalPaymentDeclaration.findMany({
      where: {
        tenant_id: tenantId,
        installment_id: { in: ids },
        status: 'PENDING',
        created_at: { gte: new Date(now.getTime() - PENDING_DECLARATION_WINDOW_DAYS * DAY_MS) }
      },
      select: { installment_id: true, created_at: true }
    }),
    prisma.onlinePaymentCheckout.findMany({
      where: {
        tenantId,
        installmentIds: { hasSome: ids },
        OR: [
          { status: 'PENDING', createdAt: { gte: new Date(now.getTime() - PENDING_ONLINE_WINDOW_MS) } },
          { status: 'REVIEW' }
        ]
      },
      select: { installmentIds: true, status: true, createdAt: true }
    }),
    loadRenters(tenantId, clientIds),
    isRentalGatewayUsableForReminders(tenantId),
    Promise.all(keys.map(async key => [key, await loadChannelConfigs(tenantId, REMINDER_EVENT_TARGETS[key])] as const))
  ]);
  const configs = new Map<RentalReminderEventKey, ChannelConfigs>(configEntries);

  return rows.map(row => {
    const lease = row.lease;
    const clientId = lease?.primary_renter_client_id ?? null;
    const renter = clientId ? (renters.get(clientId) ?? null) : null;
    const recipient = renter?.recipient ?? null;
    const amountDue = Math.round(resteDuEcheance(row) * 100) / 100;
    const canceled = row.status === 'CANCELED';
    const draftNotIssued = !canceled && computeInstallmentStatus(row as any, now, { emitDraft: false }) === 'DRAFT';

    const eventKey: RentalReminderEventKey =
      calendarDaysLate(row.due_date, now) > 0 ? 'INSTALLMENT_OVERDUE' : 'INSTALLMENT_DUE_REMINDER';
    let usableChannels: NotificationChannel[] = [];
    let channelFailure: ReminderPlanFacts['channelFailure'];
    if (recipient) {
      const channelPlan = planChannels(recipient, configs.get(eventKey) ?? {}, REMINDER_EVENT_TARGETS[eventKey]);
      usableChannels = channelPlan.channels;
      if (channelPlan.channels.length === 0) {
        channelFailure = channelPlan.reason === 'EVENT_DISABLED' ? 'EVENT_DISABLED' : 'NO_ELIGIBLE_CHANNEL';
      }
    }

    const outcome = computeReminderPlan({
      now,
      daysBefore,
      dueDate: row.due_date,
      canceled,
      draftNotIssued,
      amountDue,
      leaseActive: lease?.status === 'ACTIVE',
      hasCurrentTenant: Boolean(clientId),
      hasContact: Boolean(recipient),
      channelFailure,
      reminders: reminders
        .filter(r => r.installment_id === row.id)
        .map(r => ({ level: r.level, status: String(r.status), sentAt: r.sent_at })),
      pendingDeclarations: declarations
        .filter(d => d.installment_id === row.id)
        .map(d => ({ createdAt: d.created_at })),
      onlineCheckouts: checkouts
        .filter(c => c.installmentIds.includes(row.id))
        .map(c => ({ status: String(c.status), createdAt: c.createdAt }))
    });

    const contactExcluded = outcome.exclusions.some(
      e => e === 'NO_CONTACT_CHANNEL' || e === 'EVENT_DISABLED' || e === 'NO_CURRENT_TENANT'
    );
    const channels = outcome.eligible || !contactExcluded ? usableChannels : [];

    const item: RentalReminderPreviewItemDto = {
      installmentId: row.id,
      leaseId: row.lease_id,
      leaseReference: lease?.lease_number ?? null,
      propertyLabel: lease?.property?.title ?? null,
      tenantClientId: clientId,
      tenantName: renter?.contactName ?? null,
      periodYear: row.period_year,
      periodMonth: row.period_month,
      dueDate: row.due_date.toISOString(),
      daysLate: outcome.daysLate,
      amountDue,
      currency: row.currency,
      eventKey: outcome.eventKey,
      nextLevel: outcome.nextLevel,
      lastLevelSent: outcome.lastLevelSent,
      lastSentAt: outcome.lastSentAt,
      channels,
      paymentLinkIncluded: gatewayUsable,
      eligible: outcome.eligible,
      exclusions: outcome.exclusions
    };
    return {
      item,
      recipient,
      contactName: renter?.contactName ?? null,
      agencyName: row.tenant?.name ?? '',
      leaseNumber: lease?.lease_number ?? null,
      propertyAddress: lease?.property?.address ?? null,
      usableChannels
    };
  });
}

/** Plan de N echeances de l'agence, meme ordre que `installmentIds`. N'ecrit rien. */
export async function planReminders(
  tenantId: string,
  installmentIds: string[],
  opts?: { now?: Date; daysBefore?: number }
): Promise<ReminderPlan[]> {
  const now = opts?.now ?? new Date();
  const daysBefore = opts?.daysBefore ?? SEND_DAYS_BEFORE_WINDOW;
  const uniqueIds = [...new Set(installmentIds)];
  const rows = (await prisma.rentalInstallment.findMany({
    where: { id: { in: uniqueIds }, tenant_id: tenantId },
    select: INSTALLMENT_SELECT
  })) as unknown as InstallmentRow[];
  if (rows.length !== uniqueIds.length) throw new NotFoundError(t('Échéance introuvable.'));

  const plans = await buildPlans(tenantId, rows, now, daysBefore);
  const byId = new Map(plans.map(p => [p.item.installmentId, p]));
  return installmentIds.map(id => byId.get(id)!);
}

/** Apercu GET /payment-reminders/preview. */
export async function buildReminderPreview(
  tenantId: string,
  query: RentalReminderPreviewQuery,
  now: Date = new Date()
): Promise<RentalReminderPreviewDto> {
  const daysBefore = Math.min(30, Math.max(0, Math.trunc(query.daysBefore ?? 0)));
  const minDaysLate = Math.max(0, Math.trunc(query.minDaysLate ?? 1));

  // Une seule echeance (ecran de detail) : motifs d'exclusion inclus meme hors fenetre
  // daysBefore / minDaysLate ; eligibleOnly ignore ; 404 si l'echeance n'est pas de l'agence.
  if (query.installmentId) {
    const [single] = await planReminders(tenantId, [query.installmentId], { now });
    return assemblePreview([single], now);
  }

  if (query.leaseId) {
    const lease = await prisma.rentalLease.findFirst({
      where: { id: query.leaseId, tenant_id: tenantId },
      select: { id: true }
    });
    if (!lease) throw new NotFoundError(t('Bail introuvable.'));
  }
  if (query.propertyId) {
    const property = await prisma.property.findFirst({
      where: { id: query.propertyId, tenantId },
      select: { id: true }
    });
    if (!property) throw new NotFoundError(t('Bien introuvable.'));
  }

  const windowEnd = new Date(startOfDay(now).getTime() + (daysBefore + 1) * DAY_MS);
  const rows = (await prisma.rentalInstallment.findMany({
    where: {
      tenant_id: tenantId,
      status: { not: 'CANCELED' },
      due_date: { lt: windowEnd },
      ...(query.leaseId ? { lease_id: query.leaseId } : {}),
      lease: {
        tenant_id: tenantId,
        status: 'ACTIVE',
        ...(query.propertyId ? { property_id: query.propertyId } : {})
      }
    },
    orderBy: [{ due_date: 'asc' }, { id: 'asc' }],
    select: INSTALLMENT_SELECT
  })) as unknown as InstallmentRow[];

  const candidates = rows.filter(row => {
    if (resteDuEcheance(row) <= 0) return false;
    if (computeInstallmentStatus(row as any, now, { emitDraft: false }) === 'DRAFT') return false;
    const late = calendarDaysLate(row.due_date, now);
    return !(late > 0 && late < minDaysLate);
  });

  let plans = await buildPlans(tenantId, candidates, now, daysBefore);

  const search = query.search?.trim().toLowerCase();
  if (search) {
    plans = plans.filter(p =>
      [p.item.tenantName, p.item.leaseReference, p.item.propertyLabel].some(v => v?.toLowerCase().includes(search))
    );
  }
  if (query.eligibleOnly) plans = plans.filter(p => p.item.eligible);
  plans = plans.slice(0, MAX_PREVIEW_ITEMS);
  return assemblePreview(plans, now);
}

function assemblePreview(plans: ReminderPlan[], now: Date): RentalReminderPreviewDto {
  const groups = new Map<string, RentalReminderPreviewGroupDto>();
  for (const { item } of plans) {
    let group = groups.get(item.leaseId);
    if (!group) {
      group = {
        leaseId: item.leaseId,
        leaseReference: item.leaseReference,
        propertyLabel: item.propertyLabel,
        tenantClientId: item.tenantClientId,
        tenantName: item.tenantName,
        totalDue: 0,
        items: []
      };
      groups.set(item.leaseId, group);
    }
    group.items.push(item);
    group.totalDue += item.amountDue;
  }

  const items = plans.map(p => p.item);
  return {
    generatedAt: now.toISOString(),
    groups: [...groups.values()],
    totals: {
      eligible: items.filter(i => i.eligible).length,
      excluded: items.filter(i => !i.eligible).length,
      amountDue: items.filter(i => i.eligible).reduce((sum, i) => sum + i.amountDue, 0)
    }
  };
}
