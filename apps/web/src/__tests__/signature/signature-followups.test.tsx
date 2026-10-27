import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MandateSignatures } from '../../components/signature/MandateSignatures';
import { SignaturesPanel } from '../../components/signature/SignaturesPanel';
import { SendForSignatureModal } from '../../components/signature/SendForSignatureModal';
import { toSignerInputs as toAgreementSigners } from '../../pages/sales/SaleAgreementSignatures';
import { toSignerInputs as toInspectionSigners } from '../../components/rental/inspections/InspectionSignaturesModal';

/** Correctifs S2-S4 : rafraîchissement du parent, erreur de contexte, signataires sans nom, WhatsApp sans téléphone. */

const fetchSignatureContext = vi.fn();
const listSignatureRequests = vi.fn();
const createSignatureRequest = vi.fn();

vi.mock('../../services/signature-service', () => ({
  fetchSignatureContext: (...a: unknown[]) => fetchSignatureContext(...a),
  listSignatureRequests: (...a: unknown[]) => listSignatureRequests(...a),
  createSignatureRequest: (...a: unknown[]) => createSignatureRequest(...a),
  cancelSignatureRequest: vi.fn(),
  remindSignatureRequest: vi.fn(),
  fetchSignatureFile: vi.fn(),
  reissueInPersonToken: vi.fn(),
  fetchPublicSignature: vi.fn(),
  requestPublicOtp: vi.fn(),
  submitPublicSignature: vi.fn(),
  declinePublicSignature: vi.fn(),
  publicSignatureFileUrl: (token: string) => `http://api.test/${token}`
}));

const request = (status: string) => ({
  id: 'r1',
  kind: 'SALE_AGREEMENT',
  status,
  expiresAt: '2026-12-01T00:00:00Z',
  createdAt: '2026-10-01T00:00:00Z',
  signers: []
});

function renderInApp(node: React.ReactElement) {
  return render(<AntApp>{node}</AntApp>);
}

beforeEach(() => vi.clearAllMocks());

describe('SignaturesPanel : évolutions', () => {
  it('signale la demande ouverte, puis prévient le parent quand elle est scellée', async () => {
    const onChanged = vi.fn();
    const onOpenChange = vi.fn();
    listSignatureRequests.mockResolvedValueOnce([request('SENT')]);
    const user = userEvent.setup();
    renderInApp(
      <SignaturesPanel
        kind="SALE_AGREEMENT"
        targetType="SaleAgreement"
        targetId="ag-1"
        defaultSigners={[{ role: 'VENDEUR', fullName: 'Kouassi', channel: 'IN_PERSON', contact: '' }]}
        fileLabel="c"
        onChanged={onChanged}
        onOpenChange={onOpenChange}
      />
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenLastCalledWith(true));
    expect(onChanged).not.toHaveBeenCalled();

    // Le scellement a lieu ailleurs ; un nouvel envoi recharge la liste et révèle le changement.
    listSignatureRequests.mockResolvedValue([request('COMPLETED')]);
    createSignatureRequest.mockResolvedValue(request('COMPLETED'));
    await user.click(screen.getByRole('button', { name: 'Annuler la demande' }));
    const confirm = (await screen.findAllByRole('button', { name: 'Annuler la demande' })).pop() as HTMLElement;
    await user.click(confirm);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});

describe('MandateSignatures : contexte indisponible', () => {
  it('affiche une erreur explicite et coupe l’envoi', async () => {
    fetchSignatureContext.mockRejectedValue({ response: { status: 403, data: { message: 'Accès refusé' } } });
    listSignatureRequests.mockResolvedValue([]);
    renderInApp(<MandateSignatures kind="MANAGEMENT_MANDATE" mandateId="m1" fileLabel="m" />);
    expect(await screen.findByText('Accès refusé')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer pour signature' })).toBeDisabled();
  });
});

describe('signataires proposés', () => {
  it('écarte un signataire sans nom (compromis et état des lieux)', () => {
    const signers = [
      { role: 'VENDEUR', fullName: '  ', email: 'x@y.z', phone: null, contactId: null },
      { role: 'AGENT', fullName: 'Marc', email: 'm@y.z', phone: '0707', contactId: 'c1' }
    ];
    expect(toAgreementSigners(signers).map(s => s.fullName)).toEqual(['Marc']);
    expect(toInspectionSigners(signers, false).map(s => s.fullName)).toEqual(['Marc']);
  });

  it('marque le téléphone inconnu quand le contexte ne le renvoie pas', () => {
    const [signer] = toAgreementSigners([
      { role: 'AGENT', fullName: 'Marc', email: 'm@y.z', phone: null, contactId: 'c1' }
    ]);
    expect(signer.phoneKnown).toBe(false);
  });

  it('la modale n’offre pas WhatsApp sans téléphone, même avec un contact CRM', async () => {
    const user = userEvent.setup();
    renderInApp(
      <SendForSignatureModal
        open
        kind="SALE_AGREEMENT"
        targetId="ag-1"
        defaultSigners={[
          { role: 'AGENT', fullName: 'Marc', channel: 'EMAIL', contact: 'm@y.z', contactId: 'c1', phoneKnown: false }
        ]}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    );
    await user.click(screen.getByLabelText('Canal'));
    const option = await screen.findByText(/WhatsApp — Numéro indisponible/);
    expect(option.closest('.ant-select-item')).toHaveClass('ant-select-item-option-disabled');
  });

  it('n’envoie pas l’indication d’affichage phoneKnown à l’API', async () => {
    createSignatureRequest.mockResolvedValue(request('SENT'));
    const user = userEvent.setup();
    renderInApp(
      <SendForSignatureModal
        open
        kind="SALE_AGREEMENT"
        targetId="ag-1"
        defaultSigners={[
          { role: 'AGENT', fullName: 'Marc', channel: 'EMAIL', contact: 'm@y.z', contactId: 'c1', phoneKnown: true }
        ]}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(createSignatureRequest).toHaveBeenCalled());
    expect(createSignatureRequest.mock.calls[0][0].signers[0]).not.toHaveProperty('phoneKnown');
  });
});
