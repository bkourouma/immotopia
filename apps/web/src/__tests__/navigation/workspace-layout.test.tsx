import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FinanceWorkspaceLayout } from '../../components/navigation/FinanceWorkspaceLayout';
import { SyndicWorkspaceLayout } from '../../components/navigation/SyndicWorkspaceLayout';
import type { FinanceWorkspaceFamily } from '../../navigation/finance-workspaces';

/**
 * Les routes de layout à onglets : un en-tête qui situe, une barre d'onglets
 * vers des routes EXISTANTES, puis l'écran réel dans `<Outlet/>`. La finance
 * n'a besoin d'aucun appel réseau ; le syndic va chercher le nom de la
 * copropriété, et doit continuer à le faire après la mise en commun du rendu
 * dans `<WorkspaceLayout>`.
 */

vi.mock('../../services/syndic-service', () => ({
  getSyndicate: vi.fn().mockResolvedValue({ name: 'Résidence Les Palmiers' })
}));

const TENANT = 't1';

function renderFinance(family: FinanceWorkspaceFamily, path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<FinanceWorkspaceLayout family={family} />}>
          <Route path="/tenant/:tenantId/finance/*" element={<p>Écran rendu</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('FinanceWorkspaceLayout', () => {
  it('situe l’écran : module, famille, puis l’écran réel', () => {
    renderFinance('suivi-chantiers', `/tenant/${TENANT}/finance/chantiers`);

    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Suivi des chantiers' })).toBeInTheDocument();
    expect(screen.getByText('Écran rendu')).toBeInTheDocument();
  });

  it('ordonne les onglets selon le flux, en liens vers les routes existantes de l’agence', () => {
    renderFinance('suivi-chantiers', `/tenant/${TENANT}/finance/chantiers`);

    const tablist = screen.getByRole('tablist', { name: 'Suivi des chantiers' });
    expect(tablist).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(tab => tab.textContent)).toEqual(['Chantiers', 'Tableau de bord', 'Baux de terrain']);
    expect(tabs.map(tab => tab.getAttribute('href'))).toEqual([
      `/tenant/${TENANT}/finance/chantiers`,
      `/tenant/${TENANT}/finance/tableau-de-bord-chantiers`,
      `/tenant/${TENANT}/finance/baux-terrain`
    ]);
  });

  it('garde l’onglet de la liste actif sur ses fiches de détail', () => {
    renderFinance('suivi-chantiers', `/tenant/${TENANT}/finance/chantiers/42/budget`);
    expect(screen.getByRole('tab', { name: 'Chantiers' })).toHaveAttribute('aria-selected', 'true');
  });

  it('distingue deux onglets dont l’un prolonge l’autre', () => {
    renderFinance('gestion-stock', `/tenant/${TENANT}/finance/stock/inventaire`);
    expect(screen.getByRole('tab', { name: 'Stock' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Inventaire' })).toHaveAttribute('aria-selected', 'true');
  });

  it('rattache les factures d’un fournisseur à l’onglet Fournisseurs', () => {
    renderFinance('fournisseurs-commandes', `/tenant/${TENANT}/finance/factures-fournisseurs?fournisseur=f1`);
    expect(screen.getByRole('tab', { name: 'Fournisseurs' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Balance fournisseurs' })).toHaveAttribute('aria-selected', 'false');
  });
});

describe('SyndicWorkspaceLayout — après la mise en commun du rendu', () => {
  it('affiche toujours le nom de la copropriété et les onglets de sa famille', async () => {
    render(
      <MemoryRouter initialEntries={['/tenant/t1/syndics/s1/charges']}>
        <Routes>
          <Route element={<SyndicWorkspaceLayout family="finances" />}>
            <Route path="/tenant/:tenantId/syndics/:syndicId/*" element={<p>Écran rendu</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Résidence Les Palmiers' })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Sections de la copropriété' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Budgets',
      'Appels de charges',
      'Suivi mensuel',
      'Quittances',
      'Recouvrement',
      'Trésorerie',
      'Comptabilité'
    ]);
    expect(screen.getByRole('tab', { name: 'Appels de charges' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Écran rendu')).toBeInTheDocument();
  });
});
