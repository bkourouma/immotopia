import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TenantDetail } from '../../pages/admin/TenantDetail';

/**
 * Fiche agence : onglet actif dans l'URL (`?onglet=`) et onglet Collaborateurs
 * paginé par le serveur. Seul `api-client` est simulé.
 */

vi.mock('../../utils/api-client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

import apiClient from '../../utils/api-client';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

const TENANT = {
  id: 'tenant-1',
  name: 'Agence Cocody',
  slug: 'agence-cocody',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

function member(index: number) {
  return {
    id: `member-${index}`,
    userId: `user-${index}`,
    tenantId: 'tenant-1',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    user: {
      id: `user-${index}`,
      email: `agent${index}@cocody.ci`,
      fullName: `Agent ${index}`,
      avatarUrl: null,
      isActive: true,
      emailVerified: true,
      lastLoginAt: null
    },
    roles: []
  };
}

function Probe() {
  const location = useLocation();
  return <output data-testid="search">{location.search}</output>;
}

function mount(entry = '/admin/tenants/tenant-1') {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[entry]}>
        <Probe />
        <Routes>
          <Route path="/admin/tenants/:tenantId" element={<TenantDetail />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  get.mockReset();
  get.mockImplementation((url: string, config?: { params?: { page?: number } }) => {
    if (url === '/tenants/tenant-1') return Promise.resolve({ data: { success: true, data: TENANT } });
    if (url === '/roles') {
      return Promise.resolve({
        data: { success: true, data: [{ id: 'role-agent', key: 'AGENT', name: 'Agent', scope: 'TENANT' }] }
      });
    }
    if (url === '/tenants/tenant-1/stats') return Promise.reject(new Error('stats indisponibles'));
    if (url === '/tenants/tenant-1/users') {
      const page = config?.params?.page ?? 1;
      const first = (page - 1) * 20;
      const count = page === 1 ? 20 : 5;
      return Promise.resolve({
        data: {
          success: true,
          data: {
            members: Array.from({ length: count }, (_, i) => member(first + i + 1)),
            pagination: { page, limit: 20, total: 25, totalPages: 2 }
          }
        }
      });
    }
    return Promise.reject(new Error(`GET non simulé : ${url}`));
  });
});

describe('<TenantDetail> — onglet dans l’URL', () => {
  it('ouvre l’onglet demandé par ?onglet= sans passer par la vue d’ensemble', async () => {
    mount('/admin/tenants/tenant-1?onglet=collaborators');

    expect(await screen.findByText('Collaborateurs (25)', undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('Nom légal')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collaborateurs' })).toHaveAttribute('aria-current', 'page');
  });

  it('un onglet inconnu retombe sur la vue d’ensemble', async () => {
    mount('/admin/tenants/tenant-1?onglet=nimporte');

    expect(await screen.findByText('Nom légal')).toBeInTheDocument();
  });

  it('changer d’onglet écrit ?onglet= ; la vue d’ensemble l’efface', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole('button', { name: 'Collaborateurs' }));
    expect(screen.getByTestId('search')).toHaveTextContent('?onglet=collaborators');

    await user.click(screen.getByRole('button', { name: "Vue d'ensemble" }));
    expect(screen.getByTestId('search')).toBeEmptyDOMElement();
    expect(await screen.findByText('Nom légal')).toBeInTheDocument();
  });

  it('ne lit les collaborateurs que lorsque leur onglet est affiché', async () => {
    const user = userEvent.setup();
    mount();

    await screen.findByText('Nom légal');
    expect(get.mock.calls.some(([url]) => url === '/tenants/tenant-1/users')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Collaborateurs' }));
    await waitFor(() => expect(get.mock.calls.some(([url]) => url === '/tenants/tenant-1/users')).toBe(true));
  });
});

describe('<TenantDetail> — collaborateurs paginés par le serveur', () => {
  it('demande 20 lignes par page et passe à la page suivante via l’API', async () => {
    const user = userEvent.setup();
    mount('/admin/tenants/tenant-1?onglet=collaborators');

    expect(await screen.findByText('Agent 1')).toBeInTheDocument();
    const first = get.mock.calls.find(([url]) => url === '/tenants/tenant-1/users')!;
    expect(first[1].params).toEqual({ page: 1, limit: 20 });

    await user.click(screen.getByRole('button', { name: 'Page 2' }));

    expect(await screen.findByText('Agent 21')).toBeInTheDocument();
    const last = get.mock.calls.filter(([url]) => url === '/tenants/tenant-1/users').at(-1)!;
    expect(last[1].params).toEqual({ page: 2, limit: 20 });
    expect(screen.queryByText('Agent 1')).not.toBeInTheDocument();
  });

  it('applique la recherche et le statut d’une URL partagée (préfixe collab) à la requête', async () => {
    mount('/admin/tenants/tenant-1?onglet=collaborators&collab.q=kone&collab.status=ACTIVE,DISABLED');
    await screen.findByText('Agent 1');
    const first = get.mock.calls.find(([url]) => url === '/tenants/tenant-1/users')!;
    expect(first[1].params).toEqual({ search: 'kone', status: 'ACTIVE,DISABLED', page: 1, limit: 20 });
  });

  it('filtre par rôle : le critère part à l’API sous le nom roleId', async () => {
    mount('/admin/tenants/tenant-1?onglet=collaborators&collab.role=role-agent');
    await screen.findByText('Agent 1');
    const first = get.mock.calls.find(([url]) => url === '/tenants/tenant-1/users')!;
    expect(first[1].params).toEqual({ roleId: 'role-agent', page: 1, limit: 20 });
  });
});
