import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LandCreateModal } from '../../pages/patrimoine/land/LandCreateModal';
import { detail } from './land-fixtures';

const listLandTracks = vi.fn();
const createLandRegularization = vi.fn();

vi.mock('../../pages/patrimoine/land/land-regularization-service', () => ({
  listLandTracks: (...a: unknown[]) => listLandTracks(...a),
  createLandRegularization: (...a: unknown[]) => createLandRegularization(...a)
}));
vi.mock('../../services/property-service', () => ({
  listProperties: vi.fn().mockResolvedValue({
    properties: [{ id: 'bien-1', title: 'Terrain de Bingerville', internalReference: 'TER-001' }],
    pagination: {}
  }),
  getProperty: vi
    .fn()
    .mockResolvedValue({ id: 'bien-1', title: 'Terrain de Bingerville', internalReference: 'TER-001' })
}));

const PISTES = [
  {
    key: 'CI_ACD',
    country: 'CI',
    label: "Côte d'Ivoire — attestation villageoise vers ACD",
    validationStatus: 'A_VALIDER',
    validationNote: 'Filière à faire valider par un juriste local.',
    steps: []
  },
  {
    key: 'PERSONNALISEE',
    country: null,
    label: 'Filière personnalisée',
    validationStatus: 'NON_APPLICABLE',
    validationNote: null,
    steps: []
  }
];

const onCreated = vi.fn();

let queryClientCourant: QueryClient;

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  queryClientCourant = queryClient;
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <LandCreateModal open tenantId="agence-1" defaultPropertyId="bien-1" onClose={vi.fn()} onCreated={onCreated} />
      </AntApp>
    </QueryClientProvider>
  );
}

async function choisirFiliere(user: ReturnType<typeof userEvent.setup>, nom: string) {
  await user.click(screen.getByLabelText('Filière'));
  await user.click(await screen.findByText(nom));
}

beforeEach(() => {
  vi.clearAllMocks();
  listLandTracks.mockResolvedValue(PISTES);
});

describe('<LandCreateModal>', () => {
  it('crée un dossier CI_ACD sans étapes personnalisées', async () => {
    const user = userEvent.setup();
    createLandRegularization.mockResolvedValue(detail());
    monter();
    const invalidate = vi.spyOn(queryClientCourant, 'invalidateQueries');

    await choisirFiliere(user, "Côte d'Ivoire — attestation villageoise vers ACD");
    expect(await screen.findByText('À valider par un juriste local')).toBeInTheDocument();
    expect(screen.getAllByText('Filière à faire valider par un juriste local.')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Créer le dossier' }));

    await waitFor(() =>
      expect(createLandRegularization).toHaveBeenCalledWith(
        'agence-1',
        expect.objectContaining({ propertyId: 'bien-1', track: 'CI_ACD', steps: undefined })
      )
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['land-regularizations', 'agence-1'] });
  });

  it('filière personnalisée : édite la liste d’étapes et l’envoie', async () => {
    const user = userEvent.setup();
    createLandRegularization.mockResolvedValue(detail({ track: 'PERSONNALISEE' }));
    monter();

    await choisirFiliere(user, 'Filière personnalisée');
    await user.type(await screen.findByLabelText("Libellé de l'étape 1"), 'Visite du cadastre');
    await user.click(screen.getByRole('button', { name: /Ajouter une étape/ }));
    await user.type(await screen.findByLabelText("Libellé de l'étape 2"), 'Dépôt du dossier');
    await user.click(screen.getByRole('button', { name: 'Créer le dossier' }));

    await waitFor(() =>
      expect(createLandRegularization).toHaveBeenCalledWith(
        'agence-1',
        expect.objectContaining({
          track: 'PERSONNALISEE',
          steps: [
            { label: 'Visite du cadastre', required: true, dueDate: undefined },
            { label: 'Dépôt du dossier', required: true, dueDate: undefined }
          ]
        })
      )
    );
  });

  it('affiche proprement le refus 409 « déjà un dossier en cours »', async () => {
    const user = userEvent.setup();
    createLandRegularization.mockRejectedValue({
      response: { status: 409, data: { error: 'Ce bien a déjà un dossier de régularisation en cours.' } }
    });
    monter();

    await choisirFiliere(user, "Côte d'Ivoire — attestation villageoise vers ACD");
    await user.click(screen.getByRole('button', { name: 'Créer le dossier' }));

    expect(await screen.findByText('Ce bien a déjà un dossier de régularisation en cours.')).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
