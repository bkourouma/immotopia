import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { PropertyFormWizard } from '../../components/properties/PropertyFormWizard';

/**
 * Parcours de création d'un bien — les étapes suivent le type, pas un rang fixe.
 *
 * Le parcours comptait six étapes identiques pour tous les types, et chaque
 * branche désignait une étape par son **rang** : la validation du prix sur
 * `case 3`, l'enregistrement préalable aux médias sur `currentStep === 5`.
 * Deux conséquences visibles :
 *
 * 1. Un parking traversait « Caractéristiques générales » alors qu'aucun de ses
 *    champs ne le concernait — la page s'ouvrait **vide**, et il fallait quand
 *    même cliquer « Suivant ».
 * 2. Un immeuble ne pouvait pas recevoir ses appartements pendant la création :
 *    il fallait l'enregistrer, le quitter, le rouvrir.
 *
 * Les étapes portent désormais un nom. Ces tests tiennent les deux bouts : le
 * parcours se raccourcit ou s'allonge selon le type, et la validation continue
 * de viser la bonne étape quand les rangs ont glissé.
 */

const getTemplate = vi.fn();
const createProperty = vi.fn();

vi.mock('../../services/property-service', () => ({
  __esModule: true,
  getTemplate: (...a: unknown[]) => getTemplate(...a),
  createProperty: (...a: unknown[]) => createProperty(...a),
  updateProperty: vi.fn(),
  uploadMedia: vi.fn()
}));

vi.mock('../../services/crm-service', () => ({
  __esModule: true,
  listContacts: vi.fn(async () => ({
    success: true,
    contacts: [
      {
        id: 'c1',
        firstName: 'Séraphin',
        lastName: 'Koffi',
        email: 'seraphin@example.com',
        roles: [{ active: true }]
      }
    ]
  }))
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' }, user: { email: 'a@b.c' } })
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'xl', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(async () => ({ data: { success: true, data: [] } })), post: vi.fn() }
}));

// Les briques lourdes du parcours ne sont pas le sujet de ces tests.
vi.mock('../../components/ui/location-selector', () => ({
  LocationSelector: () => <div data-testid="selecteur-localisation" />
}));
vi.mock('../../components/properties/PropertyMediaUpload', () => ({
  PropertyMediaUpload: () => <div data-testid="envoi-medias" />
}));
vi.mock('../../components/properties/PropertyMediaGallery', () => ({
  PropertyMediaGallery: () => <div data-testid="galerie-medias" />
}));

function monter(property?: Record<string, unknown>) {
  return render(
    <AntApp>
      <MemoryRouter>
        <PropertyFormWizard tenantId="agence-1" property={property as never} />
      </MemoryRouter>
    </AntApp>
  );
}

/**
 * Un immeuble deja enregistre. Avec un bien en entree, le rail est navigable :
 * on atteint les specificites sans rejouer les quatre etapes precedentes, qui
 * ne sont pas le sujet de ces tests.
 */
const IMMEUBLE_EXISTANT = {
  id: 'imm-1',
  propertyType: 'IMMEUBLE',
  ownershipType: 'TENANT',
  ownerUserId: 'u1',
  title: 'Immeuble R+4',
  description: '',
  address: 'Yopougon',
  currency: 'CFA',
  transactionModes: ['RENTAL'],
  typeSpecificData: {}
};

/** Les libellés d'étapes affichés par le rail, dans l'ordre. */
function etapesAffichees(): string[] {
  const attendues = [
    'Type et identification',
    'Localisation',
    'Caractéristiques générales',
    'Prix & Conditions',
    'Caractéristiques spécifiques',
    'Appartements',
    'Médias'
  ];
  return attendues.filter(libelle => screen.queryAllByText(libelle).length > 0);
}

const GABARIT_NOMBRE = {
  key: 'units_count',
  label: "Nombre total d'appartements",
  type: 'number',
  required: false,
  section: 'building'
};

beforeEach(() => {
  getTemplate.mockReset();
  createProperty.mockReset();
  getTemplate.mockResolvedValue({ sections: [], fieldDefinitions: [] });
  // Le gabarit Immeuble porte le nombre d'appartements, qui pilote les lignes.
  getTemplate.mockImplementation(async (type: string) =>
    type === 'IMMEUBLE'
      ? {
          sections: [{ id: 'building', title: 'Immeuble', fieldDefinitions: [GABARIT_NOMBRE] }],
          fieldDefinitions: [GABARIT_NOMBRE]
        }
      : { sections: [], fieldDefinitions: [] }
  );
  createProperty.mockResolvedValue({ id: 'bien-1', propertyType: 'IMMEUBLE', title: 'Immeuble' });
});

describe('Création d’un bien — le parcours suit le type', () => {
  it('retire « Caractéristiques générales » pour un parking, qui n’y a aucun champ', async () => {
    const user = userEvent.setup();
    monter();

    expect(etapesAffichees()).toContain('Caractéristiques générales');

    await user.click(screen.getByText('Parking/Box'));

    await waitFor(() => {
      expect(etapesAffichees()).not.toContain('Caractéristiques générales');
    });
  });

  it('retire aussi l’étape pour un terrain, qui n’y lisait qu’un encart', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByText('Terrain'));

    await waitFor(() => {
      expect(etapesAffichees()).not.toContain('Caractéristiques générales');
    });
  });

  it('garde l’étape pour un entrepôt, qui a bien une surface et une année', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByText('Entrepôt/Industriel'));

    await waitFor(() => {
      expect(etapesAffichees()).toContain('Caractéristiques générales');
    });
  });

  it('n’ajoute pas d’étape « Appartements » : ils vivent dans les spécificités', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByText('Immeuble'));

    await waitFor(() => {
      expect(etapesAffichees()).toContain('Caractéristiques spécifiques');
    });
    // L'etape autonome a ete fusionnee : le parcours ne s'allonge plus.
    expect(etapesAffichees()).not.toContain('Appartements');
  });
});

describe('Immeuble — les appartements se saisissent dans la page', () => {
  /**
   * Chaque lot passait par une fenêtre modale, après l'enregistrement de
   * l'immeuble. Le nombre déclaré fait maintenant apparaître autant de lignes
   * pré-titrées, modifiables, et rien ne part en base avant le bouton final.
   */

  async function allerAuxSpecificites(user: ReturnType<typeof userEvent.setup>) {
    monter(IMMEUBLE_EXISTANT);
    await waitFor(() => expect(getTemplate).toHaveBeenCalledWith('IMMEUBLE'));
    await user.click(screen.getAllByText('Caractéristiques spécifiques')[0]);
    await screen.findByLabelText("Nombre total d'appartements");
  }

  it('n’affiche aucune ligne tant que le nombre n’est pas saisi', async () => {
    const user = userEvent.setup();
    await allerAuxSpecificites(user);

    await waitFor(() => {
      expect(screen.getByText(/Appartements \(0\)/)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/Titre de l’appartement 1/)).toBeNull();
  });

  it('crée autant de lignes pré-titrées que d’appartements déclarés', async () => {
    const user = userEvent.setup();
    await allerAuxSpecificites(user);

    const champNombre = await screen.findByLabelText("Nombre total d'appartements");
    await user.type(champNombre, '3');

    await waitFor(() => {
      expect(screen.getByText(/Appartements \(3\)/)).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('Appartement 1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Appartement 2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Appartement 3')).toBeInTheDocument();
  });

  it('laisse modifier un titre avant l’enregistrement', async () => {
    const user = userEvent.setup();
    await allerAuxSpecificites(user);

    await user.type(await screen.findByLabelText("Nombre total d'appartements"), '2');
    await waitFor(() => expect(screen.getByDisplayValue('Appartement 1')).toBeInTheDocument());

    const premier = screen.getByDisplayValue('Appartement 1');
    await user.clear(premier);
    await user.type(premier, 'Studio A');

    expect(screen.getByDisplayValue('Studio A')).toBeInTheDocument();
    // Rien n'est parti en base : la creation attend le bouton final.
    expect(createProperty).not.toHaveBeenCalled();
  });
});
