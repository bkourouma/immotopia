import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { PaymentDeclarationsList } from '../../components/rental/PaymentDeclarationsList';

/** Déclarations de paiement — recherche multicritères (serveur), préfixe `decl`. */

const listPaymentDeclarations = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../services/rental-service', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/rental-service')>()),
  listPaymentDeclarations: (...a: unknown[]) => listPaymentDeclarations(...a)
}));

vi.mock('../../components/finance/TreasuryAccountSelector', () => ({ TreasuryAccountSelector: () => null }));

const T = { timeout: 8000 };

const DECLARATION = {
  id: 'decl-1',
  created_at: '2026-04-01T00:00:00.000Z',
  payment_date: '2026-04-01T00:00:00.000Z',
  amount: 150000,
  payment_method: 'MOBILE_MONEY',
  status: 'PENDING',
  reference: 'OM-998877',
  lease: { lease_number: 'BAIL-1', property: { title: 'Villa Cocody' } },
  declarer: { user: { fullName: 'Awa Konan' } }
};

const reponse = (items: unknown[]) => ({
  success: true,
  data: items,
  pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 }
});

function Url() {
  return <div data-testid="url">{decodeURIComponent(useLocation().search)}</div>;
}

function renderList(initial = '/x', leaseId?: string) {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[initial]}>
        <Url />
        <PaymentDeclarationsList tenantId="agence-1" leaseId={leaseId} />
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  listPaymentDeclarations.mockReset();
  listPaymentDeclarations.mockResolvedValue(reponse([DECLARATION]));
});

describe('Déclarations : recherche multicritères', () => {
  it('charge la première page sans critère, toutes les déclarations (statut ALL envoyé)', async () => {
    renderList();
    expect(await screen.findByText('OM-998877', undefined, T)).toBeInTheDocument();
    expect(listPaymentDeclarations).toHaveBeenCalledWith('agence-1', { status: 'ALL', page: 1, limit: 20 });
    expect(screen.getByRole('search', { name: 'Rechercher dans les déclarations' })).toBeInTheDocument();
  });

  it('envoie la saisie à l’API après le debounce et la met dans l’URL sous le préfixe decl', async () => {
    const user = userEvent.setup();
    renderList('/x', 'bail-1');
    await screen.findByText('OM-998877', undefined, T);
    await user.type(
      within(screen.getByRole('search')).getByPlaceholderText('Référence, n° de bail, bien, déclarant…'),
      'om-99'
    );
    await vi.waitFor(
      () =>
        expect(listPaymentDeclarations).toHaveBeenLastCalledWith('agence-1', {
          search: 'om-99',
          status: 'ALL',
          leaseId: 'bail-1',
          page: 1,
          limit: 20
        }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('decl.q=om-99');
  });

  it('applique statut, période et méthode d’une URL partagée', async () => {
    renderList('/x?decl.status=PENDING&decl.periodeFrom=2026-04-01&decl.periodeTo=2026-04-30&decl.method=CASH');
    await screen.findByText('OM-998877', undefined, T);
    expect(listPaymentDeclarations).toHaveBeenLastCalledWith('agence-1', {
      status: 'PENDING',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      method: 'CASH',
      page: 1,
      limit: 20
    });
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    listPaymentDeclarations.mockImplementation(async (_t: string, params: Record<string, unknown>) =>
      reponse(params.search ? [] : [DECLARATION])
    );
    renderList('/x?decl.q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('OM-998877', undefined, T)).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).not.toContain('decl.q=');
  });
});
