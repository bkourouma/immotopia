import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AssetUsageBanner } from '../../components/patrimoine/AssetUsageBanner';

const getAssetUsage = vi.fn();

vi.mock('../../services/personal-space-service', () => ({
  ASSET_USAGE_QUERY_KEY: 'patrimoine-usage',
  getAssetUsage: (...a: unknown[]) => getAssetUsage(...a)
}));

const UPGRADE = { target: 'PARTICULIER_PLUS', priceMonthly: 2900, currency: 'XOF', limit: 100 };

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AssetUsageBanner tenantId="espace-1" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('<AssetUsageBanner>', () => {
  it('palier gratuit : affiche « X actifs sur 10 » et invite à passer au palier payant', async () => {
    getAssetUsage.mockResolvedValue({ plan: 'FREE', limit: 10, used: 7, canAdd: true, upgrade: UPGRADE });
    monter();
    expect(await screen.findByText('7 actifs sur 10')).toBeInTheDocument();
    const lien = screen.getByRole('link', { name: 'Passer au palier payant' });
    expect(lien).toHaveAttribute('href', '/tenant/espace-1/settings/abonnement');
    expect(screen.getByText(/tarif provisoire/)).toBeInTheDocument();
    expect(getAssetUsage).toHaveBeenCalledWith('espace-1');
  });

  it('palier gratuit plein : dit que la limite est atteinte', async () => {
    getAssetUsage.mockResolvedValue({ plan: 'FREE', limit: 10, used: 10, canAdd: false, upgrade: UPGRADE });
    monter();
    expect(await screen.findByText('10 actifs sur 10')).toBeInTheDocument();
    expect(screen.getByText(/limite du palier gratuit/)).toBeInTheDocument();
  });

  it('palier payant : une ligne discrète, sans invitation', async () => {
    getAssetUsage.mockResolvedValue({ plan: 'PAID', limit: 100, used: 12, canAdd: true, upgrade: null });
    monter();
    expect(await screen.findByText('12 actifs sur 100')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Passer au palier payant' })).not.toBeInTheDocument();
  });

  it('agence : aucun bandeau', async () => {
    getAssetUsage.mockResolvedValue({ plan: 'AGENCY', limit: null, used: 42, canAdd: true, upgrade: null });
    monter();
    await waitFor(() => expect(getAssetUsage).toHaveBeenCalled());
    expect(screen.queryByTestId('asset-usage-banner')).not.toBeInTheDocument();
  });

  it('erreur réseau : aucun bandeau et aucune erreur affichée', async () => {
    getAssetUsage.mockRejectedValue(new Error('boom'));
    monter();
    await waitFor(() => expect(getAssetUsage).toHaveBeenCalled());
    expect(screen.queryByTestId('asset-usage-banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
