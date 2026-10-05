import { recordAuditEvent, logAuditEvent, AuditActionKey } from '../../../services/audit-service';
import { AppError, ErrorCode } from '../../../middleware/error-middleware';
import type { prisma, PrismaTransactionClient } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { closeStockCountTx, createStockCountTx, setStockCountLineTx } from '../lot040-bridge';
import { resolveChefAccess } from '../registrations/access';
import type { ChefAccess } from '../types';
import { raiseFieldCountClosedAlertTx } from './field-alert';
import { loadEligibleSites } from './site-choice';
import {
  abandonPendingCapture,
  closeSessionRow,
  SESSION_SELECT,
  transitionSession,
  withRegistrationLock,
  type SessionRow
} from './states';

/**
 * Écriture dans l'inventaire du lot 040 (lot 041, spec W5).
 *
 * SEULES écritures de stock permises (W5-R1) : `createStockCountTx`,
 * `setStockCountLineTx`, `closeStockCountTx` (par le pont du lot 040), plus
 * `StockCount.source`. Aucun mouvement, aucune validation, aucun abandon,
 * aucune mise à l'écart.
 *
 * Ordre d'une confirmation : verrou consultatif de l'inscription, relecture de
 * l'accès (W12-R2), puis les fonctions du lot 040 (qui prennent leurs propres
 * verrous). Un refus du lot 040 condamne la transaction : il est rattrapé
 * APRÈS, dans une seconde transaction courte (W5-R7).
 */

export type ConfirmMode = 'ACCEPTED' | 'CORRECTED';
export type MergeMode = 'ADD' | 'REPLACE';

export type ConfirmOutcome =
  | { kind: 'STALE' }
  | { kind: 'ACCESS_LOST'; access: Extract<ChefAccess, { ok: false }> }
  | { kind: 'COUNT_AWAITING_VALIDATION' }
  | { kind: 'MERGE_NEEDED'; existing: number }
  | {
      kind: 'RECORDED';
      countId: string;
      lineId: string;
      quantity: number;
      mode: ConfirmMode;
      mergeMode: MergeMode | null;
    }
  | { kind: 'OFFICE_CHANGED' }
  /** Chantier ou lieu devenu inéligible (W5-R8) : capture annulée, l'appelant relance le choix (M32). */
  | { kind: 'SITE_LOST' };

/**
 * Mode (`ACCEPTED` ou `CORRECTED`) de la réponse du chef gardé pendant
 * `AWAITING_MERGE` dans `mergeMode`, préfixé : il est remplacé par `ADD` ou
 * `REPLACE` à l'écriture, et l'écran ne lit que ces deux valeurs.
 */
const PENDING_MERGE_PREFIX = 'PENDING:';

/** Mode d'origine d'une réponse en attente de fusion ; `null` s'il n'a pas été gardé. */
export function pendingMergeMode(value: unknown): ConfirmMode | null {
  if (value === `${PENDING_MERGE_PREFIX}ACCEPTED`) return 'ACCEPTED';
  if (value === `${PENDING_MERGE_PREFIX}CORRECTED`) return 'CORRECTED';
  return null;
}

/** Codes du lot 040 qui disent « l'inventaire a changé au bureau » (W5-R7). */
const OFFICE_CONFLICT_CODES = new Set<string>([
  ErrorCode.STOCK_COUNT_WRONG_STATUS,
  ErrorCode.STOCK_COUNT_ALREADY_OPEN,
  ErrorCode.STOCK_COUNT_EMPTY,
  ErrorCode.STOCK_COUNT_INCOMPLETE
]);

/** Un refus métier du lot 040 (erreur typée), par opposition à une panne. */
export function isLot040Refusal(error: unknown): error is AppError {
  if (!(error instanceof AppError)) return false;
  if (error.code && OFFICE_CONFLICT_CODES.has(error.code)) return true;
  return error.statusCode >= 400 && error.statusCode < 500;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const number = typeof value === 'number' ? value : Number(String(value));
  return Number.isFinite(number) ? number : 0;
}

/** Jour UTC du serveur (`countedAt` d'un inventaire ouvert par le bot, W5-R2). */
export function utcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Inventaire `DRAFT` du lieu, ou présence d'un inventaire `COUNTED` (W5-R2). */
export async function findLocationCountTx(
  tx: PrismaTransactionClient | typeof prisma,
  tenantId: string,
  locationId: string
): Promise<{ kind: 'DRAFT'; countId: string } | { kind: 'COUNTED' } | { kind: 'NONE' }> {
  const open = await tx.stockCount.findFirst({
    where: { tenantId, locationId, status: { in: ['DRAFT', 'COUNTED'] } },
    select: { id: true, status: true },
    orderBy: { createdAt: 'desc' }
  });
  if (!open) return { kind: 'NONE' };
  return open.status === 'DRAFT' ? { kind: 'DRAFT', countId: open.id } : { kind: 'COUNTED' };
}

type ConfirmInput = {
  tenantId: string;
  registrationId: string;
  userId: string;
  sessionId: string;
  captureId: string;
  itemId: string;
  quantity: number;
  mode: ConfirmMode;
  /** Nul : première réponse (une ligne existante mène à AWAITING_MERGE). */
  mergeMode: MergeMode | null;
  now: Date;
};

async function reloadPendingSession(tx: PrismaTransactionClient, input: ConfirmInput): Promise<SessionRow | null> {
  const session = await tx.stockWhatsappSession.findFirst({
    where: { id: input.sessionId, tenantId: input.tenantId, closedAt: null },
    select: SESSION_SELECT
  });
  if (!session || session.pendingCaptureId !== input.captureId) return null;
  const expected = input.mergeMode ? 'AWAITING_MERGE' : 'AWAITING_CONFIRMATION';
  return session.state === expected ? session : null;
}

/** Le cœur de la confirmation, sous verrou ; un refus du lot 040 remonte tel quel. */
async function confirmTx(tx: PrismaTransactionClient, input: ConfirmInput): Promise<ConfirmOutcome> {
  const session = await reloadPendingSession(tx, input);
  if (!session || !session.locationId) return { kind: 'STALE' };

  const access = await resolveChefAccess(input.registrationId, { db: tx, tenantId: input.tenantId, now: input.now });
  if (!access.ok) {
    await abandonPendingCapture(tx, session);
    await closeSessionRow(tx, session, 'ACCESS_LOST', input.now);
    return { kind: 'ACCESS_LOST', access };
  }

  const eligible = await loadEligibleSites(tx, input.tenantId, input.registrationId);
  if (!eligible.some(site => site.siteId === session.siteId && site.locationId === session.locationId)) {
    // Chantier clos, lieu désactivé ou retiré de l'inscription (W5-R8) : rien n'est écrit.
    await abandonPendingCapture(tx, session, 'CANCELLED');
    return { kind: 'SITE_LOST' };
  }

  let countId = session.countId;
  if (countId) {
    const current = await tx.stockCount.findFirst({
      where: { id: countId, tenantId: input.tenantId },
      select: { status: true }
    });
    if (!current || current.status !== 'DRAFT') {
      // Clos, validé ou abandonné au bureau entre deux messages (W5-R7).
      await abandonPendingCapture(tx, session, 'CANCELLED');
      await transitionSession(tx, session, [session.state], {
        state: 'READY',
        countId: null,
        pendingCaptureId: null,
        reminderSentAt: null
      });
      return { kind: 'OFFICE_CHANGED' };
    }
  } else {
    const found = await findLocationCountTx(tx, input.tenantId, session.locationId);
    if (found.kind === 'COUNTED') {
      await abandonPendingCapture(tx, session, 'CANCELLED');
      await transitionSession(tx, session, [session.state], {
        state: 'READY',
        pendingCaptureId: null,
        reminderSentAt: null
      });
      return { kind: 'COUNT_AWAITING_VALIDATION' };
    }
    if (found.kind === 'DRAFT') countId = found.countId;
  }

  let existing = 0;
  if (countId) {
    const line = await tx.stockCountLine.findFirst({
      where: { countId, count: { tenantId: input.tenantId }, itemId: input.itemId, countedQuantity: { not: null } },
      select: { countedQuantity: true }
    });
    if (line) {
      existing = toNumber(line.countedQuantity);
      if (!input.mergeMode) {
        await tx.stockFieldCapture.updateMany({
          where: { id: input.captureId, tenantId: input.tenantId },
          // Seul support de la quantité du chef entre M30 et sa réponse (aucune
          // colonne dédiée) : l'écran l'affiche « indiquée », pas « retenue ».
          data: { confirmedQuantity: input.quantity, mergeMode: `${PENDING_MERGE_PREFIX}${input.mode}` }
        });
        await transitionSession(tx, session, ['AWAITING_CONFIRMATION'], {
          state: 'AWAITING_MERGE',
          countId,
          reminderSentAt: null
        });
        return { kind: 'MERGE_NEEDED', existing };
      }
    }
  }

  if (!countId) {
    const created = await createStockCountTx(tx, input.tenantId, {
      locationId: session.locationId,
      countedAt: utcDay(input.now),
      createdByUserId: input.userId,
      kind: 'REGULAR'
    });
    countId = created.id;
    await tx.stockCount.updateMany({ where: { id: countId, tenantId: input.tenantId }, data: { source: 'WHATSAPP' } });
  }

  const finalQuantity =
    input.mergeMode === 'ADD' ? Math.round((existing + input.quantity) * 10_000) / 10_000 : input.quantity;
  const { lineId } = await setStockCountLineTx(tx, input.tenantId, countId, {
    itemId: input.itemId,
    countedQuantity: finalQuantity,
    countedByUserId: input.userId
  });

  await tx.stockFieldCapture.updateMany({
    where: { id: input.captureId, tenantId: input.tenantId },
    data: {
      countId,
      countLineId: lineId,
      confirmedQuantity: input.quantity,
      lineQuantityAfter: finalQuantity,
      mergeMode: input.mergeMode,
      outcome: input.mode,
      confirmedAt: input.now
    }
  });
  await transitionSession(tx, session, [session.state], {
    state: 'READY',
    countId,
    pendingCaptureId: null,
    reminderSentAt: null
  });
  return { kind: 'RECORDED', countId, lineId, quantity: finalQuantity, mode: input.mode, mergeMode: input.mergeMode };
}

/**
 * Deux premières confirmations simultanées sur un lieu sans inventaire
 * (deux chefs, ou le bureau qui en ouvre un) : les deux passent la lecture,
 * la seconde bute sur l'index unique partiel `stock_counts_one_open_per_location`
 * (`P2002`, ou `409 STOCK_COUNT_ALREADY_OPEN` rendu par le lot 040).
 */
function isOpenCountRace(error: unknown): boolean {
  if (error instanceof AppError) return error.code === ErrorCode.STOCK_COUNT_ALREADY_OPEN;
  return (error as { code?: unknown } | null)?.code === 'P2002';
}

/**
 * Confirmation, retentée UNE fois après une course d'ouverture : la seconde
 * transaction relit le lieu et réutilise le `DRAFT` ouvert entre-temps
 * (W5-R2). M29 ne vient que d'un inventaire bloquant `COUNTED`.
 */
async function confirmWithOneRetry(input: ConfirmInput): Promise<ConfirmOutcome> {
  try {
    return await withRegistrationLock(input.registrationId, tx => confirmTx(tx, input));
  } catch (error) {
    if (!isOpenCountRace(error)) throw error;
    logger.info('Inventaire WhatsApp : inventaire ouvert entre-temps sur le lieu, confirmation retentée', {
      tenantId: input.tenantId,
      sessionId: input.sessionId
    });
    return withRegistrationLock(input.registrationId, tx => confirmTx(tx, input));
  }
}

/** Rattrapage d'un refus du lot 040 (W5-R7) : capture annulée, session `READY` qui oublie l'inventaire. */
async function recoverFromRefusal(input: ConfirmInput, error: AppError): Promise<ConfirmOutcome> {
  logger.info('Inventaire WhatsApp : écriture refusée par l’inventaire (modifié au bureau)', {
    tenantId: input.tenantId,
    sessionId: input.sessionId,
    code: error.code ?? null
  });
  return withRegistrationLock(input.registrationId, async tx => {
    const session = await reloadPendingSession(tx, input);
    if (!session) return { kind: 'STALE' };
    if (error.code === ErrorCode.STOCK_LOCATION_INACTIVE) {
      await abandonPendingCapture(tx, session, 'CANCELLED');
      return { kind: 'SITE_LOST' };
    }
    let awaitingValidation = false;
    if (error.code === ErrorCode.STOCK_COUNT_ALREADY_OPEN && session.locationId) {
      awaitingValidation = (await findLocationCountTx(tx, input.tenantId, session.locationId)).kind === 'COUNTED';
    }
    await abandonPendingCapture(tx, session, 'CANCELLED');
    await transitionSession(tx, session, [session.state], {
      state: 'READY',
      countId: null,
      pendingCaptureId: null,
      reminderSentAt: null
    });
    return awaitingValidation ? { kind: 'COUNT_AWAITING_VALIDATION' } : { kind: 'OFFICE_CHANGED' };
  });
}

/**
 * Confirme une capture (W5-R2 à W5-R4, W5-R7, W12-R2). Après la transaction :
 * audit `STOCK_WHATSAPP_COUNT_RECORDED` (non critique), agence et acteur
 * explicites.
 */
export async function confirmCapture(input: ConfirmInput): Promise<ConfirmOutcome> {
  let outcome: ConfirmOutcome;
  try {
    outcome = await confirmWithOneRetry(input);
  } catch (error) {
    if (isOpenCountRace(error)) {
      return recoverFromRefusal(
        input,
        new AppError(
          'Un inventaire est déjà en cours sur ce lieu de stockage.',
          409,
          ErrorCode.STOCK_COUNT_ALREADY_OPEN
        )
      );
    }
    if (!isLot040Refusal(error)) throw error;
    return recoverFromRefusal(input, error);
  }
  if (outcome.kind === 'RECORDED') {
    logAuditEvent({
      tenantId: input.tenantId,
      actorUserId: input.userId,
      actionKey: AuditActionKey.STOCK_WHATSAPP_COUNT_RECORDED,
      entityType: 'StockFieldCapture',
      entityId: input.captureId,
      payload: {
        captureId: input.captureId,
        countId: outcome.countId,
        lineId: outcome.lineId,
        itemId: input.itemId,
        quantity: outcome.quantity,
        mode: outcome.mode,
        mergeMode: outcome.mergeMode
      }
    });
  }
  return outcome;
}

export type CountCloseResult = {
  outcome: 'COUNTED' | 'LEFT_OPEN' | 'NONE';
  /** Articles comptés par le chef dans cet inventaire pendant la session. */
  chefLines: number;
};

/** Lignes (distinctes) que le chef a écrites dans cet inventaire pendant la session. */
async function countChefLines(
  tx: PrismaTransactionClient,
  tenantId: string,
  sessionId: string,
  countId: string
): Promise<number> {
  const captures = await tx.stockFieldCapture.findMany({
    where: { tenantId, sessionId, countId, outcome: { in: ['ACCEPTED', 'CORRECTED'] }, countLineId: { not: null } },
    select: { countLineId: true }
  });
  return new Set(captures.map(capture => capture.countLineId)).size;
}

/** W5-R5 : seul un inventaire ouvert par le bot, non vide, compté par le seul chef, est clos ici. */
async function closeCountTx(
  tx: PrismaTransactionClient,
  input: { tenantId: string; userId: string; sessionId: string; countId: string; siteId: string | null },
  chefLines: number
): Promise<'COUNTED' | 'LEFT_OPEN'> {
  const count = await tx.stockCount.findFirst({
    where: { id: input.countId, tenantId: input.tenantId },
    select: { id: true, status: true, source: true, locationId: true, counterUserIds: true }
  });
  if (!count || count.status !== 'DRAFT' || count.source !== 'WHATSAPP') return 'LEFT_OPEN';

  const lines = await tx.stockCountLine.findMany({
    where: { countId: count.id, count: { tenantId: input.tenantId }, countedQuantity: { not: null } },
    select: { countedByUserId: true }
  });
  const counters = new Set<string>(count.counterUserIds ?? []);
  for (const line of lines) if (line.countedByUserId) counters.add(line.countedByUserId);
  const onlyChef = counters.size > 0 && [...counters].every(id => id === input.userId);
  if (lines.length === 0 || !onlyChef) return 'LEFT_OPEN';

  const closed = await closeStockCountTx(tx, input.tenantId, count.id, input.userId);
  const capturesCount = await tx.stockFieldCapture.count({
    where: { tenantId: input.tenantId, countId: count.id, outcome: { in: ['ACCEPTED', 'CORRECTED'] } }
  });
  const alert = await raiseFieldCountClosedAlertTx(tx, {
    tenantId: input.tenantId,
    countId: count.id,
    siteId: input.siteId,
    locationId: count.locationId,
    capturesCount,
    uncountedLinesCount: closed.uncountedLinesCreated
  });
  await recordAuditEvent(tx, {
    tenantId: input.tenantId,
    actorUserId: input.userId,
    actionKey: AuditActionKey.STOCK_WHATSAPP_COUNT_CLOSED,
    entityType: 'StockCount',
    entityId: count.id,
    payload: {
      countId: count.id,
      sessionId: input.sessionId,
      linesCount: alert.linesCount,
      chefLines,
      capturesCount,
      uncountedLinesCount: closed.uncountedLinesCreated
    }
  });
  return 'COUNTED';
}

/**
 * Applique la règle de clôture (W5-R5) à l'inventaire courant d'une session,
 * à `FIN`, à `CHANTIER` et à l'expiration. Un refus du lot 040
 * (`STOCK_COUNT_EMPTY`, `STOCK_COUNT_WRONG_STATUS`…) laisse l'inventaire tel
 * quel et est journalisé. Ne lève pas pour un refus métier.
 */
export async function closeSessionCount(input: {
  tenantId: string;
  registrationId: string;
  userId: string;
  sessionId: string;
  countId: string | null;
  siteId: string | null;
}): Promise<CountCloseResult> {
  const countId = input.countId;
  if (!countId) return { outcome: 'NONE', chefLines: 0 };
  const chefLines = await withRegistrationLock(input.registrationId, tx =>
    countChefLines(tx, input.tenantId, input.sessionId, countId)
  );
  try {
    const outcome = await withRegistrationLock(input.registrationId, tx =>
      closeCountTx(tx, { ...input, countId }, chefLines)
    );
    return { outcome, chefLines };
  } catch (error) {
    if (!isLot040Refusal(error)) throw error;
    logger.info('Inventaire WhatsApp : clôture refusée par l’inventaire, laissé ouvert', {
      tenantId: input.tenantId,
      countId,
      code: error.code ?? null
    });
    return { outcome: 'LEFT_OPEN', chefLines };
  }
}
