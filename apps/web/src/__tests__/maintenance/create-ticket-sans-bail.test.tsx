import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { CreateTicket } from '../../pages/tenant/maintenance/CreateTicket';

/**
 * BUG-2026-09-30-083 : la maintenance est du socle CORE. Le formulaire de
 * création liste tous les biens de l'agence et n'appelle aucune API de
 * gestion locative (pack sans RENTAL).
 */

const listProperties = vi.fn();
const listLeases = vi.fn();

vi.mock('../../services/property-service', () => ({
  listProperties: (...a: unknown[]) => listProperties(...a)
}));
vi.mock('../../services/rental-service', () => ({
  listLeases: (...a: unknown[]) => listLeases(...a)
}));
vi.mock('../../services/maintenance-service', () => ({
  tenantMaintenanceService: { createTicket: vi.fn(), uploadAttachment: vi.fn() }
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'tenant-1' } })
}));

beforeEach(() => {
  vi.clearAllMocks();
  listProperties.mockResolvedValue({ properties: [], pagination: {} });
});

describe('CreateTicket — agence sans gestion locative', () => {
  it('charge les biens sans filtre de location et sans appeler les baux', async () => {
    render(
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/tenant-1/maintenance/new']}>
          <Routes>
            <Route path="/tenant/:tenantId/maintenance/new" element={<CreateTicket />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    );

    await waitFor(() => expect(listProperties).toHaveBeenCalled());
    const filtres = listProperties.mock.calls[0][1] as Record<string, unknown>;
    expect(filtres.status).toBeUndefined();
    expect(listLeases).not.toHaveBeenCalled();
  });
});
