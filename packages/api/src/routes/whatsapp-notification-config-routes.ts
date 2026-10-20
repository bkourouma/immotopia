import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess, requireTenantCollaborator } from '../middleware/tenant-middleware';
import { enforceTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { BadRequestError } from '../middleware/error-middleware';
import { requireCommunicationByMethod } from '../middleware/communication-rbac-middleware';
import { whatsappTestSendRateLimiter } from '../middleware/rate-limit-middleware';
import { requireNotificationKeyFeature } from '../lib/subscription/notification-feature-gate';
import { requireFeature } from '../middleware/subscription-feature-middleware';
import {
  listHandler,
  updateHandler,
  resetHandler,
  testSendHandler,
  sendGroupInviteToAllHandler,
  sendGroupBroadcastHandler
} from '../controllers/whatsapp-notification-config-controller';

const router = Router({ mergeParams: true });
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png'];
    if (file.mimetype && allowed.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new BadRequestError('Type de fichier non accepté. Formats autorisés : JPEG, PNG.'));
  },
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

router.use(authenticate);
router.use(requireTenantAccess);
// requireTenantAccess also passes for client-type members (renters/owners);
// without this, any renter attached to the tenant could trigger
// /group-invite/send-all and /group-broadcast/send.
router.use(requireTenantCollaborator);
router.use(enforceTenantIsolation);
// GET : lecture ; POST/PATCH/PUT/DELETE (dont /test-send) : garde d'écriture.
router.use(requireCommunicationByMethod);

router.get('/', listHandler);
// Envoi réel et facturable : plafonné par utilisateur et par agence.
router.post('/test-send', ...whatsappTestSendRateLimiter, testSendHandler);
router.post('/group-invite/send-all', requireFeature('CRM'), sendGroupInviteToAllHandler);
router.post(
  '/group-broadcast/send',
  (req, res, next) => {
    upload.single('image')(req, res, (error: unknown) => {
      if (error) {
        const message = error instanceof Error ? error.message : 'Upload image invalide';
        res.status(400).json({ success: false, message });
        return;
      }
      next();
    });
  },
  sendGroupBroadcastHandler
);
router.patch('/:key', requireNotificationKeyFeature, updateHandler);
router.post('/:key/reset', requireNotificationKeyFeature, resetHandler);

export default router;
