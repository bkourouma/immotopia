import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { conflict } from '../errors';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../constants/email-notification-default-templates';
import { getEmailNotificationConfig } from '../../services/email-notification-config-service';
import { emailService } from '../../services/email-service';
import { sendWhatsappNotification } from '../../services/whatsapp-notification-send-service';

/**
 * Meme utilitaire que `services/email-service.ts` (non exporte de la, donc
 * duplique ici plutot qu'importe) : les valeurs injectees dans un template
 * HTML d'e-mail (nom du proprietaire, intitule d'une depense, reference d'un
 * bien...) viennent de saisies utilisateur et doivent etre echappees avant
 * d'atterrir dans le corps HTML -- jamais dans le sujet, texte brut.
 */
function escapeHtml(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

function normalizeOwnerStatementTemplateText(template: string): string {
  return template
    .replace(/Votre releve de gerance/g, 'Votre relevé de gérance')
    .replace(/Releve de gerance/g, 'Relevé de gérance')
    .replace(/Votre releve pour la periode/g, 'Votre relevé pour la période')
    .replace(/Total revenus/g, 'Total des revenus')
    .replace(/Total charges/g, 'Total des charges')
    .replace(/Proprietaire/g, 'Propriétaire')
    .replace(/relevÃ©/g, 'relevé')
    .replace(/gÃ©rance/g, 'gérance')
    .replace(/pÃ©riode/g, 'période')
    .replace(/PropriÃ©taire/g, 'Propriétaire');
}

export async function alertExpiringDocuments(tenantId: string, daysAhead = 30) {
  const now = new Date();
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + daysAhead);

  const docs = await prisma.patrimonyDocument.findMany({
    where: {
      tenantId,
      expiresAt: {
        gte: now,
        lte: maxDate
      }
    },
    include: {
      owner: true,
      property: true
    }
  });

  let sentCount = 0;
  for (const doc of docs) {
    if (!doc.owner?.email || doc.owner.consentEmail !== true) {
      continue;
    }

    const eventKey = 'DOCUMENT_EXPIRY_ALERT' as const;
    const config = await getEmailNotificationConfig(tenantId, eventKey);
    if (!config.enabled) continue;

    const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[eventKey];
    const ownerName = [doc.owner.firstName, doc.owner.lastName].filter(Boolean).join(' ') || 'Propriétaire';
    const subjectVariables = {
      ownerName,
      documentTitle: doc.title,
      documentType: doc.type,
      propertyReference: doc.property?.internalReference || '',
      expiresAt: doc.expiresAt ? new Date(doc.expiresAt).toLocaleDateString('fr-FR') : ''
    };
    // Le sujet part en texte brut (pas de HTML a echapper) ; le corps HTML
    // reprend les memes valeurs, echappees.
    const bodyVariables = Object.fromEntries(
      Object.entries(subjectVariables).map(([key, value]) => [key, escapeHtml(value)])
    );

    await emailService.sendEmail({
      to: doc.owner.email,
      subject: applyTemplate(config.subjectOverride || defaults.subject, subjectVariables),
      html: applyTemplate(config.bodyHtmlOverride || defaults.bodyHtml, bodyVariables)
    });
    sentCount += 1;
  }

  logger.info('alertExpiringDocuments completed', { tenantId, daysAhead, matched: docs.length, sentCount });
  return { matched: docs.length, sentCount };
}

export async function sendOwnerStatement(statementId: string) {
  const statement = await prisma.ownerStatement.findUnique({
    where: { id: statementId },
    include: {
      owner: true,
      items: {
        include: {
          property: true
        }
      }
    }
  });

  if (!statement) {
    logger.warn('sendOwnerStatement: statement not found', { statementId });
    return { sent: false, reason: 'STATEMENT_NOT_FOUND' as const };
  }

  const owner = statement.owner;
  if (!owner.email || !owner.email.trim()) {
    return { sent: false, reason: 'NO_EMAIL' as const };
  }

  // Le proprietaire peut avoir une adresse renseignee sans avoir consenti a
  // recevoir des communications par e-mail (`CrmContact.consentEmail`,
  // meme garde que `alertExpiringDocuments` ci-dessus) : envoyer quand meme
  // serait une violation du consentement, pas un simple e-mail manquant --
  // une erreur typee explicite plutot qu'un `{ sent: false }` silencieux que
  // l'appelant pourrait confondre avec NO_EMAIL.
  if (owner.consentEmail !== true) {
    throw conflict(
      "Le propriétaire n'a pas consenti à recevoir des communications par e-mail : le relevé ne peut pas lui être envoyé."
    );
  }

  const eventKey = 'OWNER_STATEMENT_SENT' as const;
  const config = await getEmailNotificationConfig(statement.tenantId, eventKey);
  if (!config.enabled) {
    return { sent: false, reason: 'EVENT_DISABLED' as const };
  }

  const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[eventKey];
  const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'Propriétaire';
  // `label` (saisi en depense/loyer) et `internalReference` (saisie du bien)
  // sont du texte utilisateur : echappes avant de rejoindre le corps HTML,
  // jamais dans les variantes texte brut (WhatsApp, sujet de l'e-mail).
  const statementLineItemsHtml = statement.items.map(
    item =>
      `- ${escapeHtml(item.label)} (${escapeHtml(item.property.internalReference)}): ${Number(item.amount).toLocaleString('fr-FR')} ${escapeHtml(statement.currency)}`
  );
  const statementLineItemsText = statement.items.map(
    item =>
      `- ${item.label} (${item.property.internalReference}): ${Number(item.amount).toLocaleString('fr-FR')} ${statement.currency}`
  );
  const linesHtml = statementLineItemsHtml.join('<br/>');
  const linesText = statementLineItemsText.join(' | ');

  // Variables texte brut : sujet de l'e-mail et WhatsApp -- jamais echappees.
  const plainVariables = {
    ownerName,
    period: statement.period,
    totalRentDue: Number(statement.totalRentDue).toLocaleString('fr-FR'),
    totalRevenue: Number(statement.totalRevenue).toLocaleString('fr-FR'),
    totalArrears: Number(statement.totalArrears).toLocaleString('fr-FR'),
    managementFees: Number(statement.totalManagementFees).toLocaleString('fr-FR'),
    managementFeesVat: Number(statement.totalManagementFeesVat).toLocaleString('fr-FR'),
    totalExpenses: Number(statement.totalExpenses).toLocaleString('fr-FR'),
    netAmount: Number(statement.netAmount).toLocaleString('fr-FR'),
    currency: statement.currency
  };
  // Variables du corps HTML : les memes, echappees, plus les lignes deja
  // construites en HTML.
  const htmlVariables = {
    ...Object.fromEntries(Object.entries(plainVariables).map(([key, value]) => [key, escapeHtml(value)])),
    statementLines: linesHtml
  };

  const subjectTemplate = normalizeOwnerStatementTemplateText(config.subjectOverride || defaults.subject);
  const bodyTemplate = normalizeOwnerStatementTemplateText(config.bodyHtmlOverride || defaults.bodyHtml);

  await emailService.sendEmail({
    to: owner.email,
    subject: applyTemplate(subjectTemplate, plainVariables),
    html: applyTemplate(bodyTemplate, htmlVariables)
  });

  const whatsappSent = await sendWhatsappNotification({
    tenantId: statement.tenantId,
    notificationKey: 'OWNER_STATEMENT_SENT',
    to: owner.whatsappNumber || owner.phonePrimary || undefined,
    variables: {
      ...plainVariables,
      statementLines: linesText
    }
  });

  await prisma.ownerStatement.update({
    where: { id: statement.id },
    data: {
      status: 'SENT',
      sentAt: new Date()
    }
  });

  logger.info('sendOwnerStatement completed', {
    statementId,
    tenantId: statement.tenantId,
    ownerId: owner.id,
    whatsappSent
  });
  return { sent: true as const, whatsappSent };
}
