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
  getAllCommunes: vi.fn(async () => [{ communeId: 'c1', commune: 'Cocody', region: 'Abidjan' }])
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
    address: 'Angré',
    transactionModes: ['RENTAL'],
    currency: 'XOF',
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

describe('Liste des biens — filtres avancés', () => {
  /**
   * La rangée de filtres déroulait huit contrôles en permanence. Tout sauf la
   * recherche plein texte passe derrière un dépliant, et les six champs
   * numériques — surface, pièces, chambres, chacun en min et en max — se
   * réduisent à un curseur des chambres.
   *
   * Le dépliant rejouerait le défaut que `<FilterSheet>` corrige — un filtre
   * posé qu'on ne voit pas — s'il restait fermé sur une liste filtrée. Les deux
   * tests qui suivent tiennent ce point.
   */

  it('replie le groupe de filtres, et le déplie au clic', async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(listProperties).toHaveBeenCalled());

    const declencheur = screen.getByRole('button', { name: /Filtres avancés/ });
    expect(declencheur).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Type de bien')).not.toBeVisible();
    expect(screen.getByText('Commune')).not.toBeVisible();
    expect(screen.getByText('Prix (F CFA)')).not.toBeVisible();
    expect(screen.getByText('Chambres')).not.toBeVisible();

    await user.click(declencheur);

    expect(declencheur).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Type de bien')).toBeVisible();
    expect(screen.getByText('Chambres')).toBeVisible();
  });

  it('s’ouvre de lui-même sur une liste filtrée, et compte les filtres posés', async () => {
    mount('/tenant/tenant-1/properties?status=RENTED&minBedrooms=3&maxBedrooms=3');
    await waitFor(() => expect(listProperties).toHaveBeenCalled());

    // Le curseur compte pour un filtre, pas pour deux : il écrit bien deux
    // paramètres dans l'URL, mais c'est une seule question posée.
    const declencheur = screen.getByRole('button', { name: /Filtres avancés \(2\)/ });
    expect(declencheur).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Type de bien')).toBeVisible();
    expect(screen.getByText('3 chambres')).toBeVisible();
  });

  it('a retiré les filtres de surface et de pièces', async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(listProperties).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /Filtres avancés/ }));

    expect(screen.queryByText(/Surface m(in|ax)/)).toBeNull();
    expect(screen.queryByText(/Pièces/)).toBeNull();
    // Et les bornes ne sont plus deux champs à remplir au clavier.
    expect(screen.queryByText(/Chambres m(in|ax)/)).toBeNull();
  });

  it('nomme chacune des deux poignées du curseur', async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(listProperties).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /Filtres avancés/ }));

    expect(screen.getByRole('slider', { name: 'Nombre de chambres minimum' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Nombre de chambres maximum' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Prix minimum' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Prix maximum' })).toBeInTheDocument();
  });

  it('a remplace les deux champs de prix par une barre', async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(listProperties).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /Filtres avancés/ }));

    // Plus aucune zone de saisie numérique dans le panneau : `Input type=number`
    // porte le rôle `spinbutton`, la barre porte `slider`.
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    expect(screen.queryAllByRole('slider')).toHaveLength(4);
    expect(screen.getByText('Tous les prix')).toBeVisible();
  });

  it('lit les bornes de prix de l’URL, même hors paliers', async () => {
    // Une URL écrite à la main peut porter un montant qui ne tombe sur aucun
    // palier. La poignée se pose au plus près, mais le libellé doit annoncer
    // le montant qui filtre vraiment, pas le palier arrondi.
    mount('/tenant/tenant-1/properties?minPrice=175000');
    await waitFor(() => expect(listProperties).toHaveBeenCalled());

    expect(screen.getByText('à partir de 175 000')).toBeVisible();
    expect(listProperties.mock.calls.at(-1)?.[1]).toMatchObject({ minPrice: '175000' });
  });

  it('compte le prix et les chambres pour un filtre chacun', async () => {
    mount('/tenant/tenant-1/properties?minPrice=100000&maxPrice=500000&minBedrooms=2&maxBedrooms=4');
    await waitFor(() => expect(listProperties).toHaveBeenCalled());

    // Quatre paramètres dans l'URL, deux questions posées.
    expect(screen.getByRole('button', { name: /Filtres avancés \(2\)/ })).toBeInTheDocument();
    expect(screen.getByText('100 000 à 500 000')).toBeVisible();
    expect(screen.getByText('2 à 4 chambres')).toBeVisible();
  });
});
