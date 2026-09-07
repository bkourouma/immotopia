import { Request, Response } from 'express';
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
 * POST /tenants/:tenantId/crm/contacts-search/search
 * Body: { filters: ContactSearchFilters }
 */
export async function advancedSearchHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const filters = (req.body?.filters ?? req.body) as ContactSearchFilters;
    const result = await searchContacts(tenantId, filters);
    res.json(result);
  } catch (e) {
    res.status(400).json({
      success: false,
      message: e instanceof Error ? e.message : 'Recherche impossible'
    });
  }
}

/**
 * GET /tenants/:tenantId/crm/contacts-search/suggestions/:field?query=
 */
export async function getSuggestionsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const field = req.params.field as string;
    const query = (req.query.query as string) || undefined;
    const suggestions = await getFieldSuggestions(tenantId, field, query);
    res.json(suggestions);
  } catch (e) {
    res.status(400).json({
      success: false,
      message: e instanceof Error ? e.message : 'Suggestions impossibles'
    });
  }
}

/**
 * GET /tenants/:tenantId/crm/contacts-search/saved
 */
export async function listSavedSearchesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Non authentifié' });
      return;
    }
    const list = await getSavedSearches(tenantId, userId);
    res.json(list);
  } catch (e) {
    res.status(500).json({
      success: false,
      message: e instanceof Error ? e.message : 'Liste impossible'
    });
  }
}

/**
 * POST /tenants/:tenantId/crm/contacts-search/saved
 * Body: { name, description?, filters, scope? }
 */
export async function createSavedSearchHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Non authentifié' });
      return;
    }
    const saved = await saveSearch(tenantId, userId, req.body);
    res.status(201).json(saved);
  } catch (e) {
    res.status(400).json({
      success: false,
      message: e instanceof Error ? e.message : 'Sauvegarde impossible'
    });
  }
}

/**
 * POST /tenants/:tenantId/crm/contacts-search/saved/:searchId/use
 */
export async function useSavedSearchHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const searchId = req.params.searchId as string;
    const result = await useSavedSearch(searchId, tenantId);
    res.json(result);
  } catch (e) {
    res.status(400).json({
      success: false,
      message: e instanceof Error ? e.message : 'Recherche introuvable'
    });
  }
}

/**
 * DELETE /tenants/:tenantId/crm/contacts-search/saved/:searchId
 */
export async function deleteSavedSearchHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Non authentifié' });
      return;
    }
    await deleteSavedSearch(req.params.searchId as string, tenantId, userId);
    res.status(204).send();
  } catch (e) {
    res.status(400).json({
      success: false,
      message: e instanceof Error ? e.message : 'Suppression impossible'
    });
  }
}

/**
 * POST /tenants/:tenantId/crm/contacts-search/export
 * Body: { filters: ContactSearchFilters }
 */
export async function exportSearchHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const filters = (req.body?.filters ?? req.body) as ContactSearchFilters;
    const csv = await exportSearchResultsCsv(tenantId, filters);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="contacts-${Date.now()}.csv"`);
    res.send(csv);
  } catch (e) {
    res.status(400).json({
      success: false,
      message: e instanceof Error ? e.message : 'Export impossible'
    });
  }
}
