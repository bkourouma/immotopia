import type { Prisma } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { botMessages } from '../bot-messages';
import { deleteCapturePhoto, readCapturePhoto, storeCapturePhoto } from '../capture-files';
import {
  isWhatsappQuotaExhausted,
  noteWhatsappQuotaReached,
  releaseWhatsappPhoto,
  reserveWhatsappPhoto
} from '../quota';
import { resolveChefAccess } from '../registrations/access';
import { getWhatsappTransport } from '../transport';
import type { ChefAccess, InboundMessage, OutboundMessage, StockVisionOutcome, StockVisionResult } from '../types';
import { getStockVisionProvider } from '../vision';
import { selectStockVisionCandidates } from '../vision/candidates';
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

/** Télécharge et stocke la photo ; `null` si le fichier est refusé (M18c). */
async function downloadAndStore(tenantId: string, message: ImageMessage): Promise<StoredPhoto | null> {
  try {
    const media = await getWhatsappTransport().fetchMedia(message.media.mediaId);
    const stored = await storeCapturePhoto(tenantId, media.buffer);
    if ('refused' in stored) return null;
    return { ...stored, providerSha256: media.providerSha256 ?? message.media.providerSha256 ?? null };
  } catch (error) {
    logger.warn('Inventaire WhatsApp : photo non téléchargée', {
      tenantId,
      reason: error instanceof Error ? ((error as { reason?: string }).reason ?? error.name) : 'inconnue'
    });
    return null;
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

/** Photo reçue dans une session ouverte. */
export async function receivePhoto(ctx: FlowContext, sessionId: string, message: ImageMessage): Promise<void> {
  const decision = await withRegistrationLock(ctx.target.registrationId, async tx => {
    const session = await tx.stockWhatsappSession.findFirst({
      where: { id: sessionId, tenantId: ctx.target.tenantId, closedAt: null },
      select: SESSION_SELECT
    });
    if (!session) return 'GONE' as const;
    if (session.state === 'ANALYZING') return 'BUSY' as const;
    if (session.state === 'AWAITING_SITE') return session.pendingCaptureId ? ('QUESTION' as const) : ('KEEP' as const);
    if (session.state !== 'READY' || !session.locationId) return 'QUESTION' as const;
    const claimed = await transitionSession(tx, session, ['READY'], { state: 'ANALYZING', reminderSentAt: null });
    return claimed ? ('ANALYZE' as const) : ('BUSY' as const);
  });

  if (decision === 'GONE') return;
  if (decision === 'BUSY') return reply(ctx, sessionId, botMessages.analysisInProgress());
  if (decision === 'QUESTION') return reply(ctx, sessionId, botMessages.questionPending());
  if (decision === 'KEEP') return keepPhotoForSiteChoice(ctx, sessionId, message);
  return analyzeNewPhoto(ctx, sessionId, message);
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

/** Photo reçue avant le choix du chantier : gardée (`RECEIVED`), analysée dès le choix (W4-R3). */
async function keepPhotoForSiteChoice(ctx: FlowContext, sessionId: string, message: ImageMessage): Promise<void> {
  if (await isWhatsappQuotaExhausted(ctx.target.tenantId, ctx.access.quota.limit, ctx.now)) {
    await noteWhatsappQuotaReached(ctx.target.tenantId, ctx.target.userId, ctx.access.quota.limit, ctx.now);
    return reply(ctx, sessionId, botMessages.quotaReached());
  }
  const photo = await downloadAndStore(ctx.target.tenantId, message);
  if (!photo) return reply(ctx, sessionId, botMessages.fileRefused());

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
}

/** Photo reçue en `READY` (session déjà passée à `ANALYZING`). */
async function analyzeNewPhoto(ctx: FlowContext, sessionId: string, message: ImageMessage): Promise<void> {
  const reservation = await reserveWhatsappPhoto(ctx.target.tenantId, ctx.access.quota.limit, ctx.now);
  if (!reservation.ok) {
    await backToReady(ctx, sessionId);
    await noteWhatsappQuotaReached(ctx.target.tenantId, ctx.target.userId, ctx.access.quota.limit, ctx.now);
    return reply(ctx, sessionId, botMessages.quotaReached());
  }
  const photo = await downloadAndStore(ctx.target.tenantId, message);
  if (!photo) {
    await releaseWhatsappPhoto(ctx.target.tenantId, reservation.month);
    await backToReady(ctx, sessionId);
    return reply(ctx, sessionId, botMessages.fileRefused());
  }

  const captureId = await withRegistrationLock(ctx.target.registrationId, async tx => {
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
  if (!captureId.linked) {
    // Session fermée pendant le téléchargement : photo gardée, aucune analyse, réservation rendue.
    await releaseWhatsappPhoto(ctx.target.tenantId, reservation.month);
    return;
  }

  keepFakeDirective(captureId.id, message.media.caption);
  await reply(ctx, sessionId, botMessages.photoReceived(), captureId.id);
  await runAnalysis(ctx, sessionId, captureId.id, { reservedMonth: reservation.month, imposedItemId: null });
}

/**
 * Chantier choisi alors qu'une photo attendait (`RECEIVED`) : la session est
 * déjà en `ANALYZING` ; réservation du quota, puis analyse.
 */
export async function analyzeKeptCapture(ctx: FlowContext, sessionId: string, captureId: string): Promise<void> {
  const reservation = await reserveWhatsappPhoto(ctx.target.tenantId, ctx.access.quota.limit, ctx.now);
  if (!reservation.ok) {
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
    await noteWhatsappQuotaReached(ctx.target.tenantId, ctx.target.userId, ctx.access.quota.limit, ctx.now);
    return reply(ctx, sessionId, botMessages.quotaReached());
  }
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
    await releaseWhatsappPhoto(ctx.target.tenantId, reservation.month);
    return;
  }
  await reply(ctx, sessionId, botMessages.photoReceived(), captureId);
  await runAnalysis(ctx, sessionId, captureId, { reservedMonth: reservation.month, imposedItemId: null });
}

/** Nouvelle analyse de la MÊME photo avec l'article imposé par le chef (W9-R2), sans quota. */
export async function reanalyzeWithItem(
  ctx: FlowContext,
  sessionId: string,
  captureId: string,
  itemId: string
): Promise<void> {
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
  await reply(ctx, sessionId, botMessages.photoReceived(), captureId);
  await runAnalysis(ctx, sessionId, captureId, { reservedMonth: null, imposedItemId: itemId });
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
  options: { reservedMonth: string | null; imposedItemId: string | null }
): Promise<void> {
  const capture = await prisma.stockFieldCapture.findFirst({
    where: { id: captureId, tenantId: ctx.target.tenantId },
    select: { id: true, tenantId: true, fileUrl: true, receivedAt: true, locationId: true, mimeType: true }
  });
  if (!capture) return;

  const { outcome, units } = await callVision(ctx, capture, options.imposedItemId);
  const analyzedAt = new Date();
  const columns = analysisColumns(outcome, analyzedAt);
  if (!outcome.ok && options.reservedMonth) {
    await releaseWhatsappPhoto(ctx.target.tenantId, options.reservedMonth);
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
