import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropertyRemoteSelect } from '../../components/finance/PropertyRemoteSelect';

/**
 * Sélecteur de bien à recherche distante (écrans finance).
 *
 * Garanties : chaque frappe interroge le serveur (`q`, 20 résultats) après une
 * pause de 300 ms ; un bien déjà choisi mais absent des résultats est relu par
 * son identifiant pour afficher son nom ; les biens exclus ne sont pas proposés.
 * Le mock de `property-service` couvre les deux exports utilisés.
 */

const listProperties = vi.fn();
const getProperty = vi.fn();

vi.mock('../../services/property-service', () => ({
  listProperties: (...a: unknown[]) => listProperties(...a),
  getProperty: (...a: unknown[]) => getProperty(...a)
}));

function reponse(titres: Array<[string, string]>) {
  return {
    properties: titres.map(([id, title]) => ({ id, title })),
    pagination: { page: 1, limit: 20, total: titres.length, totalPages: 1 }
  };
}

function mount(props: Partial<React.ComponentProps<typeof PropertyRemoteSelect>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PropertyRemoteSelect tenantId="agence-1" id="bien" {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listProperties.mockResolvedValue(
    reponse([
      ['bien-1', 'Villa Cocody Angré'],
      ['bien-2', 'Studio Marcory']
    ])
  );
  getProperty.mockResolvedValue({ id: 'bien-9', title: 'Résidence Les Palmiers' });
});

describe('PropertyRemoteSelect', () => {
  it('interroge le serveur avec la frappe (q) et 20 résultats, après la pause de saisie', async () => {
    const user = userEvent.setup({ delay: null });
    mount();

    // Ouverture sans saisie : 20 premiers biens, sans `q`.
    await waitFor(() => expect(listProperties).toHaveBeenCalled(), { timeout: 8000 });
    expect(listProperties.mock.calls[0][0]).toBe('agence-1');
    expect(listProperties.mock.calls[0][1]).toEqual({ q: undefined, limit: 20 });

    await user.type(screen.getByRole('combobox'), 'Cocody');

    await waitFor(
      () => expect(listProperties).toHaveBeenCalledWith('agence-1', { q: 'Cocody', limit: 20 }, expect.anything()),
      { timeout: 8000 }
    );
    // Une seule requête pour le mot entier : la pause évite une requête par lettre.
    const appelsAvecQ = listProperties.mock.calls.filter(([, filtres]) => filtres?.q);
    expect(appelsAvecQ).toHaveLength(1);
  }, 20000);

  it('relit par son identifiant un bien choisi absent des résultats, et affiche son titre', async () => {
    mount({ value: 'bien-9' });

    expect(await screen.findByText('Résidence Les Palmiers', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(getProperty).toHaveBeenCalledWith('agence-1', 'bien-9');
  }, 20000);

  it('ne relit pas le bien choisi quand il figure déjà dans les résultats', async () => {
    mount({ value: 'bien-1' });

    expect(await screen.findByText('Villa Cocody Angré', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(getProperty).not.toHaveBeenCalled();
  }, 20000);

  it('ne propose pas les biens exclus', async () => {
    mount({ excludeIds: ['bien-2'] });

    await waitFor(() => expect(listProperties).toHaveBeenCalled(), { timeout: 8000 });
    fireEvent.mouseDown(screen.getByRole('combobox'));

    expect(await screen.findByTitle('Villa Cocody Angré', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByTitle('Studio Marcory')).not.toBeInTheDocument();
  }, 20000);
});
