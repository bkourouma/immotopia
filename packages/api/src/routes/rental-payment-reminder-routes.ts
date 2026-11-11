import { Router, type RequestHandler } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforceTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requirePaymentsAllocate, requirePaymentsView } from '../middleware/rental-rbac-middleware';
import {
  listInstallmentRemindersHandler,
  listRemindersHandler,
  previewRemindersHandler,
  sendInstallmentReminderHandler,
  sendReminderBatchHandler
} from '../controllers/rental-payment-reminder-controller';
import {
  rentalReminderBatchRateLimiter,
  rentalReminderSendRateLimiter
} from '../lib/rental/payment-reminders/rate-limit';

/**
 * Relances de paiement de loyer envoyées aux locataires, côté gestionnaire
 * (spec 049, contrat section 3). Lecture `RENTAL_PAYMENTS_VIEW`, envoi
 * `RENTAL_PAYMENTS_ALLOCATE`. Relances manuelles : aucun envoi planifié.
 *
 * Monté sur `/api` tout entier : gardes posées AVEC leur chemin, jamais en
 * `router.use` nu. `preview` et `batch` précèdent toute route paramétrée.
 */
const router = Router();

const guards: RequestHandler[] = [authenticate, requireTenantAccess, enforceTenantIsolation];

const REMINDERS = '/tenants/:tenantId/rental/payment-reminders';
const INSTALLMENT = '/tenants/:tenantId/rental/installments/:installmentId';

router.get(`${REMINDERS}/preview`, ...guards, requirePaymentsView, previewRemindersHandler);
router.post(
  `${REMINDERS}/batch`,
  ...guards,
  requirePaymentsAllocate,
  rentalReminderBatchRateLimiter,
  sendReminderBatchHandler
);
router.get(REMINDERS, ...guards, requirePaymentsView, listRemindersHandler);
router.post(
  `${INSTALLMENT}/reminder`,
  ...guards,
  requirePaymentsAllocate,
  rentalReminderSendRateLimiter,
  sendInstallmentReminderHandler
);
router.get(`${INSTALLMENT}/reminders`, ...guards, requirePaymentsView, listInstallmentRemindersHandler);

export default router;
