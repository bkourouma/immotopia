import { prisma } from '../utils/database';
import type {
  CreateHelpFeedbackInput,
  HelpFeedbackQuestion,
  HelpFeedbackSummary,
  HelpFeedbackSummaryItem
} from '../lib/help/help-feedback-schemas';

/**
 * Avis sur les fiches d'aide interne.
 *
 * Bornes de lecture (une synthèse ne doit jamais charger la table entière) :
 *  - au plus `MAX_ITEMS` fiches renvoyées (les plus parlantes d'abord) ;
 *  - questions : une seule requête bornée aux `MAX_QUESTION_ROWS` plus récentes de la fenêtre,
 *    puis `QUESTIONS_PER_ITEM` par fiche gardées en mémoire. Une fiche très bavarde peut donc
 *    occuper la borne et priver les autres de leurs questions les plus anciennes : le compteur
 *    `questionsCount` reste exact, lui, car il vient d'un groupBy.
 */
const MAX_ITEMS = 200;
const MAX_QUESTION_ROWS = 1000;
const QUESTIONS_PER_ITEM = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Même motif que `TENANT_IN_PATH` de lib/ai/page-context.ts (volontairement recopié). */
const TENANT_IN_PATH = /\/tenants?\/([^/?#]+)/;

interface ResolveContext {
  path?: string;
  portalTenantHeader?: string;
}

/**
 * Agence d'un avis. L'agence annoncée par le client (chemin de l'écran, en-tête de portail)
 * n'est JAMAIS crue sur parole : un candidat n'est retenu que si l'utilisateur en est membre
 * ACTIF ou client. Sinon `null` (avis hors agence), sans erreur et sans fuite : un avis ne doit
 * pas échouer parce que le contexte est douteux.
 */
export async function resolveFeedbackTenantId(userId: string, context: ResolveContext): Promise<string | null> {
  const candidates: string[] = [];
  const fromPath = context.path ? TENANT_IN_PATH.exec(context.path)?.[1] : undefined;
  if (fromPath) candidates.push(fromPath);
  const fromHeader = context.portalTenantHeader?.trim();
  if (fromHeader && !candidates.includes(fromHeader)) candidates.push(fromHeader);

  for (const tenantId of candidates) {
    const membership = await prisma.membership.findFirst({
      where: { userId, tenantId, status: 'ACTIVE' },
      select: { id: true }
    });
    if (membership) return tenantId;
    const client = await prisma.tenantClient.findFirst({ where: { userId, tenantId }, select: { id: true } });
    if (client) return tenantId;
  }
  return null;
}

export async function createHelpFeedback(
  userId: string,
  input: CreateHelpFeedbackInput,
  tenantId: string | null
): Promise<{ id: string }> {
  const created = await prisma.helpFeedback.create({
    data: {
      tenantId,
      userId,
      helpId: input.helpId,
      useful: input.useful ?? null,
      question: input.question ?? null,
      path: input.path ?? null,
      locale: input.locale
    },
    select: { id: true }
  });
  return { id: created.id };
}

interface SummaryOptions {
  days: number;
  /** Fourni : lecture agence, filtre STRICT (les avis sans agence n'y apparaissent jamais). Absent : plateforme. */
  tenantId?: string;
}

export async function listHelpFeedbackSummary(options: SummaryOptions): Promise<HelpFeedbackSummary> {
  const since = new Date(Date.now() - options.days * DAY_MS);
  const base = {
    createdAt: { gte: since },
    ...(options.tenantId ? { tenantId: options.tenantId } : {})
  };
  const withNames = !options.tenantId;

  const [byVote, byQuestion, recent] = await Promise.all([
    prisma.helpFeedback.groupBy({
      by: ['helpId', 'useful'],
      where: base,
      _count: { _all: true },
      _max: { createdAt: true }
    }),
    prisma.helpFeedback.groupBy({
      by: ['helpId'],
      where: { ...base, question: { not: null } },
      _count: { _all: true }
    }),
    prisma.helpFeedback.findMany({
      where: { ...base, question: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: MAX_QUESTION_ROWS,
      select: {
        helpId: true,
        question: true,
        createdAt: true,
        locale: true,
        ...(withNames ? { tenant: { select: { name: true } } } : {})
      }
    })
  ]);

  const items = new Map<string, HelpFeedbackSummaryItem>();
  const itemOf = (helpId: string): HelpFeedbackSummaryItem => {
    let item = items.get(helpId);
    if (!item) {
      item = { helpId, useful: 0, notUseful: 0, questionsCount: 0, lastAt: '', questions: [] };
      items.set(helpId, item);
    }
    return item;
  };

  for (const row of byVote) {
    const item = itemOf(row.helpId);
    if (row.useful === true) item.useful += row._count._all;
    else if (row.useful === false) item.notUseful += row._count._all;
    const last = row._max.createdAt?.toISOString();
    if (last && last > item.lastAt) item.lastAt = last;
  }
  for (const row of byQuestion) itemOf(row.helpId).questionsCount = row._count._all;

  for (const row of recent) {
    const item = items.get(row.helpId);
    if (!item || row.question === null || item.questions.length >= QUESTIONS_PER_ITEM) continue;
    const question: HelpFeedbackQuestion = {
      text: row.question,
      createdAt: row.createdAt.toISOString(),
      locale: row.locale,
      tenantName: withNames ? ((row as { tenant?: { name: string } | null }).tenant?.name ?? null) : null
    };
    item.questions.push(question);
  }

  const sorted = [...items.values()].sort((a, b) => {
    const gravity = b.notUseful + b.questionsCount - (a.notUseful + a.questionsCount);
    if (gravity !== 0) return gravity;
    if (a.lastAt !== b.lastAt) return a.lastAt < b.lastAt ? 1 : -1;
    return a.helpId < b.helpId ? -1 : a.helpId > b.helpId ? 1 : 0;
  });
  return { items: sorted.slice(0, MAX_ITEMS) };
}
