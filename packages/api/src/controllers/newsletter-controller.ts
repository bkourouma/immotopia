import { Request, Response } from 'express';
import * as listService from '../services/newsletter-list.service';
import * as subscriberService from '../services/newsletter-subscriber.service';
import * as templateService from '../services/newsletter-template.service';
import * as campaignService from '../services/newsletter-campaign.service';

/**
 * These routes are all mounted behind `requireTenantAccess`, which verifies
 * `:tenantId` against the caller's membership and sets `req.tenantContext`.
 * Reading `req.params.tenantId` directly as a fallback would trust an
 * unverified URL segment if that middleware ever failed to run — a normal
 * user could then manage another agency's newsletter lists/campaigns/
 * templates by editing the tenantId in the URL. Only the verified context is
 * trusted here.
 */
const getTenantId = (req: Request): string => {
  const tenantId = req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new Error('Contexte tenant requis pour la newsletter.');
  }
  return tenantId;
};

export async function listListsHandler(req: Request, res: Response) {
  try {
    const lists = await listService.getListsWithCounts(getTenantId(req));
    res.json(lists);
  } catch (e) {
    res.status(500).json({ success: false, message: (e as Error).message });
  }
}

export async function createListHandler(req: Request, res: Response) {
  try {
    const list = await listService.createList(getTenantId(req), req.body);
    res.status(201).json(list);
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function getListHandler(req: Request, res: Response) {
  try {
    const list = await listService.getList(getTenantId(req), req.params.listId);
    if (!list) return res.status(404).json({ success: false, message: 'Liste non trouvée.' });
    res.json(list);
  } catch (e) {
    res.status(500).json({ success: false, message: (e as Error).message });
  }
}

export async function updateListHandler(req: Request, res: Response) {
  try {
    const list = await listService.updateList(getTenantId(req), req.params.listId, req.body);
    res.json(list);
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function deleteListHandler(req: Request, res: Response) {
  try {
    await listService.deleteList(getTenantId(req), req.params.listId);
    res.status(204).send();
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function listSubscribersHandler(req: Request, res: Response) {
  try {
    const result = await subscriberService.listSubscribers(getTenantId(req), req.params.listId, {
      status: req.query.status as string,
      page: Number(req.query.page),
      limit: Number(req.query.limit)
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, message: (e as Error).message });
  }
}

export async function addSubscriberHandler(req: Request, res: Response) {
  try {
    const sub = await subscriberService.addSubscriber(getTenantId(req), req.params.listId, req.body);
    res.status(201).json(sub);
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function importSubscribersHandler(req: Request, res: Response) {
  try {
    const file = (req as any).file;
    if (!file?.buffer) return res.status(400).json({ success: false, message: 'Fichier CSV requis.' });
    const result = await subscriberService.importFromCsv(getTenantId(req), req.params.listId, file.buffer);
    res.json(result);
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

/**
 * POST /tenants/:tenantId/newsletter/lists/:listId/subscribers/from-contacts
 * Body: { contactIds: string[] }
 */
export async function addSubscribersFromContactsHandler(req: Request, res: Response) {
  try {
    const contactIds = Array.isArray(req.body?.contactIds) ? req.body.contactIds : [];
    if (contactIds.length === 0) {
      return res.status(400).json({ success: false, message: 'contactIds requis (tableau non vide).' });
    }
    const result = await subscriberService.addSubscribersFromContactIds(
      getTenantId(req),
      req.params.listId,
      contactIds
    );
    res.json(result);
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function exportSubscribersHandler(req: Request, res: Response) {
  try {
    const csv = await subscriberService.exportToCsv(getTenantId(req), req.params.listId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(csv);
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function removeSubscriberHandler(req: Request, res: Response) {
  try {
    await subscriberService.removeSubscriber(getTenantId(req), req.params.subscriberId);
    res.status(204).send();
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function listCampaignsHandler(req: Request, res: Response) {
  try {
    const result = await campaignService.listCampaigns(getTenantId(req), {
      status: req.query.status as string,
      page: Number(req.query.page),
      limit: Number(req.query.limit)
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, message: (e as Error).message });
  }
}

export async function createCampaignHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    const campaign = await campaignService.createCampaign(getTenantId(req), req.body, userId);
    res.status(201).json(campaign);
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function getCampaignHandler(req: Request, res: Response) {
  try {
    const campaign = await campaignService.getCampaign(getTenantId(req), req.params.campaignId);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campagne non trouvée.' });
    res.json(campaign);
  } catch (e) {
    res.status(500).json({ success: false, message: (e as Error).message });
  }
}

export async function updateCampaignHandler(req: Request, res: Response) {
  try {
    const campaign = await campaignService.updateCampaign(getTenantId(req), req.params.campaignId, req.body);
    res.json(campaign);
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function sendCampaignHandler(req: Request, res: Response) {
  try {
    await campaignService.sendCampaign(getTenantId(req), req.params.campaignId);
    const campaign = await campaignService.getCampaign(getTenantId(req), req.params.campaignId);
    res.json(campaign);
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function scheduleCampaignHandler(req: Request, res: Response) {
  try {
    const scheduledAt = new Date((req.body as { scheduledAt: string }).scheduledAt);
    await campaignService.scheduleCampaign(getTenantId(req), req.params.campaignId, scheduledAt);
    const updated = await campaignService.getCampaign(getTenantId(req), req.params.campaignId);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function cancelCampaignHandler(req: Request, res: Response) {
  try {
    await campaignService.cancelCampaign(getTenantId(req), req.params.campaignId);
    const updated = await campaignService.getCampaign(getTenantId(req), req.params.campaignId);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function listRecipientsHandler(req: Request, res: Response) {
  try {
    const result = await campaignService.getCampaignRecipients(getTenantId(req), req.params.campaignId, {
      page: Number(req.query.page),
      limit: Number(req.query.limit)
    });
    if (!result) return res.status(404).json({ success: false, message: 'Campagne non trouvée.' });
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, message: (e as Error).message });
  }
}

export async function previewCampaignHandler(req: Request, res: Response) {
  try {
    const preview = await campaignService.getPreviewHtml(getTenantId(req), req.params.campaignId);
    res.json(preview);
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function listTemplatesHandler(req: Request, res: Response) {
  try {
    const templates = await templateService.listTemplates(getTenantId(req));
    res.json(templates);
  } catch (e) {
    res.status(500).json({ success: false, message: (e as Error).message });
  }
}

export async function createTemplateHandler(req: Request, res: Response) {
  try {
    const tpl = await templateService.createTemplate(getTenantId(req), req.body);
    res.status(201).json(tpl);
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function getTemplateHandler(req: Request, res: Response) {
  try {
    const tpl = await templateService.getTemplate(getTenantId(req), req.params.templateId);
    if (!tpl) return res.status(404).json({ success: false, message: 'Template non trouvé.' });
    res.json(tpl);
  } catch (e) {
    res.status(500).json({ success: false, message: (e as Error).message });
  }
}

export async function updateTemplateHandler(req: Request, res: Response) {
  try {
    const tpl = await templateService.updateTemplate(getTenantId(req), req.params.templateId, req.body);
    res.json(tpl);
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function deleteTemplateHandler(req: Request, res: Response) {
  try {
    await templateService.deleteTemplate(getTenantId(req), req.params.templateId);
    res.status(204).send();
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function subscribeHandler(req: Request, res: Response) {
  try {
    const { listToken, listId, email, name } = req.body as {
      listToken?: string;
      listId?: string;
      email?: string;
      name?: string;
    };
    if (!email?.trim()) return res.status(400).json({ success: false, message: 'Email requis.' });
    if (!listToken && !listId) return res.status(400).json({ success: false, message: 'listToken ou listId requis.' });
    const result = await subscriberService.subscribePublic({ listToken, listId, email, name });
    if (!result.success) return res.status(400).json(result);
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function confirmHandler(req: Request, res: Response) {
  try {
    const token = (req.query.token as string) || (req.body as { token?: string }).token;
    if (!token) return res.status(400).json({ success: false, message: 'Token requis.', code: 'MISSING_TOKEN' });
    const result = await subscriberService.confirmSubscription(token);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Lien invalide ou expiré. Vous pouvez vous réinscrire à la newsletter.',
        code: result.alreadyActive ? 'ALREADY_ACTIVE' : 'INVALID_OR_EXPIRED'
      });
    }
    res.json({
      success: true,
      message: result.alreadyActive
        ? 'Vous êtes déjà inscrit à cette newsletter.'
        : 'Votre inscription a été confirmée.'
    });
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function unsubscribeHandler(req: Request, res: Response) {
  try {
    const token = (req.query.token as string) || (req.body as { token?: string }).token;
    const unsubscribeAll = (req.body as { unsubscribeAll?: boolean })?.unsubscribeAll ?? false;
    if (!token)
      return res
        .status(400)
        .json({ success: false, message: 'Token requis. Le lien de désinscription est invalide ou expiré.' });
    const result = await subscriberService.unsubscribeByToken(token, unsubscribeAll);
    if (result.success) {
      res.json({ success: true, message: 'Vous avez été désabonné.' });
    } else {
      res.status(400).json({
        success: false,
        message:
          'Ce lien de désinscription est invalide ou a déjà été utilisé. Si vous souhaitez vous désabonner, utilisez le lien présent dans un email plus récent.'
      });
    }
  } catch (e) {
    res.status(400).json({ success: false, message: (e as Error).message });
  }
}

export async function trackOpenHandler(req: Request, res: Response) {
  try {
    const token = (req.query.token as string)?.trim();
    if (!token) {
      res.setHeader('Content-Type', 'image/gif');
      return res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
    }
    const pixel = await campaignService.trackOpen(token);
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(pixel);
  } catch {
    res.setHeader('Content-Type', 'image/gif');
    res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
  }
}
