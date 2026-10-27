import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import {
  ChargeCallPaymentStatusPage,
  STATUS_POLL_INTERVAL_MS,
  STATUS_POLL_MAX_MS,
  STATUS_POLL_RETRY_INTERVAL_MS,
  STATUS_CODE_STORAGE_KEY
} from '../../../pages/public/ChargeCallPaymentStatusPage';
import apiClient from '../../../utils/api-client';

vi.mock('../../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

const mockPost = (apiClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
const mockGet = (apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get;

const CODE = 'IMS-abcdefghij0123456789';
const INVALID = 'Lien invalide ou expiré';

const dto = (status: string) => ({
  status: 200,
  data: {
    success: true,
    data: {
      status,
      amount: 125000,
      currency: 'FCFA',
      syndicateName: 'Résidence Les Palmiers',
      period: '3e trimestre 2026'
    }
  }
});

function setUrl(search: string) {
  window.history.replaceState(null, '', `/payer-charges/statut${search}`);
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

describe('ChargeCallPaymentStatusPage', () => {
  it("lit le code, l'efface de l'adresse et ne l'envoie que dans le corps (une fois sous StrictMode)", async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost.mockResolvedValue(dto('SUCCESS'));

    render(
      <React.StrictMode>
        <ChargeCallPaymentStatusPage />
      </React.StrictMode>
    );
    await flush();

    expect(screen.getByText('Paiement reçu')).toBeInTheDocument();
    expect(screen.getByText('Résidence Les Palmiers')).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(window.location.href).not.toContain(CODE);
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body, config] = mockPost.mock.calls[0];
    expect(url).toBe('/public/secure-links/charge-call-payment/status');
    expect(url).not.toContain(CODE);
    expect(body).toEqual({ codePaiement: CODE });
    expect(config).toMatchObject({ withCredentials: false });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("interroge toutes les 3 s tant que PENDING, et n'affiche « payé » que sur SUCCESS du serveur", async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost
      .mockResolvedValueOnce(dto('PENDING'))
      .mockResolvedValueOnce(dto('PENDING'))
      .mockResolvedValueOnce(dto('SUCCESS'));

    render(<ChargeCallPaymentStatusPage />);
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
    expect(mockPost).toHaveBeenCalledTimes(3); // plus d'interrogation une fois payé
  });

  it("ne conclut jamais « payé » d'après l'adresse : ?paiement=…&statut=SUCCESS suit la réponse du serveur", async () => {
    setUrl(`?paiement=${CODE}&statut=SUCCESS&status=SUCCESS`);
    mockPost.mockResolvedValue(dto('PENDING'));

    render(<ChargeCallPaymentStatusPage />);
    expect(screen.queryByText('Paiement reçu')).not.toBeInTheDocument();
    await flush();

    expect(screen.queryByText('Paiement reçu')).not.toBeInTheDocument();
    expect(screen.getByText('Paiement en cours de vérification')).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(mockPost.mock.calls[0][1]).toEqual({ codePaiement: CODE });
  });

  it("affiche échoué et annulé d'après la réponse du serveur, sans interrogation répétée", async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost.mockResolvedValueOnce(dto('FAILED'));
    const first = render(<ChargeCallPaymentStatusPage />);
    await flush();
    expect(screen.getByText('Le paiement a échoué')).toBeInTheDocument();
    first.unmount();

    setUrl(`?paiement=${CODE}`);
    mockPost.mockResolvedValueOnce(dto('CANCELED'));
    render(<ChargeCallPaymentStatusPage />);
    await flush();
    expect(screen.getByText('Paiement annulé')).toBeInTheDocument();

    await tick();
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it("arrête l'interrogation après environ deux minutes et invite à revenir plus tard", async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost.mockResolvedValue(dto('PENDING'));

    render(<ChargeCallPaymentStatusPage />);
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

  it("garde l'écran « en cours » sur un 429 ou une panne après un état obtenu, puis reprend plus tard", async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost
      .mockResolvedValueOnce(dto('PENDING'))
      .mockResolvedValueOnce({ status: 429, data: { success: false } })
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(dto('SUCCESS'));

    render(<ChargeCallPaymentStatusPage />);
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

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_POLL_RETRY_INTERVAL_MS);
    });
    expect(screen.getByText('Paiement reçu')).toBeInTheDocument();
  });

  it("garde le code dans sessionStorage, reprend après un rechargement et l'efface sur une réponse finale", async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost.mockResolvedValueOnce(dto('PENDING'));
    const first = render(<ChargeCallPaymentStatusPage />);
    await flush();
    expect(window.sessionStorage.getItem(STATUS_CODE_STORAGE_KEY)).toBe(CODE);
    expect(window.location.search).toBe('');
    first.unmount();

    // Rechargement : plus de query, le code revient du stockage ; l'URL ne prouve rien.
    setUrl('');
    mockPost.mockClear();
    mockPost.mockResolvedValueOnce(dto('PENDING')).mockResolvedValueOnce(dto('SUCCESS'));
    render(<ChargeCallPaymentStatusPage />);
    await flush();
    expect(mockPost.mock.calls[0][1]).toEqual({ codePaiement: CODE });
    expect(screen.getByText('Paiement en cours de vérification')).toBeInTheDocument();

    await tick();
    expect(screen.getByText('Paiement reçu')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(STATUS_CODE_STORAGE_KEY)).toBeNull();
  });

  it('fonctionne sans sessionStorage et renvoie vers le syndic en cas de délai dépassé', async () => {
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      setUrl(`?paiement=${CODE}`);
      mockPost.mockResolvedValue(dto('PENDING'));
      render(<ChargeCallPaymentStatusPage />);
      await flush();
      expect(screen.getByText('Paiement en cours de vérification')).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(STATUS_POLL_MAX_MS + STATUS_POLL_INTERVAL_MS);
      });
      expect(screen.getByText(/Contactez votre syndic/)).toBeInTheDocument();
    } finally {
      setSpy.mockRestore();
      getSpy.mockRestore();
    }
  });

  it('expose la zone de résultat comme région vivante polie, avec un indicateur nommé', async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost.mockResolvedValue(dto('PENDING'));
    render(<ChargeCallPaymentStatusPage />);
    await flush();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByLabelText('Paiement en cours de vérification')).toBeInTheDocument();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
  });

  it('arrête le minuteur au démontage', async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost.mockResolvedValue(dto('PENDING'));

    const { unmount } = render(<ChargeCallPaymentStatusPage />);
    await flush();
    expect(mockPost).toHaveBeenCalledTimes(1);
    unmount();
    await tick();
    await tick();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });

  it("affiche l'écran « lien invalide » sur 404 (dont un code du portail), et sans appel réseau si le code manque", async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost.mockResolvedValueOnce({ status: 404, data: { success: false } });
    const first = render(<ChargeCallPaymentStatusPage />);
    await flush();
    expect(screen.getByText(INVALID)).toBeInTheDocument();
    first.unmount();

    mockPost.mockClear();
    setUrl('?statut=SUCCESS');
    render(<ChargeCallPaymentStatusPage />);
    await flush();
    expect(screen.getByText(INVALID)).toBeInTheDocument();
    expect(screen.queryByText('Paiement reçu')).not.toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('affiche les états 429 et indisponible', async () => {
    setUrl(`?paiement=${CODE}`);
    mockPost.mockResolvedValueOnce({ status: 429, data: { success: false } });
    const first = render(<ChargeCallPaymentStatusPage />);
    await flush();
    expect(screen.getByText('Trop de tentatives, réessayez dans quelques minutes.')).toBeInTheDocument();
    first.unmount();

    setUrl(`?paiement=${CODE}`);
    mockPost.mockRejectedValueOnce(new Error('network'));
    render(<ChargeCallPaymentStatusPage />);
    await flush();
    expect(
      screen.getByText('Service momentanément indisponible, réessayez dans quelques minutes.')
    ).toBeInTheDocument();
  });
});
