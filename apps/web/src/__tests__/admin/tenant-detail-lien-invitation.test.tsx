import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TenantDetail } from '../../pages/admin/TenantDetail';

/** Fiche agence : bouton « Copier le lien d'invitation » (confirmation, appel, copie ou modale). */

vi.mock('../../utils/api-client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

import apiClient from '../../utils/api-client';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const TENANT = {
  id: 'tenant-1',
  name: 'Agence Cocody',
  slug: 'agence-cocody',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};
const LINK = {
  acceptUrl: 'http://localhost:3000/auth/accept-invite?token=abc-123',
  email: 'admin@cocody.ci',
  expiresAt: '2026-12-01T10:00:00.000Z',
  invitationId: 'inv-1'
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

function setClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockImplementation((url: string) => {
    if (url === '/tenants/tenant-1') return Promise.resolve({ data: { success: true, data: TENANT } });
    return Promise.reject(new Error(`GET non simulé : ${url}`));
  });
  post.mockResolvedValue({ data: { success: true, data: LINK } });
});

describe('<TenantDetail> — lien d’invitation', () => {
  it('confirme, appelle l’API, copie le lien et l’affiche dans la modale', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup(); // installe son propre presse-papiers : on le remplace ensuite
    setClipboard(writeText);
    mount();

    await user.click(await screen.findByRole('button', { name: /Copier le lien d'invitation/ }));
    expect(post).not.toHaveBeenCalled();
    expect(await screen.findByText(/invalide le précédent/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Générer le lien' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/tenants/tenant-1/invitation-link', {}));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK.acceptUrl));
    expect(await screen.findByDisplayValue(LINK.acceptUrl)).toHaveAttribute('readonly');
    expect(screen.getByText(/admin@cocody\.ci/)).toBeInTheDocument();
  });

  it('affiche quand même le lien dans la modale si la copie échoue', async () => {
    const user = userEvent.setup();
    setClipboard(vi.fn().mockRejectedValue(new Error('refusé')));
    mount();

    await user.click(await screen.findByRole('button', { name: /Copier le lien d'invitation/ }));
    await user.click(await screen.findByRole('button', { name: 'Générer le lien' }));

    expect(await screen.findByDisplayValue(LINK.acceptUrl)).toBeInTheDocument();
  });

  it('n’appelle pas l’API si la confirmation est annulée', async () => {
    const user = userEvent.setup();
    setClipboard(vi.fn());
    mount();

    await user.click(await screen.findByRole('button', { name: /Copier le lien d'invitation/ }));
    await user.click(await screen.findByRole('button', { name: 'Annuler' }));

    expect(post).not.toHaveBeenCalled();
  });
});
