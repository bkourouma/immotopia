import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BalancePage } from '../../pages/finance/comptabilite/BalancePage';

/**
 * Balance générale de la comptabilité de l'agence — lot C : filtres dans
 * l'URL, lien vers le grand livre, pagination locale à 100 comptes.
 */

const getTrialBalance = vi.fn();
const getAccountingMeta = vi.fn();
const syncAccounting = vi.fn();
const downloadAccountingExport = vi.fn();

vi.mock('../../services/accounting-exports-service', () => ({
  getTrialBalance: (...a: unknown[]) => getTrialBalance(...a),
  getAccountingMeta: (...a: unknown[]) => getAccountingMeta(...a),
  syncAccounting: (...a: unknown[]) => syncAccounting(...a),
  downloadAccountingExport: (...a: unknown[]) => downloadAccountingExport(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

// La suite tourne lentement sur ce poste : délais explicites (cf. comptabilite.test.tsx).
configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 30000 });

const SYNC = { status: 'idle', lastSyncedAt: null };
const PERIODE = 'from=2026-01-01&to=2026-09-23';
const ZERO = {
  openingDebit: 0,
  openingCredit: 0,
  periodDebit: 0,
  periodCredit: 0,
  closingDebit: 0,
  closingCredit: 0
};

function compte(n: number) {
  return {
    id: `c-${n}`,
    accountClass: 4,
    accountNumber: String(400000 + n),
    accountName: `Compte test ${n}`,
    ...ZERO,
    periodDebit: 1000 + n,
    closingDebit: 1000 + n
  };
}

function reponse(overrides: Record<string, unknown> = {}) {
  return {
    from: '2026-01-01',
    to: '2026-09-23',
    lines: [compte(1), compte(2)],
    totals: { ...ZERO, periodDebit: 7_654_321, periodCredit: 7_654_321 },
    control: ZERO,
    isBalanced: true,
    sync: SYNC,
    ...overrides
  };
}

const Sonde: React.FC = () => {
  const { search } = useLocation();
  return <div data-testid="recherche">{search}</div>;
};

function renderPage(search = `?${PERIODE}`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[`/tenant/t1/finance/comptabilite/balance${search}`]}>
          <Routes>
            <Route
              path="/tenant/:tenantId/finance/comptabilite/balance"
              element={
                <>
                  <BalancePage />
                  <Sonde />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const dernierAppel = () => getTrialBalance.mock.calls[getTrialBalance.mock.calls.length - 1];

beforeEach(() => {
  vi.clearAllMocks();
  getTrialBalance.mockResolvedValue(reponse());
  getAccountingMeta.mockResolvedValue({ journals: [], years: [], minDate: null, maxDate: null, sync: SYNC });
  syncAccounting.mockResolvedValue(SYNC);
  downloadAccountingExport.mockResolvedValue({ blob: new Blob(['x']), filename: 'balance.xlsx' });
  window.URL.createObjectURL = vi.fn(() => 'blob:test');
  window.URL.revokeObjectURL = vi.fn();
});

describe('Balance générale — comptabilité de l’agence', () => {
  it('lit les filtres de l’URL pour appeler le service', async () => {
    renderPage(`?${PERIODE}&class=4&hideZero=1&q=client`);
    await screen.findByText('Compte test 1');
    expect(getTrialBalance).toHaveBeenCalledWith('t1', {
      from: '2026-01-01',
      to: '2026-09-23',
      accountClass: 4,
      hideZero: true,
      search: 'client'
    });
    expect(screen.getByPlaceholderText('Numéro ou intitulé')).toHaveValue('client');
    expect(screen.getByRole('checkbox', { name: /Masquer les comptes soldés/ })).toBeChecked();
  });

  it('URL existante ?class=4&hideZero=1&q=41 : barre pré-remplie et bon appel', async () => {
    renderPage(`?${PERIODE}&class=4&hideZero=1&q=41`);
    await screen.findByText('Compte test 1');
    expect(dernierAppel()[1]).toEqual({
      from: '2026-01-01',
      to: '2026-09-23',
      accountClass: 4,
      hideZero: true,
      search: '41'
    });
    expect(screen.getByPlaceholderText('Numéro ou intitulé')).toHaveValue('41');
    expect(screen.getByText('2 résultats')).toBeInTheDocument();
  });

  it('sans filtre : ni classe, ni comptes soldés masqués', async () => {
    renderPage();
    await screen.findByText('Compte test 1');
    expect(dernierAppel()[1]).toEqual({
      from: '2026-01-01',
      to: '2026-09-23',
      accountClass: undefined,
      hideZero: undefined,
      search: undefined
    });
  });

  it('case « Masquer les comptes soldés » : paramètre hideZero', async () => {
    renderPage();
    await screen.findByText('Compte test 1');
    await userEvent.click(screen.getByRole('checkbox', { name: /Masquer les comptes soldés/ }));
    await waitFor(() => expect(dernierAppel()[1]).toMatchObject({ hideZero: true }));
    expect(screen.getByTestId('recherche').textContent).toContain('hideZero=1');
  });

  it('filtre classe : paramètre accountClass', async () => {
    renderPage();
    await screen.findByText('Compte test 1');
    fireEvent.mouseDown(within(screen.getByRole('search')).getByRole('combobox'));
    fireEvent.click(await screen.findByText('Classe 7'));
    await waitFor(() => expect(dernierAppel()[1]).toMatchObject({ accountClass: 7 }));
    expect(screen.getByTestId('recherche').textContent).toContain('class=7');
  });

  it('recherche numéro ou intitulé validée par Entrée', async () => {
    renderPage();
    await screen.findByText('Compte test 1');
    await userEvent.type(screen.getByPlaceholderText('Numéro ou intitulé'), 'banque{Enter}');
    expect(screen.getByTestId('recherche').textContent).toContain('q=banque');
    await waitFor(() => expect(dernierAppel()[1]).toMatchObject({ search: 'banque' }));
  });

  it('le numéro de compte renvoie vers le grand livre sur la même période', async () => {
    renderPage();
    const lien = await screen.findByRole('link', { name: '400001' });
    expect(lien).toHaveAttribute(
      'href',
      '/tenant/t1/finance/comptabilite/grand-livre?account=400001&from=2026-01-01&to=2026-09-23'
    );
  });

  it('affiche les totaux du filtre', async () => {
    renderPage();
    await screen.findByText('Compte test 1');
    const groupe = screen.getByRole('group', { name: 'Total' });
    expect(groupe.textContent).toMatch(/7\s?654\s?321/);
  });

  it('alerte quand la balance est déséquilibrée', async () => {
    getTrialBalance.mockResolvedValue(reponse({ isBalanced: false }));
    renderPage();
    expect(await screen.findByText("La balance n'est pas équilibrée : signalez-le à l'éditeur.")).toBeInTheDocument();
  });

  it('pas d’alerte quand la balance est équilibrée', async () => {
    renderPage();
    await screen.findByText('Compte test 1');
    expect(screen.queryByText(/n'est pas équilibrée/)).not.toBeInTheDocument();
  });

  it('pagination locale : 100 comptes par page', async () => {
    getTrialBalance.mockResolvedValue(reponse({ lines: Array.from({ length: 250 }, (_, i) => compte(i + 1)) }));
    renderPage();
    await screen.findByText('Compte test 1');
    expect(screen.getByText('Compte test 100')).toBeInTheDocument();
    expect(screen.queryByText('Compte test 101')).not.toBeInTheDocument();
    // Une seule lecture : la page 2 est locale.
    await userEvent.click(await screen.findByRole('button', { name: 'Page 2' }));
    expect(await screen.findByText('Compte test 101')).toBeInTheDocument();
    expect(screen.queryByText('Compte test 1')).not.toBeInTheDocument();
    expect(getTrialBalance).toHaveBeenCalledTimes(1);
  });

  it('exporte avec class, hideZero et search', async () => {
    renderPage(`?${PERIODE}&class=4&hideZero=1&q=client`);
    await screen.findByText('Compte test 1');
    await userEvent.click(screen.getByRole('button', { name: /Exporter en CSV/ }));
    await waitFor(() => expect(downloadAccountingExport).toHaveBeenCalled());
    const appel = downloadAccountingExport.mock.calls[0];
    expect(appel.slice(0, 3)).toEqual(['t1', 'trial-balance', 'csv']);
    expect(appel[3]).toEqual({
      from: '2026-01-01',
      to: '2026-09-23',
      class: '4',
      hideZero: 'true',
      search: 'client'
    });
    expect(screen.getAllByRole('button', { name: /Exporter/ })).toHaveLength(2);
  });

  it('aucun résultat avec critère : propose d’effacer les critères', async () => {
    getTrialBalance.mockResolvedValue(reponse({ lines: [] }));
    renderPage(`?${PERIODE}&q=zzz`);
    expect(await screen.findByText('0 résultat')).toBeInTheDocument();
    const effacer = await screen.findAllByRole('button', { name: 'Effacer les critères' });
    await userEvent.click(effacer[effacer.length - 1]);
    await waitFor(() => expect(screen.getByTestId('recherche').textContent).not.toContain('q=zzz'));
  });

  it('erreur : message et Réessayer', async () => {
    getTrialBalance.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    expect(await screen.findByText('Impossible de charger la balance générale.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Compte test 1')).toBeInTheDocument();
  });

  it('état vide', async () => {
    getTrialBalance.mockResolvedValue(reponse({ lines: [] }));
    renderPage();
    expect(await screen.findByText('Aucune ligne dans la balance générale.')).toBeInTheDocument();
  });
});
