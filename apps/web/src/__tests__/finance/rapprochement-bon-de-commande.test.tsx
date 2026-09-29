import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FactureFournisseur } from '../../pages/finance/FactureFournisseur';
import { BonDeCommande } from '../../pages/finance/BonDeCommande';
import type { Supplier, SupplierInvoice } from '../../types/finance-lot2-types';
import type { PurchaseOrder } from '../../types/finance-lot3-types';

/**
 * Rapprochement d'une facture fournisseur à un bon de commande
 * (BUG-2026-09-29-033) — scénario F.16 : la route et le service existaient,
 * aucun écran ne les appelait.
 *
 * Mock à la frontière des services (lots 2 et 3), comme `fournisseurs.test.tsx`
 * et `bons-de-commande.test.tsx` : chaque export utilisé par les écrans montés
 * est déclaré, Vitest refusant l'import d'un export absent de la factory.
 */

const listSuppliers = vi.fn();
const listSupplierInvoices = vi.fn();
const getSupplierInvoice = vi.fn();
const createSupplierInvoice = vi.fn();
const validateSupplierInvoice = vi.fn();
const voidSupplierInvoice = vi.fn();
const createSupplierPayment = vi.fn();
const listSupplierPayments = vi.fn();
const validateSupplierPayment = vi.fn();
const voidSupplierPayment = vi.fn();
const listConstructionSites = vi.fn();
const listCostCategories = vi.fn();

vi.mock('../../services/finance-lot2-service', () => ({
  listSuppliers: (...a: unknown[]) => listSuppliers(...a),
  listSupplierInvoices: (...a: unknown[]) => listSupplierInvoices(...a),
  getSupplierInvoice: (...a: unknown[]) => getSupplierInvoice(...a),
  createSupplierInvoice: (...a: unknown[]) => createSupplierInvoice(...a),
  validateSupplierInvoice: (...a: unknown[]) => validateSupplierInvoice(...a),
  voidSupplierInvoice: (...a: unknown[]) => voidSupplierInvoice(...a),
  createSupplierPayment: (...a: unknown[]) => createSupplierPayment(...a),
  listSupplierPayments: (...a: unknown[]) => listSupplierPayments(...a),
  validateSupplierPayment: (...a: unknown[]) => validateSupplierPayment(...a),
  voidSupplierPayment: (...a: unknown[]) => voidSupplierPayment(...a),
  listConstructionSites: (...a: unknown[]) => listConstructionSites(...a),
  listCostCategories: (...a: unknown[]) => listCostCategories(...a)
}));

const listPurchaseOrders = vi.fn();
const getPurchaseOrder = vi.fn();
const createPurchaseOrder = vi.fn();
const issuePurchaseOrder = vi.fn();
const cancelPurchaseOrder = vi.fn();
const setPurchaseOrderForSupplierInvoice = vi.fn();

vi.mock('../../services/finance-lot3-service', () => ({
  listPurchaseOrders: (...a: unknown[]) => listPurchaseOrders(...a),
  getPurchaseOrder: (...a: unknown[]) => getPurchaseOrder(...a),
  createPurchaseOrder: (...a: unknown[]) => createPurchaseOrder(...a),
  issuePurchaseOrder: (...a: unknown[]) => issuePurchaseOrder(...a),
  cancelPurchaseOrder: (...a: unknown[]) => cancelPurchaseOrder(...a),
  setPurchaseOrderForSupplierInvoice: (...a: unknown[]) => setPurchaseOrderForSupplierInvoice(...a)
}));

vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set<string>(), permissions: null, ready: true })
}));

vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: vi.fn().mockResolvedValue([])
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function fournisseur(): Supplier {
  return {
    id: 'frs-01',
    name: 'BTP Sahel OI',
    kind: 'MATERIALS',
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    maintenanceVendorId: null,
    thirdPartyAccountId: 'compte-frs-01',
    isActive: true
  } as Supplier;
}

function facture(overrides: Partial<SupplierInvoice> = {}): SupplierInvoice {
  return {
    id: 'fact-01',
    supplierId: 'frs-01',
    supplierLabel: 'BTP Sahel OI',
    siteId: 'chantier-1',
    siteLabel: 'Chantier Saphir OI',
    invoiceDate: '2026-09-29',
    reference: 'FAC-BTP-001',
    amount: 30_000,
    currency: 'XOF',
    status: 'DRAFT',
    validatedAt: null,
    purchaseOrderId: null,
    ...overrides
  };
}

function bon(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 'bon-01',
    siteId: 'chantier-1',
    siteLabel: 'Chantier Saphir OI',
    supplierId: 'frs-01',
    supplierLabel: 'BTP Sahel OI',
    reference: 'BC-BTP-001',
    orderDate: '2026-09-28',
    status: 'ISSUED',
    currency: 'XOF',
    lines: [
      { id: 'l1', costCategoryId: 'poste-1', costCategoryLabel: 'Gros œuvre', label: 'Coulage dalle', amount: 80_000 }
    ],
    totalAmount: 80_000,
    invoicedAmount: 0,
    remainingAmount: 80_000,
    invoicingState: 'NOT_INVOICED',
    ...overrides
  };
}

function mountFacture() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-01']}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/factures-fournisseurs" element={<FactureFournisseur />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function mountBon() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/finance/bons-de-commande/bon-01']}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/bons-de-commande/:orderId" element={<BonDeCommande />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listSuppliers.mockResolvedValue([fournisseur()]);
  listSupplierPayments.mockResolvedValue([]);
  listConstructionSites.mockResolvedValue([]);
  listCostCategories.mockResolvedValue([]);
  listSupplierInvoices.mockResolvedValue([facture()]);
  listPurchaseOrders.mockResolvedValue([bon()]);
});

describe('Rapprochement facture fournisseur — bon de commande', () => {
  it('rapproche une facture en brouillon d’un bon émis du même fournisseur et chantier, avec ses montants et son écart', async () => {
    setPurchaseOrderForSupplierInvoice.mockResolvedValue(bon());
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    mountFacture();

    await user.click(await screen.findByRole('button', { name: 'Rapprocher d’un bon' }, { timeout: 8000 }));

    // Seuls les bons du même fournisseur ET du même chantier sont demandés.
    await waitFor(() =>
      expect(listPurchaseOrders).toHaveBeenCalledWith('agence-1', { supplierId: 'frs-01', siteId: 'chantier-1' })
    );

    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Bon de commande' }));
    fireEvent.click(await screen.findByText(/BC-BTP-001 — Non facturé/));

    // Engagé, facturé, reste à facturer du bon, et montant de la facture.
    expect(await screen.findByText('Engagé (montant du bon)')).toBeInTheDocument();
    expect(screen.getAllByText(/80\s000/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/30\s000/).length).toBeGreaterThanOrEqual(2);
    // Écart négatif : il resterait 50 000 à facturer après validation.
    expect(screen.getByText(/il resterait .*50\s000.* à facturer/)).toBeInTheDocument();
    expect(screen.getByText('Coulage dalle')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rapprocher' }));

    await waitFor(() =>
      expect(setPurchaseOrderForSupplierInvoice).toHaveBeenCalledWith('agence-1', 'fact-01', 'bon-01')
    );
  }, 40000);

  it('avertit quand la facture dépasse le reste à facturer du bon', async () => {
    listSupplierInvoices.mockResolvedValue([facture({ amount: 100_000 })]);
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    mountFacture();

    await user.click(await screen.findByRole('button', { name: 'Rapprocher d’un bon' }, { timeout: 8000 }));
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Bon de commande' }));
    fireEvent.click(await screen.findByText(/BC-BTP-001/));

    expect(await screen.findByText(/dépasse de .*20\s000.* le reste à facturer/)).toBeInTheDocument();
  }, 40000);

  it('ne propose pas les bons non émis, et n’offre le geste que sur une facture en brouillon', async () => {
    listSupplierInvoices.mockResolvedValue([
      facture({ id: 'fact-valid', reference: 'FAC-VALIDE', status: 'VALIDATED' })
    ]);
    mountFacture();

    await screen.findByText('FAC-VALIDE', {}, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: 'Rapprocher d’un bon' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Changer de bon' })).not.toBeInTheDocument();
  }, 30000);

  it('montre le bon déjà rapproché et permet de défaire le rapprochement', async () => {
    listSupplierInvoices.mockResolvedValue([facture({ purchaseOrderId: 'bon-01' })]);
    setPurchaseOrderForSupplierInvoice.mockResolvedValue(null);
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    mountFacture();

    // La colonne « Bon de commande » nomme le bon par sa référence, jamais son identifiant.
    expect(await screen.findByText('BC-BTP-001', {}, { timeout: 8000 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Changer de bon' }));
    await user.click(await screen.findByRole('button', { name: 'Défaire le rapprochement' }));

    await waitFor(() => expect(setPurchaseOrderForSupplierInvoice).toHaveBeenCalledWith('agence-1', 'fact-01', null));
  }, 40000);

  it('affiche l’erreur du serveur telle quelle quand le rapprochement est refusé', async () => {
    setPurchaseOrderForSupplierInvoice.mockRejectedValue({
      response: { data: { message: 'La facture et le bon de commande ne portent pas le même chantier' } }
    });
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    mountFacture();

    await user.click(await screen.findByRole('button', { name: 'Rapprocher d’un bon' }, { timeout: 8000 }));
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Bon de commande' }));
    fireEvent.click(await screen.findByText(/BC-BTP-001/));
    await user.click(screen.getByRole('button', { name: 'Rapprocher' }));

    expect(await screen.findByText(/ne portent pas le même chantier/)).toBeInTheDocument();
  }, 40000);
});

describe('Fiche du bon — factures rapprochées', () => {
  it('liste les factures rapprochées du bon, validées ou non', async () => {
    getPurchaseOrder.mockResolvedValue(
      bon({
        invoicedAmount: 30_000,
        remainingAmount: 50_000,
        invoicingState: 'PARTIALLY_INVOICED',
        invoices: [
          { id: 'f1', reference: 'FAC-BTP-001', invoiceDate: '2026-09-29', amount: 30_000, status: 'VALIDATED' },
          { id: 'f2', reference: 'FAC-BTP-002', invoiceDate: '2026-09-30', amount: 10_000, status: 'DRAFT' }
        ]
      })
    );
    mountBon();

    expect(await screen.findByText('Factures rapprochées', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('FAC-BTP-001')).toBeInTheDocument();
    expect(screen.getByText('FAC-BTP-002')).toBeInTheDocument();
    expect(screen.getByText('Reste à facturer')).toBeInTheDocument();
  }, 30000);

  it('dit qu’aucune facture n’est rapprochée quand la liste est vide', async () => {
    getPurchaseOrder.mockResolvedValue(bon({ invoices: [] }));
    mountBon();

    expect(
      await screen.findByText(/Aucune facture n'est rapprochée de ce bon/, {}, { timeout: 8000 })
    ).toBeInTheDocument();
  }, 30000);
});
