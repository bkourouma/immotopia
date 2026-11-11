import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { OwnerMonthlyReportPage } from '../../pages/public/OwnerMonthlyReportPage';
import apiClient from '../../utils/api-client';

/** Le mock se pose à la frontière réseau ; le vrai service tourne par-dessus. */
vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

// La barre de recherche (plus de 5 biens) choisit sa mise en page selon la largeur : bureau.
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const mockPost = (apiClient as unknown as { post: ReturnType<typeof vi.fn> }).post;

const INVALID = 'Ce lien est invalide ou a expiré. Demandez un nouveau lien à votre agence.';

const UNAVAILABLE = 'Service momentanément indisponible, réessayez dans quelques minutes.';

const report = {
  agencyName: 'Agence Soleil',
  ownerName: 'Awa Konan',
  period: '2026-09',
  currency: 'FCFA',
  expiresAt: '2026-10-15T10:00:00.000Z',
  totals: {
    totalRentDue: 500000,
    totalRevenue: 450000,
    totalArrears: 50000,
    managementFees: 45000,
    managementFeesVat: 8100,
    totalExpenses: 20000,
    withholdingTax: 0,
    depositRetained: 0,
    netAmount: 376900
  },
  properties: [
    {
      reference: 'BIEN-001',
      title: 'Villa des Palmiers',
      lines: [
        { label: 'Loyer septembre', type: 'RENT_COLLECTED', amount: 450000 },
        { label: 'Ligne exotique', type: 'NEW_TYPE', amount: -1000 }
      ],
      subtotal: 449000
    }
  ]
};

function setHash(hash: string) {
  window.history.replaceState(null, '', `/rapport-proprietaire${hash}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('OwnerMonthlyReportPage', () => {
  it('reads the token from the fragment, clears it, and posts it in the body only', async () => {
    setHash('#jeton-abc');
    mockPost.mockResolvedValueOnce({ status: 200, data: { success: true, data: report } });

    render(<OwnerMonthlyReportPage />);

    expect(await screen.findByText('Agence Soleil')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('jeton-abc');
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body, config] = mockPost.mock.calls[0];
    expect(url).toBe('/public/secure-links/owner-monthly-report');
    expect(url).not.toContain('jeton-abc');
    expect(body).toEqual({ token: 'jeton-abc' });
    expect(config).toMatchObject({ withCredentials: false });
  });

  it('displays the report in read-only and never renders the token', async () => {
    setHash('#jeton-abc');
    mockPost.mockResolvedValueOnce({ status: 200, data: { success: true, data: report } });

    const { container } = render(<OwnerMonthlyReportPage />);

    expect(await screen.findByText(/Rapport mensuel —/)).toBeInTheDocument();
    expect(screen.getByText(/Awa Konan/)).toBeInTheDocument();
    expect(screen.getByText(/Villa des Palmiers/)).toBeInTheDocument();
    expect(screen.getByText('Loyer septembre')).toBeInTheDocument();
    // Type inconnu : repli sur le type brut.
    expect(screen.getByText('NEW_TYPE')).toBeInTheDocument();
    expect(screen.getByText('Sous-total')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimer / enregistrer en PDF' })).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('jeton-abc');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
    expect(document.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe('no-referrer');
  });

  it('removes the meta tags on unmount', async () => {
    setHash('#jeton-abc');
    mockPost.mockResolvedValueOnce({ status: 200, data: { success: true, data: report } });
    const { unmount } = render(<OwnerMonthlyReportPage />);
    await screen.findByText('Agence Soleil');
    unmount();
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
    expect(document.querySelector('meta[name="referrer"]')).toBeNull();
  });

  it('shows the single invalid screen on 404', async () => {
    setHash('#expire');
    mockPost.mockResolvedValueOnce({ status: 404, data: { success: false, message: 'Not found' } });
    render(<OwnerMonthlyReportPage />);
    expect(await screen.findByText(INVALID)).toBeInTheDocument();
  });

  it('shows the invalid screen on 400 too', async () => {
    setHash('#jeton');
    mockPost.mockResolvedValueOnce({ status: 400, data: { success: false } });
    render(<OwnerMonthlyReportPage />);
    expect(await screen.findByText(INVALID)).toBeInTheDocument();
  });

  it('shows a distinct unavailable state on a network error (not the invalid screen)', async () => {
    setHash('#jeton');
    mockPost.mockRejectedValueOnce(new Error('network'));
    render(<OwnerMonthlyReportPage />);
    expect(await screen.findByText(UNAVAILABLE)).toBeInTheDocument();
    expect(screen.queryByText(INVALID)).not.toBeInTheDocument();
  });

  it('shows the unavailable state on a 5xx response', async () => {
    setHash('#jeton');
    mockPost.mockResolvedValueOnce({ status: 503, data: { success: false } });
    render(<OwnerMonthlyReportPage />);
    expect(await screen.findByText(UNAVAILABLE)).toBeInTheDocument();
    expect(screen.queryByText(INVALID)).not.toBeInTheDocument();
  });

  it('shows withholding tax and retained deposit rows only when non-zero', async () => {
    setHash('#jeton');
    mockPost.mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: { ...report, totals: { ...report.totals, withholdingTax: 15000, depositRetained: 40000 } }
      }
    });
    render(<OwnerMonthlyReportPage />);
    expect(await screen.findByText('Retenue à la source')).toBeInTheDocument();
    expect(screen.getByText('Dépôt de garantie conservé')).toBeInTheDocument();
  });

  it('shows a dedicated message on 429', async () => {
    setHash('#jeton');
    mockPost.mockResolvedValueOnce({ status: 429, data: { success: false, message: 'Too many' } });
    render(<OwnerMonthlyReportPage />);
    expect(await screen.findByText('Trop de tentatives, réessayez dans quelques minutes.')).toBeInTheDocument();
  });

  it('sends a single request under React.StrictMode and still displays the report', async () => {
    setHash('#jeton-abc');
    mockPost.mockResolvedValue({ status: 200, data: { success: true, data: report } });
    render(
      <React.StrictMode>
        <OwnerMonthlyReportPage />
      </React.StrictMode>
    );
    expect(await screen.findByText('Agence Soleil')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('');
  });

  it('loads the new report on hashchange, clears the fragment and ignores a late answer of the old token', async () => {
    setHash('#ancien');
    let resolveOld: (value: unknown) => void = () => undefined;
    mockPost.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveOld = resolve;
        })
    );
    mockPost.mockResolvedValueOnce({
      status: 200,
      data: { success: true, data: { ...report, agencyName: 'Agence Nouvelle' } }
    });
    const { container } = render(<OwnerMonthlyReportPage />);
    expect(mockPost).toHaveBeenCalledTimes(1);

    act(() => {
      window.history.replaceState(null, '', '/rapport-proprietaire#nouveau');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByText('Agence Nouvelle')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost.mock.calls[1][1]).toEqual({ token: 'nouveau' });
    expect(window.location.hash).toBe('');

    // Réponse tardive de l'ancien jeton : ignorée.
    await act(async () => {
      resolveOld({ status: 200, data: { success: true, data: { ...report, agencyName: 'Agence Ancienne' } } });
    });
    expect(screen.queryByText('Agence Ancienne')).not.toBeInTheDocument();
    expect(screen.getByText('Agence Nouvelle')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('nouveau');
  });

  it('retries the same link after a transient failure (the failed request is not cached)', async () => {
    setHash('#jeton');
    mockPost.mockResolvedValueOnce({ status: 429, data: { success: false, message: 'Too many' } });
    mockPost.mockResolvedValueOnce({ status: 200, data: { success: true, data: report } });
    render(<OwnerMonthlyReportPage />);
    expect(await screen.findByText('Trop de tentatives, réessayez dans quelques minutes.')).toBeInTheDocument();

    act(() => {
      window.history.replaceState(null, '', '/rapport-proprietaire#jeton');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByText('Agence Soleil')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('does not request anything on a hashchange with an empty fragment, and removes the listener on unmount', async () => {
    setHash('#jeton');
    mockPost.mockResolvedValue({ status: 200, data: { success: true, data: report } });
    const { unmount } = render(<OwnerMonthlyReportPage />);
    await screen.findByText('Agence Soleil');
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(mockPost).toHaveBeenCalledTimes(1);
    unmount();
    window.history.replaceState(null, '', '/rapport-proprietaire#autre');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('shows the invalid screen without any network call when the token is missing', async () => {
    setHash('');
    render(<OwnerMonthlyReportPage />);
    await waitFor(() => expect(screen.getByText(INVALID)).toBeInTheDocument());
    expect(mockPost).not.toHaveBeenCalled();
  });
});

// Délai large : la suite complète tourne en parallèle et peut être lente.
const T = { timeout: 8000 };

/** n biens ; le 3e s'appelle « Villa des Palmiers », le 12e est à Bouaké. */
function reportWith(count: number) {
  return {
    ...report,
    properties: Array.from({ length: count }, (_, index) => {
      const n = index + 1;
      return {
        reference: `BIEN-${String(n).padStart(3, '0')}`,
        title: n === 3 ? 'Villa des Palmiers' : `Résidence ${n}`,
        lines: [{ label: `Loyer du bien ${n}`, type: 'RENT_COLLECTED', amount: 1000 * n }],
        subtotal: 1000 * n
      };
    })
  };
}

function renderWithRouter() {
  return render(
    <BrowserRouter>
      <OwnerMonthlyReportPage />
    </BrowserRouter>
  );
}

describe('OwnerMonthlyReportPage : recherche des biens', () => {
  it('garde le rendu inchangé à 5 biens ou moins : ni barre ni pagination', async () => {
    setHash('#jeton-abc');
    mockPost.mockResolvedValueOnce({ status: 200, data: { success: true, data: reportWith(5) } });
    renderWithRouter();
    await screen.findByText(/Rapport mensuel —/, undefined, T);
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    for (let n = 1; n <= 5; n += 1) {
      expect(screen.getByText(`Loyer du bien ${n}`)).toBeInTheDocument();
    }
  });

  it('au-delà de 5 biens : filtre localement, pagine par 10, sans nouvel appel ni jeton dans l’adresse', async () => {
    const user = userEvent.setup();
    setHash('#jeton-abc');
    mockPost.mockResolvedValue({ status: 200, data: { success: true, data: reportWith(12) } });
    const { container } = renderWithRouter();
    await screen.findByText(/Rapport mensuel —/, undefined, T);
    expect(screen.getByRole('search')).toBeInTheDocument();

    // Page 1 : dix biens ; les deux autres sont sur la page 2.
    expect(screen.getByText('Loyer du bien 10')).toBeInTheDocument();
    expect(screen.queryByText('Loyer du bien 11')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Page 2' }));
    expect(await screen.findByText('Loyer du bien 11', undefined, T)).toBeInTheDocument();
    expect(screen.getByText('Loyer du bien 12')).toBeInTheDocument();
    expect(screen.queryByText('Loyer du bien 1')).not.toBeInTheDocument();

    // Filtre sans accent ni casse sur la référence ou le titre.
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'PALMIERS');
    await vi.waitFor(() => expect(screen.queryByText('Loyer du bien 11')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Loyer du bien 3')).toBeInTheDocument();
    expect(screen.queryByText('Loyer du bien 4')).not.toBeInTheDocument();
    // Les totaux du serveur restent affichés tels quels, quel que soit le filtre.
    expect(screen.getByText('Net à reverser')).toBeInTheDocument();

    expect(window.location.search).toContain('q=PALMIERS');
    expect(window.location.href).not.toContain('jeton-abc');
    expect(container.innerHTML).not.toContain('jeton-abc');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('propose d’effacer les critères quand aucun bien ne correspond', async () => {
    const user = userEvent.setup();
    setHash('#jeton-abc');
    mockPost.mockResolvedValue({ status: 200, data: { success: true, data: reportWith(7) } });
    renderWithRouter();
    await screen.findByText(/Rapport mensuel —/, undefined, T);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('Loyer du bien 1', undefined, T)).toBeInTheDocument();
  });

  it('imprime tous les biens, sans pagination ni filtre, puis revient à l’affichage paginé', async () => {
    const user = userEvent.setup();
    setHash('#jeton-abc');
    mockPost.mockResolvedValue({ status: 200, data: { success: true, data: reportWith(12) } });
    let snapshot = '';
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      snapshot = document.body.textContent ?? '';
    });
    renderWithRouter();
    await screen.findByText(/Rapport mensuel —/, undefined, T);
    expect(screen.queryByText('Loyer du bien 12')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Imprimer / enregistrer en PDF' }));

    await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(1), T);
    for (let n = 1; n <= 12; n += 1) expect(snapshot).toContain(`Loyer du bien ${n}`);
    expect(mockPost).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    await vi.waitFor(() => expect(screen.queryByText('Loyer du bien 12')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Loyer du bien 1')).toBeInTheDocument();
  });
});

describe('OwnerMonthlyReportPage : impression sans coupure', () => {
  /** 12 biens, dont un avec 30 lignes : rien ne doit être coupé à l'impression. */
  function longReport() {
    const base = reportWith(12);
    base.properties[0] = {
      ...base.properties[0],
      lines: Array.from({ length: 30 }, (_, index) => ({
        label: `Ligne longue ${index + 1}`,
        type: 'RENT_COLLECTED',
        amount: 100 + index
      }))
    };
    return base;
  }

  it('imprime toutes les cartes et toutes les lignes avant window.print', async () => {
    const user = userEvent.setup();
    setHash('#jeton-abc');
    mockPost.mockResolvedValue({ status: 200, data: { success: true, data: longReport() } });
    let snapshot = '';
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      snapshot = document.body.textContent ?? '';
    });
    renderWithRouter();
    await screen.findByText(/Rapport mensuel —/, undefined, T);

    await user.click(screen.getByRole('button', { name: 'Imprimer / enregistrer en PDF' }));

    await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(1), T);
    for (let n = 1; n <= 30; n += 1) expect(snapshot).toContain(`Ligne longue ${n}`);
    for (let n = 2; n <= 12; n += 1) expect(snapshot).toContain(`Loyer du bien ${n}`);
    expect(document.body.querySelectorAll('.ant-pagination').length).toBe(0);
  });

  it('Ctrl+P (beforeprint) passe en impression complète, afterprint rend page et filtre', async () => {
    const user = userEvent.setup();
    setHash('#jeton-abc');
    mockPost.mockResolvedValue({ status: 200, data: { success: true, data: reportWith(12) } });
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderWithRouter();
    await screen.findByText(/Rapport mensuel —/, undefined, T);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'PALMIERS');
    await vi.waitFor(() => expect(screen.queryByText('Loyer du bien 4')).not.toBeInTheDocument(), T);

    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    for (let n = 1; n <= 12; n += 1) expect(document.body.textContent).toContain(`Loyer du bien ${n}`);
    expect(print).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    await vi.waitFor(() => expect(screen.queryByText('Loyer du bien 4')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Loyer du bien 3')).toBeInTheDocument();
    expect(within(screen.getByRole('search')).getByRole('textbox')).toHaveValue('PALMIERS');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('retire les écouteurs d’impression au démontage', async () => {
    setHash('#jeton-abc');
    mockPost.mockResolvedValue({ status: 200, data: { success: true, data: reportWith(3) } });
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderWithRouter();
    await screen.findByText(/Rapport mensuel —/, undefined, T);
    unmount();
    const removed = remove.mock.calls.map(call => call[0]);
    expect(removed).toContain('beforeprint');
    expect(removed).toContain('afterprint');
  });

  /** matchMedia factice : capture l'écouteur « change » de la requête print (absent de jsdom). */
  function mockPrintMedia() {
    const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    let listener: ((event: { matches: boolean }) => void) | null = null;
    const removeEventListener = vi.fn((_type: string, cb: unknown) => {
      if (cb === listener) listener = null;
    });
    const list = {
      matches: false,
      media: 'print',
      addEventListener: vi.fn((_type: string, cb: (event: { matches: boolean }) => void) => {
        listener = cb;
      }),
      removeEventListener
    };
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn((query: string) =>
        query === 'print'
          ? list
          : {
              matches: false,
              media: query,
              addListener: vi.fn(),
              removeListener: vi.fn(),
              addEventListener: vi.fn(),
              removeEventListener: vi.fn()
            }
      )
    });
    return {
      fire: (matches: boolean) => listener?.({ matches }),
      hasListener: () => listener !== null,
      removeEventListener,
      restore: () => {
        if (original) Object.defineProperty(window, 'matchMedia', original);
        else delete (window as unknown as { matchMedia?: unknown }).matchMedia;
      }
    };
  }

  it('matchMedia(print) : sortie du mode impression sans afterprint (Safari), écouteur retiré au démontage', async () => {
    const media = mockPrintMedia();
    try {
      setHash('#jeton-abc');
      mockPost.mockResolvedValue({ status: 200, data: { success: true, data: reportWith(12) } });
      const { unmount } = renderWithRouter();
      await screen.findByText(/Rapport mensuel —/, undefined, T);
      expect(media.hasListener()).toBe(true);

      act(() => {
        window.dispatchEvent(new Event('beforeprint'));
      });
      expect(screen.queryByRole('search')).not.toBeInTheDocument();

      act(() => {
        media.fire(false);
      });
      expect(await screen.findByRole('search', undefined, T)).toBeInTheDocument();
      expect(document.body.querySelectorAll('.ant-pagination').length).toBeGreaterThan(0);

      unmount();
      expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
      expect(media.hasListener()).toBe(false);
    } finally {
      media.restore();
    }
  });
});
