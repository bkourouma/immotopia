import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { SyndicOnlinePayments } from '../../../pages/syndics/SyndicOnlinePayments';
import type { SyndicDeclarationRow } from '../../../services/syndic-declared-payment-service';

/**
 * Un seul toast par décision : les VRAIES modales ApproveModal / RejectModal sont montées dans la
 * VRAIE page ; seuls le tableau, le tiroir et les sections voisines sont des bouchons.
 */

const approveSyndicDeclaration = vi.fn();
const rejectSyndicDeclaration = vi.fn();
vi.mock('../../../services/syndic-declared-payment-service', () => ({
  approveSyndicDeclaration: (...a: unknown[]) => approveSyndicDeclaration(...a),
  rejectSyndicDeclaration: (...a: unknown[]) => rejectSyndicDeclaration(...a)
}));

vi.mock('../../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({
    disabled: new Set<string>(),
    enabled: new Set<string>(),
    permissions: new Set(['SYNDIC_VIEW', 'SYNDIC_EDIT']),
    ready: true
  })
}));
vi.mock('../../../pages/syndics/useSyndicRouteContext', () => ({
  useSyndicRouteContext: () => ({ tenantId: 'tenant-1', syndicId: 'syndic-1' })
}));

const ROW = {
  id: 'decl-1',
  status: 'PENDING',
  receivingNumber: { id: 'n1', operator: 'WAVE', phoneNumber: '+2250707070707', holderName: 'Syndic' },
  declaredBy: { type: 'COOWNER', contactId: 'c1', name: 'Awa Koné' },
  payerPhone: '+2250505050505',
  amount: 30000,
  paidAt: '2026-10-10T09:30:00.000Z',
  transactionReference: 'TX-1',
  lines: [],
  alerts: []
} as unknown as SyndicDeclarationRow;

vi.mock('../../../components/syndics/online-payment/GatewayConfigCard', () => ({ GatewayConfigCard: () => null }));
vi.mock('../../../components/syndics/online-payment/CheckoutsTable', () => ({ CheckoutsTable: () => null }));
vi.mock('../../../components/syndics/online-payment/PayoutsPanel', () => ({ PayoutsPanel: () => null }));
vi.mock('../../../components/syndics/online-payment/ReviewDecisionModal', () => ({ ReviewDecisionModal: () => null }));
vi.mock('../../../components/syndics/declared-payment/ReceivingNumbersCard', () => ({
  ReceivingNumbersCard: () => null
}));
vi.mock('../../../components/syndics/declared-payment/DeclaredSettingsCard', () => ({
  DeclaredSettingsCard: () => null
}));
vi.mock('../../../components/syndics/declared-payment/DeclareForThirdPartyModal', () => ({
  DeclareForThirdPartyModal: () => null
}));
vi.mock('../../../components/syndics/declared-payment/DeclarationDrawer', () => ({
  DeclarationDrawer: (p: {
    declarationId: string | null;
    onApprove: (row: SyndicDeclarationRow) => void;
    onReject: (row: SyndicDeclarationRow) => void;
  }) =>
    p.declarationId ? (
      <div>
        <button onClick={() => p.onApprove(ROW)}>drawer-approve</button>
        <button onClick={() => p.onReject(ROW)}>drawer-reject</button>
      </div>
    ) : null
}));
vi.mock('../../../components/syndics/declared-payment/DeclarationsTable', () => ({
  DeclarationsTable: (p: { onOpen: (row: SyndicDeclarationRow) => void }) => (
    <button onClick={() => p.onOpen(ROW)}>open-row</button>
  )
}));

function renderPage() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/paiements-en-ligne']}>
        <Routes>
          <Route path="/tenant/:tenantId/syndics/:syndicId/paiements-en-ligne" element={<SyndicOnlinePayments />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

const openDrawerThen = (button: string) => {
  fireEvent.click(screen.getByText('open-row'));
  fireEvent.click(screen.getByText(button));
};

describe('un seul toast par décision (page + vraies modales)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejet complet : « Déclaration rejetée » une seule fois', async () => {
    rejectSyndicDeclaration.mockResolvedValue({ ...ROW, status: 'REJECTED' });
    renderPage();
    openDrawerThen('drawer-reject');

    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByText('Autre', { selector: '.ant-select-item-option-content' }));
    fireEvent.change(screen.getByLabelText(/^Texte/), { target: { value: 'Motif détaillé suffisant' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rejeter la déclaration' }));

    await waitFor(() => expect(rejectSyndicDeclaration).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByText('Déclaration rejetée')).toHaveLength(1));
    // Laisse la page réagir à onRejected (fermeture de la modale) avant de recompter.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Rejeter la déclaration' })).toBeNull());
    expect(screen.getAllByText('Déclaration rejetée')).toHaveLength(1);
  });

  it('validation complète : un seul toast de confirmation', async () => {
    approveSyndicDeclaration.mockResolvedValue({
      declaration: { ...ROW, status: 'APPROVED' },
      documents: [{ id: 'doc1', kind: 'RECEIPT', number: 'REC-001' }]
    });
    renderPage();
    openDrawerThen('drawer-approve');

    fireEvent.click(screen.getByRole('button', { name: 'Valider telle que déclarée' }));

    await waitFor(() => expect(approveSyndicDeclaration).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByText(/Déclaration validée/)).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Valider telle que déclarée' })).toBeNull());
    expect(screen.getAllByText(/Déclaration validée/)).toHaveLength(1);
    expect(screen.queryByText(/Paiement validé/)).not.toBeInTheDocument();
  });
});
