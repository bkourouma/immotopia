import type { Prisma } from '@prisma/client';
import { runWithLanguage } from '../../../i18n';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { runWithTenantContext } from '../../../utils/tenant-context';
import { botMessages, parseReplyId } from '../bot-messages';
import { chefLanguage, resolveChefAccess } from '../registrations/access';
import { handlePendingRegistrationMessage } from '../registrations/activation';
import { hashSender } from '../sender-hash';
import { getWhatsappTransport } from '../transport';
import type { ChefAccess, InboundMessage, OutboundMessage } from '../types';
import { analyzeKeptCapture, reanalyzeWithItem, receivePhoto, type FlowContext } from './capture-flow';
import { isZero, parseCommand, parseMergeAnswer, parseQuantityAnswer, type BotCommand } from './commands';
import { closeSessionCount, confirmCapture, type ConfirmMode, type MergeMode } from './count-writer';
import { loadActiveItems, matchItems } from './item-matching';
import { applySiteChoiceTx, chooseSite, loadEligibleSites, openOrResumeSession, type SiteChoice } from './site-choice';
import {
  abandonPendingCapture,
  closeSessionRow,
  findOpenSession,
  OPEN_STATES,
  sendToChef,
  SESSION_SELECT,
  transitionSession,
  withRegistrationLock,
  type ChefTarget,
  type SessionRow
} from './states';

/**
 * Moteur de conversation de l'inventaire par WhatsApp (lot 041, spec W3-R10,
 * W4, W5, W7-R2, W9, W12 ; contrat plan §3.3).
 *
 * Point d'entrée UNIQUE des messages entrants, qu'ils viennent du webhook Meta
 * (W1) ou du simulateur (W4) : `handleInboundMessage`. Il ne lève jamais.
 *
 * 1. Lecture transverse assumée : l'inscription se retrouve par le numéro
 *    (spec §8.2), puis tout le traitement se fait dans
 *    `runWithTenantContext({ tenantId })` et `runWithLanguage(langue du chef)`.
 * 2. Inscription en attente : activation (M02 à M05). Révoquée : M06.
 *    Aucune : M01 au plus une fois par 24 heures (le webhook le fait lui-même
 *    avant d'appeler le moteur ; le simulateur passe par ici).
 * 3. Inscription active : contrôle d'accès EN BASE (W3-R10) ; refus → session
 *    fermée (`ACCESS_LOST`), proposition abandonnée, M06 ou M06b, inventaire
 *    NON clos (W12-R1).
 * 4. Session ouverte ou reprise, message journalisé, puis traitement selon
 *    l'état (spec §7).
 */

const MESSAGE_TEXT_MAX = 1000;
/** Texte du chef cité dans M21, borné. */
const TYPED_ECHO_MAX = 40;

type RegistrationRow = {
  id: string;
  tenantId: string;
  userId: string;
  phoneE164: string;
  status: 'PENDING_ACTIVATION' | 'ACTIVE' | 'REVOKED';
  activationCodeHash: string | null;
  activationExpiresAt: Date | null;
  activationAttempts: number;
};

const REGISTRATION_SELECT = {
  id: true,
  tenantId: true,
  userId: true,
  phoneE164: true,
  status: true,
  activationCodeHash: true,
  activationExpiresAt: true,
  activationAttempts: true
} as const;

/** Inscription non révoquée du numéro, sinon la dernière révoquée (M06). */
async function findRegistration(fromE164: string): Promise<RegistrationRow | null> {
  const live = await prisma.stockWhatsappRegistration.findFirst({
    where: { phoneE164: fromE164, status: { not: 'REVOKED' } },
    select: REGISTRATION_SELECT
  });
  if (live) return live;
  return prisma.stockWhatsappRegistration.findFirst({
    where: { phoneE164: fromE164, status: 'REVOKED' },
    select: REGISTRATION_SELECT,
    orderBy: { revokedAt: 'desc' }
  });
}

// ---------------------------------------------------------------------------
// Numéro inconnu (simulateur) — W7-R1
// ---------------------------------------------------------------------------

const UNKNOWN_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
const unknownReplies = new Map<string, number>();

/** Remise à zéro de la mémoire des réponses aux inconnus (tests). */
export function resetEngineMemoryForTests(): void {
  unknownReplies.clear();
}

/**
 * M01 au plus une fois par 24 heures et par empreinte d'expéditeur. Le
 * webhook (W1) le fait AVANT d'appeler le moteur, sous verrou et par
 * `WhatsappCloudEvent.unknownReplySentAt` ; ici, pour le simulateur (numéro
 * libre, W13-R3), la mémoire du processus suffit, comme le fil « Numéro
 * inconnu » qu'il affiche. Rien n'est journalisé, aucun média téléchargé.
 */
async function replyToUnknownSender(message: InboundMessage, now: Date): Promise<void> {
  const hash = hashSender(message.fromE164);
  const last = unknownReplies.get(hash);
  if (last !== undefined && now.getTime() - last < UNKNOWN_REPLY_WINDOW_MS) return;
  if (unknownReplies.size > 1000) unknownReplies.clear();
  unknownReplies.set(hash, now.getTime());
  await getWhatsappTransport().send({
    toE164: message.fromE164,
    message: runWithLanguage('fr', () => botMessages.unknownNumber()),
    log: null
  });
}

// ---------------------------------------------------------------------------
// Journal de conversation (messages entrants)
// ---------------------------------------------------------------------------

function inboundColumns(message: InboundMessage): {
  kind: 'TEXT' | 'IMAGE' | 'REPLY' | 'UNSUPPORTED';
  text: string | null;
  interactive?: Prisma.InputJsonValue;
} {
  if (message.kind === 'TEXT') return { kind: 'TEXT', text: message.text.slice(0, MESSAGE_TEXT_MAX) };
  if (message.kind === 'IMAGE') return { kind: 'IMAGE', text: null };
  if (message.kind === 'REPLY') {
    return {
      kind: 'REPLY',
      text: message.replyTitle.slice(0, MESSAGE_TEXT_MAX),
      interactive: [{ id: message.replyId, title: message.replyTitle }]
    };
  }
  return { kind: 'UNSUPPORTED', text: null };
}

/** Écrit le message entrant ; jamais le numéro (il est sur l'inscription). Ne lève pas. */
export async function logInboundMessage(
  registration: { id: string; tenantId: string },
  sessionId: string | null,
  message: InboundMessage
): Promise<void> {
  try {
    const columns = inboundColumns(message);
    await prisma.stockWhatsappMessage.create({
      data: {
        tenantId: registration.tenantId,
        registrationId: registration.id,
        sessionId,
        direction: 'INBOUND',
        kind: columns.kind,
        text: columns.text,
        ...(columns.interactive !== undefined ? { interactive: columns.interactive } : {}),
        metaMessageId: message.via === 'META' ? message.metaMessageId : null,
        via: message.via
      }
    });
  } catch (error) {
    logger.error('Inventaire WhatsApp : message entrant non journalisé', {
      tenantId: registration.tenantId,
      registrationId: registration.id,
      error: error instanceof Error ? error.name : 'inconnue'
    });
  }
}

// ---------------------------------------------------------------------------
// Outils communs
// ---------------------------------------------------------------------------

function say(ctx: FlowContext, sessionId: string | null, message: OutboundMessage, captureId: string | null = null) {
  return sendToChef(ctx.target, sessionId, message, captureId);
}

async function readSession(ctx: FlowContext, sessionId: string): Promise<SessionRow | null> {
  return prisma.stockWhatsappSession.findFirst({
    where: { id: sessionId, tenantId: ctx.target.tenantId, closedAt: null },
    select: SESSION_SELECT
  });
}

type PendingCapture = {
  id: string;
  itemId: string | null;
  proposedTotal: unknown;
  confirmedQuantity: unknown;
  item: { label: string; reference: string; unit: string } | null;
};

async function readPendingCapture(ctx: FlowContext, session: SessionRow): Promise<PendingCapture | null> {
  if (!session.pendingCaptureId) return null;
  return prisma.stockFieldCapture.findFirst({
    where: { id: session.pendingCaptureId, tenantId: ctx.target.tenantId },
    select: {
      id: true,
      itemId: true,
      proposedTotal: true,
      confirmedQuantity: true,
      item: { select: { label: true, reference: true, unit: true } }
    }
  });
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const number = typeof value === 'number' ? value : Number(String(value));
  return Number.isFinite(number) ? number : 0;
}

async function siteName(ctx: FlowContext, siteId: string | null): Promise<string> {
  if (!siteId) return '';
  const site = await prisma.constructionSite.findFirst({
    where: { id: siteId, tenantId: ctx.target.tenantId },
    select: { name: true }
  });
  return site?.name ?? '';
}

async function sendSiteChoice(ctx: FlowContext, sessionId: string, choice: SiteChoice): Promise<void> {
  if (choice.kind === 'NONE') return say(ctx, sessionId, botMessages.noSite());
  if (choice.kind === 'SINGLE') return say(ctx, sessionId, botMessages.siteChosen(choice.site.name));
  return say(ctx, sessionId, botMessages.chooseSite(choice.sites));
}

/** Question en cours répétée, après une réponse qui ne lui correspond pas. */
async function repeatPrompt(ctx: FlowContext, session: SessionRow): Promise<void> {
  if (session.state === 'READY') return say(ctx, session.id, botMessages.sendPhoto());
  if (session.state === 'AWAITING_SITE') {
    const sites = await loadEligibleSites(prisma, ctx.target.tenantId, ctx.target.registrationId);
    return say(ctx, session.id, sites.length > 0 ? botMessages.chooseSite(sites) : botMessages.noSite());
  }
  if (session.state === 'AWAITING_ITEM') return say(ctx, session.id, botMessages.itemUnknown());
  const capture = await readPendingCapture(ctx, session);
  if (!capture) return;
  if (session.state === 'AWAITING_CONFIRMATION') {
    return say(
      ctx,
      session.id,
      botMessages.notUnderstood({ total: toNumber(capture.proposedTotal), unit: capture.item?.unit ?? '' })
    );
  }
  if (session.state === 'AWAITING_MERGE') return remindMerge(ctx, session, capture);
}

// ---------------------------------------------------------------------------
// Confirmation, fusion, annulation — W4-R7, W5
// ---------------------------------------------------------------------------

async function cancelPending(
  ctx: FlowContext,
  session: SessionRow,
  outcome: 'CANCELLED' | 'UNRECOGNIZED'
): Promise<void> {
  const done = await withRegistrationLock(ctx.target.registrationId, async tx => {
    const moved = await transitionSession(
      tx,
      session,
      ['AWAITING_CONFIRMATION', 'AWAITING_MERGE', 'AWAITING_ITEM'],
      { state: 'READY', pendingCaptureId: null, reminderSentAt: null },
      { pendingCaptureId: session.pendingCaptureId }
    );
    if (!moved || !session.pendingCaptureId) return false;
    await tx.stockFieldCapture.updateMany({
      where: { id: session.pendingCaptureId, tenantId: ctx.target.tenantId, outcome: 'PENDING' },
      data: { outcome }
    });
    return true;
  });
  if (done) await say(ctx, session.id, botMessages.cancelled(), session.pendingCaptureId);
}

async function remindMerge(ctx: FlowContext, session: SessionRow, capture: PendingCapture): Promise<void> {
  if (!session.countId || !capture.itemId) return;
  const line = await prisma.stockCountLine.findFirst({
    where: { countId: session.countId, count: { tenantId: ctx.target.tenantId }, itemId: capture.itemId },
    select: { countedQuantity: true }
  });
  await say(
    ctx,
    session.id,
    botMessages.alreadyCounted({
      captureId: capture.id,
      item: capture.item?.label ?? '',
      unit: capture.item?.unit ?? '',
      existing: toNumber(line?.countedQuantity),
      quantity: toNumber(capture.confirmedQuantity)
    }),
    capture.id
  );
}

async function confirmAndReply(
  ctx: FlowContext,
  session: SessionRow,
  capture: PendingCapture,
  answer: { quantity: number; mode: ConfirmMode; mergeMode: MergeMode | null }
): Promise<void> {
  if (!capture.itemId) return;
  const outcome = await confirmCapture({
    tenantId: ctx.target.tenantId,
    registrationId: ctx.target.registrationId,
    userId: ctx.target.userId,
    sessionId: session.id,
    captureId: capture.id,
    itemId: capture.itemId,
    quantity: answer.quantity,
    mode: answer.mode,
    mergeMode: answer.mergeMode,
    now: new Date()
  });
  const item = { item: capture.item?.label ?? '', unit: capture.item?.unit ?? '' };
  switch (outcome.kind) {
    case 'ACCESS_LOST':
      return say(
        ctx,
        session.id,
        outcome.access.reason === 'OPTION_MISSING' ? botMessages.optionMissing() : botMessages.accessLost()
      );
    case 'COUNT_AWAITING_VALIDATION':
      return say(ctx, session.id, botMessages.countAwaitingValidation(), capture.id);
    case 'OFFICE_CHANGED':
      return say(ctx, session.id, botMessages.countChangedAtOffice(), capture.id);
    case 'MERGE_NEEDED':
      return say(
        ctx,
        session.id,
        botMessages.alreadyCounted({
          captureId: capture.id,
          ...item,
          existing: outcome.existing,
          quantity: answer.quantity
        }),
        capture.id
      );
    case 'RECORDED': {
      const payload = { ...item, quantity: outcome.quantity };
      const text = outcome.mode === 'ACCEPTED' ? botMessages.recorded(payload) : botMessages.recordedCorrected(payload);
      return say(ctx, session.id, text, capture.id);
    }
    default:
      return;
  }
}

async function answerProposal(ctx: FlowContext, session: SessionRow, text: string): Promise<void> {
  const capture = await readPendingCapture(ctx, session);
  if (!capture) return;
  const answer = parseQuantityAnswer(text);
  if (!answer) return repeatPrompt(ctx, session);
  if (answer.kind === 'CANCEL') return cancelPending(ctx, session, 'CANCELLED');
  const proposed = toNumber(capture.proposedTotal);
  if (answer.kind === 'ACCEPT')
    return confirmAndReply(ctx, session, capture, { quantity: proposed, mode: 'ACCEPTED', mergeMode: null });
  return confirmAndReply(ctx, session, capture, { quantity: answer.value, mode: 'CORRECTED', mergeMode: null });
}

async function answerMerge(ctx: FlowContext, session: SessionRow, choice: 'ADD' | 'REPLACE' | 'CANCEL'): Promise<void> {
  const capture = await readPendingCapture(ctx, session);
  if (!capture) return;
  if (choice === 'CANCEL') return cancelPending(ctx, session, 'CANCELLED');
  const quantity = toNumber(capture.confirmedQuantity);
  // Le mode d'origine se relit : une quantité confirmée égale au total proposé vient de « 1 » (ACCEPTED).
  const mode: ConfirmMode = quantity === toNumber(capture.proposedTotal) ? 'ACCEPTED' : 'CORRECTED';
  return confirmAndReply(ctx, session, capture, { quantity, mode, mergeMode: choice });
}

// ---------------------------------------------------------------------------
// Article non reconnu — W9
// ---------------------------------------------------------------------------

async function answerItem(ctx: FlowContext, session: SessionRow, text: string): Promise<void> {
  if (!session.pendingCaptureId) return;
  if (isZero(text)) return cancelPending(ctx, session, 'UNRECOGNIZED');
  const items = await loadActiveItems(prisma, ctx.target.tenantId);
  const matches = matchItems(items, text);
  if (matches.length === 0) {
    const typed = Array.from(text.trim()).slice(0, TYPED_ECHO_MAX).join('');
    return say(ctx, session.id, botMessages.noItem(typed), session.pendingCaptureId);
  }
  if (matches.length === 1) return reanalyzeWithItem(ctx, session.id, session.pendingCaptureId, matches[0].id);
  return say(ctx, session.id, botMessages.severalItems(session.pendingCaptureId, matches), session.pendingCaptureId);
}

// ---------------------------------------------------------------------------
// Commandes — W4-R6, W5-R5
// ---------------------------------------------------------------------------

/** Abandonne la proposition et sort la session de son chantier, sous verrou. */
async function leaveCurrentSite(
  ctx: FlowContext,
  sessionId: string,
  close: 'FIN' | null
): Promise<{ countId: string | null; siteId: string | null } | null> {
  return withRegistrationLock(ctx.target.registrationId, async tx => {
    const session = await tx.stockWhatsappSession.findFirst({
      where: { id: sessionId, tenantId: ctx.target.tenantId, closedAt: null },
      select: SESSION_SELECT
    });
    if (!session) return null;
    await abandonPendingCapture(tx, session);
    const moved = close
      ? await closeSessionRow(tx, session, close, ctx.now)
      : await transitionSession(tx, session, OPEN_STATES, {
          state: 'AWAITING_SITE',
          siteId: null,
          locationId: null,
          countId: null,
          pendingCaptureId: null,
          reminderSentAt: null
        });
    return moved ? { countId: session.countId, siteId: session.siteId } : null;
  });
}

async function closeCountOf(
  ctx: FlowContext,
  sessionId: string,
  left: { countId: string | null; siteId: string | null }
) {
  const result = await closeSessionCount({
    tenantId: ctx.target.tenantId,
    registrationId: ctx.target.registrationId,
    userId: ctx.target.userId,
    sessionId,
    countId: left.countId,
    siteId: left.siteId
  });
  return { ...result, site: await siteName(ctx, left.siteId) };
}

async function commandFin(ctx: FlowContext, sessionId: string): Promise<void> {
  const left = await leaveCurrentSite(ctx, sessionId, 'FIN');
  if (!left) return;
  const closed = await closeCountOf(ctx, sessionId, left);
  await prisma.stockWhatsappSession.updateMany({
    where: { id: sessionId, tenantId: ctx.target.tenantId },
    data: { countOutcome: closed.outcome }
  });
  if (closed.outcome === 'COUNTED') {
    return say(ctx, sessionId, botMessages.closedCounted({ site: closed.site, count: closed.chefLines }));
  }
  if (closed.outcome === 'LEFT_OPEN' && closed.chefLines > 0) {
    return say(ctx, sessionId, botMessages.closedLeftOpen({ site: closed.site, count: closed.chefLines }));
  }
  return say(ctx, sessionId, botMessages.closedNothing());
}

async function commandChantier(ctx: FlowContext, sessionId: string): Promise<void> {
  const left = await leaveCurrentSite(ctx, sessionId, null);
  if (!left) return;
  const closed = await closeCountOf(ctx, sessionId, left);
  if (closed.outcome === 'COUNTED') {
    await say(ctx, sessionId, botMessages.closedCounted({ site: closed.site, count: closed.chefLines }));
  }
  const choice = await withRegistrationLock(ctx.target.registrationId, async tx => {
    const eligible = await loadEligibleSites(tx, ctx.target.tenantId, ctx.target.registrationId);
    return applySiteChoiceTx(tx, { id: sessionId, tenantId: ctx.target.tenantId }, eligible, ctx.now);
  });
  return sendSiteChoice(ctx, sessionId, choice);
}

async function handleCommand(ctx: FlowContext, sessionId: string, command: BotCommand): Promise<void> {
  if (command === 'AIDE') return say(ctx, sessionId, botMessages.help());
  if (command === 'FIN') return commandFin(ctx, sessionId);
  return commandChantier(ctx, sessionId);
}

// ---------------------------------------------------------------------------
// Texte et réponses interactives selon l'état — spec §7
// ---------------------------------------------------------------------------

async function handleText(ctx: FlowContext, sessionId: string, text: string): Promise<void> {
  const session = await readSession(ctx, sessionId);
  if (!session) return;
  switch (session.state) {
    case 'AWAITING_CONFIRMATION':
      return answerProposal(ctx, session, text);
    case 'AWAITING_MERGE': {
      const choice = parseMergeAnswer(text);
      return choice ? answerMerge(ctx, session, choice) : repeatPrompt(ctx, session);
    }
    case 'AWAITING_ITEM':
      return answerItem(ctx, session, text);
    case 'ANALYZING':
      return; // La réponse à la photo en cours suit ; un texte n'y change rien.
    default:
      return repeatPrompt(ctx, session);
  }
}

async function replyToSite(ctx: FlowContext, session: SessionRow, siteId: string): Promise<void> {
  const chosen = await chooseSite(ctx.target, session.id, siteId);
  if (chosen.kind === 'STALE') return;
  if (chosen.kind === 'INVALID') {
    return say(ctx, session.id, chosen.sites.length > 0 ? botMessages.chooseSite(chosen.sites) : botMessages.noSite());
  }
  if (chosen.kind === 'READY') return say(ctx, session.id, botMessages.siteChosen(chosen.site.name));
  return analyzeKeptCapture(ctx, session.id, chosen.captureId);
}

async function handleReply(ctx: FlowContext, sessionId: string, replyId: string): Promise<void> {
  const session = await readSession(ctx, sessionId);
  if (!session) return;
  const parsed = parseReplyId(replyId);
  if (parsed?.kind === 'site' && session.state === 'AWAITING_SITE') return replyToSite(ctx, session, parsed.siteId);

  const current = parsed && 'captureId' in parsed && parsed.captureId === session.pendingCaptureId;
  if (current && session.state === 'AWAITING_CONFIRMATION' && (parsed.kind === 'confirm' || parsed.kind === 'cancel')) {
    return answerProposal(ctx, session, parsed.kind === 'confirm' ? '1' : '0');
  }
  if (current && session.state === 'AWAITING_MERGE' && parsed.kind.startsWith('merge-')) {
    const choice = parsed.kind === 'merge-add' ? 'ADD' : parsed.kind === 'merge-replace' ? 'REPLACE' : 'CANCEL';
    return answerMerge(ctx, session, choice);
  }
  if (current && session.state === 'AWAITING_ITEM' && parsed.kind === 'item' && session.pendingCaptureId) {
    const item = await prisma.stockItem.findFirst({
      where: { id: parsed.itemId, tenantId: ctx.target.tenantId, isActive: true },
      select: { id: true }
    });
    if (item) return reanalyzeWithItem(ctx, session.id, session.pendingCaptureId, item.id);
  }
  if (session.state === 'ANALYZING') return;
  return repeatPrompt(ctx, session);
}

// ---------------------------------------------------------------------------
// Chef inscrit et actif
// ---------------------------------------------------------------------------

async function refuseAccess(
  target: ChefTarget,
  access: Extract<ChefAccess, { ok: false }>,
  message: InboundMessage,
  now: Date
): Promise<void> {
  const sessionId = await withRegistrationLock(target.registrationId, async tx => {
    const session = await findOpenSession(tx, target.tenantId, target.registrationId);
    if (!session) return null;
    await abandonPendingCapture(tx, session);
    await closeSessionRow(tx, session, 'ACCESS_LOST', now);
    return session.id;
  });
  await logInboundMessage({ id: target.registrationId, tenantId: target.tenantId }, sessionId, message);
  await sendToChef(
    target,
    sessionId,
    access.reason === 'OPTION_MISSING' ? botMessages.optionMissing() : botMessages.accessLost()
  );
}

/** Premier message d'une session, ou chantier perdu : le choix du chantier passe d'abord (W4-R3). */
async function handleAfterChoice(
  ctx: FlowContext,
  sessionId: string,
  choice: SiteChoice,
  message: InboundMessage,
  justOpened: boolean
) {
  if (choice.kind === 'NONE') return say(ctx, sessionId, botMessages.noSite());
  const command = message.kind === 'TEXT' ? parseCommand(message.text) : null;
  if (command) return handleCommand(ctx, sessionId, command);
  if (choice.kind === 'SINGLE') {
    if (message.kind === 'TEXT' && justOpened && parseQuantityAnswer(message.text)) {
      return say(ctx, sessionId, botMessages.sendPhoto());
    }
    await say(ctx, sessionId, botMessages.siteChosen(choice.site.name));
    if (message.kind === 'IMAGE') await receivePhoto(ctx, sessionId, message);
    return;
  }
  if (message.kind === 'IMAGE') await receivePhoto(ctx, sessionId, message);
  return say(ctx, sessionId, botMessages.chooseSite(choice.sites));
}

async function handleChefMessage(registration: RegistrationRow, message: InboundMessage, now: Date): Promise<void> {
  const target: ChefTarget = {
    tenantId: registration.tenantId,
    registrationId: registration.id,
    userId: registration.userId,
    phoneE164: registration.phoneE164
  };
  const access = await resolveChefAccess(registration.id, { now, tenantId: registration.tenantId });
  if (!access.ok) return refuseAccess(target, access, message, now);

  const ctx: FlowContext = { target, access, now };
  const opened = await openOrResumeSession(target, now);
  await logInboundMessage(registration, opened.sessionId, message);
  if (opened.lostSiteName !== null) await say(ctx, opened.sessionId, botMessages.siteUnavailable(opened.lostSiteName));
  if (opened.choice) return handleAfterChoice(ctx, opened.sessionId, opened.choice, message, opened.justOpened);

  if (message.kind === 'UNSUPPORTED') return say(ctx, opened.sessionId, botMessages.unsupported());
  if (message.kind === 'IMAGE') return receivePhoto(ctx, opened.sessionId, message);
  if (message.kind === 'REPLY') return handleReply(ctx, opened.sessionId, message.replyId);
  const command = parseCommand(message.text);
  if (command) return handleCommand(ctx, opened.sessionId, command);
  return handleText(ctx, opened.sessionId, message.text);
}

async function dispatch(message: InboundMessage): Promise<void> {
  const now = message.receivedAt instanceof Date ? message.receivedAt : new Date();
  const registration = await findRegistration(message.fromE164);
  if (!registration) return replyToUnknownSender(message, now);

  const user = await prisma.user.findUnique({
    where: { id: registration.userId },
    select: { preferredLanguage: true }
  });
  const language = chefLanguage(user?.preferredLanguage);
  const target: ChefTarget = {
    tenantId: registration.tenantId,
    registrationId: registration.id,
    userId: registration.userId,
    phoneE164: registration.phoneE164
  };

  await runWithTenantContext({ tenantId: registration.tenantId, userId: registration.userId }, () =>
    runWithLanguage(language, async () => {
      await prisma.stockWhatsappRegistration.updateMany({
        where: { id: registration.id, tenantId: registration.tenantId },
        data: { lastInboundAt: now }
      });
      if (registration.status === 'ACTIVE') return handleChefMessage(registration, message, now);
      await logInboundMessage(registration, null, message);
      if (registration.status === 'PENDING_ACTIVATION')
        return handlePendingRegistrationMessage(registration, message, now);
      return sendToChef(target, null, botMessages.accessLost());
    })
  );
}

/**
 * Traite un message entrant (contrat plan §3.3). Ne lève JAMAIS : une erreur
 * est journalisée sans le numéro ni le texte du message.
 */
export async function handleInboundMessage(message: InboundMessage): Promise<void> {
  try {
    await dispatch(message);
  } catch (error) {
    logger.error('Inventaire WhatsApp : message entrant non traité', {
      via: message.via,
      kind: message.kind,
      error: error instanceof Error ? error.name : 'inconnue',
      code: (error as { code?: unknown })?.code ?? null
    });
  }
}
