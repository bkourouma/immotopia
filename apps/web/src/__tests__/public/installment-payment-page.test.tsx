import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InstallmentPaymentPage } from '../../pages/public/InstallmentPaymentPage';
import apiClient from '../../utils/api-client';

/** Le mock se pose à la frontière réseau ; le vrai service tourne par-dessus. */
vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

// jsdom rend `window.location.assign` non configurable : la redirection passe par ce module.
const redirectMock = vi.fn();
vi.mock('../../utils/external-redirect', () => ({
  redirectToExternalUrl: (url: string) => redirectMock(url)
}));

const mockPost = (apiClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
const mockGet = (apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get;

const REVIEW =
  "Votre paiement est en cours de vérification par l'agence. Contactez votre agence si le problème persiste.";
const INVALID = 'Lien invalide ou expiré';

const payment = {
  agencyName: 'Agence Soleil',
  periodYear: 2026,
  periodMonth: 9,
  dueDate: '2026-09-05T00:00:00.000Z',
  amountDue: 125000,
  currency: 'FCFA',
  expiresAt: '2026-10-15T10:00:00.000Z',
  paymentMethods: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'],
  simulated: false,
  paymentInProgress: false,
  reviewPending: false
};

const ok = (data: unknown) => ({ status: 200, data: { success: true, data } });

function setHash(hash: string) {
  window.history.replaceState(null, '', `/payer${hash}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('InstallmentPaymentPage', () => {
  it('reads the token from the fragment, clears it, and posts it in the body only (once under StrictMode)', async () => {
    setHash('#jeton-abc');
    mockPost.mockResolvedValue(ok(payment));

    render(
      <React.StrictMode>
        <InstallmentPaymentPage />
      </React.StrictMode>
    );

    expect(await screen.findByText('Agence Soleil')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('jeton-abc');
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body, config] = mockPost.mock.calls[0];
    expect(url).toBe('/public/secure-links/installment-payment');
    expect(url).not.toContain('jeton-abc');
    expect(body).toEqual({ token: 'jeton-abc' });
    expect(config).toMatchObject({ withCredentials: false });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('shows the server amount, period, methods, and meta tags; never the token', async () => {
    setHash('#jeton-abc');
    mockPost.mockResolvedValueOnce(ok(payment));

    const { container, unmount } = render(<InstallmentPaymentPage />);

    expect(await screen.findByText(/Paiement du loyer — septembre 2026/)).toBeInTheDocument();
    expect(container.querySelector('bdi[dir="ltr"]')?.textContent).toMatch(/125\s?000/);
    expect(screen.getByText('Wave')).toBeInTheDocument();
    expect(screen.getByText('Orange Money')).toBeInTheDocument();
    expect(screen.getByText('MTN Money')).toBeInTheDocument();
    expect(screen.getByText('Moov Money')).toBeInTheDocument();
    expect(screen.queryByText('Mode test')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain('jeton-abc');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
    expect(document.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe('no-referrer');
    unmount();
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('shows the test-mode banner and the in-progress warning when the server says so', async () => {
    setHash('#jeton');
    mockPost.mockResolvedValueOnce(ok({ ...payment, simulated: true, paymentInProgress: true }));
    render(<InstallmentPaymentPage />);
    expect(await screen.findByText('Mode test')).toBeInTheDocument();
    expect(screen.getByText(/Un paiement est déjà en cours pour cette échéance\. Si vous/)).toBeInTheDocument();
  });

  it('shows the single uniform invalid screen on 404 and 400', async () => {
    setHash('#expire');
    mockPost.mockResolvedValueOnce({ status: 404, data: { success: false } });
    const first = render(<InstallmentPaymentPage />);
    expect(await screen.findByText(INVALID)).toBeInTheDocument();
    first.unmount();

    setHash('#jeton');
    mockPost.mockResolvedValueOnce({ status: 400, data: { success: false } });
    render(<InstallmentPaymentPage />);
    expect(await screen.findByText(INVALID)).toBeInTheDocument();
  });

  it('shows distinct 429 and unavailable states', async () => {
    setHash('#jeton');
    mockPost.mockResolvedValueOnce({ status: 429, data: { success: false } });
    const first = render(<InstallmentPaymentPage />);
    expect(await screen.findByText('Trop de tentatives, réessayez dans quelques minutes.')).toBeInTheDocument();
    first.unmount();

    setHash('#jeton');
    mockPost.mockRejectedValueOnce(new Error('network'));
    render(<InstallmentPaymentPage />);
    expect(
      await screen.findByText('Service momentanément indisponible, réessayez dans quelques minutes.')
    ).toBeInTheDocument();
    expect(screen.queryByText(INVALID)).not.toBeInTheDocument();
  });

  it('shows the invalid screen without any network call when the token is missing', async () => {
    setHash('');
    render(<InstallmentPaymentPage />);
    await waitFor(() => expect(screen.getByText(INVALID)).toBeInTheDocument());
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('reloads on hashchange with the new token and clears it again', async () => {
    setHash('#premier');
    mockPost.mockResolvedValueOnce(ok(payment));
    render(<InstallmentPaymentPage />);
    await screen.findByText('Agence Soleil');

    mockPost.mockResolvedValueOnce(ok({ ...payment, agencyName: 'Agence Lune' }));
    act(() => {
      window.history.replaceState(null, '', '/payer#second');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByText('Agence Lune')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost.mock.calls[1][1]).toEqual({ token: 'second' });
    expect(window.location.hash).toBe('');
  });

  it('shows the agency-review message and disables the pay button when reviewPending', async () => {
    setHash('#jeton');
    mockPost.mockResolvedValueOnce(ok({ ...payment, reviewPending: true }));
    render(<InstallmentPaymentPage />);
    expect(await screen.findByText(REVIEW)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Payer maintenant/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mockPost).toHaveBeenCalledTimes(1); // aucun /start
    expect(redirectMock).not.toHaveBeenCalled();
  });

  describe('Payer maintenant', () => {
    async function openPage() {
      setHash('#jeton-abc');
      mockPost.mockResolvedValueOnce(ok(payment));
      render(<InstallmentPaymentPage />);
      return screen.findByRole('button', { name: 'Payer maintenant' });
    }

    it('starts the payment with the token in the body and redirects to the https URL provided', async () => {
      const button = await openPage();
      mockPost.mockResolvedValueOnce(ok({ checkoutUrl: 'https://pay.example.com/checkout/abc' }));

      fireEvent.click(button);

      await waitFor(() => expect(redirectMock).toHaveBeenCalledWith('https://pay.example.com/checkout/abc'));
      const [url, body] = mockPost.mock.calls[1];
      expect(url).toBe('/public/secure-links/installment-payment/start');
      expect(body).toEqual({ token: 'jeton-abc' });
    });

    it('allows http only toward localhost', async () => {
      const button = await openPage();
      mockPost.mockResolvedValueOnce(ok({ checkoutUrl: 'http://localhost:8001/simulator/pay' }));
      fireEvent.click(button);
      await waitFor(() => expect(redirectMock).toHaveBeenCalledWith('http://localhost:8001/simulator/pay'));
    });

    it.each([
      ['javascript scheme', 'javascript:alert(1)'],
      ['relative path', '/payer/statut?paiement=IMT-AAAAAAAAAAAAAAAAAAAA'],
      ['protocol-relative', '//evil.example.com/pay'],
      ['data scheme', 'data:text/html,<script>alert(1)</script>'],
      ['http on a public host', 'http://pay.example.com/checkout'],
      ['embedded credentials', 'https://user:pass@pay.example.com/checkout'],
      ['empty', '']
    ])('refuses %s and shows an error without redirecting', async (_label, checkoutUrl) => {
      const button = await openPage();
      mockPost.mockResolvedValueOnce(ok({ checkoutUrl }));

      fireEvent.click(button);

      expect(await screen.findByText(/Le paiement n'a pas pu être lancé/)).toBeInTheDocument();
      expect(redirectMock).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /Payer maintenant/ })).toBeEnabled();
    });

    it('releases the button on a bfcache pageshow, and ignores a plain pageshow', async () => {
      const button = await openPage();
      mockPost.mockResolvedValueOnce(ok({ checkoutUrl: 'https://pay.example.com/c' }));
      fireEvent.click(button);
      await waitFor(() => expect(redirectMock).toHaveBeenCalledTimes(1));
      expect(screen.getByRole('button', { name: /Payer maintenant/ })).toBeDisabled();

      act(() => {
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
      });
      expect(screen.getByRole('button', { name: /Payer maintenant/ })).toBeDisabled();

      act(() => {
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      });
      await waitFor(() => expect(screen.getByRole('button', { name: /Payer maintenant/ })).toBeEnabled());
    });

    it('does not redirect when the token changed while /start was in flight', async () => {
      const button = await openPage();
      let resolveStart: (value: unknown) => void = () => undefined;
      mockPost.mockImplementationOnce(() => new Promise(resolve => (resolveStart = resolve)));
      fireEvent.click(button);

      mockPost.mockResolvedValueOnce(ok({ ...payment, agencyName: 'Agence Lune' }));
      act(() => {
        window.history.replaceState(null, '', '/payer#autre-jeton');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
      await act(async () => {
        resolveStart(ok({ checkoutUrl: 'https://pay.example.com/ancien' }));
      });

      expect(await screen.findByText('Agence Lune')).toBeInTheDocument();
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it('does not double-post on a double click', async () => {
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

    it('shows a dedicated message on 409', async () => {
      const button = await openPage();
      mockPost.mockResolvedValueOnce({ status: 409, data: { success: false } });
      fireEvent.click(button);
      expect(await screen.findByText(/Patientez quelques minutes puis réessayez/)).toBeInTheDocument();
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it('shows the agency-review message on a 409 whose body says reviewPending', async () => {
      const button = await openPage();
      mockPost.mockResolvedValueOnce({ status: 409, data: { success: false, data: { reviewPending: true } } });
      fireEvent.click(button);
      expect(await screen.findByText(REVIEW)).toBeInTheDocument();
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it('shows the uniform invalid screen when the link is refused at start', async () => {
      const button = await openPage();
      mockPost.mockResolvedValueOnce({ status: 404, data: { success: false } });
      fireEvent.click(button);
      expect(await screen.findByText(INVALID)).toBeInTheDocument();
    });

    it('shows 429 and unavailable errors and re-enables the button', async () => {
      const button = await openPage();
      mockPost.mockResolvedValueOnce({ status: 429, data: { success: false } });
      fireEvent.click(button);
      expect(await screen.findByText('Trop de tentatives, réessayez dans quelques minutes.')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('button', { name: /Payer maintenant/ })).toBeEnabled());

      mockPost.mockResolvedValueOnce({ status: 502, data: { success: false } });
      fireEvent.click(screen.getByRole('button', { name: /Payer maintenant/ }));
      expect(
        await screen.findByText('Service momentanément indisponible, réessayez dans quelques minutes.')
      ).toBeInTheDocument();
      expect(redirectMock).not.toHaveBeenCalled();
    });
  });
});
