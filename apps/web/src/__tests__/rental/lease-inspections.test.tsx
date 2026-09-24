import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

function mount() {
  return render(
    <AntApp>
      <LeaseInspectionsPanel tenantId={TENANT_ID} leaseId={LEASE_ID} />
    </AntApp>
  );
}

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
