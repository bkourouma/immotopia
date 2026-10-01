import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OwnerMonthlyReportPage } from '../../pages/public/OwnerMonthlyReportPage';
import apiClient from '../../utils/api-client';

/** Le mock se pose à la frontière réseau ; le vrai service tourne par-dessus. */
vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
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

  it('shows the invalid screen without any network call when the token is missing', async () => {
    setHash('');
    render(<OwnerMonthlyReportPage />);
    await waitFor(() => expect(screen.getByText(INVALID)).toBeInTheDocument());
    expect(mockPost).not.toHaveBeenCalled();
  });
});
