import { Request, Response } from 'express';
import { asyncHandler, UnauthorizedError } from '../middleware/error-middleware';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import {
  searchContacts,
  getFieldSuggestions,
  saveSearch,
  getSavedSearches,
  useSavedSearch,
  deleteSavedSearch,
  exportSearchResultsCsv,
  type ContactSearchFilters
} from '../services/contact-search.service';

/**
 * Contrôleurs enveloppés dans `asyncHandler` : les erreurs typées des services
 * sortent avec leur statut, toute autre erreur est masquée par `errorHandler`
 * (jamais de `e.message` brut vers le client).
 */

function requireUserId(req: Request): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw new UnauthorizedError('Non authentifié');
  }
  return userId;
}

/**
 * POST /tenants/:tenantId/crm/contacts-search/search
 * Body: { filters: ContactSearchFilters }
 */
export const advancedSearchHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const filters = (req.body?.filters ?? req.body) as ContactSearchFilters;
  const result = await searchContacts(tenantId, filters);
  res.json(result);
});

/**
 * GET /tenants/:tenantId/crm/contacts-search/suggestions/:field?query=
 */
export const getSuggestionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const field = req.params.field as string;
  const query = (req.query.query as string) || undefined;
  const suggestions = await getFieldSuggestions(tenantId, field, query);
  res.json(suggestions);
});

/**
 * GET /tenants/:tenantId/crm/contacts-search/saved
 */
export const listSavedSearchesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const list = await getSavedSearches(tenantId, requireUserId(req));
  res.json(list);
});

/**
 * POST /tenants/:tenantId/crm/contacts-search/saved
 * Body: { name, description?, filters, scope? }
 */
export const createSavedSearchHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const saved = await saveSearch(tenantId, requireUserId(req), req.body);
  res.status(201).json(saved);
});

/**
 * POST /tenants/:tenantId/crm/contacts-search/saved/:searchId/use
 */
export const useSavedSearchHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const result = await useSavedSearch(req.params.searchId as string, tenantId);
  res.json(result);
});

/**
 * DELETE /tenants/:tenantId/crm/contacts-search/saved/:searchId
 */
export const deleteSavedSearchHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  await deleteSavedSearch(req.params.searchId as string, tenantId, requireUserId(req));
  res.status(204).send();
});

/**
 * POST /tenants/:tenantId/crm/contacts-search/export
 * Body: { filters: ContactSearchFilters }
 */
export const exportSearchHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const filters = (req.body?.filters ?? req.body) as ContactSearchFilters;
  const csv = await exportSearchResultsCsv(tenantId, filters);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="contacts-${Date.now()}.csv"`);
  res.send(csv);
});
