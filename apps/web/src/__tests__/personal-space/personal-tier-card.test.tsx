import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PersonalTierCard } from '../../components/personal-space/PersonalTierCard';

/**
 * Écran de montée de palier de l'espace personnel (lot 4D web) : palier,
 * usage, offre, téléphone obligatoire, paiement, reprise et erreurs.
 */

const getAssetUsage = vi.fn();
const getTenantIdentity = vi.fn();
const startPersonalUpgrade = vi.fn();
const updateTenantContactPhone = vi.fn();

vi.mock('../../services/personal-space-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/personal-space-service')>();
  return {
    ...actual,
    getAssetUsage: (...a: unknown[]) => getAssetUsage(...a),
    getTenantIdentity: (...a: unknown[]) => getTenantIdentity(...a),
    startPersonalUpgrade: (...a: unknown[]) => startPersonalUpgrade(...a),
    updateTenantContactPhone: (...a: unknown[]) => updateTenantContactPhone(...a)
  };
});

const UPGRADE = { target: 'PARTICULIER_PLUS', priceMonthly: 2900, currency: 'XOF', limit: 100 };
const FREE = { plan: 'FREE', limit: 10, used: 4, canAdd: true, upgrade: UPGRADE };

const assign = vi.fn();
const originalLocation = window.location;

function monter(url = '/tenant/espace-1/settings/abonnement') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <PersonalTierCard tenantId="espace-1" />
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getAssetUsage.mockResolvedValue(FREE);
  getTenantIdentity.mockResolvedValue({ type: 'PARTICULIER', contactPhone: '+2250712345678' });
  Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, assign } });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

describe('<PersonalTierCard>', () => {
  it('affiche le palier actuel, l’usage et l’offre marquée « tarif provisoire »', async () => {
    monter();
    expect(await screen.findByText('Palier gratuit')).toBeInTheDocument();
    expect(screen.getByText('4 sur 10')).toBeInTheDocument();
    expect(screen.getByText(/jusqu’à 100 actifs pour/)).toBeInTheDocument();
    expect(screen.getByText('Tarif provisoire')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Passer au palier payant' })).toBeInTheDocument();
  });

  it('n’affiche rien pour une agence', async () => {
    getAssetUsage.mockResolvedValue({ plan: 'AGENCY', limit: null, used: 3, canAdd: true, upgrade: null });
    monter();
    await waitFor(() => expect(getAssetUsage).toHaveBeenCalled());
    expect(screen.queryByTestId('personal-tier-card')).not.toBeInTheDocument();
  });

  it('palier payant : pas de bouton de montée', async () => {
    getAssetUsage.mockResolvedValue({ plan: 'PAID', limit: 100, used: 12, canAdd: true, upgrade: null });
    monter();
    expect(await screen.findByText('Palier payant')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Passer au palier payant' })).not.toBeInTheDocument();
  });

  it('démarre le paiement et redirige vers checkoutUrl quand le téléphone est connu', async () => {
    const user = userEvent.setup();
    startPersonalUpgrade.mockResolvedValue({ invoiceId: 'inv-1', checkoutUrl: 'https://pay.example/c/1', code: 'C1' });
    monter();
    await screen.findByText('Palier gratuit');
    await waitFor(() => expect(getTenantIdentity).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Passer au palier payant' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://pay.example/c/1'));
    expect(startPersonalUpgrade).toHaveBeenCalledWith('espace-1', 'PARTICULIER_PLUS');
    expect(updateTenantContactPhone).not.toHaveBeenCalled();
  });

  it('demande le téléphone avant de payer, l’enregistre, puis démarre le paiement', async () => {
    const user = userEvent.setup();
    getTenantIdentity.mockResolvedValue({ type: 'PARTICULIER', contactPhone: null });
    updateTenantContactPhone.mockResolvedValue(undefined);
    startPersonalUpgrade.mockResolvedValue({ invoiceId: 'inv-1', checkoutUrl: 'https://pay.example/c/2', code: 'C2' });
    monter();
    await screen.findByText('Palier gratuit');
    await waitFor(() => expect(getTenantIdentity).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Passer au palier payant' }));

    expect(await screen.findByText('Un numéro de téléphone est nécessaire avant de payer.')).toBeInTheDocument();
    expect(startPersonalUpgrade).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Téléphone'), '0712345678');
    await user.click(screen.getByRole('button', { name: 'Enregistrer et payer' }));
    expect(await screen.findByText(/format international attendu/)).toBeInTheDocument();
    expect(updateTenantContactPhone).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Téléphone'));
    await user.type(screen.getByLabelText('Téléphone'), '+225 07 12 34 56 78');
    await user.click(screen.getByRole('button', { name: 'Enregistrer et payer' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://pay.example/c/2'));
    expect(updateTenantContactPhone).toHaveBeenCalledWith('espace-1', '+2250712345678');
  });

  it('ouvre le champ téléphone quand le serveur répond PHONE_REQUIRED', async () => {
    const user = userEvent.setup();
    startPersonalUpgrade.mockRejectedValue({ response: { status: 422, data: { code: 'PHONE_REQUIRED' } } });
    monter();
    await screen.findByText('Palier gratuit');
    await waitFor(() => expect(getTenantIdentity).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Passer au palier payant' }));
    expect(await screen.findByLabelText('Téléphone')).toBeInTheDocument();
  });

  it('propose de reprendre un paiement déjà en cours (409 PAYMENT_IN_PROGRESS)', async () => {
    const user = userEvent.setup();
    startPersonalUpgrade.mockRejectedValue({
      response: {
        status: 409,
        data: { code: 'PAYMENT_IN_PROGRESS', data: { checkoutUrl: 'https://pay.example/reprise', invoiceId: 'inv-1' } }
      }
    });
    monter();
    await screen.findByText('Palier gratuit');
    await waitFor(() => expect(getTenantIdentity).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Passer au palier payant' }));
    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getAllByText('Un paiement est déjà en cours').length).toBeGreaterThan(0);
    await user.click(within(dialogue).getByRole('button', { name: 'Reprendre le paiement' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://pay.example/reprise'));
  });

  it('gère ALREADY_ON_TARGET en relisant l’usage', async () => {
    const user = userEvent.setup();
    startPersonalUpgrade.mockRejectedValue({ response: { status: 409, data: { code: 'ALREADY_ON_TARGET' } } });
    monter();
    await screen.findByText('Palier gratuit');
    await waitFor(() => expect(getTenantIdentity).toHaveBeenCalled());
    getAssetUsage.mockResolvedValue({ plan: 'PAID', limit: 100, used: 4, canAdd: true, upgrade: null });
    await user.click(screen.getByRole('button', { name: 'Passer au palier payant' }));
    expect(await screen.findByText('Votre espace est déjà sur le palier payant.')).toBeInTheDocument();
    expect(await screen.findByText('Palier payant')).toBeInTheDocument();
  });

  it('annonce que le paiement est indisponible sur 503', async () => {
    const user = userEvent.setup();
    startPersonalUpgrade.mockRejectedValue({ response: { status: 503, data: {} } });
    monter();
    await screen.findByText('Palier gratuit');
    await waitFor(() => expect(getTenantIdentity).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Passer au palier payant' }));
    expect(await screen.findByText(/paiement en ligne n’est pas disponible/)).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it('au retour de paiement, attend la confirmation serveur puis affiche le palier payant', async () => {
    monter('/tenant/espace-1/settings/abonnement?paiement=C1');
    expect(await screen.findByText('Confirmation du paiement en cours…')).toBeInTheDocument();
    getAssetUsage.mockResolvedValue({ plan: 'PAID', limit: 100, used: 4, canAdd: true, upgrade: null });
    expect(await screen.findByText('Palier payant', undefined, { timeout: 6000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Confirmation du paiement en cours…')).not.toBeInTheDocument());
  }, 10_000);
});
