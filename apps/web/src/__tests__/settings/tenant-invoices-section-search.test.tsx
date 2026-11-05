import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { TenantInvoicesSection } from '../../components/subscription/TenantInvoicesSection';

/** Factures d'abonnement vues par l'agence : recherche serveur (statut, période, nature, montant). */

const listOwnPlatformInvoices = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../services/platform-billing-service', () => ({
  listOwnPlatformInvoices: (...a: unknown[]) => listOwnPlatformInvoices(...a),
  getPaymentAvailability: vi.fn().mockResolvedValue({ available: false, mode: 'REAL' }),
  getInvoiceCheckout: vi.fn(),
  startInvoiceCheckout: vi.fn(),
  downloadOwnInvoicePdf: vi.fn()
}));

const INVOICE = {
  id: 'inv-1',
  tenantId: 't1',
  invoiceNumber: 'IMT-2026-00001',
  nature: 'PERIOD',
  status: 'ISSUED',
  issueDate: '2026-02-01T00:00:00.000Z',
  dueDate: '2026-02-08T00:00:00.000Z',
  periodStart: '2026-02-01T00:00:00.000Z',
  periodEnd: '2026-03-01T00:00:00.000Z',
  currency: 'FCFA',
  amountTotal: 35282
};

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function mount(initial = '/tenant/t1/settings/billing') {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[initial]}>
        <Url />
        <TenantInvoicesSection tenantId="t1" />
      </MemoryRouter>
    </AntApp>
  );
}

const T = { timeout: 8000 };

beforeEach(() => {
  listOwnPlatformInvoices.mockReset();
  listOwnPlatformInvoices.mockResolvedValue({
    invoices: [INVOICE],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
  });
});

describe('<TenantInvoicesSection> — recherche', () => {
  it('lit la première page sans critère', async () => {
    mount();
    await screen.findByText('IMT-2026-00001', undefined, T);
    expect(listOwnPlatformInvoices).toHaveBeenCalledWith('t1', { page: 1, limit: 20 });
  });

  it('envoie la saisie à l’API après la temporisation et la met dans l’URL (préfixe fac)', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('IMT-2026-00001', undefined, T);

    await user.type(screen.getByPlaceholderText('Numéro de facture, référence de paiement…'), 'IMT-2026');

    await vi.waitFor(
      () => expect(listOwnPlatformInvoices).toHaveBeenLastCalledWith('t1', { search: 'IMT-2026', page: 1, limit: 20 }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('fac.q=IMT-2026');
  });

  it('applique les critères d’une URL partagée sans écraser ?paiement=', async () => {
    mount('/tenant/t1/settings/billing?fac.status=OVERDUE,FAILED&fac.periodFrom=2026-01-01&fac.nature=OVERAGE');
    await screen.findByText('IMT-2026-00001', undefined, T);
    expect(listOwnPlatformInvoices).toHaveBeenCalledWith('t1', {
      status: 'OVERDUE,FAILED',
      from: '2026-01-01',
      nature: 'OVERAGE',
      page: 1,
      limit: 20
    });
  });
});
