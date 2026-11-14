import type { Prisma } from '@prisma/client';
import { t } from '../../i18n';
import { ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { prisma } from '../../utils/database';
import { getStoredArtifact, type AssistantOwner } from './conversations';
import type { CopilotArtifact } from './contracts';

interface ArtifactLocation extends AssistantOwner {
  conversationId: string;
  artifactId: string;
}

export async function readArtifactVersions(location: ArtifactLocation, scopeKey: string, requested?: number) {
  const original = await getStoredArtifact(
    { tenantId: location.tenantId, ownerId: location.ownerId },
    location.conversationId,
    location.artifactId,
    scopeKey
  );
  const where = {
    tenantId: location.tenantId,
    ownerId: location.ownerId,
    conversationId: location.conversationId,
    artifactId: location.artifactId,
    conversation: { scopeKey }
  };
  const stored = await prisma.assistantArtifactVersion.findMany({
    where,
    select: { version: true, createdAt: true },
    orderBy: { version: 'desc' },
    take: 100
  });
  const latest = stored[0]?.version ?? 1;
  const version = requested ?? latest;
  const versions = [...stored, { version: 1, createdAt: null }];
  if (version === 1) return { artifact: original, version, latest, versions };
  const match = await prisma.assistantArtifactVersion.findFirst({
    where: { ...where, version },
    select: { snapshot: true }
  });
  if (!match) throw new NotFoundError();
  return { artifact: match.snapshot as unknown as CopilotArtifact, version, latest, versions };
}

export async function appendArtifactVersion(
  location: ArtifactLocation,
  previous: number,
  artifact: CopilotArtifact
): Promise<number> {
  const version = previous + 1;
  const result = await prisma.assistantArtifactVersion.createMany({
    data: { ...location, version, snapshot: artifact as unknown as Prisma.InputJsonValue },
    skipDuplicates: true
  });
  if (result.count !== 1) throw new ConflictError(t('Une version plus récente est déjà disponible.'));
  return version;
}
