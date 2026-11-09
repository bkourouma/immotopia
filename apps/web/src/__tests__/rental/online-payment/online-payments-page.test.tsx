import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';

const access = vi.fn();
vi.mock('../../../hooks/useMenuAccess', () => ({ useMyMenuAccess: () => access() }));
const availability = vi.fn();
const summary = vi.fn();
vi.mock('../../../services/rental-online-payment-service', () => ({
  getRentalOnlinePaymentAvailability: (...a: unknown[]) => availability(...a),
  getRentalOnlinePaymentsSummary: (...a: unknown[]) => summary(...a)
}));
const tableProps = vi.fn();
const panelProps = vi.fn();
vi.mock('../../../components/rental/online-payment/CheckoutsTable', () => ({
  RentalOnlineCheckoutsTable: (p: unknown) => {
    tableProps(p);
    return <div data-testid="table" />;
  }
}));
vi.mock('../../../components/rental/online-payment/ReviewDecisionModal', () => ({
  RentalReviewDecisionModal: () => null
}));
vi.mock('../../../components/rental/online-payment/CollectionAccountPanel', () => ({
  CollectionAccountPanel: (p: unknown) => {
    panelProps(p);
    return <div data-testid="panel" />;
  }
}));

import { OnlinePayments } from '../../../pages/rental/OnlinePayments';

function renderPage() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/t1/rental/online-payments']}>
        <Routes>
          <Route path="/tenant/:tenantId/rental/online-payments" element={<OnlinePayments />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

const lastProps = (fn: typeof tableProps) => fn.mock.calls[fn.mock.calls.length - 1][0] as Record<string, unknown>;

describe('page Paiements en ligne (locatif)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.mockReturnValue({ permissions: null, ready: true });
    availability.mockResolvedValue({ usable: true, unavailableReason: null });
    summary.mockResolvedValue({ reviewPending: 0 });
  });

  it('affiche les deux onglets, Suivi par défaut, et bascule vers Compte de collecte', async () => {
    renderPage();
    expect(screen.getByText('Suivi des paiements en ligne')).toBeInTheDocument();
    expect(screen.getByTestId('table')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Compte de collecte'));
    await waitFor(() => expect(screen.getByTestId('panel')).toBeInTheDocument());
  });

  it('reste en lecture seule sans RENTAL_PAYMENTS_ALLOCATE', async () => {
    access.mockReturnValue({ permissions: new Set(['RENTAL_PAYMENTS_VIEW']), ready: true });
    renderPage();
    expect(lastProps(tableProps).canDecide).toBe(false);
    fireEvent.click(screen.getByText('Compte de collecte'));
    await waitFor(() => expect(panelProps).toHaveBeenCalled());
    expect(lastProps(panelProps).canReverse).toBe(false);
  });

  it('autorise avec RENTAL_PAYMENTS_ALLOCATE ou sans restriction', () => {
    access.mockReturnValue({ permissions: new Set(['RENTAL_PAYMENTS_ALLOCATE']), ready: true });
    const first = renderPage();
    expect(lastProps(tableProps).canDecide).toBe(true);
    first.unmount();
    access.mockReturnValue({ permissions: null, ready: true });
    renderPage();
    expect(lastProps(tableProps).canDecide).toBe(true);
  });

  it('affiche une alerte quand le paiement en ligne est indisponible', async () => {
    availability.mockResolvedValue({ usable: false, unavailableReason: 'NOT_CONFIGURED' });
    renderPage();
    expect(await screen.findByText('Le paiement en ligne n’est pas configuré pour votre agence.')).toBeInTheDocument();
  });

  it('ignore un échec de lecture de la disponibilité', async () => {
    availability.mockRejectedValue(new Error('x'));
    renderPage();
    await waitFor(() => expect(availability).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
