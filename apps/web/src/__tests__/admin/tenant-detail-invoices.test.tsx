import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { InvoicesTab } from '../../components/admin/tenant-detail/InvoicesTab';

/**
 * Onglet Factures de la fiche agence (vague 3) — factures d'abonnement
 * PLATFORM. `services/platform-billing-service.ts` est mocké en entier :
 * Vitest refuse tout import qu'un `vi.mock` ne déclare pas.
 */

const listAdminPlatformInvoices = vi.fn();
const getAdminPlatformInvoice = vi.fn();
const generatePlatformInvoice = vi.fn();
const issuePlatformInvoice = vi.fn();
const issueCreditNote = vi.fn();
const downloadAdminInvoicePdf = vi.fn();
const recordManualPayment = vi.fn();
const getAdminInvoicePayment = vi.fn();
const downloadPaymentProof = vi.fn();

vi.mock('../../services/platform-billing-service', () => ({
  listAdminPlatformInvoices: (...a: unknown[]) => listAdminPlatformInvoices(...a),
  getAdminPlatformInvoice: (...a: unknown[]) => getAdminPlatformInvoice(...a),
  generatePlatformInvoice: (...a: unknown[]) => generatePlatformInvoice(...a),
  issuePlatformInvoice: (...a: unknown[]) => issuePlatformInvoice(...a),
  issueCreditNote: (...a: unknown[]) => issueCreditNote(...a),
  downloadAdminInvoicePdf: (...a: unknown[]) => downloadAdminInvoicePdf(...a),
  recordManualPayment: (...a: unknown[]) => recordManualPayment(...a),
  getAdminInvoicePayment: (...a: unknown[]) => getAdminInvoicePayment(...a),
  downloadPaymentProof: (...a: unknown[]) => downloadPaymentProof(...a)
}));

const BASE = {
  tenantId: 'tenant-1',
  nature: 'PERIOD' as const,
  issueDate: '2026-02-01T00:00:00.000Z',
  issuedAt: '2026-02-01T00:00:00.000Z',
  dueDate: '2026-02-08T00:00:00.000Z',
  periodStart: '2026-02-01T00:00:00.000Z',
  periodEnd: '2026-03-01T00:00:00.000Z',
  currency: 'FCFA',
  amountExclTax: 29_900,
  taxRate: 18,
  taxAmount: 5_382,
  amountTotal: 35_282,
  paidAt: null,
  paymentMethod: null,
  paymentReference: null,
  canceledAt: null,
  cancelReason: null,
  creditedInvoice: null,
  sentAt: null,
  notes: null
};

const ISSUED = { ...BASE, id: 'inv-1', invoiceNumber: 'IMT-2026-00001', status: 'ISSUED' as const };
const DRAFT = { ...BASE, id: 'inv-2', invoiceNumber: null, status: 'DRAFT' as const };

function mount() {
  return render(
    <AntApp>
      <InvoicesTab tenantId="tenant-1" />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listAdminPlatformInvoices.mockResolvedValue({
    invoices: [ISSUED, DRAFT],
    pagination: { page: 1, limit: 20, total: 2, totalPages: 1 }
  });
});

describe('InvoicesTab — factures d’abonnement', () => {
  it('liste les factures avec numéro, montant TTC et statut', async () => {
    mount();
    expect(await screen.findByText('IMT-2026-00001')).toBeInTheDocument();
    expect(screen.getByText('Émise')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Brouillon' })).toBeInTheDocument();
    expect(listAdminPlatformInvoices).toHaveBeenCalledWith('tenant-1', { page: 1, limit: 20 });
  });

  it('émet un brouillon après confirmation', async () => {
    issuePlatformInvoice.mockResolvedValue({ ...DRAFT, status: 'ISSUED' });
    mount();
    await screen.findByText('IMT-2026-00001');
    fireEvent.click(screen.getByRole('button', { name: 'Émettre' }));
    const dialogue = await screen.findByRole('dialog');
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Émettre' }));
    await waitFor(() => expect(issuePlatformInvoice).toHaveBeenCalledWith('tenant-1', 'inv-2'));
  });

  it('constate un paiement manuel avec mode, date et référence', async () => {
    recordManualPayment.mockResolvedValue({ payment: { id: 'pay-1' }, subscription: 'RENEWED' });
    const user = userEvent.setup();
    mount();
    await screen.findByText('IMT-2026-00001');
    await user.click(screen.getByRole('button', { name: 'Marquer payée' }));
    const dialogue = await screen.findByRole('dialog');
    await user.type(within(dialogue).getByPlaceholderText('N° de virement, de transaction, de chèque…'), 'VIR-42');
    await user.click(within(dialogue).getByRole('button', { name: 'Enregistrer le paiement' }));

    await waitFor(() => expect(recordManualPayment).toHaveBeenCalled());
    const [tenantId, invoiceId, input] = recordManualPayment.mock.calls[0];
    expect(tenantId).toBe('tenant-1');
    expect(invoiceId).toBe('inv-1');
    expect(input).toMatchObject({ method: 'BANK_TRANSFER', reference: 'VIR-42', proof: null });
    expect(typeof input.paidAt).toBe('string');
    expect(await screen.findByText('Paiement enregistré : abonnement réactivé')).toBeInTheDocument();
  });

  it('émet un avoir avec un motif', async () => {
    issueCreditNote.mockResolvedValue({ ...ISSUED, id: 'inv-3', nature: 'CREDIT_NOTE' });
    const user = userEvent.setup();
    mount();
    await screen.findByText('IMT-2026-00001');
    await user.click(screen.getByRole('button', { name: 'Avoir' }));
    const dialogue = await screen.findByRole('dialog');
    await user.type(within(dialogue).getByRole('textbox'), 'Erreur de pack');
    await user.click(within(dialogue).getByRole('button', { name: "Émettre l'avoir" }));
    await waitFor(() =>
      expect(issueCreditNote).toHaveBeenCalledWith('tenant-1', 'inv-1', { reason: 'Erreur de pack', reissuePending: false })
    );
  });

  it('télécharge le PDF', async () => {
    downloadAdminInvoicePdf.mockResolvedValue(undefined);
    mount();
    await screen.findByText('IMT-2026-00001');
    fireEvent.click(screen.getAllByRole('button', { name: /PDF/ })[0]);
    await waitFor(() => expect(downloadAdminInvoicePdf).toHaveBeenCalledWith('tenant-1', ISSUED));
  });

  it('génère la facture de la période suivante', async () => {
    generatePlatformInvoice.mockResolvedValue({ invoice: DRAFT, created: true });
    const user = userEvent.setup();
    mount();
    await screen.findByText('IMT-2026-00001');
    await user.click(screen.getByRole('button', { name: /Générer une facture/ }));
    const dialogue = await screen.findByRole('dialog');
    await user.click(within(dialogue).getByRole('button', { name: 'Générer' }));
    await waitFor(() => expect(generatePlatformInvoice).toHaveBeenCalledWith('tenant-1', { nature: 'PERIOD', issue: false }));
  });

  it('ouvre le détail avec le règlement et les tentatives en ligne', async () => {
    getAdminPlatformInvoice.mockResolvedValue({ ...ISSUED, lines: [] });
    getAdminInvoicePayment.mockResolvedValue({
      payment: null,
      checkouts: [
        {
          id: 'co-1',
          invoiceId: 'inv-1',
          codePaiement: 'IMP-abc',
          status: 'REVIEW',
          mode: 'SIMULATOR',
          amount: 35_282,
          currency: 'FCFA',
          checkoutUrl: null,
          providerServiceName: null,
          failureMessage: null,
          reviewReason: 'Montant reçu différent',
          createdAt: '2026-02-02T00:00:00.000Z',
          completedAt: null
        }
      ]
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'IMT-2026-00001' }));
    expect(await screen.findByText('IMP-abc')).toBeInTheDocument();
    expect(screen.getByText('Montant reçu différent')).toBeInTheDocument();
    expect(screen.getByText('Aucun règlement enregistré.')).toBeInTheDocument();
  });
});
