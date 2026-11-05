import type { Mock } from 'vitest';
import apiClient from '../../utils/api-client';
import { newsletterService } from '../../services/newsletter.service';
import { getTenantAuditLogs } from '../../services/tenant-audit-service';
import { managerMaintenanceService, tenantMaintenanceService } from '../../services/maintenance-service';

/**
 * Recherche multicritères (lot DIV-C) : les services front relaient les
 * nouveaux critères à l'API, sans jamais envoyer une valeur vide.
 */

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn() }
}));

const get = (apiClient as unknown as { get: Mock }).get;

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: {} });
});

describe('newsletterService', () => {
  it('campagnes : recherche, statuts, liste et période partent à l’API', async () => {
    await newsletterService.listCampaigns('t1', {
      search: 'soldes',
      status: 'DRAFT,SENT',
      listId: 'l1',
      from: '2026-10-01',
      to: '2026-10-31',
      page: 2,
      limit: 20
    });
    const url = new URL(`http://x${get.mock.calls[0][0]}`);
    expect(url.pathname).toBe('/tenants/t1/newsletter/campaigns');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: 'soldes',
      status: 'DRAFT,SENT',
      listId: 'l1',
      from: '2026-10-01',
      to: '2026-10-31',
      page: '2',
      limit: '20'
    });
  });

  it('campagnes : sans critère, aucun paramètre', async () => {
    await newsletterService.listCampaigns('t1');
    expect(get.mock.calls[0][0]).toBe('/tenants/t1/newsletter/campaigns');
  });

  it('abonnés : la recherche part avec le statut', async () => {
    await newsletterService.listSubscribers('t1', 'l1', { search: 'awa', status: 'ACTIVE' });
    const url = new URL(`http://x${get.mock.calls[0][0]}`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ search: 'awa', status: 'ACTIVE' });
  });

  it('modèles : la recherche est un paramètre, absente sinon', async () => {
    get.mockResolvedValue({ data: [] });
    await newsletterService.listTemplates('t1', { search: 'std' });
    expect(get).toHaveBeenLastCalledWith('/tenants/t1/newsletter/templates', { params: { search: 'std' } });
    await newsletterService.listTemplates('t1');
    expect(get).toHaveBeenLastCalledWith('/tenants/t1/newsletter/templates', { params: undefined });
  });
});

describe('getTenantAuditLogs', () => {
  it('relaie la recherche libre et ignore une recherche vide', async () => {
    await getTenantAuditLogs('t1', { search: 'connexion', category: 'AUTH' });
    expect(get).toHaveBeenLastCalledWith('/tenants/t1/audit', { params: { search: 'connexion', category: 'AUTH' } });
    await getTenantAuditLogs('t1', { search: '' });
    expect(get).toHaveBeenLastCalledWith('/tenants/t1/audit', { params: {} });
  });
});

describe('services de maintenance', () => {
  it('tickets de l’agence : recherche, catégorie et période', async () => {
    await managerMaintenanceService.listTickets('t1', {
      search: 'fuite',
      category: 'PLUMBING' as never,
      status: 'DECLARED' as never,
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31'
    });
    const url = new URL(`http://x${get.mock.calls[0][0]}`);
    expect(url.pathname).toBe('/tenants/t1/maintenance/admin/tickets');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: 'fuite',
      category: 'PLUMBING',
      status: 'DECLARED',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31'
    });
  });

  it('mes tickets : recherche, priorité, catégorie et période', async () => {
    await tenantMaintenanceService.listTickets('t1', {
      search: 'porte',
      priority: 'HIGH' as never,
      category: 'AC' as never,
      dateFrom: '2026-10-01'
    });
    const url = new URL(`http://x${get.mock.calls[0][0]}`);
    expect(url.pathname).toBe('/tenants/t1/maintenance/tenant/tickets');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: 'porte',
      priority: 'HIGH',
      category: 'AC',
      dateFrom: '2026-10-01'
    });
  });
});
