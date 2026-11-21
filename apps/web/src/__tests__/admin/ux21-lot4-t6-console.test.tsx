import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminCollaboratorDetail } from '../../pages/admin/AdminCollaboratorDetail';
import { Statistics } from '../../pages/admin/Statistics';
import { Vendors } from '../../pages/admin/maintenance/Vendors';

/**
 * Lot 4 UI/UX, tâche T6 (console d'administration) : mot de passe régénéré
 * masqué par défaut, état d'erreur avec « Réessayer », suppression d'un
 * prestataire confirmée en le nommant.
 */

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 't1' } })
}));

const membership = vi.hoisted(() => ({
  getMember: vi.fn(),
  updateMember: vi.fn(),
  resetMemberPassword: vi.fn(),
  revokeMemberSessions: vi.fn(),
  disableMember: vi.fn(),
  enableMember: vi.fn()
}));
vi.mock('../../services/membership-service', () => membership);

const apiClientGet = vi.hoisted(() => vi.fn());
vi.mock('../../utils/api-client', () => ({ default: { get: apiClientGet } }));

const getGlobalStatistics = vi.hoisted(() => vi.fn());
vi.mock('../../services/statistics-service', () => ({
  getGlobalStatistics: (...a: unknown[]) => getGlobalStatistics(...a),
  getTenantActivityStats: vi.fn()
}));

const vendors = vi.hoisted(() => ({
  listVendors: vi.fn(),
  getVendor: vi.fn(),
  createVendor: vi.fn(),
  updateVendor: vi.fn(),
  deleteVendor: vi.fn()
}));
vi.mock('../../services/maintenance-service', () => ({
  vendorMaintenanceService: vendors,
  managerMaintenanceService: {}
}));

const T = { timeout: 8000 };

describe('AdminCollaboratorDetail : mot de passe régénéré', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membership.getMember.mockResolvedValue({
      success: true,
      data: {
        id: 'm1',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
        invitedAt: null,
        roles: [],
        user: { id: 'u1', email: 'awa@agence.ci', fullName: 'Awa Koné', emailVerified: true, lastLoginAt: null }
      }
    });
    membership.resetMemberPassword.mockResolvedValue({ success: true, data: { newPassword: 'Secret-123' } });
    apiClientGet.mockResolvedValue({ data: { success: true, data: [] } });
  });

  it('masque le mot de passe, l’affiche à la demande et prévient qu’il ne reviendra pas', async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    render(
      <AntApp>
        <MemoryRouter initialEntries={['/admin/tenants/t1/collaborators/u1']}>
          <Routes>
            <Route path="/admin/tenants/:tenantId/collaborators/:userId" element={<AdminCollaboratorDetail />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    );

    await user.click(await screen.findByRole('button', { name: /Réinitialiser le mot de passe/ }, T));
    const confirmation = await screen.findByRole('dialog', undefined, T);
    expect(within(confirmation).getAllByText(/Réinitialiser le mot de passe de Awa Koné/).length).toBeGreaterThan(0);
    await user.click(within(confirmation).getByRole('button', { name: 'Réinitialiser' }));

    const champ = await screen.findByLabelText('Nouveau mot de passe', undefined, T);
    expect(champ).toHaveAttribute('type', 'password');
    expect(screen.getByText(/ne sera plus affiché/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Afficher' }));
    expect(champ).toHaveAttribute('type', 'text');
    expect(champ).toHaveValue('Secret-123');
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  }, 60000);
});

describe('Statistics : erreur de chargement', () => {
  it('propose « Réessayer » puis affiche les chiffres', async () => {
    const user = userEvent.setup();
    getGlobalStatistics.mockRejectedValueOnce(new Error('réseau')).mockResolvedValue({
      success: true,
      data: {
        totalTenants: 3,
        activeTenants: 2,
        suspendedTenants: 0,
        pendingTenants: 1,
        totalCollaborators: 5,
        activeCollaborators: 4,
        totalSubscriptions: 2,
        subscriptionsByPlan: {},
        subscriptionsByStatus: { TRIALING: 0, ACTIVE: 2, PAST_DUE: 0, CANCELED: 0, SUSPENDED: 0 },
        moduleActivations: {},
        recentActivity: { tenantsCreatedLast30Days: 0, lastLoginDate: null }
      }
    });
    render(<Statistics />);

    await user.click(await screen.findByRole('button', { name: 'Réessayer' }, T));
    expect((await screen.findAllByText('2 actifs', undefined, T)).length).toBeGreaterThan(0);
    expect(getGlobalStatistics).toHaveBeenCalledTimes(2);
  });
});

describe('Vendors : suppression confirmée', () => {
  it('nomme le prestataire avant de le supprimer définitivement', async () => {
    const user = userEvent.setup();
    vendors.listVendors.mockResolvedValue({
      success: true,
      data: [{ id: 'v1', name: 'Plomberie Express', isActive: true }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    });
    vendors.deleteVendor.mockResolvedValue({ success: true });
    render(
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/t1/admin/maintenance/vendors']}>
          <Routes>
            <Route path="/tenant/:tenantId/admin/maintenance/vendors" element={<Vendors />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    );

    await screen.findByText('Plomberie Express', undefined, T);
    await user.click(screen.getByRole('button', { name: 'Supprimer définitivement' }));
    const dialog = await screen.findByRole('dialog', undefined, T);
    expect(within(dialog).getAllByText(/Supprimer définitivement « Plomberie Express » \?/).length).toBeGreaterThan(0);
    expect(vendors.deleteVendor).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Oui, supprimer' }));
    await vi.waitFor(() => expect(vendors.deleteVendor).toHaveBeenCalledWith('t1', 'v1'), T);
  }, 60000);

  it('affiche une erreur avec « Réessayer » quand la liste ne charge pas', async () => {
    vendors.listVendors.mockRejectedValue(new Error('réseau'));
    render(
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/t1/admin/maintenance/vendors']}>
          <Routes>
            <Route path="/tenant/:tenantId/admin/maintenance/vendors" element={<Vendors />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    );
    expect(await screen.findByText('Erreur lors du chargement des prestataires', undefined, T)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  }, 60000);
});
