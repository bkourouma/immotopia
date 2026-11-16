import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Vendors } from '../../pages/admin/maintenance/Vendors';

/**
 * Page Prestataires de la maintenance : la modale de création et d'édition,
 * retirée par erreur avec l'arrivée de la recherche multicritères, s'ouvre,
 * valide comme createVendorSchema et envoie le prestataire au service.
 */

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 't1' } })
}));

// Mock à la frontière réseau : le vrai vendorMaintenanceService tourne par-dessus.
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('../../utils/api-client', () => ({ default: api }));

const BASE = '/tenants/t1/maintenance/admin/vendors';

const T = { timeout: 8000 };

/** Saisie par collage : bien plus rapide que la frappe caractère par caractère sous jsdom. */
async function fill(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, value: string) {
  await user.click(field);
  await user.paste(value);
}

const VENDOR = {
  id: 'v1',
  name: 'Plomberie Express',
  phone: '0102030405',
  email: 'contact@plomberie.ci',
  address: 'Cocody',
  specialties: ['Plomberie'],
  isActive: true
};

function mount() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/t1/admin/maintenance/vendors']}>
        <Routes>
          <Route path="/tenant/:tenantId/admin/maintenance/vendors" element={<Vendors />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  api.get.mockReset().mockResolvedValue({
    data: { success: true, data: [VENDOR], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }
  });
  api.post.mockReset().mockResolvedValue({ data: { success: true, data: { id: 'v2' } } });
  api.patch.mockReset().mockResolvedValue({ data: { success: true, data: VENDOR } });
});

const listCalls = () => api.get.mock.calls.filter(([url]) => String(url).startsWith(`${BASE}?`));

describe('admin/maintenance/Vendors — modale prestataire', () => {
  it('ouvre la modale « Nouveau prestataire » et crée le prestataire', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Plomberie Express', undefined, T);

    await user.click(screen.getByRole('button', { name: /Nouveau prestataire/ }));
    const dialog = await screen.findByRole('dialog', undefined, T);

    await fill(user, within(dialog).getByLabelText('Nom'), '  Électricité Pro  ');
    await fill(user, within(dialog).getByLabelText('Téléphone'), '0707070707');
    await fill(user, within(dialog).getByLabelText('Email'), 'elec@pro.ci');
    await fill(user, within(dialog).getByLabelText('Adresse'), 'Plateau');
    await user.type(within(dialog).getByLabelText('Spécialités'), 'Électricité{enter}');
    // Le statut ne se règle qu'à l'édition.
    expect(within(dialog).queryByLabelText('Statut')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /Créer/ }));

    await vi.waitFor(() => expect(api.post).toHaveBeenCalledTimes(1), T);
    expect(api.post).toHaveBeenCalledWith(BASE, {
      name: 'Électricité Pro',
      phone: '0707070707',
      email: 'elec@pro.ci',
      address: 'Plateau',
      specialties: ['Électricité']
    });
    expect(await screen.findByText('Prestataire créé avec succès', undefined, T)).toBeInTheDocument();
    // La liste est rechargée après l'enregistrement.
    await vi.waitFor(() => expect(listCalls()).toHaveLength(2), T);
  }, 90000);

  it('refuse un nom trop court sans appeler le service', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Plomberie Express', undefined, T);

    await user.click(screen.getByRole('button', { name: /Nouveau prestataire/ }));
    const dialog = await screen.findByRole('dialog', undefined, T);
    await fill(user, within(dialog).getByLabelText('Nom'), ' A ');
    await user.click(within(dialog).getByRole('button', { name: /Créer/ }));

    expect(
      await within(dialog).findByText('Le nom doit contenir au moins 2 caractères', undefined, T)
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  }, 90000);

  it('pré-remplit la modale d’édition et enregistre les changements', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Plomberie Express', undefined, T);

    await user.click(screen.getByTitle('Modifier'));
    const dialog = await screen.findByRole('dialog', undefined, T);
    expect(within(dialog).getByText('Modifier le prestataire')).toBeInTheDocument();

    const nom = within(dialog).getByLabelText('Nom');
    expect(nom).toHaveValue('Plomberie Express');
    await user.clear(nom);
    await fill(user, nom, 'Plomberie Express CI');

    await user.click(within(dialog).getByRole('button', { name: /Enregistrer/ }));

    await vi.waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1), T);
    expect(api.patch).toHaveBeenCalledWith(`${BASE}/v1`, {
      name: 'Plomberie Express CI',
      phone: '0102030405',
      email: 'contact@plomberie.ci',
      address: 'Cocody',
      specialties: ['Plomberie'],
      isActive: true
    });
    expect(api.post).not.toHaveBeenCalled();
  }, 90000);
});
