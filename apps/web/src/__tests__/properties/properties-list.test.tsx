import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { Properties } from '../../pages/properties/Properties';
import type { Property } from '../../types/property-types';

/**
 * Liste des biens — les garanties du §8.4, vérifiées sur l'écran refondu.
 *
 * Trois défauts étaient nommés par la spécification. Chacun a ici un test qui
 * échoue s'il revient :
 *
 * 1. Le filtrage se faisait dans le navigateur sur la page reçue. Le test
 *    vérifie que les filtres partent **au service**, donc à l'API.
 * 2. Une requête `/media` par carte affichée. Le test vérifie qu'une page de
 *    biens ne déclenche **qu'un seul appel**, celui de la liste.
 * 3. Le compteur venait du serveur pendant que la liste était filtrée en
 *    mémoire. Le test vérifie que le total affiché est celui de la pagination.
 */

const listProperties = vi.fn();
const deleteProperty = vi.fn();

vi.mock('../../services/property-service', () => ({
  listProperties: (...args: unknown[]) => listProperties(...args),
  deleteProperty: (...args: unknown[]) => deleteProperty(...args)
}));

vi.mock('../../services/geographic-service', () => ({
  getAllCommunes: vi.fn(async () => [{ communeId: 'c1', commune: 'Ratoma', region: 'Conakry' }])
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'tenant-1' }, user: { email: 'a@b.c' } })
}));

vi.mock('../../components/newsletter/PropertyNewsletterCampaignModal', () => ({
  PropertyNewsletterCampaignModal: () => null
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function bien(id: string, overrides: Partial<Property> = {}): Property {
  return {
    id,
    internalReference: `REF-${id}`,
    propertyType: 'APPARTEMENT',
    ownershipType: 'TENANT',
    title: `Bien ${id}`,
    description: '',
    address: 'Kipé',
    transactionModes: ['RENTAL'],
    currency: 'GNF',
    status: 'AVAILABLE',
    isPublished: false,
    availability: 'AVAILABLE',
    createdAt: '',
    updatedAt: '',
    ...overrides
  } as Property;
}

/** Rendu isolé : un cache neuf par test, sinon les clés se partagent. */
function mount(initialUrl = '/tenant/tenant-1/properties') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[initialUrl]}>
          <Routes>
            <Route path="/tenant/:tenantId/properties" element={<Properties />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  listProperties.mockReset();
  deleteProperty.mockReset();
  listProperties.mockResolvedValue({
    properties: [bien('1'), bien('2')],
    pagination: { page: 1, limit: 20, total: 57, totalPages: 3 }
  });
});

describe('Liste des biens — le filtrage part au serveur', () => {
  it('transmet les filtres de l’URL au service, sans rien filtrer en mémoire', async () => {
    mount('/tenant/tenant-1/properties?q=villa&status=RENTED&minPrice=100000&page=2');

    await waitFor(() => expect(listProperties).toHaveBeenCalled());
    const [tenantId, filters] = listProperties.mock.calls[0];

    expect(tenantId).toBe('tenant-1');
    expect(filters).toMatchObject({
      q: 'villa',
      status: 'RENTED',
      minPrice: '100000',
      page: 2,
      limit: 20
    });
  });

  it('affiche les biens rendus par l’API, sans en retirer aucun', async () => {
    // Le service renvoie deux biens qui ne correspondent PAS au filtre posé.
    // Un écran qui filtre encore en mémoire n'en afficherait aucun.
    mount('/tenant/tenant-1/properties?q=introuvable');

    expect(await screen.findByText('Bien 1')).toBeInTheDocument();
    expect(screen.getByText('Bien 2')).toBeInTheDocument();
  });

  it('affiche le total du serveur, et non le nombre de biens reçus', async () => {
    // 2 biens à l'écran, 57 au portefeuille. C'est la contradiction que le
    // §8.4 reproche à l'ancienne version.
    mount();
    expect(await screen.findByText('57 biens au portefeuille')).toBeInTheDocument();
  });

  it('repart au serveur quand un filtre change, et revient à la page 1', async () => {
    const user = userEvent.setup();
    mount('/tenant/tenant-1/properties?page=3');
    await waitFor(() => expect(listProperties).toHaveBeenCalled());

    await user.type(screen.getByLabelText('Rechercher un bien'), 'villa');

    await waitFor(
      () => {
        const dernier = listProperties.mock.calls.at(-1)?.[1];
        expect(dernier).toMatchObject({ q: 'villa', page: 1 });
      },
      { timeout: 2000 }
    );
  });
});

describe('Liste des biens — une seule requête par page', () => {
  it('ne déclenche aucun appel supplémentaire par carte affichée', async () => {
    // L'ancienne version lançait une requête `/media` par bien : jusqu'à vingt
    // pour une page. La vignette vient maintenant du endpoint de liste.
    mount();
    expect(await screen.findByText('Bien 1')).toBeInTheDocument();
    expect(listProperties).toHaveBeenCalledTimes(1);
  });

  it('utilise la vignette rendue par l’API', async () => {
    listProperties.mockResolvedValue({
      properties: [bien('1', { thumbnailUrl: '/uploads/photo.jpg' })],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    });
    mount();

    await screen.findByText('Bien 1');
    const image = document.querySelector('img');
    expect(image?.getAttribute('src')).toContain('/uploads/photo.jpg');
    // Image décorative : le titre du bien porte déjà l'information, et un
    // `alt` répétant le titre serait annoncé deux fois.
    expect(image?.getAttribute('alt')).toBe('');
  });
});

describe('Liste des biens — états', () => {
  it('distingue « aucun bien » de « aucun résultat »', async () => {
    listProperties.mockResolvedValue({
      properties: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
    });

    const { unmount } = mount();
    expect(await screen.findByText(/Aucun bien n'est encore enregistré/)).toBeInTheDocument();
    unmount();

    mount('/tenant/tenant-1/properties?status=SOLD');
    expect(await screen.findByText('Effacer les filtres')).toBeInTheDocument();
  });

  it('propose de réessayer quand le chargement échoue', async () => {
    listProperties.mockRejectedValue(new Error('boom'));
    mount();
    expect(await screen.findByText('Impossible de charger le portefeuille.')).toBeInTheDocument();
    expect(screen.getByText('Réessayer')).toBeInTheDocument();
  });
});
