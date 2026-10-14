import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RolesPermissions } from '../../pages/admin/RolesPermissions';
import { listMenuAccess, updateMenuAccess } from '../../services/role-menu-service';
import { listRoles, getRole, listPermissions } from '../../services/role-service';
import { listTenants } from '../../services/tenant-service';

/**
 * Admin › Rôles › Menus : défaut commun à toutes les agences et surcharge par
 * agence. Un rôle d'agence exige un choix ; un rôle de plateforme n'en a pas.
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

  async function choose(label: string) {
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByText(label));
  }

  it("rôle d'agence : aucun arbre, aucun compteur ni appel avant le choix", async () => {
    await mount();
    await pickRole('Administrateur tenant');

    expect(await screen.findByText('Choisissez une agence pour régler ses menus.')).toBeInTheDocument();
    expect(screen.getByText('Choisir une agence')).toBeInTheDocument();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.queryByText(/actifs/)).not.toBeInTheDocument();
    // Seul l'appel du rôle de plateforme, affiché au montage, a eu lieu.
    expect(mockListMenuAccess.mock.calls.every(c => c[0] === null)).toBe(true);
    expect(mockListMenuAccess).not.toHaveBeenCalledWith('tenant-1');
  });

  it('défaut choisi : alerte, appels sans tenantId, enregistrement sans tenantId', async () => {
    await mount();
    await pickRole('Administrateur tenant');
    await screen.findByText('Choisissez une agence pour régler ses menus.');
    mockListMenuAccess.mockClear();
    await choose('Toutes les agences (défaut)');

    expect(
      await screen.findByText("Ces réglages s'appliquent à toutes les agences qui n'ont pas leur propre réglage.")
    ).toBeInTheDocument();
    await waitFor(() => expect(mockListMenuAccess).toHaveBeenCalledWith(null));
    expect(mockListMenuAccess).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Hérite du défaut')).not.toBeInTheDocument();

    const switches = await screen.findAllByRole('switch');
    fireEvent.click(switches[0]);
    const save = screen.getByRole('button', { name: /Enregistrer/ });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(mockUpdateMenuAccess).toHaveBeenCalledTimes(1));
    const [roleKey, , tenantId] = mockUpdateMenuAccess.mock.calls[0];
    expect(roleKey).toBe('TENANT_ADMIN');
    expect(tenantId).toBeNull();
  });

  it("agence sans surcharge : charge défaut et surcharges, hérite du défaut, enregistre pour l'agence", async () => {
    await mount();
    await pickRole('Administrateur tenant');
    await screen.findByText('Choisissez une agence pour régler ses menus.');
    await choose('Agence Alpha');

    await waitFor(() => expect(mockListMenuAccess).toHaveBeenCalledWith(null));
    await waitFor(() => expect(mockListMenuAccess).toHaveBeenCalledWith('tenant-1'));
    expect(await screen.findByText('Hérite du défaut')).toBeInTheDocument();
    expect(screen.getByText('Ces réglages remplacent le défaut pour cette agence seulement.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revenir au défaut/ })).not.toBeInTheDocument();

    const switches = await screen.findAllByRole('switch');
    fireEvent.click(switches[0]);
    const save = screen.getByRole('button', { name: /Enregistrer/ });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(mockUpdateMenuAccess).toHaveBeenCalledTimes(1));
    const [roleKey, , tenantId] = mockUpdateMenuAccess.mock.calls[0];
    expect(roleKey).toBe('TENANT_ADMIN');
    expect(tenantId).toBe('tenant-1');
  });

  it('agence avec surcharge : tag propre, « Revenir au défaut » envoie {} avec tenantId', async () => {
    mockListMenuAccess.mockImplementation(async (tenantId: string | null) =>
      tenantId === 'tenant-1' ? { TENANT_ADMIN: { 'some.menu': false } } : {}
    );
    await mount();
    await pickRole('Administrateur tenant');
    await screen.findByText('Choisissez une agence pour régler ses menus.');
    await choose('Agence Alpha');

    expect(await screen.findByText("Réglage propre à l'agence")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Revenir au défaut/ }));
    const confirmButtons = await screen.findAllByRole('button', { name: /Revenir au défaut/ });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(mockUpdateMenuAccess).toHaveBeenCalledWith('TENANT_ADMIN', {}, 'tenant-1'));
    // Rechargement après l'effacement.
    await waitFor(() => expect(mockListMenuAccess.mock.calls.filter(c => c[0] === 'tenant-1').length).toBe(2));
  });
});
