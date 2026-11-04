import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import TenantDeposit from '../../pages/TenantPortal/Deposit';

/** Portail locataire — dépôt de garantie : mouvements reçus en entier, recherche locale. */

const getDepositInfo = vi.fn();

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../services/tenantPortalService', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/tenantPortalService')>();
  return {
    tenantPortalService: {
      ...actual.tenantPortalService,
      getDepositInfo: (...a: unknown[]) => getDepositInfo(...a)
    }
  };
});

const T = { timeout: 8000 };

function Adresse() {
  const location = useLocation();
  return <span data-testid="adresse">{`${location.pathname}${location.search}`}</span>;
}

function mount(url = '/tenant/deposit') {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[url]}>
        <Adresse />
        <Routes>
          <Route path="/tenant/deposit" element={<TenantDeposit />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

const adresse = () => decodeURIComponent(screen.getByTestId('adresse').textContent ?? '');

const mouvement = (id: string, type: string, note: string, createdAt: string) => ({
  id,
  type,
  amount: 100_000,
  currency: 'XOF',
  note,
  createdAt,
  payment: null,
  installment: null,
  createdBy: null
});

beforeEach(() => {
  vi.clearAllMocks();
  getDepositInfo.mockResolvedValue({
    data: {
      success: true,
      data: {
        deposit: {
          id: 'dep-1',
          targetAmount: 200_000,
          collectedAmount: 100_000,
          heldAmount: 0,
          refundedAmount: 0,
          forfeitedAmount: 0,
          currency: 'XOF',
          lease: { id: 'l1', lease_number: 'BAIL-1' }
        },
        currentHeldAmount: 0,
        movements: [
          mouvement('m1', 'COLLECT', 'Première tranche', '2026-02-10T09:00:00.000Z'),
          mouvement('m2', 'REFUND', 'Solde remboursé', '2026-09-10T09:00:00.000Z')
        ]
      }
    }
  });
});

describe('Portail locataire — recherche des mouvements du dépôt', () => {
  it('filtre en local sur la note et met la saisie dans l’adresse', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Première tranche', {}, T);
    expect(screen.getByText('Solde remboursé')).toBeInTheDocument();

    await user.type(within(screen.getByRole('search')).getByPlaceholderText('Note, paiement, échéance…'), 'REMBOURSE');

    await vi.waitFor(() => expect(screen.queryByText('Première tranche')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Solde remboursé')).toBeInTheDocument();
    expect(adresse()).toContain('q=REMBOURSE');
    expect(getDepositInfo).toHaveBeenCalledTimes(1);
  });

  it('applique le type et la période d’une adresse partagée', async () => {
    mount('/tenant/deposit?type=COLLECT&dateFrom=2026-01-01&dateTo=2026-03-31');
    await screen.findByText('Première tranche', {}, T);
    expect(screen.queryByText('Solde remboursé')).not.toBeInTheDocument();
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    mount('/tenant/deposit?q=zzz');

    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', {}, T)).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);

    expect(await screen.findByText('Première tranche', {}, T)).toBeInTheDocument();
    expect(screen.getByText('Solde remboursé')).toBeInTheDocument();
    expect(adresse()).not.toContain('q=');
  });
});
