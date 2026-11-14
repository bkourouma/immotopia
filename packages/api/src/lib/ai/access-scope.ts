import { t } from '../../i18n';
import { AppError } from '../../middleware/error-middleware';
import { getUserPermissions } from '../../services/permission-service';
import { getEntitlements } from '../../services/subscription-v2-service';
import { logger } from '../../utils/logger';
import { getSubscriptionEnforcement } from '../subscription/enforcement';
import { evaluateFeatureAccess } from '../subscription/feature-access';
import type { CopilotToolDefinition } from './contracts';
import { toolsForUser, type ToolFeature } from './tools/registry';

const TOOL_FEATURES: readonly ToolFeature[] = ['CORE', 'RENTAL', 'SYNDIC'];

/**
 * Modules de l'abonnement ouvrant chaque fonctionnalité d'outil. `undefined`
 * (aucun filtre) hors mode `enforce`. Les conversations persistantes exigent
 * un périmètre établi avant de relire des données déjà calculées.
 */
async function entitledFeatures(
  tenantId: string,
  requireFreshScope: boolean
): Promise<{ read: Set<ToolFeature>; write: Set<ToolFeature> } | undefined> {
  if (getSubscriptionEnforcement() !== 'enforce') return undefined;
  try {
    const entitlements = await getEntitlements(tenantId, { fresh: requireFreshScope });
    const allowed = (write: boolean) =>
      new Set(TOOL_FEATURES.filter(feature => evaluateFeatureAccess(entitlements, feature, write).allowed));
    return { read: allowed(false), write: allowed(true) };
  } catch (error) {
    logger.error('ImmoCopilot : droits d’abonnement indisponibles', { tenantId, error });
    if (requireFreshScope) throw new AppError(t('Les droits de l’assistant sont temporairement indisponibles.'), 503);
    return undefined;
  }
}

/** Outils que cet utilisateur peut employer : permission détenue et module d'abonnement inclus. */
export async function resolveAvailableTools(
  userId: string,
  tenantId: string,
  requireFreshScope = false
): Promise<{ permissions: Set<string>; tools: CopilotToolDefinition[]; unavailableFeatures: Set<ToolFeature> }> {
  const permissions = new Set(await getUserPermissions(userId, tenantId, { fresh: requireFreshScope }));
  const features = await entitledFeatures(tenantId, requireFreshScope);
  // Une proposition prépare une écriture : elle exige l'accès en écriture au module.
  const tools = toolsForUser(permissions, features?.read).filter(
    tool => tool.kind !== 'proposal' || !features || features.write.has(tool.feature)
  );
  // Fonctionnalités sans accès en lecture : un appel forgé reçoit MODULE_NOT_INCLUDED.
  const unavailableFeatures = new Set<ToolFeature>(
    features ? TOOL_FEATURES.filter(feature => !features.read.has(feature)) : []
  );
  return { permissions, tools, unavailableFeatures };
}
