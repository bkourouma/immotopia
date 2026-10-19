import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { messagingSendRateLimiter } from '../middleware/rate-limit-middleware';
import { requireTenantAccess, requireTenantCollaborator } from '../middleware/tenant-middleware';
import {
  addParticipantsHandler,
  createConversationHandler,
  directoryHandler,
  getConversationHandler,
  leaveConversationHandler,
  listConversationsHandler,
  listMessagesHandler,
  markReadHandler,
  sendMessageHandler,
  unreadCountHandler
} from '../controllers/messaging-controller';

/**
 * Messagerie interne d'agence (menu lot 3). Gardes posees avec leur chemin,
 * jamais en `router.use` nu : ce routeur est monte sur `/api` tout entier.
 * Aucune route d'administration sur le contenu des messages (vie privee).
 */
const router = Router();
const BASE = '/tenants/:tenantId/messages';
const guards = [authenticate, requireTenantAccess, requireTenantCollaborator];

// Chemins fixes AVANT les chemins parametres.
router.get(`${BASE}/unread-count`, ...guards, unreadCountHandler);
router.get(`${BASE}/directory`, ...guards, directoryHandler);

router.get(`${BASE}/conversations`, ...guards, listConversationsHandler);
router.post(`${BASE}/conversations`, ...guards, messagingSendRateLimiter, createConversationHandler);
router.get(`${BASE}/conversations/:id`, ...guards, getConversationHandler);
router.get(`${BASE}/conversations/:id/messages`, ...guards, listMessagesHandler);
router.post(`${BASE}/conversations/:id/messages`, ...guards, messagingSendRateLimiter, sendMessageHandler);
router.post(`${BASE}/conversations/:id/read`, ...guards, markReadHandler);
router.post(`${BASE}/conversations/:id/participants`, ...guards, messagingSendRateLimiter, addParticipantsHandler);
router.delete(`${BASE}/conversations/:id/participants/me`, ...guards, leaveConversationHandler);

export default router;
