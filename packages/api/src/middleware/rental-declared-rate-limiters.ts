import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { t } from '../i18n';

/**
 * Limiteurs du paiement locatif déclaré (contrat 049, §1.3, §1.5, §1.6).
 * Magasin en mémoire de processus, comme les limiteurs Syndic.
 * Portail : clé = compte locataire (repli : IP). Gestionnaire : utilisateur + agence.
 */

function handler(_req: Request, res: Response): void {
  res.status(429).json({
    success: false,
    code: 'RATE_LIMITED',
    message: t('Trop de requêtes. Veuillez réessayer dans une minute.')
  });
}

function portalKey(req: Request): string {
  const portal = req.tenantPortal;
  return portal ? `${portal.tenantId}:${portal.tenantClientId}` : `ip:${req.ip ?? 'inconnue'}`;
}

function managerKey(req: Request): string {
  return `${req.user?.userId ?? 'anonyme'}:${req.tenantContext?.tenantId ?? 'aucune-agence'}`;
}

/** Création d'une déclaration par le locataire : 10 par minute et par compte. */
export const rentalDeclareCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: req => `rental-declare-create:${portalKey(req)}`,
  handler,
  standardHeaders: true,
  legacyHeaders: false
});

/** Lecture IA : 5 par minute et par compte. */
export const rentalProofReadMinuteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: req => `rental-proof-read-min:${portalKey(req)}`,
  handler,
  standardHeaders: true,
  legacyHeaders: false
});

/** Lecture IA : 30 par jour et par compte. */
export const rentalProofReadDayLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 30,
  keyGenerator: req => `rental-proof-read-day:${portalKey(req)}`,
  handler,
  standardHeaders: true,
  legacyHeaders: false
});

/** Écritures gestionnaire (numéros, réglages, validation, rejet, saisie pour un tiers) : 30 par minute et par utilisateur. */
export const rentalDeclaredManagerWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: req => `rental-declared-manager-write:${managerKey(req)}`,
  handler,
  standardHeaders: true,
  legacyHeaders: false
});
