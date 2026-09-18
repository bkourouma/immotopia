import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { PropertyApartments } from '../../components/properties/PropertyApartments';
import type { Property } from '../../types/property-types';

/**
 * Appartements d'un immeuble — la liste qui débordait de sa carte.
 *
 * Le tableau alignait six colonnes sans largeur ni troncature, dans une carte
 * déjà rétrécie par la colonne de droite de la fiche : le titre d'un
 * appartement se repliait un mot par ligne et la colonne « Actions » sortait du
 * cadre. Sous 992 px, il n'y avait aucune stratégie du tout.
 *
 * Ce que ces tests tiennent : un tableau au-dessus de 992 px, des cartes en
 * dessous, et la même information dans les deux — rien ne disparaît en passant
 * au téléphone, c'est la forme qui change.
 */

const get = vi.fn();

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: (...a: unknown[]) => get(...a), post: vi.fn() }
}));

vi.mock('../../services/property-service', () => ({
  __esModule: true,
  uploadMedia: vi.fn()
}));

let estDesktop = true;
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    screens: {},
    active: estDesktop ? 'xl' : 'xs',
    isMobile: !estDesktop,
    isTablet: false,
    isDesktop: estDesktop
  })
}));

const IMMEUBLE = {
  id: 'imm-1',
  propertyType: 'IMMEUBLE',
  title: 'Immeuble R+3',
  address: 'Route d’Akandjé',
  currency: 'FCFA',
  ownershipType: 'TENANT',
  transactionModes: ['RENTAL']
} as unknown as Property;

function appartement(over: Record<string, unknown> = {}) {
  return {
    id: 'apt-1',
    propertyType: 'APPARTEMENT',
    title: 'Appartement A1 - 3 pièces, rez-de-chaussée - Immeuble Bingerville',
    surfaceArea: 78,
    rooms: 3,
    price: 150_000,
    currency: 'FCFA',
    status: 'AVAILABLE',
    ...over
  } as unknown as Property;
}

const Temoin: React.FC = () => {
  const location = useLocation();
  return <div data-testid="url">{location.pathname}</div>;
};

function monter(appartements: Property[] = [appartement()]) {
  get.mockResolvedValue({ data: { success: true, data: appartements } });

  return render(
    <AntApp>
      {/* Le composant est monté sur une route à lui : la fiche d'un
          appartement est alors une AUTRE route, et le témoin peut dire où le
          clic a mené. Monté sur la route de la fiche, le composant se serait
          simplement re-rendu et le test aurait cru que rien ne s'était passé. */}
      <MemoryRouter initialEntries={['/immeuble']}>
        <Routes>
          <Route
            path="/immeuble"
            element={<PropertyApartments propertyId="imm-1" tenantId="agence-1" property={IMMEUBLE} />}
          />
          <Route path="*" element={<Temoin />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  estDesktop = true;
  get.mockReset();
});

describe('Appartements — au-dessus de 992 px', () => {
  it('rend un tableau aux colonnes nommées, sans défilement horizontal', async () => {
    monter();

    expect(await screen.findByRole('columnheader', { name: 'Appartement' })).toBeInTheDocument();
    // Surface et Pièces portent `responsive: ['xl']` : elles ne sont rendues
    // qu'au-dessus de 1200 px, et jsdom ne mesure aucun palier (`matchMedia`
    // est mocké à `matches: false` dans `setupTests`). Le test tient donc les
    // colonnes qui doivent être là à TOUTE largeur de tableau.
    for (const colonne of ['Prix', 'Statut', 'Actions']) {
      expect(screen.getByRole('columnheader', { name: colonne })).toBeInTheDocument();
    }

    // Le titre long tient dans sa cellule : il est tronqué par la colonne, pas
    // replié mot par mot.
    const titre = screen.getByText(/Appartement A1 - 3 pièces/);
    expect(titre).toHaveClass('ant-table-cell-ellipsis');
  });

  it('écrit un tiret pour ce qui manque, jamais un zéro', async () => {
    monter([appartement({ id: 'apt-2', surfaceArea: undefined, rooms: undefined, price: undefined })]);

    await screen.findByRole('columnheader', { name: 'Prix' });
    // Un prix absent s'écrit « — » et non « 0 FCFA » : un appartement sans
    // prix n'est pas un appartement gratuit.
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('Appartements — sous 992 px', () => {
  it('remplace le tableau par des cartes, sans rien perdre', async () => {
    estDesktop = false;
    monter();

    await screen.findByText(/Appartement A1 - 3 pièces/);
    // Plus aucune colonne : c'est une liste de cartes.
    expect(screen.queryAllByRole('columnheader')).toHaveLength(0);
    expect(screen.getByRole('list', { name: "Appartements de l'immeuble" })).toBeInTheDocument();
    // La surface, les pièces, le prix et le statut restent lisibles.
    expect(screen.getByText('78 m² · 3 pièces')).toBeInTheDocument();
    expect(screen.getByText(/150/)).toBeInTheDocument();
    expect(screen.getByText('Disponible')).toBeInTheDocument();
  });

  it('ouvre la fiche depuis la carte entière, pas depuis une icône', async () => {
    estDesktop = false;
    const utilisateur = userEvent.setup();
    monter();

    const carte = await screen.findByText(/Appartement A1 - 3 pièces/);
    await utilisateur.click(carte);

    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('/tenant/agence-1/properties/apt-1'));
  });
});

describe('Appartements — états', () => {
  it('invite à créer quand l’immeuble n’a encore aucun appartement', async () => {
    monter([]);

    expect(await screen.findByText('Cet immeuble ne contient encore aucun appartement.')).toBeInTheDocument();
  });
});
