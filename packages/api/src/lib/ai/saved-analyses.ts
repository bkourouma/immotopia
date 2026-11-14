import { NotFoundError } from '../../middleware/error-middleware';
import { prisma } from '../../utils/database';
import { readArtifactVersions } from './artifact-versions';
import { getStoredArtifact, type AssistantOwner } from './conversations';

type AnalysisReference = { conversationId: string; artifactId: string };
const select = { conversationId: true, artifactId: true, title: true, createdAt: true, pinnedAt: true } as const;

export async function listSavedAnalyses(owner: AssistantOwner, scopeKey: string, cursor?: AnalysisReference) {
  const where = { ...owner, conversation: { scopeKey } };
  if (
    cursor &&
    !(await prisma.assistantSavedAnalysis.findFirst({ where: { ...where, ...cursor }, select: { artifactId: true } }))
  ) {
    throw new NotFoundError();
  }
  const items = await prisma.assistantSavedAnalysis.findMany({
    where,
    select,
    orderBy: [{ createdAt: 'desc' }, { conversationId: 'asc' }, { artifactId: 'asc' }],
    take: 51,
    ...(cursor ? { cursor: { tenantId_ownerId_conversationId_artifactId: { ...owner, ...cursor } }, skip: 1 } : {})
  });
  const last = items[49];
  return {
    items: items.slice(0, 50),
    nextCursor: items.length > 50 ? { conversationId: last.conversationId, artifactId: last.artifactId } : undefined
  };
}

export async function saveAnalysis(owner: AssistantOwner, scopeKey: string, location: AnalysisReference) {
  const original = await getStoredArtifact(owner, location.conversationId, location.artifactId, scopeKey);
  const current = await readArtifactVersions({ ...owner, ...location }, scopeKey);
  const where = { ...owner, ...location, conversation: { scopeKey } };
  // Match the current scope at insertion as well. A concurrent conversation deletion
  // either precedes the SELECT or cascades through the saved analysis.
  await prisma.$executeRaw`
    INSERT INTO assistant_saved_analyses (tenant_id, owner_id, conversation_id, artifact_id, title, original)
    SELECT tenant_id, owner_id, id, ${location.artifactId}, ${current.artifact.title}, ${JSON.stringify(original)}::jsonb
    FROM assistant_conversations
    WHERE tenant_id = ${owner.tenantId} AND owner_id = ${owner.ownerId}
      AND id = ${location.conversationId} AND scope_key = ${scopeKey}
    FOR SHARE
    ON CONFLICT (tenant_id, owner_id, conversation_id, artifact_id) DO NOTHING
  `;
  const saved = await prisma.assistantSavedAnalysis.findFirst({ where, select });
  if (!saved) throw new NotFoundError();
  return saved;
}

export async function removeSavedAnalysis(owner: AssistantOwner, scopeKey: string, location: AnalysisReference) {
  await prisma.assistantSavedAnalysis.deleteMany({
    where: { ...owner, ...location, conversation: { scopeKey } }
  });
}

export async function setSavedAnalysisPin(
  owner: AssistantOwner,
  scopeKey: string,
  location: AnalysisReference,
  pinned: boolean
) {
  const result = await prisma.assistantSavedAnalysis.updateMany({
    where: { ...owner, ...location, conversation: { scopeKey } },
    data: { pinnedAt: pinned ? new Date() : null }
  });
  if (!result.count) throw new NotFoundError();
}

export function listSavedAnalysisPins(owner: AssistantOwner, scopeKey: string) {
  return prisma.assistantSavedAnalysis.findMany({
    where: { ...owner, conversation: { scopeKey }, pinnedAt: { not: null } },
    select: { conversationId: true, artifactId: true },
    orderBy: [{ pinnedAt: 'desc' }, { conversationId: 'asc' }, { artifactId: 'asc' }]
  });
}

export async function assertSavedAnalysisPinned(owner: AssistantOwner, scopeKey: string, location: AnalysisReference) {
  const pin = await prisma.assistantSavedAnalysis.findFirst({
    where: { ...owner, ...location, conversation: { scopeKey }, pinnedAt: { not: null } },
    select: { artifactId: true }
  });
  if (!pin) throw new NotFoundError();
}
