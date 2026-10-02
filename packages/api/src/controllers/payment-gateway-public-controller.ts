import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { currentLanguage, t } from '../i18n';
import {
  checkoutReturnUrl,
  findSimulatorCheckout,
  reconcileCheckoutPublic,
  recordSimulatedOutcome
} from '../lib/payment-gateway/checkout';
import { isPlatformCodePaiement } from '../lib/payment-gateway/codes';
import { platformReturnUrl } from '../lib/payment-gateway/platform-account';
import {
  findPlatformSimulatorCheckout,
  reconcilePlatformCheckoutPublic,
  recordPlatformSimulatedOutcome
} from '../services/platform-payment-service';

/**
 * Points d'entrée publics du paiement en ligne — contrat §3.4. Montés dans
 * `app.ts` AVANT les routeurs qui imposent l'authentification.
 */

function readCodePaiement(body: unknown): string | null {
  const record = (body ?? {}) as Record<string, unknown>;
  const value = record.codePaiement ?? record.code_paiement;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * IPN PaySecureHub. Jamais crue sur parole (docs/integrations/paysecurehub.md) :
 * ne fait que retrouver la référence et relancer `reconcileCheckout`, qui va
 * redemander le statut à l'agrégateur avec la clé de l'agence. Répond
 * toujours 200, même code inconnu — ne rien révéler à qui fabriquerait une
 * fausse notification.
 */
export const paysecurehubIpnHandler = asyncHandler(async (req: Request, res: Response) => {
  const codePaiement = readCodePaiement(req.body);

  if (!codePaiement) {
    logger.warn('IPN PaySecureHub reçu sans codePaiement');
    res.status(200).json({ received: true });
    return;
  }

  try {
    await reconcileCheckoutPublic(codePaiement);
  } catch (error) {
    // L'agrégateur peut être injoignable au moment de l'IPN : la tâche
    // planifiée reprendra le rapprochement. L'IPN ne doit jamais échouer.
    logger.warn('IPN PaySecureHub : rapprochement en échec', {
      error: (error as Error)?.message
    });
  }

  res.status(200).json({ received: true });
});

/**
 * IPN du compte PaySecureHub d'ImmoTopia (factures d'abonnement des agences,
 * codes « IMP- »). Adresse distincte de celle des loyers ; memes regles :
 * jamais crue, toujours 200, code inconnu tu.
 */
export const paysecurehubPlatformIpnHandler = asyncHandler(async (req: Request, res: Response) => {
  const codePaiement = readCodePaiement(req.body);
  if (!codePaiement || !isPlatformCodePaiement(codePaiement)) {
    logger.warn('IPN PaySecureHub (abonnement) reçu sans code de facture valable');
    res.status(200).json({ received: true });
    return;
  }
  try {
    await reconcilePlatformCheckoutPublic(codePaiement);
  } catch (error) {
    logger.warn('IPN PaySecureHub (abonnement) : rapprochement en échec', { error: (error as Error)?.message });
  }
  res.status(200).json({ received: true });
});

/** Checkout du simulateur, loyer ou facture d'abonnement selon le prefixe du code. */
async function findAnySimulatorCheckout(
  codePaiement: string
): Promise<{ codePaiement: string; amount: unknown; platformTenantId: string | null } | null> {
  if (isPlatformCodePaiement(codePaiement)) {
    const platform = await findPlatformSimulatorCheckout(codePaiement);
    return platform
      ? { codePaiement: platform.codePaiement, amount: platform.amount, platformTenantId: platform.tenantId }
      : null;
  }
  const rental = await findSimulatorCheckout(codePaiement);
  return rental ? { codePaiement: rental.codePaiement, amount: rental.amount, platformTenantId: null } : null;
}

// Map plutôt qu'objet littéral : 'constructor' ou '__proto__' dans l'URL ne
// doivent pas tomber sur une propriété héritée d'Object.prototype.
const OUTCOME_LABELS = new Map<string, 'SUCCESS' | 'FAILED' | 'CANCELED'>([
  ['success', 'SUCCESS'],
  ['failed', 'FAILED'],
  ['canceled', 'CANCELED']
]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Page HTML autonome du simulateur (contrat §3.4). Aucun script externe,
 * tout le texte inséré est échappé, libellés traduits dans la langue de la
 * requête (`Accept-Language`, middleware `resolveLanguage`).
 *
 * Sa propre Content-Security-Policy remplace celle posée par Helmet pour
 * l'API : la directive `form-action 'self'` par défaut s'applique aussi à la
 * redirection 303 qui suit la soumission, et bloquerait dans le navigateur le
 * retour vers le frontend (autre origine).
 */
export const simulatorPageHandler = asyncHandler(async (req: Request, res: Response) => {
  const { codePaiement } = req.params;
  const checkout = await findAnySimulatorCheckout(codePaiement);
  if (!checkout) {
    throw new NotFoundError('Paiement introuvable.');
  }

  const language = currentLanguage();
  const locale = language === 'ar' ? 'ar' : language === 'en' ? 'en-US' : 'fr-FR';
  const montant = escapeHtml(Number(checkout.amount).toLocaleString(locale));
  const base = `/api/payment-gateway/simulator/${encodeURIComponent(checkout.codePaiement)}`;
  const titre = escapeHtml(t('Simulateur PaySecureHub'));

  const html = `<!DOCTYPE html>
<html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titre}</title>
<style>
  body { font-family: sans-serif; max-width: 480px; margin: 48px auto; padding: 0 16px; }
  button { display: block; width: 100%; margin-block-end: 12px; padding: 12px; font-size: 1rem; cursor: pointer; }
  .amount { font-size: 1.4rem; font-weight: bold; }
</style>
</head>
<body>
  <h1>${titre}</h1>
  <p>${escapeHtml(t('Mode démonstration — aucun paiement réel.'))}</p>
  <p class="amount">${montant} FCFA</p>
  <p>${escapeHtml(t('Référence : {{code}}', { code: checkout.codePaiement }))}</p>
  <form method="POST" action="${base}/success"><button type="submit">${escapeHtml(t('Payer'))}</button></form>
  <form method="POST" action="${base}/failed"><button type="submit">${escapeHtml(t('Solde insuffisant'))}</button></form>
  <form method="POST" action="${base}/canceled"><button type="submit">${escapeHtml(t('Annuler'))}</button></form>
</body>
</html>`;

  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      `form-action 'self' ${new URL(env.FRONTEND_URL).origin}`,
      "base-uri 'none'",
      "frame-ancestors 'none'"
    ].join('; ')
  );
  res.type('html').send(html);
});

export const simulatorActionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { codePaiement, outcome } = req.params;
  const mapped = OUTCOME_LABELS.get(outcome);
  if (!mapped) {
    throw new BadRequestError('Issue de simulation inconnue.');
  }

  if (isPlatformCodePaiement(codePaiement)) {
    // Facture d'abonnement : retour sur la page Abonnement de l'agence.
    const platform = await findPlatformSimulatorCheckout(codePaiement);
    if (!platform) {
      throw new NotFoundError('Paiement introuvable.');
    }
    await recordPlatformSimulatedOutcome(platform, mapped);
    try {
      await reconcilePlatformCheckoutPublic(codePaiement);
    } catch (error) {
      logger.warn('Simulateur PaySecureHub (abonnement) : rapprochement en échec', {
        error: (error as Error)?.message
      });
    }
    res.redirect(303, platformReturnUrl(platform.tenantId, codePaiement));
    return;
  }

  const checkout = await findSimulatorCheckout(codePaiement);
  if (!checkout) {
    throw new NotFoundError('Paiement introuvable.');
  }

  await recordSimulatedOutcome(checkout, mapped);

  try {
    await reconcileCheckoutPublic(codePaiement);
  } catch (error) {
    logger.warn('Simulateur PaySecureHub : rapprochement en échec', { error: (error as Error)?.message });
  }

  res.redirect(303, checkoutReturnUrl(checkout));
});
