import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LandRegularizationDetailPage } from '../../pages/patrimoine/land/LandRegularizationDetailPage';
import { detail, detailClos, etape } from './land-fixtures';

const getLandRegularization = vi.fn();
const changeLandStepStatus = vi.fn();
const changeLandRegularizationStatus = vi.fn();
const updateLandStep = vi.fn();
const updateLandRegularization = vi.fn();
const addLandStep = vi.fn();
const deleteLandStep = vi.fn();
const uploadDocument = vi.fn();
const listPropertyDocuments = vi.fn();
const downloadPropertyDocumentFile = vi.fn();

vi.mock('../../pages/patrimoine/land/land-regularization-service', () => ({
  getLandRegularization: (...a: unknown[]) => getLandRegularization(...a),
  changeLandStepStatus: (...a: unknown[]) => changeLandStepStatus(...a),
  changeLandRegularizationStatus: (...a: unknown[]) => changeLandRegularizationStatus(...a),
  updateLandStep: (...a: unknown[]) => updateLandStep(...a),
  updateLandRegularization: (...a: unknown[]) => updateLandRegularization(...a),
  addLandStep: (...a: unknown[]) => addLandStep(...a),
  deleteLandStep: (...a: unknown[]) => deleteLandStep(...a)
}));
vi.mock('../../services/property-service', () => ({
  uploadDocument: (...a: unknown[]) => uploadDocument(...a),
  listPropertyDocuments: (...a: unknown[]) => listPropertyDocuments(...a),
  downloadPropertyDocumentFile: (...a: unknown[]) => downloadPropertyDocumentFile(...a)
}));
vi.mock('../../utils/save-blob', () => ({ saveBlob: vi.fn() }));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/patrimoine/land/reg-1']}>
          <Routes>
            <Route
              path="/tenant/:tenantId/patrimoine/land/:regularizationId"
              element={<LandRegularizationDetailPage />}
            />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

async function ouvrirEtape(user: ReturnType<typeof userEvent.setup>, libelle: string) {
  await user.click(await screen.findByRole('button', { name: "Ouvrir l'étape " + libelle }));
  return screen.findByRole('dialog');
}

beforeEach(() => {
  vi.clearAllMocks();
  getLandRegularization.mockResolvedValue(detail());
  listPropertyDocuments.mockResolvedValue([{ id: 'doc-9', fileName: 'plan-geometre.pdf', documentType: 'PLAN' }]);
});

describe('<LandRegularizationDetailPage>', () => {
  it('affiche le bandeau « à faire valider » avec la note de validation', async () => {
    monter();

    expect(await screen.findByText('À valider par un juriste local')).toBeInTheDocument();
    expect(screen.getAllByText('Filière à faire valider par un juriste local.')).toHaveLength(1);
  });

  it('pas de bandeau quand la filière n’exige pas de validation', async () => {
    getLandRegularization.mockResolvedValue(
      detail({ validationStatus: 'NON_APPLICABLE', validationNote: null, track: 'PERSONNALISEE' })
    );
    monter();

    await screen.findByText('Terrain de Bingerville');
    expect(screen.queryByText('À valider par un juriste local')).toBeNull();
  });

  it('affiche les frais de régularisation séparément du coût de revient', async () => {
    monter();

    expect(await screen.findByText('Frais de régularisation')).toBeInTheDocument();
    expect(screen.getByText(/1.250.000 XOF/)).toBeInTheDocument();
    expect(screen.getByText("Ce montant n'est pas inclus dans le coût de revient du bien.")).toBeInTheDocument();
  });

  it('construit les boutons de statut uniquement depuis allowedTransitions', async () => {
    const user = userEvent.setup();
    monter();

    const tiroir = await ouvrirEtape(user, 'Dossier technique du géomètre');
    // allowedTransitions : TERMINEE, BLOQUEE, A_FAIRE (pas EN_COURS).
    expect(within(tiroir).getByRole('button', { name: "Terminer l'étape" })).toBeInTheDocument();
    expect(within(tiroir).getByRole('button', { name: 'Marquer comme bloquée' })).toBeInTheDocument();
    expect(within(tiroir).getByRole('button', { name: 'Remettre à faire' })).toBeInTheDocument();
    expect(within(tiroir).queryByRole('button', { name: 'Démarrer' })).toBeNull();

    changeLandStepStatus.mockResolvedValue(detail());
    await user.click(within(tiroir).getByRole('button', { name: "Terminer l'étape" }));
    await waitFor(() =>
      expect(changeLandStepStatus).toHaveBeenCalledWith('agence-1', 'reg-1', 'step-2', 'TERMINEE', undefined)
    );
  });

  it('la réouverture d’une étape exige un motif', async () => {
    const user = userEvent.setup();
    changeLandStepStatus.mockResolvedValue(detail());
    monter();

    const tiroir = await ouvrirEtape(user, 'Attestation villageoise');
    const bouton = within(tiroir).getByRole('button', { name: "Rouvrir l'étape" });
    expect(bouton).toBeDisabled();

    await user.type(within(tiroir).getByLabelText('Motif de la réouverture (obligatoire)'), 'Pièce contestée');
    expect(bouton).toBeEnabled();
    await user.click(bouton);

    await waitFor(() =>
      expect(changeLandStepStatus).toHaveBeenCalledWith('agence-1', 'reg-1', 'step-1', 'EN_COURS', 'Pièce contestée')
    );
  });

  it('téléverse un nouveau fichier avec le type suggéré puis rattache la pièce', async () => {
    const user = userEvent.setup();
    uploadDocument.mockResolvedValue({ id: 'doc-new' });
    updateLandStep.mockResolvedValue(detail());
    monter();

    const tiroir = await ouvrirEtape(user, 'Dossier technique du géomètre');
    const fichier = new File(['%PDF'], 'bornage.pdf', { type: 'application/pdf' });
    await user.upload(within(tiroir).getByLabelText(/Ou téléverser un nouveau fichier/), fichier);

    await waitFor(() => expect(uploadDocument).toHaveBeenCalledWith('agence-1', 'bien-1', fichier, 'PLAN'));
    await waitFor(() =>
      expect(updateLandStep).toHaveBeenCalledWith('agence-1', 'reg-1', 'step-2', { documentId: 'doc-new' })
    );
  });

  it('rattache un document existant du même bien', async () => {
    const user = userEvent.setup();
    updateLandStep.mockResolvedValue(detail());
    monter();

    const tiroir = await ouvrirEtape(user, 'Dossier technique du géomètre');
    await user.click(within(tiroir).getByLabelText('Rattacher un document existant du bien'));
    await user.click(await screen.findByText(/plan-geometre\.pdf/));
    await user.click(within(tiroir).getByRole('button', { name: 'Rattacher' }));

    await waitFor(() =>
      expect(updateLandStep).toHaveBeenCalledWith('agence-1', 'reg-1', 'step-2', { documentId: 'doc-9' })
    );
  });

  it('télécharge la pièce rattachée par l’endpoint de fichier existant', async () => {
    const user = userEvent.setup();
    getLandRegularization.mockResolvedValue(
      detail({
        steps: [
          etape({
            id: 'step-2',
            label: 'Dossier technique du géomètre',
            documentId: 'doc-9',
            document: { id: 'doc-9', fileName: 'plan-geometre.pdf', documentType: 'PLAN' }
          })
        ]
      })
    );
    downloadPropertyDocumentFile.mockResolvedValue({ blob: new Blob(['x']), filename: 'plan-geometre.pdf' });
    monter();

    const tiroir = await ouvrirEtape(user, 'Dossier technique du géomètre');
    await user.click(within(tiroir).getByRole('button', { name: /Télécharger la pièce/ }));

    await waitFor(() =>
      expect(downloadPropertyDocumentFile).toHaveBeenCalledWith('agence-1', 'bien-1', 'doc-9', 'plan-geometre.pdf')
    );
  });

  it('terminer le dossier : le refus 409 du serveur est affiché', async () => {
    const user = userEvent.setup();
    changeLandRegularizationStatus.mockRejectedValue({
      response: { status: 409, data: { error: 'Toutes les étapes obligatoires doivent être terminées.' } }
    });
    monter();

    await user.click(await screen.findByRole('button', { name: 'Terminer le dossier' }));
    const dialogue = await screen.findByRole('dialog');
    await user.click(within(dialogue).getByRole('button', { name: 'Confirmer' }));

    expect(await screen.findByText('Toutes les étapes obligatoires doivent être terminées.')).toBeInTheDocument();
  });

  it('rouvrir un dossier terminé exige un motif', async () => {
    const user = userEvent.setup();
    getLandRegularization.mockResolvedValue(detail({ status: 'TERMINEE' }));
    changeLandRegularizationStatus.mockResolvedValue(detail());
    monter();

    await user.click(await screen.findByRole('button', { name: 'Rouvrir le dossier' }));
    const dialogue = await screen.findByRole('dialog');
    const confirmer = within(dialogue).getByRole('button', { name: 'Confirmer' });
    expect(confirmer).toBeDisabled();

    await user.type(within(dialogue).getByLabelText('Motif (obligatoire)'), 'Nouvelle pièce exigée');
    await user.click(confirmer);

    await waitFor(() =>
      expect(changeLandRegularizationStatus).toHaveBeenCalledWith(
        'agence-1',
        'reg-1',
        'EN_COURS',
        'Nouvelle pièce exigée'
      )
    );
  });

  it('dossier clos : lecture seule (notes désactivées, pas d’ajout d’étape, pas de bouton de statut)', async () => {
    const user = userEvent.setup();
    getLandRegularization.mockResolvedValue(detailClos());
    monter();

    expect(await screen.findByLabelText('Notes du dossier', { selector: 'textarea' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Ajouter une étape/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enregistrer les notes' })).toBeNull();

    const tiroir = await ouvrirEtape(user, 'Dossier technique du géomètre');
    expect(within(tiroir).queryByRole('button', { name: "Terminer l'étape" })).toBeNull();
    expect(within(tiroir).queryByRole('button', { name: "Enregistrer l'étape" })).toBeNull();
  });

  it('404 : état « Dossier introuvable » avec retour à la liste, sans « Réessayer »', async () => {
    getLandRegularization.mockRejectedValue({ response: { status: 404, data: { error: 'Introuvable' } } });
    monter();

    expect(await screen.findByText('Dossier introuvable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retour aux dossiers' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });

  it('autre erreur de chargement : propose de réessayer', async () => {
    getLandRegularization.mockRejectedValue({ response: { status: 500, data: {} } });
    monter();

    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('affiche le détail de validation (message) avant error', async () => {
    const user = userEvent.setup();
    changeLandStepStatus.mockRejectedValue({
      response: { status: 400, data: { error: 'Erreur de validation', message: 'Le champ reason est requis.' } }
    });
    monter();

    const tiroir = await ouvrirEtape(user, 'Dossier technique du géomètre');
    await user.click(within(tiroir).getByRole('button', { name: "Terminer l'étape" }));

    expect(await screen.findByText('Le champ reason est requis.')).toBeInTheDocument();
    expect(screen.queryByText('Erreur de validation')).toBeNull();
  });

  it('téléversement réussi mais rattachement refusé : message distinct et liste des documents rafraîchie', async () => {
    const user = userEvent.setup();
    uploadDocument.mockResolvedValue({ id: 'doc-new' });
    updateLandStep.mockRejectedValue({ response: { status: 409, data: { message: 'Dossier clos.' } } });
    monter();

    const tiroir = await ouvrirEtape(user, 'Dossier technique du géomètre');
    await waitFor(() => expect(listPropertyDocuments).toHaveBeenCalledTimes(1));
    const fichier = new File(['%PDF'], 'bornage.pdf', { type: 'application/pdf' });
    await user.upload(within(tiroir).getByLabelText(/Ou téléverser un nouveau fichier/), fichier);

    expect(await screen.findByText(/n'a pas pu être rattachée à l'étape/)).toBeInTheDocument();
    await waitFor(() => expect(listPropertyDocuments).toHaveBeenCalledTimes(2));
  });

  it('étape personnalisée : « Enregistrer l’étape » est désactivé sans libellé', async () => {
    const user = userEvent.setup();
    getLandRegularization.mockResolvedValue(detail({ track: 'PERSONNALISEE', validationStatus: 'NON_APPLICABLE' }));
    monter();

    const tiroir = await ouvrirEtape(user, 'Dossier technique du géomètre');
    await user.clear(within(tiroir).getByLabelText("Libellé de l'étape"));
    expect(within(tiroir).getByRole('button', { name: "Enregistrer l'étape" })).toBeDisabled();
  });
});
