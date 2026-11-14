import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { t } from '../../i18n';
import { ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { prisma } from '../../utils/database';
import {
  COPILOT_MAX_MESSAGE_CHARS,
  COPILOT_MAX_MESSAGES,
  COPILOT_MAX_TOTAL_CHARS,
  type ChatRequest,
  type CopilotSseEvent
} from './contracts';

export type AssistantOwner = { tenantId: string; ownerId: string };

const summary = {
  id: true,
  title: true,
  pinned: true,
  archived: true,
  updatedAt: true
} as const;

export const conversationParams = z.object({ id: z.string().uuid() });
export const historyQuery = z.object({
  archived: z.enum(['true', 'false']).default('false'),
  q: z.string().trim().max(200).default(''),
  cursor: z.string().uuid().optional()
});
export const conversationPatch = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional()
  })
  .strict()
  .refine(value => Object.keys(value).length > 0);

type ResultEvent = Extract<CopilotSseEvent, { type: 'artifact' }>;
type AnalysisTable = Extract<ResultEvent['artifact'], { kind: 'table' }>;

function storedAnalysisTables(results: (Prisma.JsonValue | null)[]): AnalysisTable[] {
  const tables: AnalysisTable[] = [];
  for (const result of results) {
    if (!Array.isArray(result)) continue;
    for (const event of result as unknown as ResultEvent[]) {
      if (event.type === 'artifact' && event.artifact.kind === 'table' && event.artifact.provenance) {
        tables.push(event.artifact);
      }
      if (tables.length === 12) return tables;
    }
  }
  return tables;
}

export function assistantScope(permissions: Set<string>, toolNames: string[]): string {
  return createHash('sha256')
    .update(JSON.stringify([[...permissions].sort(), [...toolNames].sort()]))
    .digest('hex');
}

export async function assertConversation(owner: AssistantOwner, id: string, scopeKey: string) {
  const where = { ...owner, id, scopeKey };
  const conversation = await prisma.assistantConversation.findFirst({ where, select: summary });
  if (!conversation) throw new NotFoundError();
  return conversation;
}

export async function listConversations(owner: AssistantOwner, scopeKey: string, query: z.infer<typeof historyQuery>) {
  const where: Prisma.AssistantConversationWhereInput = { ...owner, scopeKey, archived: query.archived === 'true' };
  if (query.q) {
    // Escape PostgreSQL LIKE wildcards so the query searches for the typed text.
    const contains = query.q.replace(/[\\%_]/g, character => '\\' + character);
    const match = { contains, mode: 'insensitive' as const };
    where.OR = [{ title: match }, { turns: { some: { ...owner, OR: [{ question: match }, { response: match }] } } }];
  }
  if (
    query.cursor &&
    !(await prisma.assistantConversation.findFirst({
      where: { AND: [where, { id: query.cursor }] },
      select: { id: true }
    }))
  )
    throw new NotFoundError();
  const items = await prisma.assistantConversation.findMany({
    where,
    select: summary,
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
    take: 51,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
  });
  return { items: items.slice(0, 50), nextCursor: items.length > 50 ? items[49].id : undefined };
}

export async function getConversation(owner: AssistantOwner, id: string, scopeKey: string) {
  const conversation = await assertConversation(owner, id, scopeKey);
  const turns = await prisma.assistantTurn.findMany({
    where: { ...owner, conversationId: id, conversation: { scopeKey } },
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    take: 100,
    select: { id: true, question: true, response: true, result: true, outcome: true }
  });
  return { ...conversation, turns: turns.reverse() };
}

export async function updateConversation(
  owner: AssistantOwner,
  id: string,
  scopeKey: string,
  data: z.infer<typeof conversationPatch>
) {
  const result = await prisma.assistantConversation.updateMany({ where: { ...owner, id, scopeKey }, data });
  if (result.count === 0) throw new NotFoundError();
}

export async function deleteConversation(owner: AssistantOwner, id: string) {
  // The owner can remove obsolete threads even after their permissions shrink.
  const result = await prisma.assistantConversation.deleteMany({ where: { ...owner, id } });
  if (result.count === 0) throw new NotFoundError();
}

export async function beginAssistantTurn(
  owner: AssistantOwner,
  scopeKey: string,
  input: { conversationId?: string; turnId: string; question: string }
): Promise<{ conversationId: string; messages: ChatRequest['messages']; analysisTables: AnalysisTable[] }> {
  return prisma.$transaction(async tx => {
    let conversationId = input.conversationId;
    if (conversationId) {
      // Hold the parent row lock until the new turn is reserved. This serializes callers for a single thread.
      const result = await tx.assistantConversation.updateMany({
        where: { ...owner, id: conversationId, archived: false, scopeKey },
        data: { updatedAt: new Date() }
      });
      if (result.count === 0) throw new NotFoundError();
    } else {
      const title = input.question.split('\n')[0].replace(/\s+/g, ' ').slice(0, 80).trim();
      const conversation = await tx.assistantConversation.create({
        data: { ...owner, scopeKey, title: title || t('Nouvelle conversation') },
        select: { id: true }
      });
      conversationId = conversation.id;
    }

    const recent = await tx.assistantTurn.findMany({
      where: { ...owner, conversationId },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: Math.floor((COPILOT_MAX_MESSAGES - 1) / 2),
      select: { question: true, response: true, outcome: true, startedAt: true }
    });
    const latest = recent[0];
    if (latest && latest.outcome === null && Date.now() - latest.startedAt.getTime() < 310_000) {
      throw new ConflictError(t('Une réponse est déjà en cours dans cette conversation.'));
    }

    const inserted = await tx.assistantTurn.createMany({
      data: { ...owner, conversationId, id: input.turnId, question: input.question },
      skipDuplicates: true
    });
    if (inserted.count === 0) throw new ConflictError(t('Ce message a déjà été envoyé.'));

    const messages: ChatRequest['messages'] = [{ role: 'user', content: input.question }];
    let remaining = COPILOT_MAX_TOTAL_CHARS - input.question.length;
    for (const row of recent) {
      if (row.outcome !== 'end_turn') continue;
      const answer = row.response.slice(0, COPILOT_MAX_MESSAGE_CHARS).trim();
      const size = row.question.length + answer.length;
      if (size > remaining) break;
      messages.unshift(
        { role: 'user', content: row.question },
        ...(answer ? [{ role: 'assistant' as const, content: answer }] : [])
      );
      remaining -= size;
    }
    const related = await tx.assistantTurn.findMany({
      where: { ...owner, conversationId, outcome: 'end_turn', result: { not: Prisma.DbNull } },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: 6,
      select: { result: true }
    });
    return { conversationId, messages, analysisTables: storedAnalysisTables(related.map(row => row.result)) };
  });
}

export async function finishAssistantTurn(
  owner: AssistantOwner,
  id: string,
  data: { response: string; result: ResultEvent[]; outcome: Extract<CopilotSseEvent, { type: 'done' }>['reason'] }
): Promise<void> {
  await prisma.assistantTurn.updateMany({
    where: { ...owner, id, outcome: null },
    data: { ...data, result: data.result as unknown as Prisma.InputJsonValue }
  });
}
