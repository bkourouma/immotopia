import React from 'react';
import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RentalDeclaredPaymentSettingsDto } from '../../../types/rental-declared-payment';

const getRentalDeclaredSettings = vi.fn();
const updateRentalDeclaredSettings = vi.fn();
const useMyMenuAccess = vi.fn();

vi.mock('../../../services/rental-declared-payment-service', () => ({
  getRentalDeclaredSettings: (...a: unknown[]) => getRentalDeclaredSettings(...a),
  updateRentalDeclaredSettings: (...a: unknown[]) => updateRentalDeclaredSettings(...a)
}));

vi.mock('../../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: (...a: unknown[]) => useMyMenuAccess(...a)
}));

import { DeclaredSettingsCard } from '../../../components/rental/declared-payment/DeclaredSettingsCard';

const SETTINGS: RentalDeclaredPaymentSettingsDto = {
  enabled: true,
  proofRequired: false,
  aiPrefillEnabled: false,
  reviewAlertBusinessDays: 3,
  aiPrefillAvailable: true,
  aiReadsThisMonth: 12,
  aiReadsMonthlyQuota: 300,
  usable: true
};

const renderCard = () =>
  render(
    <App>
      <DeclaredSettingsCard tenantId="t1" />
    </App>
  );

beforeEach(() => {
  vi.clearAllMocks();
  getRentalDeclaredSettings.mockResolvedValue(SETTINGS);
  useMyMenuAccess.mockReturnValue({ permissions: null, ready: true });
});

describe('DeclaredSettingsCard (locatif)', () => {
  it('n’envoie que les champs modifiés', async () => {
    updateRentalDeclaredSettings.mockResolvedValue({ ...SETTINGS, proofRequired: true });
    renderCard();
    const proof = await screen.findByRole('switch', { name: 'Capture obligatoire' });
    const save = screen.getByRole('button', { name: 'Enregistrer' });
    expect(save).toBeDisabled();
    fireEvent.click(proof);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(updateRentalDeclaredSettings).toHaveBeenCalledWith('t1', { proofRequired: true }));
  });

  it('affiche la consommation IA quand la lecture est disponible', async () => {
    renderCard();
    expect(await screen.findByText('Lectures IA ce mois-ci : 12 sur 300')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Lecture IA de la capture' })).toBeEnabled();
  });

  it('désactive la lecture IA si elle est indisponible', async () => {
    getRentalDeclaredSettings.mockResolvedValue({ ...SETTINGS, aiPrefillAvailable: false });
    renderCard();
    const ai = await screen.findByRole('switch', { name: 'Lecture IA de la capture' });
    expect(ai).toBeDisabled();
    expect(screen.getByText('La lecture automatique n’est pas disponible sur ce serveur.')).toBeInTheDocument();
  });

  it('signale l’absence de numéro actif', async () => {
    getRentalDeclaredSettings.mockResolvedValue({ ...SETTINGS, usable: false });
    renderCard();
    expect(await screen.findByText(/Ajoutez un numéro de réception actif/)).toBeInTheDocument();
  });

  it('masque Enregistrer sans RENTAL_PAYMENTS_ALLOCATE', async () => {
    useMyMenuAccess.mockReturnValue({ permissions: new Set(['RENTAL_PAYMENTS_VIEW']), ready: true });
    renderCard();
    await screen.findByRole('switch', { name: 'Capture obligatoire' });
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Capture obligatoire' })).toBeDisabled();
  });
});
