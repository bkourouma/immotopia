import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { FinanceWorkspaceLayout } from '../../components/navigation/FinanceWorkspaceLayout';
import {
  DECLARATIONS_CHANGED_EVENT,
  SyndicWorkspaceLayout,
  syndicSwitchPath
} from '../../components/navigation/SyndicWorkspaceLayout';
import type { FinanceWorkspaceFamily } from '../../navigation/finance-workspaces';
import { listSyndicates } from '../../services/syndic-service';

/**
 * Les routes de layout à onglets : un en-tête qui situe, une barre d'onglets
 * vers des routes EXISTANTES, puis l'écran réel dans `<Outlet/>`. La finance
 * n'a besoin d'aucun appel réseau ; le syndic va chercher le nom de la
 * copropriété, et doit continuer à le faire après la mise en commun du rendu
 * dans `<WorkspaceLayout>`.
 */

vi.mock('../../services/syndic-service', () => ({
  getSyndicate: vi.fn().mockResolvedValue({ name: 'Résidence Les Palmiers' }),
  listSyndicates: vi.fn().mockResolvedValue([{ id: 's1', name: 'Résidence Les Palmiers' }])
}));

const mockListDeclarations = vi.fn();
vi.mock('../../services/syndic-declared-payment-service', () => ({
  listSyndicDeclarations: (...a: unknown[]) => mockListDeclarations(...a)
}));

// Droits d'abonnement : contrôle non appliqué, tous les onglets sont visibles.
vi.mock('../../services/entitlements-service', () => ({
  getMenuEntitlements: vi
    .fn()
    .mockResolvedValue({ moduleAccess: {}, readOnly: false, phase: 'ACTIVE', enforcement: 'off' })
}));

const mockListSyndicates = listSyndicates as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockListDeclarations.mockReset();
  mockListDeclarations.mockResolvedValue({ counts: { pending: 0, overdue: 0, suspectedDuplicate: 0 } });
});

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
  it('situe l’écran : module, famille, puis l’écran réel', async () => {
    renderFinance('suivi-chantiers', `/tenant/${TENANT}/finance/chantiers`);

    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Suivi des chantiers' })).toBeInTheDocument();
    expect(screen.getByText('Écran rendu')).toBeInTheDocument();
  });

  it('ordonne les onglets selon le flux, en liens vers les routes existantes de l’agence', async () => {
    renderFinance('suivi-chantiers', `/tenant/${TENANT}/finance/chantiers`);

    const tablist = await screen.findByRole('tablist', { name: 'Suivi des chantiers' });
    expect(tablist).toBeInTheDocument();
    await screen.findAllByRole('tab');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(tab => tab.textContent)).toEqual(['Chantiers', 'Tableau de bord', 'Baux de terrain']);
    expect(tabs.map(tab => tab.getAttribute('href'))).toEqual([
      `/tenant/${TENANT}/finance/chantiers`,
      `/tenant/${TENANT}/finance/tableau-de-bord-chantiers`,
      `/tenant/${TENANT}/finance/baux-terrain`
    ]);
  });

  it('garde l’onglet de la liste actif sur ses fiches de détail', async () => {
    renderFinance('suivi-chantiers', `/tenant/${TENANT}/finance/chantiers/42/budget`);
    expect(await screen.findByRole('tab', { name: 'Chantiers' })).toHaveAttribute('aria-selected', 'true');
  });

  it('distingue deux onglets dont l’un prolonge l’autre', async () => {
    renderFinance('gestion-stock', `/tenant/${TENANT}/finance/stock/inventaire`);
    expect(await screen.findByRole('tab', { name: 'Stock' })).toHaveAttribute('aria-selected', 'false');
    expect(await screen.findByRole('tab', { name: 'Inventaire' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Gestion du stock : huit onglets dans l’ordre du flux (lot 040, ecrans §2.2 ; lot 041 après « Contrôle »)', async () => {
    renderFinance('gestion-stock', `/tenant/${TENANT}/finance/stock`);
    await screen.findByRole('tablist', { name: 'Gestion du stock' });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(tab => tab.textContent)).toEqual([
      'Stock',
      'Magasin',
      'Inventaire',
      'Preneurs',
      'Contrôle',
      'Comptages terrain',
      'WhatsApp',
      'Articles et lieux'
    ]);
    expect(tabs.map(tab => tab.getAttribute('href'))).toEqual([
      `/tenant/${TENANT}/finance/stock`,
      `/tenant/${TENANT}/finance/stock/magasin`,
      `/tenant/${TENANT}/finance/stock/inventaire`,
      `/tenant/${TENANT}/finance/stock/preneurs`,
      `/tenant/${TENANT}/finance/stock/controle`,
      `/tenant/${TENANT}/finance/stock/comptages-terrain`,
      `/tenant/${TENANT}/finance/stock/whatsapp`,
      `/tenant/${TENANT}/finance/stock/parametrage`
    ]);
  });

  it('allume « Magasin » et non « Stock » sur /finance/stock/magasin', async () => {
    renderFinance('gestion-stock', `/tenant/${TENANT}/finance/stock/magasin`);
    expect(await screen.findByRole('tab', { name: 'Magasin' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Stock' })).toHaveAttribute('aria-selected', 'false');
  });

  it('allume « Contrôle » sur /finance/stock/controle et « Preneurs » sur /finance/stock/preneurs', async () => {
    const { unmount } = renderFinance('gestion-stock', `/tenant/${TENANT}/finance/stock/controle?alerte=a1`);
    expect(await screen.findByRole('tab', { name: 'Contrôle' })).toHaveAttribute('aria-selected', 'true');
    unmount();
    renderFinance('gestion-stock', `/tenant/${TENANT}/finance/stock/preneurs`);
    expect(await screen.findByRole('tab', { name: 'Preneurs' })).toHaveAttribute('aria-selected', 'true');
  });

  it('rattache les factures d’un fournisseur à l’onglet Fournisseurs', async () => {
    renderFinance('fournisseurs-commandes', `/tenant/${TENANT}/finance/factures-fournisseurs?fournisseur=f1`);
    expect(await screen.findByRole('tab', { name: 'Fournisseurs' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('tab', { name: 'Balance fournisseurs' })).toHaveAttribute('aria-selected', 'false');
  });
});

describe('SyndicWorkspaceLayout — compteur des paiements déclarés (spec 047, R32)', () => {
  const renderPayments = () =>
    render(
      <MemoryRouter initialEntries={['/tenant/t1/syndics/s1/paiements-en-ligne']}>
        <Routes>
          <Route element={<SyndicWorkspaceLayout family="finances" />}>
            <Route path="/tenant/:tenantId/syndics/:syndicId/*" element={<p>Écran rendu</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

  beforeEach(() => {
    mockListDeclarations.mockReset();
    mockListDeclarations.mockResolvedValue({ counts: { pending: 0, overdue: 0, suspectedDuplicate: 0 } });
  });

  it('affiche le nombre de déclarations en attente sur l’onglet « Paiements » seulement', async () => {
    mockListDeclarations.mockResolvedValue({ counts: { pending: 3, overdue: 0, suspectedDuplicate: 0 } });
    renderPayments();
    expect(await screen.findByTestId('tab-badge-paiements-en-ligne')).toHaveTextContent('3');
    expect(screen.getAllByTestId(/^tab-badge-/)).toHaveLength(1);
    expect(mockListDeclarations).toHaveBeenCalledWith('t1', 's1', { status: 'PENDING', limit: 1 });
  });

  it('aucune pastille à zéro, ni quand la lecture échoue (droit absent)', async () => {
    mockListDeclarations.mockResolvedValue({ counts: { pending: 0, overdue: 0, suspectedDuplicate: 0 } });
    const { unmount } = renderPayments();
    await screen.findByRole('tab', { name: 'Paiements' });
    await waitFor(() => expect(mockListDeclarations).toHaveBeenCalled());
    expect(screen.queryByTestId(/^tab-badge-/)).not.toBeInTheDocument();
    unmount();

    mockListDeclarations.mockRejectedValue(new Error('403'));
    renderPayments();
    await screen.findByRole('tab', { name: 'Paiements' });
    await waitFor(() => expect(mockListDeclarations).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId(/^tab-badge-/)).not.toBeInTheDocument();
  });

  it('se relit quand la file change (événement de l’onglet Paiements)', async () => {
    mockListDeclarations.mockResolvedValue({ counts: { pending: 2, overdue: 0, suspectedDuplicate: 0 } });
    renderPayments();
    expect(await screen.findByTestId('tab-badge-paiements-en-ligne')).toHaveTextContent('2');
    mockListDeclarations.mockResolvedValue({ counts: { pending: 1, overdue: 0, suspectedDuplicate: 0 } });
    window.dispatchEvent(new Event(DECLARATIONS_CHANGED_EVENT));
    await waitFor(() => expect(screen.getByTestId('tab-badge-paiements-en-ligne')).toHaveTextContent('1'));
  });

  it('les autres familles n’interrogent pas les déclarations', async () => {
    render(
      <MemoryRouter initialEntries={['/tenant/t1/syndics/s1/lots']}>
        <Routes>
          <Route element={<SyndicWorkspaceLayout family="copropriete" />}>
            <Route path="/tenant/:tenantId/syndics/:syndicId/*" element={<p>Écran rendu</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    await screen.findByRole('tab', { name: 'Lots' });
    expect(mockListDeclarations).not.toHaveBeenCalled();
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
      'Programmation',
      'Suivi mensuel',
      'Quittances',
      'Recouvrement',
      'Trésorerie',
      'Paiements',
      'Comptabilité'
    ]);
    expect(screen.getByRole('tab', { name: 'Appels de charges' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Écran rendu')).toBeInTheDocument();
  });

  afterEach(() => {
    mockListSyndicates.mockClear();
    mockListSyndicates.mockResolvedValue([{ id: 's1', name: 'Résidence Les Palmiers' }]);
  });

  it('n’affiche aucun sélecteur quand l’agence n’a qu’une seule copropriété', async () => {
    mockListSyndicates.mockResolvedValueOnce([{ id: 's1', name: 'Résidence Les Palmiers' }]);

    render(
      <MemoryRouter initialEntries={['/tenant/t1/syndics/s1/lots']}>
        <Routes>
          <Route element={<SyndicWorkspaceLayout family="copropriete" />}>
            <Route path="/tenant/:tenantId/syndics/:syndicId/*" element={<p>Écran rendu</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: 'Résidence Les Palmiers' });
    expect(screen.queryByRole('combobox', { name: 'Changer de copropriété' })).not.toBeInTheDocument();
  });

  it('affiche un sélecteur dès deux copropriétés et navigue au choix, en gardant l’onglet courant', async () => {
    mockListSyndicates.mockResolvedValueOnce([
      { id: 's1', name: 'Résidence Les Palmiers' },
      { id: 's2', name: 'Résidence Les Rôniers' }
    ]);
    const user = userEvent.setup();

    function CurrentScreen() {
      const { syndicId } = useParams<{ syndicId: string }>();
      const { pathname } = useLocation();
      return (
        <p>
          Écran rendu pour {syndicId} ({pathname})
        </p>
      );
    }

    render(
      <MemoryRouter initialEntries={['/tenant/t1/syndics/s1/lots']}>
        <Routes>
          <Route element={<SyndicWorkspaceLayout family="copropriete" />}>
            <Route path="/tenant/:tenantId/syndics/:syndicId/*" element={<CurrentScreen />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText(/Écran rendu pour s1/);

    const select = await screen.findByRole('combobox', { name: 'Changer de copropriété' });
    await user.click(select);
    const option = await screen.findByText('Résidence Les Rôniers');
    await user.click(option);

    expect(await screen.findByText('Écran rendu pour s2 (/tenant/t1/syndics/s2/lots)')).toBeInTheDocument();
  });
});

describe('syndicSwitchPath', () => {
  const TENANT_ID = 't1';

  it('garde la fiche (aucun segment après l’identifiant)', () => {
    expect(syndicSwitchPath('/tenant/t1/syndics/s1', TENANT_ID, 's1', 's2')).toBe('/tenant/t1/syndics/s2');
  });

  it('garde le même onglet', () => {
    expect(syndicSwitchPath('/tenant/t1/syndics/s1/lots', TENANT_ID, 's1', 's2')).toBe('/tenant/t1/syndics/s2/lots');
  });

  it('abandonne une sous-fiche qui n’existe pas dans l’autre copropriété', () => {
    expect(syndicSwitchPath('/tenant/t1/syndics/s1/lots/lot-42/compte', TENANT_ID, 's1', 's2')).toBe(
      '/tenant/t1/syndics/s2/lots'
    );
    expect(syndicSwitchPath('/tenant/t1/syndics/s1/assemblees/ag-1', TENANT_ID, 's1', 's2')).toBe(
      '/tenant/t1/syndics/s2/assemblees'
    );
  });

  it('retombe sur la fiche pour un chemin inattendu', () => {
    expect(syndicSwitchPath('/autre-chose', TENANT_ID, 's1', 's2')).toBe('/tenant/t1/syndics/s2');
  });
});
