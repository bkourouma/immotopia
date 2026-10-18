import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SyndicDirectDebitRemittanceDetail } from '../../pages/syndics/SyndicDirectDebitRemittanceDetail';
import { makeLine, makeRemittance } from '../rental/direct-debit-remittances-fixtures';

/**
 * Spec 042, P4 (§9.6) : détail d'une remise de copropriété — lignes (lot,
 * débiteur, appels de charges couverts), gestes de la remise, constats de la
 * banque, droits de consultation et de gestion.
 */

configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 120000 });

const TENANT = 'agence-1';
const SYNDIC = 'syn-1';
const REMITTANCE = 'r-1';

const getSyndicRemittance = vi.fn();
const refreshSyndicRemittance = vi.fn();
const validateSyndicRemittance = vi.fn();
const resendSyndicPrenotifications = vi.fn();
const exportSyndicRemittance = vi.fn();
const submitSyndicRemittance = vi.fn();
const cancelSyndicRemittance = vi.fn();
const removeSyndicRemittanceLine = vi.fn();
const settleSyndicRemittanceLine = vi.fn();
const rejectSyndicRemittanceLine = vi.fn();
const settleAllSyndicRemittanceLines = vi.fn();
const saveBlob = vi.fn();
let permissions: Set<string> | null = null;

vi.mock('../../services/syndic-direct-debit-service', () => ({
  getSyndicRemittance: (...a: unknown[]) => getSyndicRemittance(...a),
  refreshSyndicRemittance: (...a: unknown[]) => refreshSyndicRemittance(...a),
  validateSyndicRemittance: (...a: unknown[]) => validateSyndicRemittance(...a),
  resendSyndicPrenotifications: (...a: unknown[]) => resendSyndicPrenotifications(...a),
  exportSyndicRemittance: (...a: unknown[]) => exportSyndicRemittance(...a),
  submitSyndicRemittance: (...a: unknown[]) => submitSyndicRemittance(...a),
  cancelSyndicRemittance: (...a: unknown[]) => cancelSyndicRemittance(...a),
  removeSyndicRemittanceLine: (...a: unknown[]) => removeSyndicRemittanceLine(...a),
  settleSyndicRemittanceLine: (...a: unknown[]) => settleSyndicRemittanceLine(...a),
  rejectSyndicRemittanceLine: (...a: unknown[]) => rejectSyndicRemittanceLine(...a),
  settleAllSyndicRemittanceLines: (...a: unknown[]) => settleAllSyndicRemittanceLines(...a)
}));

vi.mock('../../utils/save-blob', () => ({
  saveBlob: (...a: unknown[]) => saveBlob(...a),
  filenameFromDisposition: (_disposition: unknown, fallback: string) => fallback
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));

vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set(), enabled: new Set(), permissions, ready: true })
}));

/** Avis tous envoyés : aucune relecture automatique (3 s) ne vient perturber les tests. */
const SENT_NOTICES = {
  pending: 0,
  sent: 2,
  noEmail: 0,
  disabled: 0,
  failed: 0,
  recipients: { account: 0, contact: 2, none: 0 }
};

const lineA = makeLine({
  id: 'l-1',
  lineNumber: 1,
  reference: 'PRL-2026-0001-001',
  debtor: { id: 'ct-1', displayName: 'Awa Traoré', kind: 'CONTACT' },
  lease: null,
  installment: null,
  lot: { id: 'lot-1', lotNumber: 'A01' },
  chargeCalls: [
    { id: 'cc-1', period: '2026-T3', dueDate: '2026-09-01', amount: 100000 },
    { id: 'cc-2', period: '2026-T4', dueDate: '2026-10-01', amount: 50000 }
  ],
  prenotificationStatus: 'SENT',
  prenotificationRecipient: { masked: 'a•••@ex•••.ci', source: 'CONTACT' }
});
const lineB = makeLine({
  id: 'l-2',
  lineNumber: 2,
  reference: 'PRL-2026-0001-002',
  debtor: { id: 'ct-2', displayName: 'Moussa Diallo', kind: 'CONTACT' },
  lease: null,
  installment: null,
  lot: { id: 'lot-2', lotNumber: 'B02' },
  chargeCalls: [{ id: 'cc-3', period: '2026-T4', dueDate: '2026-10-01', amount: 100000 }],
  amount: 100000,
  remainingDueAtSelection: 100000,
  prenotificationStatus: 'SENT',
  prenotificationRecipient: { masked: 'm•••@ex•••.ci', source: 'CONTACT' }
});

function syndicRemittance(overrides: Record<string, unknown> = {}) {
  return makeRemittance({
    scope: 'SYNDIC_LOT',
    syndicate: { id: SYNDIC, name: 'Résidence Les Palmiers' },
    creditor: { id: 'cr-1', label: 'Compte Résidence Les Palmiers', creditorIdentifier: 'EMT-77' },
    lineCount: 2,
    totalAmount: 250000,
    prenotificationSummary: SENT_NOTICES,
    lines: [lineA, lineB],
    ...overrides
  });
}

function exported(overrides: Record<string, unknown> = {}) {
  return syndicRemittance({
    status: 'EXPORTED',
    exportCount: 1,
    firstExportedAt: '2026-10-30T09:00:00.000Z',
    returnState: 'AWAITING',
    returnSummary: { pending: 2, settled: 0, rejected: 0, settledAmount: 0, rejectedAmount: 0 },
    ...overrides
  });
}

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[`/tenant/${TENANT}/syndics/${SYNDIC}/prelevements/remises/${REMITTANCE}`]}>
          <Routes>
            <Route
              path="/tenant/:tenantId/syndics/:syndicId/prelevements/remises/:remittanceId"
              element={<SyndicDirectDebitRemittanceDetail />}
            />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const buttons = (name: string | RegExp) => screen.queryAllByRole('button', { name });

beforeEach(() => {
  vi.clearAllMocks();
  permissions = null;
  // Seule la date est simulée : les minuteries de React Query restent réelles.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 10, 9, 0, 0) });
  getSyndicRemittance.mockResolvedValue(syndicRemittance());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SyndicDirectDebitRemittanceDetail — lignes', () => {
  it('affiche le lot, le débiteur et les appels de charges couverts de chaque ligne', async () => {
    mount();

    expect(await screen.findByRole('heading', { name: 'PRL-2026-0001' })).toBeInTheDocument();
    expect(getSyndicRemittance).toHaveBeenCalledWith(TENANT, SYNDIC, REMITTANCE);
    expect(screen.getByRole('link', { name: 'Retour aux prélèvements' })).toHaveAttribute(
      'href',
      `/tenant/${TENANT}/syndics/${SYNDIC}/prelevements`
    );
    expect(screen.getByRole('columnheader', { name: 'Lot' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Appels de charges couverts' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Bail' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Résidence Les Palmiers').length).toBeGreaterThan(0);

    const rowA = screen.getByText('PRL-2026-0001-001').closest('tr') as HTMLElement;
    expect(within(rowA).getByText('A01')).toBeInTheDocument();
    expect(within(rowA).getByText('Awa Traoré')).toBeInTheDocument();
    expect(within(rowA).getByText(/2026-T3 \(échéance 01\/09\/2026\)/)).toBeInTheDocument();
    expect(within(rowA).getByText(/2026-T4 \(échéance 01\/10\/2026\)/)).toBeInTheDocument();

    const rowB = screen.getByText('PRL-2026-0001-002').closest('tr') as HTMLElement;
    expect(within(rowB).getByText('B02')).toBeInTheDocument();
    expect(within(rowB).getByText(/2026-T4 \(échéance 01\/10\/2026\)/)).toBeInTheDocument();
  });

  it('une erreur de chargement est affichée en clair', async () => {
    getSyndicRemittance.mockRejectedValue({ response: { status: 404, data: { message: 'Remise introuvable.' } } });
    mount();
    expect(await screen.findByText('Remise introuvable.')).toBeInTheDocument();
  });
});

describe('SyndicDirectDebitRemittanceDetail — gestes de la remise', () => {
  it('brouillon : actualiser, valider (confirmé) puis retrait d’une ligne avec motif', async () => {
    const user = userEvent.setup();
    validateSyndicRemittance.mockResolvedValue({
      remittance: syndicRemittance({ status: 'VALIDATED' }),
      prenotifications: SENT_NOTICES
    });
    removeSyndicRemittanceLine.mockResolvedValue(syndicRemittance({ lineCount: 1, lines: [lineA] }));
    mount();
    await screen.findByText('PRL-2026-0001-001');

    // Retrait d'une ligne.
    const rowB = screen.getByText('PRL-2026-0001-002').closest('tr') as HTMLElement;
    await user.click(within(rowB).getByRole('button', { name: 'Retirer' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'Lot vendu');
    await user.click(within(dialog).getByRole('button', { name: 'Retirer' }));
    await waitFor(() =>
      expect(removeSyndicRemittanceLine).toHaveBeenCalledWith(TENANT, SYNDIC, REMITTANCE, 'l-2', 'Lot vendu')
    );
    expect(await screen.findByText('Ligne retirée')).toBeInTheDocument();

    // Validation.
    await user.click(buttons('Valider la remise')[0]);
    await user.click(await screen.findByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(validateSyndicRemittance).toHaveBeenCalledWith(TENANT, SYNDIC, REMITTANCE));
    expect(await screen.findByText('Remise validée')).toBeInTheDocument();
  });

  it('remise validée : renvoi des avis, production du fichier (téléchargé) et annulation avec motif', async () => {
    const user = userEvent.setup();
    getSyndicRemittance.mockResolvedValue(syndicRemittance({ status: 'VALIDATED' }));
    resendSyndicPrenotifications.mockResolvedValue({
      remittance: syndicRemittance({ status: 'VALIDATED' }),
      prenotifications: SENT_NOTICES
    });
    exportSyndicRemittance.mockResolvedValue({ blob: new Blob(['x']), filename: 'PRL-2026-0001.csv' });
    cancelSyndicRemittance.mockResolvedValue(
      syndicRemittance({ status: 'CANCELED', canceledAt: '2026-11-01T09:00:00.000Z' })
    );
    mount();
    await screen.findByText('PRL-2026-0001-001');

    await user.click(buttons('Renvoyer les avis de prélèvement')[0]);
    await user.click(await screen.findByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(resendSyndicPrenotifications).toHaveBeenCalledWith(TENANT, SYNDIC, REMITTANCE));
    expect(await screen.findByText('Avis de prélèvement renvoyés')).toBeInTheDocument();

    await user.click(buttons('Produire le fichier')[0]);
    await user.click(await screen.findByRole('button', { name: 'Confirmer' }));
    await waitFor(() =>
      expect(exportSyndicRemittance).toHaveBeenCalledWith(TENANT, SYNDIC, REMITTANCE, 'PRL-2026-0001.csv')
    );
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'PRL-2026-0001.csv');
    expect(await screen.findByText('Fichier PRL-2026-0001.csv téléchargé.')).toBeInTheDocument();

    await user.click(buttons('Annuler la remise')[0]);
    const dialog = await screen.findByRole('dialog');
    // Textes propres à la copropriété.
    expect(within(dialog).getByText(/Les copropriétaires ont déjà reçu un avis de prélèvement/)).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox'), 'Erreur de montant');
    await user.click(within(dialog).getAllByRole('button', { name: 'Annuler la remise' })[0]);
    await waitFor(() =>
      expect(cancelSyndicRemittance).toHaveBeenCalledWith(TENANT, SYNDIC, REMITTANCE, 'Erreur de montant')
    );
  });

  it('remise produite : dépôt à la banque', async () => {
    const user = userEvent.setup();
    getSyndicRemittance.mockResolvedValue(exported());
    submitSyndicRemittance.mockResolvedValue(
      exported({ status: 'SUBMITTED', submittedAt: '2026-10-31T09:00:00.000Z' })
    );
    mount();
    await screen.findByText('PRL-2026-0001-001');

    await user.click(buttons('Marquer comme déposée à la banque')[0]);
    await user.click(await screen.findByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(submitSyndicRemittance).toHaveBeenCalledWith(TENANT, SYNDIC, REMITTANCE));
  });
});

describe('SyndicDirectDebitRemittanceDetail — constats de la banque', () => {
  beforeEach(() => {
    getSyndicRemittance.mockResolvedValue(exported());
  });

  it('constate un règlement : date de valeur par défaut = date de prélèvement, texte de copropriété', async () => {
    const user = userEvent.setup();
    const settledResult = exported({
      returnState: 'PARTIAL',
      returnSummary: { pending: 1, settled: 1, rejected: 0, settledAmount: 150000, rejectedAmount: 0 },
      lines: [{ ...lineA, status: 'SETTLED', settledAt: '2026-11-05', paymentId: 'cp-1' }, lineB]
    });
    getSyndicRemittance.mockResolvedValueOnce(exported()).mockResolvedValue(settledResult);
    settleSyndicRemittanceLine.mockResolvedValue(settledResult);
    mount();
    const rowA = (await screen.findByText('PRL-2026-0001-001')).closest('tr') as HTMLElement;
    await user.click(within(rowA).getByRole('button', { name: 'Constater le règlement' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/un encaissement est enregistré sur le lot/)).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('05/11/2026')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Constater le règlement' }));

    await waitFor(() =>
      expect(settleSyndicRemittanceLine).toHaveBeenCalledWith(TENANT, SYNDIC, REMITTANCE, 'l-1', {
        settledAt: '2026-11-05'
      })
    );
    expect(await screen.findByText('Règlement constaté')).toBeInTheDocument();
    expect(await screen.findByText('Retour de la banque : Retour partiel')).toBeInTheDocument();
    // Pas de page d'encaissement de charges : la ligne dit seulement « Encaissé ».
    expect(screen.queryByRole('link', { name: 'Voir le paiement' })).not.toBeInTheDocument();
    expect(screen.getByText('Encaissé')).toBeInTheDocument();
  });

  it('constate un rejet : sans frais de rejet, code ou motif obligatoire', async () => {
    const user = userEvent.setup();
    rejectSyndicRemittanceLine.mockResolvedValue(exported());
    mount();
    const rowA = (await screen.findByText('PRL-2026-0001-001')).closest('tr') as HTMLElement;
    await user.click(within(rowA).getByRole('button', { name: 'Constater le rejet' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Aucun frais de rejet n'est refacturé en copropriété/)).toBeInTheDocument();
    const submit = within(dialog).getByRole('button', { name: 'Constater le rejet' });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Code de rejet' }), 'AC04');
    await user.click(submit);

    await waitFor(() =>
      expect(rejectSyndicRemittanceLine).toHaveBeenCalledWith(TENANT, SYNDIC, REMITTANCE, 'l-1', {
        rejectedAt: '2026-11-05',
        code: 'AC04'
      })
    );
    expect(await screen.findByText('Rejet constaté')).toBeInTheDocument();
  });

  it('tout constater réglé passe par la copropriété et rend compte des échecs', async () => {
    const user = userEvent.setup();
    settleAllSyndicRemittanceLines.mockResolvedValue({
      remittance: exported({ returnState: 'PARTIAL' }),
      settled: 1,
      failed: [{ lineId: 'l-2', reference: 'PRL-2026-0001-002', error: 'Exercice comptable clos.' }]
    });
    mount();
    await screen.findByText('PRL-2026-0001-001');

    await user.click(buttons('Tout constater réglé')[0]);
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/Un règlement constaté à tort ne s'annule pas depuis cet écran/)
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Tout constater réglé' }));

    await waitFor(() =>
      expect(settleAllSyndicRemittanceLines).toHaveBeenCalledWith(TENANT, SYNDIC, REMITTANCE, {
        settledAt: '2026-11-05'
      })
    );
    expect(await within(dialog).findByText(/Exercice comptable clos\./)).toBeInTheDocument();
  });

  it('un règlement déjà constaté ne propose pas de rejet tardif (aucune contre-passation en copropriété)', async () => {
    getSyndicRemittance.mockResolvedValue(
      exported({
        returnState: 'PARTIAL',
        returnSummary: { pending: 1, settled: 1, rejected: 0, settledAmount: 150000, rejectedAmount: 0 },
        lines: [{ ...lineA, status: 'SETTLED', settledAt: '2026-11-05', paymentId: 'cp-1' }, lineB]
      })
    );
    mount();
    const rowA = (await screen.findByText('PRL-2026-0001-001')).closest('tr') as HTMLElement;
    expect(within(rowA).queryAllByRole('button')).toHaveLength(0);
    expect(buttons('Constater un rejet tardif')).toHaveLength(0);
    expect(
      screen.getByText(/Le rejet d'un prélèvement déjà constaté réglé n'est pas pris en charge en copropriété/)
    ).toBeInTheDocument();
  });

  it("affiche l'erreur de l'API dans la fenêtre", async () => {
    const user = userEvent.setup();
    settleSyndicRemittanceLine.mockRejectedValue({
      response: { status: 409, data: { message: 'Exercice comptable clos.' } }
    });
    mount();
    const rowA = (await screen.findByText('PRL-2026-0001-001')).closest('tr') as HTMLElement;
    await user.click(within(rowA).getByRole('button', { name: 'Constater le règlement' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Constater le règlement' }));
    expect(await within(dialog).findByText('Exercice comptable clos.')).toBeInTheDocument();
  });
});

describe('SyndicDirectDebitRemittanceDetail — droits', () => {
  it('sans la gestion, la remise se consulte mais aucun geste n’est proposé', async () => {
    permissions = new Set(['SYNDIC_DIRECT_DEBIT_VIEW']);
    getSyndicRemittance.mockResolvedValue(exported());
    mount();
    await screen.findByText('PRL-2026-0001-001');

    expect(buttons('Constater le règlement')).toHaveLength(0);
    expect(buttons('Constater le rejet')).toHaveLength(0);
    expect(buttons('Tout constater réglé')).toHaveLength(0);
    expect(buttons('Annuler la remise')).toHaveLength(0);
    expect(buttons('Marquer comme déposée à la banque')).toHaveLength(0);
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('avec la gestion, les gestes sont proposés', async () => {
    permissions = new Set(['SYNDIC_DIRECT_DEBIT_VIEW', 'SYNDIC_DIRECT_DEBIT_MANAGE']);
    getSyndicRemittance.mockResolvedValue(exported());
    mount();
    await screen.findByText('PRL-2026-0001-001');
    expect(buttons('Tout constater réglé')).toHaveLength(1);
    expect(buttons('Annuler la remise').length).toBeGreaterThan(0);
  });
});
