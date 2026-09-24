import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { InvoicesTab } from '../../components/admin/tenant-detail/InvoicesTab';

/** Lot G2 — onglet Factures SaaS de la fiche agence : marquer une facture payée. */

const listAdminInvoices = vi.fn();
const createAdminInvoice = vi.fn();
const updateAdminInvoice = vi.fn();
const markAdminInvoicePaid = vi.fn();

vi.mock('../../services/admin-subscription-service', () => ({
  listAdminInvoices: (...a: unknown[]) => listAdminInvoices(...a),
  createAdminInvoice: (...a: unknown[]) => createAdminInvoice(...a),
  updateAdminInvoice: (...a: unknown[]) => updateAdminInvoice(...a),
  markAdminInvoicePaid: (...a: unknown[]) => markAdminInvoicePaid(...a)
}));

const INVOICE = {
  id: 'inv-1',
  tenantId: 'tenant-1',
  subscriptionId: 'sub-1',
  invoiceNumber: 'INV-0001',
  issueDate: '2026-01-01T00:00:00.000Z',
  dueDate: '2026-01-15T00:00:00.000Z',
  currency: 'FCFA',
  amountTotal: 50000,
  status: 'ISSUED' as const,
  paidAt: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

function mount() {
  return render(
    <AntApp>
      <InvoicesTab tenantId="tenant-1" />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listAdminInvoices.mockResolvedValue({
    invoices: [INVOICE],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
  });
});

describe('InvoicesTab — liste', () => {
  it('affiche les factures de l’agence', async () => {
    mount();

    expect(await screen.findByText('INV-0001')).toBeInTheDocument();
    // L'espace entre milliers n'est pas une espace normale en `fr-FR` (Intl) :
    // motif plutôt qu'égalité stricte, comme ailleurs dans le dépôt.
    expect(screen.getByText(/50\s*000\s*FCFA/)).toBeInTheDocument();
  });
});

describe('InvoicesTab — marquer payée', () => {
  it('appelle l’API et rafraîchit la liste après confirmation', async () => {
    markAdminInvoicePaid.mockResolvedValue({ ...INVOICE, status: 'PAID', paidAt: '2026-01-10T00:00:00.000Z' });
    mount();

    await screen.findByText('INV-0001');
    const ligne = screen.getByText('INV-0001').closest('tr') as HTMLElement;
    fireEvent.click(within(ligne).getByRole('button', { name: 'Marquer payée' }));

    const dialogue = await screen.findByRole('dialog');
    expect(dialogue).toHaveTextContent('Marquer la facture INV-0001 comme payée ?');
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Marquer payée' }));

    await waitFor(() => expect(markAdminInvoicePaid).toHaveBeenCalledWith('inv-1'));
    expect(await screen.findByText('Facture marquée comme payée')).toBeInTheDocument();
    expect(listAdminInvoices).toHaveBeenCalledTimes(2);
  });

  it('ne propose pas « Marquer payée » sur une facture déjà payée', async () => {
    listAdminInvoices.mockResolvedValue({
      invoices: [{ ...INVOICE, status: 'PAID', paidAt: '2026-01-10T00:00:00.000Z' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    });
    mount();

    await screen.findByText('INV-0001');
    const ligne = screen.getByText('INV-0001').closest('tr') as HTMLElement;
    expect(within(ligne).queryByRole('button', { name: 'Marquer payée' })).not.toBeInTheDocument();
  });
});
