import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VendorSelect } from '../../components/maintenance/VendorSelect';

/**
 * Corrections d'appels du §8.4 — ce qui se compte, pas ce qui se voit.
 *
 * Ces défauts n'ont aucune trace visible : l'écran affiche la bonne donnée. Ils
 * ne se constatent qu'en comptant les requêtes, et c'est ce que font ces tests.
 */

const get = vi.fn();
vi.mock('../../utils/api-client', () => ({ default: { get: (...a: unknown[]) => get(...a) } }));

function avecCache(ui: React.ReactNode, queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter>{ui}</MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({
    data: { success: true, data: [{ id: 'v1', name: 'Plomberie Kipé', specialties: ['Plomberie'] }] }
  });
});

describe('VendorSelect — référentiel mis en cache', () => {
  it('ne demande la liste qu’une fois pour deux composants montés ensemble', async () => {
    // La déduplication de React Query : deux `<VendorSelect>` dans le même
    // écran partagent la requête au lieu d'en lancer deux.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      avecCache(
        <>
          <VendorSelect tenantId="agence-1" />
          <VendorSelect tenantId="agence-1" />
        </>,
        queryClient
      )
    );

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('ne redemande pas la liste au remontage suivant', async () => {
    // Le défaut d'origine : la liste était rechargée a CHAQUE montage. Le
    // composant vit dans le détail d'un ticket — ouvrir cinq tickets à la
    // suite déclenchait cinq fois la même requête, pour un référentiel qui
    // change à l'échelle du mois.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const premier = render(avecCache(<VendorSelect tenantId="agence-1" />, queryClient));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    premier.unmount();

    render(avecCache(<VendorSelect tenantId="agence-1" />, queryClient));
    // Laisser le temps a une requete de partir, s'il devait y en avoir une.
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('sépare les agences : le cache de l’une ne sert pas à l’autre', async () => {
    // `tenantId` est dans la clé. Sans lui, changer d'agence servirait la liste
    // de prestataires de la précédente.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const premier = render(avecCache(<VendorSelect tenantId="agence-1" />, queryClient));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    premier.unmount();

    render(avecCache(<VendorSelect tenantId="agence-2" />, queryClient));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(get.mock.calls[1][0]).toContain('agence-2');
  });

  it('rend une liste vide plutôt que de casser quand l’API échoue', async () => {
    get.mockRejectedValue(new Error('réseau'));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(avecCache(<VendorSelect tenantId="agence-1" />, queryClient));

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.getByText('Sélectionner un prestataire')).toBeInTheDocument();
  });
});
