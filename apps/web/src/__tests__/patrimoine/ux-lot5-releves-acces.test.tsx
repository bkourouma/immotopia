import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OwnerStatementDetailPage } from '../../pages/patrimoine/statements/OwnerStatementDetailPage';
import { ExternalAccessLinkReveal } from '../../pages/patrimoine/external-access/ExternalAccessLinkModals';

/**
 * UX lot 5 : page de détail d'un relevé (PageHeader, fil d'Ariane, erreur de chargement
 * avec « Réessayer ») et retour visuel de la copie d'un lien d'accès.
 */

const getOwnerStatementById = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } }) }));
vi.mock('../../services/patrimoine-service', () => ({
  getOwnerStatementById: (...a: unknown[]) => getOwnerStatementById(...a),
  recomputeOwnerStatement: vi.fn(),
  listOwnerStatementSecureLinks: vi.fn().mockResolvedValue([]),
  createOwnerStatementSecureLink: vi.fn(),
  revokeOwnerStatementSecureLink: vi.fn(),
  sendOwnerMonthlyReport: vi.fn()
}));

const RELEVE = {
  id: 'rel-1',
  ownerContactId: 'c1',
  owner: { id: 'c1', firstName: 'Awa', lastName: 'Koné', email: 'awa@example.com' },
  period: '2026-09',
  totalRevenue: 500000,
  totalExpenses: 0,
  netAmount: 450000,
  totalRentDue: 500000,
  totalArrears: 0,
  totalManagementFees: 50000,
  totalManagementFeesVat: 0,
  managementFeeRate: 10,
  vatRate: null,
  computationVersion: 3,
  status: 'SENT',
  sentAt: null,
  items: []
};

function renderDetail() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/agence-1/patrimoine/statements/rel-1']}>
        <Routes>
          <Route path="/tenant/:tenantId/patrimoine/statements/:id" element={<OwnerStatementDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('Détail d’un relevé', () => {
  it('pose le titre et un fil d’Ariane vers la liste', async () => {
    getOwnerStatementById.mockResolvedValue(RELEVE);
    renderDetail();
    expect(await screen.findByRole('heading', { level: 1, name: 'Détail du relevé' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Relevés de gérance' })).toHaveAttribute(
      'href',
      '/tenant/agence-1/patrimoine/statements'
    );
    await waitFor(() => expect(document.title).toContain('Détail du relevé'));
  });

  it('propose « Réessayer » quand le chargement échoue, puis affiche le relevé', async () => {
    getOwnerStatementById.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(RELEVE);
    const user = userEvent.setup({ delay: null });
    renderDetail();
    expect(await screen.findByText('Erreur de chargement du détail du relevé')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Loyers encaissés')).toBeInTheDocument();
    expect(getOwnerStatementById).toHaveBeenCalledTimes(2);
  });
});

describe('Lien d’accès fraîchement émis', () => {
  it('confirme visuellement la copie du lien', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup({ delay: null });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(
      <AntApp>
        <ExternalAccessLinkReveal
          onClose={vi.fn()}
          revealed={{
            recipientName: 'Maître Diallo',
            link: { url: 'https://app.test/acces#jeton', expiresAt: '2026-12-01T10:00:00.000Z' } as never,
            email: { sent: false, reason: 'NOT_REQUESTED' } as never
          }}
        />
      </AntApp>
    );
    await user.click(screen.getByRole('button', { name: /Copier le lien/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://app.test/acces#jeton'));
    expect(await screen.findByRole('button', { name: /Lien copié/ })).toBeInTheDocument();
  });
});
