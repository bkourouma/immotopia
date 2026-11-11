import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { DeclarationsTable } from '../../../components/syndics/declared-payment/DeclarationsTable';
import type { SyndicDeclarationRow } from '../../../services/syndic-declared-payment-service';

/**
 * File de validation des paiements déclarés (spec 047, lot L7) et sa recherche
 * multicritères (lot SYN-A, préfixe d'URL `dec`).
 * Le service est mocké en entier : chaque export utilisé par le composant et
 * ses dépendances doit figurer ci-dessous, Vitest refusant tout import non déclaré.
 */

const listSyndicDeclarations = vi.fn();
const listSyndicReceivingNumbers = vi.fn();
const listSyndicateLots = vi.fn();

vi.mock('../../../services/syndic-declared-payment-service', () => ({
  listSyndicDeclarations: (...a: unknown[]) => listSyndicDeclarations(...a),
  listSyndicReceivingNumbers: (...a: unknown[]) => listSyndicReceivingNumbers(...a)
}));

vi.mock('../../../services/syndic-service', () => ({
  listSyndicateLots: (...a: unknown[]) => listSyndicateLots(...a)
}));

vi.mock('../../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

// Délai large : la suite complète tourne en parallèle et peut être lente.
const T = { timeout: 8000 };

function row(overrides: Partial<SyndicDeclarationRow> = {}): SyndicDeclarationRow {
  return {
    id: 'd1',
    status: 'PENDING',
    receivingNumber: { id: 'n1', operator: 'WAVE', phoneNumber: '+2250707070707', holderName: 'Syndic Les Palmiers' },
    declaredBy: { type: 'COOWNER', contactId: 'c1', name: 'Awa Koné' },
    payerPhone: '+2250101010101',
    amount: 50000,
    acceptedAmount: null,
    paidAt: '2026-10-10T09:30:00.000Z',
    acceptedPaidAt: null,
    transactionReference: 'TX-REF-001',
    lines: [
      {
        id: 'l1',
        lot: { id: 'lot-1', lotNumber: 'A12' },
        amount: 30000,
        acceptedAmount: null,
        chargeCalls: [],
        chargePaymentId: null,
        documents: []
      },
      {
        id: 'l2',
        lot: { id: 'lot-2', lotNumber: 'B03' },
        amount: 20000,
        acceptedAmount: null,
        chargeCalls: [],
        chargePaymentId: null,
        documents: []
      }
    ],
    hasProof: false,
    aiPrefilled: false,
    aiEditedFields: [],
    overdue: false,
    alerts: [],
    comment: null,
    rejectReason: null,
    reviewNote: null,
    reviewedAt: null,
    reviewedByName: null,
    createdAt: '2026-10-11T08:00:00.000Z',
    ...overrides
  };
}

function response(items: SyndicDeclarationRow[], extra: Record<string, unknown> = {}) {
  return {
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
    counts: { pending: 7, overdue: 2, suspectedDuplicate: 1 },
    ...extra
  };
}

const NUMBERS = [
  {
    id: 'n1',
    operator: 'WAVE',
    phoneNumber: '+2250707070707',
    holderName: 'Syndic Les Palmiers',
    label: null,
    isActive: true,
    sortOrder: 0
  }
];
const LOTS = [{ id: 'lot-1', lotNumber: 'A12', lotType: 'APARTMENT', generalShares: 100 }];

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function renderTable(props: Partial<React.ComponentProps<typeof DeclarationsTable>> = {}, initial = '/paiements') {
  const onOpen = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          {children}
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
  const element = (extra: Partial<React.ComponentProps<typeof DeclarationsTable>> = {}) => (
    <DeclarationsTable tenantId="t1" syndicId="s1" onOpen={onOpen} {...props} {...extra} />
  );
  const utils = render(element(), { wrapper });
  return {
    ...utils,
    onOpen,
    rerenderTable: (extra: Partial<React.ComponentProps<typeof DeclarationsTable>>) => utils.rerender(element(extra))
  };
}

const lastQuery = () => listSyndicDeclarations.mock.calls[listSyndicDeclarations.mock.calls.length - 1][2];

beforeEach(() => {
  vi.clearAllMocks();
  listSyndicDeclarations.mockResolvedValue(response([row()]));
  listSyndicReceivingNumbers.mockResolvedValue(NUMBERS);
  listSyndicateLots.mockResolvedValue(LOTS);
});

describe('DeclarationsTable', () => {
  it('charge par défaut les déclarations en attente, page 1, 20 par page', async () => {
    renderTable();
    await screen.findByText('Awa Koné', undefined, T);
    expect(listSyndicDeclarations).toHaveBeenCalledWith(
      't1',
      's1',
      expect.objectContaining({ status: 'PENDING', page: 1, limit: 20 })
    );
    expect(lastQuery().overdue).toBeUndefined();
    expect(lastQuery().search).toBeUndefined();
  });

  it('affiche les compteurs de la réponse', async () => {
    renderTable();
    await screen.findByText('Awa Koné', undefined, T);
    expect(screen.getByText('En attente 7')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'En retard 2' })).toBeTruthy();
    expect(screen.getByText('Doublon suspecté 1')).toBeTruthy();
  });

  it('affiche les colonnes de la ligne : déclarant, lots, numéro, référence, montant', async () => {
    listSyndicDeclarations.mockResolvedValue(
      response([
        row({ declaredBy: { type: 'MANAGER', userId: 'u1', name: 'Marc Gestionnaire' }, acceptedAmount: 45000 })
      ])
    );
    renderTable();
    await screen.findByText('Marc Gestionnaire', undefined, T);
    expect(screen.getByText('Gestionnaire')).toBeTruthy();
    expect(screen.getByText('A12, B03')).toBeTruthy();
    expect(screen.getByText(/\+225 07 07 07 07 07/)).toBeTruthy();
    expect(screen.getByText('Syndic Les Palmiers')).toBeTruthy();
    expect(screen.getByText('TX-REF-001')).toBeTruthy();
    expect(screen.getByText(/retenu : /)).toBeTruthy();
  });

  it('affiche les pastilles retard, doublon et IA sur une ligne en attente', async () => {
    listSyndicDeclarations.mockResolvedValue(
      response([
        row({
          overdue: true,
          aiPrefilled: true,
          alerts: [{ kind: 'PROBABLE_DUPLICATE', declarationId: 'd0', createdAt: '2026-10-11T07:55:00.000Z' }]
        })
      ])
    );
    renderTable();
    await screen.findByText('Awa Koné', undefined, T);
    const tableRow = screen.getByText('Awa Koné').closest('tr') as HTMLElement;
    expect(within(tableRow).getByText('En retard')).toBeTruthy();
    expect(within(tableRow).getByText('Doublon suspecté')).toBeTruthy();
    expect(within(tableRow).getByText('Lue par IA')).toBeTruthy();
    expect(within(tableRow).getByText('En attente')).toBeTruthy();
  });

  it("n'affiche pas ces pastilles sur une ligne déjà traitée", async () => {
    listSyndicDeclarations.mockResolvedValue(response([row({ status: 'APPROVED', overdue: true, aiPrefilled: true })]));
    renderTable();
    await screen.findByText('Awa Koné', undefined, T);
    const tableRow = screen.getByText('Awa Koné').closest('tr') as HTMLElement;
    expect(within(tableRow).getByText('Validée')).toBeTruthy();
    expect(within(tableRow).queryByText('En retard')).toBeNull();
    expect(within(tableRow).queryByText('Lue par IA')).toBeNull();
  });

  it('« En retard 2 » pose le critère « En retard » (overdue) et le retire au second clic', async () => {
    renderTable();
    await screen.findByText('Awa Koné', undefined, T);
    fireEvent.click(screen.getByRole('button', { name: 'En retard 2' }));
    await waitFor(() => expect(lastQuery().overdue).toBe('true'), T);
    expect(screen.getByTestId('url').textContent).toContain('dec.overdue=1');
    const callsBefore = listSyndicDeclarations.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'En retard 2' }));
    // Le critère retiré quitte l'URL ; la liste sans critère est déjà en cache, aucun nouvel appel n'est nécessaire.
    await waitFor(() => expect(screen.getByTestId('url').textContent).not.toContain('dec.overdue'), T);
    expect(screen.getByRole('button', { name: 'En retard 2' })).toHaveAttribute('aria-pressed', 'false');
    expect(listSyndicDeclarations.mock.calls.length).toBe(callsBefore);
  });

  it('envoie la saisie au service (search) après le debounce et la met dans l’URL', async () => {
    const user = userEvent.setup();
    renderTable();
    await screen.findByText('Awa Koné', undefined, T);
    await user.type(
      within(screen.getByRole('search', { name: /paiements déclarés/ })).getAllByRole('textbox')[0],
      'TX-REF'
    );
    await waitFor(() => expect(lastQuery()).toMatchObject({ status: 'PENDING', search: 'TX-REF', page: 1 }), T);
    expect(screen.getByTestId('url').textContent).toContain('dec.q=TX-REF');
  });

  it('applique les critères d’une URL partagée : statut, numéro, lot, période, retard', async () => {
    renderTable(
      {},
      '/paiements?dec.status=REJECTED&dec.receivingNumberId=n1&dec.lotId=lot-1&dec.periodFrom=2026-10-01&dec.periodTo=2026-10-15&dec.overdue=1'
    );
    await screen.findByText('Awa Koné', undefined, T);
    await waitFor(
      () =>
        expect(lastQuery()).toMatchObject({
          status: 'REJECTED',
          receivingNumberId: 'n1',
          lotId: 'lot-1',
          from: '2026-10-01',
          to: '2026-10-15',
          overdue: 'true',
          page: 1,
          limit: 20
        }),
      T
    );
  });

  it('sans statut dans l’URL, l’écran demande les paiements en attente ; « Toutes » vient de l’URL', async () => {
    renderTable({}, '/paiements?dec.status=ALL');
    await screen.findByText('Awa Koné', undefined, T);
    await waitFor(() => expect(lastQuery().status).toBe('ALL'), T);
  });

  it('pagine côté serveur et conserve l’ordre du serveur', async () => {
    listSyndicDeclarations.mockResolvedValue({
      items: [
        row({ id: 'a', declaredBy: { type: 'COOWNER', contactId: 'c', name: 'Zoé Zadi' } }),
        row({ id: 'b', declaredBy: { type: 'COOWNER', contactId: 'c', name: 'Abel Aka' } })
      ],
      pagination: { page: 1, limit: 20, total: 45, totalPages: 3 },
      counts: { pending: 45, overdue: 0, suspectedDuplicate: 0 }
    });
    renderTable();
    await screen.findByText('Zoé Zadi', undefined, T);
    const names = Array.from(document.querySelectorAll('tbody tr.ant-table-row')).map(tr => tr.textContent ?? '');
    expect(names[0]).toContain('Zoé Zadi');
    expect(names[1]).toContain('Abel Aka');

    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(lastQuery().page).toBe(2), T);
    expect(screen.getByTestId('url').textContent).toContain('dec.page=2');
  });

  it('un changement de critère revient en page 1', async () => {
    const user = userEvent.setup();
    listSyndicDeclarations.mockResolvedValue({
      items: [row()],
      pagination: { page: 1, limit: 20, total: 45, totalPages: 3 },
      counts: { pending: 45, overdue: 0, suspectedDuplicate: 0 }
    });
    renderTable();
    await screen.findByText('Awa Koné', undefined, T);
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(lastQuery().page).toBe(2), T);
    await user.type(
      within(screen.getByRole('search', { name: /paiements déclarés/ })).getAllByRole('textbox')[0],
      'Awa'
    );
    await waitFor(() => expect(lastQuery()).toMatchObject({ search: 'Awa', page: 1 }), T);
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    listSyndicDeclarations.mockImplementation(async (_t: string, _s: string, query: { search?: string }) =>
      query.search ? response([]) : response([row()])
    );
    renderTable({}, '/paiements?dec.q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('Awa Koné', undefined, T)).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).not.toContain('dec.q=');
  });

  it('ouvre la déclaration par « Examiner » et par clic sur la ligne', async () => {
    const { onOpen } = renderTable();
    await screen.findByText('Awa Koné', undefined, T);
    fireEvent.click(screen.getByRole('button', { name: /Examiner/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].id).toBe('d1');

    fireEvent.click(screen.getByText('Awa Koné'));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('recharge quand refreshToken change', async () => {
    const { rerenderTable } = renderTable({ refreshToken: 0 });
    await screen.findByText('Awa Koné', undefined, T);
    const before = listSyndicDeclarations.mock.calls.length;
    rerenderTable({ refreshToken: 1 });
    await waitFor(() => expect(listSyndicDeclarations.mock.calls.length).toBe(before + 1), T);
  });

  it('affiche les boutons ajoutés par la page', async () => {
    renderTable({ toolbarExtra: <button type="button">Déclarer pour un copropriétaire</button> });
    await screen.findByText('Awa Koné', undefined, T);
    expect(screen.getByRole('button', { name: 'Déclarer pour un copropriétaire' })).toBeTruthy();
  });

  it('affiche un état vide', async () => {
    listSyndicDeclarations.mockResolvedValue(
      response([], { counts: { pending: 0, overdue: 0, suspectedDuplicate: 0 } })
    );
    renderTable();
    expect(await screen.findByText('Aucun paiement déclaré', undefined, T)).toBeTruthy();
  });

  it('affiche l’erreur de chargement et « Réessayer » recharge', async () => {
    listSyndicDeclarations.mockRejectedValueOnce({ response: { data: { message: 'Service indisponible' } } });
    renderTable();
    expect(await screen.findByText('Service indisponible', undefined, T)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Awa Koné', undefined, T)).toBeTruthy();
    expect(screen.queryByText('Service indisponible')).toBeNull();
  });

  it('une panne des numéros ou des lots ne bloque pas la table', async () => {
    listSyndicReceivingNumbers.mockRejectedValue(new Error('boom'));
    listSyndicateLots.mockRejectedValue(new Error('boom'));
    renderTable();
    expect(await screen.findByText('Awa Koné', undefined, T)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
