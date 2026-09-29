import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess, requireTenantCollaborator } from '../middleware/tenant-middleware';
import { requireAiAssistantAccess, requireAiStatusAccess } from '../middleware/ai-access-middleware';
import { requireDocumentsGenerate, requireDocumentsView } from '../middleware/rental-rbac-middleware';
import {
  aiActionRateLimiter,
  aiChatDailyLimiter,
  aiChatRateLimiter,
  aiTenantChatRateLimiter,
  aiTenantDailyLimiter
} from '../middleware/rate-limit-middleware';
import { chatHandler, executeActionHandler, getStatusHandler } from '../controllers/ai-controller';

/**
 * Assistant ImmoCopilot, monté sur `/api/tenants/:tenantId/ai`.
 *
 * Toutes les routes : authentification, accès à l'agence, collaborateur
 * (les clients de portail sont refusés), puis garde de l'assistant (super-admin
 * refusé ; 503 `AI_DISABLED` sauf pour le statut).
 */
const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(requireTenantAccess);
router.use(requireTenantCollaborator);

// Ce que l'interface peut proposer ; répond `enabled: false` quand l'assistant est désactivé.
router.get('/status', requireAiStatusAccess, getStatusHandler);

// Conversation en flux SSE. Chaque outil vérifie sa propre permission ; aucune écriture possible ici.
router.post(
  '/chat',
  requireAiAssistantAccess,
  aiChatRateLimiter,
  aiChatDailyLimiter,
  aiTenantChatRateLimiter,
  aiTenantDailyLimiter,
  chatHandler
);

// Confirmation humaine : seule porte de génération (permission + jeton de proposition signé).
// GENERATE ET VIEW : la carte de résultat renvoie vers le téléchargement, qui exige VIEW.
router.post(
  '/actions/execute',
  requireAiAssistantAccess,
  requireDocumentsGenerate,
  requireDocumentsView,
  aiActionRateLimiter,
  executeActionHandler
);

export default router;
