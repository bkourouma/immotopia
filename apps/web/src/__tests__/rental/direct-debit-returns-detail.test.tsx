import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DirectDebitRemittanceDetail } from '../../pages/rental/DirectDebitRemittanceDetail';
import { makeLine, makeRemittance, REMITTANCE_ID, TENANT_ID } from './direct-debit-remittances-fixtures';

/**
 * Spec 042, P3 — détail d'une remise, retour banque (§8.3, §8.4, §8.10) et
 * retours de recette (§8.12) : constats, résumé, colonnes, mandats non retenus
 * en brouillon, message de téléchargement, destinataire des avis.
 */

const getRemittance = vi.fn();
const exportRemittance = vi.fn();
const settleRemittanceLine = vi.fn();
const rejectRemittanceLine = vi.fn();
const settleAllRemittanceLines = vi.fn();
const saveBlob = vi.fn();

vi.mock('../../services/direct-debit-service', () => ({
  getRemittance: (...a: unknown[]) => getRemittance(...a),
  refreshRemittance: vi.fn(),
  validateRemittance: vi.fn(),
  resendPrenotifications: vi.fn(),
  exportRemittance: (...a: unknown[]) => exportRemittance(...a),
  submitRemittance: vi.fn(),
  cancelRemittance: vi.fn(),
  cancelRemittanceLine: vi.fn(),
  settleRemittanceLine: (...a: unknown[]) => settleRemittanceLine(...a),
  rejectRemittanceLine: (...a: unknown[]) => rejectRemittanceLine(...a),
  settleAllRemittanceLines: (...a: unknown[]) => settleAllRemittanceLines(...a)
}));

vi.mock('../../utils/save-blob', () => ({
  saveBlob: (...a: unknown[]) => saveBlob(...a),
  filenameFromDisposition: (_header: unknown, fallback: string) => fallback
}));

configure({ asyncUtilTimeout: 8000 });

function mount(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[`/tenant/${TENANT_ID}/rental/direct-debit/remittances/${REMITTANCE_ID}`]}>
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

/** Avis tous envoyés : aucune relecture automatique (3 s) ne vient perturber les tests. */
const SENT_NOTICES = {
  pending: 0,
  sent: 1,
  noEmail: 0,
  disabled: 0,
  failed: 0,
  recipients: { account: 1, contact: 0, none: 0 }
};

const pendingLine = makeLine({ id: 'l-1', lineNumber: 1, reference: 'PRL-2026-0001-001' });
const settledLine = makeLine({
  id: 'l-2',
  lineNumber: 2,
  reference: 'PRL-2026-0001-002',
  status: 'SETTLED',
  settledAt: '2026-11-05',
  returnSource: 'MANUAL',
  paymentId: 'pay-9',
  prenotificationStatus: 'SENT',
  debtor: { id: 'client-2', displayName: 'Moussa Diallo' }
});
const rejectedLine = makeLine({
  id: 'l-3',
  lineNumber: 3,
  reference: 'PRL-2026-0001-003',
  status: 'REJECTED',
  rejectedAt: '2026-11-06',
  rejectionCode: 'AC04',
  rejectionReason: 'Compte clôturé',
  rejectFeeAmount: 5000,
  returnSource: 'IMPORT',
  prenotificationStatus: 'SENT',
  debtor: { id: 'client-3', displayName: 'Fatou Koné' }
});

function exported(overrides: Record<string, unknown> = {}) {
  return makeRemittance({
    status: 'EXPORTED',
    exportCount: 1,
    firstExportedAt: '2026-10-30T09:00:00.000Z',
    returnState: 'PARTIAL',
    returnSummary: { pending: 1, settled: 1, rejected: 1, settledAmount: 150000, rejectedAmount: 150000 },
    prenotificationSummary: SENT_NOTICES,
    lineCount: 3,
    totalAmount: 450000,
    lines: [pendingLine, settledLine, rejectedLine],
    ...overrides
  });
}

/** La ligne `PENDING` seule : le constat de règlement et de rejet y sont proposés. */
function exportedPendingOnly(overrides: Record<string, unknown> = {}) {
  return makeRemittance({
    status: 'EXPORTED',
    exportCount: 1,
    returnState: 'AWAITING',
    returnSummary: { pending: 1, settled: 0, rejected: 0, settledAmount: 0, rejectedAmount: 0 },
    prenotificationSummary: SENT_NOTICES,
    lineCount: 1,
    lines: [pendingLine],
    ...overrides
  });
}

const buttons = (name: string | RegExp) => screen.queryAllByRole('button', { name });

beforeEach(() => {
  vi.clearAllMocks();
  // Seule la date est simulée : les minuteries de React Query restent réelles.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 10, 9, 0, 0) });
  getRemittance.mockResolvedValue(exported());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DirectDebitRemittanceDetail — retour banque (P3)', () => {
  it("affiche le résumé du retour, l'état et les colonnes de la ligne", async () => {
    mount();

    expect(await screen.findByText('Retour de la banque : Retour partiel')).toBeInTheDocument();
    const summary = screen.getByText(/En attente : 1 · Réglées : 1/);
    expect(summary).toHaveTextContent(/Rejetées : 1/);
    expect(summary.textContent).toMatch(/150\s?000/);
    expect(summary.closest('.ant-alert')).toHaveClass('ant-alert-warning');

    const settledRow = screen.getByText('PRL-2026-0001-002').closest('tr') as HTMLElement;
    expect(within(settledRow).getByText('Réglée')).toBeInTheDocument();
    expect(within(settledRow).getByText('05/11/2026')).toBeInTheDocument();
    expect(within(settledRow).getByRole('link', { name: 'Voir le paiement' })).toHaveAttribute(
      'href',
      `/tenant/${TENANT_ID}/rental/payments/pay-9`
    );

    const rejectedRow = screen.getByText('PRL-2026-0001-003').closest('tr') as HTMLElement;
    expect(within(rejectedRow).getByText('Rejetée')).toBeInTheDocument();
    expect(within(rejectedRow).getByText('AC04')).toBeInTheDocument();
    expect(within(rejectedRow).getByText('Compte clôturé')).toBeInTheDocument();
    expect(within(rejectedRow).getByText('06/11/2026')).toBeInTheDocument();
    expect(within(rejectedRow).getByText(/5\s?000/)).toBeInTheDocument();
    expect(within(rejectedRow).queryByRole('link', { name: 'Voir le paiement' })).not.toBeInTheDocument();
  });

  it('un retour complet est vert ; avant le dépôt aucune ligne de retour ne s’affiche', async () => {
    getRemittance.mockResolvedValue(
      exported({
        returnState: 'COMPLETE',
        lines: [settledLine, rejectedLine],
        returnSummary: { pending: 0, settled: 2, rejected: 1, settledAmount: 300000, rejectedAmount: 150000 }
      })
    );
    mount();
    const title = await screen.findByText('Retour de la banque : Retour complet');
    expect(title.closest('.ant-alert')).toHaveClass('ant-alert-success');
    // Plus aucune ligne en attente : « Tout constater réglé » est inactif.
    expect(buttons('Tout constater réglé')[0]).toBeDisabled();
  });

  it("n'affiche aucun résumé ni constat sur une remise validée", async () => {
    getRemittance.mockResolvedValue(makeRemittance({ status: 'VALIDATED' }));
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });
    expect(screen.queryByText(/Retour de la banque :/)).not.toBeInTheDocument();
    expect(buttons('Constater le règlement')).toHaveLength(0);
    expect(buttons('Constater le rejet')).toHaveLength(0);
    expect(buttons('Tout constater réglé')).toHaveLength(0);
  });

  it('propose les constats selon le statut de la ligne (remise déposée comprise)', async () => {
    getRemittance.mockResolvedValue(exported({ status: 'SUBMITTED', submittedAt: '2026-10-31T09:00:00.000Z' }));
    mount();
    await screen.findByText('PRL-2026-0001-001');

    const pendingRow = screen.getByText('PRL-2026-0001-001').closest('tr') as HTMLElement;
    expect(within(pendingRow).getByRole('button', { name: 'Constater le règlement' })).toBeInTheDocument();
    expect(within(pendingRow).getByRole('button', { name: 'Constater le rejet' })).toBeInTheDocument();

    const settledRow = screen.getByText('PRL-2026-0001-002').closest('tr') as HTMLElement;
    expect(within(settledRow).getByRole('button', { name: 'Constater un rejet tardif' })).toBeInTheDocument();
    expect(within(settledRow).queryByRole('button', { name: 'Constater le rejet' })).not.toBeInTheDocument();

    const rejectedRow = screen.getByText('PRL-2026-0001-003').closest('tr') as HTMLElement;
    expect(within(rejectedRow).queryAllByRole('button')).toHaveLength(0);
  });

  it('constate un règlement : date de valeur par défaut = date de prélèvement', async () => {
    const user = userEvent.setup();
    const settledResult = exportedPendingOnly({
      returnState: 'COMPLETE',
      returnSummary: { pending: 0, settled: 1, rejected: 0, settledAmount: 150000, rejectedAmount: 0 },
      lines: [{ ...pendingLine, status: 'SETTLED', settledAt: '2026-11-05', paymentId: 'pay-1' }]
    });
    // La relecture qui suit le constat renvoie l'état à jour.
    getRemittance.mockResolvedValueOnce(exportedPendingOnly()).mockResolvedValue(settledResult);
    settleRemittanceLine.mockResolvedValue(settledResult);
    mount();
    await user.click(await screen.findByRole('button', { name: 'Constater le règlement' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByDisplayValue('05/11/2026')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Constater le règlement' }));

    await waitFor(() =>
      expect(settleRemittanceLine).toHaveBeenCalledWith(TENANT_ID, REMITTANCE_ID, 'l-1', { settledAt: '2026-11-05' })
    );
    expect(await screen.findByText('Règlement constaté')).toBeInTheDocument();
    expect(await screen.findByText('Retour de la banque : Retour complet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir le paiement' })).toHaveAttribute(
      'href',
      `/tenant/${TENANT_ID}/rental/payments/pay-1`
    );
  });

  it('borne la date : une date de prélèvement à venir interdit le constat', async () => {
    const user = userEvent.setup();
    // La date de prélèvement (05/11) n'est pas encore passée au 01/11.
    vi.setSystemTime(new Date(2026, 10, 1, 9, 0, 0));
    getRemittance.mockResolvedValue(exportedPendingOnly());
    mount();
    await user.click(await screen.findByRole('button', { name: 'Constater le règlement' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText("La date de prélèvement n'est pas encore passée : aucun constat n'est possible.")
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Constater le règlement' })).toBeDisabled();
    expect(settleRemittanceLine).not.toHaveBeenCalled();
  });

  it("affiche l'erreur de l'API dans la fenêtre et relit la remise", async () => {
    const user = userEvent.setup();
    getRemittance.mockResolvedValue(exportedPendingOnly());
    settleRemittanceLine.mockRejectedValue({
      response: { status: 409, data: { message: "Cette ligne vient d'être traitée : rechargez la page." } }
    });
    mount();
    await user.click(await screen.findByRole('button', { name: 'Constater le règlement' }));
    const dialog = await screen.findByRole('dialog');
    const before = getRemittance.mock.calls.length;

    await user.click(within(dialog).getByRole('button', { name: 'Constater le règlement' }));

    expect(await within(dialog).findByText(/vient d'être traitée/)).toBeInTheDocument();
    await waitFor(() => expect(getRemittance.mock.calls.length).toBeGreaterThan(before));
    // La fenêtre reste ouverte pour corriger ou réessayer.
    expect(within(dialog).getByText(/vient d'être traitée/)).toBeInTheDocument();
  });

  it('constate un rejet : code ou motif obligatoire, avertissement sur les frais et la suspension', async () => {
    const user = userEvent.setup();
    getRemittance.mockResolvedValue(exportedPendingOnly());
    rejectRemittanceLine.mockResolvedValue(
      exportedPendingOnly({
        returnState: 'COMPLETE',
        returnSummary: { pending: 0, settled: 0, rejected: 1, settledAmount: 0, rejectedAmount: 150000 },
        lines: [{ ...pendingLine, status: 'REJECTED', rejectedAt: '2026-11-05', rejectionCode: 'AC04' }]
      })
    );
    mount();
    await user.click(await screen.findByRole('button', { name: 'Constater le rejet' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/frais de rejet peuvent être refacturés/)).toBeInTheDocument();
    expect(within(dialog).getByText(/le mandat est suspendu automatiquement après/i)).toBeInTheDocument();
    expect(within(dialog).queryByText(/encaissement enregistré/)).not.toBeInTheDocument();
    const submit = within(dialog).getByRole('button', { name: 'Constater le rejet' });
    expect(submit).toBeDisabled();
    expect(within(dialog).getByDisplayValue('05/11/2026')).toBeInTheDocument();

    // Un code mal formé reste refusé.
    await user.type(within(dialog).getByRole('textbox', { name: 'Code de rejet' }), 'AC 04');
    expect(submit).toBeDisabled();
    expect(within(dialog).getByText(/Lettres, chiffres, tiret/)).toBeInTheDocument();

    await user.clear(within(dialog).getByRole('textbox', { name: 'Code de rejet' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Code de rejet' }), 'AC04');
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() =>
      expect(rejectRemittanceLine).toHaveBeenCalledWith(TENANT_ID, REMITTANCE_ID, 'l-1', {
        rejectedAt: '2026-11-05',
        code: 'AC04'
      })
    );
    expect(await screen.findByText('Rejet constaté')).toBeInTheDocument();
  });

  it('un motif seul suffit pour constater un rejet', async () => {
    const user = userEvent.setup();
    getRemittance.mockResolvedValue(exportedPendingOnly());
    rejectRemittanceLine.mockResolvedValue(exportedPendingOnly());
    mount();
    await user.click(await screen.findByRole('button', { name: 'Constater le rejet' }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByRole('textbox', { name: 'Motif du rejet' }), 'Provision insuffisante');
    await user.click(within(dialog).getByRole('button', { name: 'Constater le rejet' }));

    await waitFor(() =>
      expect(rejectRemittanceLine).toHaveBeenCalledWith(TENANT_ID, REMITTANCE_ID, 'l-1', {
        rejectedAt: '2026-11-05',
        reason: 'Provision insuffisante'
      })
    );
  });

  it('rejet avec impact connu : frais exacts et suspension du mandat, sans texte général', async () => {
    const user = userEvent.setup();
    getRemittance.mockResolvedValue(
      exportedPendingOnly({ lines: [{ ...pendingLine, rejectionImpact: { fee: 5000, willSuspend: true } }] })
    );
    mount();
    await user.click(await screen.findByRole('button', { name: 'Constater le rejet' }));
    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).getByText(/Des frais de rejet de .*5.*000.* seront refacturés au débiteur\./)
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Ce rejet suspendra le mandat MDT-.* \(rejets consécutifs\)\./)
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/peuvent être refacturés/)).not.toBeInTheDocument();
  });

  it('rejet sans frais ni suspension : aucune des deux phrases, ni le texte général', async () => {
    const user = userEvent.setup();
    getRemittance.mockResolvedValue(
      exportedPendingOnly({ lines: [{ ...pendingLine, rejectionImpact: { fee: 0, willSuspend: false } }] })
    );
    mount();
    await user.click(await screen.findByRole('button', { name: 'Constater le rejet' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).queryByText(/Des frais de rejet/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Ce rejet suspendra/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/peuvent être refacturés/)).not.toBeInTheDocument();
  });

  it('un constat relit aussi les paiements, les échéances et les baux', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    getRemittance.mockResolvedValue(exportedPendingOnly());
    settleRemittanceLine.mockResolvedValue(exportedPendingOnly());
    mount(queryClient);
    await user.click(await screen.findByRole('button', { name: 'Constater le règlement' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Constater le règlement' }));

    await waitFor(() => expect(settleRemittanceLine).toHaveBeenCalled());
    const seen = () => spy.mock.calls.map(call => JSON.stringify((call[0] as { queryKey: unknown[] }).queryKey));
    await waitFor(() => {
      expect(seen()).toContain(JSON.stringify(['payments', TENANT_ID]));
      expect(seen()).toContain(JSON.stringify(['installments', TENANT_ID]));
      expect(seen()).toContain(JSON.stringify(['leases', TENANT_ID]));
    });
  });

  it("rejet tardif d'une ligne réglée : avertit que l'encaissement et la quittance seront annulés", async () => {
    const user = userEvent.setup();
    rejectRemittanceLine.mockResolvedValue(exported());
    mount();
    const settledRow = (await screen.findByText('PRL-2026-0001-002')).closest('tr') as HTMLElement;
    await user.click(within(settledRow).getByRole('button', { name: 'Constater un rejet tardif' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        "Cette ligne est déjà constatée réglée : l'encaissement enregistré et sa quittance seront annulés."
      )
    ).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: 'Code de rejet' }), 'MD06');
    await user.click(within(dialog).getByRole('button', { name: 'Constater le rejet tardif' }));

    await waitFor(() =>
      expect(rejectRemittanceLine).toHaveBeenCalledWith(TENANT_ID, REMITTANCE_ID, 'l-2', {
        rejectedAt: '2026-11-05',
        code: 'MD06'
      })
    );
  });

  it('« Tout constater réglé » : confirmation, date unique, puis résultat avec les échecs', async () => {
    const user = userEvent.setup();
    const second = makeLine({ id: 'l-9', lineNumber: 2, reference: 'PRL-2026-0001-009' });
    getRemittance.mockResolvedValue(exportedPendingOnly({ lines: [pendingLine, second], lineCount: 2 }));
    settleAllRemittanceLines.mockResolvedValue({
      remittance: exportedPendingOnly({ lines: [{ ...pendingLine, status: 'SETTLED' }, second], lineCount: 2 }),
      settled: 1,
      failed: [{ lineId: 'l-9', reference: 'PRL-2026-0001-009', error: 'Aucune échéance à imputer.' }]
    });
    mount();
    await user.click(await screen.findByRole('button', { name: 'Tout constater réglé' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Constater réglées les 2 lignes encore en attente/)).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('05/11/2026')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Tout constater réglé' }));

    await waitFor(() =>
      expect(settleAllRemittanceLines).toHaveBeenCalledWith(TENANT_ID, REMITTANCE_ID, { settledAt: '2026-11-05' })
    );
    expect(await within(dialog).findByText('1 ligne constatée réglée.')).toBeInTheDocument();
    expect(within(dialog).getByText(/1 ligne n'a pas pu être constatée/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Aucune échéance à imputer\./)).toBeInTheDocument();
    expect(within(dialog).getByText('PRL-2026-0001-009')).toBeInTheDocument();
  });
});

describe('DirectDebitRemittanceDetail — retours de recette (§8.12)', () => {
  it('affiche en permanence les mandats non retenus d’un brouillon, avec la raison traduite', async () => {
    const user = userEvent.setup();
    getRemittance.mockResolvedValue(
      makeRemittance({
        skipped: [
          {
            mandateId: 'm-7',
            mandateReference: 'MDT-2026-0007',
            leaseNumber: 'BAIL-007',
            debtorName: 'Awa Traoré',
            reason: 'MANDATE_NOT_ACTIVE'
          }
        ]
      })
    );
    mount();

    const header = await screen.findByText('Mandats non retenus (1)');
    await user.click(header);
    const item = await screen.findByText(/MDT-2026-0007/);
    expect(item.closest('li')).toHaveTextContent('Mandat non actif (brouillon ou suspendu)');
    expect(item.closest('li')).toHaveTextContent('BAIL-007');
  });

  it('ne montre pas la section sans mandat non retenu, ni hors brouillon', async () => {
    getRemittance.mockResolvedValue(makeRemittance({ skipped: [] }));
    mount();
    await screen.findByRole('heading', { name: 'PRL-2026-0001' });
    expect(screen.queryByText(/Mandats non retenus/)).not.toBeInTheDocument();
  });

  it('« Produire le fichier » : le message de succès nomme le fichier', async () => {
    const user = userEvent.setup();
    exportRemittance.mockResolvedValue({ blob: new Blob(['csv']), filename: 'PRL-2026-0001.csv' });
    getRemittance.mockResolvedValue(makeRemittance({ status: 'VALIDATED' }));
    mount();
    await user.click(await screen.findByRole('button', { name: 'Produire le fichier' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmer' }));

    expect(await screen.findByText('Fichier PRL-2026-0001.csv téléchargé.')).toBeInTheDocument();
    expect(saveBlob).toHaveBeenCalled();
  });

  it('« Télécharger à nouveau » nomme aussi le fichier, et une erreur est affichée', async () => {
    const user = userEvent.setup();
    getRemittance.mockResolvedValue(exportedPendingOnly());
    exportRemittance.mockResolvedValueOnce({ blob: new Blob(['csv']), filename: 'PRL-2026-0001.csv' });
    mount();
    await user.click(await screen.findByRole('button', { name: /Télécharger à nouveau le fichier/ }));
    await user.click(await screen.findByRole('button', { name: 'Confirmer' }));
    expect(await screen.findByText('Fichier PRL-2026-0001.csv téléchargé.')).toBeInTheDocument();

    exportRemittance.mockRejectedValueOnce({ response: { status: 409, data: { message: 'Mandat révoqué.' } } });
    await user.click(await screen.findByRole('button', { name: /Télécharger à nouveau le fichier/ }));
    await user.click(await screen.findByRole('button', { name: 'Confirmer' }));
    expect(await screen.findByText('Mandat révoqué.')).toBeInTheDocument();
  });

  it("montre l'adresse masquée de l'avis et sa provenance, y compris l'adresse prévue", async () => {
    getRemittance.mockResolvedValue(
      makeRemittance({
        status: 'VALIDATED',
        lines: [
          makeLine({
            id: 'l-1',
            reference: 'PRL-2026-0001-001',
            prenotificationRecipient: { masked: 'a•••@ex•••.ci', source: 'ACCOUNT' }
          }),
          makeLine({
            id: 'l-2',
            reference: 'PRL-2026-0001-002',
            prenotificationStatus: 'SENT',
            prenotificationRecipient: { masked: 'm•••@ma•••.ci', source: 'CONTACT' }
          }),
          makeLine({ id: 'l-3', reference: 'PRL-2026-0001-003', prenotificationRecipient: null })
        ],
        prenotificationSummary: {
          pending: 2,
          sent: 1,
          noEmail: 0,
          disabled: 0,
          failed: 0,
          recipients: { account: 1, contact: 1, none: 1 }
        }
      })
    );
    mount();
    await screen.findByText('PRL-2026-0001-001');

    const accountRow = screen.getByText('PRL-2026-0001-001').closest('tr') as HTMLElement;
    const mask = within(accountRow).getByText('a•••@ex•••.ci');
    expect(mask.closest('bdi')).toHaveAttribute('dir', 'ltr');
    expect(accountRow).toHaveTextContent('compte portail');

    const contactRow = screen.getByText('PRL-2026-0001-002').closest('tr') as HTMLElement;
    expect(within(contactRow).getByText('m•••@ma•••.ci')).toBeInTheDocument();
    expect(contactRow).toHaveTextContent('fiche contact');

    const noneRow = screen.getByText('PRL-2026-0001-003').closest('tr') as HTMLElement;
    expect(within(noneRow).getByText('aucune adresse')).toBeInTheDocument();

    expect(
      screen.getByText('Adresses des avis : compte portail : 1 · fiche contact : 1 · sans adresse : 1')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Les avis partent à l'adresse du compte portail du locataire quand il en a un, sinon à celle de sa fiche contact."
      )
    ).toBeInTheDocument();
  });
});
