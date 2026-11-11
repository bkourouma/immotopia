import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MandantsPage } from '../../pages/finance/comptabilite/MandantsPage';

/**
 * Mandants de la comptabilité de l'agence — lot C : liste paginée des
 * propriétaires, détail chargé à la demande, balance auxiliaire.
 *
 * Le mock du service couvre CHAQUE export qu'utilisent la page et le cadre
 * commun (méta, synchronisation, export, clé du « non réparti »).
 */

const getMandantOwners = vi.fn();
const getMandantOwnerLedger = vi.fn();
const getMandantTrialBalance = vi.fn();
const getAccountingMeta = vi.fn();
const syncAccounting = vi.fn();
const downloadAccountingExport = vi.fn();

vi.mock('../../services/accounting-exports-service', () => ({
  UNASSIGNED_OWNER: 'non-reparti',
  getMandantOwners: (...a: unknown[]) => getMandantOwners(...a),
  getMandantOwnerLedger: (...a: unknown[]) => getMandantOwnerLedger(...a),
  getMandantTrialBalance: (...a: unknown[]) => getMandantTrialBalance(...a),
  getAccountingMeta: (...a: unknown[]) => getAccountingMeta(...a),
  syncAccounting: (...a: unknown[]) => syncAccounting(...a),
  downloadAccountingExport: (...a: unknown[]) => downloadAccountingExport(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

// La suite tourne lentement sur ce poste : délais explicites (cf. comptabilite-journal.test.tsx).
configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 30000 });

const SYNC = { status: 'idle', lastSyncedAt: null };
const PERIODE = 'from=2026-01-01&to=2026-09-23';
const CONTROLE_OK = { auxiliaryBalance: 1_500_000, generalBalance: 1_500_000, difference: 0, isBalanced: true };

function proprietaire(n: number, overrides: Record<string, unknown> = {}) {
  return {
    ownerKey: `own-${n}`,
    thirdPartyAccountId: `own-${n}`,
    ownerLabel: `Propriétaire ${n}`,
    openingBalance: 100_000,
    totalDebit: 200_000,
    totalCredit: 700_000,
    closingBalance: 600_000,
    ...overrides
  };
}

function reponseListe(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'owners',
    items: [proprietaire(1), proprietaire(2)],
    total: 120,
    page: 1,
    limit: 50,
    from: '2026-01-01',
    to: '2026-09-23',
    accountNumber: '467100',
    accountName: 'Fonds des mandants',
    totals: { openingBalance: 111_000, totalDebit: 222_000, totalCredit: 888_000, closingBalance: 777_000 },
    control: CONTROLE_OK,
    sync: SYNC,
    ...overrides
  };
}

function ligne(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `lig-${n}`,
    date: '2026-02-03',
    journalCode: 'OP-GENERAL',
    reference: `PIECE-${n}`,
    label: `Loyer reversé ${n}`,
    nature: 'CURRENT',
    natureLabel: 'Compte courant',
    debit: 0,
    credit: 300_000,
    balance: 300_000 * n,
    ...overrides
  };
}

function reponseDetail(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'owner',
    owner: { ownerKey: 'own-1', thirdPartyAccountId: 'own-1', ownerLabel: 'Propriétaire 1' },
    natures: [
      {
        nature: 'CURRENT',
        natureLabel: 'Compte courant',
        openingBalance: 10_000,
        totalDebit: 0,
        totalCredit: 300_000,
        closingBalance: 310_000
      },
      {
        nature: 'DEPOSIT',
        natureLabel: 'Dépôt de garantie',
        openingBalance: 0,
        totalDebit: 0,
        totalCredit: 450_000,
        closingBalance: 450_000
      }
    ],
    items: [ligne(1), ligne(2, { nature: 'DEPOSIT', natureLabel: 'Dépôt de garantie' })],
    total: 250,
    page: 1,
    limit: 100,
    from: '2026-01-01',
    to: '2026-09-23',
    sync: SYNC,
    ...overrides
  };
}

function reponseBalance(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-09-23',
    items: [
      {
        ownerKey: 'own-1',
        thirdPartyAccountId: 'own-1',
        ownerLabel: 'Propriétaire 1',
        current: 310_000,
        deposit: 450_000,
        unallocated: 0,
        total: 760_000
      },
      {
        ownerKey: 'non-reparti',
        thirdPartyAccountId: null,
        ownerLabel: 'Sans tiers',
        current: 0,
        deposit: 0,
        unallocated: 40_000,
        total: 40_000
      }
    ],
    total: 2,
    page: 1,
    limit: 50,
    accountNumber: '467100',
    accountName: 'Fonds des mandants',
    totals: { current: 310_000, deposit: 450_000, unallocated: 40_000, total: 800_000 },
    control: CONTROLE_OK,
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
        <MemoryRouter initialEntries={[`/tenant/t1/finance/comptabilite/mandants${search}`]}>
          <Routes>
            <Route
              path="/tenant/:tenantId/finance/comptabilite/mandants"
              element={
                <>
                  <MandantsPage />
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

const dernier = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls[mock.mock.calls.length - 1];
const url = () => screen.getByTestId('recherche').textContent ?? '';

beforeEach(() => {
  vi.clearAllMocks();
  getMandantOwners.mockResolvedValue(reponseListe());
  getMandantOwnerLedger.mockResolvedValue(reponseDetail());
  getMandantTrialBalance.mockResolvedValue(reponseBalance());
  getAccountingMeta.mockResolvedValue({ journals: [], years: [2026], minDate: null, maxDate: null, sync: SYNC });
  syncAccounting.mockResolvedValue(SYNC);
  downloadAccountingExport.mockResolvedValue({ blob: new Blob(['x']), filename: 'mandants.xlsx' });
  window.URL.createObjectURL = vi.fn(() => 'blob:test');
  window.URL.revokeObjectURL = vi.fn();
});

describe('Mandants — grand livre auxiliaire', () => {
  it('liste les propriétaires et leurs soldes, sans charger aucun détail', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Propriétaire 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Propriétaire 2' })).toBeInTheDocument();
    expect(dernier(getMandantOwners)[1]).toEqual({
      from: '2026-01-01',
      to: '2026-09-23',
      page: 1,
      limit: 50
    });
    expect(getMandantOwnerLedger).not.toHaveBeenCalled();
    // La barre commune : zone de recherche nommée, champ libre, compteur du total serveur.
    const barre = screen.getByRole('search', { name: 'Rechercher un mandant' });
    expect(within(barre).getByPlaceholderText('Nom du mandant')).toBeInTheDocument();
    expect(within(barre).getByText(/120 résultats/)).toBeInTheDocument();
    const totaux = screen.getByTestId('totaux-mandants');
    expect(totaux.textContent).toMatch(/777\s?000/);
    expect(totaux.textContent).toContain('Solde de clôture');
  });

  it('page hors bornes recadrée sur la dernière page (liste des propriétaires)', async () => {
    renderPage(`?${PERIODE}&page=9`);
    await waitFor(() => expect(dernier(getMandantOwners)[1]).toMatchObject({ page: 3, limit: 50 }));
    await waitFor(() => expect(url()).toContain('page=3'));
  });

  it('page-lignes hors bornes recadrée sur la dernière page du détail', async () => {
    renderPage(`?${PERIODE}&owner=own-1&page-lignes=9`);
    await waitFor(() => expect(dernier(getMandantOwnerLedger)[1]).toMatchObject({ page: 3, limit: 100 }));
    await waitFor(() => expect(url()).toContain('page-lignes=3'));
  });

  it('changer de page appelle la page 2', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Propriétaire 1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(dernier(getMandantOwners)[1]).toMatchObject({ page: 2, limit: 50 }));
    expect(url()).toContain('page=2');
  });

  it('la recherche transmet search et remet la page à 1', async () => {
    renderPage(`?${PERIODE}&page=2`);
    await screen.findByRole('button', { name: 'Propriétaire 1' });
    await userEvent.type(screen.getByLabelText('Rechercher'), 'Kon{Enter}');
    await waitFor(() => expect(dernier(getMandantOwners)[1]).toMatchObject({ search: 'Kon', page: 1 }));
    expect(url()).toContain('q=Kon');
    expect(url()).not.toContain('page=');
  });

  it('une URL avec q pré-remplit la barre et part à l’API', async () => {
    renderPage(`?${PERIODE}&q=dupont&page=2`);
    await screen.findByRole('button', { name: 'Propriétaire 1' });
    expect(screen.getByLabelText('Rechercher')).toHaveValue('dupont');
    expect(dernier(getMandantOwners)[1]).toEqual({
      from: '2026-01-01',
      to: '2026-09-23',
      search: 'dupont',
      page: 2,
      limit: 50
    });
  });

  it('le clic sur un propriétaire pose owner dans l’URL et charge alors son détail', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Propriétaire 1' }));
    await waitFor(() => expect(getMandantOwnerLedger).toHaveBeenCalled());
    expect(url()).toContain('owner=own-1');
    expect(dernier(getMandantOwnerLedger)[1]).toEqual({
      from: '2026-01-01',
      to: '2026-09-23',
      owner: 'own-1',
      nature: undefined,
      page: 1,
      limit: 100
    });
    expect(await screen.findByText('PIECE-1')).toBeInTheDocument();
    expect(screen.getByText('Loyer reversé 1')).toBeInTheDocument();
    // Synthèse par nature.
    const synthese = screen.getByTestId('synthese-natures');
    expect(within(synthese).getByText('Dépôt de garantie')).toBeInTheDocument();
    expect(within(synthese).getAllByText(/Solde de clôture/)).toHaveLength(2);
    // Le solde progressif vient du serveur.
    expect(screen.getAllByText(/600\s?000/).length).toBeGreaterThan(0);
  });

  it('un owner dans l’URL charge directement le détail, et « Tous les mandants » revient à la liste', async () => {
    renderPage(`?${PERIODE}&owner=own-1`);
    expect(await screen.findByText('PIECE-1')).toBeInTheDocument();
    expect(getMandantOwners).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Tous les mandants/ }));
    expect(await screen.findByRole('button', { name: 'Propriétaire 2' })).toBeInTheDocument();
    expect(url()).not.toContain('owner=');
  });

  it('filtre par nature : paramètre d’appel et page du détail remise à 1', async () => {
    renderPage(`?${PERIODE}&owner=own-1&page-lignes=2`);
    await screen.findByText('PIECE-1');
    expect(dernier(getMandantOwnerLedger)[1]).toMatchObject({ page: 2, limit: 100 });
    await userEvent.click(screen.getByRole('combobox', { name: 'Nature' }));
    await userEvent.click(
      await screen.findByText('Dépôt de garantie', { selector: '.ant-select-item-option-content' })
    );
    await waitFor(() => expect(dernier(getMandantOwnerLedger)[1]).toMatchObject({ nature: 'DEPOSIT', page: 1 }));
    expect(url()).toContain('nature=DEPOSIT');
    expect(url()).not.toContain('page-lignes');
  });

  it('une URL avec owner et nature pré-remplit le filtre et part à l’API', async () => {
    renderPage(`?${PERIODE}&owner=own-1&nature=DEPOSIT`);
    await screen.findByText('PIECE-1');
    expect(dernier(getMandantOwnerLedger)[1]).toEqual({
      from: '2026-01-01',
      to: '2026-09-23',
      owner: 'own-1',
      nature: 'DEPOSIT',
      page: 1,
      limit: 100
    });
    const barre = screen.getByRole('search', { name: 'Filtrer les lignes du mandant' });
    expect(within(barre).getByText('Nature : Dépôt de garantie')).toBeInTheDocument();
    expect(within(barre).getByText(/250 résultats/)).toBeInTheDocument();
    // Effacer les critères de la barre : nature et page du détail retombent.
    await userEvent.click(within(barre).getByRole('button', { name: 'Effacer les critères' }));
    await waitFor(() => expect(url()).not.toContain('nature='));
    await waitFor(() => expect(dernier(getMandantOwnerLedger)[1]).toMatchObject({ nature: undefined, page: 1 }));
  });

  it('pagine les lignes du détail côté serveur (page-lignes)', async () => {
    renderPage(`?${PERIODE}&owner=own-1`);
    await screen.findByText('PIECE-1');
    await userEvent.click(await screen.findByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(dernier(getMandantOwnerLedger)[1]).toMatchObject({ page: 2, limit: 100 }));
    expect(url()).toContain('page-lignes=2');
  });

  it('affiche « Non réparti » pour les lignes sans compte de tiers et l’ouvre', async () => {
    getMandantOwners.mockResolvedValue(
      reponseListe({
        items: [
          proprietaire(1),
          proprietaire(0, { ownerKey: 'non-reparti', thirdPartyAccountId: null, ownerLabel: 'Sans tiers' })
        ]
      })
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Non réparti' }));
    await waitFor(() => expect(dernier(getMandantOwnerLedger)[1]).toMatchObject({ owner: 'non-reparti' }));
    expect(url()).toContain('owner=non-reparti');
  });

  it('contrôle en écart : alerte avec les totaux et l’écart', async () => {
    getMandantOwners.mockResolvedValue(
      reponseListe({
        control: { auxiliaryBalance: 777_000, generalBalance: 700_000, difference: 77_000, isBalanced: false }
      })
    );
    renderPage();
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('ne coïncide pas avec le solde général du compte');
    expect(alerte.textContent).toContain('Solde général du compte 467100');
    expect(alerte.textContent).toMatch(/Écart : 77\s?000/);
  });

  it('contrôle équilibré : aucune alerte', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Propriétaire 1' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('propriétaire inconnu (404) : état dédié avec retour à la liste', async () => {
    getMandantOwnerLedger.mockRejectedValue({ response: { status: 404 } });
    renderPage(`?${PERIODE}&owner=inconnu`);
    expect(await screen.findByText('Mandant introuvable')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tous les mandants' }));
    expect(await screen.findByRole('button', { name: 'Propriétaire 1' })).toBeInTheDocument();
    expect(url()).not.toContain('owner=');
  });

  it('état vide, erreur avec Réessayer, aucun résultat filtré', async () => {
    getMandantOwners.mockResolvedValueOnce(reponseListe({ items: [], total: 0 }));
    const { unmount } = renderPage();
    expect(await screen.findByText('Aucun mouvement de mandant sur cette période.')).toBeInTheDocument();
    unmount();

    getMandantOwners.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    expect(
      await screen.findByText('Impossible de charger le grand livre auxiliaire des mandants.')
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('button', { name: 'Propriétaire 1' })).toBeInTheDocument();
  });

  it('aucun résultat avec recherche : propose d’effacer les filtres', async () => {
    getMandantOwners.mockResolvedValue(reponseListe({ items: [], total: 0 }));
    renderPage(`?${PERIODE}&q=zzz`);
    await userEvent.click(await screen.findByRole('button', { name: 'Effacer les filtres' }));
    await waitFor(() => expect(url()).not.toContain('q=zzz'));
  });

  it('exporte le grand livre auxiliaire complet avec la recherche, sans page', async () => {
    renderPage(`?${PERIODE}&page=2&q=Kon`);
    await screen.findByRole('button', { name: 'Propriétaire 1' });
    await userEvent.click(screen.getByRole('button', { name: /Exporter en Excel/ }));
    await waitFor(() => expect(downloadAccountingExport).toHaveBeenCalled());
    const appel = downloadAccountingExport.mock.calls[0];
    expect(appel[0]).toBe('t1');
    expect(appel[1]).toBe('mandant-subledger');
    expect(appel[2]).toBe('xlsx');
    expect(appel[3]).toEqual({ from: '2026-01-01', to: '2026-09-23', search: 'Kon' });
    expect(appel[3]).not.toHaveProperty('page');
    expect(screen.getAllByRole('button', { name: /Exporter/ })).toHaveLength(2);
  });

  it('exporte le propriétaire et la nature affichés', async () => {
    renderPage(`?${PERIODE}&owner=own-1&nature=DEPOSIT&page-lignes=2`);
    await screen.findByText('PIECE-1');
    await userEvent.click(screen.getByRole('button', { name: /Exporter en CSV/ }));
    await waitFor(() => expect(downloadAccountingExport).toHaveBeenCalled());
    const appel = downloadAccountingExport.mock.calls[0];
    expect(appel[1]).toBe('mandant-subledger');
    expect(appel[2]).toBe('csv');
    expect(appel[3]).toEqual({ from: '2026-01-01', to: '2026-09-23', owner: 'own-1', nature: 'DEPOSIT' });
  });
});

describe('Mandants — balance auxiliaire', () => {
  it('date d’arrêté par défaut = fin de la période', async () => {
    renderPage(`?${PERIODE}&vue=balance`);
    expect(await screen.findByText('Propriétaire 1')).toBeInTheDocument();
    expect(dernier(getMandantTrialBalance)[1]).toEqual({ date: '2026-09-23', page: 1, limit: 50 });
    expect(getMandantOwners).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Date d’arrêté')).toHaveValue('23/09/2026');
  });

  it('respecte date-mandants, la recherche et la page de l’URL', async () => {
    renderPage(`?${PERIODE}&vue=balance&date-mandants=2026-06-30&q=dupont&page=2`);
    await screen.findByText('Propriétaire 1');
    expect(dernier(getMandantTrialBalance)[1]).toEqual({ date: '2026-06-30', page: 2, limit: 50, search: 'dupont' });
    expect(screen.getByLabelText('Date d’arrêté')).toHaveValue('30/06/2026');
    expect(screen.getByLabelText('Rechercher')).toHaveValue('dupont');
  });

  it('affiche les soldes par nature, « Non réparti » et la ligne de totaux', async () => {
    renderPage(`?${PERIODE}&vue=balance`);
    await screen.findByText('Propriétaire 1');
    expect(screen.getByText('Non réparti')).toBeInTheDocument();
    const totaux = screen.getByTestId('totaux-balance-mandants');
    expect(totaux.textContent).toMatch(/800\s?000/);
    expect(totaux.textContent).toContain('À affecter');
  });

  it('contrôle en écart sur la balance', async () => {
    getMandantTrialBalance.mockResolvedValue(
      reponseBalance({
        control: { auxiliaryBalance: 800_000, generalBalance: 790_000, difference: 10_000, isBalanced: false }
      })
    );
    renderPage(`?${PERIODE}&vue=balance`);
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('La balance auxiliaire des mandants ne coïncide pas');
    expect(alerte.textContent).toMatch(/Écart : 10\s?000/);
  });

  it('état vide à cette date et erreur avec Réessayer', async () => {
    getMandantTrialBalance.mockResolvedValueOnce(reponseBalance({ items: [], total: 0 }));
    const { unmount } = renderPage(`?${PERIODE}&vue=balance`);
    expect(await screen.findByText('Aucun solde de mandant à cette date.')).toBeInTheDocument();
    unmount();

    getMandantTrialBalance.mockRejectedValueOnce(new Error('boom'));
    renderPage(`?${PERIODE}&vue=balance`);
    expect(await screen.findByText('Impossible de charger la balance auxiliaire des mandants.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Propriétaire 1')).toBeInTheDocument();
  });

  it('la recherche remet la page à 1', async () => {
    renderPage(`?${PERIODE}&vue=balance&page=2`);
    await screen.findByText('Propriétaire 1');
    await userEvent.type(screen.getByLabelText('Rechercher'), 'Kon{Enter}');
    await waitFor(() => expect(dernier(getMandantTrialBalance)[1]).toMatchObject({ search: 'Kon', page: 1 }));
  });

  it('exporte la balance avec la date d’arrêté et la recherche', async () => {
    renderPage(`?${PERIODE}&vue=balance&date-mandants=2026-06-30&q=Kon&page=2`);
    await screen.findByText('Propriétaire 1');
    await userEvent.click(screen.getByRole('button', { name: /Exporter en Excel/ }));
    await waitFor(() => expect(downloadAccountingExport).toHaveBeenCalled());
    const appel = downloadAccountingExport.mock.calls[0];
    expect(appel[1]).toBe('mandant-trial-balance');
    expect(appel[2]).toBe('xlsx');
    expect(appel[3]).toEqual({ date: '2026-06-30', search: 'Kon' });
  });

  it('le sélecteur de vue bascule entre les deux vues via l’URL', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Propriétaire 1' });
    fireEvent.click(screen.getByRole('radio', { name: 'Balance auxiliaire des mandants' }));
    await waitFor(() => expect(getMandantTrialBalance).toHaveBeenCalled());
    expect(url()).toContain('vue=balance');
    fireEvent.click(screen.getByRole('radio', { name: 'Grand livre auxiliaire des mandants' }));
    expect(await screen.findByRole('button', { name: 'Propriétaire 1' })).toBeInTheDocument();
    expect(url()).not.toContain('vue=');
  });
});
