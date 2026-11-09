/**
 * Notifications gestionnaires du paiement de loyer déclaré (contrat §1.7) :
 * récapitulatif horaire, alerte quotidienne de retard, changement d'un numéro
 * de réception. E-mail interne, dans la langue de chaque destinataire.
 *
 * Destinataires : membres ACTIFS de l'agence, comptes actifs, qui détiennent
 * `RENTAL_PAYMENTS_ALLOCATE` DANS CETTE AGENCE (le droit qui permet de valider).
 * Le journal ne porte que des identifiants ; seuls des numéros MASQUÉS circulent.
 * Les fonctions `send…` ne lèvent jamais ; `notifyReceivingNumberChanged` part en
 * tâche de fond et est désactivée sous Jest.
 */
import { env, isTest } from '../../../config/env';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { runWithTenantContext } from '../../../utils/tenant-context';
import { runWithLanguage, isLanguage, DEFAULT_LANGUAGE, t } from '../../../i18n';
import type { Language } from '../../../i18n';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../../constants/email-notification-default-templates';
import type { EmailNotificationKey } from '../../../constants/email-notification-keys';
import { getEmailNotificationConfig } from '../../../services/email-notification-config-service';
import { emailService } from '../../../services/email-service';
import { hasPermission } from '../../../services/permission-service';
import { applyTemplate, escapeHtml } from '../../patrimoine/notification-channels';

export const RENTAL_REVIEW_KEY: EmailNotificationKey = 'RENTAL_PAYMENT_DECLARATION_TO_REVIEW';
export const RENTAL_OVERDUE_KEY: EmailNotificationKey = 'RENTAL_PAYMENT_DECLARATION_OVERDUE_ALERT';
export const RENTAL_NUMBER_CHANGED_KEY: EmailNotificationKey = 'RENTAL_RECEIVING_NUMBER_CHANGED';

export interface RentalDeclarationReviewer {
  userId: string;
  email: string;
  language: Language;
}

/** Ligne d'un récapitulatif : montant et date seulement, jamais de nom ni de référence. */
export interface RentalDeclarationDigestLine {
  amount: number;
  createdAt: Date;
}

const LOCALES: Record<Language, string> = { fr: 'fr-FR', en: 'en-GB', ar: 'ar' };

function languageOf(value: string | null | undefined): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

function digestLines(lines: RentalDeclarationDigestLine[], language: Language): string {
  const shown = lines.slice(0, 10).map(line => {
    const amount = `${Math.round(line.amount).toLocaleString(LOCALES[language])} FCFA`;
    const date = line.createdAt.toLocaleDateString(LOCALES[language], { timeZone: 'Africa/Abidjan' });
    return escapeHtml(`${amount} — ${date}`);
  });
  if (lines.length > shown.length) {
    shown.push(escapeHtml(t('et {{n}} autre(s)').replace('{{n}}', String(lines.length - shown.length))));
  }
  return shown.join('<br>');
}

function reviewUrl(tenantId: string): string {
  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  return `${base}/tenant/${encodeURIComponent(tenantId)}/rental/payments`;
}

export async function resolveRentalDeclarationReviewers(tenantId: string): Promise<RentalDeclarationReviewer[]> {
  const memberships = await prisma.membership.findMany({
    where: { tenantId, status: 'ACTIVE', user: { isActive: true } },
    select: { userId: true, user: { select: { email: true, preferredLanguage: true } } }
  });
  const reviewers: RentalDeclarationReviewer[] = [];
  for (const membership of memberships) {
    const email = membership.user?.email?.trim();
    if (!email) continue;
    if (!(await hasPermission(membership.userId, 'RENTAL_PAYMENTS_ALLOCATE', tenantId))) continue;
    reviewers.push({ userId: membership.userId, email, language: languageOf(membership.user?.preferredLanguage) });
  }
  return reviewers;
}

async function agencyNameOf(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { name: true } });
  return tenant?.name ?? '';
}

async function sendToReviewers(params: {
  tenantId: string;
  key: EmailNotificationKey;
  reviewers: RentalDeclarationReviewer[];
  variablesFor: (reviewer: RentalDeclarationReviewer) => Record<string, string>;
  htmlSafe: string[];
  logLabel: string;
}): Promise<number> {
  const { tenantId, key, reviewers, variablesFor, htmlSafe, logLabel } = params;
  const config = await getEmailNotificationConfig(tenantId, key);
  const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[key];
  let delivered = 0;
  for (const reviewer of reviewers) {
    try {
      await runWithLanguage(reviewer.language, () => {
        const variables = variablesFor(reviewer);
        // Sujet : texte brut ; corps : chaque variable échappée, sauf celles déjà sûres (liens, <br>).
        const bodyVariables: Record<string, string> = {};
        for (const [name, value] of Object.entries(variables)) {
          bodyVariables[name] = htmlSafe.includes(name) ? value : escapeHtml(value);
        }
        return emailService.sendEmail({
          to: reviewer.email,
          tenantId,
          subject: applyTemplate(config.subjectOverride || defaults.subject, { ...variables, lines: '' }),
          html: applyTemplate(config.bodyHtmlOverride || defaults.bodyHtml, bodyVariables),
          journal: {
            key,
            recipient: { userId: reviewer.userId, email: reviewer.email },
            relatedEntity: { type: 'Tenant', id: tenantId }
          }
        });
      });
      delivered += 1;
    } catch (error) {
      logger.warn(`[rental-declared-payment] ${logLabel} non envoyé à un gestionnaire`, {
        tenantId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return delivered;
}

/**
 * Récapitulatif horaire des déclarations à vérifier, groupé par agence. Renvoie
 * le nombre d'envois réussis (0 si l'événement est désactivé ou sans destinataire).
 */
export async function sendReviewSummary(params: {
  tenantId: string;
  count: number;
  lines: RentalDeclarationDigestLine[];
}): Promise<number> {
  const { tenantId, count, lines } = params;
  try {
    const config = await getEmailNotificationConfig(tenantId, RENTAL_REVIEW_KEY);
    if (!config.enabled) return 0;
    const reviewers = await resolveRentalDeclarationReviewers(tenantId);
    if (reviewers.length === 0) return 0;
    const agencyName = await agencyNameOf(tenantId);
    return await sendToReviewers({
      tenantId,
      key: RENTAL_REVIEW_KEY,
      reviewers,
      htmlSafe: ['lines', 'reviewUrl'],
      logLabel: 'récapitulatif',
      variablesFor: reviewer => ({
        agencyName,
        count: String(count),
        lines: digestLines(lines, reviewer.language),
        reviewUrl: reviewUrl(tenantId)
      })
    });
  } catch (error) {
    logger.error('[rental-declared-payment] récapitulatif en échec', {
      tenantId,
      error: error instanceof Error ? error.message : String(error)
    });
    return 0;
  }
}

/** Alerte quotidienne des déclarations PENDING en retard de vérification. */
export async function sendOverdueAlert(params: {
  tenantId: string;
  count: number;
  days: number;
  lines: RentalDeclarationDigestLine[];
}): Promise<number> {
  const { tenantId, count, days, lines } = params;
  try {
    const config = await getEmailNotificationConfig(tenantId, RENTAL_OVERDUE_KEY);
    if (!config.enabled) return 0;
    const reviewers = await resolveRentalDeclarationReviewers(tenantId);
    if (reviewers.length === 0) return 0;
    const agencyName = await agencyNameOf(tenantId);
    return await sendToReviewers({
      tenantId,
      key: RENTAL_OVERDUE_KEY,
      reviewers,
      htmlSafe: ['lines', 'reviewUrl'],
      logLabel: 'alerte de retard',
      variablesFor: reviewer => ({
        agencyName,
        count: String(count),
        days: String(days),
        lines: digestLines(lines, reviewer.language),
        reviewUrl: reviewUrl(tenantId)
      })
    });
  } catch (error) {
    logger.error('[rental-declared-payment] alerte de retard en échec', {
      tenantId,
      error: error instanceof Error ? error.message : String(error)
    });
    return 0;
  }
}

export type ReceivingNumberChangeAction = 'created' | 'updated' | 'deactivated' | 'deleted';

function actionLabel(action: ReceivingNumberChangeAction): string {
  switch (action) {
    case 'created':
      return t('ajouté');
    case 'deactivated':
      return t('désactivé');
    case 'deleted':
      return t('supprimé');
    default:
      return t('modifié');
  }
}

/**
 * Prévient les AUTRES gestionnaires qu'un numéro qui reçoit les loyers a été
 * créé, modifié, désactivé ou supprimé. Seul le numéro MASQUÉ circule.
 */
export async function sendReceivingNumberChangedAlert(params: {
  tenantId: string;
  actorUserId: string;
  action: ReceivingNumberChangeAction;
  operator: string;
  phoneMasked: string;
}): Promise<number> {
  const { tenantId, actorUserId } = params;
  try {
    const config = await getEmailNotificationConfig(tenantId, RENTAL_NUMBER_CHANGED_KEY);
    if (!config.enabled) return 0;
    const reviewers = (await resolveRentalDeclarationReviewers(tenantId)).filter(r => r.userId !== actorUserId);
    if (reviewers.length === 0) return 0;
    const [agencyName, actor] = await Promise.all([
      agencyNameOf(tenantId),
      prisma.user.findFirst({ where: { id: actorUserId }, select: { fullName: true } })
    ]);
    const changedBy = actor?.fullName?.trim() || t('Un gestionnaire');
    return await sendToReviewers({
      tenantId,
      key: RENTAL_NUMBER_CHANGED_KEY,
      reviewers,
      htmlSafe: [],
      logLabel: 'alerte de changement de numéro',
      variablesFor: () => ({
        agencyName,
        changedBy,
        action: actionLabel(params.action),
        operator: params.operator,
        phone: params.phoneMasked
      })
    });
  } catch (error) {
    logger.error('[rental-declared-payment] alerte de changement de numéro en échec', {
      tenantId,
      error: error instanceof Error ? error.message : String(error)
    });
    return 0;
  }
}

/** Lance l'alerte sans attendre, sans jamais lever (désactivée sous Jest). */
export function notifyReceivingNumberChanged(params: Parameters<typeof sendReceivingNumberChangedAlert>[0]): void {
  if (isTest) return;
  try {
    void runWithTenantContext({ tenantId: params.tenantId }, () => sendReceivingNumberChangedAlert(params)).catch(
      error =>
        logger.error('[rental-declared-payment] alerte de changement de numéro non lancée', {
          tenantId: params.tenantId,
          error: error instanceof Error ? error.message : String(error)
        })
    );
  } catch {
    // Le journal ne doit jamais faire échouer l'appelant.
  }
}
