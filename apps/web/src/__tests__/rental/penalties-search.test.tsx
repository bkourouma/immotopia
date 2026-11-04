import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Penalties } from '../../pages/rental/Penalties';

/** Pénalités : recherche multicritères LOCALE (l'API rend toute la liste du bail). */

const listPenalties = vi.hoisted(() => vi.fn());

vi.mock('../../services/rental-service', () => ({
  listPenalties: (...a: unknown[]) => listPenalties(...a),
  calculatePenalties: vi.fn(),
  updatePenalty: vi.fn(),
  deletePenalty: vi.fn(),
  uploadPenaltyJustification: vi.fn(),
  downloadPenaltyJustification: vi.fn()
}));
vi.mock('../../utils/save-blob', () => ({ saveBlob: vi.fn() }));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function penalite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pen-1',
    tenant_id: 'agence-1',
    installment_id: 'ech-1',
    amount: 100_000,
    currency: 'XOF',
    days_late: 10,
    calculated_at: '2026-04-15T00:00:00.000Z',
    adjusted_amount: null,
    adjustment_reason: null,
    created_at: '',
    updated_at: '',
    ...overrides
  };
}

const PEN_A = penalite({ id: 'a', days_late: 10, amount: 100_000 });
const PEN_B = penalite({
  id: 'b',
  days_late: 3,
  amount: 20_000,
  calculated_at: '2026-06-02T00:00:00.000Z',
  adjusted_amount: 20_000,
  adjustment_reason: 'Geste commercial exceptionnel'
});

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function renderPage(initial = '/tenant/agence-1/rental/penalties', leaseId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route path="/tenant/:tenantId/rental/penalties" element={<Penalties leaseId={leaseId} />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const T = { timeout: 8000 };

beforeEach(() => {
  listPenalties.mockReset();
  listPenalties.mockResolvedValue({ success: true, data: [PEN_A, PEN_B] });
});

describe('Pénalités : recherche multicritères locale', () => {
  it('affiche la barre et le compteur sans rien envoyer de plus au service', async () => {
    renderPage();
    expect(await screen.findByText('10 jours', undefined, T)).toBeInTheDocument();
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByText('2 résultats')).toBeInTheDocument();
    expect(listPenalties.mock.calls[0][1]).not.toHaveProperty('search');
  });

  it('filtre les lignes sur la raison, sans casse ni accent', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('10 jours', undefined, T);
    await user.type(screen.getByPlaceholderText('Raison, justificatif, jours de retard…'), 'GESTE COMMERCIAL');
    await vi.waitFor(() => expect(screen.queryByText('10 jours')).not.toBeInTheDocument(), T);
    expect(screen.getByText('3 jours')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('q=');
  });

  it('applique le critère « Ajustée » d’une URL partagée', async () => {
    renderPage('/tenant/agence-1/rental/penalties?ajustee=0');
    await screen.findByText('10 jours', undefined, T);
    expect(screen.queryByText('3 jours')).not.toBeInTheDocument();
  });

  it('applique une période de calcul', async () => {
    renderPage('/tenant/agence-1/rental/penalties?periodeFrom=2026-06-01&periodeTo=2026-06-30');
    await screen.findByText('3 jours', undefined, T);
    expect(screen.queryByText('10 jours')).not.toBeInTheDocument();
  });

  it('applique un montant retenu maximal', async () => {
    renderPage('/tenant/agence-1/rental/penalties?montantMax=50000');
    await screen.findByText('3 jours', undefined, T);
    expect(screen.queryByText('10 jours')).not.toBeInTheDocument();
  });

  it('en onglet de bail : préfixe pen et zone de recherche nommée', async () => {
    renderPage('/tenant/agence-1/rental/penalties?pen.ajustee=1', 'bail-9');
    await screen.findByText('3 jours', undefined, T);
    expect(screen.queryByText('10 jours')).not.toBeInTheDocument();
    expect(screen.getByRole('search', { name: 'Rechercher dans les pénalités' })).toBeInTheDocument();
    expect(listPenalties).toHaveBeenCalledWith('agence-1', { leaseId: 'bail-9' });
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    renderPage('/tenant/agence-1/rental/penalties?q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('10 jours', undefined, T)).toBeInTheDocument();
  });
});
