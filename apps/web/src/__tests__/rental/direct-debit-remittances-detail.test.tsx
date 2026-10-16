import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DirectDebitRemittanceDetail } from '../../pages/rental/DirectDebitRemittanceDetail';
import {
  emptyPrenotifications,
  makeLine,
  makeRemittance,
  REMITTANCE_ID,
  TENANT_ID
} from './direct-debit-remittances-fixtures';

/**
 * Spec 042, P2 — détail d'une remise (§7.3, §7.10) : actions selon le statut,
 * confirmations, résumé des prénotifications, retrait de ligne, annulation avec
 * motif, mandats non retenus, IBAN masqué seulement.
 */

const getRemittance = vi.fn();
const refreshRemittance = vi.fn();
const validateRemittance = vi.fn();
const resendPrenotifications = vi.fn();
const exportRemittance = vi.fn();
const submitRemittance = vi.fn();
const cancelRemittance = vi.fn();
const cancelRemittanceLine = vi.fn();
const saveBlob = vi.fn();

vi.mock('../../services/direct-debit-service', () => ({
  getRemittance: (...a: unknown[]) => getRemittance(...a),
  refreshRemittance: (...a: unknown[]) => refreshRemittance(...a),
  validateRemittance: (...a: unknown[]) => validateRemittance(...a),
  resendPrenotifications: (...a: unknown[]) => resendPrenotifications(...a),
  exportRemittance: (...a: unknown[]) => exportRemittance(...a),
  submitRemittance: (...a: unknown[]) => submitRemittance(...a),
  cancelRemittance: (...a: unknown[]) => cancelRemittance(...a),
  cancelRemittanceLine: (...a: unknown[]) => cancelRemittanceLine(...a)
}));

vi.mock('../../utils/save-blob', () => ({
  saveBlob: (...a: unknown[]) => saveBlob(...a),
  filenameFromDisposition: (_header: unknown, fallback: string) => fallback
}));

// La suite complète tourne en parallèle : les attentes asynchrones par défaut (1 s) sont trop courtes.
configure({ asyncUtilTimeout: 8000 });

const RAW_IBAN = 'CI93CI0010123456789012345678';
const WARNING_TEXT =
  'Fichier produit mais remise pas encore marquée comme déposée à la banque : chargez le fichier sur votre banque en ligne, puis marquez la remise comme déposée.';

function mount(state?: unknown) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter
          initialEntries={[
            { pathname: `/tenant/${TENANT_ID}/rental/direct-debit/remittances/${REMITTANCE_ID}`, state }
          ]}
        >
          <Routes>
            <Route
              path="/tenant/:tenantId/rental/direct-debit/remittances/:remittanceId"
              element={<DirectDebitRemittanceDetail />}
            />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const button = (name: string | RegExp) => screen.queryByRole('button', { name });

/** Clique l'action puis confirme dans l'infobulle de confirmation. */
async function clickAndConfirm(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name }));
  await user.click(await screen.findByRole('button', { name: 'Confirmer' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  getRemittance.mockResolvedValue(makeRemittance());
});

describe('DirectDebitRemittanceDetail', () => {
  it("affiche l'en-tête et les lignes avec l'IBAN masqué seulement", async () => {
    mount();

    expect(await screen.findByRole('heading', { name: 'PRL-2026-0001' })).toBeInTheDocument();
    expect(screen.getByText('CI123456')).toBeInTheDocument();
    expect(screen.getByText('GENERIC_CSV')).toBeInTheDocument();
    expect(screen.getByText('05/11/2026')).toBeInTheDocument();
    expect(screen.getByText('29/10/2026')).toBeInTheDocument();

    expect(screen.getByText('PRL-2026-0001-001')).toBeInTheDocument();
    const mask = screen.getByText('CI•• •••• •••• •••• •••• 5678');
    expect(mask.closest('bdi')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByRole('link', { name: 'BAIL-001' })).toHaveAttribute(
      'href',
      `/tenant/${TENANT_ID}/rental/leases/bail-1`
    );
    // La ligne plafonnée porte l'étiquette ; l'autre non.
    expect(screen.getAllByText('Plafonné')).toHaveLength(1);
    expect(document.body.textContent).not.toContain(RAW_IBAN);
  });

  it('BROUILLON : propose Actualiser, Valider, Annuler et Retirer, pas de bandeau', async () => {
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    expect(button('Actualiser')).toBeInTheDocument();
    expect(button('Valider la remise')).toBeInTheDocument();
    expect(button('Annuler la remise')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Retirer' })).toHaveLength(2);
    expect(button('Produire le fichier')).not.toBeInTheDocument();
    expect(screen.queryByText(WARNING_TEXT)).not.toBeInTheDocument();
  });

  it('valide après confirmation (avis de prénotification par e-mail) puis résume les prénotifications', async () => {
    const user = userEvent.setup();
    const validated = makeRemittance({ status: 'VALIDATED', validatedAt: '2026-10-16T10:00:00.000Z' });
    validateRemittance.mockResolvedValue({
      remittance: validated,
      prenotifications: { pending: 0, sent: 3, noEmail: 1, disabled: 0, failed: 2 }
    });
    getRemittance.mockResolvedValueOnce(makeRemittance()).mockResolvedValue(validated);
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    await user.click(screen.getByRole('button', { name: 'Valider la remise' }));
    expect(await screen.findByText(/recevront une prénotification par e-mail/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(validateRemittance).toHaveBeenCalledWith(TENANT_ID, REMITTANCE_ID));
    expect(
      await screen.findByText(/Envoyées : 3 · Sans e-mail : 1 · Désactivées : 0 · En échec : 2/)
    ).toBeInTheDocument();
    // L'écran suit le nouveau statut.
    // (requêtes par texte : getByRole est très lent sur le DOM d'Ant Design)
    expect(await screen.findByText('Produire le fichier')).toBeInTheDocument();
    expect(screen.queryByText('Valider la remise')).not.toBeInTheDocument();
  });

  it('VALIDÉE : produit le fichier, le télécharge et passe en « Fichier produit » avec le bandeau', async () => {
    const user = userEvent.setup();
    const blob = new Blob(['csv']);
    exportRemittance.mockResolvedValue({ blob, filename: 'PRL-2026-0001.csv' });
    const validated = makeRemittance({ status: 'VALIDATED' });
    const exported = makeRemittance({
      status: 'EXPORTED',
      exportCount: 1,
      firstExportedAt: '2026-10-16T11:00:00.000Z'
    });
    getRemittance.mockReset();
    getRemittance.mockResolvedValueOnce(validated).mockResolvedValue(exported);
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });
    expect(button('Renvoyer les prénotifications')).toBeInTheDocument();

    await clickAndConfirm(user, 'Produire le fichier');

    await waitFor(() => expect(exportRemittance).toHaveBeenCalledWith(TENANT_ID, REMITTANCE_ID, 'PRL-2026-0001.csv'));
    expect(saveBlob).toHaveBeenCalledWith(blob, 'PRL-2026-0001.csv');
    expect(await screen.findByText(WARNING_TEXT)).toBeInTheDocument();
  });

  it('EXPORTÉE : bandeau, nouveau téléchargement, marquage déposée, pas de Retirer', async () => {
    const user = userEvent.setup();
    const exported = makeRemittance({
      status: 'EXPORTED',
      exportCount: 1,
      firstExportedAt: '2026-10-16T11:00:00.000Z'
    });
    const submitted = makeRemittance({ status: 'SUBMITTED', submittedAt: '2026-10-17T08:00:00.000Z' });
    submitRemittance.mockResolvedValue(submitted);
    getRemittance.mockReset();
    getRemittance.mockResolvedValueOnce(exported).mockResolvedValue(submitted);
    mount();

    expect(await screen.findByText(WARNING_TEXT)).toBeInTheDocument();
    expect(button('Télécharger à nouveau le fichier')).toBeInTheDocument();
    expect(button('Renvoyer les prénotifications')).toBeInTheDocument();
    expect(button('Annuler la remise')).toBeInTheDocument();
    expect(button('Retirer')).not.toBeInTheDocument();

    await clickAndConfirm(user, 'Marquer comme déposée à la banque');
    await waitFor(() => expect(submitRemittance).toHaveBeenCalledWith(TENANT_ID, REMITTANCE_ID));
    expect(await screen.findByText(/Remise déposée à la banque le 17\/10\/2026/)).toBeInTheDocument();
    expect(screen.queryByText(WARNING_TEXT)).not.toBeInTheDocument();
    expect(button('Télécharger à nouveau le fichier')).toBeInTheDocument();
    expect(button('Annuler la remise')).not.toBeInTheDocument();
  });

  it('ANNULÉE : affiche le motif et aucune action', async () => {
    getRemittance.mockResolvedValue(
      makeRemittance({
        status: 'CANCELED',
        canceledAt: '2026-10-17T08:00:00.000Z',
        cancellationReason: 'Erreur de période'
      })
    );
    mount();

    expect(await screen.findByText(/Remise annulée le 17\/10\/2026/)).toBeInTheDocument();
    expect(screen.getAllByText('Erreur de période').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renvoie les prénotifications après confirmation et résume le résultat', async () => {
    const user = userEvent.setup();
    getRemittance.mockResolvedValue(makeRemittance({ status: 'VALIDATED' }));
    resendPrenotifications.mockResolvedValue({
      remittance: makeRemittance({ status: 'VALIDATED' }),
      prenotifications: { ...emptyPrenotifications, sent: 2 }
    });
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    await clickAndConfirm(user, 'Renvoyer les prénotifications');

    await waitFor(() => expect(resendPrenotifications).toHaveBeenCalledWith(TENANT_ID, REMITTANCE_ID));
    expect(await screen.findByText(/Envoyées : 2 · Sans e-mail : 0/)).toBeInTheDocument();
  });

  it('retire une ligne avec un motif facultatif', async () => {
    const user = userEvent.setup();
    const after = makeRemittance({
      lineCount: 1,
      totalAmount: 100000,
      lines: [
        makeLine({ status: 'CANCELED', cancellationReason: 'Locataire parti' }),
        makeLine({ id: 'l-2', lineNumber: 2, reference: 'PRL-2026-0001-002', amount: 100000 })
      ]
    });
    cancelRemittanceLine.mockResolvedValue(after);
    getRemittance.mockReset();
    getRemittance.mockResolvedValueOnce(makeRemittance()).mockResolvedValue(after);
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    await user.click(screen.getAllByRole('button', { name: 'Retirer' })[0]);
    const dialog = await screen.findByRole('dialog');
    // Motif facultatif : le bouton est actif sans saisie.
    expect(within(dialog).getByRole('button', { name: 'Retirer' })).toBeEnabled();
    await user.type(within(dialog).getByRole('textbox'), 'Locataire parti');
    await user.click(within(dialog).getByRole('button', { name: 'Retirer' }));

    await waitFor(() =>
      expect(cancelRemittanceLine).toHaveBeenCalledWith(TENANT_ID, REMITTANCE_ID, 'l-1', 'Locataire parti')
    );
    expect((await screen.findAllByText('Locataire parti')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: 'Retirer' })).toHaveLength(1);
  });

  it('retire sans motif quand le champ reste vide (corps sans motif)', async () => {
    const user = userEvent.setup();
    cancelRemittanceLine.mockResolvedValue(makeRemittance());
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    await user.click(screen.getAllByRole('button', { name: 'Retirer' })[1]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Retirer' }));

    await waitFor(() => expect(cancelRemittanceLine).toHaveBeenCalledWith(TENANT_ID, REMITTANCE_ID, 'l-2', undefined));
  });

  it('VALIDÉE : la dernière ligne active ne se retire pas', async () => {
    getRemittance.mockResolvedValue(
      makeRemittance({
        status: 'VALIDATED',
        lineCount: 1,
        lines: [makeLine(), makeLine({ id: 'l-2', lineNumber: 2, status: 'CANCELED', cancellationReason: 'Retirée' })]
      })
    );
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    expect(screen.getByRole('button', { name: 'Retirer' })).toBeDisabled();
  });

  it("annule la remise : le motif est obligatoire, puis l'appel part avec le motif", async () => {
    const user = userEvent.setup();
    const canceled = makeRemittance({
      status: 'CANCELED',
      canceledAt: '2026-10-17T08:00:00.000Z',
      cancellationReason: 'Doublon'
    });
    cancelRemittance.mockResolvedValue(canceled);
    getRemittance.mockReset();
    getRemittance.mockResolvedValueOnce(makeRemittance()).mockResolvedValue(canceled);
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    await user.click(screen.getByRole('button', { name: 'Annuler la remise' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Annuler la remise' });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByRole('textbox'), 'Doublon');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(cancelRemittance).toHaveBeenCalledWith(TENANT_ID, REMITTANCE_ID, 'Doublon'));
    expect(await screen.findByText(/Remise annulée le 17\/10\/2026/)).toBeInTheDocument();
  });

  it('actualise : affiche les mandats non retenus avec leur raison', async () => {
    const user = userEvent.setup();
    refreshRemittance.mockResolvedValue({
      remittance: makeRemittance(),
      skipped: [
        {
          mandateId: 'm-7',
          mandateReference: 'MDT-2026-0007',
          leaseNumber: 'BAIL-007',
          debtorName: 'Issa Bamba',
          reason: 'COLLECTION_DAY_LATER'
        },
        {
          mandateId: 'm-8',
          mandateReference: 'MDT-2026-0008',
          leaseNumber: null,
          debtorName: null,
          reason: 'ALREADY_IN_REMITTANCE'
        }
      ]
    });
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });
    expect(screen.queryByText(/Mandats non retenus/)).not.toBeInTheDocument();

    await clickAndConfirm(user, 'Actualiser');

    await waitFor(() => expect(refreshRemittance).toHaveBeenCalledWith(TENANT_ID, REMITTANCE_ID));
    expect(await screen.findByText('Mandats non retenus : 2')).toBeInTheDocument();
    expect(screen.getByText(/MDT-2026-0007/)).toBeInTheDocument();
    expect(screen.getByText(/Jour de collecte plus tard dans le mois/)).toBeInTheDocument();
    expect(screen.getByText(/Échéance déjà dans une remise/)).toBeInTheDocument();
  });

  it('affiche les mandats non retenus transmis par la création (état de navigation)', async () => {
    mount({
      skipped: [
        {
          mandateId: 'm-9',
          mandateReference: 'MDT-2026-0009',
          leaseNumber: 'BAIL-009',
          debtorName: 'Fatou Koné',
          reason: 'NO_INSTALLMENT'
        }
      ]
    });

    expect(await screen.findByText('Mandats non retenus : 1')).toBeInTheDocument();
    expect(screen.getByText(/Aucune échéance pour ce mois/)).toBeInTheDocument();
  });

  it("affiche l'erreur de l'API d'une action sans changer l'écran", async () => {
    const user = userEvent.setup();
    validateRemittance.mockRejectedValue({
      response: {
        status: 409,
        data: { message: 'Les montants ont changé depuis la préparation : actualisez la remise.' }
      }
    });
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    await clickAndConfirm(user, 'Valider la remise');

    expect(await screen.findByText(/Les montants ont changé depuis la préparation/)).toBeInTheDocument();
    // L'écran reste en brouillon, bouton de nouveau disponible une fois l'action terminée.
    await waitFor(() => expect(screen.getByText('Valider la remise')).toBeInTheDocument());
  });
});
