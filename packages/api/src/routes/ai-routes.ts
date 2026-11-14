import { Router } from 'express';
import multer from 'multer';
import { MAX_ASSISTANT_FILES, MAX_ASSISTANT_FILE_BYTES } from '../lib/ai/assistant-files';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess, requireTenantCollaborator } from '../middleware/tenant-middleware';
import { requireAiAssistantAccess, requireAiStatusAccess } from '../middleware/ai-access-middleware';
import {
  aiActionRateLimiter,
  aiRejectRateLimiter,
  aiChatDailyLimiter,
  aiChatRateLimiter,
  aiTenantChatRateLimiter,
  aiTenantDailyLimiter
} from '../middleware/rate-limit-middleware';
import {
  chatHandler,
  deleteConversationHandler,
  downloadArtifactHandler,
  downloadConversationAttachmentHandler,
  updateArtifactVersionHandler,
  getArtifactVersionHandler,
  executeActionHandler,
  getConversationHandler,
  getStatusHandler,
  listConversationsHandler,
  rejectActionHandler,
  updateConversationHandler
} from '../controllers/ai-controller';

/**
 * Assistant ImmoCopilot, monté sur `/api/tenants/:tenantId/ai`.
 *
 * Toutes les routes : authentification, accès à l'agence, collaborateur
 * (les clients de portail sont refusés), puis garde de l'assistant (super-admin
 * refusé ; 503 `AI_DISABLED` sauf pour le statut).
 */
const router = Router({ mergeParams: true });
const chatFiles = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_ASSISTANT_FILES, fileSize: MAX_ASSISTANT_FILE_BYTES, fields: 1, fieldSize: 32_768 }
}).array('files', MAX_ASSISTANT_FILES);

router.use(authenticate);
router.use(requireTenantAccess);
router.use(requireTenantCollaborator);

// Ce que l'interface peut proposer ; répond `enabled: false` quand l'assistant est désactivé.
router.get('/status', requireAiStatusAccess, getStatusHandler);
router.get('/conversations', requireAiStatusAccess, listConversationsHandler);
router.get('/conversations/:id', requireAiStatusAccess, getConversationHandler);
router.get(
  '/conversations/:id/turns/:turnId/files/:position',
  requireAiStatusAccess,
  downloadConversationAttachmentHandler
);
router.get('/conversations/:id/artifacts/:artifactId', requireAiStatusAccess, getArtifactVersionHandler);
router.post(
  '/conversations/:id/artifacts/:artifactId',
  requireAiStatusAccess,
  aiActionRateLimiter,
  updateArtifactVersionHandler
);
router.get('/conversations/:id/artifacts/:artifactId/:format', requireAiStatusAccess, downloadArtifactHandler);
router.patch('/conversations/:id', requireAiStatusAccess, updateConversationHandler);
router.delete('/conversations/:id', requireAiStatusAccess, deleteConversationHandler);

// Conversation en flux SSE. Chaque outil vérifie sa propre permission ; aucune écriture possible ici.
router.post(
  '/chat',
  requireAiAssistantAccess,
  aiChatRateLimiter,
  aiChatDailyLimiter,
  aiTenantChatRateLimiter,
  aiTenantDailyLimiter,
  chatFiles,
  chatHandler
);

// Confirmation humaine : SEULE porte d'écriture de l'assistant (jeton de proposition signé, à usage unique).
// Pas de permission fixe sur la route : elle dépend de l'action du jeton, vérifiée par le contrôleur —
// quittance : RENTAL_DOCUMENTS_GENERATE ET RENTAL_DOCUMENTS_VIEW (la carte renvoie vers le téléchargement) ;
// écriture générique : la route réelle appelée par loopback sous l'identité de l'utilisateur qui confirme.
// Limiteur : 10 confirmations par minute et par utilisateur (jetons invalides compris).
router.post('/actions/execute', requireAiAssistantAccess, aiActionRateLimiter, executeActionHandler);

// Refus d'un plan : consomme le jeton (il ne pourra plus être exécuté). Mêmes gardes que la confirmation,
// sans permission de génération (refuser n'écrit rien) ; limiteur PROPRE (30 par minute) : un lot de refus
// ne consomme pas le quota des confirmations.
router.post('/actions/reject', requireAiAssistantAccess, aiRejectRateLimiter, rejectActionHandler);

export default router;
