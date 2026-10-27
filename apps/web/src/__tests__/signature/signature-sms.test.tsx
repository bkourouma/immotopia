import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { SendForSignatureModal } from '../../components/signature/SendForSignatureModal';

/** Spec 044, S7 : canal SMS dans la modale d'envoi. */

const createSignatureRequest = vi.fn();
const fetchSignatureContext = vi.fn();

vi.mock('../../services/signature-service', () => ({
  createSignatureRequest: (...a: unknown[]) => createSignatureRequest(...a),
  fetchSignatureContext: (...a: unknown[]) => fetchSignatureContext(...a)
}));

const signer = {
  role: 'LOCATAIRE',
  fullName: 'Awa',
  channel: 'EMAIL' as const,
  contact: '+2250102030405',
  contactId: 'c-1'
};

function renderModal(props: Partial<React.ComponentProps<typeof SendForSignatureModal>> = {}) {
  return render(
    <AntApp>
      <SendForSignatureModal
        open
        kind="LEASE_CONTRACT"
        targetId="bail-1"
        defaultSigners={[signer]}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        {...props}
      />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSignatureContext.mockRejectedValue(new Error('indisponible'));
});

describe('SendForSignatureModal : canal SMS', () => {
  it('propose SMS quand le numéro est connu', async () => {
    const user = userEvent.setup();
    renderModal({ smsAvailable: true });
    await user.click(screen.getByLabelText('Canal'));
    const option = await screen.findByText('SMS');
    expect(option.closest('.ant-select-item')).not.toHaveClass('ant-select-item-option-disabled');
  });

  it('désactive SMS avec une aide quand le serveur ne l’active pas', async () => {
    const user = userEvent.setup();
    renderModal({ smsAvailable: false });
    await user.click(screen.getByLabelText('Canal'));
    const option = await screen.findByText(/SMS — Le SMS n'est pas activé sur ce serveur\./);
    expect(option.closest('.ant-select-item')).toHaveClass('ant-select-item-option-disabled');
  });

  it('désactive SMS pour un signataire sans contact CRM', async () => {
    const user = userEvent.setup();
    renderModal({ defaultSigners: [{ ...signer, contactId: undefined }] });
    await user.click(screen.getByLabelText('Canal'));
    const option = await screen.findByText(/SMS — Lier à un contact CRM/);
    expect(option.closest('.ant-select-item')).toHaveClass('ant-select-item-option-disabled');
  });

  it('envoie channel SMS, numéro et contactId', async () => {
    createSignatureRequest.mockResolvedValue({ id: 'sig-3', signers: [] });
    const user = userEvent.setup();
    renderModal({ smsAvailable: true, defaultSigners: [{ ...signer, channel: 'SMS' }] });
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(createSignatureRequest).toHaveBeenCalled());
    expect(createSignatureRequest.mock.calls[0][0].signers[0]).toMatchObject({
      channel: 'SMS',
      contact: '+2250102030405',
      contactId: 'c-1'
    });
  });

  it('lit smsAvailable dans le contexte quand la prop est absente', async () => {
    fetchSignatureContext.mockResolvedValue({ smsAvailable: false });
    const user = userEvent.setup();
    renderModal();
    await waitFor(() => expect(fetchSignatureContext).toHaveBeenCalledWith('LEASE_CONTRACT', 'bail-1'));
    await user.click(screen.getByLabelText('Canal'));
    const option = await screen.findByText(/SMS — Le SMS n'est pas activé sur ce serveur\./);
    expect(option.closest('.ant-select-item')).toHaveClass('ant-select-item-option-disabled');
  });

  it('laisse SMS proposé quand le contexte est illisible', async () => {
    const user = userEvent.setup();
    renderModal();
    await waitFor(() => expect(fetchSignatureContext).toHaveBeenCalled());
    await user.click(screen.getByLabelText('Canal'));
    const option = await screen.findByText('SMS');
    expect(option.closest('.ant-select-item')).not.toHaveClass('ant-select-item-option-disabled');
  });
});
