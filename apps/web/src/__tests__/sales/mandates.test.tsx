import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
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
const getProperty = vi.fn();
vi.mock('../../services/property-service', () => ({
  listProperties: (...a: unknown[]) => listProperties(...a),
  getProperty: (...a: unknown[]) => getProperty(...a)
}));

// `selectors.tsx` importe aussi le CRM (acquéreur, affaire) : mock complet des exports utilisés.
vi.mock('../../services/crm-service', () => ({
  listContacts: vi.fn(),
  getContact: vi.fn(),
  listDeals: vi.fn()
}));

const getOwnerClients = vi.fn();
vi.mock('../../services/tenant-service', () => ({
  getOwnerClients: (...a: unknown[]) => getOwnerClients(...a)
}));

const listMembers = vi.fn();
vi.mock('../../services/membership-service', () => ({
  listAssignableMembers: (...a: unknown[]) => listMembers(...a)
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

function Adresse() {
  return <div data-testid="adresse">{useLocation().search}</div>;
}

function mount(url = '/tenant/agence-1/sales/mandates') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
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
  getOwnerClients.mockResolvedValue([
    {
      id: 'client-1',
      userId: 'user-1',
      tenantId: 'agence-1',
      clientType: 'OWNER',
      user: { id: 'user-1', email: 'aissatou@example.com', fullName: 'Aissatou Barry' }
    }
  ]);
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

describe('Mandats de vente — recherche serveur', () => {
  const T = { timeout: 8000 };
  const PLACEHOLDER = 'Numéro, bien, vendeur, négociateur…';

  beforeEach(() => {
    const all = [
      mandat(),
      mandat({
        id: 'mandate-2',
        number: 'MV-2026-0002',
        propertyLabel: 'REF-002 · Appartement Plateau',
        sellerName: 'Kouadio Yao',
        mandateType: 'SIMPLE',
        status: 'REVOKED',
        askingPrice: 20_000_000
      }),
      mandat({
        id: 'mandate-3',
        number: 'MV-2026-0003',
        propertyLabel: 'REF-003 · Terrain Bingerville',
        sellerName: 'Fatou Diallo',
        askingPrice: 80_000_000
      })
    ];
    listSaleMandates.mockImplementation(async (_tenant: string, params: Record<string, any>) => {
      const filtered = all.filter(
        m =>
          (!params.search ||
            [m.number, m.propertyLabel, m.sellerName].some(v =>
              v.toLowerCase().includes(params.search.toLowerCase())
            )) &&
          (!params.status || params.status.split(',').includes(m.status)) &&
          (params.minPrice === undefined || m.askingPrice >= params.minPrice)
      );
      return {
        items: filtered.slice((params.page - 1) * params.limit, params.page * params.limit),
        total: filtered.length,
        page: params.page,
        pageSize: params.limit
      };
    });
  });

  it('charge la première page avec paramètres serveur', async () => {
    mount();
    expect(await screen.findByText('MV-2026-0001', {}, T)).toBeInTheDocument();
    expect(listSaleMandates).toHaveBeenCalledWith('agence-1', { page: 1, limit: 20 });
  });

  it('cherche sans accent ni casse dans le bien et le vendeur, et garde le terme dans l’URL', async () => {
    const user = userEvent.setup({ delay: null });
    mount();
    await user.type(await screen.findByPlaceholderText(PLACEHOLDER, {}, T), 'APPARTEMENT');
    await waitFor(() => expect(screen.queryByText('MV-2026-0001')).not.toBeInTheDocument(), T);
    expect(screen.getByText('MV-2026-0002')).toBeInTheDocument();
    expect(screen.queryByText('MV-2026-0003')).not.toBeInTheDocument();
    expect(screen.getByTestId('adresse')).toHaveTextContent('q=APPARTEMENT');
  });

  it('filtre par statut depuis l’URL partagée', async () => {
    mount('/tenant/agence-1/sales/mandates?status=REVOKED');
    expect(await screen.findByText('MV-2026-0002', {}, T)).toBeInTheDocument();
    expect(screen.queryByText('MV-2026-0001')).not.toBeInTheDocument();
    expect(listSaleMandates).toHaveBeenCalledTimes(1);
  });

  it('filtre par prix demandé (min/max) depuis l’URL', async () => {
    mount('/tenant/agence-1/sales/mandates?priceMin=60000000');
    expect(await screen.findByText('MV-2026-0003', {}, T)).toBeInTheDocument();
    expect(screen.queryByText('MV-2026-0001')).not.toBeInTheDocument();
    expect(screen.queryByText('MV-2026-0002')).not.toBeInTheDocument();
  });

  it('« Effacer les critères » ramène toute la liste', async () => {
    const user = userEvent.setup({ delay: null });
    mount('/tenant/agence-1/sales/mandates?q=zzz');
    const barre = await screen.findByRole('search', {}, T);
    expect(await within(barre).findByText('0 résultat', {}, T)).toBeInTheDocument();
    await user.click(within(barre).getByRole('button', { name: 'Effacer les critères' }));
    expect(await screen.findByText('MV-2026-0003', {}, T)).toBeInTheDocument();
    expect(screen.getByTestId('adresse')).not.toHaveTextContent('q=');
  });

  it('peut charger une page au-delà de 500 mandats', async () => {
    listSaleMandates.mockImplementation(async (_tenant: string, params: Record<string, number>) => ({
      items: params.page === 26 ? [mandat({ id: 'm-501', number: 'MV-501' })] : [],
      total: 501,
      page: params.page,
      pageSize: params.limit
    }));
    mount('/tenant/agence-1/sales/mandates?page=26');
    expect(await screen.findByText('MV-501', {}, T)).toBeInTheDocument();
    expect(listSaleMandates).toHaveBeenCalledWith('agence-1', { page: 26, limit: 20 });
  });
});
