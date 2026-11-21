import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InstallmentPaymentPage } from '../../pages/public/InstallmentPaymentPage';
import { PublicLinkProblem } from '../../pages/public/PublicLinkState';
import apiClient from '../../utils/api-client';

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));
vi.mock('../../utils/external-redirect', () => ({ redirectToExternalUrl: vi.fn() }));

const mockPost = (apiClient as unknown as { post: ReturnType<typeof vi.fn> }).post;

const payment = {
  agencyName: 'Agence Soleil',
  periodYear: 2026,
  periodMonth: 9,
  dueDate: '2026-09-05T00:00:00.000Z',
  amountDue: 125000,
  currency: 'FCFA',
  expiresAt: '2026-10-15T10:00:00.000Z',
  paymentMethods: ['WAVE'],
  simulated: false,
  paymentInProgress: false,
  reviewPending: false
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('PublicLinkProblem', () => {
  it('un lien invalide dit quoi faire ensuite et ne propose pas de « Réessayer »', () => {
    render(<PublicLinkProblem kind="invalid" onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Demandez-en un nouveau à votre agence ou à votre syndic/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });
});

describe('Page de paiement : panne passagère', () => {
  it('« Réessayer » relit le lien et affiche le paiement', async () => {
    window.history.replaceState(null, '', '/payer#jeton');
    mockPost.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
      status: 200,
      data: { success: true, data: payment }
    });
    render(<InstallmentPaymentPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('Agence Soleil')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledTimes(2);
    // Le même jeton est renvoyé : il a été gardé en mémoire après lecture du fragment.
    expect(mockPost.mock.calls[1][1]).toEqual({ token: 'jeton' });
    expect(screen.getByText('Vous serez redirigé vers la page sécurisée du service de paiement.')).toBeInTheDocument();
  });
});
