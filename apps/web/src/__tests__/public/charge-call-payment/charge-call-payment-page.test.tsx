import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChargeCallPaymentPage } from '../../../pages/public/ChargeCallPaymentPage';
import apiClient from '../../../utils/api-client';

/** Le mock se pose à la frontière réseau ; le vrai service tourne par-dessus. */
vi.mock('../../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

// jsdom rend `window.location.assign` non configurable : la redirection passe par ce module.
const redirectMock = vi.fn();
vi.mock('../../../utils/external-redirect', () => ({
  redirectToExternalUrl: (url: string) => redirectMock(url)
}));

const mockPost = (apiClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
const mockGet = (apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get;

const REVIEW = 'Votre paiement est en cours de vérification par le syndic. Contactez votre syndic.';
const INVALID = 'Lien invalide ou expiré';
const BASE = '/public/secure-links/charge-call-payment';

const payment = {
  syndicateName: 'Résidence Les Palmiers',
  lotLabel: 'Lot A12',
  period: '3e trimestre 2026',
  dueDate: '2026-09-05T00:00:00.000Z',
  amountDue: 125000,
  currency: 'FCFA',
  expiresAt: '2026-10-15T10:00:00.000Z',
  paymentMethods: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY', 'CARD'],
  simulated: false,
  feesPaidBy: 'CLIENT',
  paymentInProgress: false,
  reviewPending: false
};

const ok = (data: unknown) => ({ status: 200, data: { success: true, data } });

function setHash(hash: string) {
  window.history.replaceState(null, '', `/payer-charges${hash}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('ChargeCallPaymentPage', () => {
  it("lit le jeton dans le fragment, le retire de l'adresse et ne l'envoie que dans le corps (une fois sous StrictMode)", async () => {
    setHash('#jeton-abc');
    mockPost.mockResolvedValue(ok(payment));

    render(
      <React.StrictMode>
        <ChargeCallPaymentPage />
      </React.StrictMode>
    );

    expect(await screen.findByText('Lot A12')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('jeton-abc');
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body, config] = mockPost.mock.calls[0];
    expect(url).toBe(BASE);
    expect(url).not.toContain('jeton-abc');
    expect(body).toEqual({ token: 'jeton-abc' });
    expect(config).toMatchObject({ withCredentials: false });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('affiche le récapitulatif du serveur, les balises meta, et jamais le jeton', async () => {
    setHash('#jeton-abc');
    mockPost.mockResolvedValueOnce(ok(payment));

    const { container, unmount } = render(<ChargeCallPaymentPage />);

    expect(await screen.findByText(/Appel de charges — 3e trimestre 2026/)).toBeInTheDocument();
    expect(screen.getAllByText('Résidence Les Palmiers').length).toBeGreaterThan(0);
    expect(screen.getByText('3e trimestre 2026', { selector: 'td, span' })).toBeInTheDocument();
    expect(container.querySelector('bdi[dir="ltr"]')?.textContent).toMatch(/125\s?000/);
    expect(screen.getByText('Wave')).toBeInTheDocument();
    expect(screen.getByText('Carte bancaire')).toBeInTheDocument();
    expect(screen.getByText(/Des frais du service de paiement peuvent s'ajouter/)).toBeInTheDocument();
    expect(screen.queryByText('Mode test')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain('jeton-abc');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
    expect(document.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe('no-referrer');
    unmount();
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('annonce que les frais sont à la charge du syndic quand feesPaidBy vaut AGENCY', async () => {
    setHash('#jeton');
    mockPost.mockResolvedValueOnce(ok({ ...payment, feesPaidBy: 'AGENCY' }));
    render(<ChargeCallPaymentPage />);
    expect(
      await screen.findByText(/frais du service de paiement sont pris en charge par le syndic/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/peuvent s'ajouter/)).not.toBeInTheDocument();
  });

  it("affiche le bandeau de test et l'avertissement de paiement en cours quand le serveur le dit", async () => {
    setHash('#jeton');
    mockPost.mockResolvedValueOnce(ok({ ...payment, simulated: true, paymentInProgress: true }));
    render(<ChargeCallPaymentPage />);
    expect(await screen.findByText('Mode test')).toBeInTheDocument();
    expect(screen.getByText(/Un paiement en ligne est déjà en cours pour cet appel\. Si vous/)).toBeInTheDocument();
  });

  it("affiche l'unique écran « lien invalide » sur 404 (expiré, soldé, copropriété non configurée) et 400", async () => {
    setHash('#expire');
    mockPost.mockResolvedValueOnce({ status: 404, data: { success: false, message: 'Lien invalide ou expiré.' } });
    const first = render(<ChargeCallPaymentPage />);
    expect(await screen.findByText(INVALID)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Payer/ })).not.toBeInTheDocument();
    first.unmount();

    setHash('#jeton');
    mockPost.mockResolvedValueOnce({ status: 400, data: { success: false } });
    render(<ChargeCallPaymentPage />);
    expect(await screen.findByText(INVALID)).toBeInTheDocument();
  });

  it('distingue les états 429 et indisponible du lien invalide', async () => {
    setHash('#jeton');
    mockPost.mockResolvedValueOnce({ status: 429, data: { success: false } });
    const first = render(<ChargeCallPaymentPage />);
    expect(await screen.findByText('Trop de tentatives, réessayez dans quelques minutes.')).toBeInTheDocument();
    first.unmount();

    setHash('#jeton');
    mockPost.mockRejectedValueOnce(new Error('network'));
    render(<ChargeCallPaymentPage />);
    expect(
      await screen.findByText('Service momentanément indisponible, réessayez dans quelques minutes.')
    ).toBeInTheDocument();
    expect(screen.queryByText(INVALID)).not.toBeInTheDocument();
  });

  it('affiche « lien invalide » sans aucun appel réseau quand le jeton manque', async () => {
    setHash('');
    render(<ChargeCallPaymentPage />);
    await waitFor(() => expect(screen.getByText(INVALID)).toBeInTheDocument());
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("recharge au changement de fragment avec le nouveau jeton et l'efface de nouveau", async () => {
    setHash('#premier');
    mockPost.mockResolvedValueOnce(ok(payment));
    render(<ChargeCallPaymentPage />);
    await screen.findByText('Lot A12');

    mockPost.mockResolvedValueOnce(ok({ ...payment, lotLabel: 'Lot B07' }));
    act(() => {
      window.history.replaceState(null, '', '/payer-charges#second');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByText('Lot B07')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost.mock.calls[1][1]).toEqual({ token: 'second' });
    expect(window.location.hash).toBe('');
  });

  it('bloque le bouton et affiche le message de vérification quand reviewPending', async () => {
    setHash('#jeton');
    mockPost.mockResolvedValueOnce(ok({ ...payment, reviewPending: true }));
    render(<ChargeCallPaymentPage />);
    expect(await screen.findByText(REVIEW)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Payer/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mockPost).toHaveBeenCalledTimes(1); // aucun /start
    expect(redirectMock).not.toHaveBeenCalled();
  });

  describe('Payer', () => {
    async function openPage() {
      setHash('#jeton-abc');
      mockPost.mockResolvedValueOnce(ok(payment));
      render(<ChargeCallPaymentPage />);
      return screen.findByRole('button', { name: /Payer/ });
    }

    it("démarre le paiement avec le jeton dans le corps et redirige vers l'URL https fournie", async () => {
      const button = await openPage();
      mockPost.mockResolvedValueOnce(ok({ checkoutUrl: 'https://pay.example.com/checkout/abc' }));

      fireEvent.click(button);

      await waitFor(() => expect(redirectMock).toHaveBeenCalledWith('https://pay.example.com/checkout/abc'));
      const [url, body] = mockPost.mock.calls[1];
      expect(url).toBe(`${BASE}/start`);
      expect(body).toEqual({ token: 'jeton-abc' });
    });

    it("n'autorise http que vers localhost", async () => {
      const button = await openPage();
      mockPost.mockResolvedValueOnce(ok({ checkoutUrl: 'http://localhost:8001/simulator/pay' }));
      fireEvent.click(button);
      await waitFor(() => expect(redirectMock).toHaveBeenCalledWith('http://localhost:8001/simulator/pay'));
    });

    it.each([
      ['schéma javascript', 'javascript:alert(1)'],
      ['chemin relatif', '/payer-charges/statut?paiement=IMS-AAAAAAAAAAAAAAAAAAAA'],
      ['relative au protocole', '//evil.example.com/pay'],
      ['schéma data', 'data:text/html,<script>alert(1)</script>'],
      ['http sur un hôte public', 'http://pay.example.com/checkout'],
      ['identifiants intégrés', 'https://user:pass@pay.example.com/checkout'],
      ['vide', '']
    ])("refuse %s : message d'erreur, aucune redirection", async (_label, checkoutUrl) => {
      const button = await openPage();
      mockPost.mockResolvedValueOnce(ok({ checkoutUrl }));

      fireEvent.click(button);

      expect(await screen.findByText(/Le paiement n'a pas pu être lancé/)).toBeInTheDocument();
      expect(redirectMock).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /Payer/ })).toBeEnabled();
    });

    it('libère le bouton sur un pageshow issu du cache arrière/avant, pas sur un pageshow ordinaire', async () => {
      const button = await openPage();
      mockPost.mockResolvedValueOnce(ok({ checkoutUrl: 'https://pay.example.com/c' }));
      fireEvent.click(button);
      await waitFor(() => expect(redirectMock).toHaveBeenCalledTimes(1));
      expect(screen.getByRole('button', { name: /Payer/ })).toBeDisabled();

      act(() => {
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
      });
      expect(screen.getByRole('button', { name: /Payer/ })).toBeDisabled();

      act(() => {
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      });
      await waitFor(() => expect(screen.getByRole('button', { name: /Payer/ })).toBeEnabled());
    });

    it("ne redirige pas quand le jeton a changé pendant l'appel /start", async () => {
      const button = await openPage();
      let resolveStart: (value: unknown) => void = () => undefined;
      mockPost.mockImplementationOnce(() => new Promise(resolve => (resolveStart = resolve)));
      fireEvent.click(button);

      mockPost.mockResolvedValueOnce(ok({ ...payment, lotLabel: 'Lot B07' }));
      act(() => {
        window.history.replaceState(null, '', '/payer-charges#autre-jeton');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
      await act(async () => {
        resolveStart(ok({ checkoutUrl: 'https://pay.example.com/ancien' }));
      });

      expect(await screen.findByText('Lot B07')).toBeInTheDocument();
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it('ne poste pas deux fois sur un double clic', async () => {
      const button = await openPage();
      let resolveStart: (value: unknown) => void = () => undefined;
      mockPost.mockImplementationOnce(() => new Promise(resolve => (resolveStart = resolve)));

      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      expect(mockPost).toHaveBeenCalledTimes(2); // ouverture + un seul démarrage
      await act(async () => {
        resolveStart(ok({ checkoutUrl: 'https://pay.example.com/c' }));
      });
      await waitFor(() => expect(redirectMock).toHaveBeenCalledTimes(1));
    });

    it('affiche « paiement déjà en cours » sur le 409 ONLINE_PAYMENT_IN_PROGRESS', async () => {
      const button = await openPage();
      mockPost.mockResolvedValueOnce({
        status: 409,
        data: {
          success: false,
          code: 'ONLINE_PAYMENT_IN_PROGRESS',
          message: 'Un paiement en ligne est déjà en cours pour cet appel.'
        }
      });
      fireEvent.click(button);
      expect(await screen.findByText('Un paiement en ligne est déjà en cours pour cet appel.')).toBeInTheDocument();
      expect(screen.queryByText(REVIEW)).not.toBeInTheDocument();
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it('affiche le message de vérification par le syndic sur le 409 ONLINE_PAYMENT_UNDER_REVIEW', async () => {
      const button = await openPage();
      mockPost.mockResolvedValueOnce({
        status: 409,
        data: { success: false, code: 'ONLINE_PAYMENT_UNDER_REVIEW', message: REVIEW }
      });
      fireEvent.click(button);
      expect(await screen.findByText(REVIEW)).toBeInTheDocument();
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it('affiche le message dédié sur le 409 CHARGE_CALL_DECLARATION_PENDING (paiement mobile money déclaré en vérification)', async () => {
      const button = await openPage();
      mockPost.mockResolvedValueOnce({
        status: 409,
        data: { success: false, code: 'CHARGE_CALL_DECLARATION_PENDING', message: 'x', data: { chargeCallIds: ['c1'] } }
      });
      fireEvent.click(button);
      expect(
        await screen.findByText('Un paiement mobile money déclaré est en cours de vérification.')
      ).toBeInTheDocument();
      expect(screen.queryByText('Un paiement en ligne est déjà en cours pour cet appel.')).not.toBeInTheDocument();
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it("affiche l'écran « lien invalide » quand le lien est refusé au démarrage", async () => {
      const button = await openPage();
      mockPost.mockResolvedValueOnce({ status: 404, data: { success: false } });
      fireEvent.click(button);
      expect(await screen.findByText(INVALID)).toBeInTheDocument();
    });

    it('affiche les erreurs 429 et fournisseur injoignable (502) et réactive le bouton', async () => {
      const button = await openPage();
      mockPost.mockResolvedValueOnce({ status: 429, data: { success: false } });
      fireEvent.click(button);
      expect(await screen.findByText('Trop de tentatives, réessayez dans quelques minutes.')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('button', { name: /Payer/ })).toBeEnabled());

      mockPost.mockResolvedValueOnce({
        status: 502,
        data: { success: false, code: 'ONLINE_PAYMENT_PROVIDER_UNREACHABLE' }
      });
      fireEvent.click(screen.getByRole('button', { name: /Payer/ }));
      expect(
        await screen.findByText('Service momentanément indisponible, réessayez dans quelques minutes.')
      ).toBeInTheDocument();
      expect(redirectMock).not.toHaveBeenCalled();
    });
  });
});
