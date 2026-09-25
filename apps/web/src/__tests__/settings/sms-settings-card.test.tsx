import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { SmsSettingsCard } from '../../components/settings/SmsSettingsCard';

/**
 * Carte « SMS » — Lot SMS-1, lecture seule côté agence.
 *
 * Le service est mocké en entier (`vi.mock`) : Vitest refuse tout import
 * qu'un `vi.mock` ne déclare pas explicitement.
 */

const getTenantSmsOverview = vi.fn();

vi.mock('../../services/sms-service', () => ({
  getTenantSmsOverview: (...a: unknown[]) => getTenantSmsOverview(...a)
}));

const OVERVIEW = {
  enabled: true,
  senderName: 'ImmoTopia',
  senderNameIsDefault: true,
  monthlyQuota: 200,
  monthlyQuotaIsDefault: true,
  usedThisMonth: 40,
  remainingThisMonth: 160,
  provider: 'orange' as const,
  platformConfigured: true
};

function mount() {
  return render(
    <AntApp>
      <SmsSettingsCard tenantId="tenant-1" />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Carte SMS — Lot SMS-1', () => {
  it('affiche le quota, les SMS utilisés et restants', async () => {
    getTenantSmsOverview.mockResolvedValue(OVERVIEW);

    mount();

    expect(await screen.findByText('40 sur 200 SMS utilisés ce mois-ci')).toBeTruthy();
    expect(screen.getByText('160 SMS restants')).toBeTruthy();
  });

  it("mentionne le nom de la plateforme quand aucun nom propre n'est configuré", async () => {
    getTenantSmsOverview.mockResolvedValue(OVERVIEW);

    mount();

    expect(await screen.findByText('ImmoTopia')).toBeTruthy();
    expect(screen.getByText('(nom de la plateforme)')).toBeTruthy();
  });

  it("avertit en mode test (fournisseur 'log') qu'aucun SMS n'est réellement envoyé", async () => {
    getTenantSmsOverview.mockResolvedValue({ ...OVERVIEW, provider: 'log' as const });

    mount();

    expect(await screen.findByText("Mode test : aucun SMS n'est réellement envoyé.")).toBeTruthy();
  });

  it("avertit quand le compte de la plateforme n'est pas configuré", async () => {
    getTenantSmsOverview.mockResolvedValue({ ...OVERVIEW, platformConfigured: false });

    mount();

    expect(await screen.findByText("Le compte SMS de la plateforme n'est pas configuré")).toBeTruthy();
  });

  it('affiche une erreur de chargement avec un bouton pour réessayer', async () => {
    getTenantSmsOverview.mockRejectedValue({ response: { data: { message: 'Panne réseau' } } });

    mount();

    expect(await screen.findByText('Panne réseau')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
  });
});
