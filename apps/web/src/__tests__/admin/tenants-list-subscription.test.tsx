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
 * `getTenantEntitlements` (le vrai service) tournent par-dessus.
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

function entitlementsFor(tenantId: string) {
  const used = tenantId === 'tenant-proche' ? 95 : 10;
  return {
    tenantId,
    subscriptionId: 'sub-1',
    status: 'ACTIVE',
    phase: 'ACTIVE',
    readOnly: false,
    readOnlyReason: null,
    trialEndsAt: null,
    graceEndsAt: null,
    billingCycle: 'MONTHLY',
    currentPeriodStart: '2026-01-01T00:00:00.000Z',
    currentPeriodEnd: '2026-02-01T00:00:00.000Z',
    packs: ['AGENCE'],
    modules: ['MODULE_AGENCY'],
    moduleAccess: { MODULE_AGENCY: 'FULL', MODULE_SYNDIC: 'NONE', MODULE_PROMOTER: 'NONE' },
    features: [],
    capacities: {
      LOTS: { included: 100, extensions: 0, overrides: 0, limit: 100, used, remaining: 100 - used, overBy: 0 },
      COPROPRIETES: { included: 0, extensions: 0, overrides: 0, limit: 0, used: 0, remaining: 0, overBy: 0 },
      CHANTIERS: { included: 0, extensions: 0, overrides: 0, limit: 0, used: 0, remaining: 0, overBy: 0 }
    },
    quotaPolicy: 'BILL_OVERAGE',
    enforcement: 'enforce',
    computedAt: '2026-01-15T00:00:00.000Z'
  };
}

const CATALOG = [
  { id: 'c-1', code: 'AGENCE', kind: 'PACK', name: 'Agence', description: null, monthlyPrice: 29_900, setupPrice: 100_000, modules: ['MODULE_AGENCY'], exclusiveGroup: null, rules: null, isSellable: true, sortOrder: 10, capacities: { LOTS: 100 } }
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
    if (url === '/admin/tenants/tenant-proche/entitlements') {
      return Promise.resolve({ data: { success: true, data: entitlementsFor('tenant-proche') } });
    }
    if (url === '/admin/tenants/tenant-large/entitlements') {
      return Promise.resolve({ data: { success: true, data: entitlementsFor('tenant-large') } });
    }
    return Promise.reject(new Error(`GET non simulé : ${url}`));
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
