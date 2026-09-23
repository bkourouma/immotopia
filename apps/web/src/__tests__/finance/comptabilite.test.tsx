import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Comptabilite } from '../../pages/finance/Comptabilite';

/**
 * Comptabilité — Lot 8, exports comptables.
 *
 * Suit le modèle de `__tests__/finance/agent-commissions.test.tsx` et
 * `__tests__/finance/stock.test.tsx` : un `<QueryClientProvider>` avec
 * `retry: false`, un `<MemoryRouter>` posé sur la route paramétrée, et des
 * délais explicites de 8 s sur les `findBy*`. Le mock de `services/
 * accounting-exports-service` couvre les QUATRE exports que l'écran utilise :
 * Vitest refuse tout import qu'un `vi.mock` ne déclare pas explicitement, là
 * où Jest renvoyait `undefined` en silence (AGENTS.md).
 */

const getJournal = vi.fn();
const getGeneralLedger = vi.fn();
const getTrialBalance = vi.fn();
const downloadAccountingExport = vi.fn();

vi.mock('../../services/accounting-exports-service', () => ({
  getJournal: (...a: unknown[]) => getJournal(...a),
  getGeneralLedger: (...a: unknown[]) => getGeneralLedger(...a),
  getTrialBalance: (...a: unknown[]) => getTrialBalance(...a),
  downloadAccountingExport: (...a: unknown[]) => downloadAccountingExport(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function donneesJournal(overrides: Record<string, unknown> = {}) {
  return {
    from: '2026-01-01',
    to: '2026-09-23',
    journals: [
      { code: 'OP-GENERAL', label: 'Opérations générales' },
      { code: 'OP-CASH', label: 'Caisse' }
    ],
    entries: [
      {
        id: 'ecr-1',
        date: '2026-01-05',
        journalCode: 'OP-GENERAL',
        reference: 'JRN-0001',
        description: 'Loyer encaissé - Mariam Diomandé',
        documentType: null,
        reversed: false,
        lines: [
          { accountNumber: '411000', accountName: 'Clients', label: 'Loyer janvier', debit: 450_000, credit: 0 },
          {
            accountNumber: '706000',
            accountName: 'Produits locatifs',
            label: 'Loyer janvier',
            debit: 0,
            credit: 450_000
          }
        ]
      },
      {
        id: 'ecr-2',
        date: '2026-01-10',
        journalCode: 'OP-CASH',
        reference: 'JRN-0002',
        description: 'Écriture annulée',
        documentType: null,
        reversed: true,
        lines: [
          { accountNumber: '411000', accountName: 'Clients', label: 'Annulation', debit: 100_000, credit: 0 },
          { accountNumber: '706000', accountName: 'Produits locatifs', label: 'Annulation', debit: 0, credit: 100_000 }
        ]
      }
    ],
    totals: { debit: 550_000, credit: 550_000 },
    ...overrides
  };
}

function donneesGrandLivre(overrides: Record<string, unknown> = {}) {
  return {
    from: '2026-01-01',
    to: '2026-09-23',
    accounts: [
      {
        accountNumber: '411000',
        accountName: 'Clients',
        openingBalance: 0,
        lines: [
          {
            date: '2026-01-05',
            journalCode: 'OP-GENERAL',
            reference: 'JRN-0001',
            label: 'Loyer janvier',
            debit: 450_000,
            credit: 0,
            balance: 450_000
          }
        ],
        totalDebit: 450_000,
        totalCredit: 0,
        closingBalance: 450_000
      }
    ],
    ...overrides
  };
}

function donneesBalance(overrides: Record<string, unknown> = {}) {
  return {
    from: '2026-01-01',
    to: '2026-09-23',
    lines: [
      {
        // Numéros et intitulés distincts de ceux du journal et du grand
        // livre : les trois mocks peuvent rester montés simultanément (AntD
        // Tabs conserve le contenu des onglets déjà visités), et une valeur
        // partagée ferait échouer une recherche de texte pour ambiguïté.
        accountNumber: '411900',
        accountName: 'Créances diverses',
        openingDebit: 0,
        openingCredit: 0,
        periodDebit: 450_000,
        periodCredit: 0,
        closingDebit: 450_000,
        closingCredit: 0
      },
      {
        accountNumber: '706900',
        accountName: 'Produits accessoires',
        openingDebit: 0,
        openingCredit: 0,
        periodDebit: 0,
        periodCredit: 450_000,
        closingDebit: 0,
        closingCredit: 450_000
      }
    ],
    totals: {
      openingDebit: 0,
      openingCredit: 0,
      periodDebit: 450_000,
      periodCredit: 450_000,
      closingDebit: 450_000,
      closingCredit: 450_000
    },
    isBalanced: true,
    ...overrides
  };
}

function mount(url = '/tenant/agence-1/finance/comptabilite') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/comptabilite" element={<Comptabilite />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

/** Le contrôle portant cet `id`. Les libellés se répètent d'un onglet à l'autre. */
function champ(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Champ « ${id} » introuvable.`);
  return element;
}

/** Ouvre une liste déroulante AntD et clique l'option demandée (modèle `stock.test.tsx`). */
async function choisirOption(id: string, texte: string | RegExp): Promise<void> {
  fireEvent.mouseDown(champ(id));
  const menu = await waitFor(
    () => {
      const liste = document.getElementById(`${id}_list`);
      const menuDuChamp = liste?.closest('.ant-select-dropdown');
      if (!menuDuChamp) throw new Error(`Menu du sélecteur « ${id} » introuvable.`);
      return menuDuChamp as HTMLElement;
    },
    { timeout: 8000 }
  );
  const candidats = await within(menu).findAllByText(texte, {}, { timeout: 8000 });
  const option = candidats.find(element => element.closest('.ant-select-item'));
  if (!option) throw new Error(`Option « ${String(texte)} » absente du menu « ${id} ».`);
  fireEvent.click(option);
}

/** Le panneau d'onglet actuellement visible — les boutons d'export s'y répètent d'un onglet à l'autre. */
function ongletActif(): HTMLElement {
  const panneaux = screen.getAllByRole('tabpanel', { hidden: false });
  return panneaux[panneaux.length - 1];
}

let lienCree: HTMLAnchorElement | null = null;
const creerElementOrigine = document.createElement.bind(document);

beforeEach(() => {
  vi.clearAllMocks();
  lienCree = null;

  getJournal.mockResolvedValue(donneesJournal());
  getGeneralLedger.mockResolvedValue(donneesGrandLivre());
  getTrialBalance.mockResolvedValue(donneesBalance());
  downloadAccountingExport.mockResolvedValue({ blob: new Blob(['x']), filename: 'journal.xlsx' });

  // jsdom n'implémente ni `createObjectURL` ni `revokeObjectURL`.
  (window.URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:atelier/1');
  (window.URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();

  vi.spyOn(document, 'createElement').mockImplementation(((balise: string) => {
    const element = creerElementOrigine(balise);
    if (balise === 'a') {
      lienCree = element as HTMLAnchorElement;
      element.click = vi.fn();
    }
    return element;
  }) as typeof document.createElement);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Comptabilité — onglet Journal', () => {
  it('affiche les écritures avec leurs lignes', async () => {
    mount();

    expect(await screen.findByText('JRN-0001', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Loyer encaissé - Mariam Diomandé')).toBeInTheDocument();
    // Les lignes sont dépliées par défaut (`defaultExpandAllRows`). Les deux
    // écritures du mock partagent le compte 411000 : `getAllByText`, pas
    // `getByText`, qui échouerait pour ambiguïté.
    expect(screen.getAllByText('411000').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Clients').length).toBeGreaterThan(0);
  });

  it('étiquette une écriture contre-passée', async () => {
    mount();
    await screen.findByText('JRN-0002', {}, { timeout: 8000 });
    expect(screen.getByText('Contre-passée')).toBeInTheDocument();
  });

  it('affiche les totaux débit et crédit en pied de tableau', async () => {
    mount();
    await screen.findByText('JRN-0001', {}, { timeout: 8000 });
    expect(screen.getByText('Total débit', { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText(/550\s000/).length).toBeGreaterThan(0);
  });

  it('interroge avec le code du journal choisi via le filtre', async () => {
    mount();
    await screen.findByText('JRN-0001', {}, { timeout: 8000 });

    await choisirOption('comptabilite-filtre-journal', /Caisse/);

    await waitFor(() => {
      const dernierAppel = getJournal.mock.calls[getJournal.mock.calls.length - 1];
      expect(dernierAppel[1]).toMatchObject({ journal: 'OP-CASH' });
    });
  });
});

describe('Comptabilité — onglet Grand livre', () => {
  it('affiche un bloc par compte avec solde d’ouverture et de clôture', async () => {
    const user = userEvent.setup({ delay: null });
    mount();
    await user.click(screen.getByRole('tab', { name: 'Grand livre' }));

    expect(await screen.findByText('411000 — Clients', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getAllByText(/450\s000/).length).toBeGreaterThan(0);
  });

  it('interroge avec le numéro de compte saisi', async () => {
    const user = userEvent.setup({ delay: null });
    mount();
    await user.click(screen.getByRole('tab', { name: 'Grand livre' }));
    await screen.findByText('411000 — Clients', {}, { timeout: 8000 });

    await user.type(champ('comptabilite-filtre-compte'), '411000{enter}');

    await waitFor(() => {
      const dernierAppel = getGeneralLedger.mock.calls[getGeneralLedger.mock.calls.length - 1];
      expect(dernierAppel[1]).toMatchObject({ account: '411000' });
    });
  });
});

describe('Comptabilité — onglet Balance générale', () => {
  it('affiche les comptes et les totaux', async () => {
    const user = userEvent.setup({ delay: null });
    mount();
    await user.click(screen.getByRole('tab', { name: 'Balance générale' }));

    expect(await screen.findByText('706900', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getAllByText(/450\s000/).length).toBeGreaterThan(0);
  });

  it('affiche une alerte rouge quand la balance n’est pas équilibrée', async () => {
    getTrialBalance.mockResolvedValue(donneesBalance({ isBalanced: false }));
    const user = userEvent.setup({ delay: null });
    mount();
    await user.click(screen.getByRole('tab', { name: 'Balance générale' }));

    expect(
      await screen.findByText("La balance n'est pas équilibrée : signalez-le à l'éditeur.", {}, { timeout: 8000 })
    ).toBeInTheDocument();
  });

  it('n’affiche aucune alerte quand la balance est équilibrée', async () => {
    const user = userEvent.setup({ delay: null });
    mount();
    await user.click(screen.getByRole('tab', { name: 'Balance générale' }));
    await screen.findByText('706900', {}, { timeout: 8000 });

    expect(screen.queryByText("La balance n'est pas équilibrée : signalez-le à l'éditeur.")).not.toBeInTheDocument();
  });
});

describe('Comptabilité — export', () => {
  it('exporte le journal en Excel avec la période choisie', async () => {
    const user = userEvent.setup({ delay: null });
    mount('/tenant/agence-1/finance/comptabilite?from=2026-01-01&to=2026-03-31');
    await screen.findByText('JRN-0001', {}, { timeout: 8000 });

    await user.click(within(ongletActif()).getByRole('button', { name: /Exporter en Excel/ }));

    await waitFor(() => expect(downloadAccountingExport).toHaveBeenCalled());
    const appel = downloadAccountingExport.mock.calls[0];
    expect(appel[0]).toBe('agence-1');
    expect(appel[1]).toBe('journal');
    expect(appel[2]).toBe('xlsx');
    expect(appel[3]).toMatchObject({ from: '2026-01-01', to: '2026-03-31' });
  });

  it('exporte le journal en CSV', async () => {
    const user = userEvent.setup({ delay: null });
    mount();
    await screen.findByText('JRN-0001', {}, { timeout: 8000 });

    await user.click(within(ongletActif()).getByRole('button', { name: /Exporter en CSV/ }));

    await waitFor(() => expect(downloadAccountingExport).toHaveBeenCalled());
    expect(downloadAccountingExport.mock.calls[0][1]).toBe('journal');
    expect(downloadAccountingExport.mock.calls[0][2]).toBe('csv');
  });

  it('déclenche le téléchargement du fichier rendu par le service', async () => {
    downloadAccountingExport.mockResolvedValue({ blob: new Blob(['x']), filename: 'journal-2026.xlsx' });
    const user = userEvent.setup({ delay: null });
    mount();
    await screen.findByText('JRN-0001', {}, { timeout: 8000 });

    await user.click(within(ongletActif()).getByRole('button', { name: /Exporter en Excel/ }));

    await waitFor(() => expect(lienCree?.download).toBe('journal-2026.xlsx'));
  });

  it('exporte la balance générale depuis son propre onglet', async () => {
    const user = userEvent.setup({ delay: null });
    mount();
    await user.click(screen.getByRole('tab', { name: 'Balance générale' }));
    await screen.findByText('706900', {}, { timeout: 8000 });

    await user.click(within(ongletActif()).getByRole('button', { name: /Exporter en Excel/ }));

    await waitFor(() => expect(downloadAccountingExport).toHaveBeenCalled());
    expect(downloadAccountingExport.mock.calls[0][1]).toBe('trial-balance');
  });
});
