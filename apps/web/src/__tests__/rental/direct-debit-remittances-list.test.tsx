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

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[`/tenant/${TENANT_ID}/rental/direct-debit/remittances`]}>
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

  it("filtre par statut et par créancier en rappelant l'API", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByRole('link', { name: 'PRL-2026-0001' });
    expect(listRemittances).toHaveBeenLastCalledWith(TENANT_ID, { page: 1, pageSize: 20 });

    const [creditorSelect, statusSelect] = screen.getAllByRole('combobox');
    await user.click(statusSelect);
    await user.click(await screen.findByTitle('Validée'));
    await waitFor(() =>
      expect(listRemittances).toHaveBeenLastCalledWith(TENANT_ID, { status: 'VALIDATED', page: 1, pageSize: 20 })
    );

    await user.click(creditorSelect);
    await user.click(await screen.findByTitle('Compte loyers'));
    await waitFor(() =>
      expect(listRemittances).toHaveBeenLastCalledWith(TENANT_ID, {
        status: 'VALIDATED',
        creditorId: 'c-1',
        page: 1,
        pageSize: 20
      })
    );
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
