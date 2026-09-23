import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../constants/email-notification-default-templates';
import { getEmailNotificationConfig } from '../../services/email-notification-config-service';
import { emailService } from '../../services/email-service';
import { sendWhatsappNotification } from '../../services/whatsapp-notification-send-service';

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
    const variables = {
      ownerName: [doc.owner.firstName, doc.owner.lastName].filter(Boolean).join(' ') || 'Propriétaire',
      documentTitle: doc.title,
      documentType: doc.type,
      propertyReference: doc.property?.internalReference || '',
      expiresAt: doc.expiresAt ? new Date(doc.expiresAt).toLocaleDateString('fr-FR') : ''
    };

    await emailService.sendEmail({
      to: doc.owner.email,
      subject: applyTemplate(config.subjectOverride || defaults.subject, variables),
      html: applyTemplate(config.bodyHtmlOverride || defaults.bodyHtml, variables)
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

  const eventKey = 'OWNER_STATEMENT_SENT' as const;
  const config = await getEmailNotificationConfig(statement.tenantId, eventKey);
  if (!config.enabled) {
    return { sent: false, reason: 'EVENT_DISABLED' as const };
  }

  const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[eventKey];
  const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'Propriétaire';
  const statementLineItems = statement.items.map(
    item =>
      `- ${item.label} (${item.property.internalReference}): ${Number(item.amount).toLocaleString('fr-FR')} ${statement.currency}`
  );
  const linesHtml = statementLineItems.join('<br/>');
  const linesText = statementLineItems.join(' | ');

  const variables = {
    ownerName,
    period: statement.period,
    totalRentDue: Number(statement.totalRentDue).toLocaleString('fr-FR'),
    totalRevenue: Number(statement.totalRevenue).toLocaleString('fr-FR'),
    totalArrears: Number(statement.totalArrears).toLocaleString('fr-FR'),
    managementFees: Number(statement.totalManagementFees).toLocaleString('fr-FR'),
    managementFeesVat: Number(statement.totalManagementFeesVat).toLocaleString('fr-FR'),
    totalExpenses: Number(statement.totalExpenses).toLocaleString('fr-FR'),
    netAmount: Number(statement.netAmount).toLocaleString('fr-FR'),
    currency: statement.currency,
    statementLines: linesHtml
  };

  const subjectTemplate = normalizeOwnerStatementTemplateText(config.subjectOverride || defaults.subject);
  const bodyTemplate = normalizeOwnerStatementTemplateText(config.bodyHtmlOverride || defaults.bodyHtml);

  await emailService.sendEmail({
    to: owner.email,
    subject: applyTemplate(subjectTemplate, variables),
    html: applyTemplate(bodyTemplate, variables)
  });

  const whatsappSent = await sendWhatsappNotification({
    tenantId: statement.tenantId,
    notificationKey: 'OWNER_STATEMENT_SENT',
    to: owner.whatsappNumber || owner.phonePrimary || undefined,
    variables: {
      ...variables,
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
