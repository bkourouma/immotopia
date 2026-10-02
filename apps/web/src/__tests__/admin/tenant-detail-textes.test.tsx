import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TenantDetail } from '../../pages/admin/TenantDetail';

/**
 * Fiche agence (super-administrateur) — orthographe des libellés.
 *
 * La recette navigateur du 29 septembre 2026 a relevé « Nom legal »,
 * « Telephone » et « Voir les details » (attribut `title`) : le texte français
 * étant la clé de traduction, une faute d'accent est aussi une clé qui ne
 * retrouve pas sa traduction. Seul `api-client` est simulé (frontière réseau).
 */

vi.mock('../../utils/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

import apiClient from '../../utils/api-client';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

const TENANT = {
  id: 'tenant-1',
  name: 'Agence Cocody',
  slug: 'agence-cocody',
  legalName: 'Cocody Immobilier SARL',
  status: 'ACTIVE',
  contactEmail: 'contact@cocody.ci',
  contactPhone: '+225 07 00 00 00 00',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

const MEMBER = {
  id: 'member-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  user: {
    id: 'user-1',
    email: 'awa@cocody.ci',
    fullName: 'Awa Koné',
    avatarUrl: null,
    isActive: true,
    emailVerified: true,
    lastLoginAt: null
  },
  roles: [{ id: 'role-1', key: 'TENANT_ADMIN', name: 'Administrateur', description: null, scope: 'TENANT' }]
};

function mount() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/admin/tenants/tenant-1']}>
        <Routes>
          <Route path="/admin/tenants/:tenantId" element={<TenantDetail />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  get.mockReset();
  get.mockImplementation((url: string) => {
    if (url === '/tenants/tenant-1') return Promise.resolve({ data: { success: true, data: TENANT } });
    if (url === '/tenants/tenant-1/users') {
      return Promise.resolve({ data: { success: true, data: { members: [MEMBER] } } });
    }
    return Promise.reject(new Error(`GET non simulé : ${url}`));
  });
});

describe('<TenantDetail> — libellés accentués', () => {
  it('vue d’ensemble : « Nom légal » et « Téléphone »', async () => {
    mount();

    expect(await screen.findByText('Nom légal')).toBeInTheDocument();
    expect(screen.getByText('Téléphone')).toBeInTheDocument();
    expect(screen.queryByText('Nom legal')).not.toBeInTheDocument();
    expect(screen.queryByText('Telephone')).not.toBeInTheDocument();
  });

  it('collaborateurs : en-têtes et infobulles accentués', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole('button', { name: 'Collaborateurs' }));

    expect(await screen.findByText('Rôles')).toBeInTheDocument();
    expect(screen.getByText('Dernière connexion')).toBeInTheDocument();
    expect(screen.getByTitle('Voir les détails')).toBeInTheDocument();
    expect(screen.getByTitle('Désactiver')).toBeInTheDocument();
    expect(screen.queryByTitle('Voir les details')).not.toBeInTheDocument();
  });
});
