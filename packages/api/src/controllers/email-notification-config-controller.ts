import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import {
  listEmailNotificationConfigs,
  updateEmailNotificationConfig,
  resetEmailNotificationConfig
} from '../services/email-notification-config-service';
import { filterNotificationItems } from '../lib/subscription/notification-feature-gate';
import { EMAIL_NOTIFICATION_KEYS, type EmailNotificationKey } from '../constants/email-notification-keys';

/**
 * GET /tenants/:tenantId/email-notifications
 * List all email notification types with current config.
 */
export async function listHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId;
    if (!tenantId) {
      res.status(400).json({ success: false, message: 'tenantId requis' });
      return;
    }
    const items = await filterNotificationItems(tenantId, await listEmailNotificationConfigs(tenantId));
    res.json({ success: true, data: items });
  } catch (error: any) {
    const message = error?.message || 'Erreur lors de la récupération des configurations';
    logger.error('List email notification configs', { error: message, stack: error?.stack });
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'development' ? message : 'Erreur lors de la récupération des configurations'
    });
  }
}

/**
 * PATCH /tenants/:tenantId/email-notifications/:key
 * Update config for one notification (enabled, subjectOverride, bodyHtmlOverride).
 */
export async function updateHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId;
    const key = req.params.key as EmailNotificationKey;
    if (!tenantId || !key) {
      res.status(400).json({ success: false, message: 'tenantId et key requis' });
      return;
    }
    if (!EMAIL_NOTIFICATION_KEYS.includes(key)) {
      res.status(400).json({ success: false, message: 'Clé de notification invalide' });
      return;
    }
    const body = req.body || {};
    const updated = await updateEmailNotificationConfig(tenantId, key, {
      enabled: body.enabled,
      subjectOverride: body.subjectOverride !== undefined ? body.subjectOverride : undefined,
      bodyHtmlOverride: body.bodyHtmlOverride !== undefined ? body.bodyHtmlOverride : undefined
    });
    res.json({ success: true, data: updated });
  } catch (error: any) {
    logger.error('Update email notification config', { error: error?.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Erreur lors de la mise à jour'
    });
  }
}

/**
 * POST /tenants/:tenantId/email-notifications/:key/reset
 * Reset one notification to default (remove overrides).
 */
export async function resetHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId;
    const key = req.params.key as EmailNotificationKey;
    if (!tenantId || !key) {
      res.status(400).json({ success: false, message: 'tenantId et key requis' });
      return;
    }
    if (!EMAIL_NOTIFICATION_KEYS.includes(key)) {
      res.status(400).json({ success: false, message: 'Clé de notification invalide' });
      return;
    }
    await resetEmailNotificationConfig(tenantId, key);
    res.json({ success: true, message: 'Configuration réinitialisée' });
  } catch (error: any) {
    logger.error('Reset email notification config', { error: error?.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Erreur lors de la réinitialisation'
    });
  }
}
