import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { CheckoutsTable } from '../../../components/syndics/online-payment/CheckoutsTable';
import { PayoutsPanel } from '../../../components/syndics/online-payment/PayoutsPanel';

/**
 * Lot SYN-A, phase 2 : recherche des paiements en ligne (serveur, préfixe
 * `co`) et des reversements (locale, liste bornée à 50 par l'API).
 */

configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 60000 });

const listSyndicOnlineCheckouts = vi.fn();
const listSyndicGatewayPayouts = vi.fn();
const listSyndicReceivingNumbers = vi.fn();

vi.mock('../../../services/syndic-online-payment-service', () => ({
  listSyndicOnlineCheckouts: (...a: unknown[]) => listSyndicOnlineCheckouts(...a),
  verifySyndicOnlineCheckout: vi.fn(),
  listSyndicGatewayPayouts: (...a: unknown[]) => listSyndicGatewayPayouts(...a),
  recordSyndicGatewayPayout: vi.fn()
}));

vi.mock('../../../services/syndic-declared-payment-service', () => ({
  listSyndicReceivingNumbers: (...a: unknown[]) => listSyndicReceivingNumbers(...a)
}));

vi.mock('../../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const CHECKOUT = {
  id: 'co-1',
  codePaiement: 'IMS-ABCDEFGHIJ0123456789',
  status: 'SUCCESS',
  origin: 'PORTAL',
  mode: 'LIVE',
  amount: 50000,
  receivedAmount: 50000,
  currency: 'XOF',
  lot: { id: 'lot-1', lotNumber: 'A12' },
  payer: { contactId: 'c1', name: 'Awa Koné' },
  chargeCalls: [{ id: 'cc-1', period: 'T3 2026' }],
  providerServiceName: 'Wave',
  providerTransactionId: 'TX-1',
  providerFees: null,
  failureMessage: null,
  reviewKind: null,
  reviewReason: null,
  resolution: null,
  resolutionNote: null,
  resolvedAt: null,
  resolvedByName: null,
  chargePaymentId: null,
  lastCheckedAt: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  completedAt: null
};

const checkoutsResponse = (items: unknown[]) => ({
  items,
  pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
  counts: { SUCCESS: items.length }
});

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function mount(node: React.ReactNode, initial = '/paiements') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          {node}
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const searchBox = (name: RegExp) => within(screen.getByRole('search', { name })).getAllByRole('textbox')[0];
const lastQuery = () => listSyndicOnlineCheckouts.mock.calls[listSyndicOnlineCheckouts.mock.calls.length - 1][2];

beforeEach(() => {
  vi.clearAllMocks();
  listSyndicOnlineCheckouts.mockResolvedValue(checkoutsResponse([CHECKOUT]));
  listSyndicGatewayPayouts.mockResolvedValue({ items: [] });
  listSyndicReceivingNumbers.mockResolvedValue([]);
});

describe('CheckoutsTable : recherche serveur', () => {
  const table = () => <CheckoutsTable tenantId="t1" syndicId="s1" canEdit onDecide={vi.fn()} />;

  it('charge la première page sans critère', async () => {
    mount(table());
    expect(await screen.findByText('A12')).toBeInTheDocument();
    expect(lastQuery()).toEqual({ page: 1, limit: 20 });
  });

  it('envoie la saisie (search) après le debounce et la met dans l’URL', async () => {
    const user = userEvent.setup();
    mount(table());
    await screen.findByText('A12');
    await user.type(searchBox(/paiements en ligne/), 'Awa');
    await waitFor(() => expect(lastQuery()).toEqual({ search: 'Awa', page: 1, limit: 20 }));
    expect(screen.getByTestId('url').textContent).toContain('co.q=Awa');
  });

  it('applique statut, origine et période d’une URL partagée (statuts renvoyés en tableau)', async () => {
    mount(
      table(),
      '/paiements?co.status=REVIEW,PENDING&co.origin=PORTAL&co.periodFrom=2026-10-01&co.periodTo=2026-10-31'
    );
    await screen.findByText('A12');
    expect(lastQuery()).toEqual({
      status: ['REVIEW', 'PENDING'],
      origin: 'PORTAL',
      from: '2026-10-01',
      to: '2026-10-31',
      page: 1,
      limit: 20
    });
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    listSyndicOnlineCheckouts.mockImplementation(async (_t: string, _s: string, query: { search?: string }) =>
      checkoutsResponse(query.search ? [] : [CHECKOUT])
    );
    mount(table(), '/paiements?co.q=zzz');
    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.')).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('A12')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).not.toContain('co.q=');
  });
});

describe('PayoutsPanel : recherche locale', () => {
  const PAYOUTS = [
    {
      entryId: 'e1',
      reference: 'VIR-OCTOBRE',
      date: '2026-10-05',
      amount: 100000,
      note: 'Solde du mois',
      createdAt: ''
    },
    {
      entryId: 'e2',
      reference: 'VIR-SEPT',
      date: '2026-09-05',
      amount: 50000,
      note: null,
      treasuryAccountNumber: '55211',
      createdAt: ''
    }
  ];

  beforeEach(() => {
    listSyndicGatewayPayouts.mockResolvedValue({ items: PAYOUTS });
  });

  const panel = () => <PayoutsPanel tenantId="t1" syndicId="s1" canEdit collectionBalance={0} />;

  it('filtre les reversements sur la référence ou la note, sans nouvel appel à l’API', async () => {
    const user = userEvent.setup();
    mount(panel());
    expect(await screen.findByText('VIR-OCTOBRE')).toBeInTheDocument();
    expect(screen.getByText('VIR-SEPT')).toBeInTheDocument();
    const calls = listSyndicGatewayPayouts.mock.calls.length;

    await user.type(searchBox(/reversements/), 'solde du mois');
    await waitFor(() => expect(screen.queryByText('VIR-SEPT')).not.toBeInTheDocument());
    expect(screen.getByText('VIR-OCTOBRE')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('rev.q=solde');
    expect(listSyndicGatewayPayouts.mock.calls.length).toBe(calls);
  });

  it('applique le compte et la période d’une URL partagée', async () => {
    mount(panel(), '/paiements?rev.account=55211');
    expect(await screen.findByText('VIR-SEPT')).toBeInTheDocument();
    expect(screen.queryByText('VIR-OCTOBRE')).not.toBeInTheDocument();
  });

  it('sans résultat : « Effacer les critères » ramène la liste', async () => {
    const user = userEvent.setup();
    mount(panel(), '/paiements?rev.q=zzz');
    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.')).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('VIR-OCTOBRE')).toBeInTheDocument();
  });

  it('demande 200 reversements au plus et signale la limite atteinte', async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      entryId: `m${i}`,
      reference: `VIR-${i}`,
      date: '2026-10-05',
      amount: 1000,
      note: null,
      createdAt: ''
    }));
    listSyndicGatewayPayouts.mockResolvedValue({ items: many });
    mount(panel());
    expect(await screen.findByText('Seuls les 200 reversements les plus récents sont affichés.')).toBeInTheDocument();
    expect(listSyndicGatewayPayouts).toHaveBeenCalledWith('t1', 's1', 200);
  });

  it('sans mention sous la limite de 200 reversements', async () => {
    mount(panel());
    expect(await screen.findByText('VIR-OCTOBRE')).toBeInTheDocument();
    expect(screen.queryByText('Seuls les 200 reversements les plus récents sont affichés.')).not.toBeInTheDocument();
  });
});
