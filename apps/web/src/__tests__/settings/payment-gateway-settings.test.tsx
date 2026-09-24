import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentGatewaySettingsCard } from '../../components/settings/PaymentGatewaySettingsCard';

/**
 * Carte « Paiement en ligne » — Lot 7 (contrat
 * `docs/finance/LOT-7-CONTRAT-PAIEMENT-EN-LIGNE.md` §3.1 et §5).
 *
 * Le service est mocké en entier (`vi.mock`) : chaque export utilisé par la
 * carte doit figurer ci-dessous, Vitest refusant tout import non déclaré.
 */

const getPaymentGatewaySettings = vi.fn();
const updatePaymentGatewaySettings = vi.fn();
const testPaymentGatewayConnection = vi.fn();

vi.mock('../../services/payment-gateway-service', () => ({
  getPaymentGatewaySettings: (...a: unknown[]) => getPaymentGatewaySettings(...a),
  updatePaymentGatewaySettings: (...a: unknown[]) => updatePaymentGatewaySettings(...a),
  testPaymentGatewayConnection: (...a: unknown[]) => testPaymentGatewayConnection(...a)
}));

const listTreasuryAccounts = vi.fn();
vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: (...a: unknown[]) => listTreasuryAccounts(...a)
}));

const SETTINGS_CONFIGUREES = {
  provider: 'PAYSECUREHUB' as const,
  mode: 'SIMULATOR' as const,
  isActive: false,
  merchantId: 'MARCHAND-1',
  apiKeyConfigured: true,
  apiKeyLast4: '1234',
  treasuryAccountId: null,
  treasuryAccountLabel: '5525 — PaySecureHub — compte de collecte',
  feesPaidBy: 'CLIENT' as const,
  callbackUrl: 'https://api.example.com/api/payment-gateway/paysecurehub/ipn',
  simulatorAvailable: true,
  encryptionAvailable: true,
  lastTest: null
};

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <PaymentGatewaySettingsCard tenantId="tenant-1" />
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listTreasuryAccounts.mockResolvedValue([]);
});

describe('Carte Paiement en ligne — Lot 7', () => {
  it("n'envoie pas la clé quand l'utilisateur ne l'a pas saisie", async () => {
    getPaymentGatewaySettings.mockResolvedValue(SETTINGS_CONFIGUREES);
    updatePaymentGatewaySettings.mockResolvedValue(SETTINGS_CONFIGUREES);

    mount();

    expect(await screen.findByPlaceholderText('•••• 1234')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updatePaymentGatewaySettings).toHaveBeenCalled());
    const [, payload] = updatePaymentGatewaySettings.mock.calls[0];
    expect(payload).not.toHaveProperty('apiKey');
  });

  it('envoie la nouvelle clé après « Remplacer la clé »', async () => {
    getPaymentGatewaySettings.mockResolvedValue(SETTINGS_CONFIGUREES);
    updatePaymentGatewaySettings.mockResolvedValue(SETTINGS_CONFIGUREES);

    mount();

    await screen.findByPlaceholderText('•••• 1234');
    fireEvent.click(screen.getByRole('button', { name: 'Remplacer la clé' }));

    const champCle = await screen.findByPlaceholderText('•••• 1234');
    fireEvent.change(champCle, { target: { value: 'nouvelle-cle-secrete' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updatePaymentGatewaySettings).toHaveBeenCalled());
    const [, payload] = updatePaymentGatewaySettings.mock.calls[0];
    expect(payload).toMatchObject({ apiKey: 'nouvelle-cle-secrete' });
  });

  it('affiche le résultat du test de connexion, avec le solde', async () => {
    getPaymentGatewaySettings.mockResolvedValue(SETTINGS_CONFIGUREES);
    testPaymentGatewayConnection.mockResolvedValue({
      ok: true,
      message: 'Connexion établie',
      balance: { amount: 10000, currency: 'FCFA', at: '2026-01-01T00:00:00.000Z' }
    });

    mount();

    await screen.findByPlaceholderText('•••• 1234');
    fireEvent.click(screen.getByRole('button', { name: 'Tester la connexion' }));

    expect(await screen.findByText('Connexion établie')).toBeTruthy();
    expect(await screen.findByText(/10\s000\sFCFA/)).toBeTruthy();
  });

  it('avertit quand la clé de chiffrement du serveur est absente', async () => {
    getPaymentGatewaySettings.mockResolvedValue({ ...SETTINGS_CONFIGUREES, encryptionAvailable: false });

    mount();

    expect(await screen.findByText("Aucune clé de chiffrement n'est configurée côté serveur")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remplacer la clé' })).toBeDisabled();
  });

  it('avertit quand le simulateur est indisponible et désactive ce choix', async () => {
    getPaymentGatewaySettings.mockResolvedValue({ ...SETTINGS_CONFIGUREES, simulatorAvailable: false });

    mount();

    expect(await screen.findByText("Le mode simulateur n'est pas disponible sur cet environnement")).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Simulateur' })).toBeDisabled();
  });
});
