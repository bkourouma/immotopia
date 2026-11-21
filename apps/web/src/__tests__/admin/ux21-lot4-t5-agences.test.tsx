import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TenantDetail } from '../../pages/admin/TenantDetail';
import { TenantCreatedResult } from '../../components/admin/TenantCreatedResult';
import type { ProvisionTenantResult } from '../../services/tenant-service';

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
  post.mockReset();
  get.mockImplementation((url: string) => {
    if (url === '/tenants/tenant-1') return Promise.resolve({ data: { success: true, data: TENANT } });
    return Promise.reject(new Error(`GET non simulé : ${url}`));
  });
});

describe('<TenantDetail> — en-tête et actions risquées', () => {
  it('« Modifier » est l’action primaire ; « Suspendre » est rangée dans le menu et confirmée en nommant l’agence', async () => {
    const user = userEvent.setup();
    mount();

    expect(await screen.findByRole('heading', { level: 1, name: 'Agence Cocody' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspendre' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Autres actions' }));
    await user.click(await screen.findByText('Suspendre'));

    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getAllByText(/Suspendre l'agence « Agence Cocody » \?/).length).toBeGreaterThan(0);
    expect(post).not.toHaveBeenCalled();
  });

  it('erreur de chargement : message en langage métier et bouton « Réessayer »', async () => {
    get.mockReset();
    get.mockRejectedValue(new Error('boom'));
    mount();
    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retour aux agences' })).toBeInTheDocument();
  });
});

describe('<TenantCreatedResult> — copie du lien', () => {
  it('« Copier » confirme par « Copié » et prévient que le lien ne sera plus affiché', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const result: ProvisionTenantResult = {
      tenant: { id: 't1', name: 'Agence Kipe', slug: 'agence-kipe', type: 'AGENCY', status: 'ACTIVE' },
      modules: ['MODULE_AGENCY'],
      subscription: {
        planKey: null,
        billingCycle: 'MONTHLY',
        status: 'TRIALING',
        currentPeriodEnd: '2026-10-30T00:00:00Z'
      },
      admin: { userId: 'u1', email: 'a@x.test', fullName: 'Awa', existingUser: false },
      invitation: { id: 'i1', expiresAt: '2026-10-07T00:00:00Z', acceptUrl: 'http://x/accept?token=abc' },
      emailSent: true
    };
    render(
      <MemoryRouter>
        <TenantCreatedResult
          result={result}
          onResend={vi.fn()}
          resending={false}
          onCreateAnother={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.getByText(/il ne sera plus affiché/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Copier le lien d'invitation" }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: "Copier le lien d'invitation" })).toHaveTextContent('Copié')
    );
    expect(writeText).toHaveBeenCalledWith('http://x/accept?token=abc');
  });
});
