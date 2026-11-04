import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Services front des listes de l'administration : les critères de recherche
 * partent à l'API, les valeurs vides n'y partent pas.
 */

vi.mock('../../utils/api-client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

import apiClient from '../../utils/api-client';
import { listAdminPlatformInvoices } from '../../services/platform-billing-service';
import { getAuditLogs } from '../../services/audit-service';
import { listConversations } from '../../services/messaging-service';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: { success: true, data: [], pagination: { page: 1, limit: 20, total: 0 } } });
});

describe('listAdminPlatformInvoices', () => {
  it('envoie recherche, statuts, natures, période et montants ; jamais une valeur vide', async () => {
    await listAdminPlatformInvoices('t1', {
      page: 2,
      limit: 20,
      status: 'ISSUED,PAID',
      nature: '',
      search: 'IMT-2026',
      from: '2026-01-01',
      to: undefined,
      minAmount: 0,
      maxAmount: ''
    });

    expect(get).toHaveBeenCalledWith('/admin/tenants/t1/platform-invoices', {
      params: { page: 2, limit: 20, status: 'ISSUED,PAID', search: 'IMT-2026', from: '2026-01-01', minAmount: 0 }
    });
  });
});

describe('getAuditLogs', () => {
  it('transmet la recherche libre avec le curseur', async () => {
    get.mockResolvedValue({ data: { success: true, data: { logs: [], nextCursor: null } } });
    await getAuditLogs({ search: 'PROPERTY', cursor: 'c2', limit: 50 });

    expect(get).toHaveBeenCalledWith('/admin/audit', { params: { search: 'PROPERTY', cursor: 'c2', limit: 50 } });
  });
});

describe('listConversations', () => {
  it('transmet la recherche rognée, et rien quand elle est vide', async () => {
    get.mockResolvedValue({ data: { success: true, data: { items: [], total: 0, page: 1, pageSize: 50 } } });
    const scope = { kind: 'agency', tenantId: 't1' } as const;

    await listConversations(scope, { page: 1, pageSize: 50, search: '  soleil ' });
    expect(get.mock.calls[0][1].params).toEqual({ page: 1, pageSize: 50, search: 'soleil' });

    await listConversations(scope, { page: 1, pageSize: 50, search: '   ' });
    expect(get.mock.calls[1][1].params.search).toBeUndefined();
  });
});
