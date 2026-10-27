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
 * confirmations, résumé des avis de prélèvement (persistant, relu pendant l'envoi),
 * retrait de ligne, annulation selon le statut, mandats non retenus et non actifs,
 * IBAN masqué seulement.
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

  it('valide après confirmation (avis de prélèvement par e-mail) puis relit la remise et résume les avis', async () => {
    const user = userEvent.setup();
    const validated = makeRemittance({
      status: 'VALIDATED',
      validatedAt: '2026-10-16T10:00:00.000Z',
      prenotificationSummary: { pending: 0, sent: 1, noEmail: 1, disabled: 0, failed: 0 }
    });
    validateRemittance.mockResolvedValue({
      remittance: validated,
      prenotifications: { pending: 2, sent: 0, noEmail: 0, disabled: 0, failed: 0 }
    });
    getRemittance.mockResolvedValueOnce(makeRemittance()).mockResolvedValue(validated);
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    await user.click(screen.getByRole('button', { name: 'Valider la remise' }));
    expect(await screen.findByText(/recevront un avis de prélèvement par e-mail/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(validateRemittance).toHaveBeenCalledWith(TENANT_ID, REMITTANCE_ID));
    // Le résumé vient de la remise relue, pas de la réponse de la validation.
    const summary = await screen.findByText(
      'Envoyés : 1 · En cours : 0 · Sans e-mail : 1 · Désactivés : 0 · En échec : 0'
    );
    expect(summary.closest('.ant-alert')).toHaveClass('ant-alert-warning');
    expect(getRemittance.mock.calls.length).toBeGreaterThanOrEqual(2);
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
    expect(button('Renvoyer les avis de prélèvement')).toBeInTheDocument();

    await clickAndConfirm(user, 'Produire le fichier');

    await waitFor(() => expect(exportRemittance).toHaveBeenCalledWith(TENANT_ID, REMITTANCE_ID, 'PRL-2026-0001.csv'));
    expect(saveBlob).toHaveBeenCalledWith(blob, 'PRL-2026-0001.csv');
    expect(await screen.findByText(WARNING_TEXT)).toBeInTheDocument();
  });

  it('EXPORTÉE : bandeau, nouveau téléchargement, marquage déposée, pas de Retirer', async () => {
    const user = userEvent.setup();
    // Avis tous envoyés : pas de relecture automatique (le test ne porte pas sur elle, et l'écran
    // rendu avec ses colonnes de retour est lent à interroger).
    const sentNotices = {
      ...emptyPrenotifications,
      sent: 2,
      recipients: { account: 2, contact: 0, none: 0 }
    };
    const exported = makeRemittance({
      status: 'EXPORTED',
      exportCount: 1,
      firstExportedAt: '2026-10-16T11:00:00.000Z',
      prenotificationSummary: sentNotices
    });
    const submitted = makeRemittance({
      status: 'SUBMITTED',
      submittedAt: '2026-10-17T08:00:00.000Z',
      prenotificationSummary: sentNotices
    });
    submitRemittance.mockResolvedValue(submitted);
    getRemittance.mockReset();
    getRemittance.mockResolvedValueOnce(exported).mockResolvedValue(submitted);
    mount();

    expect(await screen.findByText(WARNING_TEXT)).toBeInTheDocument();
    expect(button('Télécharger à nouveau le fichier')).toBeInTheDocument();
    expect(button('Renvoyer les avis de prélèvement')).toBeInTheDocument();
    expect(button('Annuler la remise')).toBeInTheDocument();
    expect(button('Retirer')).not.toBeInTheDocument();

    await clickAndConfirm(user, 'Marquer comme déposée à la banque');
    await waitFor(() => expect(submitRemittance).toHaveBeenCalledWith(TENANT_ID, REMITTANCE_ID));
    expect(await screen.findByText(/Remise déposée à la banque le 17\/10\/2026/)).toBeInTheDocument();
    expect(screen.queryByText(WARNING_TEXT)).not.toBeInTheDocument();
    expect(button('Télécharger à nouveau le fichier')).toBeInTheDocument();
    expect(button('Annuler la remise')).not.toBeInTheDocument();
  });

  it('VALIDÉE : la confirmation de production prévient du retrait impossible et des avis non reçus', async () => {
    const user = userEvent.setup();
    getRemittance.mockResolvedValue(
      makeRemittance({
        status: 'VALIDATED',
        prenotificationSummary: { ...emptyPrenotifications, sent: 1, failed: 1 }
      })
    );
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    await user.click(screen.getByRole('button', { name: 'Produire le fichier' }));

    expect(
      await screen.findByText(
        "Une fois le fichier produit, une ligne ne peut plus être retirée : seule l'annulation de la remise reste possible."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("1 locataire n'a pas reçu l'avis de prélèvement.")).toBeInTheDocument();
  });

  it("VALIDÉE : la confirmation de production n'évoque pas d'avis manquant quand tous sont envoyés", async () => {
    const user = userEvent.setup();
    getRemittance.mockResolvedValue(
      makeRemittance({
        status: 'VALIDATED',
        prenotificationSummary: { ...emptyPrenotifications, sent: 2 }
      })
    );
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    await user.click(screen.getByRole('button', { name: 'Produire le fichier' }));

    expect(await screen.findByText(/une ligne ne peut plus être retirée/)).toBeInTheDocument();
    expect(screen.queryByText(/n'a pas reçu l'avis|n'ont pas reçu l'avis/)).not.toBeInTheDocument();
  });

  it('résumé des avis : vert quand tous sont envoyés, orange sinon, sur les remises validées, produites et déposées', async () => {
    getRemittance.mockResolvedValue(
      makeRemittance({ status: 'VALIDATED', prenotificationSummary: { ...emptyPrenotifications, sent: 2 } })
    );
    const first = mount();
    const ok = await screen.findByText(/Envoyés : 2 · En cours : 0 · Sans e-mail : 0/);
    expect(ok.closest('.ant-alert')).toHaveClass('ant-alert-success');
    first.unmount();

    getRemittance.mockResolvedValue(
      makeRemittance({
        status: 'SUBMITTED',
        submittedAt: '2026-10-17T08:00:00.000Z',
        prenotificationSummary: { ...emptyPrenotifications, sent: 1, disabled: 1 }
      })
    );
    mount();
    const warn = await screen.findByText(/Envoyés : 1 · En cours : 0 · Sans e-mail : 0 · Désactivés : 1/);
    expect(warn.closest('.ant-alert')).toHaveClass('ant-alert-warning');
  });

  it("n'affiche aucun résumé des avis sur un brouillon", async () => {
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    expect(screen.queryByText(/Envoyés :/)).not.toBeInTheDocument();
    expect(screen.queryByText('Envoi des avis en cours…')).not.toBeInTheDocument();
  });

  it("envoi en cours : le message s'affiche et la remise est relue toutes les 3 s jusqu'à la fin de l'envoi", async () => {
    getRemittance
      .mockResolvedValueOnce(
        makeRemittance({ status: 'VALIDATED', prenotificationSummary: { ...emptyPrenotifications, pending: 2 } })
      )
      .mockResolvedValue(
        makeRemittance({ status: 'VALIDATED', prenotificationSummary: { ...emptyPrenotifications, sent: 2 } })
      );
    mount();

    expect(await screen.findByText('Envoi des avis en cours…')).toBeInTheDocument();
    expect(getRemittance).toHaveBeenCalledTimes(1);

    // Relecture automatique, sans action de l'utilisateur.
    const done = await screen.findByText(/Envoyés : 2 · En cours : 0/);
    expect(done.closest('.ant-alert')).toHaveClass('ant-alert-success');
    expect(screen.queryByText('Envoi des avis en cours…')).not.toBeInTheDocument();
    expect(getRemittance).toHaveBeenCalledTimes(2);
  });

  it('marque la ligne dont le mandat est suspendu ou révoqué', async () => {
    const mandate = (status: string) => ({
      id: 'm-1',
      reference: 'MDT-2026-0001',
      ibanMasked: 'CI•• •••• •••• •••• •••• 5678',
      holderName: 'Awa Traoré',
      maxAmount: null,
      status
    });
    getRemittance.mockResolvedValue(
      makeRemittance({
        status: 'VALIDATED',
        prenotificationSummary: { ...emptyPrenotifications, sent: 2 },
        lines: [
          makeLine({ mandate: mandate('SUSPENDED') }),
          makeLine({ id: 'l-2', lineNumber: 2, reference: 'PRL-2026-0001-002', mandate: mandate('REVOKED') }),
          makeLine({
            id: 'l-3',
            lineNumber: 3,
            reference: 'PRL-2026-0001-003',
            status: 'CANCELED',
            mandate: mandate('REVOKED')
          })
        ]
      })
    );
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    expect(screen.getAllByText('Mandat suspendu')).toHaveLength(1);
    // La ligne retirée n'est plus concernée : seule la ligne active révoquée porte l'étiquette.
    expect(screen.getAllByText('Mandat révoqué')).toHaveLength(1);
  });

  it("EXPORTÉE : le nouveau téléchargement signale un mandat qui n'est plus actif", async () => {
    const user = userEvent.setup();
    getRemittance.mockResolvedValue(
      makeRemittance({
        status: 'EXPORTED',
        exportCount: 1,
        prenotificationSummary: { ...emptyPrenotifications, sent: 2 },
        lines: [
          makeLine({
            mandate: {
              id: 'm-1',
              reference: 'MDT-2026-0001',
              ibanMasked: 'CI•• •••• •••• •••• •••• 5678',
              holderName: 'Awa Traoré',
              maxAmount: null,
              status: 'SUSPENDED'
            }
          }),
          makeLine({ id: 'l-2', lineNumber: 2, reference: 'PRL-2026-0001-002' })
        ]
      })
    );
    mount();
    await screen.findByText(WARNING_TEXT);

    await user.click(screen.getByRole('button', { name: 'Télécharger à nouveau le fichier' }));

    expect(
      await screen.findByText(
        "Attention : 1 ligne a un mandat qui n'est plus actif ; le fichier contient encore ce prélèvement."
      )
    ).toBeInTheDocument();
  });

  it('EXPORTÉE : le nouveau téléchargement ne signale rien quand tous les mandats sont actifs', async () => {
    const user = userEvent.setup();
    getRemittance.mockResolvedValue(
      makeRemittance({
        status: 'EXPORTED',
        exportCount: 1,
        prenotificationSummary: { ...emptyPrenotifications, sent: 2 }
      })
    );
    mount();
    await screen.findByText(WARNING_TEXT);

    await user.click(screen.getByRole('button', { name: 'Télécharger à nouveau le fichier' }));

    expect(await screen.findByText(/Il contient les IBAN complets/)).toBeInTheDocument();
    expect(screen.queryByText(/n'est plus actif/)).not.toBeInTheDocument();
  });

  it("BROUILLON : l'annulation dit que rien n'est parti, sans case à cocher", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    await user.click(screen.getByRole('button', { name: 'Annuler la remise' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText(/Rien n'est encore parti/)).toBeInTheDocument();
    expect(within(dialog).getByText(/les échéances redeviendront disponibles/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it("VALIDÉE : l'annulation demande de prévenir les locataires qui ont reçu l'avis", async () => {
    const user = userEvent.setup();
    getRemittance.mockResolvedValue(
      makeRemittance({ status: 'VALIDATED', prenotificationSummary: { ...emptyPrenotifications, sent: 2 } })
    );
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    await user.click(screen.getByRole('button', { name: 'Annuler la remise' }));
    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).getByText(
        /Les locataires ont déjà reçu un avis de prélèvement : prévenez-les que le prélèvement n'aura pas lieu/
      )
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it("EXPORTÉE : l'annulation exige la case de vérification auprès de la banque avant d'activer le bouton", async () => {
    const user = userEvent.setup();
    const canceled = makeRemittance({
      status: 'CANCELED',
      canceledAt: '2026-10-17T08:00:00.000Z',
      cancellationReason: 'Fichier erroné'
    });
    cancelRemittance.mockResolvedValue(canceled);
    getRemittance.mockReset();
    getRemittance
      .mockResolvedValueOnce(
        makeRemittance({
          status: 'EXPORTED',
          exportCount: 3,
          prenotificationSummary: { ...emptyPrenotifications, sent: 2 }
        })
      )
      .mockResolvedValue(canceled);
    mount();
    await screen.findByText(WARNING_TEXT);

    await user.click(screen.getByRole('button', { name: 'Annuler la remise' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText(/Le fichier a déjà été produit \(3 fois\)/)).toBeInTheDocument();
    expect(within(dialog).getByText(/annulez aussi la remise chez la banque/)).toBeInTheDocument();
    expect(within(dialog).getByText(/une nouvelle remise prélèverait une deuxième fois/)).toBeInTheDocument();

    const confirm = within(dialog).getByRole('button', { name: 'Annuler la remise' });
    const checkbox = within(dialog).getByRole('checkbox', {
      name: "J'ai vérifié que ce fichier n'a pas été chargé sur la banque, ou je l'ai annulé chez elle"
    });
    // Motif saisi mais case non cochée : le bouton reste inactif.
    await user.type(within(dialog).getByRole('textbox'), 'Fichier erroné');
    expect(confirm).toBeDisabled();

    await user.click(checkbox);
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(cancelRemittance).toHaveBeenCalledWith(TENANT_ID, REMITTANCE_ID, 'Fichier erroné'));
  });

  it("VALIDÉE : le retrait d'une ligne rappelle que le locataire a déjà reçu l'avis", async () => {
    const user = userEvent.setup();
    getRemittance.mockResolvedValue(
      makeRemittance({ status: 'VALIDATED', prenotificationSummary: { ...emptyPrenotifications, sent: 2 } })
    );
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    await user.click(screen.getAllByRole('button', { name: 'Retirer' })[0]);
    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).getByText(
        "Le locataire a déjà reçu l'avis de prélèvement : prévenez-le que ce prélèvement n'aura pas lieu."
      )
    ).toBeInTheDocument();
  });

  it("BROUILLON : le retrait d'une ligne n'ajoute pas de rappel sur l'avis", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    await user.click(screen.getAllByRole('button', { name: 'Retirer' })[0]);
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).queryByText(/déjà reçu l'avis/)).not.toBeInTheDocument();
  });

  it("pendant une action, tous les boutons d'action sont inactifs", async () => {
    const user = userEvent.setup();
    let finish: (value: unknown) => void = () => undefined;
    validateRemittance.mockReturnValue(new Promise(resolve => (finish = resolve)));
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    await clickAndConfirm(user, 'Valider la remise');

    await waitFor(() => expect(validateRemittance).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Actualiser' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler la remise' })).toBeDisabled();
    for (const retirer of screen.getAllByRole('button', { name: 'Retirer' })) expect(retirer).toBeDisabled();

    finish({ remittance: makeRemittance({ status: 'VALIDATED' }), prenotifications: emptyPrenotifications });
  });

  it("après une erreur d'action (409), la remise est relue", async () => {
    const user = userEvent.setup();
    validateRemittance.mockRejectedValue({
      response: { status: 409, data: { message: "La remise n'est plus en brouillon." } }
    });
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });
    expect(getRemittance).toHaveBeenCalledTimes(1);

    await clickAndConfirm(user, 'Valider la remise');

    expect(await screen.findByText(/La remise n'est plus en brouillon/)).toBeInTheDocument();
    await waitFor(() => expect(getRemittance.mock.calls.length).toBeGreaterThanOrEqual(2));
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

  it('renvoie les avis de prélèvement après confirmation puis relit le résumé', async () => {
    const user = userEvent.setup();
    getRemittance.mockResolvedValue(makeRemittance({ status: 'VALIDATED' }));
    resendPrenotifications.mockResolvedValue({
      remittance: makeRemittance({ status: 'VALIDATED' }),
      prenotifications: { ...emptyPrenotifications, pending: 2 }
    });
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });

    await clickAndConfirm(user, 'Renvoyer les avis de prélèvement');

    await waitFor(() => expect(resendPrenotifications).toHaveBeenCalledWith(TENANT_ID, REMITTANCE_ID));
    getRemittance.mockResolvedValue(
      makeRemittance({
        status: 'VALIDATED',
        prenotificationSummary: { ...emptyPrenotifications, sent: 2 }
      })
    );
    await waitFor(() => expect(getRemittance.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(await screen.findByText(/Envoyés : 2 · En cours : 0/)).toBeInTheDocument();
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
