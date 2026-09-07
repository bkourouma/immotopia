import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import {
  EMAIL_NOTIFICATION_KEYS,
  EMAIL_NOTIFICATION_META,
  type EmailNotificationKey
} from '../constants/email-notification-keys';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../constants/email-notification-default-templates';

export interface EmailNotificationConfigItem {
  key: EmailNotificationKey;
  label: string;
  description: string;
  recipientLabel: string;
  enabled: boolean;
  subjectOverride: string | null;
  bodyHtmlOverride: string | null;
  configId: string | null;
  tenantId: string | null;
  /** Template par défaut (sujet + corps) défini dans le code, pour affichage dans l'interface d'édition */
  defaultSubject: string;
  defaultBodyHtml: string;
  /** Champs de la table email_notification_configs */
  createdAt: string | null;
  updatedAt: string | null;
}

export interface EmailNotificationConfigForSend {
  enabled: boolean;
  subjectOverride: string | null;
  bodyHtmlOverride: string | null;
}

/**
 * List all email notification types with current config for a tenant.
 */
export async function listEmailNotificationConfigs(tenantId: string): Promise<EmailNotificationConfigItem[]> {
  const configs = await prisma.emailNotificationConfig.findMany({
    where: { tenant_id: tenantId },
    select: {
      id: true,
      tenant_id: true,
      notification_key: true,
      enabled: true,
      subject_override: true,
      body_html_override: true,
      created_at: true,
      updated_at: true
    }
  });

  const byKey = new Map(
    configs.map(c => [
      c.notification_key as EmailNotificationKey,
      {
        configId: c.id,
        tenantId: c.tenant_id,
        enabled: c.enabled,
        subjectOverride: c.subject_override,
        bodyHtmlOverride: c.body_html_override,
        createdAt: c.created_at.toISOString(),
        updatedAt: c.updated_at.toISOString()
      }
    ])
  );

  const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES;
  return EMAIL_NOTIFICATION_KEYS.map(key => {
    const meta = EMAIL_NOTIFICATION_META[key];
    const row = byKey.get(key);
    const tpl = defaults[key];
    return {
      key,
      label: meta?.label ?? key,
      description: meta?.description ?? '',
      recipientLabel: meta?.recipientLabel ?? '',
      enabled: row?.enabled ?? true,
      subjectOverride: row?.subjectOverride ?? null,
      bodyHtmlOverride: row?.bodyHtmlOverride ?? null,
      configId: row?.configId ?? null,
      tenantId: row?.tenantId ?? null,
      defaultSubject: tpl?.subject ?? '',
      defaultBodyHtml: tpl?.bodyHtml ?? '',
      createdAt: row?.createdAt ?? null,
      updatedAt: row?.updatedAt ?? null
    };
  });
}

/**
 * Get config for a single notification key (for use when sending email).
 * Returns enabled=true and null overrides if no row exists.
 */
export async function getEmailNotificationConfig(
  tenantId: string,
  notificationKey: EmailNotificationKey
): Promise<EmailNotificationConfigForSend> {
  const config = await prisma.emailNotificationConfig.findUnique({
    where: {
      tenant_id_notification_key: { tenant_id: tenantId, notification_key: notificationKey }
    },
    select: {
      enabled: true,
      subject_override: true,
      body_html_override: true
    }
  });

  if (!config) {
    return { enabled: true, subjectOverride: null, bodyHtmlOverride: null };
  }

  return {
    enabled: config.enabled,
    subjectOverride: config.subject_override,
    bodyHtmlOverride: config.body_html_override
  };
}

/**
 * Update config for one notification key (upsert).
 */
export async function updateEmailNotificationConfig(
  tenantId: string,
  notificationKey: EmailNotificationKey,
  data: {
    enabled?: boolean;
    subjectOverride?: string | null;
    bodyHtmlOverride?: string | null;
  }
): Promise<EmailNotificationConfigItem> {
  if (!EMAIL_NOTIFICATION_KEYS.includes(notificationKey)) {
    throw new Error(`Invalid notification key: ${notificationKey}`);
  }

  const updated = await prisma.emailNotificationConfig.upsert({
    where: {
      tenant_id_notification_key: { tenant_id: tenantId, notification_key: notificationKey }
    },
    create: {
      tenant_id: tenantId,
      notification_key: notificationKey,
      enabled: data.enabled ?? true,
      subject_override: data.subjectOverride ?? null,
      body_html_override: data.bodyHtmlOverride ?? null
    },
    update: {
      ...(data.enabled !== undefined && { enabled: data.enabled }),
      ...(data.subjectOverride !== undefined && { subject_override: data.subjectOverride }),
      ...(data.bodyHtmlOverride !== undefined && { body_html_override: data.bodyHtmlOverride })
    },
    select: {
      id: true,
      tenant_id: true,
      notification_key: true,
      enabled: true,
      subject_override: true,
      body_html_override: true,
      created_at: true,
      updated_at: true
    }
  });

  const meta = EMAIL_NOTIFICATION_META[notificationKey as EmailNotificationKey];
  const tpl = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[notificationKey as EmailNotificationKey];
  logger.info('Email notification config updated', {
    tenantId,
    notificationKey,
    enabled: updated.enabled
  });

  return {
    key: updated.notification_key as EmailNotificationKey,
    label: meta.label,
    description: meta.description,
    recipientLabel: meta.recipientLabel,
    enabled: updated.enabled,
    subjectOverride: updated.subject_override,
    bodyHtmlOverride: updated.body_html_override,
    configId: updated.id,
    tenantId: updated.tenant_id,
    defaultSubject: tpl?.subject ?? '',
    defaultBodyHtml: tpl?.bodyHtml ?? '',
    createdAt: updated.created_at.toISOString(),
    updatedAt: updated.updated_at.toISOString()
  };
}

/**
 * Reset one notification to default (delete overrides, set enabled=true).
 */
export async function resetEmailNotificationConfig(
  tenantId: string,
  notificationKey: EmailNotificationKey
): Promise<void> {
  await prisma.emailNotificationConfig.deleteMany({
    where: {
      tenant_id: tenantId,
      notification_key: notificationKey
    }
  });
  logger.info('Email notification config reset to default', { tenantId, notificationKey });
}
