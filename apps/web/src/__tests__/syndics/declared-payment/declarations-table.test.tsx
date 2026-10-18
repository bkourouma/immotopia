import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { DeclarationsTable } from '../../../components/syndics/declared-payment/DeclarationsTable';
import type { SyndicDeclarationRow } from '../../../services/syndic-declared-payment-service';

/**
 * File de validation des paiements déclarés (spec 047, lot L7).
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

function renderTable(props: Partial<React.ComponentProps<typeof DeclarationsTable>> = {}) {
  const onOpen = vi.fn();
  const utils = render(
    <AntApp>
      <DeclarationsTable tenantId="t1" syndicId="s1" onOpen={onOpen} {...props} />
    </AntApp>
  );
  return { ...utils, onOpen };
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
    await screen.findByText('Awa Koné');
    expect(listSyndicDeclarations).toHaveBeenCalledWith(
      't1',
      's1',
      expect.objectContaining({ status: 'PENDING', page: 1, limit: 20 })
    );
    expect(lastQuery().overdue).toBeUndefined();
  });

  it('affiche les compteurs de la réponse', async () => {
    renderTable();
    await screen.findByText('Awa Koné');
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
    await screen.findByText('Marc Gestionnaire');
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
    await screen.findByText('Awa Koné');
    const tableRow = screen.getByText('Awa Koné').closest('tr') as HTMLElement;
    expect(within(tableRow).getByText('En retard')).toBeTruthy();
    expect(within(tableRow).getByText('Doublon suspecté')).toBeTruthy();
    expect(within(tableRow).getByText('Lue par IA')).toBeTruthy();
    expect(within(tableRow).getByText('En attente')).toBeTruthy();
  });

  it("n'affiche pas ces pastilles sur une ligne déjà traitée", async () => {
    listSyndicDeclarations.mockResolvedValue(response([row({ status: 'APPROVED', overdue: true, aiPrefilled: true })]));
    renderTable();
    await screen.findByText('Awa Koné');
    const tableRow = screen.getByText('Awa Koné').closest('tr') as HTMLElement;
    expect(within(tableRow).getByText('Validée')).toBeTruthy();
    expect(within(tableRow).queryByText('En retard')).toBeNull();
    expect(within(tableRow).queryByText('Lue par IA')).toBeNull();
  });

  it('« En retard » filtre sur overdue: true et se retire au second clic', async () => {
    renderTable();
    await screen.findByText('Awa Koné');
    fireEvent.click(screen.getByRole('button', { name: 'En retard 2' }));
    await waitFor(() => expect(lastQuery().overdue).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'En retard 2' }));
    await waitFor(() => expect(lastQuery().overdue).toBeUndefined());
  });

  it('change le filtre de statut', async () => {
    renderTable();
    await screen.findByText('Awa Koné');
    fireEvent.click(screen.getByText('Toutes'));
    await waitFor(() => expect(lastQuery().status).toBe('ALL'));
    fireEvent.click(screen.getByText('Rejetées'));
    await waitFor(() => expect(lastQuery().status).toBe('REJECTED'));
  });

  it('filtre par numéro de réception et par lot', async () => {
    renderTable();
    await screen.findByText('Awa Koné');
    await waitFor(() => expect(listSyndicateLots).toHaveBeenCalledWith('t1', 's1'));

    fireEvent.mouseDown(screen.getByLabelText('Numéro de réception'));
    fireEvent.click(await screen.findByText(/Wave · \+225 07 07 07 07 07 · Syndic Les Palmiers/));
    await waitFor(() => expect(lastQuery().receivingNumberId).toBe('n1'));

    fireEvent.mouseDown(screen.getByLabelText('Lot'));
    fireEvent.click(await screen.findByText(/^A12/, { selector: '.ant-select-item-option-content' }));
    await waitFor(() => expect(lastQuery().lotId).toBe('lot-1'));
    expect(lastQuery().receivingNumberId).toBe('n1');
  });

  it('filtre par période de paiement au format YYYY-MM-DD', async () => {
    const { container } = renderTable();
    await screen.findByText('Awa Koné');
    const inputs = container.querySelectorAll<HTMLInputElement>('.ant-picker-range input');
    expect(inputs.length).toBe(2);

    fireEvent.mouseDown(inputs[0]);
    fireEvent.change(inputs[0], { target: { value: '2026-10-01' } });
    fireEvent.keyDown(inputs[0], { key: 'Enter', keyCode: 13 });
    fireEvent.mouseDown(inputs[1]);
    fireEvent.change(inputs[1], { target: { value: '2026-10-15' } });
    fireEvent.keyDown(inputs[1], { key: 'Enter', keyCode: 13 });

    await waitFor(() => expect(lastQuery()).toMatchObject({ from: '2026-10-01', to: '2026-10-15' }));
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
    await screen.findByText('Zoé Zadi');
    const names = Array.from(document.querySelectorAll('tbody tr.ant-table-row')).map(tr => tr.textContent ?? '');
    expect(names[0]).toContain('Zoé Zadi');
    expect(names[1]).toContain('Abel Aka');

    fireEvent.click(screen.getByTitle('2'));
    await waitFor(() => expect(lastQuery().page).toBe(2));
  });

  it('un changement de filtre revient en page 1', async () => {
    listSyndicDeclarations.mockResolvedValue({
      items: [row()],
      pagination: { page: 1, limit: 20, total: 45, totalPages: 3 },
      counts: { pending: 45, overdue: 0, suspectedDuplicate: 0 }
    });
    renderTable();
    await screen.findByText('Awa Koné');
    fireEvent.click(screen.getByTitle('2'));
    await waitFor(() => expect(lastQuery().page).toBe(2));
    fireEvent.click(screen.getByText('Toutes'));
    await waitFor(() => expect(lastQuery()).toMatchObject({ status: 'ALL', page: 1 }));
  });

  it('ouvre la déclaration par « Examiner » et par clic sur la ligne', async () => {
    const { onOpen } = renderTable();
    await screen.findByText('Awa Koné');
    fireEvent.click(screen.getByRole('button', { name: /Examiner/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].id).toBe('d1');

    fireEvent.click(screen.getByText('Awa Koné'));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('recharge quand refreshToken change', async () => {
    const onOpen = vi.fn();
    const { rerender } = render(
      <AntApp>
        <DeclarationsTable tenantId="t1" syndicId="s1" onOpen={onOpen} refreshToken={0} />
      </AntApp>
    );
    await screen.findByText('Awa Koné');
    const before = listSyndicDeclarations.mock.calls.length;
    rerender(
      <AntApp>
        <DeclarationsTable tenantId="t1" syndicId="s1" onOpen={onOpen} refreshToken={1} />
      </AntApp>
    );
    await waitFor(() => expect(listSyndicDeclarations.mock.calls.length).toBe(before + 1));
  });

  it('affiche les boutons ajoutés par la page', async () => {
    renderTable({ toolbarExtra: <button type="button">Déclarer pour un copropriétaire</button> });
    await screen.findByText('Awa Koné');
    expect(screen.getByRole('button', { name: 'Déclarer pour un copropriétaire' })).toBeTruthy();
  });

  it('affiche un état vide', async () => {
    listSyndicDeclarations.mockResolvedValue(
      response([], { counts: { pending: 0, overdue: 0, suspectedDuplicate: 0 } })
    );
    renderTable();
    expect(await screen.findByText('Aucun paiement déclaré')).toBeTruthy();
  });

  it('affiche l’erreur de chargement et « Réessayer » recharge', async () => {
    listSyndicDeclarations.mockRejectedValueOnce({ response: { data: { message: 'Service indisponible' } } });
    renderTable();
    expect(await screen.findByText('Service indisponible')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Awa Koné')).toBeTruthy();
    expect(screen.queryByText('Service indisponible')).toBeNull();
  });

  it('une panne des numéros ou des lots ne bloque pas la table', async () => {
    listSyndicReceivingNumbers.mockRejectedValue(new Error('boom'));
    listSyndicateLots.mockRejectedValue(new Error('boom'));
    renderTable();
    expect(await screen.findByText('Awa Koné')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
