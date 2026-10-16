import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { SaleAgreementSignatures, toSignerInputs } from '../../pages/sales/SaleAgreementSignatures';

/**
 * Spec 044, S4 : carte « Signatures » du compromis. Signataires préremplis par
 * le contexte de l'API ; si un prestataire qualifié est requis (SG-R1), avertissement
 * et envoi désactivé. Le mock couvre chaque export de `signature-service` utilisé.
 */

const fetchSignatureContext = vi.fn();
const listSignatureRequests = vi.fn();

vi.mock('../../services/signature-service', () => ({
  fetchSignatureContext: (...a: unknown[]) => fetchSignatureContext(...a),
  listSignatureRequests: (...a: unknown[]) => listSignatureRequests(...a),
  createSignatureRequest: vi.fn(),
  cancelSignatureRequest: vi.fn(),
  remindSignatureRequest: vi.fn(),
  fetchSignatureFile: vi.fn(),
  reissueInPersonToken: vi.fn(),
  fetchPublicSignature: vi.fn(),
  requestPublicOtp: vi.fn(),
  submitPublicSignature: vi.fn(),
  declinePublicSignature: vi.fn(),
  publicSignatureFileUrl: (token: string) => `http://api.test/public/signatures/${token}/file`
}));

const SIGNERS = [
  { role: 'VENDEUR', fullName: 'Kouassi Yao', email: 'yao@exemple.ci', phone: null, contactId: null },
  { role: 'ACQUEREUR', fullName: 'Awa Koné', email: 'awa@exemple.ci', phone: '0707070707', contactId: 'c1' }
];

function renderCard(canSend = true) {
  return render(
    <AntApp>
      <SaleAgreementSignatures agreementId="ag-1" number="CV-2026-0007" canSend={canSend} />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listSignatureRequests.mockResolvedValue([]);
});

describe('SaleAgreementSignatures', () => {
  it('préremplit les signataires : e-mail par défaut, contact CRM conservé', () => {
    expect(toSignerInputs(SIGNERS)).toEqual([
      { role: 'VENDEUR', fullName: 'Kouassi Yao', channel: 'EMAIL', contact: 'yao@exemple.ci', phoneKnown: false },
      {
        role: 'ACQUEREUR',
        fullName: 'Awa Koné',
        channel: 'EMAIL',
        contact: 'awa@exemple.ci',
        phoneKnown: true,
        contactId: 'c1'
      }
    ]);
  });

  it('prestataire requis : avertissement et envoi désactivé', async () => {
    fetchSignatureContext.mockResolvedValue({
      kind: 'SALE_AGREEMENT',
      targetType: 'SaleAgreement',
      providerRequired: true,
      signers: SIGNERS
    });
    renderCard();
    expect(await screen.findByText(/un prestataire qualifié est requis/)).toBeTruthy();
    expect(fetchSignatureContext).toHaveBeenCalledWith('SALE_AGREEMENT', 'ag-1');
    const send = screen.getByRole('button', { name: /Envoyer pour signature/ });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() =>
      expect(listSignatureRequests).toHaveBeenCalledWith({ targetType: 'SaleAgreement', targetId: 'ag-1' })
    );
  });

  it('sans exigence : l’envoi est possible', async () => {
    fetchSignatureContext.mockResolvedValue({
      kind: 'SALE_AGREEMENT',
      targetType: 'SaleAgreement',
      providerRequired: false,
      signers: SIGNERS
    });
    renderCard();
    const send = await screen.findByRole('button', { name: /Envoyer pour signature/ });
    expect(screen.queryByText(/un prestataire qualifié est requis/)).toBeNull();
    expect((send as HTMLButtonElement).disabled).toBe(false);
  });

  it('compromis déjà signé : contexte non demandé, historique visible, envoi désactivé', async () => {
    renderCard(false);
    const send = await screen.findByRole('button', { name: /Envoyer pour signature/ });
    expect(fetchSignatureContext).not.toHaveBeenCalled();
    expect((send as HTMLButtonElement).disabled).toBe(true);
  });
});
