import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DirectDebitRemittances } from '../../pages/rental/DirectDebitRemittances';
import { creditor, makeRemittance, TENANT_ID } from './direct-debit-remittances-fixtures';

/**
 * Spec 042, P3 — import d'un retour de la banque (§8.5, §8.10) : modale en deux
 * temps (aperçu, application) et historique des imports.
 */

const listRemittances = vi.fn();
const listCreditors = vi.fn();
const listReturnImports = vi.fn();
const previewReturnFile = vi.fn();
const applyReturnFile = vi.fn();

vi.mock('../../services/direct-debit-service', () => ({
  listRemittances: (...a: unknown[]) => listRemittances(...a),
  listCreditors: (...a: unknown[]) => listCreditors(...a),
  createRemittance: vi.fn(),
  listReturnImports: (...a: unknown[]) => listReturnImports(...a),
  previewReturnFile: (...a: unknown[]) => previewReturnFile(...a),
  applyReturnFile: (...a: unknown[]) => applyReturnFile(...a)
}));

configure({ asyncUtilTimeout: 8000 });

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[`/tenant/${TENANT_ID}/rental/direct-debit/remittances`]}>
          <Routes>
            <Route path="/tenant/:tenantId/rental/direct-debit/remittances" element={<DirectDebitRemittances />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const match = {
  remittanceId: 'r-1',
  remittanceReference: 'PRL-2026-0001',
  lineId: 'l-1',
  lineStatus: 'PENDING',
  lineAmount: 150000,
  debtorName: 'Awa Traoré'
};

const preview = {
  format: 'GENERIC_CSV',
  fileName: 'retour.csv',
  records: [
    {
      row: 2,
      operationReference: 'PRL-2026-0001-001',
      outcome: 'SETTLED',
      date: '2026-11-05',
      amount: 150000,
      rejectionCode: null,
      rejectionReason: null,
      action: 'SETTLE',
      skipReason: null,
      match
    },
    {
      row: 3,
      operationReference: 'PRL-2026-0001-002',
      outcome: 'REJECTED',
      date: '2026-11-06',
      amount: 100000,
      rejectionCode: 'AC04',
      rejectionReason: null,
      action: 'REJECT',
      skipReason: null,
      match: { ...match, lineId: 'l-2', debtorName: 'Moussa Diallo' }
    },
    {
      row: 4,
      operationReference: 'PRL-2026-0001-003',
      outcome: 'SETTLED',
      date: '2026-11-05',
      amount: 90000,
      rejectionCode: null,
      rejectionReason: null,
      action: 'SKIP',
      skipReason: 'AMOUNT_MISMATCH',
      match: { ...match, lineId: 'l-3', lineAmount: 100000 }
    },
    {
      row: 5,
      operationReference: 'PRL-2026-0099-001',
      outcome: 'SETTLED',
      date: '2026-11-05',
      amount: 1000,
      rejectionCode: null,
      rejectionReason: null,
      action: 'SKIP',
      skipReason: 'UNKNOWN_REFERENCE',
      match: null
    }
  ],
  errors: [{ row: 6, message: 'Date illisible.' }],
  summary: { settle: 1, reject: 1, skip: 2, errors: 1 },
  alreadyImported: null
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 10, 9, 0, 0) });
  listRemittances.mockResolvedValue({ items: [makeRemittance()], total: 1, page: 1, pageSize: 20 });
  listCreditors.mockResolvedValue([creditor]);
  listReturnImports.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
});

afterEach(() => {
  vi.useRealTimers();
});

async function openAndUpload(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('link', { name: 'PRL-2026-0001' });
  await user.click(screen.getByRole('button', { name: /Importer un retour de la banque/ }));
  const dialog = await screen.findByRole('dialog');
  const file = new File(['reference_operation;statut'], 'retour.csv', { type: 'text/csv' });
  const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, file);
  return { dialog, file };
}

describe('Import d’un retour de la banque', () => {
  it("affiche l'aperçu : actions, raisons d'écart traduites, lignes rapprochées et erreurs de lecture", async () => {
    const user = userEvent.setup();
    previewReturnFile.mockResolvedValue(preview);
    mount();
    const { dialog, file } = await openAndUpload(user);

    expect(await within(dialog).findByText('PRL-2026-0001-001')).toBeInTheDocument();
    expect(previewReturnFile).toHaveBeenCalledWith(TENANT_ID, file);
    expect(applyReturnFile).not.toHaveBeenCalled();

    expect(within(dialog).getByText('Règlements : 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Rejets : 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Ignorées : 2')).toBeInTheDocument();
    expect(within(dialog).getByText('Erreurs de lecture : 1')).toBeInTheDocument();

    const settleRow = within(dialog).getByText('PRL-2026-0001-001').closest('tr') as HTMLElement;
    expect(within(settleRow).getByText('Constater le règlement')).toBeInTheDocument();
    expect(within(settleRow).getByText('Awa Traoré')).toBeInTheDocument();

    const rejectRow = within(dialog).getByText('PRL-2026-0001-002').closest('tr') as HTMLElement;
    expect(within(rejectRow).getByText('Constater le rejet')).toBeInTheDocument();

    const mismatchRow = within(dialog).getByText('PRL-2026-0001-003').closest('tr') as HTMLElement;
    expect(within(mismatchRow).getByText('Ignorée')).toBeInTheDocument();
    expect(within(mismatchRow).getByText('Montant différent de celui de la ligne')).toBeInTheDocument();

    const unknownRow = within(dialog).getByText('PRL-2026-0099-001').closest('tr') as HTMLElement;
    expect(within(unknownRow).getByText(/Référence inconnue/)).toBeInTheDocument();

    expect(within(dialog).getByText('Lignes illisibles du fichier : 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Ligne 6 : Date illisible.')).toBeInTheDocument();
  });

  it("n'applique rien tant que l'aperçu n'a pas de constat à faire", async () => {
    const user = userEvent.setup();
    previewReturnFile.mockResolvedValue({
      ...preview,
      records: [preview.records[2]],
      errors: [],
      summary: { settle: 0, reject: 0, skip: 1, errors: 0 }
    });
    mount();
    const { dialog } = await openAndUpload(user);
    await within(dialog).findByText('PRL-2026-0001-003');
    expect(within(dialog).getByRole('button', { name: 'Appliquer' })).toBeDisabled();
  });

  it('applique après confirmation, puis affiche les compteurs réels sans masquer un constat en échec', async () => {
    const user = userEvent.setup();
    previewReturnFile.mockResolvedValue(preview);
    applyReturnFile.mockResolvedValue({
      ...preview,
      importId: 'imp-1',
      appliedSummary: { settled: 1, rejected: 0, failed: 1 },
      results: [
        { row: 2, lineId: 'l-1', ok: true, error: null },
        { row: 3, lineId: 'l-2', ok: false, error: 'Cette ligne vient d’être traitée.' }
      ]
    });
    mount();
    const { dialog, file } = await openAndUpload(user);
    await within(dialog).findByText('PRL-2026-0001-001');

    // « Appliquer » ne lance rien : il demande d'abord confirmation, avec le récapitulatif.
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(applyReturnFile).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText(
        '1 règlements créent des encaissements et des quittances ; 1 rejets, dont 0 rejets tardifs qui annulent des encaissements et leurs quittances.'
      )
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: "Confirmer l'application" }));

    await waitFor(() => expect(applyReturnFile).toHaveBeenCalledWith(TENANT_ID, file));
    expect(
      await within(dialog).findByText('Fichier retour.csv importé avec des constats en échec.')
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Réglées : 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Rejetées : 0')).toBeInTheDocument();
    expect(within(dialog).getByText('En échec : 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Constats en échec : 1')).toBeInTheDocument();
    expect(within(dialog).getByText(/Ligne 3 : Cette ligne vient d’être traitée\./)).toBeInTheDocument();
    // Un échec : avertissement, jamais le message de succès.
    expect(screen.queryByText('Fichier retour.csv importé.')).not.toBeInTheDocument();
    // L'application relance la lecture de l'historique et des remises.
    await waitFor(() => expect(listReturnImports.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(within(dialog).queryByRole('button', { name: 'Appliquer' })).not.toBeInTheDocument();
  });

  it('sans échec : succès, compteurs réels et relecture des paiements et des échéances', async () => {
    const user = userEvent.setup();
    previewReturnFile.mockResolvedValue(preview);
    applyReturnFile.mockResolvedValue({
      ...preview,
      importId: 'imp-1',
      appliedSummary: { settled: 1, rejected: 1, failed: 0 },
      results: [
        { row: 2, lineId: 'l-1', ok: true, error: null },
        { row: 3, lineId: 'l-2', ok: true, error: null }
      ]
    });
    mount();
    const { dialog } = await openAndUpload(user);
    await within(dialog).findByText('PRL-2026-0001-001');
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    await user.click(within(dialog).getByRole('button', { name: "Confirmer l'application" }));

    expect(await within(dialog).findByText('Fichier retour.csv importé.')).toBeInTheDocument();
    expect(within(dialog).getByText('Réglées : 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Rejetées : 1')).toBeInTheDocument();
    expect(within(dialog).getByText('En échec : 0')).toBeInTheDocument();
    expect(within(dialog).queryByText(/avec des constats en échec/)).not.toBeInTheDocument();
  });

  it('met en évidence les rejets tardifs et les compte dans le récapitulatif', async () => {
    const user = userEvent.setup();
    previewReturnFile.mockResolvedValue({
      ...preview,
      records: [
        preview.records[0],
        { ...preview.records[1], match: { ...match, lineId: 'l-2', lineStatus: 'SETTLED' } }
      ],
      summary: { settle: 1, reject: 1, skip: 0, errors: 0 },
      errors: []
    });
    mount();
    const { dialog } = await openAndUpload(user);
    await within(dialog).findByText('PRL-2026-0001-001');

    const lateRow = within(dialog).getByText('PRL-2026-0001-002').closest('tr') as HTMLElement;
    expect(within(lateRow).getByText('Rejet tardif')).toBeInTheDocument();
    const normalRow = within(dialog).getByText('PRL-2026-0001-001').closest('tr') as HTMLElement;
    expect(within(normalRow).queryByText('Rejet tardif')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(within(dialog).getByText(/dont 1 rejets tardifs qui annulent des encaissements/)).toBeInTheDocument();
  });

  it('prévient quand le fichier a déjà été importé', async () => {
    const user = userEvent.setup();
    previewReturnFile.mockResolvedValue({
      ...preview,
      alreadyImported: { importId: 'imp-0', importedAt: '2026-11-08T10:30:00.000Z' }
    });
    mount();
    const { dialog } = await openAndUpload(user);
    expect(await within(dialog).findByText('Ce fichier a déjà été importé le 08/11/2026.')).toBeInTheDocument();
  });

  it.each([
    ['409', 'Ce fichier a déjà été appliqué en entier.'],
    ['409', 'Une application de ce fichier est déjà en cours.'],
    ['400', 'Ce fichier comporte plus de 500 enregistrements à appliquer.']
  ])("affiche clairement l'erreur %s de l'API à l'application : %s", async (status, apiMessage) => {
    const user = userEvent.setup();
    previewReturnFile.mockResolvedValue(preview);
    applyReturnFile.mockRejectedValue({ response: { status: Number(status), data: { message: apiMessage } } });
    mount();
    const { dialog } = await openAndUpload(user);
    await within(dialog).findByText('PRL-2026-0001-001');
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    await user.click(within(dialog).getByRole('button', { name: "Confirmer l'application" }));

    expect(await within(dialog).findByText(apiMessage)).toBeInTheDocument();
    // La fenêtre reste sur l'aperçu : on peut corriger, puis réappliquer.
    expect(within(dialog).getByRole('button', { name: 'Appliquer' })).toBeEnabled();
  });

  it("affiche l'erreur de l'API quand le fichier est refusé", async () => {
    const user = userEvent.setup();
    previewReturnFile.mockRejectedValue({
      response: { status: 400, data: { message: 'Fichier trop volumineux (2 Mo au plus).' } }
    });
    mount();
    const { dialog } = await openAndUpload(user);

    expect(await within(dialog).findByText('Fichier trop volumineux (2 Mo au plus).')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Appliquer' })).toBeDisabled();
  });

  it("liste l'historique des imports : date, fichier, compteurs, auteur", async () => {
    listReturnImports.mockResolvedValue({
      items: [
        {
          id: 'imp-1',
          format: 'GENERIC_CSV',
          fileName: 'retour-novembre.csv',
          recordCount: 12,
          settledCount: 9,
          rejectedCount: 2,
          skippedCount: 1,
          errorCount: 0,
          importedBy: { id: 'u-1', fullName: 'Aïcha Bamba' },
          createdAt: '2026-11-08T10:30:00.000Z'
        }
      ],
      total: 1,
      page: 1,
      pageSize: 10
    });
    mount();

    const name = await screen.findByText('retour-novembre.csv');
    expect(name.closest('bdi')).toHaveAttribute('dir', 'ltr');
    const row = name.closest('tr') as HTMLElement;
    expect(within(row).getByText('Aïcha Bamba')).toBeInTheDocument();
    expect(within(row).getByText('08/11/2026')).toBeInTheDocument();
    expect(within(row).getByText('12')).toBeInTheDocument();
    expect(within(row).getByText('9')).toBeInTheDocument();
    expect(listReturnImports).toHaveBeenCalledWith(TENANT_ID, { page: 1, pageSize: 10 });
  });

  it("affiche un message quand aucun fichier n'a été importé", async () => {
    mount();
    expect(await screen.findByText('Aucun fichier de retour importé')).toBeInTheDocument();
  });
});
