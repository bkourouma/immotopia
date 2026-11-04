import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { CreateTicket } from '../../pages/tenant/maintenance/CreateTicket';

/**
 * Sélecteur de bien du formulaire de ticket : recherche distante (20 biens au
 * plus, après 300 ms d'inactivité) au lieu d'une liste de 100 biens chargée
 * d'avance ; le bien choisi garde son libellé.
 */

const listProperties = vi.fn();

vi.mock('../../services/property-service', () => ({
  listProperties: (...a: unknown[]) => listProperties(...a)
}));
vi.mock('../../services/maintenance-service', () => ({
  tenantMaintenanceService: { createTicket: vi.fn(), uploadAttachment: vi.fn() }
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'tenant-1' } })
}));

const villa = { id: 'p1', title: 'Villa Cocody', internalReference: 'REF-1', owner: { fullName: 'Awa Traoré' } };
const studio = { id: 'p2', title: 'Studio Plateau', internalReference: 'REF-2', owner: { fullName: 'Koffi Yao' } };

beforeEach(() => {
  vi.clearAllMocks();
  listProperties.mockImplementation(async (_tenant: string, filters: { q?: string }) => ({
    properties: filters.q ? [studio] : [villa],
    pagination: {}
  }));
});

function mount() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/tenant-1/maintenance/new']}>
        <Routes>
          <Route path="/tenant/:tenantId/maintenance/new" element={<CreateTicket />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

/** Libellé affiché dans le champ (et non dans la liste déroulante). */
const selectedLabel = () => document.querySelector('.ant-select-content')?.getAttribute('title');

describe('CreateTicket — sélecteur de bien', () => {
  it('charge 20 biens au plus, sans liste de 100', async () => {
    mount();
    await waitFor(() => expect(listProperties).toHaveBeenCalledTimes(1));
    expect(listProperties.mock.calls[0][1]).toEqual({ q: undefined, limit: 20 });
  });

  it('envoie la saisie à l’API après le délai, et garde le libellé du bien choisi', async () => {
    mount();
    await waitFor(() => expect(listProperties).toHaveBeenCalledTimes(1));

    const combobox = screen.getByRole('combobox', { name: /Propriété/ });
    fireEvent.mouseDown(combobox);
    fireEvent.click(await screen.findByText('Awa Traoré - Villa Cocody'));
    expect(selectedLabel()).toBe('Awa Traoré - Villa Cocody');

    fireEvent.change(combobox, { target: { value: 'studio' } });
    await waitFor(() => expect(listProperties).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(listProperties.mock.calls[1][1]).toEqual({ q: 'studio', limit: 20 });

    // Le bien choisi n'est plus dans les résultats mais reste affiché.
    expect(selectedLabel()).toBe('Awa Traoré - Villa Cocody');
  });
});
