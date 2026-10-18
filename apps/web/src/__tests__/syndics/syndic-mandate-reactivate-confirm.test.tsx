import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SyndicMandatesCard } from '../../components/syndics/direct-debit/SyndicMandatesCard';

/**
 * Réactivation d'un mandat de copropriété suspendu : le bouton « Réactiver » ouvre une
 * confirmation (Popconfirm) et n'appelle le service qu'après validation. Le setup et les
 * mocks reprennent syndic-direct-debit-signature.test.tsx ; la colonne Actions n'existe
 * que pour SYNDIC_DIRECT_DEBIT_MANAGE, d'où la permission accordée ci-dessous.
 */

configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 60000 });

const SYNDIC = 'syn-1';
const QUESTION = 'Réactiver ce mandat de prélèvement ?';

let permissions: Set<string> | null = null;
vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set(), enabled: new Set(), permissions, ready: true })
}));

const listSyndicMandates = vi.fn();
const reactivateSyndicMandate = vi.fn();
vi.mock('../../services/syndic-direct-debit-service', () => ({
  listSyndicMandates: (...a: unknown[]) => listSyndicMandates(...a),
  activateSyndicMandate: vi.fn(),
  downloadSyndicAuthorizationPdf: vi.fn(),
  downloadSyndicSignedScan: vi.fn(),
  reactivateSyndicMandate: (...a: unknown[]) => reactivateSyndicMandate(...a),
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
    status: 'SUSPENDED',
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
    signedAt: '2026-10-01T00:00:00.000Z',
    hasSignedScan: true,
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

/** Le popover de confirmation d'Ant Design, identifié par sa question (son libellé « Réactiver » est doublé). */
async function findConfirmPopover(): Promise<HTMLElement> {
  const question = await screen.findByText(QUESTION);
  const popover = question.closest('.ant-popover');
  if (!(popover instanceof HTMLElement)) throw new Error('Popover de confirmation introuvable');
  return popover;
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions = new Set(['SYNDIC_DIRECT_DEBIT_VIEW', 'SYNDIC_DIRECT_DEBIT_MANAGE']);
  listSyndicMandates.mockResolvedValue({ items: [makeMandate()], total: 1, page: 1, pageSize: 20 });
  reactivateSyndicMandate.mockResolvedValue(makeMandate({ status: 'ACTIVE' }));
  fetchSignatureContext.mockResolvedValue({
    kind: 'SYNDIC_DIRECT_DEBIT_MANDATE',
    targetType: 'DIRECT_DEBIT_MANDATE',
    providerRequired: false,
    signers: []
  });
  listSignatureRequests.mockResolvedValue([]);
});

describe('Mandats de copropriété : réactivation confirmée', () => {
  it('« Réactiver » demande confirmation sans appeler le service, puis l’appelle une fois confirmé', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Réactiver' }));

    const popover = await findConfirmPopover();
    expect(reactivateSyndicMandate).not.toHaveBeenCalled();

    await user.click(within(popover).getByRole('button', { name: 'Réactiver' }));

    await waitFor(() => expect(reactivateSyndicMandate).toHaveBeenCalledTimes(1));
    expect(reactivateSyndicMandate).toHaveBeenCalledWith('agence-1', SYNDIC, 'm-1');
  });

  it('annuler la confirmation n’appelle pas le service', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Réactiver' }));

    const popover = await findConfirmPopover();
    await user.click(within(popover).getByRole('button', { name: 'Annuler' }));

    await waitFor(() => {
      const question = screen.queryByText(QUESTION);
      if (question) expect(question).not.toBeVisible();
    });
    expect(reactivateSyndicMandate).not.toHaveBeenCalled();
  });
});
