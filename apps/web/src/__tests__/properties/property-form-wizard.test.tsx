import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent as domFireEvent } from '@testing-library/dom';
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
const updateProperty = vi.fn();

vi.mock('../../services/property-service', () => ({
  __esModule: true,
  getTemplate: (...a: unknown[]) => getTemplate(...a),
  createProperty: (...a: unknown[]) => createProperty(...a),
  updateProperty: (...a: unknown[]) => updateProperty(...a),
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

// Les briques lourdes du parcours ne sont pas le sujet de ces tests. Rendu
// interactif (bouton) pour le parcours de creation complet plus bas, qui a
// besoin de renseigner `formData.location` pour valider l'etape.
vi.mock('../../components/ui/location-selector', () => ({
  LocationSelector: ({ onChange }: { onChange: (location: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          country: 'CI',
          countryId: 'ci',
          region: 'Abidjan',
          regionId: 'abj',
          commune: 'Cocody',
          communeId: 'cocody'
        })
      }
    >
      choisir-localisation
    </button>
  )
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
  updateProperty.mockReset();
  updateProperty.mockResolvedValue({ id: 'bien-1' });
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

  /**
   * Écart recette du 26/09 : un immeuble déclaré à 79 appartements n'en
   * créait que 60 (`MAX_APPARTEMENTS`), sans aucun message pour dire que 19
   * unités manquaient. Le plafond est monté à 200 (bien au-dessus de tout
   * immeuble réel, cf. docs/recette/SCENARIO_SYNDIC_ABONNEMENT.md, qui va
   * jusqu'à 102) : 79 doit désormais produire 79 lignes.
   */
  it('crée bien 79 lignes pour 79 appartements déclarés (écart recette du 26/09)', async () => {
    const user = userEvent.setup();
    await allerAuxSpecificites(user);

    await user.type(await screen.findByLabelText("Nombre total d'appartements"), '79');

    await waitFor(() => {
      expect(screen.getByText(/Appartements \(79\)/)).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('Appartement 1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Appartement 79')).toBeInTheDocument();
  });

  /**
   * Le plafond doit désormais bloquer la saisie plutôt que tronquer en
   * silence après coup : au-delà de 200, le champ lui-même refuse la valeur.
   */
  it('bloque la saisie au-delà du plafond au lieu de tronquer après coup', async () => {
    const user = userEvent.setup();
    await allerAuxSpecificites(user);

    const champNombre = await screen.findByLabelText("Nombre total d'appartements");
    await user.type(champNombre, '250');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText(/Appartements \(200\)/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Appartements \(250\)/)).toBeNull();
  });
});

/**
 * Ecart recette du 26/09 (Syndic, quota BLOCK) — un bien en mode Location,
 * a la derniere etape (« Médias »), envoyait DEUX `POST .../properties` pour
 * un seul clic sur « Terminer » : l'auto-save qui prepare l'etape media
 * (`autoSaveForMedia`, sur l'arrivee a cette etape) et `handleFinish` (le
 * clic) pouvaient chacun decider, sur un `savedPropertyId` encore vide,
 * d'appeler `createProperty`. Le second partait alors que le premier avait
 * deja consomme (ou vu refuser) le quota, et l'API le renvoyait en 500 au
 * lieu de 409 (voir packages/api/src/services/property-service.ts).
 *
 * Un `propertyCreationPromiseRef` partage les deux chemins : le premier a
 * demarrer pose la promesse, l'autre l'attend au lieu d'en relancer une.
 * Cote navigateur reel, la fenetre de course est un ecart entre la peinture
 * et l'effet passif differe (React ne la flushe jamais dans ces tests, qui
 * traitent chaque effet de facon synchrone) : ces tests verifient donc le
 * contrat observable — jamais plus d'un `createProperty` sur tout le
 * parcours — plutot que de rejouer le timing exact.
 */
describe('Création (Location) — un seul createProperty part malgré l’auto-save media', () => {
  async function allerJusquauxMedias(user: ReturnType<typeof userEvent.setup>) {
    monter();

    await user.click(screen.getByText('Appartement'));
    await user.type(screen.getByPlaceholderText('Ex: Appartement 3 pièces à Cocody'), 'Bel appartement');
    await user.click(screen.getByText('Suivant'));

    await user.click(screen.getByText('choisir-localisation'));
    await user.click(screen.getByText('Suivant'));

    // « Caractéristiques générales » : rien d'obligatoire pour un appartement.
    await user.click(screen.getByText('Suivant'));

    await user.click(screen.getByText('Location'));
    await user.click(screen.getByText('Suivant'));

    // « Caractéristiques spécifiques » : gabarit vide (mock), rien à saisir.
    await user.click(screen.getByText('Suivant'));
    // Arrivée sur « Médias » (dernière étape) : déclenche l'auto-save.
  }

  it('l’auto-save crée le bien une seule fois ; « Terminer » met à jour, ne recrée pas', async () => {
    const user = userEvent.setup();
    createProperty.mockResolvedValue({ id: 'bien-1', propertyType: 'APPARTEMENT', title: 'Bel appartement' });

    await allerJusquauxMedias(user);

    await waitFor(() => expect(createProperty).toHaveBeenCalledTimes(1));
    // L'auto-save doit avoir fini (savedPropertyId pose) avant que « Terminer »
    // ne redevienne cliquable au sens d'antd (loading retombé).
    await waitFor(() => {
      const bouton = screen.getByText('Terminer').closest('button');
      expect(bouton?.className).not.toMatch(/ant-btn-loading/);
    });

    await user.click(screen.getByText('Terminer'));

    await waitFor(() => expect(updateProperty).toHaveBeenCalledTimes(1));
    expect(updateProperty).toHaveBeenCalledWith('agence-1', 'bien-1', expect.anything());
    // Le point du correctif : jamais un second create derriere l'auto-save.
    expect(createProperty).toHaveBeenCalledTimes(1);
  });

  it('tant que l’auto-save est en cours, « Terminer » ne relance pas createProperty', async () => {
    const user = userEvent.setup();
    // Ne se resout jamais : imite un auto-save encore en vol (lent, ou
    // bloque sur le quota cote API) au moment ou l'utilisateur clique.
    createProperty.mockImplementation(() => new Promise(() => {}));

    await allerJusquauxMedias(user);

    await waitFor(() => expect(createProperty).toHaveBeenCalledTimes(1));

    // Le bouton est en chargement (antd) : un clic pendant ce temps ne doit
    // declencher ni un second createProperty, ni un updateProperty.
    await user.click(screen.getByText('Terminer'));

    expect(createProperty).toHaveBeenCalledTimes(1);
    expect(updateProperty).not.toHaveBeenCalled();
  });

  /**
   * Reconstitution la plus fidèle du symptôme rapporté en recette : deux
   * alertes superposées (la bannière de quota, correcte, puis une erreur
   * générique). `message.error` n'est appelé qu'à un seul endroit dans ce
   * composant — dans le `catch` de `handleFinish` — donc les deux alertes
   * observées viennent forcément de DEUX exécutions de `handleFinish`, pas
   * d'un auto-save silencieux (son `catch` ne fait qu'un `console.error`).
   * Ça correspond à un double-clic sur « Terminer » une fois l'auto-save
   * retombé en échec (quota refusé, `savedPropertyId` resté vide) : le
   * bouton redevient cliquable, et deux clics rapprochés relancent chacun
   * `handleFinish` avant que le premier n'ait eu le temps de désactiver le
   * bouton (React n'a pas encore rendu `loading`). Reproduit ici en
   * dispatchant les deux clics dans un seul batch React (`act`), qui les
   * traite avant de flusher le premier rendu — le seul moyen, dans ce
   * harnais, d'obtenir deux exécutions avant que l'état ne se mette à jour.
   */
  it('double-clic sur « Terminer » après l’échec silencieux de l’auto-save : un seul createProperty relancé', async () => {
    const user = userEvent.setup();
    const quotaError = {
      response: {
        status: 409,
        data: { code: 'QUOTA_EXCEEDED', error: 'La capacité de votre abonnement est atteinte.' }
      }
    };
    // 1er appel (auto-save) : quota refusé, silencieux (pas de message.error).
    createProperty.mockRejectedValueOnce(quotaError);
    // Tout appel suivant (relance depuis "Terminer") : jamais résolu, pour ne
    // compter que le nombre d'appels sans se soucier de la suite du flux.
    createProperty.mockImplementation(() => new Promise(() => {}));

    await allerJusquauxMedias(user);

    await waitFor(() => expect(createProperty).toHaveBeenCalledTimes(1));
    // L'auto-save a échoué : `savedPropertyId` reste vide, mais le bouton
    // redevient cliquable (isLoading retombe à false dans son `finally`).
    await waitFor(() => {
      const bouton = screen.getByText('Terminer').closest('button');
      expect(bouton?.className).not.toMatch(/ant-btn-loading/);
    });

    const terminerBtn = screen.getByText('Terminer');
    act(() => {
      domFireEvent.click(terminerBtn);
      domFireEvent.click(terminerBtn);
    });

    // 1 (auto-save, déjà réglé) + au plus 1 nouvelle tentative depuis
    // "Terminer" — jamais 2 de plus (une par clic), ce qui donnerait le 500
    // constaté en recette sur le second appel concurrent.
    await waitFor(() => expect(createProperty.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(createProperty).toHaveBeenCalledTimes(2);
  });
});
