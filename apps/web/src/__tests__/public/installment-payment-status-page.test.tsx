import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import {
  InstallmentPaymentStatusPage,
  STATUS_POLL_INTERVAL_MS,
  STATUS_POLL_MAX_MS,
  STATUS_POLL_RETRY_INTERVAL_MS,
  STATUS_CODE_STORAGE_KEY
} from '../../pages/public/InstallmentPaymentStatusPage';
import apiClient from '../../utils/api-client';

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

const mockPost = (apiClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
const mockGet = (apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get;

const CODE = 'IMT-abcdefghij0123456789';
const INVALID = 'Lien invalide ou expiré';

const dto = (status: string) => ({
  status: 200,
  data: {
    success: true,
    data: { status, amount: 125000, currency: 'FCFA', agencyName: 'Agence Soleil', periodYear: 2026, periodMonth: 9 }
  }
});

function setUrl(search: string) {
  window.history.replaceState(null, '', `/payer/statut${search}`);
}

/** Laisse les promesses en attente se résoudre sans avancer l'horloge. */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(STATUS_POLL_INTERVAL_MS);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

describe('InstallmentPaymentStatusPage', () => {
  it('reads the code, erases it from the URL, and posts it in the body only (once under StrictMode)', async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost.mockResolvedValue(dto('SUCCESS'));

    render(
      <React.StrictMode>
        <InstallmentPaymentStatusPage />
      </React.StrictMode>
    );
    await flush();

    expect(screen.getByText('Paiement reçu')).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(window.location.href).not.toContain(CODE);
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body, config] = mockPost.mock.calls[0];
    expect(url).toBe('/public/secure-links/installment-payment/status');
    expect(url).not.toContain(CODE);
    expect(body).toEqual({ codePaiement: CODE });
    expect(config).toMatchObject({ withCredentials: false });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('polls every 3 s while PENDING, then shows paid only once the server says SUCCESS', async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost
      .mockResolvedValueOnce(dto('PENDING'))
      .mockResolvedValueOnce(dto('PENDING'))
      .mockResolvedValueOnce(dto('SUCCESS'));

    render(<InstallmentPaymentStatusPage />);
    await flush();
    expect(screen.getByText('Paiement en cours de vérification')).toBeInTheDocument();
    expect(screen.queryByText('Paiement reçu')).not.toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledTimes(1);

    await tick();
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Paiement reçu')).not.toBeInTheDocument();

    await tick();
    expect(mockPost).toHaveBeenCalledTimes(3);
    expect(screen.getByText('Paiement reçu')).toBeInTheDocument();
    expect(mockPost.mock.calls.every(call => call[1].codePaiement === CODE)).toBe(true);

    await tick();
    expect(mockPost).toHaveBeenCalledTimes(3); // plus de poll une fois payé
  });

  it('never shows paid because of the URL: ?paiement=...&statut=SUCCESS follows the server answer', async () => {
    setUrl(`?paiement=${CODE}&statut=SUCCESS&status=SUCCESS`);
    mockPost.mockResolvedValue(dto('PENDING'));

    render(<InstallmentPaymentStatusPage />);
    expect(screen.queryByText('Paiement reçu')).not.toBeInTheDocument();
    await flush();

    expect(screen.queryByText('Paiement reçu')).not.toBeInTheDocument();
    expect(screen.getByText('Paiement en cours de vérification')).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(mockPost.mock.calls[0][1]).toEqual({ codePaiement: CODE });
  });

  it('shows the failed and canceled states from the server answer, without polling', async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost.mockResolvedValueOnce(dto('FAILED'));
    const first = render(<InstallmentPaymentStatusPage />);
    await flush();
    expect(screen.getByText('Le paiement a échoué')).toBeInTheDocument();
    first.unmount();

    setUrl(`?paiement=${CODE}`);
    mockPost.mockResolvedValueOnce(dto('CANCELED'));
    render(<InstallmentPaymentStatusPage />);
    await flush();
    expect(screen.getByText('Paiement annulé')).toBeInTheDocument();

    await tick();
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('stops polling after about two minutes and says to come back later', async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost.mockResolvedValue(dto('PENDING'));

    render(<InstallmentPaymentStatusPage />);
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_POLL_MAX_MS + STATUS_POLL_INTERVAL_MS);
    });

    expect(screen.getByText('Vérification en cours, revenez plus tard')).toBeInTheDocument();
    expect(screen.getByText(/Rechargez cette page pour reprendre la vérification/)).toBeInTheDocument();
    const calls = mockPost.mock.calls.length;
    await tick();
    await tick();
    expect(mockPost).toHaveBeenCalledTimes(calls);
  });

  it('keeps the pending screen on a 429 or an outage after a state was obtained, and retries later', async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost
      .mockResolvedValueOnce(dto('PENDING'))
      .mockResolvedValueOnce({ status: 429, data: { success: false } })
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(dto('SUCCESS'));

    render(<InstallmentPaymentStatusPage />);
    await flush();
    expect(screen.getByText('Paiement en cours de vérification')).toBeInTheDocument();

    await tick(); // 429
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Paiement en cours de vérification')).toBeInTheDocument();
    expect(screen.queryByText('Trop de tentatives, réessayez dans quelques minutes.')).not.toBeInTheDocument();

    // La reprise attend le délai plus long, pas 3 s.
    await tick();
    expect(mockPost).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_POLL_RETRY_INTERVAL_MS - STATUS_POLL_INTERVAL_MS);
    });
    expect(mockPost).toHaveBeenCalledTimes(3); // panne réseau
    expect(screen.getByText('Paiement en cours de vérification')).toBeInTheDocument();
    expect(
      screen.queryByText('Service momentanément indisponible, réessayez dans quelques minutes.')
    ).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_POLL_RETRY_INTERVAL_MS);
    });
    expect(screen.getByText('Paiement reçu')).toBeInTheDocument();
  });

  it('keeps the code in sessionStorage, resumes after a reload, and clears it on a terminal answer', async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost.mockResolvedValueOnce(dto('PENDING'));
    const first = render(<InstallmentPaymentStatusPage />);
    await flush();
    expect(window.sessionStorage.getItem(STATUS_CODE_STORAGE_KEY)).toBe(CODE);
    expect(window.location.search).toBe('');
    first.unmount();

    // Rechargement : plus de query, le code revient du stockage ; l'URL ne prouve rien.
    setUrl('');
    mockPost.mockClear();
    mockPost.mockResolvedValueOnce(dto('PENDING')).mockResolvedValueOnce(dto('SUCCESS'));
    render(<InstallmentPaymentStatusPage />);
    await flush();
    expect(mockPost.mock.calls[0][1]).toEqual({ codePaiement: CODE });
    expect(screen.getByText('Paiement en cours de vérification')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(STATUS_CODE_STORAGE_KEY)).toBe(CODE);

    await tick();
    expect(screen.getByText('Paiement reçu')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(STATUS_CODE_STORAGE_KEY)).toBeNull();
  });

  it('works without sessionStorage and tells the tenant to contact the agency on timeout', async () => {
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      setUrl(`?paiement=${CODE}`);
      mockPost.mockResolvedValue(dto('PENDING'));
      render(<InstallmentPaymentStatusPage />);
      await flush();
      expect(screen.getByText('Paiement en cours de vérification')).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(STATUS_POLL_MAX_MS + STATUS_POLL_INTERVAL_MS);
      });
      expect(screen.getByText(/Contactez votre agence/)).toBeInTheDocument();
    } finally {
      setSpy.mockRestore();
      getSpy.mockRestore();
    }
  });

  it('exposes the result container as a polite live region with a labelled spinner', async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost.mockResolvedValue(dto('PENDING'));
    render(<InstallmentPaymentStatusPage />);
    await flush();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByLabelText('Paiement en cours de vérification')).toBeInTheDocument();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
  });

  it('clears the poll timer on unmount', async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost.mockResolvedValue(dto('PENDING'));

    const { unmount } = render(<InstallmentPaymentStatusPage />);
    await flush();
    expect(mockPost).toHaveBeenCalledTimes(1);
    unmount();
    await tick();
    await tick();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('shows the uniform invalid screen on 404 and without a network call when the code is missing', async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost.mockResolvedValueOnce({ status: 404, data: { success: false } });
    const first = render(<InstallmentPaymentStatusPage />);
    await flush();
    expect(screen.getByText(INVALID)).toBeInTheDocument();
    first.unmount();

    mockPost.mockClear();
    setUrl('?statut=SUCCESS');
    render(<InstallmentPaymentStatusPage />);
    await flush();
    expect(screen.getByText(INVALID)).toBeInTheDocument();
    expect(screen.queryByText('Paiement reçu')).not.toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('shows 429 and unavailable states', async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost.mockResolvedValueOnce({ status: 429, data: { success: false } });
    const first = render(<InstallmentPaymentStatusPage />);
    await flush();
    expect(screen.getByText('Trop de tentatives, réessayez dans quelques minutes.')).toBeInTheDocument();
    first.unmount();

    setUrl(`?paiement=${CODE}`);
    mockPost.mockRejectedValueOnce(new Error('network'));
    render(<InstallmentPaymentStatusPage />);
    await flush();
    expect(
      screen.getByText('Service momentanément indisponible, réessayez dans quelques minutes.')
    ).toBeInTheDocument();
  });
});
