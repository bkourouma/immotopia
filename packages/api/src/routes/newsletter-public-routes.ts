import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as controller from '../controllers/newsletter-controller';
import { clientIpKey } from '../middleware/rate-limit-middleware';

const router = Router();

const publicRateLimit = rateLimit({
  keyGenerator: req => clientIpKey(req),
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: 'Trop de requêtes. Réessayez dans une minute.' }
});

const trackRateLimit = rateLimit({
  keyGenerator: req => clientIpKey(req),
  windowMs: 60 * 1000,
  max: 120,
  message: { success: false, message: 'Trop de requêtes.' }
});

router.get('/track/open', trackRateLimit, controller.trackOpenHandler);

router.use(publicRateLimit);
router.post('/subscribe', controller.subscribeHandler);
router.get('/confirm', controller.confirmHandler);
router.post('/confirm', controller.confirmHandler);
router.get('/unsubscribe', controller.unsubscribeHandler);
router.post('/unsubscribe', controller.unsubscribeHandler);

export default router;
