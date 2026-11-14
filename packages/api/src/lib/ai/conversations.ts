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
type SavedFile = { name: string; excerpt: string; artifactId?: string | null };
const fileReference = { name: true, position: true } as const;

export async function getConversationAttachment(
  owner: AssistantOwner,
  conversationId: string,
  turnId: string,
  position: number,
  scopeKey: string
) {
  const file = await prisma.assistantAttachment.findFirst({
    where: { ...owner, turnId, position, turn: { ...owner, conversationId, conversation: { scopeKey } } },
    select: { name: true, bytes: true }
  });
  if (!file) throw new NotFoundError();
  return file;
}

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
  // Les outils de présentation ajoutés ici transforment uniquement des jeux déjà accessibles.
  // Leur disponibilité ne change donc pas le périmètre des fils enregistrés.
  // Les analyses du parc et des baux suivent les mêmes gardes de lecture que la recherche.
  const additionalTools = new Set(['show_indicators', 'compose_report', 'property_portfolio', 'lease_portfolio']);
  const readScope = toolNames.filter(name => !additionalTools.has(name));
  return createHash('sha256')
    .update(JSON.stringify([[...permissions].sort(), readScope.sort()]))
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
    select: {
      id: true,
      question: true,
      files: true,
      response: true,
      result: true,
      outcome: true,
      attachments: { where: owner, select: fileReference, orderBy: { position: 'asc' } }
    }
  });
  return { ...conversation, turns: turns.reverse() };
}

export async function getStoredArtifact(owner: AssistantOwner, conversationId: string, id: string, scopeKey: string) {
  const turn = await prisma.assistantTurn.findFirst({
    where: {
      ...owner,
      conversationId,
      conversation: { scopeKey },
      result: { array_contains: [{ type: 'artifact', artifact: { id } }] }
    },
    select: { result: true }
  });
  const events = turn?.result;
  if (Array.isArray(events)) {
    const match = (events as unknown as ResultEvent[]).find(
      event => event.type === 'artifact' && event.artifact.id === id
    );
    if (match) return match.artifact;
  }
  throw new NotFoundError();
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

function buildTurnHistory(
  question: string,
  recent: Array<{ question: string; response: string; outcome: string | null }>
) {
  const messages: ChatRequest['messages'] = [{ role: 'user', content: question }];
  let remaining = COPILOT_MAX_TOTAL_CHARS - question.length;
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
  return messages;
}

export async function beginAssistantTurn(
  owner: AssistantOwner,
  scopeKey: string,
  input: { conversationId?: string; turnId: string; question: string; files?: Array<SavedFile & { bytes: Buffer }> }
): Promise<{
  conversationId: string;
  messages: ChatRequest['messages'];
  analysisTables: AnalysisTable[];
  priorExtracts: SavedFile[];
}> {
  return prisma.$transaction(
    async tx => {
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
        select: { id: true, question: true, response: true, outcome: true, startedAt: true }
      });
      const latest = recent[0];
      if (latest && latest.outcome === null && Date.now() - latest.startedAt.getTime() < 310_000) {
        throw new ConflictError(t('Une réponse est déjà en cours dans cette conversation.'));
      }

      const inserted = await tx.assistantTurn.createMany({
        data: {
          ...owner,
          conversationId,
          id: input.turnId,
          question: input.question,
          files: input.files?.map(file => file.name)
        },
        skipDuplicates: true
      });
      if (inserted.count === 0) throw new ConflictError(t('Ce message a déjà été envoyé.'));

      if (input.files?.length) {
        await tx.assistantAttachment.createMany({
          data: input.files.map((file, position) => ({ ...owner, ...file, position, turnId: input.turnId }))
        });
      }
      const priorExtracts = recent.length
        ? await tx.assistantAttachment.findMany({
            where: { ...owner, turnId: { in: recent.map(turn => turn.id) }, turn: { ...owner, conversationId } },
            select: { name: true, excerpt: true, artifactId: true },
            orderBy: [{ turn: { startedAt: 'desc' } }, { turnId: 'desc' }, { position: 'asc' }],
            take: 5
          })
        : [];
      const messages = buildTurnHistory(input.question, recent);
      const related = await tx.assistantTurn.findMany({
        where: { ...owner, conversationId, outcome: 'end_turn', result: { not: Prisma.DbNull } },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: 6,
        select: { result: true }
      });
      return {
        conversationId,
        messages,
        priorExtracts,
        analysisTables: storedAnalysisTables(related.map(row => row.result))
      };
    },
    { timeout: input.files?.length ? 30_000 : undefined }
  );
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

export async function prepareRegeneration(owner: AssistantOwner, conversationId: string, id: string, scopeKey: string) {
  const parent = await assertConversation(owner, conversationId, scopeKey);
  if (parent.archived) throw new NotFoundError();
  const recent = await prisma.assistantTurn.findMany({
    where: { ...owner, conversationId, conversation: { scopeKey, archived: false } },
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    take: Math.floor((COPILOT_MAX_MESSAGES + 1) / 2),
    select: {
      id: true,
      question: true,
      response: true,
      outcome: true,
      responseRevision: true,
      result: true,
      attachments: {
        where: owner,
        select: { name: true, excerpt: true, artifactId: true },
        orderBy: { position: 'asc' }
      }
    }
  });
  const [turn, ...history] = recent;
  if (turn?.id !== id || turn.outcome === null) {
    throw new ConflictError(t('Seule la dernière réponse terminée peut être régénérée.'));
  }
  const importedIds = new Set(turn.attachments.map(file => file.artifactId));
  const importedTables = storedAnalysisTables([turn.result]).filter(table => importedIds.has(table.id));
  return {
    revision: turn.responseRevision,
    messages: buildTurnHistory(turn.question, history),
    analysisTables: storedAnalysisTables(
      history
        .filter(row => row.outcome === 'end_turn')
        .slice(0, 6)
        .map(row => row.result)
    ),
    importedTables,
    extracts: recent.flatMap(row => row.attachments).slice(0, 5)
  };
}

export async function replaceLatestResponse(
  owner: AssistantOwner,
  conversationId: string,
  id: string,
  scopeKey: string,
  revision: number,
  response: string,
  result: ResultEvent[]
) {
  await prisma.$transaction(async tx => {
    const parent = await tx.assistantConversation.updateMany({
      where: { ...owner, id: conversationId, scopeKey, archived: false },
      data: { updatedAt: new Date() }
    });
    if (!parent.count) throw new NotFoundError();
    const latest = await tx.assistantTurn.findFirst({
      where: { ...owner, conversationId },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      select: { id: true }
    });
    if (latest?.id !== id) throw new ConflictError(t('Seule la dernière réponse terminée peut être régénérée.'));
    const written = await tx.assistantTurn.updateMany({
      where: { ...owner, id, conversationId, responseRevision: revision },
      data: {
        response,
        result: result as unknown as Prisma.InputJsonValue,
        outcome: 'end_turn',
        responseRevision: { increment: 1 }
      }
    });
    if (!written.count) throw new ConflictError(t('La réponse a déjà été modifiée.'));
  });
}
