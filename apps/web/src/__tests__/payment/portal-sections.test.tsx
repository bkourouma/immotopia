import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CoOwnerChargeCall } from '../../services/coowner-portal-service';
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

function call(overrides: Partial<CoOwnerChargeCall> & { lotNumber?: string } = {}): CoOwnerChargeCall {
  const { lotNumber = '12', ...rest } = overrides;
  return {
    id: 'c1',
    period: '2026-T3',
    amount: 100000,
    paid: 0,
    outstanding: 100000,
    currency: 'XOF',
    dueDate: '2026-07-01',
    status: 'PENDING',
    lot: { id: `lot-${lotNumber}`, lotNumber, lotType: 'APARTMENT' },
    syndicate: null,
    syndicateId: 'syn-a',
    onlinePayable: false,
    onlineCheckout: 'NONE',
    onlineCheckoutCode: null,
    ...rest
  };
}

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

  it('copropriétaire : une seule copropriété, carte sans nom et motif de son plus ancien appel', async () => {
    listMyReceivingAccounts.mockResolvedValue([{ ...ACCOUNT, syndicateId: 'syn-a' }]);
    wrap(
      <CoOwnerReceivingAccountsSection
        calls={[call({ id: 'c2', period: '2026-T4', dueDate: '2026-10-01' }), call({ id: 'c1', period: '2026-T3' })]}
        syndicateNames={{ 'syn-a': 'Résidence Les Palmiers' }}
      />
    );
    expect(await screen.findByText('agence-soleil')).toBeInTheDocument();
    expect(screen.getByText('Payer l’agence')).toBeInTheDocument();
    // Trié par échéance : l'appel du T3 (juillet) passe avant celui du T4, arrivé en premier.
    expect(screen.getByText('Appel de charges 2026-T3 — Lot 12')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /déclarer mon paiement/ })).not.toBeInTheDocument();
  });

  it('copropriétaire : deux copropriétés, deux groupes distincts, chacun son motif et sa déclaration', async () => {
    listMyReceivingAccounts.mockResolvedValue([
      { ...ACCOUNT, id: 'a1', syndicateId: 'syn-a', alias: 'alias-palmiers' },
      { ...ACCOUNT, id: 'b1', syndicateId: 'syn-b', alias: 'alias-baobabs' },
      { ...ACCOUNT, id: 'a2', syndicateId: 'syn-a', institution: 'Orange Money', alias: 'alias-palmiers-om' }
    ]);
    const onDeclare = vi.fn();
    wrap(
      <CoOwnerReceivingAccountsSection
        calls={[
          call({ id: 'cb', syndicateId: 'syn-b', period: '2026-T1', dueDate: '2026-01-01', lotNumber: '7' }),
          call({ id: 'ca', syndicateId: 'syn-a', period: '2026-T2', dueDate: '2026-04-01' })
        ]}
        syndicateNames={{ 'syn-a': 'Résidence Les Palmiers', 'syn-b': 'Résidence Les Baobabs' }}
        declarableSyndicateIds={['syn-b']}
        onDeclare={onDeclare}
      />
    );
    const palmiers = (await screen.findByText('Payer l’agence — Résidence Les Palmiers')).closest('.ant-card');
    const baobabs = screen.getByText('Payer l’agence — Résidence Les Baobabs').closest('.ant-card');
    expect(palmiers).not.toBeNull();
    expect(baobabs).not.toBeNull();
    const inPalmiers = within(palmiers as HTMLElement);
    const inBaobabs = within(baobabs as HTMLElement);

    expect(inPalmiers.getByText('alias-palmiers')).toBeInTheDocument();
    expect(inPalmiers.getByText('alias-palmiers-om')).toBeInTheDocument();
    expect(inPalmiers.queryByText('alias-baobabs')).not.toBeInTheDocument();
    expect(inPalmiers.getByText('Appel de charges 2026-T2 — Lot 12')).toBeInTheDocument();
    expect(inPalmiers.queryByRole('button', { name: /déclarer mon paiement/ })).not.toBeInTheDocument();

    expect(inBaobabs.getByText('alias-baobabs')).toBeInTheDocument();
    expect(inBaobabs.getByText('Appel de charges 2026-T1 — Lot 7')).toBeInTheDocument();
    fireEvent.click(inBaobabs.getByRole('button', { name: 'J’ai payé : déclarer mon paiement' }));
    expect(onDeclare).toHaveBeenCalledWith('syn-b');
  });

  it('copropriétaire : nom inconnu, libellé neutre plutôt qu’un nom inventé', async () => {
    listMyReceivingAccounts.mockResolvedValue([
      { ...ACCOUNT, id: 'a1', syndicateId: 'syn-a' },
      { ...ACCOUNT, id: 'b1', syndicateId: 'syn-b' }
    ]);
    wrap(<CoOwnerReceivingAccountsSection syndicateNames={{ 'syn-a': 'Résidence Les Palmiers' }} />);
    expect(await screen.findByText('Payer l’agence — Résidence Les Palmiers')).toBeInTheDocument();
    expect(screen.getByText('Payer l’agence — Copropriété (nom non disponible)')).toBeInTheDocument();
  });

  it('copropriétaire : rien sans compte actif', async () => {
    listMyReceivingAccounts.mockResolvedValue([]);
    const { container } = wrap(<CoOwnerReceivingAccountsSection />);
    await waitFor(() => expect(listMyReceivingAccounts).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
