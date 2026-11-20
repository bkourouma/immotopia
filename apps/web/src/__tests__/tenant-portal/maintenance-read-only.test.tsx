import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import TenantMaintenance from '../../pages/TenantPortal/Maintenance';

/** Portail locataire, bail terminé (H4) : bandeau d'information, aucune action d'écriture. */

const getMaintenanceTickets = vi.fn();
const getLeases = vi.fn();

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../services/tenantPortalService', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/tenantPortalService')>();
  return {
    tenantPortalService: {
      ...actual.tenantPortalService,
      getMaintenanceTickets: (...a: unknown[]) => getMaintenanceTickets(...a),
      getLeases: (...a: unknown[]) => getLeases(...a)
    }
  };
});

const T = { timeout: 8000 };

const lease = (status: string) => ({ id: 'l1', leaseNumber: 'BAIL-1', propertyAddress: '1 rue des Lilas', status });

function mount() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/maintenance']}>
        <Routes>
          <Route path="/tenant/maintenance" element={<TenantMaintenance />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getMaintenanceTickets.mockResolvedValue({
    data: {
      success: true,
      data: {
        tickets: [],
        summary: { total: 0, open: 0, inProgress: 0, resolved: 0 },
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }
      }
    }
  });
});

describe('Portail locataire — maintenance en lecture seule', () => {
  it('bail terminé : bandeau affiché, « Nouvelle demande » absent', async () => {
    getLeases.mockResolvedValue({ data: { success: true, data: [lease('ENDED')] } });
    mount();
    expect(await screen.findByTestId('tenant-portal-read-only-banner', {}, T)).toHaveTextContent(
      'Votre bail n’est plus actif : le portail est en lecture seule. Vous pouvez consulter vos quittances'
    );
    expect(screen.queryByRole('button', { name: /Nouvelle demande/ })).not.toBeInTheDocument();
  });

  it('bail actif : pas de bandeau, « Nouvelle demande » présent', async () => {
    getLeases.mockResolvedValue({ data: { success: true, data: [lease('ACTIVE')] } });
    mount();
    expect(await screen.findByRole('button', { name: /Nouvelle demande/ }, T)).toBeInTheDocument();
    expect(screen.queryByTestId('tenant-portal-read-only-banner')).not.toBeInTheDocument();
  });
});
