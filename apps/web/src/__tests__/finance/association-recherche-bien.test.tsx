import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Association } from '../../pages/finance/Association';

/**
 * Fiche d'une association — lot FIN-B, phase 1 : le sélecteur de rattachement
 * interroge le serveur à chaque frappe (`q`, 20 résultats) au lieu de charger
 * les 100 premiers biens, et la liste des biens rattachés se pagine
 * localement. Seul `apiClient` est simulé, comme dans `associations.test.tsx`.
 */

vi.mock('../../utils/api-client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

import apiClient from '../../utils/api-client';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const TENANT = 'agence-1';

function associationAvecBiens(nombre: number) {
  return {
    id: 'assoc-1',
    tenantId: TENANT,
    label: 'Indivision Kouadio',
    isActive: true,
    shares: [{ id: 'part-1', partnerAccountId: 'compte-1', partnerName: 'Mamadou Kouadio', sharePercent: 60 }],
    totalSharePercent: 60,
    companySharePercent: 40,
    properties: Array.from({ length: nombre }, (_, i) => ({
      propertyId: `bien-${i + 1}`,
      propertyLabel: `Terrain numéro ${String(i + 1).padStart(2, '0')}`
    }))
  };
}

function configurerGet(nombreBiensRattaches: number) {
  get.mockImplementation(async (url: string) => {
    if (/\/finance\/partnerships\/[^/]+$/.test(url)) {
      return { data: { data: associationAvecBiens(nombreBiensRattaches) } };
    }
    if (/\/properties(\?|$)/.test(url)) {
      return {
        data: {
          data: [
            { id: 'bien-1', title: 'Terrain numéro 01' },
            { id: 'bien-90', title: 'Extension villa — Bingerville' }
          ],
          pagination: { page: 1, limit: 20, total: 2, totalPages: 1 }
        }
      };
    }
    return { data: { data: null } };
  });
}

function mountFiche() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[`/tenant/${TENANT}/finance/associations/assoc-1`]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/associations/:partnershipId" element={<Association />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Fiche de l’association — sélecteur de bien à recherche distante', () => {
  it('interroge le serveur avec q et limit 20, et ne propose pas un bien déjà rattaché', async () => {
    configurerGet(1);
    const user = userEvent.setup({ delay: null });
    mountFiche();

    const champ = await screen.findByLabelText('Rattacher un bien existant', {}, { timeout: 8000 });
    await user.type(champ, 'Ext');

    await waitFor(
      () => {
        const urls = get.mock.calls.map(appel => String(appel[0]));
        expect(urls.some(u => /\/properties\?/.test(u) && u.includes('q=Ext') && u.includes('limit=20'))).toBe(true);
      },
      { timeout: 8000 }
    );

    const option = await screen.findByText('Extension villa — Bingerville', {}, { timeout: 8000 });
    const menu = option.closest('.ant-select-dropdown') as HTMLElement;
    expect(menu).not.toBeNull();
    // Le bien-1 est déjà rattaché : le serveur le renvoie, l'écran ne le propose pas.
    expect(within(menu).queryByText('Terrain numéro 01')).not.toBeInTheDocument();
  }, 20000);

  it('ne charge plus un référentiel de 100 biens au montage', async () => {
    configurerGet(1);
    mountFiche();
    await screen.findByLabelText('Rattacher un bien existant', {}, { timeout: 8000 });
    const urls = get.mock.calls.map(appel => String(appel[0]));
    expect(urls.some(u => u.includes('limit=100'))).toBe(false);
  }, 15000);
});

describe('Fiche de l’association — biens rattachés paginés localement', () => {
  it('affiche 20 biens sur 25, avec le compteur', async () => {
    configurerGet(25);
    mountFiche();

    expect(await screen.findByText('Terrain numéro 20', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('Terrain numéro 21')).not.toBeInTheDocument();
    expect(screen.getByText('1–20 sur 25')).toBeInTheDocument();
  }, 15000);
});
