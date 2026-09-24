import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SaleMandates } from '../../pages/sales/SaleMandates';

/**
 * Mandats de vente — lot 9.
 *
 * Modèle de `__tests__/finance/bons-de-commande.test.tsx` : `useBreakpoint`
 * figé en desktop, `<MemoryRouter>` sur la route paramétrée, et un mock qui
 * couvre chaque export utilisé (Vitest refuse en silence un import non
 * déclaré, AGENTS.md). `SaleMandates.tsx` importe `sales-service` et, via
 * `selectors.tsx`, `property-service`, `tenant-service` et
 * `membership-service` — les quatre sont mockés ici.
 */

const listSaleMandates = vi.fn();
const createSaleMandate = vi.fn();

vi.mock('../../services/sales-service', () => ({
  listSaleMandates: (...a: unknown[]) => listSaleMandates(...a),
  createSaleMandate: (...a: unknown[]) => createSaleMandate(...a)
}));

const listProperties = vi.fn();
vi.mock('../../services/property-service', () => ({
  listProperties: (...a: unknown[]) => listProperties(...a)
}));

const getTenantClients = vi.fn();
vi.mock('../../services/tenant-service', () => ({
  getTenantClients: (...a: unknown[]) => getTenantClients(...a)
}));

const listMembers = vi.fn();
vi.mock('../../services/membership-service', () => ({
  listMembers: (...a: unknown[]) => listMembers(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function mandat(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mandate-1',
    number: 'MV-2026-0001',
    propertyId: 'property-1',
    propertyLabel: 'REF-001 · Villa Cocody',
    propertyStatus: 'AVAILABLE',
    sellerClientId: 'client-1',
    sellerName: 'Aissatou Barry',
    mandateType: 'EXCLUSIVE',
    askingPrice: 50_000_000,
    minimumPrice: null,
    commissionMode: 'PERCENT',
    commissionRate: 5,
    commissionFixedAmount: null,
    commissionPayer: 'SELLER',
    agentUserId: null,
    agentName: null,
    agentSharePercent: null,
    startDate: '2026-09-01',
    endDate: '2027-03-01',
    status: 'ACTIVE',
    isExpired: false,
    revokedAt: null,
    revokeReason: null,
    notes: null,
    openOffersCount: 0,
    offersCount: 0,
    agreementId: null,
    agreementStatus: null,
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
    ...overrides
  };
}

async function optionParLibelle(libelle: string): Promise<HTMLElement> {
  return waitFor(() => {
    const candidat = screen.getAllByText(libelle).find(el => el.closest('.ant-select-item'));
    if (!candidat) throw new Error(`Option de menu déroulant introuvable : « ${libelle} »`);
    return candidat;
  });
}

function mount(url = '/tenant/agence-1/sales/mandates') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/sales/mandates" element={<SaleMandates />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listProperties.mockResolvedValue({
    properties: [{ id: 'property-1', internalReference: 'REF-001', title: 'Villa Cocody' }],
    pagination: { page: 1, limit: 500, total: 1, totalPages: 1 }
  });
  getTenantClients.mockResolvedValue({
    success: true,
    data: [
      {
        id: 'client-1',
        userId: 'user-1',
        tenantId: 'agence-1',
        clientType: 'OWNER',
        user: { id: 'user-1', email: 'aissatou@example.com', fullName: 'Aissatou Barry' }
      }
    ]
  });
  listMembers.mockResolvedValue({
    success: true,
    data: { members: [], pagination: { page: 1, limit: 500, total: 0, totalPages: 1 } }
  });
});

describe('Mandats de vente — liste', () => {
  it('affiche une ligne par mandat', async () => {
    listSaleMandates.mockResolvedValue([mandat()]);
    mount();

    expect(await screen.findByText('MV-2026-0001', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('REF-001 · Villa Cocody')).toBeInTheDocument();
    expect(screen.getByText('Aissatou Barry')).toBeInTheDocument();
  });

  it('affiche l’état vide quand aucun mandat n’existe', async () => {
    listSaleMandates.mockResolvedValue([]);
    mount();

    expect(await screen.findByText('Aucun mandat de vente enregistré.', {}, { timeout: 8000 })).toBeInTheDocument();
  });
});

describe('Mandats de vente — nouveau mandat', () => {
  it('exige un taux en mode pourcentage', async () => {
    listSaleMandates.mockResolvedValue([]);
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    mount();

    await user.click(await screen.findByText('Nouveau mandat', {}, { timeout: 8000 }));

    const dialogue = await screen.findByRole('dialog', {}, { timeout: 8000 });
    const comboboxes = await within(dialogue).findAllByRole('combobox', {}, { timeout: 8000 });
    fireEvent.mouseDown(comboboxes[0]);
    fireEvent.click(await optionParLibelle('REF-001 · Villa Cocody'));

    fireEvent.mouseDown(within(dialogue).getAllByRole('combobox')[1]);
    fireEvent.click(await optionParLibelle('Aissatou Barry (aissatou@example.com)'));

    const champPrix = within(dialogue).getByLabelText('Prix demandé');
    await user.type(champPrix, '50000000');

    await user.click(within(dialogue).getByText('Créer le mandat'));

    expect(await screen.findByText('Le taux est requis', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(createSaleMandate).not.toHaveBeenCalled();
  });

  it('exige un forfait en mode forfaitaire', async () => {
    listSaleMandates.mockResolvedValue([]);
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    mount();

    await user.click(await screen.findByText('Nouveau mandat', {}, { timeout: 8000 }));

    const dialogue = await screen.findByRole('dialog', {}, { timeout: 8000 });
    const comboboxes = await within(dialogue).findAllByRole('combobox', {}, { timeout: 8000 });
    fireEvent.mouseDown(comboboxes[0]);
    fireEvent.click(await optionParLibelle('REF-001 · Villa Cocody'));

    fireEvent.mouseDown(within(dialogue).getAllByRole('combobox')[1]);
    fireEvent.click(await optionParLibelle('Aissatou Barry (aissatou@example.com)'));

    const champPrix = within(dialogue).getByLabelText('Prix demandé');
    await user.type(champPrix, '50000000');

    await user.click(within(dialogue).getByText('Forfait'));

    await user.click(within(dialogue).getByText('Créer le mandat'));

    expect(await screen.findByText('Le forfait est requis', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(createSaleMandate).not.toHaveBeenCalled();
  });

  it('envoie l’identifiant du bien choisi parmi plusieurs', async () => {
    listSaleMandates.mockResolvedValue([]);
    listProperties.mockResolvedValue({
      properties: [
        { id: 'property-1', internalReference: 'REF-001', title: 'Villa Cocody' },
        { id: 'property-2', internalReference: 'REF-002', title: 'Villa jumelée Attécoubé' },
        { id: 'property-3', internalReference: 'REF-003', title: 'Étage 3 – Apt 1' }
      ],
      pagination: { page: 1, limit: 500, total: 3, totalPages: 1 }
    });
    createSaleMandate.mockResolvedValue(mandat({ id: 'mandate-2', number: 'MV-2026-0002', propertyId: 'property-2' }));
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    mount();

    await user.click(await screen.findByText('Nouveau mandat', {}, { timeout: 8000 }));

    const dialogue = await screen.findByRole('dialog', {}, { timeout: 8000 });
    const comboboxes = await within(dialogue).findAllByRole('combobox', {}, { timeout: 8000 });
    fireEvent.mouseDown(comboboxes[0]);
    fireEvent.click(await optionParLibelle('REF-002 · Villa jumelée Attécoubé'));

    fireEvent.mouseDown(within(dialogue).getAllByRole('combobox')[1]);
    fireEvent.click(await optionParLibelle('Aissatou Barry (aissatou@example.com)'));

    await user.type(within(dialogue).getByLabelText('Prix demandé'), '85000000');
    await user.type(within(dialogue).getByLabelText("Taux d'honoraires (%)"), '4');

    await user.click(within(dialogue).getByText('Créer le mandat'));

    await waitFor(() => expect(createSaleMandate).toHaveBeenCalledTimes(1), { timeout: 8000 });
    expect(createSaleMandate).toHaveBeenCalledWith(
      'agence-1',
      expect.objectContaining({
        propertyId: 'property-2',
        sellerClientId: 'client-1',
        askingPrice: 85_000_000,
        commissionMode: 'PERCENT',
        commissionRate: 4
      })
    );
  });
});
