import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { OwnerPortalSettingsCard } from '../../components/settings/OwnerPortalSettingsCard';
import type { OwnerPortalSettings } from '../../services/tenant-owner-portal-settings-service';

/**
 * Carte « Portail propriétaire » (paramètres de l'agence, lot P5).
 *
 * Mock à la frontière réseau (`utils/api-client`) : le service réel tourne
 * par-dessus, pour que le corps envoyé au `PUT` soit celui réellement produit
 * par l'écran — modèle `__tests__/admin/tenant-create.test.tsx`.
 */

vi.mock('../../utils/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

import apiClient from '../../utils/api-client';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const put = apiClient.put as unknown as ReturnType<typeof vi.fn>;

function settings(overrides: Partial<OwnerPortalSettings> = {}): OwnerPortalSettings {
  return {
    patrimonyEnabled: true,
    patrimonyShowValuation: true,
    patrimonyShowYield: true,
    patrimonyShowLoans: true,
    patrimonyShowWorks: true,
    patrimonyShowDocuments: true,
    ...overrides
  };
}

function mount() {
  return render(
    <AntApp>
      <OwnerPortalSettingsCard tenantId="tenant-1" />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Portail propriétaire — carte de réglage', () => {
  it('bascule « Afficher la vue patrimoine » et envoie un PUT partiel', async () => {
    get.mockResolvedValue({ data: { success: true, data: settings() } });
    put.mockResolvedValue({ data: { success: true, data: settings({ patrimonyEnabled: false }) } });

    mount();

    const interrupteur = await screen.findByLabelText('Afficher la vue patrimoine', {}, { timeout: 8000 });
    await userEvent.click(interrupteur);

    expect(put).toHaveBeenCalledWith('/tenants/tenant-1/settings/owner-portal', { patrimonyEnabled: false });
  });

  it('passe en lecture seule sur un refus 403, sans perdre la valeur affichée', async () => {
    get.mockResolvedValue({ data: { success: true, data: settings() } });
    put.mockRejectedValue({ response: { status: 403, data: { message: 'Refusé' } } });

    mount();

    const interrupteur = await screen.findByLabelText('Afficher la vue patrimoine', {}, { timeout: 8000 });
    await userEvent.click(interrupteur);

    expect(await screen.findByText('Lecture seule', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(interrupteur).toHaveAttribute('aria-checked', 'true');
  });
});
