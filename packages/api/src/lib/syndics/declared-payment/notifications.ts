/**
 * Notifications du paiement déclaré (spec 047, contrats §3.4).
 *
 * Copropriétaire : accusé de réception, validation, rejet — sur UN canal
 * (e-mail ou WhatsApp) choisi par `planChannels` selon le consentement, la
 * préférence du contact et l'activation de l'événement par l'agence.
 * Gestionnaires : récapitulatif des déclarations à vérifier (e-mail interne),
 * dans la langue de chaque destinataire.
 *
 * Les trois fonctions `notifyDeclaration…` gardent la forme fixée par le plan
 * (synchrones, elles ne lèvent jamais) : l'envoi part en tâche de fond, après
 * le commit de l'appelant, et un échec est journalisé sans jamais défaire une
 * validation ou un rejet. Désactivées sous Jest (`NODE_ENV=test`) comme la
 * livraison des quittances ; les tests appellent les fonctions `send…`.
 *
 * Les reçus et quittances (PDF) partent par leur propre message
 * (`scheduleChargeDocumentDelivery`, avant ce module) : le message de
 * validation les annonce sans les rejoindre, pour ne pas envoyer deux fois le
 * même PDF. Le journal ne porte que des identifiants : jamais de capture, de
 * numéro de téléphone, de référence ni de note.
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
import {
  CHANNEL_RECIPIENT_SELECT,
  applyTemplate,
  escapeHtml,
  loadChannelConfigs,
  planChannels,
  sendOnPlannedChannels,
  type ChannelDelivery,
  type ChannelRecipient,
  type ChannelTargets
} from '../../patrimoine/notification-channels';
import type { IssuedChargeDocument } from '../charge-receipts';
import type { DeclarationRejectReason } from './types';

type CoOwnerEvent = 'RECEIVED' | 'APPROVED' | 'REJECTED';

const COOWNER_TARGETS: Record<CoOwnerEvent, ChannelTargets> = {
  RECEIVED: {
    email: 'SYNDIC_PAYMENT_DECLARATION_RECEIVED',
    whatsapp: 'SYNDIC_PAYMENT_DECLARATION_RECEIVED'
  },
  APPROVED: {
    email: 'SYNDIC_PAYMENT_DECLARATION_APPROVED',
    whatsapp: 'SYNDIC_PAYMENT_DECLARATION_APPROVED'
  },
  REJECTED: {
    email: 'SYNDIC_PAYMENT_DECLARATION_REJECTED',
    whatsapp: 'SYNDIC_PAYMENT_DECLARATION_REJECTED'
  }
};

const REVIEW_KEY: EmailNotificationKey = 'SYNDIC_PAYMENT_DECLARATION_TO_REVIEW';
const NUMBER_CHANGED_KEY: EmailNotificationKey = 'SYNDIC_RECEIVING_NUMBER_CHANGED';

// ---------------------------------------------------------------------------
// Mise en forme
// ---------------------------------------------------------------------------

/** Format de nombres et de dates de la langue du destinataire (français par défaut). */
const LOCALES: Record<Language, string> = { fr: 'fr-FR', en: 'en-GB', ar: 'ar' };

const money = (value: number, language: Language): string =>
  `${Math.round(value).toLocaleString(LOCALES[language])} FCFA`;

const moment = (date: Date, language: Language): string =>
  date.toLocaleString(LOCALES[language], {
    timeZone: 'Africa/Abidjan',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

/** Motifs du contrat §0.1 (libellés repris des écrans). */
function rejectReasonLabel(reason: DeclarationRejectReason | null): string {
  switch (reason) {
    case 'NOT_FOUND':
      return t('Paiement introuvable');
    case 'AMOUNT_MISMATCH':
      return t('Montant ne correspondant pas');
    case 'REFERENCE_USED':
      return t('Référence déjà utilisée');
    case 'WRONG_NUMBER':
      return t('Numéro de réception erroné');
    default:
      return t('Autre');
  }
}

function ownerNameOf(contact: { firstName: string | null; lastName: string | null; legalName: string | null }): string {
  return (
    [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || contact.legalName || t('Copropriétaire')
  );
}

// ---------------------------------------------------------------------------
// Copropriétaire
// ---------------------------------------------------------------------------

/**
 * Envoie le message de `event` au copropriétaire qui a déclaré. Renvoie le
 * résultat du canal ; ne lève jamais (échec journalisé, `SEND_FAILED`).
 * Une déclaration saisie par un gestionnaire sans copropriétaire désigné n'a
 * personne à prévenir : `NO_ELIGIBLE_CHANNEL`.
 */
export async function sendCoOwnerDeclarationMessage(
  tenantId: string,
  declarationId: string,
  event: CoOwnerEvent
): Promise<ChannelDelivery> {
  try {
    const declaration = await prisma.syndicPaymentDeclaration.findFirst({
      where: { id: declarationId, tenantId },
      select: {
        amount: true,
        acceptedAmount: true,
        acceptedPaidAt: true,
        paidAt: true,
        transactionReference: true,
        rejectReason: true,
        reviewNote: true,
        declaredByContactId: true,
        syndicate: { select: { name: true } }
      }
    });
    if (!declaration?.declaredByContactId) return { sent: false, channel: null, reason: 'NO_ELIGIBLE_CHANNEL' };

    const contact = await prisma.crmContact.findFirst({
      where: { id: declaration.declaredByContactId, tenantId },
      select: {
        ...CHANNEL_RECIPIENT_SELECT,
        firstName: true,
        lastName: true,
        legalName: true,
        preferredLanguage: true
      }
    });
    if (!contact) return { sent: false, channel: null, reason: 'NO_ELIGIBLE_CHANNEL' };
    // Variables dites dans la langue du copropriétaire (libellés, oui/non, dates, nombres).
    const language = languageOf(contact.preferredLanguage);

    const recipient: ChannelRecipient = {
      contactId: contact.id,
      email: contact.email?.trim() || null,
      consentEmail: contact.consentEmail ?? null,
      whatsappNumber: contact.whatsappNumber ?? null,
      phonePrimary: contact.phonePrimary ?? null,
      consentWhatsapp: contact.consentWhatsapp ?? null,
      preferredContactChannel: contact.preferredContactChannel ?? null
    };
    const targets = COOWNER_TARGETS[event];
    const configs = await loadChannelConfigs(tenantId, targets);
    const plan = planChannels(recipient, configs, targets);
    if (plan.channels.length === 0) return { sent: false, channel: null, reason: plan.reason };

    const declared = Number(declaration.amount);
    const accepted = declaration.acceptedAmount === null ? declared : Number(declaration.acceptedAmount);
    const corrected =
      accepted !== declared ||
      (declaration.acceptedPaidAt !== null && declaration.acceptedPaidAt.getTime() !== declaration.paidAt.getTime());
    const delivery = await sendOnPlannedChannels(plan, {
      tenantId,
      recipient,
      configs,
      targets,
      variables: runWithLanguage(language, () => ({
        ownerName: ownerNameOf(contact),
        syndicName: declaration.syndicate?.name ?? '',
        amount: money(declared, language),
        acceptedAmount: money(accepted, language),
        transactionReference: declaration.transactionReference,
        paidAt: moment(declaration.paidAt, language),
        corrected: corrected ? t('oui') : t('non'),
        reviewNote: declaration.reviewNote ?? '',
        rejectReasonLabel: rejectReasonLabel(declaration.rejectReason)
      }))
    });
    if (!delivery.sent) {
      logger.warn('[declared-payment] message au copropriétaire non envoyé', {
        tenantId,
        declarationId,
        event,
        reason: delivery.reason
      });
    }
    return delivery;
  } catch (error) {
    logger.error('[declared-payment] message au copropriétaire en échec', {
      tenantId,
      declarationId,
      event,
      error: error instanceof Error ? error.message : String(error)
    });
    return { sent: false, channel: null, reason: 'SEND_FAILED' };
  }
}

/** Lance l'envoi sans attendre, sans jamais lever. */
function fireAndForget(tenantId: string, declarationId: string, event: CoOwnerEvent): void {
  if (isTest) return;
  try {
    void runWithTenantContext({ tenantId }, () => sendCoOwnerDeclarationMessage(tenantId, declarationId, event)).catch(
      error =>
        logger.error('[declared-payment] notification en échec', {
          tenantId,
          declarationId,
          event,
          error: error instanceof Error ? error.message : String(error)
        })
    );
  } catch (error) {
    logger.error('[declared-payment] notification non lancée', {
      tenantId,
      declarationId,
      event,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/** Déclaration reçue : accusé au copropriétaire (l'alerte aux gestionnaires est regroupée par le job horaire). */
export function notifyDeclarationReceived(tenantId: string, declarationId: string): void {
  fireAndForget(tenantId, declarationId, 'RECEIVED');
}

/**
 * Déclaration validée : message au copropriétaire. Les `documents` émis partent
 * par leur propre message (PDF joint) ; ils ne sont pas rejoints ici.
 */
export function notifyDeclarationApproved(
  tenantId: string,
  declarationId: string,
  documents: IssuedChargeDocument[]
): void {
  if (!isTest) {
    logger.info('[declared-payment] validation notifiée', {
      tenantId,
      declarationId,
      documentIds: Array.isArray(documents) ? documents.map(document => document?.id) : []
    });
  }
  fireAndForget(tenantId, declarationId, 'APPROVED');
}

/** Déclaration rejetée : motif et note au copropriétaire. */
export function notifyDeclarationRejected(tenantId: string, declarationId: string): void {
  fireAndForget(tenantId, declarationId, 'REJECTED');
}

// ---------------------------------------------------------------------------
// Gestionnaires
// ---------------------------------------------------------------------------

export interface DeclarationReviewer {
  userId: string;
  email: string;
  language: Language;
}

function languageOf(value: string | null | undefined): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

/**
 * Gestionnaires à prévenir : membres ACTIFS de l'agence, comptes actifs, qui
 * détiennent `SYNDIC_EDIT` DANS CETTE AGENCE (le droit qui permet de valider).
 */
export async function resolveDeclarationReviewers(tenantId: string): Promise<DeclarationReviewer[]> {
  const memberships = await prisma.membership.findMany({
    where: { tenantId, status: 'ACTIVE', user: { isActive: true } },
    select: { userId: true, user: { select: { email: true, preferredLanguage: true } } }
  });
  const reviewers: DeclarationReviewer[] = [];
  for (const membership of memberships) {
    const email = membership.user?.email?.trim();
    if (!email) continue;
    if (!(await hasPermission(membership.userId, 'SYNDIC_EDIT', tenantId))) continue;
    reviewers.push({ userId: membership.userId, email, language: languageOf(membership.user?.preferredLanguage) });
  }
  return reviewers;
}

function reviewLink(tenantId: string, syndicateId: string): string {
  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  return `${base}/tenant/${encodeURIComponent(tenantId)}/syndics/${encodeURIComponent(syndicateId)}/paiements-en-ligne`;
}

/**
 * Récapitulatif des déclarations à vérifier d'une copropriété, par e-mail, aux
 * gestionnaires. Renvoie le nombre d'envois réussis ; 0 si l'événement est
 * désactivé par l'agence ou sans destinataire. Ne lève jamais.
 */
export async function sendReviewSummary(params: {
  tenantId: string;
  syndicateId: string;
  syndicName: string;
  pendingCount: number;
  overdueCount: number;
}): Promise<number> {
  const { tenantId, syndicateId, syndicName, pendingCount, overdueCount } = params;
  try {
    const config = await getEmailNotificationConfig(tenantId, REVIEW_KEY);
    if (!config.enabled) return 0;
    const reviewers = await resolveDeclarationReviewers(tenantId);
    if (reviewers.length === 0) return 0;

    const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[REVIEW_KEY];
    const variables = {
      syndicName,
      pendingCount: String(pendingCount),
      overdueCount: String(overdueCount),
      link: reviewLink(tenantId, syndicateId)
    };
    let delivered = 0;
    for (const reviewer of reviewers) {
      try {
        await runWithLanguage(reviewer.language, () =>
          emailService.sendEmail({
            to: reviewer.email,
            tenantId,
            subject: applyTemplate(config.subjectOverride || defaults.subject, { ...variables, link: '' }),
            html: applyTemplate(config.bodyHtmlOverride || defaults.bodyHtml, {
              ...variables,
              syndicName: escapeHtml(syndicName),
              link: escapeHtml(variables.link)
            }),
            journal: {
              key: REVIEW_KEY,
              recipient: { userId: reviewer.userId, email: reviewer.email },
              relatedEntity: { type: 'Syndicate', id: syndicateId },
              link: variables.link
            }
          })
        );
        delivered += 1;
      } catch (error) {
        logger.warn('[declared-payment] récapitulatif non envoyé à un gestionnaire', {
          tenantId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return delivered;
  } catch (error) {
    logger.error('[declared-payment] récapitulatif en échec', {
      tenantId,
      syndicateId,
      error: error instanceof Error ? error.message : String(error)
    });
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Changement d'un numéro de réception
// ---------------------------------------------------------------------------

/**
 * Prévient les AUTRES gestionnaires (SYNDIC_EDIT, membres actifs) qu'un numéro qui reçoit les
 * paiements de la copropriété a été changé : un détournement du numéro est ainsi vu par un
 * second regard. Seuls les numéros MASQUÉS circulent. Renvoie le nombre d'envois réussis ; ne
 * lève jamais.
 */
export async function sendReceivingNumberChangedAlert(params: {
  tenantId: string;
  syndicateId: string;
  actorUserId: string;
  previousPhoneMasked: string;
  newPhoneMasked: string;
}): Promise<number> {
  const { tenantId, syndicateId, actorUserId } = params;
  try {
    const config = await getEmailNotificationConfig(tenantId, NUMBER_CHANGED_KEY);
    if (!config.enabled) return 0;
    const reviewers = (await resolveDeclarationReviewers(tenantId)).filter(reviewer => reviewer.userId !== actorUserId);
    if (reviewers.length === 0) return 0;
    const [syndicate, actor] = await Promise.all([
      prisma.syndicate.findFirst({ where: { id: syndicateId, tenantId }, select: { name: true } }),
      prisma.user.findFirst({ where: { id: actorUserId }, select: { fullName: true } })
    ]);
    const variables = {
      syndicName: syndicate?.name ?? '',
      actorName: actor?.fullName?.trim() || t('Un gestionnaire'),
      previousPhone: params.previousPhoneMasked,
      newPhone: params.newPhoneMasked
    };
    const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[NUMBER_CHANGED_KEY];
    let delivered = 0;
    for (const reviewer of reviewers) {
      try {
        await runWithLanguage(reviewer.language, () =>
          emailService.sendEmail({
            to: reviewer.email,
            tenantId,
            subject: applyTemplate(config.subjectOverride || defaults.subject, variables),
            html: applyTemplate(config.bodyHtmlOverride || defaults.bodyHtml, {
              syndicName: escapeHtml(variables.syndicName),
              actorName: escapeHtml(variables.actorName),
              previousPhone: escapeHtml(variables.previousPhone),
              newPhone: escapeHtml(variables.newPhone)
            }),
            journal: {
              key: NUMBER_CHANGED_KEY,
              recipient: { userId: reviewer.userId, email: reviewer.email },
              relatedEntity: { type: 'Syndicate', id: syndicateId }
            }
          })
        );
        delivered += 1;
      } catch (error) {
        logger.warn('[declared-payment] alerte de changement de numéro non envoyée', {
          tenantId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return delivered;
  } catch (error) {
    logger.error('[declared-payment] alerte de changement de numéro en échec', {
      tenantId,
      syndicateId,
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
        logger.error('[declared-payment] alerte de changement de numéro non lancée', {
          tenantId: params.tenantId,
          error: error instanceof Error ? error.message : String(error)
        })
    );
  } catch {
    // Le journal ne doit jamais faire échouer l'appelant.
  }
}
