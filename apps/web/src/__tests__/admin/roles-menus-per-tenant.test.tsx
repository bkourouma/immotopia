import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RolesPermissions } from '../../pages/admin/RolesPermissions';
import { listMenuAccess, updateMenuAccess } from '../../services/role-menu-service';
import { listRoles, getRole, listPermissions } from '../../services/role-service';
import { listTenants } from '../../services/tenant-service';

/**
 * Admin › Rôles › Menus : les coupures se règlent par agence. Un rôle
 * d'agence exige une agence choisie ; un rôle de plateforme n'en a pas.
 */

vi.mock('../../services/role-menu-service', () => ({
  listMenuAccess: vi.fn(),
  updateMenuAccess: vi.fn(),
  getMyDisabledMenus: vi.fn()
}));
vi.mock('../../services/role-service', () => ({
  listRoles: vi.fn(),
  getRole: vi.fn(),
  listPermissions: vi.fn(),
  updateRolePermissions: vi.fn()
}));
vi.mock('../../services/tenant-service', () => ({
  listTenants: vi.fn()
}));

const mockListMenuAccess = listMenuAccess as unknown as ReturnType<typeof vi.fn>;
const mockUpdateMenuAccess = updateMenuAccess as unknown as ReturnType<typeof vi.fn>;

const PLATFORM_ROLE = { id: 'r-1', key: 'PLATFORM_SUPER_ADMIN', name: 'Super admin', scope: 'PLATFORM' };
const TENANT_ROLE = { id: 'r-2', key: 'TENANT_ADMIN', name: 'Admin agence', scope: 'TENANT' };

async function mount() {
  render(<RolesPermissions />);
  await screen.findByText('Rôles');
}

async function pickRole(name: string) {
  const items = await screen.findAllByText(name);
  fireEvent.click(items[0]);
}

describe('RolesPermissions — menus par agence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listRoles as any).mockResolvedValue([PLATFORM_ROLE, TENANT_ROLE]);
    (listPermissions as any).mockResolvedValue([]);
    (getRole as any).mockImplementation(async (id: string) => ({
      ...(id === 'r-1' ? PLATFORM_ROLE : TENANT_ROLE),
      permissions: []
    }));
    (listTenants as any).mockResolvedValue({
      success: true,
      data: {
        tenants: [
          { id: 'tenant-1', name: 'Agence Alpha' },
          { id: 'tenant-2', name: 'Agence Beta' }
        ],
        pagination: { page: 1, limit: 50, total: 2, totalPages: 1 }
      }
    });
    mockListMenuAccess.mockResolvedValue({});
    mockUpdateMenuAccess.mockResolvedValue({});
  });

  it('rôle de plateforme : pas de sélecteur, appel sans tenantId', async () => {
    await mount();

    await waitFor(() => expect(mockListMenuAccess).toHaveBeenCalledWith(null));
    expect(screen.queryByText('Choisir une agence')).not.toBeInTheDocument();
    expect(screen.queryByText('Choisissez une agence pour régler ses menus.')).not.toBeInTheDocument();
    expect(screen.getByText("Ces réglages s'appliquent à la plateforme.")).toBeInTheDocument();
  });

  it("rôle d'agence : sélecteur visible et aucun arbre avant le choix", async () => {
    await mount();
    await pickRole('Administrateur tenant');

    expect(await screen.findByText('Choisissez une agence pour régler ses menus.')).toBeInTheDocument();
    expect(screen.getByText("Ces réglages ne s'appliquent qu'à l'agence choisie.")).toBeInTheDocument();
    expect(screen.getByText('Choisir une agence')).toBeInTheDocument();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    // Aucune carte d'agence chargée tant qu'aucune agence n'est choisie.
    expect(mockListMenuAccess).not.toHaveBeenCalledWith('tenant-1');
  });

  it("charge et enregistre avec l'agence choisie", async () => {
    await mount();
    await pickRole('Administrateur tenant');
    await screen.findByText('Choisissez une agence pour régler ses menus.');

    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);
    fireEvent.click(await screen.findByText('Agence Alpha'));

    await waitFor(() => expect(mockListMenuAccess).toHaveBeenCalledWith('tenant-1'));
    const switches = await screen.findAllByRole('switch');
    expect(switches.length).toBeGreaterThan(0);

    fireEvent.click(switches[0]);
    const save = screen.getByRole('button', { name: /Enregistrer/ });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(mockUpdateMenuAccess).toHaveBeenCalledTimes(1));
    const [roleKey, , tenantId] = mockUpdateMenuAccess.mock.calls[0];
    expect(roleKey).toBe('TENANT_ADMIN');
    expect(tenantId).toBe('tenant-1');
  });
});
