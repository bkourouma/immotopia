import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { SyndicOnlinePayments } from '../../../pages/syndics/SyndicOnlinePayments';
import type { SyndicDeclarationRow } from '../../../services/syndic-declared-payment-service';

/**
 * Écran « Paiements » du gestionnaire (spec 047, lot L7, T055) : orchestration des trois
 * sections. Les composants enfants ont leurs propres tests : ils sont remplacés ici par de
 * petits bouchons qui exposent leurs rappels, pour ne tester que le câblage de la page.
 */

let heldPermissions: Set<string> | null = null;
let permissionsReady = true;
vi.mock('../../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({
    disabled: new Set<string>(),
    enabled: new Set<string>(),
    permissions: heldPermissions,
    ready: permissionsReady
  })
}));

vi.mock('../../../pages/syndics/useSyndicRouteContext', () => ({
  useSyndicRouteContext: () => ({ tenantId: 'tenant-1', syndicId: 'syndic-1' })
}));

const ROW = { id: 'decl-1', status: 'PENDING' } as unknown as SyndicDeclarationRow;
const NEW_ROW = { id: 'decl-new', status: 'PENDING' } as unknown as SyndicDeclarationRow;

// Section « Paiement en ligne » (spec 042) : bouchons inertes, leur logique est testée ailleurs.
vi.mock('../../../components/syndics/online-payment/GatewayConfigCard', () => ({
  GatewayConfigCard: (p: { refreshToken?: number }) => <div>gateway-config refresh:{p.refreshToken}</div>
}));
vi.mock('../../../components/syndics/online-payment/CheckoutsTable', () => ({
  CheckoutsTable: (p: { refreshToken?: number }) => <div>checkouts refresh:{p.refreshToken}</div>
}));
vi.mock('../../../components/syndics/online-payment/PayoutsPanel', () => ({
  PayoutsPanel: () => <div>payouts</div>
}));
vi.mock('../../../components/syndics/online-payment/ReviewDecisionModal', () => ({
  ReviewDecisionModal: () => null
}));

// Section « Paiements déclarés » et « transfert mobile money » (spec 047).
vi.mock('../../../components/syndics/declared-payment/DeclarationsTable', () => ({
  DeclarationsTable: (p: {
    refreshToken?: number;
    onOpen: (row: SyndicDeclarationRow) => void;
    toolbarExtra?: React.ReactNode;
  }) => (
    <div>
      <span>table refresh:{p.refreshToken}</span>
      {p.toolbarExtra}
      <button onClick={() => p.onOpen(ROW)}>open-row</button>
    </div>
  )
}));
vi.mock('../../../components/syndics/declared-payment/ReceivingNumbersCard', () => ({
  ReceivingNumbersCard: (p: { canEdit?: boolean; refreshToken?: number; onChanged?: () => void }) => (
    <div>
      <span>
        numbers canEdit:{String(p.canEdit)} refresh:{p.refreshToken}
      </span>
      <button onClick={() => p.onChanged?.()}>number-added</button>
    </div>
  )
}));
vi.mock('../../../components/syndics/declared-payment/DeclaredSettingsCard', () => ({
  DeclaredSettingsCard: (p: { canEdit?: boolean; refreshToken?: number; onChanged?: () => void }) => (
    <div>
      <span>
        settings canEdit:{String(p.canEdit)} refresh:{p.refreshToken}
      </span>
      <button onClick={() => p.onChanged?.()}>settings-saved</button>
    </div>
  )
}));
vi.mock('../../../components/syndics/declared-payment/DeclarationDrawer', () => ({
  DeclarationDrawer: (p: {
    declarationId: string | null;
    canEdit?: boolean;
    onClose: () => void;
    onApprove: (row: SyndicDeclarationRow) => void;
    onReject: (row: SyndicDeclarationRow) => void;
    onStale?: () => void;
  }) =>
    p.declarationId ? (
      <div>
        <span>
          drawer:{p.declarationId} canEdit:{String(p.canEdit)}
        </span>
        <button onClick={() => p.onApprove({ id: p.declarationId } as SyndicDeclarationRow)}>drawer-approve</button>
        <button onClick={() => p.onReject({ id: p.declarationId } as SyndicDeclarationRow)}>drawer-reject</button>
        <button onClick={() => p.onStale?.()}>drawer-stale</button>
        <button onClick={p.onClose}>drawer-close</button>
      </div>
    ) : null
}));
vi.mock('../../../components/syndics/declared-payment/ApproveModal', () => ({
  ApproveModal: (p: {
    declaration: SyndicDeclarationRow | null;
    onClose: () => void;
    onApproved: (result: unknown) => void;
    onStale?: () => void;
  }) =>
    p.declaration ? (
      <div>
        <span>approve-modal:{p.declaration.id}</span>
        <button
          onClick={() =>
            p.onApproved({
              declaration: p.declaration,
              documents: [
                { id: 'doc-1', kind: 'RECEIPT', number: 'REC-001' },
                { id: 'doc-2', kind: 'QUITTANCE', number: 'QUI-002' }
              ]
            })
          }
        >
          approve-confirm
        </button>
        <button onClick={() => p.onStale?.()}>approve-stale</button>
        <button onClick={p.onClose}>approve-close</button>
      </div>
    ) : null
}));
vi.mock('../../../components/syndics/declared-payment/RejectModal', () => ({
  RejectModal: (p: {
    declaration: SyndicDeclarationRow | null;
    onClose: () => void;
    onRejected: (row: SyndicDeclarationRow) => void;
    onStale?: () => void;
  }) =>
    p.declaration ? (
      <div>
        <span>reject-modal:{p.declaration.id}</span>
        <button onClick={() => p.onRejected(p.declaration as SyndicDeclarationRow)}>reject-confirm</button>
        <button onClick={() => p.onStale?.()}>reject-stale</button>
      </div>
    ) : null
}));
vi.mock('../../../components/syndics/declared-payment/DeclareForThirdPartyModal', () => ({
  DeclareForThirdPartyModal: (p: {
    open: boolean;
    onClose: () => void;
    onCreated: (row: SyndicDeclarationRow) => void;
  }) =>
    p.open ? (
      <div>
        <span>third-party-modal</span>
        <button onClick={() => p.onCreated(NEW_ROW)}>third-party-create</button>
      </div>
    ) : null
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

beforeEach(() => {
  heldPermissions = null;
  permissionsReady = true;
});

describe('<SyndicOnlinePayments> — écran « Paiements » (spec 047)', () => {
  it('affiche le titre « Paiements » et les trois sections en titres de niveau 3', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 2, name: 'Paiements' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Paiements des appels de charges : transferts mobile money déclarés, paiement en ligne, reversements.'
      )
    ).toBeInTheDocument();

    const sections = screen.getAllByRole('heading', { level: 3 }).map(node => node.textContent);
    expect(sections).toEqual(['Paiements déclarés', 'Paiement par transfert mobile money', 'Paiement en ligne']);

    // Section en ligne conservée.
    expect(screen.getByText(/gateway-config/)).toBeInTheDocument();
    expect(screen.getByText(/checkouts/)).toBeInTheDocument();
    expect(screen.getByText('payouts')).toBeInTheDocument();
  });

  it('propose « Déclarer pour un copropriétaire » avec SYNDIC_EDIT et passe canEdit aux cartes et au tiroir', () => {
    heldPermissions = new Set(['SYNDIC_VIEW', 'SYNDIC_EDIT']);
    renderPage();

    expect(screen.getByRole('button', { name: /Déclarer pour un copropriétaire/ })).toBeInTheDocument();
    expect(screen.getByText(/numbers canEdit:true/)).toBeInTheDocument();
    expect(screen.getByText(/settings canEdit:true/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('open-row'));
    expect(screen.getByText(/drawer:decl-1 canEdit:true/)).toBeInTheDocument();
  });

  it('masque le bouton et passe canEdit=false sans SYNDIC_EDIT', () => {
    heldPermissions = new Set(['SYNDIC_VIEW']);
    renderPage();

    expect(screen.queryByRole('button', { name: /Déclarer pour un copropriétaire/ })).not.toBeInTheDocument();
    expect(screen.getByText(/numbers canEdit:false/)).toBeInTheDocument();
    expect(screen.getByText(/settings canEdit:false/)).toBeInTheDocument();
  });

  it('masque le bouton tant que les droits ne sont pas connus', () => {
    permissionsReady = false;
    renderPage();

    expect(screen.queryByRole('button', { name: /Déclarer pour un copropriétaire/ })).not.toBeInTheDocument();
  });

  it('ouvrir le tiroir puis Valider : ferme le tiroir, ouvre la validation, confirme et recharge', async () => {
    renderPage();
    expect(screen.getByText('table refresh:0')).toBeInTheDocument();
    expect(screen.getByText('checkouts refresh:0')).toBeInTheDocument();

    fireEvent.click(screen.getByText('open-row'));
    fireEvent.click(screen.getByText('drawer-approve'));

    expect(screen.queryByText(/drawer:/)).not.toBeInTheDocument();
    expect(screen.getByText('approve-modal:decl-1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('approve-confirm'));

    expect(await screen.findByText('Paiement validé (REC-001, QUI-002)')).toBeInTheDocument();
    expect(screen.queryByText(/approve-modal:/)).not.toBeInTheDocument();
    // Le compteur des déclarations ET celui du paiement en ligne avancent.
    expect(screen.getByText('table refresh:1')).toBeInTheDocument();
    expect(screen.getByText('checkouts refresh:1')).toBeInTheDocument();
    expect(screen.getByText('gateway-config refresh:1')).toBeInTheDocument();
  });

  it('Rejeter depuis le tiroir ouvre le rejet, puis confirme et recharge les déclarations seules', async () => {
    renderPage();

    fireEvent.click(screen.getByText('open-row'));
    fireEvent.click(screen.getByText('drawer-reject'));

    expect(screen.queryByText(/drawer:/)).not.toBeInTheDocument();
    expect(screen.getByText('reject-modal:decl-1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('reject-confirm'));

    expect(await screen.findByText('Déclaration rejetée')).toBeInTheDocument();
    expect(screen.queryByText(/reject-modal:/)).not.toBeInTheDocument();
    expect(screen.getByText('table refresh:1')).toBeInTheDocument();
    expect(screen.getByText('checkouts refresh:0')).toBeInTheDocument();
  });

  it.each([
    ['le tiroir', 'drawer-stale', () => fireEvent.click(screen.getByText('open-row'))],
    [
      'la validation',
      'approve-stale',
      () => {
        fireEvent.click(screen.getByText('open-row'));
        fireEvent.click(screen.getByText('drawer-approve'));
      }
    ],
    [
      'le rejet',
      'reject-stale',
      () => {
        fireEvent.click(screen.getByText('open-row'));
        fireEvent.click(screen.getByText('drawer-reject'));
      }
    ]
  ])(
    'onStale depuis %s : message d’information, tout se ferme, la file est rechargée',
    async (_label, button, open) => {
      renderPage();
      open();

      fireEvent.click(screen.getByText(button));

      expect(await screen.findByText('Cette déclaration a déjà été traitée.')).toBeInTheDocument();
      expect(screen.queryByText(/drawer:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/approve-modal:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/reject-modal:/)).not.toBeInTheDocument();
      expect(screen.getByText('table refresh:1')).toBeInTheDocument();
    }
  );

  it('une déclaration créée pour un tiers ouvre le tiroir sur la nouvelle ligne', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Déclarer pour un copropriétaire/ }));
    expect(screen.getByText('third-party-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByText('third-party-create'));

    expect(screen.queryByText('third-party-modal')).not.toBeInTheDocument();
    expect(screen.getByText(/drawer:decl-new/)).toBeInTheDocument();
    expect(screen.getByText('table refresh:1')).toBeInTheDocument();
  });

  it('un numéro ajouté ou un réglage enregistré recharge les déclarations et les deux cartes', () => {
    renderPage();

    fireEvent.click(screen.getByText('number-added'));
    expect(screen.getByText('table refresh:1')).toBeInTheDocument();
    expect(screen.getByText(/settings canEdit:\w+ refresh:1/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('settings-saved'));
    expect(screen.getByText('table refresh:2')).toBeInTheDocument();
    expect(screen.getByText(/numbers canEdit:\w+ refresh:2/)).toBeInTheDocument();
    // Le paiement en ligne n'est pas touché.
    expect(screen.getByText('checkouts refresh:0')).toBeInTheDocument();
  });
});
