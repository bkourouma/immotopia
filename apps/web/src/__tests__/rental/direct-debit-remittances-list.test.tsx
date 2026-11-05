import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DirectDebitRemittances } from '../../pages/rental/DirectDebitRemittances';
import { creditor, inactiveCreditor, makeRemittance, TENANT_ID } from './direct-debit-remittances-fixtures';

/**
 * Spec 042, P2 — liste des remises (§7.10) : rendu, filtres, modale
 * « Préparer une remise » avec la date proposée.
 */

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const listRemittances = vi.fn();
const listCreditors = vi.fn();
const createRemittance = vi.fn();
const listReturnImports = vi.fn();

vi.mock('../../services/direct-debit-service', () => ({
  listRemittances: (...a: unknown[]) => listRemittances(...a),
  listCreditors: (...a: unknown[]) => listCreditors(...a),
  createRemittance: (...a: unknown[]) => createRemittance(...a),
  listReturnImports: (...a: unknown[]) => listReturnImports(...a)
}));

const LocationProbe: React.FC = () => {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}|{JSON.stringify((location.state as { skipped?: unknown } | null)?.skipped ?? null)}
    </div>
  );
};

const Url: React.FC = () => <div data-testid="url">{useLocation().search}</div>;

function mount(initial = `/tenant/${TENANT_ID}/rental/direct-debit/remittances`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route path="/tenant/:tenantId/rental/direct-debit/remittances" element={<DirectDebitRemittances />} />
            <Route path="/tenant/:tenantId/rental/direct-debit/remittances/:remittanceId" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Seule la date est simulée : les minuteries de React Query restent réelles.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 16, 9, 0, 0) });
  listRemittances.mockResolvedValue({ items: [makeRemittance()], total: 1, page: 1, pageSize: 20 });
  listCreditors.mockResolvedValue([creditor, inactiveCreditor]);
  listReturnImports.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DirectDebitRemittances', () => {
  it('affiche les remises et les onglets Mandats / Remises', async () => {
    mount();

    const link = await screen.findByRole('link', { name: 'PRL-2026-0001' });
    expect(link).toHaveAttribute('href', `/tenant/${TENANT_ID}/rental/direct-debit/remittances/r-1`);
    const row = link.closest('tr') as HTMLElement;
    expect(within(row).getByText('Brouillon')).toBeInTheDocument();
    expect(within(row).getByText('Compte loyers')).toBeInTheDocument();
    expect(within(row).getByText('05/11/2026')).toBeInTheDocument();
    expect(within(row).getByText('29/10/2026')).toBeInTheDocument();
    expect(within(row).getByText(/novembre 2026/)).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument();
    expect(within(row).getByText(/250\s?000/)).toBeInTheDocument();

    const tabs = screen.getByRole('tablist');
    expect(within(tabs).getByRole('tab', { name: 'Mandats' })).toHaveAttribute(
      'href',
      `/tenant/${TENANT_ID}/rental/direct-debit`
    );
    const remises = within(tabs).getByRole('tab', { name: 'Remises' });
    expect(remises).toHaveAttribute('aria-selected', 'true');
  });

  it('envoie la saisie de la barre à l’API après le debounce et la met dans l’URL', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByRole('link', { name: 'PRL-2026-0001' });
    expect(listRemittances).toHaveBeenLastCalledWith(TENANT_ID, { page: 1, pageSize: 20 });

    await user.type(
      within(screen.getByRole('search', { name: 'Rechercher dans les remises' })).getByRole('textbox'),
      'PRL-2026'
    );
    await waitFor(
      () => expect(listRemittances).toHaveBeenLastCalledWith(TENANT_ID, { search: 'PRL-2026', page: 1, pageSize: 20 }),
      { timeout: 8000 }
    );
    expect(screen.getByTestId('url').textContent).toContain('q=PRL-2026');
  });

  it('applique statut, créancier et période de prélèvement d’une URL partagée', async () => {
    mount(
      `/tenant/${TENANT_ID}/rental/direct-debit/remittances?status=VALIDATED&creditorId=c-1&collectionFrom=2026-11-01&collectionTo=2026-11-30`
    );
    await screen.findByRole('link', { name: 'PRL-2026-0001' });
    await waitFor(() =>
      expect(listRemittances).toHaveBeenLastCalledWith(TENANT_ID, {
        status: 'VALIDATED',
        creditorId: 'c-1',
        collectionFrom: '2026-11-01',
        collectionTo: '2026-11-30',
        page: 1,
        pageSize: 20
      })
    );
  });

  it('propose d’effacer les critères quand aucune remise ne correspond', async () => {
    const user = userEvent.setup();
    listRemittances.mockImplementation(async (_tenant: string, params: Record<string, unknown>) =>
      params.search
        ? { items: [], total: 0, page: 1, pageSize: 20 }
        : { items: [makeRemittance()], total: 1, page: 1, pageSize: 20 }
    );
    mount(`/tenant/${TENANT_ID}/rental/direct-debit/remittances?q=zzz`);
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, { timeout: 8000 })
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByRole('link', { name: 'PRL-2026-0001' })).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).not.toContain('q=');
  });

  it('ouvre la modale avec le créancier actif et la date proposée, puis ouvre le détail avec les mandats non retenus', async () => {
    const user = userEvent.setup();
    const skipped = [
      {
        mandateId: 'm-9',
        mandateReference: 'MDT-2026-0009',
        leaseNumber: 'BAIL-009',
        debtorName: 'Fatou Koné',
        reason: 'NOTHING_DUE'
      }
    ];
    createRemittance.mockResolvedValue({ remittance: makeRemittance(), skipped });
    mount();
    await screen.findByRole('link', { name: 'PRL-2026-0001' });

    await user.click(screen.getByRole('button', { name: /Préparer une remise/ }));
    const dialog = await screen.findByRole('dialog');

    // Un seul créancier actif : présélectionné. Premier jour de collecte (le 5)
    // dont la prénotification (5 jours ouvrés) n'est pas passée : le 05/11/2026.
    expect(within(dialog).getByText('Compte loyers')).toBeInTheDocument();
    expect(within(dialog).queryByText('Ancien compte')).not.toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('05/11/2026')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Avis de prélèvement : 5 jours ouvrés avant la date de prélèvement.')
    ).toBeInTheDocument();
    // Les notes sont bornées comme côté API.
    expect(dialog.querySelector('textarea')).toHaveAttribute('maxlength', '2000');

    await user.click(within(dialog).getByRole('button', { name: 'Préparer' }));

    await waitFor(() =>
      expect(createRemittance).toHaveBeenCalledWith(TENANT_ID, { creditorId: 'c-1', collectionDate: '2026-11-05' })
    );
    const probe = await screen.findByTestId('location');
    expect(probe.textContent).toContain(`/tenant/${TENANT_ID}/rental/direct-debit/remittances/r-1`);
    expect(probe.textContent).toContain('MDT-2026-0009');
  });

  it('accorde « 1 jour ouvré » au singulier dans la modale', async () => {
    const user = userEvent.setup();
    listCreditors.mockResolvedValue([{ ...creditor, prenotificationBusinessDays: 1 }]);
    mount();
    await screen.findByRole('link', { name: 'PRL-2026-0001' });

    await user.click(screen.getByRole('button', { name: /Préparer une remise/ }));
    const dialog = await screen.findByRole('dialog');

    expect(
      await within(dialog).findByText('Avis de prélèvement : 1 jour ouvré avant la date de prélèvement.')
    ).toBeInTheDocument();
  });

  it("affiche le message de l'API dans la modale quand la date est refusée", async () => {
    const user = userEvent.setup();
    createRemittance.mockRejectedValue({
      response: { status: 400, data: { message: 'Date trop proche : première date possible 05/11/2026.' } }
    });
    mount();
    await screen.findByRole('link', { name: 'PRL-2026-0001' });

    await user.click(screen.getByRole('button', { name: /Préparer une remise/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Préparer' }));

    expect(await within(dialog).findByText(/Date trop proche/)).toBeInTheDocument();
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
  });
});
