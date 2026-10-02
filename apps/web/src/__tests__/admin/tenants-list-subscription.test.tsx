import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TenantsList } from '../../pages/admin/TenantsList';

/**
 * `<TenantsList>` — colonnes packs / % de lots utilisés / prochaine échéance
 * et filtre « proche de la limite » (vague 2, lot C). `apiClient` est simulé
 * au plus près de la frontière réseau : `listTenants`, `listCatalog` et
 * `getSubscriptionSummaries` (le vrai service) tournent par-dessus.
 */

vi.mock('../../utils/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

import apiClient from '../../utils/api-client';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

const TENANTS = [
  {
    id: 'tenant-proche',
    name: 'Agence Proche Limite',
    slug: 'agence-proche',
    status: 'ACTIVE',
    contactEmail: 'proche@test.ci',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'tenant-large',
    name: 'Agence Large',
    slug: 'agence-large',
    status: 'ACTIVE',
    contactEmail: 'large@test.ci',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
];

function summaryFor(tenantId: string) {
  const used = tenantId === 'tenant-proche' ? 95 : 10;
  return {
    tenantId,
    status: 'ACTIVE',
    phase: 'ACTIVE',
    readOnly: false,
    packs: ['AGENCE'],
    capacities: {
      LOTS: { limit: 100, used },
      COPROPRIETES: { limit: 0, used: 0 },
      CHANTIERS: { limit: 0, used: 0 }
    },
    lotsUsagePercent: used,
    nearLimit: used >= 80,
    nextDueAt: '2026-02-01T00:00:00.000Z',
    openExtensionRequests: 0
  };
}

const CATALOG = [
  {
    id: 'c-1',
    code: 'AGENCE',
    kind: 'PACK',
    name: 'Agence',
    description: null,
    monthlyPrice: 29_900,
    setupPrice: 100_000,
    modules: ['MODULE_AGENCY'],
    exclusiveGroup: null,
    rules: null,
    isSellable: true,
    sortOrder: 10,
    capacities: { LOTS: 100 }
  }
];

function mount() {
  return render(
    <MemoryRouter>
      <TenantsList />
    </MemoryRouter>
  );
}

beforeEach(() => {
  get.mockReset();
  get.mockImplementation((url: string) => {
    if (url === '/admin/tenants') {
      return Promise.resolve({
        data: { success: true, data: { tenants: TENANTS, pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } } }
      });
    }
    if (url === '/admin/catalog') return Promise.resolve({ data: { success: true, data: CATALOG } });
    if (url === '/admin/subscriptions/summaries') {
      return Promise.resolve({
        data: {
          success: true,
          data: { 'tenant-proche': summaryFor('tenant-proche'), 'tenant-large': summaryFor('tenant-large') }
        }
      });
    }
    return Promise.reject(new Error(`GET non simulé : ${url}`));
  });
});

describe('<TenantsList> — titre', () => {
  // Recette du 29/09/2026 : le titre disait « Tenants » alors que le menu et le
  // fil d'Ariane disent « Agences ».
  it('titre la page « Agences », comme le menu', async () => {
    mount();

    expect(await screen.findByRole('heading', { level: 3, name: 'Agences' })).toBeInTheDocument();
    expect(screen.queryByText('Tenants')).not.toBeInTheDocument();
  });
});

describe('<TenantsList> — abonnements par packs', () => {
  it('affiche le pack et le pourcentage de lots utilisés par agence', async () => {
    mount();

    expect(await screen.findByText('Agence Proche Limite')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Agence').length).toBeGreaterThan(0));
    expect(await screen.findByText('95%')).toBeInTheDocument();
    expect(await screen.findByText('10%')).toBeInTheDocument();
  });

  it('charge le résumé de toute la page en une seule requête (plus de N+1)', async () => {
    mount();
    await screen.findByText('95%');
    const summaryCalls = get.mock.calls.filter(([url]) => url === '/admin/subscriptions/summaries');
    expect(summaryCalls).toHaveLength(1);
    expect(summaryCalls[0][1]).toEqual({ params: { tenantIds: 'tenant-proche,tenant-large' } });
    expect(get.mock.calls.some(([url]) => String(url).endsWith('/entitlements'))).toBe(false);
  });

  it('le filtre « proche de la limite » ne garde que les agences à 80 % ou plus', async () => {
    const user = userEvent.setup();
    mount();

    await screen.findByText('Agence Proche Limite');
    await screen.findByText('Agence Large');
    await waitFor(() => expect(screen.getByText('95%')).toBeInTheDocument());

    await user.click(screen.getByRole('checkbox', { name: 'Proche de la limite' }));

    await waitFor(() => {
      expect(screen.getByText('Agence Proche Limite')).toBeInTheDocument();
      expect(screen.queryByText('Agence Large')).not.toBeInTheDocument();
    });
  });
});
