import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { prisma } from '../utils/database';
import { reconcileCheckoutPublic } from '../lib/payment-gateway/checkout';

/**
 * Points d'entrée publics du paiement en ligne — contrat §3.4. Montés dans
 * `index.ts` AVANT les routeurs qui imposent l'authentification.
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

const OUTCOME_LABELS: Record<string, string> = {
  success: 'SUCCESS',
  failed: 'FAILED',
  canceled: 'CANCELED'
};

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
 * tout le texte inséré est échappé.
 */
export const simulatorPageHandler = asyncHandler(async (req: Request, res: Response) => {
  const { codePaiement } = req.params;
  const checkout = await prisma.onlinePaymentCheckout.findFirst({
    where: { codePaiement, mode: 'SIMULATOR' }
  });
  if (!checkout) {
    throw new NotFoundError('Paiement introuvable.');
  }

  const montant = escapeHtml(Number(checkout.amount).toLocaleString('fr-FR'));
  const code = escapeHtml(checkout.codePaiement);
  const base = `/api/payment-gateway/simulator/${encodeURIComponent(checkout.codePaiement)}`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Simulateur PaySecureHub</title>
<style>
  body { font-family: sans-serif; max-width: 480px; margin: 48px auto; padding: 0 16px; }
  button { display: block; width: 100%; margin-block-end: 12px; padding: 12px; font-size: 1rem; cursor: pointer; }
  .amount { font-size: 1.4rem; font-weight: bold; }
</style>
</head>
<body>
  <h1>Simulateur PaySecureHub</h1>
  <p>Mode démonstration — aucun paiement réel.</p>
  <p class="amount">${montant} FCFA</p>
  <p>Référence : ${code}</p>
  <form method="POST" action="${base}/success"><button type="submit">Payer</button></form>
  <form method="POST" action="${base}/failed"><button type="submit">Solde insuffisant</button></form>
  <form method="POST" action="${base}/canceled"><button type="submit">Annuler</button></form>
</body>
</html>`;

  res.type('html').send(html);
});

export const simulatorActionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { codePaiement, outcome } = req.params;
  const mapped = OUTCOME_LABELS[outcome];
  if (!mapped) {
    throw new BadRequestError('Issue de simulation inconnue.');
  }

  const checkout = await prisma.onlinePaymentCheckout.findFirst({
    where: { codePaiement, mode: 'SIMULATOR' }
  });
  if (!checkout) {
    throw new NotFoundError('Paiement introuvable.');
  }

  await prisma.onlinePaymentCheckout.update({
    where: { id: checkout.id },
    data: { simulatedOutcome: mapped }
  });

  try {
    await reconcileCheckoutPublic(codePaiement);
  } catch (error) {
    logger.warn('Simulateur PaySecureHub : rapprochement en échec', { error: (error as Error)?.message });
  }

  const retour = `${env.FRONTEND_URL.replace(/\/$/, '')}/tenant/payments?paiement=${encodeURIComponent(codePaiement)}`;
  res.redirect(303, retour);
});
