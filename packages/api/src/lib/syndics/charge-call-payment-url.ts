/**
 * Lien de paiement en ligne joint aux messages d'appel de charges (avis et
 * relances) — lot M6 du paiement mobile des copropriétaires.
 *
 * `resolveChargeCallPaymentUrl` est le point d'extension : pour l'instant il
 * ne produit aucun lien (`null`) et les messages partent sans bloc « Payer en
 * ligne ». Un lot ultérieur branchera le lien sécurisé (jeton à usage limité)
 * en passant son propre résolveur via `options.resolvePaymentUrl`, ou en
 * remplaçant le corps de cette fonction.
 */
import { logger } from '../../utils/logger';
import { t } from '../../i18n';

/** Appels de charges visés par le lien (un avis = un appel ; une relance = l'appel relancé). */
export interface ChargeCallPaymentUrlInput {
  tenantId: string;
  syndicateId: string;
  lotId: string;
  chargeCallIds: string[];
}

/**
 * Contrat d'un résolveur de lien de paiement :
 * - entrée : `{ tenantId, syndicateId, lotId, chargeCallIds }` ;
 * - sortie : une URL absolue `http(s)` à communiquer au copropriétaire, ou
 *   `null` quand aucun lien n'est disponible (paiement en ligne non activé,
 *   rien à payer, agence non éligible…) ;
 * - ne doit JAMAIS faire échouer l'envoi du message : une exception ou une
 *   valeur invalide est traitée comme `null` par `buildPaymentTemplateVars`.
 */
export type ChargeCallPaymentUrlResolver = (input: ChargeCallPaymentUrlInput) => Promise<string | null>;

/** Résolveur par défaut : aucun lien tant que le paiement en ligne n'est pas branché. */
export const resolveChargeCallPaymentUrl: ChargeCallPaymentUrlResolver = async () => null;

/** Variables de gabarit liées au lien de paiement ; toujours des chaînes (vides sans lien). */
export interface PaymentTemplateVars {
  paymentUrl: string;
  /** Texte complet « Payer en ligne : <url> », ou chaîne vide : le moteur de gabarits n'a pas de conditionnel. */
  paymentBlock: string;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const { protocol } = new URL(value.trim());
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Appelle le résolveur sans jamais propager d'erreur. Les gabarits ne
 * connaissent que des `{{variables}}` : `paymentBlock` porte le bloc complet
 * (vide sans lien), donc le message disparaît proprement du texte. La valeur
 * est échappée par le moteur dans l'e-mail (HTML) et laissée telle quelle dans
 * le texte WhatsApp.
 */
export async function buildPaymentTemplateVars(
  resolver: ChargeCallPaymentUrlResolver,
  input: ChargeCallPaymentUrlInput
): Promise<PaymentTemplateVars> {
  let url: string | null = null;
  try {
    const resolved = await resolver(input);
    if (isHttpUrl(resolved)) url = resolved.trim();
    else if (resolved) logger.warn('charge call payment url ignored: not an http(s) URL', { lotId: input.lotId });
  } catch (error) {
    logger.warn('charge call payment url could not be resolved', {
      lotId: input.lotId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
  if (!url) return { paymentUrl: '', paymentBlock: '' };
  return { paymentUrl: url, paymentBlock: `${t('Payer en ligne')} : ${url}` };
}

/** Texte WhatsApp : le bloc passe à la ligne après le corps du message (rien s'il est vide). */
export function whatsappPaymentVars<T extends PaymentTemplateVars>(vars: T): T {
  return vars.paymentBlock ? { ...vars, paymentBlock: `\n\n${vars.paymentBlock}` } : vars;
}

/**
 * Retire le paragraphe vide laissé par `<p>{{paymentBlock}}</p>` quand il n'y a
 * pas de lien. Sans effet si le gabarit n'emploie pas `paymentBlock` (gabarit
 * personnalisé d'une agence : ses éventuels paragraphes vides restent).
 */
export function stripEmptyPaymentParagraph(html: string, vars: PaymentTemplateVars, template: string): string {
  if (vars.paymentBlock || !template.includes('{{paymentBlock}}')) return html;
  return html.replace(/<p\b[^>]*>\s*<\/p>/g, '');
}
