import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JournalPage } from '../../pages/finance/comptabilite/JournalPage';

/**
 * Journal de la comptabilité de l'agence — lot C : pagination serveur, lignes
 * repliées par défaut, filtres dans l'URL.
 *
 * Le mock du service couvre CHAQUE export qu'utilisent la page et le cadre
 * commun (méta, synchronisation, export) : Vitest refuse un import non déclaré.
 */

const getJournal = vi.fn();
const getAccountingMeta = vi.fn();
const syncAccounting = vi.fn();
const downloadAccountingExport = vi.fn();

vi.mock('../../services/accounting-exports-service', () => ({
  getJournal: (...a: unknown[]) => getJournal(...a),
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

function ecriture(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `ecr-${n}`,
    date: '2026-01-05',
    journalCode: 'OP-GENERAL',
    reference: `JRN-${String(n).padStart(4, '0')}`,
    description: `Loyer encaissé ${n}`,
    documentType: null,
    reversed: false,
    debit: 450_000,
    credit: 450_000,
    lines: [
      {
        accountNumber: '411000',
        accountName: 'Clients',
        label: `Ligne client ${n}`,
        thirdParty: 'Diomandé Mariam',
        nature: 'Compte courant',
        debit: 450_000,
        credit: 0
      },
      {
        accountNumber: '706000',
        accountName: 'Produits locatifs',
        label: `Ligne produit ${n}`,
        thirdParty: null,
        nature: null,
        debit: 0,
        credit: 450_000
      }
    ],
    ...overrides
  };
}

function reponse(overrides: Record<string, unknown> = {}) {
  return {
    items: [ecriture(1), ecriture(2, { reversed: true })],
    total: 120,
    page: 1,
    limit: 50,
    from: '2026-01-01',
    to: '2026-09-23',
    totals: { debit: 9_876_543, credit: 9_876_543 },
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
        <MemoryRouter initialEntries={[`/tenant/t1/finance/comptabilite/journal${search}`]}>
          <Routes>
            <Route
              path="/tenant/:tenantId/finance/comptabilite/journal"
              element={
                <>
                  <JournalPage />
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

const dernierAppel = () => getJournal.mock.calls[getJournal.mock.calls.length - 1];

beforeEach(() => {
  vi.clearAllMocks();
  getJournal.mockResolvedValue(reponse());
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
  downloadAccountingExport.mockResolvedValue({ blob: new Blob(['x']), filename: 'journal.xlsx' });
  window.URL.createObjectURL = vi.fn(() => 'blob:test');
  window.URL.revokeObjectURL = vi.fn();
});

describe('Journal — comptabilité de l’agence', () => {
  it('rend une ligne par écriture, lignes repliées puis dépliées au clic', async () => {
    renderPage();
    expect(await screen.findByText('JRN-0001')).toBeInTheDocument();
    expect(screen.getByText('JRN-0002')).toBeInTheDocument();
    expect(screen.getByText('Contre-passée')).toBeInTheDocument();

    // Repliées par défaut : aucun tableau de lignes.
    expect(screen.queryByText('Ligne client 1')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Voir les lignes' })).toHaveLength(2);

    await userEvent.click(screen.getAllByRole('button', { name: 'Voir les lignes' })[0]);
    const lignes = await screen.findByRole('table', { name: /JRN-0001/ });
    expect(within(lignes).getByText('Ligne client 1')).toBeInTheDocument();
    expect(within(lignes).getByText('Produits locatifs')).toBeInTheDocument();
    expect(screen.queryByText('Ligne client 2')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Masquer les lignes' }));
    expect(screen.queryByText('Ligne client 1')).not.toBeInTheDocument();
  });

  it('lit page, limite et filtres dans l’URL pour appeler le service', async () => {
    renderPage(`?${PERIODE}&page=3&limit=20&journal=OP-CASH&account=411&q=loyer`);
    await screen.findByText('JRN-0001');
    expect(getJournal).toHaveBeenCalledWith('t1', {
      from: '2026-01-01',
      to: '2026-09-23',
      page: 3,
      limit: 20,
      journal: 'OP-CASH',
      account: '411',
      search: 'loyer'
    });
  });

  it('sans paramètre : page 1, 50 lignes', async () => {
    renderPage();
    await screen.findByText('JRN-0001');
    expect(dernierAppel()[1]).toMatchObject({ page: 1, limit: 50, journal: '', account: '', search: '' });
  });

  it('plafonne la taille de page à 100', async () => {
    renderPage(`?${PERIODE}&limit=500`);
    await screen.findByText('JRN-0001');
    expect(dernierAppel()[1]).toMatchObject({ limit: 100 });
  });

  it('changer de page appelle la page 2', async () => {
    renderPage();
    await screen.findByText('JRN-0001');
    await userEvent.click(await screen.findByTitle('2'));
    await waitFor(() => expect(dernierAppel()[1]).toMatchObject({ page: 2, limit: 50 }));
    expect(screen.getByTestId('recherche').textContent).toContain('page=2');
  });

  it('filtre compte validé par Entrée : paramètres d’appel et page remise à 1', async () => {
    renderPage(`?${PERIODE}&page=2`);
    await screen.findByText('JRN-0001');
    const champ = screen.getByLabelText('Compte');
    await userEvent.type(champ, '411{Enter}');
    await waitFor(() => expect(dernierAppel()[1]).toMatchObject({ account: '411', page: 1 }));
    expect(screen.getByTestId('recherche').textContent).not.toContain('page=');
    expect(screen.getByTestId('recherche').textContent).toContain('account=411');
  });

  it('recherche validée à la perte du focus', async () => {
    renderPage(`?${PERIODE}&page=2`);
    await screen.findByText('JRN-0001');
    const champ = screen.getByLabelText('Rechercher');
    await userEvent.type(champ, 'loyer');
    fireEvent.blur(champ);
    await waitFor(() => expect(dernierAppel()[1]).toMatchObject({ search: 'loyer', page: 1 }));
  });

  it('filtre journal : paramètre d’appel et page remise à 1', async () => {
    renderPage(`?${PERIODE}&page=2`);
    await screen.findByText('JRN-0001');
    fireEvent.mouseDown(document.getElementById('comptabilite-filtre-journal') as HTMLElement);
    fireEvent.click(await screen.findByText('OP-CASH — Caisse'));
    await waitFor(() => expect(dernierAppel()[1]).toMatchObject({ journal: 'OP-CASH', page: 1 }));
  });

  it('affiche les totaux du filtre entier', async () => {
    renderPage();
    await screen.findByText('JRN-0001');
    const total = screen.getByText(/Total débit/);
    expect(total.textContent).toMatch(/9\s?876\s?543/);
    expect(total.textContent).toContain('Total crédit');
  });

  it('exporte en Excel avec les filtres, sans page', async () => {
    renderPage(`?${PERIODE}&page=2&journal=OP-CASH&account=411&q=loyer`);
    await screen.findByText('JRN-0001');
    await userEvent.click(screen.getByRole('button', { name: /Exporter en Excel/ }));
    await waitFor(() => expect(downloadAccountingExport).toHaveBeenCalled());
    const appel = downloadAccountingExport.mock.calls[0];
    expect(appel[0]).toBe('t1');
    expect(appel[1]).toBe('journal');
    expect(appel[2]).toBe('xlsx');
    expect(appel[3]).toEqual({
      from: '2026-01-01',
      to: '2026-09-23',
      journal: 'OP-CASH',
      account: '411',
      search: 'loyer'
    });
    expect(appel[3]).not.toHaveProperty('page');
  });

  it('n’ajoute aucun bouton d’export de tableau', async () => {
    renderPage();
    await screen.findByText('JRN-0001');
    expect(screen.getAllByRole('button', { name: /Exporter/ })).toHaveLength(2);
  });

  it('état vide sans filtre', async () => {
    getJournal.mockResolvedValue(reponse({ items: [], total: 0 }));
    renderPage();
    expect(await screen.findByText('Aucune écriture sur cette période.')).toBeInTheDocument();
  });

  it('aucun résultat avec filtre : propose d’effacer les filtres', async () => {
    getJournal.mockResolvedValue(reponse({ items: [], total: 0 }));
    renderPage(`?${PERIODE}&q=zzz`);
    await userEvent.click(await screen.findByRole('button', { name: 'Effacer les filtres' }));
    await waitFor(() => expect(screen.getByTestId('recherche').textContent).not.toContain('q=zzz'));
  });

  it('erreur : message et bouton Réessayer', async () => {
    getJournal.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    expect(await screen.findByText('Impossible de charger le journal.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('JRN-0001')).toBeInTheDocument();
  });
});
