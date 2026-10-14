import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { LeaseInspectionsPanel } from '../../components/rental/inspections/LeaseInspectionsPanel';

/**
 * Lot 5, section B — les garanties du panneau « États des lieux ».
 *
 * Le panneau est autonome (props `{ tenantId, leaseId }`, pas de route), donc
 * pas besoin de `MemoryRouter` : on le monte directement, comme documenté
 * dans le prompt de la tâche.
 */

const listInspections = vi.fn();
const createInspection = vi.fn();
const updateInspection = vi.fn();
const finalizeInspection = vi.fn();
const deleteInspection = vi.fn();
const compareInspections = vi.fn();
const uploadInspectionPhoto = vi.fn();
const deleteInspectionPhoto = vi.fn();
const fetchInspectionPhotoBlob = vi.fn();

vi.mock('../../services/lease-inspections-service', () => ({
  listInspections: (...a: unknown[]) => listInspections(...a),
  createInspection: (...a: unknown[]) => createInspection(...a),
  updateInspection: (...a: unknown[]) => updateInspection(...a),
  finalizeInspection: (...a: unknown[]) => finalizeInspection(...a),
  deleteInspection: (...a: unknown[]) => deleteInspection(...a),
  compareInspections: (...a: unknown[]) => compareInspections(...a),
  uploadInspectionPhoto: (...a: unknown[]) => uploadInspectionPhoto(...a),
  deleteInspectionPhoto: (...a: unknown[]) => deleteInspectionPhoto(...a),
  fetchInspectionPhotoBlob: (...a: unknown[]) => fetchInspectionPhotoBlob(...a)
}));

const TENANT_ID = 'agence-1';
const LEASE_ID = 'bail-1';

function makeInspection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'insp-entree',
    type: 'ENTRY',
    status: 'DRAFT',
    inspectionDate: '2026-01-10',
    rooms: [
      {
        id: 'room-1',
        name: 'Séjour',
        items: [{ id: 'item-1', label: 'Sol', condition: 'GOOD', comment: null }]
      }
    ],
    meters: { electricity: '', water: '', gas: '' },
    keysCount: null,
    generalComment: '',
    tenantPresent: false,
    tenantSignatoryName: null,
    agentSignatoryName: null,
    deductions: [],
    finalizedAt: null,
    photos: [],
    ...overrides
  };
}

function mount(props: { propertyFurnishingStatus?: 'FURNISHED' | 'UNFURNISHED' | 'PARTIALLY_FURNISHED' | null } = {}) {
  return render(
    <AntApp>
      <LeaseInspectionsPanel tenantId={TENANT_ID} leaseId={LEASE_ID} {...props} />
    </AntApp>
  );
}

/** Texte en minuscules sans accents, comme `normaliser` du test du stock. */
function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Spec 040, CA-M4.12 : aucun écran des états des lieux ne qualifie la cause d'un écart. */
const MOTS_INTERDITS = /\b(vols?|voleurs?|fraudes?|detournements?)\b/;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('Vue d’ensemble — statuts', () => {
  it('affiche « Non réalisé » quand aucun état des lieux n’existe', async () => {
    listInspections.mockResolvedValue({ success: true, data: [] });
    mount();

    expect(await screen.findAllByText('Non réalisé')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Commencer' })).toHaveLength(2);
  });

  it('affiche « Brouillon » et « Continuer » pour un état des lieux en cours', async () => {
    listInspections.mockResolvedValue({ success: true, data: [makeInspection({ status: 'DRAFT' })] });
    mount();

    expect(await screen.findByText('Brouillon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeInTheDocument();
  });

  it('affiche « Finalisé » et « Consulter » pour un état des lieux figé', async () => {
    listInspections.mockResolvedValue({
      success: true,
      data: [makeInspection({ status: 'FINALIZED', finalizedAt: '2026-02-01T00:00:00.000Z' })]
    });
    mount();

    expect(await screen.findByText('Finalisé')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Consulter' })).toBeInTheDocument();
  });
});

describe('Saisie — état et élément', () => {
  it('change un état, ajoute un élément, puis enregistre avec la bonne charge utile', async () => {
    const user = userEvent.setup({ delay: null });
    listInspections.mockResolvedValue({ success: true, data: [makeInspection()] });
    updateInspection.mockResolvedValue({ success: true, data: makeInspection() });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Continuer' }));

    // Changer l'état de l'unique élément (Bon -> Usagé).
    await user.click(await screen.findByRole('button', { name: 'Usagé' }));

    // Ajouter un élément dans la pièce.
    await user.type(screen.getByPlaceholderText('Nouvel élément'), 'Fenêtre');
    // Idem : « plus Ajouter » à cause de l'icône. `$` exclut « Ajouter une pièce ».
    await user.click(screen.getByRole('button', { name: /Ajouter$/ }));

    // Nom accessible : `AntD` préfixe le texte du libellé de l'icône du bouton
    // (« save Enregistrer »), donc une expression régulière plutôt qu'une
    // correspondance exacte.
    await user.click(screen.getByRole('button', { name: /Enregistrer/ }));

    expect(updateInspection).toHaveBeenCalled();
    const [tenantId, leaseId, inspectionId, payload] = updateInspection.mock.calls[0];
    expect(tenantId).toBe(TENANT_ID);
    expect(leaseId).toBe(LEASE_ID);
    expect(inspectionId).toBe('insp-entree');

    const items = payload.rooms[0].items;
    expect(items.find((item: any) => item.id === 'item-1').condition).toBe('FAIR');
    expect(items.some((item: any) => item.label === 'Fenêtre')).toBe(true);
  });
});

describe('Sortie — rappel de l’entrée et retenues proposées', () => {
  function fixtures() {
    const entry = makeInspection({
      id: 'insp-entree',
      type: 'ENTRY',
      status: 'FINALIZED',
      finalizedAt: '2026-01-15T00:00:00.000Z',
      rooms: [
        {
          id: 'room-1',
          name: 'Séjour',
          items: [{ id: 'item-1', label: 'Sol', condition: 'GOOD', comment: null }]
        }
      ]
    });
    const exit = makeInspection({
      id: 'insp-sortie',
      type: 'EXIT',
      status: 'DRAFT',
      rooms: [
        {
          id: 'room-1',
          name: 'Séjour',
          items: [{ id: 'item-1', label: 'Sol', condition: 'POOR', comment: null }]
        }
      ]
    });
    return { entry, exit };
  }

  it('rappelle l’état constaté à l’entrée', async () => {
    const user = userEvent.setup({ delay: null });
    const { entry, exit } = fixtures();
    listInspections.mockResolvedValue({ success: true, data: [entry, exit] });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Continuer' }));

    expect(await screen.findByText('Entrée : Bon')).toBeInTheDocument();
    expect(screen.getByText('Dégradé')).toBeInTheDocument();
  });

  it('propose une retenue préremplie depuis les dégradations', async () => {
    const user = userEvent.setup({ delay: null });
    const { entry, exit } = fixtures();
    listInspections.mockResolvedValue({ success: true, data: [entry, exit] });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Continuer' }));
    await user.click(await screen.findByRole('button', { name: /Proposer depuis les dégradations/ }));

    expect(await screen.findByDisplayValue(/Séjour.*Sol.*dégradé/)).toBeInTheDocument();
  });
});

describe('Finalisation', () => {
  it('demande confirmation puis affiche l’erreur 400 telle quelle', async () => {
    const user = userEvent.setup({ delay: null });
    listInspections.mockResolvedValue({ success: true, data: [makeInspection()] });
    updateInspection.mockResolvedValue({ success: true, data: makeInspection() });
    finalizeInspection.mockRejectedValue({
      response: { status: 400, data: { message: 'Un agent signataire est requis.' } }
    });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Continuer' }));
    await user.click(screen.getByRole('button', { name: 'Finaliser' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Une fois finalisé, l’état des lieux ne peut plus être modifié.')
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Finaliser' }));

    expect(await screen.findByText('Un agent signataire est requis.')).toBeInTheDocument();
  });
});

describe('Brouillon local', () => {
  it('propose de restaurer une saisie locale plus récente', async () => {
    const user = userEvent.setup({ delay: null });
    listInspections.mockResolvedValue({ success: true, data: [makeInspection()] });

    window.localStorage.setItem(
      'immotopia:inspection-draft:insp-entree',
      JSON.stringify({
        savedAt: new Date().toISOString(),
        inspectionDate: '2026-01-10',
        rooms: makeInspection().rooms,
        meters: { electricity: '', water: '', gas: '' },
        keysCount: null,
        generalComment: 'Commentaire saisi hors-ligne',
        tenantPresent: false,
        tenantSignatoryName: '',
        agentSignatoryName: '',
        deductions: []
      })
    );

    mount();
    await user.click(await screen.findByRole('button', { name: 'Continuer' }));

    expect(
      await screen.findByText('Une saisie locale non enregistrée a été trouvée pour cet état des lieux.')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restaurer' }));

    expect(await screen.findByDisplayValue('Commentaire saisi hors-ligne')).toBeInTheDocument();
  });
});

describe('Meublés — quantité, « Manquant » et évaluation (spec 040)', () => {
  function furnishedEntry(overrides: Record<string, unknown> = {}) {
    return makeInspection({
      rooms: [
        {
          id: 'room-1',
          name: 'Séjour',
          items: [
            {
              id: 'tv',
              label: 'Téléviseur',
              condition: 'GOOD',
              comment: null,
              kind: 'FURNITURE',
              quantity: 1,
              replacementValue: null
            }
          ]
        }
      ],
      ...overrides
    });
  }

  it('« Manquant » met la quantité à 0 et la désactive, et part ainsi dans le PUT', async () => {
    const user = userEvent.setup({ delay: null });
    listInspections.mockResolvedValue({ success: true, data: [furnishedEntry()] });
    updateInspection.mockResolvedValue({ success: true, data: furnishedEntry() });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Continuer' }));
    await user.click(screen.getByRole('button', { name: 'Manquant' }));

    const quantity = screen.getByRole('spinbutton', { name: 'Quantité' });
    expect(quantity).toBeDisabled();
    expect(quantity).toHaveValue('0');

    await user.click(screen.getByRole('button', { name: /Enregistrer/ }));
    const payload = updateInspection.mock.calls[0][3];
    expect(payload.rooms[0].items[0]).toMatchObject({ condition: 'MISSING', quantity: 0 });
  });

  it('envoie la quantité et la valeur de remplacement saisies', async () => {
    const user = userEvent.setup({ delay: null });
    listInspections.mockResolvedValue({ success: true, data: [furnishedEntry()] });
    updateInspection.mockResolvedValue({ success: true, data: furnishedEntry() });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Continuer' }));
    await user.click(screen.getByRole('button', { name: 'Augmenter la quantité' }));
    const value = screen.getByRole('spinbutton', { name: "Valeur de remplacement (FCFA, à l'unité)" });
    fireEvent.change(value, { target: { value: '150000' } });
    fireEvent.blur(value);

    await user.click(screen.getByRole('button', { name: /Enregistrer/ }));
    const payload = updateInspection.mock.calls[0][3];
    expect(payload.rooms[0].items[0]).toMatchObject({ kind: 'FURNITURE', quantity: 2, replacementValue: 150000 });
  });

  it('affiche un document ancien sans champ de quantité', async () => {
    const user = userEvent.setup({ delay: null });
    listInspections.mockResolvedValue({ success: true, data: [makeInspection()] });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Continuer' }));
    expect(await screen.findByText('Sol')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'Quantité' })).not.toBeInTheDocument();
    expect(screen.getByText('1 éléments évalués sur 1')).toBeInTheDocument();
  });

  it('n’appelle pas la finalisation tant qu’un élément n’est pas évalué', async () => {
    const user = userEvent.setup({ delay: null });
    const draft = makeInspection({
      rooms: [
        {
          id: 'room-1',
          name: 'Séjour',
          items: [
            { id: 'item-1', label: 'Sol', condition: null, comment: null },
            { id: 'item-2', label: 'Murs', condition: 'GOOD', comment: null }
          ]
        }
      ]
    });
    listInspections.mockResolvedValue({ success: true, data: [draft] });
    updateInspection.mockResolvedValue({ success: true, data: draft });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Continuer' }));
    expect(screen.getByText('1 à évaluer')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Finaliser' }));

    expect(await screen.findByText('1 éléments ne sont pas encore évalués.')).toBeInTheDocument();
    expect(screen.getByText('Séjour — Sol')).toBeInTheDocument();
    expect(updateInspection).toHaveBeenCalled();
    expect(finalizeInspection).not.toHaveBeenCalled();
    expect(document.querySelector('[data-unevaluated="true"]')).not.toBeNull();
  });

  it('reprend la liste quand l’API refuse la finalisation avec `data.unevaluatedItems`', async () => {
    const user = userEvent.setup({ delay: null });
    listInspections.mockResolvedValue({ success: true, data: [makeInspection()] });
    updateInspection.mockResolvedValue({ success: true, data: makeInspection() });
    finalizeInspection.mockRejectedValue({
      response: {
        status: 400,
        data: {
          message: 'Tous les éléments doivent être évalués avant de finaliser.',
          data: {
            unevaluatedItems: [
              { roomId: 'room-1', roomName: 'Séjour', itemId: 'item-1', label: 'Sol', missing: 'CONDITION' }
            ]
          }
        }
      }
    });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Continuer' }));
    await user.click(screen.getByRole('button', { name: 'Finaliser' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Finaliser' }));

    expect(await screen.findByText('1 éléments ne sont pas encore évalués.')).toBeInTheDocument();
    expect(screen.getByText('Séjour — Sol')).toBeInTheDocument();
  });
});

describe('Meublés — sortie et retenues proposées (spec 040, M5)', () => {
  function furnitureItem(
    id: string,
    label: string,
    condition: string,
    quantity: number,
    replacementValue: number | null
  ) {
    return { id, label, condition, comment: null, kind: 'FURNITURE', quantity, replacementValue };
  }

  function exitFixtures() {
    const entry = makeInspection({
      id: 'insp-entree',
      type: 'ENTRY',
      status: 'FINALIZED',
      finalizedAt: '2026-01-15T00:00:00.000Z',
      keysCount: 3,
      meters: { electricity: '12 345', water: '', gas: '' },
      rooms: [
        {
          id: 'room-1',
          name: 'Entrée/Séjour',
          items: [
            furnitureItem('tv', 'Téléviseur', 'GOOD', 1, 150000),
            furnitureItem('ch', 'Chaises', 'GOOD', 6, 15000),
            furnitureItem('lampe', 'Lampes', 'GOOD', 1, null)
          ]
        }
      ]
    });
    const exit = makeInspection({
      id: 'insp-sortie',
      type: 'EXIT',
      status: 'DRAFT',
      keysCount: 2,
      rooms: [
        {
          id: 'room-1',
          name: 'Entrée/Séjour',
          items: [
            furnitureItem('tv', 'Téléviseur', 'MISSING', 0, 150000),
            furnitureItem('ch', 'Chaises', 'GOOD', 4, 15000),
            furnitureItem('lampe', 'Lampes', 'MISSING', 0, null)
          ]
        }
      ]
    });
    return { entry, exit };
  }

  it('propose les montants depuis la valeur de remplacement, sans doublon au second clic', async () => {
    const user = userEvent.setup({ delay: null });
    const { entry, exit } = exitFixtures();
    listInspections.mockResolvedValue({ success: true, data: [entry, exit] });
    updateInspection.mockResolvedValue({ success: true, data: exit });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Continuer' }));
    const propose = screen.getByRole('button', { name: /Proposer depuis les dégradations et manquants/ });
    await user.click(propose);
    await user.click(propose);

    expect(screen.getByText('Valeur de remplacement non renseignée : montant à saisir')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Enregistrer/ }));
    const deductions = updateInspection.mock.calls[0][3].deductions;
    expect(deductions).toHaveLength(4);
    expect(deductions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Entrée/Séjour — Téléviseur : 1 manquant(s)',
          amount: 150000,
          proposedAmount: 150000,
          source: 'MISSING'
        }),
        expect.objectContaining({ label: 'Entrée/Séjour — Chaises : 2 manquant(s) sur 6', amount: 30000 }),
        expect.objectContaining({ label: 'Entrée/Séjour — Lampes : 1 manquant(s)', amount: 0, proposedAmount: null }),
        expect.objectContaining({ label: 'Clés manquantes : 1', amount: 0, source: 'KEYS', itemId: null })
      ])
    );
  });

  it('masque la suppression d’un élément repris de l’entrée et rappelle les valeurs d’entrée', async () => {
    const user = userEvent.setup({ delay: null });
    const { entry, exit } = exitFixtures();
    listInspections.mockResolvedValue({ success: true, data: [entry, exit] });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Continuer' }));
    expect(await screen.findByText('Téléviseur')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer l’élément Téléviseur' })).not.toBeInTheDocument();
    expect(screen.getByText('Baisse de quantité (−2)')).toBeInTheDocument();
    expect(screen.getByText('Entrée : 12 345')).toBeInTheDocument();
    expect(screen.getByText('Entrée : 3')).toBeInTheDocument();
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(MOTS_INTERDITS);
  });
});

describe('Meublés — choix du modèle et comparaison (spec 040, M1 et M4)', () => {
  it('présélectionne le modèle mobilier pour un bien meublé et le transmet', async () => {
    const user = userEvent.setup({ delay: null });
    listInspections.mockResolvedValue({ success: true, data: [] });
    createInspection.mockResolvedValue({ success: true, data: makeInspection() });
    mount({ propertyFurnishingStatus: 'FURNISHED' });

    await user.click((await screen.findAllByRole('button', { name: 'Commencer' }))[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('radio', { name: 'Bâti, mobilier et équipements' })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Commencer' }));

    await waitFor(() => expect(createInspection).toHaveBeenCalled());
    expect(createInspection.mock.calls[0][2]).toMatchObject({ type: 'ENTRY', template: 'FURNISHED' });
  });

  it('présélectionne « Bâti seulement » pour un bien non meublé', async () => {
    const user = userEvent.setup({ delay: null });
    listInspections.mockResolvedValue({ success: true, data: [] });
    mount({ propertyFurnishingStatus: 'UNFURNISHED' });

    await user.click((await screen.findAllByRole('button', { name: 'Commencer' }))[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('radio', { name: 'Bâti seulement' })).toBeChecked();
  });

  it('montre la synthèse, les étiquettes et filtre les écarts', async () => {
    const user = userEvent.setup({ delay: null });
    const entry = makeInspection({ status: 'FINALIZED', finalizedAt: '2026-01-15T00:00:00.000Z' });
    const exit = makeInspection({
      id: 'insp-sortie',
      type: 'EXIT',
      status: 'FINALIZED',
      finalizedAt: '2026-06-15T00:00:00.000Z'
    });
    listInspections.mockResolvedValue({ success: true, data: [entry, exit] });
    const base = {
      roomId: 'room-1',
      roomName: 'Séjour',
      entryCondition: 'GOOD',
      degraded: false,
      kind: 'FURNITURE',
      missing: false,
      quantityDecrease: 0,
      missingQuantity: 0,
      absentFromExit: false,
      replacementValue: null,
      missingValue: null
    };
    compareInspections.mockResolvedValue({
      success: true,
      data: {
        entry,
        exit,
        rows: [
          {
            ...base,
            itemId: 'tv',
            label: 'Téléviseur',
            exitCondition: 'MISSING',
            entryQuantity: 1,
            exitQuantity: 0,
            missing: true,
            missingQuantity: 1,
            replacementValue: 150000,
            missingValue: 150000
          },
          {
            ...base,
            itemId: 'ch',
            label: 'Chaises',
            exitCondition: 'GOOD',
            entryQuantity: 6,
            exitQuantity: 4,
            quantityDecrease: 2,
            missingQuantity: 2
          },
          {
            ...base,
            itemId: 'cl',
            label: 'Climatiseur',
            exitCondition: null,
            entryQuantity: 1,
            exitQuantity: null,
            absentFromExit: true
          },
          {
            ...base,
            itemId: 'sol',
            label: 'Sol',
            kind: 'FIXTURE',
            exitCondition: 'GOOD',
            entryQuantity: null,
            exitQuantity: null
          }
        ],
        summary: {
          keys: { entry: 3, exit: 2, missing: 1 },
          meters: {
            electricity: { entry: '12 980', exit: '12 345', difference: -635 },
            water: { entry: null, exit: null, difference: null },
            gas: { entry: null, exit: null, difference: null }
          },
          missingCount: 1,
          quantityDecreaseCount: 1,
          degradedCount: 0,
          absentFromExitCount: 1,
          missingValueTotal: 150000,
          missingWithoutValueCount: 1
        }
      }
    });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Comparer entrée et sortie' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Absent de la sortie')).toBeInTheDocument();
    expect(within(dialog).getByText('Baisse de quantité (−2)')).toBeInTheDocument();
    expect(within(dialog).getByText('Clés manquantes : 1')).toBeInTheDocument();
    expect(within(dialog).getByText("Relevé de sortie inférieur à celui d'entrée")).toBeInTheDocument();
    expect(within(dialog).getAllByText('Quantité (entrée → sortie)').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Sol').length).toBeGreaterThan(0);

    await user.click(within(dialog).getByRole('switch', { name: 'Afficher seulement les écarts' }));
    expect(within(dialog).queryAllByText('Sol')).toHaveLength(0);
    expect(within(dialog).getAllByText('Téléviseur').length).toBeGreaterThan(0);

    expect(normaliser(document.body.textContent ?? '')).not.toMatch(MOTS_INTERDITS);
  });
});
