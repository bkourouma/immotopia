import { prisma } from '../../../utils/database';
import { assertBelongsToTenant } from '../../../utils/tenant-ownership';
import { NotFoundError } from '../../../middleware/error-middleware';
import { isUuid, type SessionsQuery } from './schemas';

/**
 * Conversations de l'inventaire par WhatsApp, côté agence (lot 041, T9,
 * W14-R3) : liste des sessions et messages d'une session.
 *
 * Lisibles par `FINANCE_SETTINGS_MANAGE` ou `STOCK_COUNT_VALIDATE` (garde de la
 * route) : elles contiennent les textes du chef. Le numéro de téléphone n'y
 * figure jamais (il est sur l'inscription, et n'est pas relu ici).
 *
 * Toute référence reçue (session, inscription) est vérifiée dans l'agence ;
 * une référence d'une autre agence répond comme un objet inexistant.
 */

export const SESSIONS_PAGE_SIZE = 50;

/** Plafond de messages rendus pour une session (une session dure 30 minutes sans réponse au plus). */
export const SESSION_MESSAGES_MAX = 500;

export type SessionState =
  'AWAITING_SITE' | 'ANALYZING' | 'AWAITING_ITEM' | 'AWAITING_CONFIRMATION' | 'AWAITING_MERGE' | 'READY' | 'CLOSED';

export type SessionView = {
  id: string;
  registrationId: string;
  chefLabel: string;
  state: SessionState;
  siteName: string | null;
  countId: string | null;
  openedAt: string;
  lastInboundAt: string;
  closedAt: string | null;
  closeReason: string | null;
  countOutcome: 'COUNTED' | 'LEFT_OPEN' | 'NONE' | null;
  capturesCount: number;
};

export type ConversationMessage = {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  kind: 'TEXT' | 'IMAGE' | 'BUTTONS' | 'LIST' | 'REPLY' | 'UNSUPPORTED';
  text: string | null;
  interactive: Array<{ id: string; title: string; description?: string }> | null;
  captureId: string | null;
  via: 'META' | 'SIMULATOR' | null;
  sendError: string | null;
  createdAt: string;
};

/** Libellé d'une personne : nom complet, sinon e-mail. Jamais l'objet `User` entier. */
export function userLabelOf(user: { fullName: string | null; email: string } | null | undefined): string {
  if (!user) return '';
  const name = user.fullName?.trim();
  return name ? name : user.email;
}

export const sessionSelect = {
  id: true,
  registrationId: true,
  state: true,
  countId: true,
  openedAt: true,
  lastInboundAt: true,
  closedAt: true,
  closeReason: true,
  countOutcome: true,
  site: { select: { name: true } },
  registration: { select: { user: { select: { fullName: true, email: true } } } },
  _count: { select: { captures: true } }
} as const;

export type SessionRecord = {
  id: string;
  registrationId: string;
  state: string;
  countId: string | null;
  openedAt: Date;
  lastInboundAt: Date;
  closedAt: Date | null;
  closeReason: string | null;
  countOutcome: string | null;
  site: { name: string } | null;
  registration: { user: { fullName: string | null; email: string } | null } | null;
  _count?: { captures: number };
};

const COUNT_OUTCOMES = new Set(['COUNTED', 'LEFT_OPEN', 'NONE']);

export function toSessionView(session: SessionRecord): SessionView {
  return {
    id: session.id,
    registrationId: session.registrationId,
    chefLabel: userLabelOf(session.registration?.user),
    state: session.state as SessionState,
    siteName: session.site?.name ?? null,
    countId: session.countId,
    openedAt: session.openedAt.toISOString(),
    lastInboundAt: session.lastInboundAt.toISOString(),
    closedAt: session.closedAt ? session.closedAt.toISOString() : null,
    closeReason: session.closeReason,
    countOutcome:
      session.countOutcome && COUNT_OUTCOMES.has(session.countOutcome)
        ? (session.countOutcome as SessionView['countOutcome'])
        : null,
    capturesCount: session._count?.captures ?? 0
  };
}

/** `[{ id, title, description? }]`, ou `null` : la colonne JSON ne porte rien d'autre. */
export function interactiveOf(value: unknown): ConversationMessage['interactive'] {
  if (!Array.isArray(value)) return null;
  const items: Array<{ id: string; title: string; description?: string }> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const { id, title, description } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || typeof title !== 'string') continue;
    items.push(typeof description === 'string' ? { id, title, description } : { id, title });
  }
  return items.length > 0 ? items : null;
}

export const messageSelect = {
  id: true,
  direction: true,
  kind: true,
  text: true,
  interactive: true,
  captureId: true,
  via: true,
  sendError: true,
  createdAt: true
} as const;

export type MessageRecord = {
  id: string;
  direction: string;
  kind: string;
  text: string | null;
  interactive: unknown;
  captureId: string | null;
  via: string | null;
  sendError: string | null;
  createdAt: Date;
};

export function toConversationMessage(message: MessageRecord): ConversationMessage {
  return {
    id: message.id,
    direction: message.direction as ConversationMessage['direction'],
    kind: message.kind as ConversationMessage['kind'],
    text: message.text,
    interactive: interactiveOf(message.interactive),
    captureId: message.captureId,
    via: (message.via as ConversationMessage['via']) ?? null,
    sendError: message.sendError,
    createdAt: message.createdAt.toISOString()
  };
}

// ---------------------------------------------------------------------------
// Curseur opaque : (openedAt, id), du plus récent au plus ancien
// ---------------------------------------------------------------------------

function encodeCursor(openedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify([openedAt.toISOString(), id]), 'utf8').toString('base64url');
}

function decodeCursor(raw: string | undefined): { openedAt: Date; id: string } | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [openedAt, id] = parsed;
    if (typeof openedAt !== 'string' || !isUuid(id)) return null;
    const date = new Date(openedAt);
    return Number.isNaN(date.getTime()) ? null : { openedAt: date, id };
  } catch {
    return null;
  }
}

/** `GET …/sessions` — du plus récent au plus ancien, par pages de 50. */
export async function listSessions(
  tenantId: string,
  query: SessionsQuery
): Promise<{ data: SessionView[]; nextCursor: string | null }> {
  await assertBelongsToTenant(prisma, 'stockWhatsappRegistration', query.registrationId, tenantId, {
    message: 'Inscription introuvable.'
  });

  const after = decodeCursor(query.cursor);
  const rows = (await prisma.stockWhatsappSession.findMany({
    where: {
      tenantId,
      ...(query.registrationId ? { registrationId: query.registrationId } : {}),
      ...(query.open === true ? { closedAt: null } : query.open === false ? { closedAt: { not: null } } : {}),
      ...(after
        ? {
            OR: [{ openedAt: { lt: after.openedAt } }, { openedAt: after.openedAt, id: { lt: after.id } }]
          }
        : {})
    },
    orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
    take: SESSIONS_PAGE_SIZE + 1,
    select: sessionSelect
  })) as SessionRecord[];

  const page = rows.slice(0, SESSIONS_PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    data: page.map(toSessionView),
    nextCursor: rows.length > SESSIONS_PAGE_SIZE && last ? encodeCursor(last.openedAt, last.id) : null
  };
}

/** Une session de l'agence, ou `NotFoundError` (inexistante, autre agence, identifiant mal formé). */
export async function getSessionForTenant(tenantId: string, sessionId: string): Promise<SessionRecord> {
  if (!isUuid(sessionId)) throw new NotFoundError('Session introuvable.');
  const session = (await prisma.stockWhatsappSession.findFirst({
    where: { id: sessionId, tenantId },
    select: sessionSelect
  })) as SessionRecord | null;
  if (!session) throw new NotFoundError('Session introuvable.');
  return session;
}

/** `GET …/sessions/{sessionId}/messages` — dans l'ordre chronologique. */
export async function listSessionMessages(tenantId: string, sessionId: string): Promise<ConversationMessage[]> {
  const session = await getSessionForTenant(tenantId, sessionId);
  const rows = (await prisma.stockWhatsappMessage.findMany({
    where: { tenantId, sessionId: session.id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: SESSION_MESSAGES_MAX,
    select: messageSelect
  })) as MessageRecord[];
  return rows.map(toConversationMessage);
}
