import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { PublicSigningFlow } from '../../components/signature/PublicSigningFlow';

/**
 * Spec 042 §10.5-10.6 : parcours public d'un mandat de prélèvement. Le code est
 * vérifié AVANT toute consultation ; le PDF est lu en blob avec le jeton de
 * consultation ; la signature porte ce jeton ; avec un fournisseur externe, on
 * redirige vers le lien remis par l'API. Les autres types gardent leur parcours.
 */

const fetchPublicSignature = vi.fn();
const requestPublicOtp = vi.fn();
const verifyPublicOtp = vi.fn();
const fetchPublicSignatureBlob = vi.fn();
const fetchPublicExternalLink = vi.fn();
const submitPublicSignature = vi.fn();
const declinePublicSignature = vi.fn();

vi.mock('../../services/signature-service', () => ({
  fetchPublicSignature: (...a: unknown[]) => fetchPublicSignature(...a),
  requestPublicOtp: (...a: unknown[]) => requestPublicOtp(...a),
  verifyPublicOtp: (...a: unknown[]) => verifyPublicOtp(...a),
  fetchPublicSignatureBlob: (...a: unknown[]) => fetchPublicSignatureBlob(...a),
  fetchPublicExternalLink: (...a: unknown[]) => fetchPublicExternalLink(...a),
  submitPublicSignature: (...a: unknown[]) => submitPublicSignature(...a),
  declinePublicSignature: (...a: unknown[]) => declinePublicSignature(...a),
  publicSignatureFileUrl: (token: string) => `http://api.test/public/signatures/${token}/file`
}));

const CONSENT = 'Je consens à signer électroniquement ce document.';

function dto(overrides: Record<string, unknown> = {}) {
  return {
    request: {
      kind: 'DIRECT_DEBIT_MANDATE',
      title: 'Autorisation de prélèvement MDT-2026-0001',
      status: 'SENT',
      expiresAt: '2026-12-01T00:00:00Z'
    },
    signer: {
      fullName: 'Awa Traoré',
      role: 'LOCATAIRE',
      maskedContact: 'a***@mail.com',
      status: 'PENDING',
      channel: 'EMAIL'
    },
    consentText: CONSENT,
    codeRequiredBeforeView: true,
    external: false,
    ...overrides
  };
}

function renderFlow(token = 'jeton-1') {
  return render(
    <AntApp>
      <PublicSigningFlow token={token} />
    </AntApp>
  );
}

const createObjectURL = vi.fn(() => 'blob:pdf-1');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });
  requestPublicOtp.mockResolvedValue({ status: 'ok', data: { sentTo: 'a***@mail.com', retryAfterSeconds: 0 } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function verifyCode(user: ReturnType<typeof userEvent.setup>, code = '123456') {
  await user.click(await screen.findByRole('button', { name: 'Recevoir le code' }));
  await user.type(await screen.findByLabelText('Code reçu'), code);
  await user.click(screen.getByRole('button', { name: 'Vérifier le code' }));
}

describe('PublicSigningFlow, code avant consultation (prélèvement)', () => {
  it('ne charge aucun PDF et ne monte aucun iframe avant la vérification du code', async () => {
    fetchPublicSignature.mockResolvedValue({ status: 'ok', data: dto() });
    renderFlow();

    expect(await screen.findByText('Autorisation de prélèvement MDT-2026-0001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recevoir le code' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vérifier le code' })).toBeDisabled();
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Signer le document' })).not.toBeInTheDocument();
    expect(fetchPublicSignatureBlob).not.toHaveBeenCalled();
  });

  it('après vérification, charge le PDF en blob avec le jeton et signe avec ce jeton, sans code', async () => {
    fetchPublicSignature.mockResolvedValue({ status: 'ok', data: dto() });
    verifyPublicOtp.mockResolvedValue({
      status: 'ok',
      data: { viewToken: 'vue-secrete', expiresAt: '2026-10-17T12:15:00Z' }
    });
    fetchPublicSignatureBlob.mockResolvedValue({ status: 'ok', data: new Blob(['%PDF'], { type: 'application/pdf' }) });
    submitPublicSignature.mockResolvedValue({ status: 'ok', data: { status: 'SIGNED', requestStatus: 'COMPLETED' } });
    const user = userEvent.setup();
    renderFlow();

    await verifyCode(user);

    await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull());
    expect(verifyPublicOtp).toHaveBeenCalledWith('jeton-1', '123456');
    expect(fetchPublicSignatureBlob).toHaveBeenCalledWith('jeton-1', 'vue-secrete');
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toBe('blob:pdf-1');
    expect(frame.getAttribute('src')).not.toContain('vue-secrete');
    // Plus de champ de code à l'étape de signature.
    expect(screen.queryByLabelText('Code reçu')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox'));
    await user.type(screen.getByLabelText('Tapez votre nom complet'), 'Awa Traoré');
    await user.click(screen.getByRole('button', { name: 'Signer le document' }));

    await waitFor(() => expect(submitPublicSignature).toHaveBeenCalledTimes(1));
    const [token, input, viewToken] = submitPublicSignature.mock.calls[0];
    expect(token).toBe('jeton-1');
    expect(viewToken).toBe('vue-secrete');
    expect(input).toEqual({ consent: true, signature: { mode: 'TYPED', value: 'Awa Traoré' } });
    expect(await screen.findByText('Merci, votre signature est enregistrée')).toBeInTheDocument();
  });

  it("révoque l'URL d'objet du PDF au démontage", async () => {
    fetchPublicSignature.mockResolvedValue({ status: 'ok', data: dto() });
    verifyPublicOtp.mockResolvedValue({ status: 'ok', data: { viewToken: 'vue' } });
    fetchPublicSignatureBlob.mockResolvedValue({ status: 'ok', data: new Blob(['%PDF']) });
    const user = userEvent.setup();
    const { unmount } = renderFlow();
    await verifyCode(user);
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:pdf-1');
  });

  it('refuse un code incorrect sans montrer le document', async () => {
    fetchPublicSignature.mockResolvedValue({ status: 'ok', data: dto() });
    verifyPublicOtp.mockResolvedValue({
      status: 'invalid',
      httpStatus: 400,
      code: 'SIGNATURE_OTP_INVALID',
      details: { attemptsRemaining: 2 }
    });
    const user = userEvent.setup();
    renderFlow();

    await verifyCode(user, '000000');

    expect(await screen.findByText('Code incorrect ou expiré. Essais restants : 2.')).toBeInTheDocument();
    expect(fetchPublicSignatureBlob).not.toHaveBeenCalled();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it("revient à l'étape du code quand le jeton de consultation n'est plus accepté à la signature", async () => {
    fetchPublicSignature.mockResolvedValue({ status: 'ok', data: dto() });
    verifyPublicOtp.mockResolvedValue({ status: 'ok', data: { viewToken: 'vue' } });
    fetchPublicSignatureBlob.mockResolvedValue({ status: 'ok', data: new Blob(['%PDF']) });
    submitPublicSignature.mockResolvedValue({ status: 'invalid', httpStatus: 404 });
    const user = userEvent.setup();
    renderFlow();
    await verifyCode(user);
    await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull());

    await user.click(screen.getByRole('checkbox'));
    await user.type(screen.getByLabelText('Tapez votre nom complet'), 'Awa Traoré');
    await user.click(screen.getByRole('button', { name: 'Signer le document' }));

    expect(
      await screen.findByText('Votre vérification a expiré : recevez un nouveau code pour continuer.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vérifier le code' })).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('fournisseur externe : « Continuer vers la signature » redirige vers le lien remis par l’API', async () => {
    fetchPublicSignature.mockResolvedValue({ status: 'ok', data: dto({ external: true }) });
    verifyPublicOtp.mockResolvedValue({ status: 'ok', data: { viewToken: 'vue' } });
    fetchPublicSignatureBlob.mockResolvedValue({ status: 'ok', data: new Blob(['%PDF']) });
    fetchPublicExternalLink.mockResolvedValue({ status: 'ok', data: { url: 'https://yousign.test/s/abc' } });
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, assign } });
    try {
      const user = userEvent.setup();
      renderFlow();
      await verifyCode(user);

      const go = await screen.findByRole('button', { name: 'Continuer vers la signature' });
      // Pas de formulaire de signature interne avec un fournisseur externe.
      expect(screen.queryByRole('button', { name: 'Signer le document' })).not.toBeInTheDocument();
      await user.click(go);

      await waitFor(() => expect(assign).toHaveBeenCalledWith('https://yousign.test/s/abc'));
      expect(fetchPublicExternalLink).toHaveBeenCalledWith('jeton-1', 'vue');
      expect(submitPublicSignature).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });
});

describe('PublicSigningFlow, autres types de document', () => {
  it('garde le parcours actuel : PDF affiché par URL dès le départ, code saisi à la signature', async () => {
    fetchPublicSignature.mockResolvedValue({
      status: 'ok',
      data: dto({
        request: {
          kind: 'LEASE_CONTRACT',
          title: 'Contrat de bail B-1',
          status: 'SENT',
          expiresAt: '2026-12-01T00:00:00Z'
        },
        codeRequiredBeforeView: undefined,
        external: undefined
      })
    });
    submitPublicSignature.mockResolvedValue({ status: 'ok', data: { status: 'SIGNED', requestStatus: 'COMPLETED' } });
    const user = userEvent.setup();
    renderFlow('abc');

    await screen.findByText('Contrat de bail B-1');
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toBe('http://api.test/public/signatures/abc/file');
    expect(fetchPublicSignatureBlob).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Vérifier le code' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox'));
    await user.type(screen.getByLabelText('Code reçu'), '654321');
    await user.type(screen.getByLabelText('Tapez votre nom complet'), 'Awa Traoré');
    fireEvent.click(screen.getByRole('button', { name: 'Signer le document' }));

    await waitFor(() => expect(submitPublicSignature).toHaveBeenCalledTimes(1));
    const [, input, viewToken] = submitPublicSignature.mock.calls[0];
    expect(input).toEqual({ code: '654321', consent: true, signature: { mode: 'TYPED', value: 'Awa Traoré' } });
    expect(viewToken).toBeUndefined();
  });
});
