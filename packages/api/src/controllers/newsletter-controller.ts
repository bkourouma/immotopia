import { Request, Response } from 'express';
import { z } from 'zod';
import * as listService from '../services/newsletter-list.service';
import * as subscriberService from '../services/newsletter-subscriber.service';
import * as templateService from '../services/newsletter-template.service';
import * as campaignService from '../services/newsletter-campaign.service';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { t } from '../i18n';
import { parsePagination } from '../utils/pagination-helper';

/**
 * These routes are all mounted behind `requireTenantAccess`, which verifies
 * `:tenantId` against the caller's membership and sets `req.tenantContext`.
 * Reading `req.params.tenantId` directly as a fallback would trust an
 * unverified URL segment if that middleware ever failed to run — a normal
 * user could then manage another agency's newsletter lists/campaigns/
 * templates by editing the tenantId in the URL. Only the verified context is
 * trusted here.
 *
 * Chaque corps est validé par zod avant d'atteindre un service : une entrée
 * invalide part en 400 `VALIDATION_ERROR` (`errors[]`), jamais en erreur Prisma
 * brute. Les erreurs des services sont typées (`middleware/error-middleware`)
 * et gérées par `asyncHandler` : aucune `error.message` brute n'est renvoyée.
 */
const getTenantId = (req: Request): string => {
  const tenantId = req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError(t('Contexte agence requis pour la newsletter.'));
  }
  return tenantId;
};

// ---------------------------------------------------------------- schemas

const tooLong = (max: number) => t('Texte trop long (maximum {{max}} caractères).', { max });

const requiredText = (label: string, max: number) =>
  z.string({ required_error: label, invalid_type_error: label }).trim().min(1, label).max(max, tooLong(max));

const idField = (label: string) =>
  z.string({ required_error: label, invalid_type_error: label }).trim().min(1, label).max(64, label);

const htmlField = (label: string) =>
  z
    .string({ required_error: label, invalid_type_error: label })
    .min(1, label)
    .max(1_000_000, t('Le contenu est trop volumineux.'));

const createListSchema = z.object({
  name: requiredText(t('Le nom de la liste est obligatoire.'), 150),
  type: z.enum(['MANUAL', 'FROM_OWNERS', 'FROM_RENTERS', 'FROM_CRM_CONTACTS'], {
    errorMap: () => ({ message: t('Le type de liste est invalide.') })
  }),
  doubleOptIn: z.boolean({ invalid_type_error: t('Valeur invalide.') }).optional()
});

const updateListSchema = z.object({
  name: requiredText(t('Le nom de la liste est obligatoire.'), 150).optional(),
  doubleOptIn: z.boolean({ invalid_type_error: t('Valeur invalide.') }).optional()
});

const addSubscriberSchema = z.object({
  email: z
    .string({
      required_error: t("L'adresse e-mail est obligatoire."),
      invalid_type_error: t('Adresse email invalide.')
    })
    .trim()
    .max(254, t('Adresse email invalide.'))
    .email(t('Adresse email invalide.')),
  name: z.string().trim().max(150, tooLong(150)).optional()
});

const fromContactsSchema = z.object({
  contactIds: z
    .array(idField(t('Identifiant de contact invalide.')), {
      required_error: t('contactIds requis (tableau non vide).'),
      invalid_type_error: t('contactIds requis (tableau non vide).')
    })
    .min(1, t('contactIds requis (tableau non vide).'))
    .max(5000, t('Trop de contacts (maximum {{max}}).', { max: 5000 }))
});

const createCampaignSchema = z.object({
  listId: idField(t('La liste de diffusion est obligatoire.')),
  templateId: idField(t('Identifiant de modèle invalide.')).nullish(),
  subject: requiredText(t("L'objet de la campagne est obligatoire."), 300),
  bodyHtml: htmlField(t('Le contenu de la campagne est obligatoire.'))
});

const updateCampaignSchema = z.object({
  subject: requiredText(t("L'objet de la campagne est obligatoire."), 300).optional(),
  bodyHtml: htmlField(t('Le contenu de la campagne est obligatoire.')).optional(),
  templateId: idField(t('Identifiant de modèle invalide.')).nullish()
});

const scheduleCampaignSchema = z.object({
  scheduledAt: z.coerce.date({
    required_error: t("La date d'envoi est obligatoire."),
    invalid_type_error: t("La date d'envoi est invalide.")
  })
});

const createTemplateSchema = z.object({
  name: requiredText(t('Le nom du modèle est obligatoire.'), 150),
  html: htmlField(t('Le contenu du modèle est obligatoire.'))
});

const updateTemplateSchema = createTemplateSchema.partial();

const subscribePublicSchema = z
  .object({
    listToken: z.string().trim().max(200).optional(),
    listId: z.string().trim().max(64).optional(),
    email: z
      .string({ required_error: t('Email requis.'), invalid_type_error: t('Email requis.') })
      .trim()
      .min(1, t('Email requis.'))
      .max(254, t('Adresse email invalide.')),
    name: z.string().trim().max(150).optional()
  })
  .refine(v => Boolean(v.listToken || v.listId), { message: t('listToken ou listId requis.'), path: ['listToken'] });

/** Corps absent traité comme un objet vide : les erreurs sortent champ par champ. */
const body = (req: Request): Record<string, unknown> =>
  req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};

const listOptions = (req: Request) => ({
  status: typeof req.query.status === 'string' ? req.query.status : undefined,
  ...parsePagination(req.query, { defaultPage: 1, defaultLimit: 20 })
});

// ------------------------------------------------------------------ lists

export const listListsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await listService.getListsWithCounts(getTenantId(req)));
});

export const createListHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = createListSchema.parse(body(req));
  res.status(201).json(await listService.createList(getTenantId(req), data));
});

export const getListHandler = asyncHandler(async (req: Request, res: Response) => {
  const list = await listService.getList(getTenantId(req), req.params.listId);
  if (!list) throw new NotFoundError(t('Liste non trouvée.'));
  res.json(list);
});

export const updateListHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = updateListSchema.parse(body(req));
  res.json(await listService.updateList(getTenantId(req), req.params.listId, data));
});

export const deleteListHandler = asyncHandler(async (req: Request, res: Response) => {
  await listService.deleteList(getTenantId(req), req.params.listId);
  res.status(204).send();
});

// ------------------------------------------------------------ subscribers

export const listSubscribersHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await subscriberService.listSubscribers(getTenantId(req), req.params.listId, listOptions(req)));
});

export const addSubscriberHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = addSubscriberSchema.parse(body(req));
  res.status(201).json(await subscriberService.addSubscriber(getTenantId(req), req.params.listId, data));
});

export const importSubscribersHandler = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file?.buffer) throw new BadRequestError(t('Fichier CSV requis.'));
  res.json(await subscriberService.importFromCsv(getTenantId(req), req.params.listId, file.buffer));
});

/**
 * POST /tenants/:tenantId/newsletter/lists/:listId/subscribers/from-contacts
 * Body: { contactIds: string[] }
 */
export const addSubscribersFromContactsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { contactIds } = fromContactsSchema.parse(body(req));
  res.json(await subscriberService.addSubscribersFromContactIds(getTenantId(req), req.params.listId, contactIds));
});

export const exportSubscribersHandler = asyncHandler(async (req: Request, res: Response) => {
  const csv = await subscriberService.exportToCsv(getTenantId(req), req.params.listId);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(csv);
});

export const removeSubscriberHandler = asyncHandler(async (req: Request, res: Response) => {
  await subscriberService.removeSubscriber(getTenantId(req), req.params.subscriberId);
  res.status(204).send();
});

// -------------------------------------------------------------- campaigns

export const listCampaignsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await campaignService.listCampaigns(getTenantId(req), listOptions(req)));
});

export const createCampaignHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = createCampaignSchema.parse(body(req));
  const campaign = await campaignService.createCampaign(
    getTenantId(req),
    { listId: data.listId, templateId: data.templateId ?? undefined, subject: data.subject, bodyHtml: data.bodyHtml },
    req.user?.userId
  );
  res.status(201).json(campaign);
});

export const getCampaignHandler = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await campaignService.getCampaign(getTenantId(req), req.params.campaignId);
  if (!campaign) throw new NotFoundError(t('Campagne non trouvée.'));
  res.json(campaign);
});

export const updateCampaignHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = updateCampaignSchema.parse(body(req));
  res.json(
    await campaignService.updateCampaign(getTenantId(req), req.params.campaignId, {
      subject: data.subject,
      bodyHtml: data.bodyHtml,
      templateId: data.templateId ?? undefined
    })
  );
});

export const sendCampaignHandler = asyncHandler(async (req: Request, res: Response) => {
  await campaignService.sendCampaign(getTenantId(req), req.params.campaignId);
  res.json(await campaignService.getCampaign(getTenantId(req), req.params.campaignId));
});

export const scheduleCampaignHandler = asyncHandler(async (req: Request, res: Response) => {
  const { scheduledAt } = scheduleCampaignSchema.parse(body(req));
  await campaignService.scheduleCampaign(getTenantId(req), req.params.campaignId, scheduledAt);
  res.json(await campaignService.getCampaign(getTenantId(req), req.params.campaignId));
});

export const cancelCampaignHandler = asyncHandler(async (req: Request, res: Response) => {
  await campaignService.cancelCampaign(getTenantId(req), req.params.campaignId);
  res.json(await campaignService.getCampaign(getTenantId(req), req.params.campaignId));
});

export const listRecipientsHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await campaignService.getCampaignRecipients(
    getTenantId(req),
    req.params.campaignId,
    parsePagination(req.query, { defaultPage: 1, defaultLimit: 20 })
  );
  if (!result) throw new NotFoundError(t('Campagne non trouvée.'));
  res.json(result);
});

export const previewCampaignHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await campaignService.getPreviewHtml(getTenantId(req), req.params.campaignId));
});

// -------------------------------------------------------------- templates

export const listTemplatesHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await templateService.listTemplates(getTenantId(req)));
});

export const createTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = createTemplateSchema.parse(body(req));
  res.status(201).json(await templateService.createTemplate(getTenantId(req), data));
});

export const getTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  const tpl = await templateService.getTemplate(getTenantId(req), req.params.templateId);
  if (!tpl) throw new NotFoundError(t('Template non trouvé.'));
  res.json(tpl);
});

export const updateTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = updateTemplateSchema.parse(body(req));
  res.json(await templateService.updateTemplate(getTenantId(req), req.params.templateId, data));
});

export const deleteTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  await templateService.deleteTemplate(getTenantId(req), req.params.templateId);
  res.status(204).send();
});

// ----------------------------------------------------------------- public

export const subscribeHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = subscribePublicSchema.parse(body(req));
  const result = await subscriberService.subscribePublic(data);
  res.status(result.success ? 201 : 400).json(result);
});

const tokenFrom = (req: Request): string | undefined => {
  const fromQuery = typeof req.query.token === 'string' ? req.query.token : undefined;
  const fromBody = typeof body(req).token === 'string' ? (body(req).token as string) : undefined;
  return fromQuery || fromBody;
};

export const confirmHandler = asyncHandler(async (req: Request, res: Response) => {
  const token = tokenFrom(req);
  if (!token) {
    res.status(400).json({ success: false, message: t('Token requis.'), code: 'MISSING_TOKEN' });
    return;
  }
  const result = await subscriberService.confirmSubscription(token);
  if (!result.success) {
    res.status(400).json({
      success: false,
      message: t('Lien invalide ou expiré. Vous pouvez vous réinscrire à la newsletter.'),
      code: result.alreadyActive ? 'ALREADY_ACTIVE' : 'INVALID_OR_EXPIRED'
    });
    return;
  }
  res.json({
    success: true,
    message: result.alreadyActive
      ? t('Vous êtes déjà inscrit à cette newsletter.')
      : t('Votre inscription a été confirmée.')
  });
});

export const unsubscribeHandler = asyncHandler(async (req: Request, res: Response) => {
  const token = tokenFrom(req);
  const unsubscribeAll = body(req).unsubscribeAll === true;
  if (!token) {
    res
      .status(400)
      .json({ success: false, message: t('Token requis. Le lien de désinscription est invalide ou expiré.') });
    return;
  }
  const result = await subscriberService.unsubscribeByToken(token, unsubscribeAll);
  if (result.success) {
    res.json({ success: true, message: t('Vous avez été désabonné.') });
  } else {
    res.status(400).json({
      success: false,
      message: t(
        'Ce lien de désinscription est invalide ou a déjà été utilisé. Si vous souhaitez vous désabonner, utilisez le lien présent dans un email plus récent.'
      )
    });
  }
});

const TRANSPARENT_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export async function trackOpenHandler(req: Request, res: Response) {
  res.setHeader('Content-Type', 'image/gif');
  try {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    if (!token) {
      res.send(TRANSPARENT_GIF);
      return;
    }
    const pixel = await campaignService.trackOpen(token);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(pixel);
  } catch {
    res.send(TRANSPARENT_GIF);
  }
}
