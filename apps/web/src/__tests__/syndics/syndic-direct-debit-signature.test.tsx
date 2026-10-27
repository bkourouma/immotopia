import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configure, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SyndicMandatesCard } from '../../components/syndics/direct-debit/SyndicMandatesCard';

/**
 * Spec 042 §10.6 en copropriété : section « Signature électronique (facultatif) » dépliée
 * depuis les actions d'un mandat en brouillon, type SYNDIC_DIRECT_DEBIT_MANDATE, réservée
 * à SYNDIC_DIRECT_DEBIT_MANAGE. Le mock de chaque service couvre chaque export utilisé.
 */

configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 60000 });

const SYNDIC = 'syn-1';

let permissions: Set<string> | null = null;
vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set(), enabled: new Set(), permissions, ready: true })
}));

const listSyndicMandates = vi.fn();
vi.mock('../../services/syndic-direct-debit-service', () => ({
  listSyndicMandates: (...a: unknown[]) => listSyndicMandates(...a),
  activateSyndicMandate: vi.fn(),
  downloadSyndicAuthorizationPdf: vi.fn(),
  downloadSyndicSignedScan: vi.fn(),
  reactivateSyndicMandate: vi.fn(),
  revokeSyndicMandate: vi.fn(),
  suspendSyndicMandate: vi.fn(),
  updateSyndicMandate: vi.fn(),
  uploadSyndicSignedScan: vi.fn(),
  listLotDebtors: vi.fn(),
  createSyndicMandate: vi.fn(),
  checkSyndicIban: vi.fn()
}));
vi.mock('../../services/syndic-service', () => ({ listSyndicateLots: vi.fn().mockResolvedValue([]) }));
vi.mock('../../utils/save-blob', () => ({ saveBlob: vi.fn() }));

const fetchSignatureContext = vi.fn();
const listSignatureRequests = vi.fn();
vi.mock('../../services/signature-service', () => ({
  fetchSignatureContext: (...a: unknown[]) => fetchSignatureContext(...a),
  listSignatureRequests: (...a: unknown[]) => listSignatureRequests(...a),
  createSignatureRequest: vi.fn(),
  cancelSignatureRequest: vi.fn(),
  remindSignatureRequest: vi.fn(),
  fetchSignatureFile: vi.fn(),
  reissueInPersonToken: vi.fn()
}));

const creditor = { id: 'cr-1', isActive: true } as never;

function makeMandate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    reference: 'MDT-2026-0001',
    scope: 'SYNDIC_LOT',
    status: 'DRAFT',
    creditor: { id: 'cr-1', label: 'Compte', creditorIdentifier: 'EMT-77' },
    debtor: { id: 'ct-1', displayName: 'Awa Traoré', kind: 'CONTACT' },
    lease: null,
    syndicate: { id: SYNDIC, name: 'Résidence Les Palmiers' },
    lot: { id: 'lot-1', lotNumber: 'A01' },
    ibanMasked: 'CI•• •••• •••• •••• •••• 5678',
    bankCode: 'CI000',
    holderName: 'Awa Traoré',
    maxAmount: null,
    collectionDay: null,
    effectiveCollectionDay: 5,
    signedAt: null,
    hasSignedScan: false,
    ...overrides
  };
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <SyndicMandatesCard tenantId="agence-1" syndicId={SYNDIC} creditor={creditor} />
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions = null;
  listSyndicMandates.mockResolvedValue({ items: [makeMandate()], total: 1, page: 1, pageSize: 20 });
  fetchSignatureContext.mockResolvedValue({
    kind: 'SYNDIC_DIRECT_DEBIT_MANDATE',
    targetType: 'DIRECT_DEBIT_MANDATE',
    providerRequired: false,
    signers: [{ role: 'COPROPRIETAIRE', fullName: 'Awa Traoré', email: 'awa@example.test', contactId: 'c-1' }]
  });
  listSignatureRequests.mockResolvedValue([]);
});

describe('Mandats de copropriété : signature électronique', () => {
  it('déplie la section au clic sur « Signature électronique » et vise le type de copropriété', async () => {
    const user = userEvent.setup();
    renderCard();

    expect(screen.queryByText('Signature électronique (facultatif)')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Signature électronique' }));

    expect(await screen.findByText('Signature électronique (facultatif)')).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Envoyer pour signature électronique' });
    expect(fetchSignatureContext).toHaveBeenCalledWith('SYNDIC_DIRECT_DEBIT_MANDATE', 'm-1');
    expect(listSignatureRequests).toHaveBeenCalledWith({ targetType: 'DIRECT_DEBIT_MANDATE', targetId: 'm-1' });

    await user.click(screen.getByRole('button', { name: 'Signature électronique' }));
    // Replié : la ligne reste peut-être montée par Ant Design, mais n'est plus visible.
    await waitFor(() => {
      const title = screen.queryByText('Signature électronique (facultatif)');
      expect(title === null || !title.checkVisibility?.()).toBe(true);
    });
  });

  it('sans SYNDIC_DIRECT_DEBIT_MANAGE (lecture seule), aucun bouton ni section', async () => {
    permissions = new Set(['SYNDIC_DIRECT_DEBIT_VIEW']);
    renderCard();

    await screen.findByText('MDT-2026-0001');
    expect(screen.queryByRole('button', { name: 'Signature électronique' })).not.toBeInTheDocument();
    expect(fetchSignatureContext).not.toHaveBeenCalled();
  });

  it('avec SYNDIC_DIRECT_DEBIT_MANAGE, le bouton est proposé', async () => {
    permissions = new Set(['SYNDIC_DIRECT_DEBIT_VIEW', 'SYNDIC_DIRECT_DEBIT_MANAGE']);
    renderCard();

    expect(await screen.findByRole('button', { name: 'Signature électronique' })).toBeInTheDocument();
  });

  it("un mandat actif n'offre pas la signature", async () => {
    listSyndicMandates.mockResolvedValue({
      items: [makeMandate({ status: 'ACTIVE', hasSignedScan: true })],
      total: 1,
      page: 1,
      pageSize: 20
    });
    renderCard();

    await screen.findByText('MDT-2026-0001');
    expect(screen.queryByRole('button', { name: 'Signature électronique' })).not.toBeInTheDocument();
  });

  it('signé électroniquement : mention de la date et invitation à activer, sans nouvel envoi', async () => {
    listSyndicMandates.mockResolvedValue({
      items: [makeMandate({ hasSignedScan: true, signedAt: '2026-10-16T00:00:00.000Z' })],
      total: 1,
      page: 1,
      pageSize: 20
    });
    listSignatureRequests.mockResolvedValue([{ id: 'r-1', status: 'COMPLETED', signers: [] }]);
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Signature électronique' }));
    expect(await screen.findByTestId('mandate-signed-electronically')).toBeInTheDocument();
    expect(screen.getByText('Vous pouvez maintenant activer le mandat.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Envoyer pour signature électronique' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activer' })).toBeEnabled();
  });
});
