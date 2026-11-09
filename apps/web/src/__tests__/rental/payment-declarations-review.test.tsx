import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { PaymentDeclarationsList } from '../../components/rental/PaymentDeclarationsList';

/** Liste des déclarations : statut `ALL`, 409 « déjà traitée » et lecture détaillée. */

const listPaymentDeclarations = vi.hoisted(() => vi.fn());
const approveRentalDeclaration = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../services/rental-service', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/rental-service')>()),
  listPaymentDeclarations: (...a: unknown[]) => listPaymentDeclarations(...a)
}));
vi.mock('../../utils/api-client', () => ({ default: { get: (...a: unknown[]) => get(...a) } }));
vi.mock('../../services/rental-declared-payment-service', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/rental-declared-payment-service')>()),
  approveRentalDeclaration: (...a: unknown[]) => approveRentalDeclaration(...a),
  getRentalPendingCount: vi.fn().mockResolvedValue({ pending: 0, overdue: 0 })
}));
vi.mock('../../components/finance/TreasuryAccountSelector', () => ({ TreasuryAccountSelector: () => null }));

const T = { timeout: 8000 };

const VIEW = {
  id: 'decl-1',
  status: 'PENDING',
  leaseId: 'lease-1',
  leaseNumber: 'BAIL-1',
  declaredBy: { type: 'TENANT', clientId: 'c1', name: 'Awa Konan' },
  installment: null,
  receivingNumber: null,
  operator: 'ORANGE',
  payerPhone: null,
  amount: 150000,
  acceptedAmount: null,
  paidAt: '2026-04-01T10:00:00.000Z',
  reference: 'OM-998877',
  alerts: []
};

const ROW = {
  id: 'decl-1',
  created_at: '2026-04-01T00:00:00.000Z',
  payment_date: '2026-04-01T00:00:00.000Z',
  amount: 150000,
  payment_method: 'MOBILE_MONEY',
  status: 'PENDING',
  reference: 'OM-998877',
  lease: { lease_number: 'BAIL-1', property: { title: 'Villa Cocody' } },
  declarer: { user: { fullName: 'Awa Konan' } }
};

const reponse = (items: unknown[]) => ({
  success: true,
  data: items,
  pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 }
});

const renderList = () =>
  render(
    <AntApp>
      <MemoryRouter>
        <PaymentDeclarationsList tenantId="agence-1" canReview />
      </MemoryRouter>
    </AntApp>
  );

beforeEach(() => {
  listPaymentDeclarations.mockReset();
  approveRentalDeclaration.mockReset();
  get.mockReset();
});

describe('Déclarations : revue', () => {
  it('sans statut choisi, envoie status ALL (l’API lit l’absence comme PENDING)', async () => {
    listPaymentDeclarations.mockResolvedValue(reponse([{ ...ROW, view: VIEW }]));
    renderList();
    await screen.findByText('OM-998877', undefined, T);
    expect(listPaymentDeclarations.mock.calls[0][1]).toMatchObject({ status: 'ALL' });
  });

  it('409 déjà traitée : modale et tiroir se ferment, la liste se recharge', async () => {
    const user = userEvent.setup();
    listPaymentDeclarations.mockResolvedValue(reponse([{ ...ROW, view: VIEW }]));
    get.mockResolvedValue({ data: { success: true, data: { ...ROW, view: VIEW } } });
    approveRentalDeclaration.mockRejectedValue({
      response: { data: { code: 'RENTAL_DECLARATION_ALREADY_REVIEWED', message: 'déjà traitée' } }
    });
    renderList();
    await screen.findByText('OM-998877', undefined, T);

    await user.click(screen.getByRole('button', { name: 'Détail' }));
    await screen.findByRole('dialog', undefined, T);
    // Le tiroir lit la forme réelle `{ ...ligne, view }` sans planter.
    expect(await screen.findByText('Déclarant', undefined, T)).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /Approuver/ })[0]);
    await user.click(await screen.findByRole('button', { name: 'Valider telle que déclarée' }, T));

    await waitFor(() => expect(approveRentalDeclaration).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), T);
    expect(listPaymentDeclarations.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('ligne sans view : le détail est lu et lu depuis view', async () => {
    const user = userEvent.setup();
    listPaymentDeclarations.mockResolvedValue(reponse([ROW]));
    get.mockResolvedValue({ data: { success: true, data: { ...ROW, view: VIEW } } });
    renderList();
    await screen.findByText('OM-998877', undefined, T);
    await user.click(screen.getAllByRole('button', { name: /Approuver/ })[0]);
    expect(await screen.findByText('Valider la déclaration de paiement', undefined, T)).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/payment-declarations/decl-1'));
  });
});
