import { Router, type RequestHandler } from 'express';
import {
  getRentalAlertPropertiesHandler,
  listRentalAlertsHandler,
  removeRentalAlertHandler,
  saveRentalAlertHandler
} from '../controllers/assistant-rental-alert-controller';
import multer from 'multer';
import {
  MAX_DICTATION_BYTES,
  requireTranscriptionEngine,
  transcribeHandler
} from '../controllers/ai-transcription-controller';
import { MAX_ASSISTANT_FILES, MAX_ASSISTANT_FILE_BYTES } from '../lib/ai/assistant-files';
import { t } from '../i18n';
import { authenticate } from '../middleware/auth-middleware';
import { AppError, ErrorCode } from '../middleware/error-middleware';
import { requireTenantAccess, requireTenantCollaborator } from '../middleware/tenant-middleware';
import { requireAiAssistantAccess, requireAiStatusAccess } from '../middleware/ai-access-middleware';
import { resolveAssistantLanguage } from '../middleware/language-middleware';
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
  getBriefingHandler,
  listConversationsHandler,
  listSavedAnalysesHandler,
  listScheduledReportsHandler,
  listAssistantTasksHandler,
  notifyAssistantColleaguesHandler,
  decideFollowUpHandler,
  createAssistantTaskHandler,
  updateAssistantTaskHandler,
  createScheduledReportDraftHandler,
  deleteScheduledReportHandler,
  updateScheduledReportHandler,
  listSavedAnalysisPinsHandler,
  getSavedAnalysisPinHandler,
  setSavedAnalysisPinHandler,
  listAnalysisSharesHandler,
  listAnalysisSharePinsHandler,
  setAnalysisSharePinHandler,
  listAnalysisRecipientsHandler,
  createAnalysisShareHandler,
  getSharedAnalysisHandler,
  revokeAnalysisShareHandler,
  downloadSharedAnalysisHandler,
  saveAnalysisHandler,
  removeSavedAnalysisHandler,
  rejectActionHandler,
  requireAssistantTools,
  saveResponseFeedbackHandler,
  rewriteArtifactSectionHandler,
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
const maxChatFormBytes = MAX_ASSISTANT_FILES * MAX_ASSISTANT_FILE_BYTES + 64 * 1024;
const chatFiles = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_ASSISTANT_FILES, fileSize: MAX_ASSISTANT_FILE_BYTES, fields: 1, fieldSize: 32_768 }
}).array('files', MAX_ASSISTANT_FILES);

const chatFilesTooLarge = () =>
  new AppError(t('Le fichier envoyé dépasse la taille maximale autorisée.'), 413, ErrorCode.BAD_REQUEST);

const parseChatFiles: RequestHandler = (req, res, next) => {
  if (req.is('multipart/form-data') && Number(req.get('content-length')) > maxChatFormBytes) {
    return next(chatFilesTooLarge());
  }
  chatFiles(req, res, error => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return next(chatFilesTooLarge());
    }
    next(error);
  });
};

router.use(resolveAssistantLanguage);
router.use(authenticate);
router.use(requireTenantAccess);
router.use(requireTenantCollaborator);

// Ce que l'interface peut proposer ; répond `enabled: false` quand l'assistant est désactivé.
router.get('/status', requireAiStatusAccess, getStatusHandler);
router.get('/briefing', requireAiAssistantAccess, getBriefingHandler);
router.get('/rental-alerts', requireAiStatusAccess, listRentalAlertsHandler);
router.get('/rental-alerts/properties', requireAiStatusAccess, getRentalAlertPropertiesHandler);
router.put('/rental-alerts/:id', requireAiStatusAccess, aiActionRateLimiter, saveRentalAlertHandler);
router.delete('/rental-alerts/:id', requireAiStatusAccess, aiActionRateLimiter, removeRentalAlertHandler);
router.post('/notifications', requireAiStatusAccess, aiActionRateLimiter, notifyAssistantColleaguesHandler);
router.patch('/follow-ups/:id', requireAiStatusAccess, aiActionRateLimiter, decideFollowUpHandler);
router.get('/tasks', requireAiStatusAccess, listAssistantTasksHandler);
router.post('/tasks', requireAiStatusAccess, aiActionRateLimiter, createAssistantTaskHandler);
router.patch('/tasks/:id', requireAiStatusAccess, aiActionRateLimiter, updateAssistantTaskHandler);
router.get('/reports', requireAiStatusAccess, listScheduledReportsHandler);
router.post('/reports', requireAiStatusAccess, aiActionRateLimiter, createScheduledReportDraftHandler);
router.delete('/reports/:id', requireAiStatusAccess, aiActionRateLimiter, deleteScheduledReportHandler);
router.patch('/reports/:id', requireAiStatusAccess, aiActionRateLimiter, updateScheduledReportHandler);
router.get('/shares', requireAiStatusAccess, listAnalysisSharesHandler);
router.get('/shares/pins', requireAiStatusAccess, listAnalysisSharePinsHandler);
router.put('/shares/:id/pin', requireAiStatusAccess, aiActionRateLimiter, setAnalysisSharePinHandler);
router.get('/shares/recipients', requireAiStatusAccess, listAnalysisRecipientsHandler);
router.post('/shares', requireAiStatusAccess, aiActionRateLimiter, createAnalysisShareHandler);
router.get('/shares/:id', requireAiStatusAccess, getSharedAnalysisHandler);
router.get('/shares/:id/:format', requireAiStatusAccess, downloadSharedAnalysisHandler);
router.delete('/shares/:id', requireAiStatusAccess, aiActionRateLimiter, revokeAnalysisShareHandler);
router.get('/analyses', requireAiStatusAccess, listSavedAnalysesHandler);
router.get('/analyses/pins', requireAiStatusAccess, listSavedAnalysisPinsHandler);
router.get('/analyses/:conversationId/:artifactId/pin', requireAiStatusAccess, getSavedAnalysisPinHandler);
router.put(
  '/analyses/:conversationId/:artifactId/pin',
  requireAiStatusAccess,
  aiActionRateLimiter,
  setSavedAnalysisPinHandler
);
router.put('/analyses/:conversationId/:artifactId', requireAiStatusAccess, aiActionRateLimiter, saveAnalysisHandler);
router.delete(
  '/analyses/:conversationId/:artifactId',
  requireAiStatusAccess,
  aiActionRateLimiter,
  removeSavedAnalysisHandler
);
router.get('/conversations', requireAiStatusAccess, listConversationsHandler);
router.get('/conversations/:id', requireAiStatusAccess, getConversationHandler);
router.get(
  '/conversations/:id/turns/:turnId/files/:position',
  requireAiStatusAccess,
  downloadConversationAttachmentHandler
);
router.put(
  '/conversations/:id/turns/:turnId/feedback',
  requireAiStatusAccess,
  aiActionRateLimiter,
  saveResponseFeedbackHandler
);
router.get('/conversations/:id/artifacts/:artifactId', requireAiStatusAccess, getArtifactVersionHandler);
router.post(
  '/conversations/:id/artifacts/:artifactId',
  requireAiStatusAccess,
  aiActionRateLimiter,
  updateArtifactVersionHandler
);
router.post(
  '/conversations/:id/artifacts/:artifactId/rewrite',
  requireAiAssistantAccess,
  aiChatRateLimiter,
  aiChatDailyLimiter,
  aiTenantChatRateLimiter,
  aiTenantDailyLimiter,
  rewriteArtifactSectionHandler
);
router.get('/conversations/:id/artifacts/:artifactId/:format', requireAiStatusAccess, downloadArtifactHandler);
router.patch('/conversations/:id', requireAiStatusAccess, updateConversationHandler);
router.delete('/conversations/:id', requireAiStatusAccess, deleteConversationHandler);

router.post(
  '/transcribe',
  requireAiAssistantAccess,
  requireAssistantTools,
  aiChatRateLimiter,
  aiTenantChatRateLimiter,
  aiChatDailyLimiter,
  aiTenantDailyLimiter,
  requireTranscriptionEngine,
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_DICTATION_BYTES, files: 1, fields: 2, fieldSize: 64 }
  }).single('audio'),
  transcribeHandler
);

// Conversation en flux SSE. Chaque outil vérifie sa propre permission ; aucune écriture possible ici.
router.post(
  '/chat',
  requireAiAssistantAccess,
  aiChatRateLimiter,
  aiChatDailyLimiter,
  aiTenantChatRateLimiter,
  aiTenantDailyLimiter,
  parseChatFiles,
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
