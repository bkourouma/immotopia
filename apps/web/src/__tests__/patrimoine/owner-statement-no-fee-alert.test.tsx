import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OwnerStatementDetailPage } from '../../pages/patrimoine/statements/OwnerStatementDetailPage';

/**
 * BUG-001 : l'alerte « Aucun honoraire déduit » n'a de sens que s'il y a eu des
 * encaissements ; un relevé sans encaissement n'a rien à déduire.
 */

const getOwnerStatementById = vi.hoisted(() => vi.fn());

vi.mock('../../services/patrimoine-service', () => ({
  getOwnerStatementById: (...a: unknown[]) => getOwnerStatementById(...a),
  recomputeOwnerStatement: vi.fn()
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ tenantMembership: { tenantId: 't1' } }) }));
vi.mock('../../components/patrimoine/OwnerStatementSecureLinks', () => ({ OwnerStatementSecureLinks: () => null }));

const ALERT = "Aucun honoraire déduit : le taux de l'agence n'était pas fixé au moment du calcul";

function statement(overrides: Record<string, unknown>) {
  return {
    id: 's1',
    period: '2026-09',
    status: 'DRAFT',
    computationVersion: 99,
    totalRevenue: 0,
    totalExpenses: 0,
    netAmount: 0,
    totalRentDue: 0,
    totalArrears: 0,
    totalManagementFees: 0,
    totalManagementFeesVat: 0,
    managementFeeRate: null,
    managementFeeBase: null,
    vatRate: null,
    propertyIds: [],
    items: [],
    sentAt: null,
    ...overrides
  };
}

function renderPage() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/t1/patrimoine/statements/s1']}>
        <Routes>
          <Route path="/tenant/:tenantId/patrimoine/statements/:id" element={<OwnerStatementDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

describe("OwnerStatementDetailPage : alerte d'honoraires", () => {
  beforeEach(() => getOwnerStatementById.mockReset());

  it('ne s’affiche pas pour un relevé sans encaissement', async () => {
    getOwnerStatementById.mockResolvedValue(statement({ totalRevenue: 0 }));
    renderPage();
    await waitFor(() => expect(getOwnerStatementById).toHaveBeenCalled());
    await screen.findByText('Période');
    expect(screen.queryByText(ALERT)).toBeNull();
  });

  it('s’affiche quand des loyers sont encaissés sans honoraire ni taux', async () => {
    getOwnerStatementById.mockResolvedValue(statement({ totalRevenue: 500000 }));
    renderPage();
    expect(await screen.findByText(ALERT)).toBeTruthy();
  });
});
