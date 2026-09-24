import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { TenantEdit } from '../../pages/admin/TenantEdit';

/**
 * Lot G3 — édition d'agence (super-admin) : couleur de marque et logo.
 *
 * `services/tenant-service.ts` et `services/tenant-branding-service.ts` sont
 * mockés en entier : Vitest refuse tout import qu'un `vi.mock` ne déclare pas.
 */

const getTenant = vi.fn();

vi.mock('../../services/tenant-service', () => ({
  getTenant: (...a: unknown[]) => getTenant(...a)
}));

const updateTenantBrandingAdmin = vi.fn();
const uploadTenantLogo = vi.fn();

vi.mock('../../services/tenant-branding-service', () => ({
  updateTenantBrandingAdmin: (...a: unknown[]) => updateTenantBrandingAdmin(...a),
  uploadTenantLogo: (...a: unknown[]) => uploadTenantLogo(...a)
}));

const TENANT = {
  id: 'tenant-1',
  name: 'Agence Demo',
  slug: 'agence-demo',
  status: 'ACTIVE' as const,
  legalName: '',
  contactEmail: '',
  contactPhone: '',
  country: '',
  city: '',
  address: '',
  brandingPrimaryColor: '',
  subdomain: '',
  customDomain: '',
  website: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

function mount() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/admin/tenants/tenant-1/edit']}>
        <Routes>
          <Route path="/admin/tenants/:tenantId/edit" element={<TenantEdit />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getTenant.mockResolvedValue({ success: true, data: TENANT });
});

describe('TenantEdit — couleur de marque', () => {
  it('refuse une couleur qui n’est pas au format #RRGGBB', async () => {
    mount();

    const champCouleur = await screen.findByLabelText('Couleur de marque');
    fireEvent.change(champCouleur, { target: { value: 'rouge' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Couleur invalide (#RRGGBB)')).toBeInTheDocument();
    expect(updateTenantBrandingAdmin).not.toHaveBeenCalled();
  });

  it('accepte une couleur au format #RRGGBB et l’envoie à l’enregistrement', async () => {
    updateTenantBrandingAdmin.mockResolvedValue({ success: true, data: { ...TENANT, brandingPrimaryColor: '#1677FF' } });
    mount();

    const champNom = await screen.findByLabelText('Nom');
    fireEvent.change(champNom, { target: { value: 'Agence Demo' } });
    const champCouleur = screen.getByLabelText('Couleur de marque');
    fireEvent.change(champCouleur, { target: { value: '#1677FF' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(updateTenantBrandingAdmin).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ brandingPrimaryColor: '#1677FF' })
      )
    );
  });
});

describe('TenantEdit — logo', () => {
  it('téléverse le logo choisi vers la bonne route et affiche l’aperçu', async () => {
    uploadTenantLogo.mockResolvedValue({ success: true, data: { logoUrl: 'https://cdn.example.com/logo.png' } });
    const { container } = mount();

    await screen.findByLabelText('Nom');
    const inputFichier = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(inputFichier).toBeTruthy();

    const fichier = new File(['contenu'], 'logo.png', { type: 'image/png' });
    Object.defineProperty(inputFichier, 'files', { value: [fichier] });
    fireEvent.change(inputFichier);

    await waitFor(() => expect(uploadTenantLogo).toHaveBeenCalledWith('tenant-1', fichier));
    expect(await screen.findByAltText("Logo de l'agence")).toHaveAttribute('src', 'https://cdn.example.com/logo.png');
  });

  it('rejette un fichier trop volumineux sans appeler le service', async () => {
    const { container } = mount();

    await screen.findByLabelText('Nom');
    const inputFichier = container.querySelector('input[type="file"]') as HTMLInputElement;
    const troGros = new File([new Uint8Array(3 * 1024 * 1024)], 'logo.png', { type: 'image/png' });
    Object.defineProperty(inputFichier, 'files', { value: [troGros] });
    fireEvent.change(inputFichier);

    expect(await screen.findByText('Le logo ne doit pas dépasser 2 Mo')).toBeInTheDocument();
    expect(uploadTenantLogo).not.toHaveBeenCalled();
  });
});
