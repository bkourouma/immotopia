import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { TenantSmsPanel } from '../../components/admin/TenantSmsPanel';

/**
 * Onglet SMS de la fiche agence (super-admin) — Lot SMS-1.
 *
 * Le service est mocké en entier (`vi.mock`) : Vitest refuse tout import
 * qu'un `vi.mock` ne déclare pas explicitement.
 */

const getPlatformSmsStatus = vi.fn();
const testPlatformSmsConnection = vi.fn();
const getAdminTenantSms = vi.fn();
const updateAdminTenantSms = vi.fn();
const sendAdminTenantSmsTest = vi.fn();

vi.mock('../../services/sms-service', () => ({
  getPlatformSmsStatus: (...a: unknown[]) => getPlatformSmsStatus(...a),
  testPlatformSmsConnection: (...a: unknown[]) => testPlatformSmsConnection(...a),
  getAdminTenantSms: (...a: unknown[]) => getAdminTenantSms(...a),
  updateAdminTenantSms: (...a: unknown[]) => updateAdminTenantSms(...a),
  sendAdminTenantSmsTest: (...a: unknown[]) => sendAdminTenantSmsTest(...a)
}));

const PLATFORM = {
  provider: 'orange' as const,
  configured: true,
  senderAddress: 'tel:+2250102030405',
  platformSenderName: 'ImmoTopia',
  balance: {
    contracts: [{ country: 'CI', availableUnits: 500, expiresAt: '2026-12-31T00:00:00.000Z', status: 'ACTIVE' }]
  },
  error: null
};

const OVERVIEW = {
  enabled: true,
  senderName: 'AGENCEX',
  senderNameIsDefault: false,
  monthlyQuota: 300,
  monthlyQuotaIsDefault: false,
  usedThisMonth: 50,
  remainingThisMonth: 250,
  provider: 'orange' as const,
  platformConfigured: true
};

function mount() {
  return render(
    <AntApp>
      <TenantSmsPanel tenantId="tenant-1" />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getPlatformSmsStatus.mockResolvedValue(PLATFORM);
  getAdminTenantSms.mockResolvedValue(OVERVIEW);
});

describe('TenantSmsPanel — Lot SMS-1', () => {
  it('charge et affiche le compte de la plateforme et les réglages de l’agence', async () => {
    mount();

    expect(await screen.findByText('orange')).toBeTruthy();
    expect(screen.getByText('tel:+2250102030405')).toBeTruthy();
    expect(screen.getByDisplayValue('AGENCEX')).toBeTruthy();
    expect(screen.getByText('50 sur 300 SMS utilisés ce mois-ci')).toBeTruthy();
  });

  it("rejette un nom d'expéditeur invalide et n'enregistre rien", async () => {
    mount();

    const champ = await screen.findByDisplayValue('AGENCEX');
    fireEvent.change(champ, { target: { value: 'nom avec espace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(
      await screen.findByText("Le nom d'expéditeur contient 1 à 11 caractères alphanumériques, sans espace")
    ).toBeTruthy();
    expect(updateAdminTenantSms).not.toHaveBeenCalled();
  });

  it('envoie null pour le nom d’expéditeur et le quota quand les champs sont vidés', async () => {
    updateAdminTenantSms.mockResolvedValue({
      ...OVERVIEW,
      senderName: 'ImmoTopia',
      senderNameIsDefault: true,
      monthlyQuota: 200,
      monthlyQuotaIsDefault: true
    });
    mount();

    const champNom = await screen.findByDisplayValue('AGENCEX');
    fireEvent.change(champNom, { target: { value: '' } });

    const champQuota = screen.getByDisplayValue('300');
    fireEvent.change(champQuota, { target: { value: '' } });
    fireEvent.blur(champQuota);

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(updateAdminTenantSms).toHaveBeenCalledWith('tenant-1', {
        enabled: true,
        senderName: null,
        monthlyQuota: null
      })
    );
    expect(await screen.findByText('Réglages SMS enregistrés')).toBeTruthy();
  });

  it('teste la connexion au compte de la plateforme et affiche le résultat', async () => {
    testPlatformSmsConnection.mockResolvedValue({ ok: true, message: 'Connexion établie' });
    mount();

    await screen.findByText('orange');
    fireEvent.click(screen.getByRole('button', { name: 'Tester la connexion' }));

    expect(await screen.findByText('Connexion établie')).toBeTruthy();
  });

  it('envoie un SMS de test avec succès', async () => {
    sendAdminTenantSmsTest.mockResolvedValue({
      id: 'sms-1',
      to: '0102030405',
      body: 'Test',
      senderName: 'AGENCEX',
      status: 'SENT',
      provider: 'orange',
      providerMessageId: 'prov-1',
      errorMessage: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      sentAt: '2026-01-01T00:00:01.000Z'
    });
    mount();

    await screen.findByText('orange');
    fireEvent.change(screen.getByPlaceholderText('0102030405'), { target: { value: '0102030405' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    await waitFor(() =>
      expect(sendAdminTenantSmsTest).toHaveBeenCalledWith('tenant-1', { to: '0102030405', body: undefined })
    );
    expect(await screen.findByText('Envoyé')).toBeTruthy();
  });

  it("affiche l'échec d'un SMS de test renvoyé par l'API", async () => {
    sendAdminTenantSmsTest.mockResolvedValue({
      id: 'sms-2',
      to: '0102030405',
      body: 'Test',
      senderName: 'AGENCEX',
      status: 'FAILED',
      provider: 'orange',
      providerMessageId: null,
      errorMessage: 'Numéro injoignable',
      createdAt: '2026-01-01T00:00:00.000Z',
      sentAt: null
    });
    mount();

    await screen.findByText('orange');
    fireEvent.change(screen.getByPlaceholderText('0102030405'), { target: { value: '0102030405' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText('Échec')).toBeTruthy();
    expect(await screen.findByText('Numéro injoignable')).toBeTruthy();
  });

  it('affiche une erreur lisible quand le quota est épuisé (409)', async () => {
    sendAdminTenantSmsTest.mockRejectedValue({ response: { status: 409, data: { message: 'Quota mensuel épuisé' } } });
    mount();

    await screen.findByText('orange');
    fireEvent.change(screen.getByPlaceholderText('0102030405'), { target: { value: '0102030405' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText('Quota mensuel épuisé')).toBeTruthy();
  });

  it('affiche une erreur lisible quand le numéro est invalide (400)', async () => {
    sendAdminTenantSmsTest.mockRejectedValue({ response: { status: 400, data: { message: 'Numéro invalide' } } });
    mount();

    await screen.findByText('orange');
    fireEvent.change(screen.getByPlaceholderText('0102030405'), { target: { value: '0102030405' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText('Numéro invalide')).toBeTruthy();
  });
});
