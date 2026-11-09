import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantPaymentAccountsSection } from '../../components/TenantPortal/TenantPaymentAccountsSection';
import { CoOwnerReceivingAccountsSection } from '../../components/coowner-portal/ReceivingAccountsSection';

/** Sections « Payer l'agence » des portails locataire et copropriétaire (spec 048, lot Q). */

const getReceivingAccounts = vi.fn();
vi.mock('../../services/tenantPortalService', () => ({
  tenantPortalService: { getReceivingAccounts: (...a: unknown[]) => getReceivingAccounts(...a) }
}));

const listMyReceivingAccounts = vi.fn();
vi.mock('../../services/coowner-portal-service', () => ({
  listMyReceivingAccounts: (...a: unknown[]) => listMyReceivingAccounts(...a)
}));

vi.mock('../../services/receiving-account-service', () => ({
  fetchReceivingAccountQr: vi.fn()
}));

const ACCOUNT = {
  id: 'a1',
  institution: 'Wave',
  scannableWith: null,
  alias: 'agence-soleil',
  holderName: 'Agence Soleil',
  instructions: null,
  hasQr: false,
  qrPath: null
};

function wrap(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => vi.clearAllMocks());

describe('Sections Payer l’agence', () => {
  it('locataire : affiche la carte, le motif, et le bouton ouvre la déclaration', async () => {
    getReceivingAccounts.mockResolvedValue([ACCOUNT]);
    const onDeclare = vi.fn();
    wrap(<TenantPaymentAccountsSection suggestedReason="Loyer 2026-11" onDeclare={onDeclare} />);
    expect(await screen.findByText('Payer l’agence')).toBeInTheDocument();
    expect(screen.getByText('Loyer 2026-11')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'J’ai payé : déclarer mon paiement' }));
    expect(onDeclare).toHaveBeenCalled();
  });

  it('locataire : rien sans compte actif', async () => {
    getReceivingAccounts.mockResolvedValue([]);
    const { container } = wrap(<TenantPaymentAccountsSection />);
    await waitFor(() => expect(getReceivingAccounts).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('locataire : rien si la lecture échoue', async () => {
    getReceivingAccounts.mockRejectedValue(new Error('500'));
    const { container } = wrap(<TenantPaymentAccountsSection />);
    await waitFor(() => expect(getReceivingAccounts).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('copropriétaire : affiche la carte', async () => {
    listMyReceivingAccounts.mockResolvedValue([ACCOUNT]);
    wrap(<CoOwnerReceivingAccountsSection suggestedReason="Appel de charges T4 — Lot 12" />);
    expect(await screen.findByText('agence-soleil')).toBeInTheDocument();
    expect(screen.getByText('Appel de charges T4 — Lot 12')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /déclarer mon paiement/ })).not.toBeInTheDocument();
  });

  it('copropriétaire : rien sans compte actif', async () => {
    listMyReceivingAccounts.mockResolvedValue([]);
    const { container } = wrap(<CoOwnerReceivingAccountsSection />);
    await waitFor(() => expect(listMyReceivingAccounts).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
