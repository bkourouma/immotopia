import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import {
  WHATSAPP_NOTIFICATION_KEYS,
  WHATSAPP_NOTIFICATION_META,
  type WhatsappNotificationKey
} from '../constants/whatsapp-notification-keys';
import { WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES } from '../constants/whatsapp-notification-default-templates';

export interface WhatsappNotificationConfigItem {
  key: WhatsappNotificationKey;
  label: string;
  description: string;
  recipientLabel: string;
  enabled: boolean;
  bodyOverride: string | null;
  contentSid: string | null;
  contentVariablesJson: string | null;
  configId: string | null;
  tenantId: string | null;
  defaultBody: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface WhatsappNotificationConfigForSend {
  enabled: boolean;
  bodyOverride: string | null;
  contentSid: string | null;
  contentVariablesJson: string | null;
}

/**
 * List all WhatsApp notification types with current config for a tenant.
 */
export async function listWhatsappNotificationConfigs(tenantId: string): Promise<WhatsappNotificationConfigItem[]> {
  const configs = await prisma.whatsappNotificationConfig.findMany({
    where: { tenant_id: tenantId },
    select: {
      id: true,
      tenant_id: true,
      notification_key: true,
      enabled: true,
      body_override: true,
      content_sid: true,
      content_variables_json: true,
      created_at: true,
      updated_at: true
    }
  });

  const byKey = new Map(
    configs.map(c => [
      c.notification_key as WhatsappNotificationKey,
      {
        configId: c.id,
        tenantId: c.tenant_id,
        enabled: c.enabled,
        bodyOverride: c.body_override,
        contentSid: c.content_sid,
        contentVariablesJson: c.content_variables_json,
        createdAt: c.created_at.toISOString(),
        updatedAt: c.updated_at.toISOString()
      }
    ])
  );

  const defaults = WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES;
  return WHATSAPP_NOTIFICATION_KEYS.map(key => {
    const meta = WHATSAPP_NOTIFICATION_META[key];
    const row = byKey.get(key);
    const tpl = defaults[key];
    return {
      key,
      label: meta?.label ?? key,
      description: meta?.description ?? '',
      recipientLabel: meta?.recipientLabel ?? '',
      enabled: row?.enabled ?? true,
      bodyOverride: row?.bodyOverride ?? null,
      contentSid: row?.contentSid ?? null,
      contentVariablesJson: row?.contentVariablesJson ?? null,
      configId: row?.configId ?? null,
      tenantId: row?.tenantId ?? null,
      defaultBody: tpl ?? '',
      createdAt: row?.createdAt ?? null,
      updatedAt: row?.updatedAt ?? null
    };
  });
}

/**
 * Get config for a single notification key (for use when sending WhatsApp).
 */
export async function getWhatsappNotificationConfig(
  tenantId: string,
  notificationKey: WhatsappNotificationKey
): Promise<WhatsappNotificationConfigForSend> {
  const config = await prisma.whatsappNotificationConfig.findUnique({
    where: {
      tenant_id_notification_key: { tenant_id: tenantId, notification_key: notificationKey }
    },
    select: {
      enabled: true,
      body_override: true,
      content_sid: true,
      content_variables_json: true
    }
  });

  if (!config) {
    return { enabled: true, bodyOverride: null, contentSid: null, contentVariablesJson: null };
  }

  return {
    enabled: config.enabled,
    bodyOverride: config.body_override,
    contentSid: config.content_sid,
    contentVariablesJson: config.content_variables_json
  };
}

/**
 * Update config for one notification key (upsert).
 */
export async function updateWhatsappNotificationConfig(
  tenantId: string,
  notificationKey: WhatsappNotificationKey,
  data: {
    enabled?: boolean;
    bodyOverride?: string | null;
    contentSid?: string | null;
    contentVariablesJson?: string | null;
  }
): Promise<WhatsappNotificationConfigItem> {
  if (!WHATSAPP_NOTIFICATION_KEYS.includes(notificationKey)) {
    throw new Error(`Invalid notification key: ${notificationKey}`);
  }

  const updated = await prisma.whatsappNotificationConfig.upsert({
    where: {
      tenant_id_notification_key: { tenant_id: tenantId, notification_key: notificationKey }
    },
    create: {
      tenant_id: tenantId,
      notification_key: notificationKey,
      enabled: data.enabled ?? true,
      body_override: data.bodyOverride ?? null,
      content_sid: data.contentSid ?? null,
      content_variables_json: data.contentVariablesJson ?? null
    },
    update: {
      ...(data.enabled !== undefined && { enabled: data.enabled }),
      ...(data.bodyOverride !== undefined && { body_override: data.bodyOverride }),
      ...(data.contentSid !== undefined && { content_sid: data.contentSid }),
      ...(data.contentVariablesJson !== undefined && { content_variables_json: data.contentVariablesJson })
    },
    select: {
      id: true,
      tenant_id: true,
      notification_key: true,
      enabled: true,
      body_override: true,
      content_sid: true,
      content_variables_json: true,
      created_at: true,
      updated_at: true
    }
  });

  const meta = WHATSAPP_NOTIFICATION_META[notificationKey];
  const tpl = WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES[notificationKey];
  logger.info('WhatsApp notification config updated', {
    tenantId,
    notificationKey,
    enabled: updated.enabled
  });

  return {
    key: updated.notification_key as WhatsappNotificationKey,
    label: meta.label,
    description: meta.description,
    recipientLabel: meta.recipientLabel,
    enabled: updated.enabled,
    bodyOverride: updated.body_override,
    contentSid: updated.content_sid,
    contentVariablesJson: updated.content_variables_json,
    configId: updated.id,
    tenantId: updated.tenant_id,
    defaultBody: tpl ?? '',
    createdAt: updated.created_at.toISOString(),
    updatedAt: updated.updated_at.toISOString()
  };
}

/**
 * Reset one notification to default (delete overrides, set enabled=true).
 */
export async function resetWhatsappNotificationConfig(
  tenantId: string,
  notificationKey: WhatsappNotificationKey
): Promise<void> {
  await prisma.whatsappNotificationConfig.deleteMany({
    where: {
      tenant_id: tenantId,
      notification_key: notificationKey
    }
  });
  logger.info('WhatsApp notification config reset to default', { tenantId, notificationKey });
}
