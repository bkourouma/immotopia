import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { t } from '../../../i18n';

/**
 * Limiteurs des relances de loyer (contrat 049 section 3), par utilisateur et par agence.
 * Posés APRÈS `authenticate` et `requireTenantAccess`.
 */
function userTenantKey(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || 'aucune-agence';
  return `${req.user?.userId ?? 'anonyme'}:${tenantId}`;
}

function build(max: number, prefix: string) {
  return rateLimit({
    windowMs: 60 * 1000,
    max,
    keyGenerator: req => `${prefix}${userTenantKey(req)}`,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        message: t('Trop de requêtes. Veuillez réessayer dans une minute.')
      });
    },
    standardHeaders: true,
    legacyHeaders: false
  });
}

/** Relance unitaire : 20 par minute et par utilisateur. */
export const rentalReminderSendRateLimiter = build(20, 'rental-reminder-send:');
/** Relance par lot : 10 par minute et par utilisateur. */
export const rentalReminderBatchRateLimiter = build(10, 'rental-reminder-batch:');
