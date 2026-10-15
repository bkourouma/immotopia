import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { PublicSigningFlow } from '../../components/signature/PublicSigningFlow';
import { SendForSignatureModal } from '../../components/signature/SendForSignatureModal';
import { SignaturesPanel } from '../../components/signature/SignaturesPanel';

/**
 * Spec 043, S1 : page publique de signature, modale d'envoi et panneau « Signatures ».
 * Le mock couvre CHAQUE export de `signature-service` utilisé par les composants.
 */

const createSignatureRequest = vi.fn();
const listSignatureRequests = vi.fn();
const cancelSignatureRequest = vi.fn();
const remindSignatureRequest = vi.fn();
const fetchSignatureFile = vi.fn();
const reissueInPersonToken = vi.fn();
const fetchPublicSignature = vi.fn();
const requestPublicOtp = vi.fn();
const submitPublicSignature = vi.fn();
const declinePublicSignature = vi.fn();

vi.mock('../../services/signature-service', () => ({
  createSignatureRequest: (...a: unknown[]) => createSignatureRequest(...a),
  listSignatureRequests: (...a: unknown[]) => listSignatureRequests(...a),
  cancelSignatureRequest: (...a: unknown[]) => cancelSignatureRequest(...a),
  remindSignatureRequest: (...a: unknown[]) => remindSignatureRequest(...a),
  fetchSignatureFile: (...a: unknown[]) => fetchSignatureFile(...a),
  reissueInPersonToken: (...a: unknown[]) => reissueInPersonToken(...a),
  fetchPublicSignature: (...a: unknown[]) => fetchPublicSignature(...a),
  requestPublicOtp: (...a: unknown[]) => requestPublicOtp(...a),
  submitPublicSignature: (...a: unknown[]) => submitPublicSignature(...a),
  declinePublicSignature: (...a: unknown[]) => declinePublicSignature(...a),
  publicSignatureFileUrl: (token: string) => `http://api.test/public/signatures/${token}/file`
}));

const CONSENT = 'Je consens à signer électroniquement ce document.';

function publicDto(overrides: Record<string, any> = {}) {
  return {
    request: {
      kind: 'LEASE_CONTRACT',
      title: 'Contrat de bail B-1',
      status: 'SENT',
      expiresAt: '2026-12-01T00:00:00Z',
      ...(overrides.request ?? {})
    },
    signer: {
      fullName: 'Awa Traoré',
      role: 'LOCATAIRE',
      maskedContact: 'a***@mail.com',
      status: 'PENDING',
      channel: 'EMAIL',
      ...(overrides.signer ?? {})
    },
    consentText: CONSENT
  };
}

function canvasContext(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn()
  } as unknown as CanvasRenderingContext2D;
}

function drawStroke() {
  const canvas = screen.getByTestId('signature-canvas');
  fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 40, clientY: 30, pointerId: 1 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

function renderInApp(node: React.ReactElement) {
  return render(<AntApp>{node}</AntApp>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PublicSigningFlow', () => {
  it('affiche un lien invalide quand le jeton est inconnu', async () => {
    fetchPublicSignature.mockResolvedValue({ status: 'invalid' });
    renderInApp(<PublicSigningFlow token="inconnu" />);
    expect(await screen.findByText('Lien invalide ou expiré')).toBeInTheDocument();
  });

  it('affiche les états déjà signé, refusé et expiré', async () => {
    fetchPublicSignature.mockResolvedValueOnce({ status: 'ok', data: publicDto({ signer: { status: 'SIGNED' } }) });
    const { unmount } = renderInApp(<PublicSigningFlow token="t1" />);
    expect(await screen.findByText('Vous avez déjà signé ce document')).toBeInTheDocument();
    unmount();

    fetchPublicSignature.mockResolvedValueOnce({ status: 'ok', data: publicDto({ request: { status: 'DECLINED' } }) });
    const second = renderInApp(<PublicSigningFlow token="t2" />);
    expect(await screen.findByText('Cette signature a été refusée')).toBeInTheDocument();
    second.unmount();

    fetchPublicSignature.mockResolvedValueOnce({ status: 'ok', data: publicDto({ request: { status: 'EXPIRED' } }) });
    renderInApp(<PublicSigningFlow token="t3" />);
    expect(await screen.findByText('Cette demande a expiré')).toBeInTheDocument();
  });

  it('demande le code, puis signe en saisie avec consentement', async () => {
    fetchPublicSignature.mockResolvedValue({ status: 'ok', data: publicDto() });
    requestPublicOtp.mockResolvedValue({ status: 'ok', data: { sentTo: 'a***@mail.com', retryAfterSeconds: 30 } });
    submitPublicSignature.mockResolvedValue({
      status: 'ok',
      data: { status: 'SIGNED', requestStatus: 'COMPLETED' }
    });
    const user = userEvent.setup();
    renderInApp(<PublicSigningFlow token="abc" />);

    const sign = await screen.findByRole('button', { name: 'Signer le document' });
    expect(sign).toBeDisabled();
    expect(document.querySelector('iframe')?.getAttribute('src')).toBe('http://api.test/public/signatures/abc/file');

    await user.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    expect(requestPublicOtp).toHaveBeenCalledWith('abc');
    expect(await screen.findByText(/Renvoyer le code dans 30 s/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Code reçu'), '123456');
    await user.type(screen.getByLabelText('Tapez votre nom complet'), 'Awa Traoré');
    await user.click(screen.getByRole('checkbox'));
    await user.click(sign);

    await waitFor(() =>
      expect(submitPublicSignature).toHaveBeenCalledWith('abc', {
        code: '123456',
        consent: true,
        signature: { mode: 'TYPED', value: 'Awa Traoré' }
      })
    );
    expect(await screen.findByText('Merci, votre signature est enregistrée')).toBeInTheDocument();
    expect(screen.getByText(/Toutes les signatures sont réunies/)).toBeInTheDocument();
  });

  it('un signataire non final voit le message « autres signataires »', async () => {
    fetchPublicSignature.mockResolvedValue({ status: 'ok', data: publicDto({ signer: { channel: 'IN_PERSON' } }) });
    submitPublicSignature.mockResolvedValue({
      status: 'ok',
      data: { status: 'SIGNED', requestStatus: 'PARTIALLY_SIGNED' }
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext());
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAA');
    const user = userEvent.setup();
    renderInApp(<PublicSigningFlow token="p" />);
    await screen.findByRole('button', { name: 'Signer le document' });
    drawStroke();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Signer le document' }));
    expect(await screen.findByText(/Les autres signataires vont être sollicités/)).toBeInTheDocument();
  });

  it('affiche les essais restants quand le code est invalide', async () => {
    fetchPublicSignature.mockResolvedValue({ status: 'ok', data: publicDto() });
    submitPublicSignature.mockResolvedValue({
      status: 'invalid',
      httpStatus: 400,
      code: 'SIGNATURE_OTP_INVALID',
      details: { attemptsRemaining: 2 }
    });
    const user = userEvent.setup();
    renderInApp(<PublicSigningFlow token="abc" />);
    await screen.findByRole('button', { name: 'Signer le document' });
    await user.type(screen.getByLabelText('Code reçu'), '000000');
    await user.type(screen.getByLabelText('Tapez votre nom complet'), 'Awa');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Signer le document' }));
    expect(await screen.findByText('Code incorrect ou expiré. Essais restants : 2.')).toBeInTheDocument();
  });

  it('distingue document modifié (409) et tour non venu', async () => {
    fetchPublicSignature.mockResolvedValue({ status: 'ok', data: publicDto() });
    const user = userEvent.setup();
    renderInApp(<PublicSigningFlow token="abc" />);
    await screen.findByRole('button', { name: 'Signer le document' });
    await user.type(screen.getByLabelText('Code reçu'), '123456');
    await user.type(screen.getByLabelText('Tapez votre nom complet'), 'Awa');
    await user.click(screen.getByRole('checkbox'));

    submitPublicSignature.mockResolvedValueOnce({
      status: 'conflict',
      httpStatus: 409,
      code: 'SIGNATURE_DOCUMENT_CHANGED'
    });
    await user.click(screen.getByRole('button', { name: 'Signer le document' }));
    expect(await screen.findByText(/Le document a été modifié depuis l'envoi/)).toBeInTheDocument();
    await new Promise(r => setTimeout(r, 300));
    submitPublicSignature.mockResolvedValueOnce({
      status: 'invalid',
      httpStatus: 403,
      code: 'SIGNATURE_NOT_YOUR_TURN'
    });
    await user.click(screen.getByText('Signer le document'));
    expect(await screen.findByText("Ce n'est pas encore votre tour de signer.")).toBeInTheDocument();
  });

  it('limite de cadence 429 RATE_LIMITED : affiche le délai', async () => {
    fetchPublicSignature.mockResolvedValue({ status: 'ok', data: publicDto() });
    requestPublicOtp.mockResolvedValue({
      status: 'rate_limited',
      httpStatus: 429,
      code: 'RATE_LIMITED',
      retryAfterSeconds: 45
    });
    const user = userEvent.setup();
    renderInApp(<PublicSigningFlow token="abc" />);
    await user.click(await screen.findByRole('button', { name: 'Recevoir le code' }));
    expect(await screen.findByText('Trop de tentatives. Réessayez dans 45 s.')).toBeInTheDocument();
  });

  it('plafond d’envois atteint : renvoie vers l’agence', async () => {
    fetchPublicSignature.mockResolvedValue({ status: 'ok', data: publicDto() });
    requestPublicOtp.mockResolvedValue({ status: 'rate_limited', httpStatus: 429, code: 'SIGNATURE_OTP_SEND_LIMIT' });
    const user = userEvent.setup();
    renderInApp(<PublicSigningFlow token="abc" />);
    await user.click(await screen.findByRole('button', { name: 'Recevoir le code' }));
    expect(await screen.findByText("Nombre d'envois atteint : contactez l'agence.")).toBeInTheDocument();
  });

  it('pas encore le tour : aucun code proposé', async () => {
    fetchPublicSignature.mockResolvedValue({ status: 'ok', data: { ...publicDto(), canSign: false } });
    renderInApp(<PublicSigningFlow token="abc" />);
    expect(await screen.findByText("Ce n'est pas encore votre tour")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recevoir le code' })).not.toBeInTheDocument();
  });

  it('ne soumet jamais un ancien dessin après un aller-retour Dessiner / Saisir', async () => {
    fetchPublicSignature.mockResolvedValue({ status: 'ok', data: publicDto() });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext());
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,OLD');
    const user = userEvent.setup();
    renderInApp(<PublicSigningFlow token="abc" />);
    await screen.findByRole('button', { name: 'Signer le document' });
    await user.type(screen.getByLabelText('Code reçu'), '123456');
    await user.click(screen.getByRole('checkbox'));

    await user.click(screen.getByText('Dessiner'));
    drawStroke();
    expect(screen.getByRole('button', { name: 'Signer le document' })).toBeEnabled();
    await user.click(screen.getByText('Saisir mon nom'));
    await user.click(screen.getByText('Dessiner'));
    // Canevas neuf et vide : la signature reste impossible.
    expect(screen.getByRole('button', { name: 'Signer le document' })).toBeDisabled();
    expect(submitPublicSignature).not.toHaveBeenCalled();
  });

  it('signature sur place : pas de code, signature dessinée en PNG', async () => {
    fetchPublicSignature.mockResolvedValue({ status: 'ok', data: publicDto({ signer: { channel: 'IN_PERSON' } }) });
    submitPublicSignature.mockResolvedValue({
      status: 'ok',
      data: { status: 'SIGNED', requestStatus: 'PARTIALLY_SIGNED' }
    });
    const onDone = vi.fn();
    const user = userEvent.setup();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext());
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAA');

    renderInApp(<PublicSigningFlow token="place" onDone={onDone} />);
    await screen.findByRole('button', { name: 'Signer le document' });
    expect(screen.queryByLabelText('Code reçu')).not.toBeInTheDocument();

    // Sur place : signature dessinée obligatoire, pas d'option « saisir mon nom ».
    expect(screen.queryByText('Saisir mon nom')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tapez votre nom complet')).not.toBeInTheDocument();
    drawStroke();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Signer le document' }));

    await waitFor(() =>
      expect(submitPublicSignature).toHaveBeenCalledWith('place', {
        consent: true,
        signature: { mode: 'DRAWN', value: 'data:image/png;base64,AAA' }
      })
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('enregistre un refus avec son motif', async () => {
    fetchPublicSignature.mockResolvedValue({ status: 'ok', data: publicDto() });
    declinePublicSignature.mockResolvedValue({ status: 'ok', data: {} });
    const user = userEvent.setup();
    renderInApp(<PublicSigningFlow token="abc" />);

    await user.click(await screen.findByRole('button', { name: 'Refuser de signer' }));
    await user.type(screen.getByLabelText('Motif du refus (facultatif)'), 'Loyer erroné');
    await user.click(screen.getByRole('button', { name: 'Confirmer le refus' }));

    await waitFor(() => expect(declinePublicSignature).toHaveBeenCalledWith('abc', 'Loyer erroné'));
    expect(await screen.findByText('Vous avez refusé de signer')).toBeInTheDocument();
  });
});

describe('SendForSignatureModal', () => {
  const defaults = [
    { role: 'LOCATAIRE', fullName: 'Awa Traoré', channel: 'EMAIL' as const, contact: 'awa@mail.com' },
    { role: 'BAILLEUR', fullName: 'Moussa Koné', channel: 'IN_PERSON' as const, contact: '' }
  ];

  it('préremplit les signataires et envoie la demande', async () => {
    createSignatureRequest.mockResolvedValue({ id: 'sig-1', signers: [] });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderInApp(
      <SendForSignatureModal
        open
        kind="LEASE_CONTRACT"
        targetId="bail-1"
        defaultSigners={defaults}
        onClose={onClose}
        onCreated={onCreated}
      />
    );

    expect(screen.getAllByTestId('signer-row')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));

    await waitFor(() => expect(createSignatureRequest).toHaveBeenCalled());
    const payload = createSignatureRequest.mock.calls[0][0];
    expect(payload.kind).toBe('LEASE_CONTRACT');
    expect(payload.targetId).toBe('bail-1');
    expect(payload.signers).toEqual([
      { role: 'LOCATAIRE', fullName: 'Awa Traoré', channel: 'EMAIL', contact: 'awa@mail.com' },
      { role: 'BAILLEUR', fullName: 'Moussa Koné', channel: 'IN_PERSON', contact: '' }
    ]);
    expect(onCreated).toHaveBeenCalledWith({ id: 'sig-1', signers: [] });
  });

  it('n’offre WhatsApp que pour un signataire lié à un contact CRM', async () => {
    const user = userEvent.setup();
    renderInApp(
      <SendForSignatureModal
        open
        kind="LEASE_CONTRACT"
        targetId="bail-1"
        defaultSigners={[{ role: 'LOCATAIRE', fullName: 'Awa', channel: 'EMAIL', contact: 'a@mail.com' }]}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    );
    await user.click(screen.getByLabelText('Canal'));
    const option = await screen.findByText(/WhatsApp — Lier à un contact CRM/);
    expect(option.closest('.ant-select-item')).toHaveClass('ant-select-item-option-disabled');
  });

  it('propose WhatsApp et transmet contactId quand le contact CRM est connu', async () => {
    createSignatureRequest.mockResolvedValue({ id: 'sig-2', signers: [] });
    const user = userEvent.setup();
    renderInApp(
      <SendForSignatureModal
        open
        kind="LEASE_CONTRACT"
        targetId="bail-1"
        defaultSigners={[
          { role: 'LOCATAIRE', fullName: 'Awa', channel: 'WHATSAPP', contact: '+2250102030405', contactId: 'c-1' }
        ]}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    );
    await user.click(screen.getByLabelText('Canal'));
    expect(screen.queryByText(/Lier à un contact CRM/)).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(createSignatureRequest).toHaveBeenCalled());
    expect(createSignatureRequest.mock.calls[0][0].signers[0]).toMatchObject({
      channel: 'WHATSAPP',
      contactId: 'c-1'
    });
  });

  it('limite la validité à 30 jours', () => {
    renderInApp(
      <SendForSignatureModal
        open
        kind="LEASE_CONTRACT"
        targetId="bail-1"
        defaultSigners={defaults}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Durée de validité en jours')).toHaveAttribute('aria-valuemax', '30');
  });

  it('bloque l’envoi tant qu’un contact manque', () => {
    renderInApp(
      <SendForSignatureModal
        open
        kind="LEASE_CONTRACT"
        targetId="bail-1"
        defaultSigners={[{ ...defaults[0], contact: '' }]}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
  });
});

describe('SignaturesPanel', () => {
  const request = (status: string, signers: any[]) => ({
    id: 'sig-1',
    kind: 'LEASE_CONTRACT',
    status,
    expiresAt: '2026-12-01T00:00:00Z',
    createdAt: '2026-10-01T00:00:00Z',
    signers
  });
  const signer = (overrides: Record<string, unknown> = {}) => ({
    id: 's1',
    role: 'LOCATAIRE',
    position: 1,
    fullName: 'Awa Traoré',
    channel: 'EMAIL',
    contactMasked: 'a***@mail.com',
    status: 'PENDING',
    ...overrides
  });

  it('liste les signataires, relance et annule', async () => {
    listSignatureRequests.mockResolvedValue([request('SENT', [signer()])]);
    remindSignatureRequest.mockResolvedValue({ reminded: 1, failed: 1 });
    cancelSignatureRequest.mockResolvedValue({});
    const user = userEvent.setup();
    renderInApp(
      <SignaturesPanel
        kind="LEASE_CONTRACT"
        targetType="RentalLease"
        targetId="bail-1"
        defaultSigners={[]}
        fileLabel="bail"
      />
    );

    expect(await screen.findByText('Awa Traoré')).toBeInTheDocument();
    expect(listSignatureRequests).toHaveBeenCalledWith({ targetType: 'RentalLease', targetId: 'bail-1' });
    expect(screen.getByText('En attente')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Relancer' }));
    await waitFor(() => expect(remindSignatureRequest).toHaveBeenCalledWith('sig-1'));
    expect(await screen.findByText('Rappel envoyé à 1 signataire(s), échec pour 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Annuler la demande' }));
    const confirm = (await screen.findAllByRole('button', { name: 'Annuler la demande' })).pop() as HTMLElement;
    await user.click(confirm);
    await waitFor(() => expect(cancelSignatureRequest).toHaveBeenCalledWith('sig-1'));
  });

  it('propose le PDF signé une fois la demande terminée', async () => {
    listSignatureRequests.mockResolvedValue([request('COMPLETED', [signer({ status: 'SIGNED' })])]);
    fetchSignatureFile.mockResolvedValue(new Blob(['pdf']));
    (URL as any).createObjectURL = vi.fn(() => 'blob:x');
    (URL as any).revokeObjectURL = vi.fn();
    const user = userEvent.setup();
    renderInApp(
      <SignaturesPanel
        kind="LEASE_CONTRACT"
        targetType="RentalLease"
        targetId="bail-1"
        defaultSigners={[]}
        fileLabel="bail"
      />
    );

    await user.click(await screen.findByRole('button', { name: 'PDF signé' }));
    await waitFor(() => expect(fetchSignatureFile).toHaveBeenCalledWith('sig-1', 'signed'));
    expect(screen.queryByRole('button', { name: 'Relancer' })).not.toBeInTheDocument();
  });

  it('réémet le jeton sur place (absent de la liste) puis ouvre le flux avec lui', async () => {
    // Cas réel : la liste ne renvoie JAMAIS inPersonUrlToken.
    listSignatureRequests.mockResolvedValue([request('SENT', [signer({ id: 'sg-9', channel: 'IN_PERSON' })])]);
    reissueInPersonToken.mockResolvedValue({ inPersonUrlToken: 'tok-reemis' });
    fetchPublicSignature.mockResolvedValue({ status: 'ok', data: publicDto({ signer: { channel: 'IN_PERSON' } }) });
    const user = userEvent.setup();
    renderInApp(
      <SignaturesPanel
        kind="LEASE_CONTRACT"
        targetType="RentalLease"
        targetId="bail-1"
        defaultSigners={[]}
        fileLabel="bail"
      />
    );

    await user.click(await screen.findByRole('button', { name: 'Signer sur place' }));
    await waitFor(() => expect(reissueInPersonToken).toHaveBeenCalledWith('sig-1', 'sg-9'));
    await waitFor(() => expect(fetchPublicSignature).toHaveBeenCalledWith('tok-reemis'));
  });

  it('pas de bouton « Signer sur place » pour un signataire déjà signé ou à distance', async () => {
    listSignatureRequests.mockResolvedValue([
      request('PARTIALLY_SIGNED', [
        signer({ id: 'a', channel: 'IN_PERSON', status: 'SIGNED' }),
        signer({ id: 'b', position: 2, channel: 'EMAIL' })
      ])
    ]);
    renderInApp(
      <SignaturesPanel
        kind="LEASE_CONTRACT"
        targetType="RentalLease"
        targetId="bail-1"
        defaultSigners={[]}
        fileLabel="bail"
      />
    );
    await screen.findAllByText('Awa Traoré');
    expect(screen.queryByRole('button', { name: 'Signer sur place' })).not.toBeInTheDocument();
  });

  it('après la création, ouvre le flux sur place avec le jeton de la réponse', async () => {
    listSignatureRequests.mockResolvedValue([]);
    createSignatureRequest.mockResolvedValue(
      request('SENT', [
        signer({ id: 'sg-1', channel: 'IN_PERSON', contactMasked: '', inPersonUrlToken: 'tok-creation' })
      ])
    );
    fetchPublicSignature.mockResolvedValue({ status: 'ok', data: publicDto({ signer: { channel: 'IN_PERSON' } }) });
    const user = userEvent.setup();
    renderInApp(
      <SignaturesPanel
        kind="LEASE_CONTRACT"
        targetType="RentalLease"
        targetId="bail-1"
        defaultSigners={[{ role: 'LOCATAIRE', fullName: 'Awa Traoré', channel: 'IN_PERSON', contact: '' }]}
        fileLabel="bail"
      />
    );
    await user.click(await screen.findByRole('button', { name: 'Envoyer pour signature' }));
    await user.click(await screen.findByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(fetchPublicSignature).toHaveBeenCalledWith('tok-creation'));
    expect(reissueInPersonToken).not.toHaveBeenCalled();
  });
});
