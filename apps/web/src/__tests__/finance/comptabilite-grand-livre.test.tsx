import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GrandLivrePage } from '../../pages/finance/comptabilite/GrandLivrePage';

/**
 * Grand livre de la comptabilité de l'agence — lot C : récapitulatif des
 * comptes, puis grand livre d'un compte (soldes progressifs du serveur).
 * Le mock du service couvre chaque export utilisé par la page et le cadre.
 */

const getLedgerSummary = vi.fn();
const getAccountLedger = vi.fn();
const searchAccountingAccounts = vi.fn();
const getAccountingMeta = vi.fn();
const syncAccounting = vi.fn();
const downloadAccountingExport = vi.fn();

vi.mock('../../services/accounting-exports-service', () => ({
  getLedgerSummary: (...a: unknown[]) => getLedgerSummary(...a),
  getAccountLedger: (...a: unknown[]) => getAccountLedger(...a),
  searchAccountingAccounts: (...a: unknown[]) => searchAccountingAccounts(...a),
  getAccountingMeta: (...a: unknown[]) => getAccountingMeta(...a),
  syncAccounting: (...a: unknown[]) => syncAccounting(...a),
  downloadAccountingExport: (...a: unknown[]) => downloadAccountingExport(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 30000 });

const SYNC = { status: 'idle', lastSyncedAt: null };
const PERIODE = 'from=2026-01-01&to=2026-09-23';

const compteRow = (n: number, numero: string, nom: string) => ({
  id: `c${n}`,
  accountNumber: numero,
  accountName: nom,
  accountClass: Number(numero[0]),
  openingBalance: 100_000,
  totalDebit: 2_000_000,
  totalCredit: 1_500_000,
  closingBalance: 600_000
});

function recap(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'summary',
    items: [compteRow(1, '411000', 'Clients'), compteRow(2, '521000', 'Banque')],
    total: 120,
    page: 1,
    limit: 50,
    from: '2026-01-01',
    to: '2026-09-23',
    totals: { openingBalance: 0, totalDebit: 7_654_321, totalCredit: 7_654_321, closingBalance: 0 },
    sync: SYNC,
    ...overrides
  };
}

const ligne = (n: number, balance: number) => ({
  id: `l${n}`,
  entryId: `e${n}`,
  date: '2026-02-05',
  journalCode: 'OP-GENERAL',
  reference: `PIECE-${String(n).padStart(3, '0')}`,
  label: `Loyer ${n}`,
  thirdParty: 'Diomandé Mariam',
  nature: 'Compte courant',
  debit: 450_000,
  credit: 0,
  balance
});

function grandLivre(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'account',
    items: [ligne(1, 1_111_111), ligne(2, 2_222_222)],
    total: 150,
    page: 1,
    limit: 100,
    from: '2026-01-01',
    to: '2026-09-23',
    account: { id: 'c1', accountNumber: '411000', accountName: 'Clients', accountClass: 4 },
    summary: { openingBalance: 100_000, totalDebit: 3_333_333, totalCredit: 1_000_000, closingBalance: 2_433_333 },
    filteredTotals: null,
    previousAccount: { accountNumber: '401000', accountName: 'Fournisseurs' },
    nextAccount: { accountNumber: '412000', accountName: 'Clients douteux' },
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
        <MemoryRouter initialEntries={[`/tenant/t1/finance/comptabilite/grand-livre${search}`]}>
          <Routes>
            <Route
              path="/tenant/:tenantId/finance/comptabilite/grand-livre"
              element={
                <>
                  <GrandLivrePage />
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

const champRecherche = () => within(screen.getByRole('search')).getByRole('textbox');
const dernierRecap = () => getLedgerSummary.mock.calls[getLedgerSummary.mock.calls.length - 1];
const dernierCompte = () => getAccountLedger.mock.calls[getAccountLedger.mock.calls.length - 1];

beforeEach(() => {
  vi.clearAllMocks();
  getLedgerSummary.mockResolvedValue(recap());
  getAccountLedger.mockResolvedValue(grandLivre());
  searchAccountingAccounts.mockResolvedValue([
    { id: 'c1', accountNumber: '411000', accountName: 'Clients', accountClass: 4 }
  ]);
  getAccountingMeta.mockResolvedValue({
    journals: [
      { code: 'OP-GENERAL', label: 'Opérations générales' },
      { code: 'OP-CASH', label: 'Caisse' }
    ],
    years: [2026],
    minDate: null,
    maxDate: null,
    sync: SYNC
  });
  syncAccounting.mockResolvedValue(SYNC);
  downloadAccountingExport.mockResolvedValue({ blob: new Blob(['x']), filename: 'grand-livre.xlsx' });
  window.URL.createObjectURL = vi.fn(() => 'blob:test');
  window.URL.revokeObjectURL = vi.fn();
});

describe('Grand livre — sans compte (récapitulatif)', () => {
  it('rend le récapitulatif et ses totaux', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: '411000' })).toBeInTheDocument();
    expect(screen.getByText('Banque')).toBeInTheDocument();
    expect(screen.getByText(/Total :/).textContent).toMatch(/7\s?654\s?321/);
    expect(dernierRecap()[1]).toMatchObject({ from: '2026-01-01', to: '2026-09-23', page: 1, limit: 50 });
    expect(getAccountLedger).not.toHaveBeenCalled();
  });

  it('pagination serveur : page 2', async () => {
    renderPage();
    await screen.findByRole('button', { name: '411000' });
    await userEvent.click(await screen.findByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(dernierRecap()[1]).toMatchObject({ page: 2, limit: 50 }));
  });

  it('un clic sur une ligne pose account dans l’URL et appelle le grand livre', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: '411000' }));
    await waitFor(() => expect(getAccountLedger).toHaveBeenCalled());
    expect(dernierCompte()[1]).toMatchObject({ account: '411000', from: '2026-01-01', to: '2026-09-23' });
    expect(screen.getByTestId('recherche').textContent).toContain('account=411000');
  });

  it('recherche passée au service, page remise à 1', async () => {
    renderPage(`?${PERIODE}&page=2`);
    await screen.findByRole('button', { name: '411000' });
    await userEvent.type(champRecherche(), 'banq');
    await waitFor(() => expect(dernierRecap()[1]).toMatchObject({ search: 'banq', page: 1 }));
    expect(screen.getByTestId('recherche').textContent).toContain('q=banq');
    expect(screen.getByTestId('recherche').textContent).not.toContain('page=');
  });

  it('la barre dit où l’on cherche et ne propose pas le journal sans compte', async () => {
    renderPage();
    await screen.findByRole('button', { name: '411000' });
    expect(champRecherche()).toHaveAttribute('placeholder', 'Numéro ou intitulé');
    expect(screen.queryByRole('combobox', { name: 'Journal' })).not.toBeInTheDocument();
  });

  it('URL existante : barre pré-remplie et bon appel, effacer revient à la liste complète', async () => {
    getLedgerSummary.mockImplementation(async (_t: string, p: { search?: string }) =>
      p.search ? recap({ items: [], total: 0 }) : recap()
    );
    renderPage(`?${PERIODE}&q=zzz`);
    await screen.findByText('Aucun élément ne correspond aux filtres appliqués.');
    expect(champRecherche()).toHaveValue('zzz');
    expect(dernierRecap()[1]).toMatchObject({ search: 'zzz', page: 1 });
    const effacer = screen.getAllByRole('button', { name: /Effacer les/ });
    await userEvent.click(effacer[effacer.length - 1]);
    expect(await screen.findByRole('button', { name: '411000' })).toBeInTheDocument();
    expect(screen.getByTestId('recherche').textContent).not.toContain('q=');
  });

  it('exporte le grand livre complet sans compte ni page', async () => {
    renderPage(`?${PERIODE}&page=2`);
    await screen.findByRole('button', { name: '411000' });
    await userEvent.click(screen.getByRole('button', { name: /Exporter en Excel/ }));
    await waitFor(() => expect(downloadAccountingExport).toHaveBeenCalled());
    const appel = downloadAccountingExport.mock.calls[0];
    expect(appel[1]).toBe('general-ledger');
    expect(appel[2]).toBe('xlsx');
    expect(appel[3]).toEqual({ from: '2026-01-01', to: '2026-09-23' });
  });

  it('exporte le récapitulatif filtré par la recherche, sans compte', async () => {
    renderPage(`?${PERIODE}&q=41`);
    await screen.findByRole('button', { name: '411000' });
    await userEvent.click(screen.getByRole('button', { name: /Exporter en Excel/ }));
    await waitFor(() => expect(downloadAccountingExport).toHaveBeenCalled());
    const appel = downloadAccountingExport.mock.calls[0];
    expect(appel[1]).toBe('general-ledger');
    expect(appel[2]).toBe('xlsx');
    expect(appel[3]).toEqual({ from: '2026-01-01', to: '2026-09-23', search: '41' });
  });
});

describe('Grand livre — avec compte', () => {
  it('lien de la balance : appelle le service avec compte et période', async () => {
    renderPage('?account=411000&from=2026-01-01&to=2026-03-31');
    await screen.findByText('PIECE-001');
    expect(getAccountLedger).toHaveBeenCalledWith('t1', {
      from: '2026-01-01',
      to: '2026-03-31',
      account: '411000',
      page: 1,
      limit: 100,
      search: '',
      journal: ''
    });
    expect(getLedgerSummary).not.toHaveBeenCalled();
  });

  it('affiche les cartes de synthèse', async () => {
    renderPage(`?${PERIODE}&account=411000`);
    await screen.findByText('PIECE-001');
    expect(screen.getByText("Solde d'ouverture")).toBeInTheDocument();
    expect(screen.getByText('Total débit')).toBeInTheDocument();
    expect(screen.getByText('Total crédit')).toBeInTheDocument();
    expect(screen.getByText('Solde de clôture')).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/2\s?433\s?333/);
  });

  it('affiche le solde progressif du serveur sur la page 1 puis la page 2', async () => {
    renderPage(`?${PERIODE}&account=411000`);
    await screen.findByText('PIECE-001');
    expect(document.body.textContent).toMatch(/1\s?111\s?111/);
    expect(document.body.textContent).toMatch(/2\s?222\s?222/);

    getAccountLedger.mockResolvedValue(grandLivre({ items: [ligne(101, 9_999_999)], page: 2 }));
    await userEvent.click(await screen.findByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(dernierCompte()[1]).toMatchObject({ page: 2, limit: 100 }));
    await screen.findByText('PIECE-101');
    expect(document.body.textContent).toMatch(/9\s?999\s?999/);
  });

  it('compte précédent / suivant changent de compte en gardant la période', async () => {
    renderPage(`?${PERIODE}&account=411000`);
    await screen.findByText('PIECE-001');
    await userEvent.click(screen.getByRole('button', { name: /Compte suivant/ }));
    await waitFor(() => expect(dernierCompte()[1]).toMatchObject({ account: '412000', from: '2026-01-01' }));
    await userEvent.click(screen.getByRole('button', { name: /Compte précédent/ }));
    await waitFor(() => expect(dernierCompte()[1]).toMatchObject({ account: '401000', to: '2026-09-23' }));
  });

  it('boutons désactivés sans voisin', async () => {
    getAccountLedger.mockResolvedValue(grandLivre({ previousAccount: null, nextAccount: null }));
    renderPage(`?${PERIODE}&account=411000`);
    await screen.findByText('PIECE-001');
    expect(screen.getByRole('button', { name: /Compte précédent/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Compte suivant/ })).toBeDisabled();
  });

  it('recherche et journal passés au service, page remise à 1, lignes filtrées mentionnées', async () => {
    getAccountLedger.mockResolvedValue(grandLivre({ filteredTotals: { debit: 123_456, credit: 654_321 } }));
    renderPage(`?${PERIODE}&account=411000&page=2`);
    await screen.findByText('PIECE-001');
    expect(screen.queryByText(/Lignes filtrées/)).toBeInTheDocument();
    expect(screen.getByText(/Lignes filtrées/).textContent).toMatch(/123\s?456/);
    expect(screen.getByText(/Le solde affiché reste celui du compte/)).toBeInTheDocument();

    expect(champRecherche()).toHaveAttribute('placeholder', 'Libellé ou pièce');
    await userEvent.type(champRecherche(), 'loyer{Enter}');
    await waitFor(() => expect(dernierCompte()[1]).toMatchObject({ search: 'loyer', page: 1 }));
    expect(screen.getByTestId('recherche').textContent).toContain('account=411000');
    expect(screen.getByTestId('recherche').textContent).not.toContain('page=');

    await userEvent.click(screen.getByRole('combobox', { name: 'Journal' }));
    await userEvent.click(await screen.findByText('OP-CASH — Caisse'));
    await waitFor(() => expect(dernierCompte()[1]).toMatchObject({ journal: 'OP-CASH', search: 'loyer', page: 1 }));
    expect(screen.getByTestId('recherche').textContent).toContain('journal=OP-CASH');
  });

  it('URL existante : barre pré-remplie (libellé, journal) et bon appel', async () => {
    renderPage(`?${PERIODE}&account=411000&q=loyer&journal=OP-CASH`);
    await screen.findByText('PIECE-001');
    expect(champRecherche()).toHaveValue('loyer');
    await waitFor(() =>
      expect(dernierCompte()[1]).toMatchObject({ account: '411000', search: 'loyer', journal: 'OP-CASH', page: 1 })
    );
    await waitFor(() => expect(within(screen.getByRole('search')).getAllByText(/OP-CASH/).length).toBeGreaterThan(0));
  });

  it('changer de compte remet recherche, journal et page à zéro', async () => {
    renderPage(`?${PERIODE}&account=411000&q=loyer&journal=OP-CASH&page=2`);
    await screen.findByText('PIECE-001');
    await userEvent.click(screen.getByRole('button', { name: /Compte suivant/ }));
    await waitFor(() =>
      expect(dernierCompte()[1]).toMatchObject({ account: '412000', search: '', journal: '', page: 1 })
    );
    const url = screen.getByTestId('recherche').textContent as string;
    expect(url).toContain('account=412000');
    expect(url).not.toContain('q=');
    expect(url).not.toContain('journal=');
    expect(url).not.toContain('page=');
    expect(champRecherche()).toHaveValue('');
  });

  it('exporte avec les filtres et sans page', async () => {
    renderPage(`?${PERIODE}&account=411000&q=loyer&journal=OP-CASH&page=2`);
    await screen.findByText('PIECE-001');
    await userEvent.click(screen.getByRole('button', { name: /Exporter en CSV/ }));
    await waitFor(() => expect(downloadAccountingExport).toHaveBeenCalled());
    const appel = downloadAccountingExport.mock.calls[0];
    expect(appel[1]).toBe('general-ledger');
    expect(appel[2]).toBe('csv');
    expect(appel[3]).toEqual({
      from: '2026-01-01',
      to: '2026-09-23',
      account: '411000',
      search: 'loyer',
      journal: 'OP-CASH'
    });
    expect(appel[3]).not.toHaveProperty('page');
  });

  it('un seul jeu de boutons d’export', async () => {
    renderPage(`?${PERIODE}&account=411000`);
    await screen.findByText('PIECE-001');
    expect(screen.getAllByRole('button', { name: /Exporter/ })).toHaveLength(2);
  });

  it('le sélecteur interroge le serveur (comptes mouvementés, période)', async () => {
    renderPage(`?${PERIODE}`);
    await screen.findByRole('button', { name: '411000' });
    await waitFor(() =>
      expect(searchAccountingAccounts).toHaveBeenCalledWith('t1', {
        search: '',
        withMovements: true,
        from: '2026-01-01',
        to: '2026-09-23'
      })
    );
  });

  it('compte inconnu (404) : état dédié avec retour au récapitulatif', async () => {
    getAccountLedger.mockRejectedValue({ response: { status: 404 } });
    renderPage(`?${PERIODE}&account=999999`);
    expect(await screen.findByText('Compte introuvable')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retour au récapitulatif' }));
    await waitFor(() => expect(getLedgerSummary).toHaveBeenCalled());
    expect(screen.getByTestId('recherche').textContent).not.toContain('account=');
  });

  it('erreur : message et Réessayer', async () => {
    getAccountLedger.mockRejectedValueOnce({ response: { status: 500 } });
    renderPage(`?${PERIODE}&account=411000`);
    expect(await screen.findByText('Impossible de charger le grand livre.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('PIECE-001')).toBeInTheDocument();
  });
});
