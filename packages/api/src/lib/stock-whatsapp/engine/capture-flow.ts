import type { Prisma } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { botMessages } from '../bot-messages';
import { deleteCapturePhoto, readCapturePhoto, storeCapturePhoto } from '../capture-files';
import {
  checkWhatsappAnalysisBudget,
  isWhatsappQuotaExhausted,
  noteWhatsappQuotaReached,
  releaseWhatsappPhoto,
  reserveWhatsappPhoto
} from '../quota';
import { resolveChefAccess } from '../registrations/access';
import { getWhatsappTransport } from '../transport';
import {
  MediaFetchError,
  type ChefAccess,
  type InboundMessage,
  type OutboundMessage,
  type StockVisionOutcome,
  type StockVisionResult
} from '../types';
import { getStockVisionProvider } from '../vision';
import { selectStockVisionCandidates } from '../vision/candidates';
import { findLocationCountTx } from './count-writer';
import { loadEligibleSites } from './site-choice';
import {
  abandonPendingCapture,
  closeSessionRow,
  sendToChef,
  SESSION_SELECT,
  transitionSession,
  withRegistrationLock,
  type ChefTarget,
  type SessionRow
} from './states';

/**
 * Parcours d'une photo (lot 041, spec W4-R3, W4-R4, W6-R9, W6-R10, W8-R7,
 * W8-R8, W9, W11-R3).
 *
 * 1. Sous verrou : « une photo à la fois » — `READY → ANALYZING` par mise à
 *    jour conditionnelle ; une photo pendant `ANALYZING` reçoit M12, pendant
 *    une question en attente M12b, sans téléchargement ni quota.
 * 2. Hors verrou : réservation du quota (photo non téléchargée s'il est
 *    atteint), téléchargement immédiat (l'URL Meta expire en 5 minutes),
 *    stockage privé sans EXIF, empreinte du fichier STOCKÉ.
 * 3. Hors verrou ET hors transaction : appel à l'IA.
 * 4. Sous verrou : décision (M13, M18, M18b, M19, M22), transition
 *    conditionnelle depuis `ANALYZING`. Si la session a changé entre-temps
 *    (`FIN`, expiration, révocation), la capture devient `EXPIRED`, sans
 *    message.
 * 5. Une exception entre le passage à `ANALYZING` et la décision ne laisse
 *    jamais la session bloquée : capture `FAILED`, place du quota rendue si
 *    aucune analyse n'a abouti, retour à `READY`, M22 (`guardAnalysis`). Un
 *    processus arrêté net est rattrapé par la minuterie (`timers.ts`).
 */

type ActiveAccess = Extract<ChefAccess, { ok: true }>;
type ImageMessage = Extract<InboundMessage, { kind: 'IMAGE' }>;

export type FlowContext = {
  target: ChefTarget;
  access: ActiveAccess;
  now: Date;
};

/** Légende gardée pour le SEUL faux fournisseur (recette), le temps du processus. */
const fakeDirectives = new Map<string, string>();
const FAKE_DIRECTIVES_MAX = 200;

function keepFakeDirective(captureId: string, caption: string | null): void {
  if (!caption || getStockVisionProvider().id !== 'fake') return;
  fakeDirectives.set(captureId, caption);
  while (fakeDirectives.size > FAKE_DIRECTIVES_MAX) {
    const oldest = fakeDirectives.keys().next().value;
    if (oldest === undefined) break;
    fakeDirectives.delete(oldest);
  }
}

/** Remise à zéro des légendes gardées (tests). */
export function resetCaptureFlowMemoryForTests(): void {
  fakeDirectives.clear();
}

type StoredPhoto = {
  fileUrl: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
  sha256: string;
  providerSha256: string | null;
};

/** Raisons d'un téléchargement qui disent « fichier refusé » (M18c) ; les autres sont passagères (M22). */
const REFUSED_MEDIA_REASONS = new Set(['TOO_LARGE', 'HOST_NOT_ALLOWED']);

type DownloadResult = { ok: true; photo: StoredPhoto } | { ok: false; reply: OutboundMessage };

/**
 * Télécharge et stocke la photo. Fichier refusé (type, taille, hôte) : M18c ;
 * panne passagère de Meta ou du stockage (HTTP, délai, média introuvable) :
 * M22, le chef peut renvoyer la même photo.
 */
async function downloadAndStore(tenantId: string, message: ImageMessage): Promise<DownloadResult> {
  try {
    const media = await getWhatsappTransport().fetchMedia(message.media.mediaId);
    const stored = await storeCapturePhoto(tenantId, media.buffer);
    if ('refused' in stored) return { ok: false, reply: botMessages.fileRefused() };
    return {
      ok: true,
      photo: { ...stored, providerSha256: media.providerSha256 ?? message.media.providerSha256 ?? null }
    };
  } catch (error) {
    const reason = error instanceof MediaFetchError ? error.reason : error instanceof Error ? error.name : 'inconnue';
    logger.warn('Inventaire WhatsApp : photo non téléchargée', { tenantId, reason });
    const refused = error instanceof MediaFetchError && REFUSED_MEDIA_REASONS.has(error.reason);
    return { ok: false, reply: refused ? botMessages.fileRefused() : botMessages.analysisFailed() };
  }
}

async function reply(
  ctx: FlowContext,
  sessionId: string | null,
  message: OutboundMessage,
  captureId: string | null = null
) {
  await sendToChef(ctx.target, sessionId, message, captureId);
}

/**
 * Ce qu'une analyse en cours a déjà engagé, pour la rattraper sur exception :
 * capture créée, place du quota réservée (et rendue ou non), analyse aboutie,
 * fichier stocké sans capture.
 */
type AnalysisTracker = {
  captureId: string | null;
  reservedMonth: string | null;
  released: boolean;
  analyzed: boolean;
  orphanFileUrl: string | null;
};

function newTracker(captureId: string | null): AnalysisTracker {
  return { captureId, reservedMonth: null, released: false, analyzed: false, orphanFileUrl: null };
}

async function releaseOnce(ctx: FlowContext, tracker: AnalysisTracker): Promise<void> {
  if (!tracker.reservedMonth || tracker.released) return;
  tracker.released = true;
  await releaseWhatsappPhoto(ctx.target.tenantId, tracker.reservedMonth);
}

/**
 * Exception pendant une analyse (base, stockage, IA…) : capture `FAILED`,
 * place rendue si aucune analyse n'a abouti, session `ANALYZING → READY`,
 * M22. Ne lève pas : un rattrapage impossible est laissé à la minuterie.
 */
async function recoverInterruptedAnalysis(ctx: FlowContext, sessionId: string, tracker: AnalysisTracker) {
  try {
    const giveBack = Boolean(tracker.reservedMonth) && !tracker.released && !tracker.analyzed;
    const moved = await withRegistrationLock(ctx.target.registrationId, async tx => {
      if (tracker.captureId) {
        await tx.stockFieldCapture.updateMany({
          where: { id: tracker.captureId, tenantId: ctx.target.tenantId, outcome: { in: ['RECEIVED', 'PENDING'] } },
          data: { outcome: 'FAILED', ...(giveBack ? { quotaCounted: false } : {}) }
        });
      }
      return transitionSession(
        tx,
        { id: sessionId, tenantId: ctx.target.tenantId },
        ['ANALYZING'],
        { state: 'READY', pendingCaptureId: null, reminderSentAt: null },
        { pendingCaptureId: tracker.captureId }
      );
    });
    if (giveBack) await releaseOnce(ctx, tracker);
    if (tracker.orphanFileUrl) await deleteCapturePhoto(tracker.orphanFileUrl).catch(() => undefined);
    if (moved) await reply(ctx, sessionId, botMessages.analysisFailed(), tracker.captureId);
  } catch (error) {
    logger.error('Inventaire WhatsApp : rattrapage d’une analyse interrompue impossible', {
      tenantId: ctx.target.tenantId,
      sessionId,
      error: error instanceof Error ? error.name : 'inconnue'
    });
  }
}

/** Exécute un parcours d'analyse ; toute exception est rattrapée (session jamais bloquée en `ANALYZING`). */
async function guardAnalysis(
  ctx: FlowContext,
  sessionId: string,
  tracker: AnalysisTracker,
  run: () => Promise<void>
): Promise<void> {
  try {
    await run();
  } catch (error) {
    logger.error('Inventaire WhatsApp : analyse interrompue, session rendue au chef', {
      tenantId: ctx.target.tenantId,
      sessionId,
      error: error instanceof Error ? error.name : 'inconnue',
      code: (error as { code?: unknown })?.code ?? null
    });
    await recoverInterruptedAnalysis(ctx, sessionId, tracker);
  }
}

/**
 * Avant tout appel à l'IA : inventaire du lieu en attente de validation (M29,
 * rien ne pourra s'écrire, aucune place du quota n'est prise) ou plafond des
 * appels atteint (M22, M07). `null` si l'analyse peut partir.
 */
async function refuseBeforeAnalysis(
  ctx: FlowContext,
  locationId: string | null,
  options: { checkCount: boolean }
): Promise<OutboundMessage | null> {
  if (options.checkCount && locationId) {
    const found = await findLocationCountTx(prisma, ctx.target.tenantId, locationId);
    if (found.kind === 'COUNTED') return botMessages.countAwaitingValidation();
  }
  const budget = await checkWhatsappAnalysisBudget({
    tenantId: ctx.target.tenantId,
    registrationId: ctx.target.registrationId,
    limit: ctx.access.quota.limit,
    now: ctx.now
  });
  if (budget.ok) return null;
  logger.warn('Inventaire WhatsApp : analyse refusée, plafond des appels à l’IA atteint', {
    tenantId: ctx.target.tenantId,
    registrationId: ctx.target.registrationId,
    reason: budget.reason
  });
  return budget.reason === 'FAILURE_BURST' ? botMessages.analysisFailed() : botMessages.quotaReached();
}

export type ReceivePhotoOptions = {
  /** Vrai si l'appelant envoie lui-même M08 juste après (premier message, chantier perdu). */
  siteQuestionFollows?: boolean;
};

/** Photo reçue dans une session ouverte. */
export async function receivePhoto(
  ctx: FlowContext,
  sessionId: string,
  message: ImageMessage,
  options: ReceivePhotoOptions = {}
): Promise<void> {
  const decision = await withRegistrationLock(ctx.target.registrationId, async tx => {
    const session = await tx.stockWhatsappSession.findFirst({
      where: { id: sessionId, tenantId: ctx.target.tenantId, closedAt: null },
      select: SESSION_SELECT
    });
    if (!session) return { kind: 'GONE' as const };
    if (session.state === 'ANALYZING') return { kind: 'BUSY' as const };
    if (session.state === 'AWAITING_SITE') {
      return session.pendingCaptureId ? { kind: 'QUESTION' as const } : { kind: 'KEEP' as const };
    }
    if (session.state !== 'READY' || !session.locationId) return { kind: 'QUESTION' as const };
    const claimed = await transitionSession(tx, session, ['READY'], { state: 'ANALYZING', reminderSentAt: null });
    return claimed ? { kind: 'ANALYZE' as const, locationId: session.locationId } : { kind: 'BUSY' as const };
  });

  if (decision.kind === 'GONE') return;
  if (decision.kind === 'BUSY') return reply(ctx, sessionId, botMessages.analysisInProgress());
  if (decision.kind === 'QUESTION') return reply(ctx, sessionId, botMessages.questionPending());
  if (decision.kind === 'KEEP') return keepPhotoForSiteChoice(ctx, sessionId, message, options);
  const tracker = newTracker(null);
  return guardAnalysis(ctx, sessionId, tracker, () =>
    analyzeNewPhoto(ctx, sessionId, message, decision.locationId, tracker)
  );
}

/** Revient de `ANALYZING` à `READY` (photo non retenue avant toute analyse). */
async function backToReady(ctx: FlowContext, sessionId: string): Promise<void> {
  await withRegistrationLock(ctx.target.registrationId, async tx => {
    await transitionSession(tx, { id: sessionId, tenantId: ctx.target.tenantId }, ['ANALYZING'], {
      state: 'READY',
      pendingCaptureId: null
    });
  });
}

function captureData(ctx: FlowContext, sessionId: string, message: ImageMessage, photo: StoredPhoto) {
  return {
    tenantId: ctx.target.tenantId,
    registrationId: ctx.target.registrationId,
    sessionId,
    userId: ctx.target.userId,
    via: message.via,
    metaMessageId: message.metaMessageId,
    fileUrl: photo.fileUrl,
    mimeType: photo.mimeType,
    sizeBytes: photo.sizeBytes,
    sha256: photo.sha256,
    providerSha256: photo.providerSha256,
    receivedAt: message.receivedAt
  } satisfies Prisma.StockFieldCaptureUncheckedCreateInput;
}

/** Vrai si une question à choix (M08, boutons ou liste) a déjà été envoyée dans la session. */
async function siteQuestionAsked(ctx: FlowContext, sessionId: string): Promise<boolean> {
  const asked = await prisma.stockWhatsappMessage.findFirst({
    where: {
      tenantId: ctx.target.tenantId,
      sessionId,
      direction: 'OUTBOUND',
      kind: { in: ['BUTTONS', 'LIST'] }
    },
    select: { id: true }
  });
  return asked !== null;
}

/**
 * Photo reçue avant le choix du chantier : gardée (`RECEIVED`), analysée dès
 * le choix (W4-R3). Si la question n'a pas encore été posée dans la session
 * (session ouverte par un message que rien n'a suivi de M08), M08 suit.
 */
async function keepPhotoForSiteChoice(
  ctx: FlowContext,
  sessionId: string,
  message: ImageMessage,
  options: ReceivePhotoOptions
): Promise<void> {
  if (await isWhatsappQuotaExhausted(ctx.target.tenantId, ctx.access.quota.limit, ctx.now)) {
    await noteWhatsappQuotaReached(ctx.target.tenantId, ctx.target.userId, ctx.access.quota.limit, ctx.now);
    return reply(ctx, sessionId, botMessages.quotaReached());
  }
  const download = await downloadAndStore(ctx.target.tenantId, message);
  if (!download.ok) return reply(ctx, sessionId, download.reply);
  const photo = download.photo;

  const kept = await withRegistrationLock(ctx.target.registrationId, async tx => {
    const capture = await tx.stockFieldCapture.create({
      data: { ...captureData(ctx, sessionId, message, photo), outcome: 'RECEIVED' },
      select: { id: true }
    });
    const linked = await transitionSession(
      tx,
      { id: sessionId, tenantId: ctx.target.tenantId },
      ['AWAITING_SITE'],
      { pendingCaptureId: capture.id },
      { pendingCaptureId: null }
    );
    if (!linked) {
      await tx.stockFieldCapture.deleteMany({ where: { id: capture.id, tenantId: ctx.target.tenantId } });
      return null;
    }
    return capture.id;
  });
  if (!kept) {
    await deleteCapturePhoto(photo.fileUrl).catch(() => undefined);
    return reply(ctx, sessionId, botMessages.questionPending());
  }
  keepFakeDirective(kept, message.media.caption);
  if (options.siteQuestionFollows || (await siteQuestionAsked(ctx, sessionId))) return;
  const sites = await loadEligibleSites(prisma, ctx.target.tenantId, ctx.target.registrationId);
  if (sites.length > 0) await reply(ctx, sessionId, botMessages.chooseSite(sites));
}

/** Photo reçue en `READY` (session déjà passée à `ANALYZING`). */
async function analyzeNewPhoto(
  ctx: FlowContext,
  sessionId: string,
  message: ImageMessage,
  locationId: string,
  tracker: AnalysisTracker
): Promise<void> {
  const refused = await refuseBeforeAnalysis(ctx, locationId, { checkCount: true });
  if (refused) {
    await backToReady(ctx, sessionId);
    return reply(ctx, sessionId, refused);
  }
  const reservation = await reserveWhatsappPhoto(ctx.target.tenantId, ctx.access.quota.limit, ctx.now);
  if (!reservation.ok) {
    await backToReady(ctx, sessionId);
    await noteWhatsappQuotaReached(ctx.target.tenantId, ctx.target.userId, ctx.access.quota.limit, ctx.now);
    return reply(ctx, sessionId, botMessages.quotaReached());
  }
  tracker.reservedMonth = reservation.month;
  const download = await downloadAndStore(ctx.target.tenantId, message);
  if (!download.ok) {
    await releaseOnce(ctx, tracker);
    await backToReady(ctx, sessionId);
    return reply(ctx, sessionId, download.reply);
  }
  const photo = download.photo;
  tracker.orphanFileUrl = photo.fileUrl;

  const created = await withRegistrationLock(ctx.target.registrationId, async tx => {
    const session = await tx.stockWhatsappSession.findFirst({
      where: {
        id: sessionId,
        tenantId: ctx.target.tenantId,
        closedAt: null,
        state: 'ANALYZING',
        pendingCaptureId: null
      },
      select: { siteId: true, locationId: true }
    });
    const capture = await tx.stockFieldCapture.create({
      data: {
        ...captureData(ctx, sessionId, message, photo),
        siteId: session?.siteId ?? null,
        locationId: session?.locationId ?? null,
        outcome: session ? 'PENDING' : 'EXPIRED',
        quotaCounted: session !== null
      },
      select: { id: true }
    });
    if (!session) return { id: capture.id, linked: false };
    const linked = await transitionSession(
      tx,
      { id: sessionId, tenantId: ctx.target.tenantId },
      ['ANALYZING'],
      { pendingCaptureId: capture.id },
      { pendingCaptureId: null }
    );
    if (!linked) {
      await tx.stockFieldCapture.updateMany({
        where: { id: capture.id, tenantId: ctx.target.tenantId },
        data: { outcome: 'EXPIRED', quotaCounted: false }
      });
    }
    return { id: capture.id, linked };
  });
  tracker.orphanFileUrl = null;
  if (!created.linked) {
    // Session fermée pendant le téléchargement : photo gardée, aucune analyse, réservation rendue.
    await releaseOnce(ctx, tracker);
    return;
  }
  tracker.captureId = created.id;

  keepFakeDirective(created.id, message.media.caption);
  await reply(ctx, sessionId, botMessages.photoReceived(), created.id);
  await runAnalysis(ctx, sessionId, created.id, { tracker, imposedItemId: null });
}

/**
 * Chantier choisi alors qu'une photo attendait (`RECEIVED`) : la session est
 * déjà en `ANALYZING` ; réservation du quota, puis analyse.
 */
export async function analyzeKeptCapture(ctx: FlowContext, sessionId: string, captureId: string): Promise<void> {
  const tracker = newTracker(captureId);
  return guardAnalysis(ctx, sessionId, tracker, () => analyzeKeptCaptureUnguarded(ctx, sessionId, captureId, tracker));
}

/** Photo gardée abandonnée avant l'analyse (quota, inventaire en attente, plafond) : `CANCELLED`, `READY`. */
async function dropKeptCapture(ctx: FlowContext, sessionId: string, captureId: string): Promise<void> {
  await withRegistrationLock(ctx.target.registrationId, async tx => {
    await tx.stockFieldCapture.updateMany({
      where: { id: captureId, tenantId: ctx.target.tenantId, outcome: 'RECEIVED' },
      data: { outcome: 'CANCELLED' }
    });
    await transitionSession(tx, { id: sessionId, tenantId: ctx.target.tenantId }, ['ANALYZING'], {
      state: 'READY',
      pendingCaptureId: null
    });
  });
}

async function analyzeKeptCaptureUnguarded(
  ctx: FlowContext,
  sessionId: string,
  captureId: string,
  tracker: AnalysisTracker
): Promise<void> {
  const located = await prisma.stockWhatsappSession.findFirst({
    where: { id: sessionId, tenantId: ctx.target.tenantId, closedAt: null },
    select: { locationId: true }
  });
  const refused = await refuseBeforeAnalysis(ctx, located?.locationId ?? null, { checkCount: true });
  if (refused) {
    await dropKeptCapture(ctx, sessionId, captureId);
    return reply(ctx, sessionId, refused);
  }
  const reservation = await reserveWhatsappPhoto(ctx.target.tenantId, ctx.access.quota.limit, ctx.now);
  if (!reservation.ok) {
    await dropKeptCapture(ctx, sessionId, captureId);
    await noteWhatsappQuotaReached(ctx.target.tenantId, ctx.target.userId, ctx.access.quota.limit, ctx.now);
    return reply(ctx, sessionId, botMessages.quotaReached());
  }
  tracker.reservedMonth = reservation.month;
  const ready = await withRegistrationLock(ctx.target.registrationId, async tx => {
    const session = await tx.stockWhatsappSession.findFirst({
      where: {
        id: sessionId,
        tenantId: ctx.target.tenantId,
        closedAt: null,
        state: 'ANALYZING',
        pendingCaptureId: captureId
      },
      select: { siteId: true, locationId: true }
    });
    if (!session) return false;
    const updated = await tx.stockFieldCapture.updateMany({
      where: { id: captureId, tenantId: ctx.target.tenantId, outcome: 'RECEIVED' },
      data: { outcome: 'PENDING', siteId: session.siteId, locationId: session.locationId, quotaCounted: true }
    });
    return updated.count === 1;
  });
  if (!ready) {
    await releaseOnce(ctx, tracker);
    return;
  }
  await reply(ctx, sessionId, botMessages.photoReceived(), captureId);
  await runAnalysis(ctx, sessionId, captureId, { tracker, imposedItemId: null });
}

/** Nouvelle analyse de la MÊME photo avec l'article imposé par le chef (W9-R2), sans quota. */
export async function reanalyzeWithItem(
  ctx: FlowContext,
  sessionId: string,
  captureId: string,
  itemId: string
): Promise<void> {
  const refused = await refuseBeforeAnalysis(ctx, null, { checkCount: false });
  if (refused) return reply(ctx, sessionId, refused, captureId);
  const claimed = await withRegistrationLock(ctx.target.registrationId, async tx =>
    transitionSession(
      tx,
      { id: sessionId, tenantId: ctx.target.tenantId },
      ['AWAITING_ITEM'],
      { state: 'ANALYZING', reminderSentAt: null },
      { pendingCaptureId: captureId }
    )
  );
  if (!claimed) return;
  const tracker = newTracker(captureId);
  return guardAnalysis(ctx, sessionId, tracker, async () => {
    await reply(ctx, sessionId, botMessages.photoReceived(), captureId);
    await runAnalysis(ctx, sessionId, captureId, { tracker, imposedItemId: itemId });
  });
}

type CaptureForAnalysis = {
  id: string;
  tenantId: string;
  fileUrl: string | null;
  receivedAt: Date;
  locationId: string | null;
  mimeType: string;
};

async function callVision(
  ctx: FlowContext,
  capture: CaptureForAnalysis,
  imposedItemId: string | null
): Promise<{ outcome: StockVisionOutcome; units: Map<string, { label: string; reference: string; unit: string }> }> {
  const provider = getStockVisionProvider();
  const units = new Map<string, { label: string; reference: string; unit: string }>();
  let image: Buffer;
  try {
    image = (await readCapturePhoto(capture)).buffer;
  } catch {
    return {
      outcome: { ok: false, reason: 'PROVIDER_ERROR', provider: provider.id, model: provider.model, latencyMs: 0 },
      units
    };
  }
  const candidates = await selectStockVisionCandidates(ctx.target.tenantId, {
    locationId: capture.locationId,
    includeItemId: imposedItemId,
    now: ctx.now
  });
  for (const candidate of candidates) units.set(candidate.id, candidate);
  const controller = new AbortController();
  const outcome = await provider.analyze(
    {
      image,
      mimeType: capture.mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
      candidates,
      imposedItemId,
      fakeDirective: provider.id === 'fake' ? (fakeDirectives.get(capture.id) ?? null) : null
    },
    controller.signal
  );
  return { outcome, units };
}

function analysisColumns(outcome: StockVisionOutcome, now: Date): Prisma.StockFieldCaptureUncheckedUpdateManyInput {
  const base = {
    visionProvider: outcome.provider,
    visionModel: outcome.model,
    analysisMs: outcome.latencyMs,
    analyzedAt: now
  };
  if (!outcome.ok) return { ...base, failureReason: outcome.reason };
  const result = outcome.result;
  return {
    ...base,
    failureReason: null,
    quality: result.quality,
    method: result.method,
    proposedTotal: result.proposedTotal,
    confidence: Math.round(result.confidence * 1000) / 1000,
    analysis: result as unknown as Prisma.InputJsonValue
  };
}

type Decision =
  | { kind: 'FAILED' }
  | { kind: 'UNREADABLE'; quality: StockVisionResult['quality'] }
  | { kind: 'UNKNOWN_ITEM' }
  | { kind: 'PROPOSAL'; itemId: string; imposed: boolean; result: StockVisionResult };

function decide(outcome: StockVisionOutcome, imposedItemId: string | null): Decision {
  if (!outcome.ok) return { kind: 'FAILED' };
  const result = { ...outcome.result, itemId: imposedItemId ?? outcome.result.itemId };
  if (result.quality !== 'OK') return { kind: 'UNREADABLE', quality: result.quality };
  if (!(result.proposedTotal > 0)) return { kind: 'UNREADABLE', quality: 'NOT_STOCK' };
  if (!result.itemId) return { kind: 'UNKNOWN_ITEM' };
  return { kind: 'PROPOSAL', itemId: result.itemId, imposed: imposedItemId !== null, result };
}

/** Accès perdu pendant l'analyse : la capture est abandonnée, la session fermée, M06 ou M06b (W12-R1). */
async function handleAccessLostAfterAnalysis(
  ctx: FlowContext,
  sessionId: string,
  captureId: string,
  access: Extract<ChefAccess, { ok: false }>,
  columns: Prisma.StockFieldCaptureUncheckedUpdateManyInput
): Promise<void> {
  const closed = await withRegistrationLock(ctx.target.registrationId, async tx => {
    await tx.stockFieldCapture.updateMany({
      where: { id: captureId, tenantId: ctx.target.tenantId, outcome: 'PENDING' },
      data: { ...columns, outcome: 'EXPIRED' }
    });
    return closeSessionRow(tx, { id: sessionId, tenantId: ctx.target.tenantId }, 'ACCESS_LOST', ctx.now);
  });
  if (closed) {
    await reply(
      ctx,
      sessionId,
      access.reason === 'OPTION_MISSING' ? botMessages.optionMissing() : botMessages.accessLost()
    );
  }
}

/** Analyse, puis décision sous verrou. */
async function runAnalysis(
  ctx: FlowContext,
  sessionId: string,
  captureId: string,
  options: { tracker: AnalysisTracker; imposedItemId: string | null }
): Promise<void> {
  const capture = await prisma.stockFieldCapture.findFirst({
    where: { id: captureId, tenantId: ctx.target.tenantId },
    select: { id: true, tenantId: true, fileUrl: true, receivedAt: true, locationId: true, mimeType: true }
  });
  if (!capture) throw new Error('Capture introuvable pendant l’analyse');

  const { outcome, units } = await callVision(ctx, capture, options.imposedItemId);
  options.tracker.analyzed = outcome.ok;
  const analyzedAt = new Date();
  const columns = analysisColumns(outcome, analyzedAt);
  if (!outcome.ok && options.tracker.reservedMonth) {
    await releaseOnce(ctx, options.tracker);
    columns.quotaCounted = false;
  }

  const access = await resolveChefAccess(ctx.target.registrationId, { now: ctx.now, tenantId: ctx.target.tenantId });
  if (!access.ok) return handleAccessLostAfterAnalysis(ctx, sessionId, captureId, access, columns);

  const decision = decide(outcome, options.imposedItemId);
  const applied = await applyDecision(ctx, sessionId, captureId, decision, columns);
  if (!applied) return;
  await reply(ctx, sessionId, decisionMessage(captureId, decision, units), captureId);
}

/** Écrit la décision ; faux si la session n'attendait plus cette analyse (capture `EXPIRED`). */
async function applyDecision(
  ctx: FlowContext,
  sessionId: string,
  captureId: string,
  decision: Decision,
  columns: Prisma.StockFieldCaptureUncheckedUpdateManyInput
): Promise<boolean> {
  return withRegistrationLock(ctx.target.registrationId, async tx => {
    const session = { id: sessionId, tenantId: ctx.target.tenantId };
    const pendingWhere = { pendingCaptureId: captureId };
    let next: Prisma.StockWhatsappSessionUncheckedUpdateManyInput;
    let capture: Prisma.StockFieldCaptureUncheckedUpdateManyInput;
    if (decision.kind === 'FAILED') {
      next = { state: 'READY', pendingCaptureId: null };
      capture = { ...columns, outcome: 'FAILED' };
    } else if (decision.kind === 'UNREADABLE') {
      next = { state: 'READY', pendingCaptureId: null };
      capture = { ...columns, outcome: 'UNREADABLE' };
    } else if (decision.kind === 'UNKNOWN_ITEM') {
      next = { state: 'AWAITING_ITEM', reminderSentAt: null };
      capture = { ...columns, itemId: null };
    } else {
      next = { state: 'AWAITING_CONFIRMATION', reminderSentAt: null };
      capture = { ...columns, itemId: decision.itemId, itemImposed: decision.imposed };
    }
    const moved = await transitionSession(tx, session, ['ANALYZING'], next, pendingWhere);
    if (!moved) {
      await tx.stockFieldCapture.updateMany({
        where: { id: captureId, tenantId: ctx.target.tenantId, outcome: 'PENDING' },
        data: { ...columns, outcome: 'EXPIRED' }
      });
      return false;
    }
    await tx.stockFieldCapture.updateMany({ where: { id: captureId, tenantId: ctx.target.tenantId }, data: capture });
    return true;
  });
}

function decisionMessage(
  captureId: string,
  decision: Decision,
  units: Map<string, { label: string; reference: string; unit: string }>
): OutboundMessage {
  if (decision.kind === 'FAILED') return botMessages.analysisFailed();
  if (decision.kind === 'UNREADABLE') {
    return decision.quality === 'NOT_STOCK' ? botMessages.notStock() : botMessages.tooDark();
  }
  if (decision.kind === 'UNKNOWN_ITEM') return botMessages.itemUnknown();
  const item = units.get(decision.itemId) ?? { label: '', reference: '', unit: '' };
  return botMessages.proposal({
    captureId,
    item: item.label,
    reference: item.reference,
    unit: item.unit,
    total: decision.result.proposedTotal,
    result: decision.result
  });
}

/** Abandon d'une capture en attente, sous verrou (commandes, expiration). */
export async function dropPendingCapture(
  registrationId: string,
  session: Pick<SessionRow, 'tenantId' | 'pendingCaptureId'>
): Promise<boolean> {
  return withRegistrationLock(registrationId, tx => abandonPendingCapture(tx, session));
}
