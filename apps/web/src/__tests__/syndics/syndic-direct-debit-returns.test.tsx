import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SyndicDirectDebit } from '../../pages/syndics/SyndicDirectDebit';

/**
 * Spec 042, P4 (§9.4 et §9.6) : import d'un fichier de retour de la banque
 * côté copropriété — aperçu, application, historique, droits.
 */

configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 120000 });

const TENANT = 'agence-1';
const SYNDIC = 'syn-1';

const getSyndicCreditor = vi.fn();
const listSyndicMandates = vi.fn();
const listSyndicRemittances = vi.fn();
const listSyndicReturnImports = vi.fn();
const previewSyndicReturnFile = vi.fn();
const applySyndicReturnFile = vi.fn();
let permissions: Set<string> | null = null;

vi.mock('../../services/syndic-direct-debit-service', () => ({
  getSyndicCreditor: (...a: unknown[]) => getSyndicCreditor(...a),
  saveSyndicCreditor: vi.fn(),
  checkSyndicIban: vi.fn(),
  listLotDebtors: vi.fn(),
  listSyndicMandates: (...a: unknown[]) => listSyndicMandates(...a),
  createSyndicMandate: vi.fn(),
  listSyndicRemittances: (...a: unknown[]) => listSyndicRemittances(...a),
  createSyndicRemittance: vi.fn(),
  listSyndicReturnImports: (...a: unknown[]) => listSyndicReturnImports(...a),
  previewSyndicReturnFile: (...a: unknown[]) => previewSyndicReturnFile(...a),
  applySyndicReturnFile: (...a: unknown[]) => applySyndicReturnFile(...a)
}));

vi.mock('../../services/syndic-service', () => ({ listSyndicateLots: vi.fn().mockResolvedValue([]) }));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));

vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set(), enabled: new Set(), permissions, ready: true })
}));

const creditor = {
  id: 'cr-1',
  label: 'Compte Résidence Les Palmiers',
  scope: 'SYNDIC_LOT',
  treasuryAccountId: null,
  treasuryAccountLabel: null,
  syndicate: { id: SYNDIC, name: 'Résidence Les Palmiers' },
  bankName: 'Banque Atlantique',
  bankAccountRef: 'CI0001',
  creditorIdentifier: 'EMT-77',
  fileFormat: 'GENERIC_CSV',
  collectionDay: 5,
  prenotificationBusinessDays: 5,
  rejectFeeAmount: 0,
  maxConsecutiveRejects: 2,
  isActive: true,
  openMandateCount: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z'
};

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
    }
  ],
  errors: [],
  summary: { settle: 1, reject: 1, skip: 0, errors: 0 },
  alreadyImported: null
};

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[`/tenant/${TENANT}/syndics/${SYNDIC}/prelevements`]}>
          <Routes>
            <Route path="/tenant/:tenantId/syndics/:syndicId/prelevements" element={<SyndicDirectDebit />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions = null;
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 10, 9, 0, 0) });
  getSyndicCreditor.mockResolvedValue(creditor);
  listSyndicMandates.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
  listSyndicRemittances.mockResolvedValue({
    items: [
      {
        id: 'r-1',
        reference: 'PRL-2026-0001',
        scope: 'SYNDIC_LOT',
        syndicate: { id: SYNDIC, name: 'Résidence Les Palmiers' },
        status: 'EXPORTED',
        collectionDate: '2026-11-05',
        prenotificationDeadline: '2026-10-29',
        lineCount: 2,
        totalAmount: 250000
      }
    ],
    total: 1,
    page: 1,
    pageSize: 20
  });
  listSyndicReturnImports.mockResolvedValue({
    items: [
      {
        id: 'imp-0',
        scope: 'SYNDIC_LOT',
        format: 'GENERIC_CSV',
        fileName: 'avant.csv',
        recordCount: 4,
        settledCount: 3,
        rejectedCount: 1,
        skippedCount: 0,
        errorCount: 0,
        importedBy: { id: 'u-1', fullName: 'Gestionnaire Syndic' },
        createdAt: '2026-11-06T09:00:00.000Z'
      }
    ],
    total: 1,
    page: 1,
    pageSize: 10
  });
});

afterEach(() => {
  vi.useRealTimers();
});

async function openAndUpload(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('link', { name: 'PRL-2026-0001' });
  await user.click(screen.getByRole('button', { name: /Importer un retour de la banque/ }));
  const dialog = await screen.findByRole('dialog');
  const file = new File(['reference_operation;statut'], 'retour.csv', { type: 'text/csv' });
  await user.upload(dialog.querySelector('input[type="file"]') as HTMLInputElement, file);
  return { dialog, file };
}

describe('SyndicDirectDebit — retours de la banque', () => {
  it("liste l'historique des imports du syndicat", async () => {
    mount();
    expect(await screen.findByText('avant.csv')).toBeInTheDocument();
    expect(listSyndicReturnImports).toHaveBeenCalledWith(TENANT, SYNDIC, { page: 1, pageSize: 10 });
    expect(screen.getByText('Gestionnaire Syndic')).toBeInTheDocument();
  });

  it("affiche l'aperçu du rapprochement sans rien écrire", async () => {
    const user = userEvent.setup();
    previewSyndicReturnFile.mockResolvedValue(preview);
    mount();
    const { dialog, file } = await openAndUpload(user);

    expect(await within(dialog).findByText('PRL-2026-0001-001')).toBeInTheDocument();
    expect(previewSyndicReturnFile).toHaveBeenCalledWith(TENANT, SYNDIC, file);
    expect(applySyndicReturnFile).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Règlements : 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Rejets : 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Awa Traoré')).toBeInTheDocument();
  });

  it('applique après confirmation (textes de copropriété) puis rend compte', async () => {
    const user = userEvent.setup();
    previewSyndicReturnFile.mockResolvedValue(preview);
    applySyndicReturnFile.mockResolvedValue({
      ...preview,
      importId: 'imp-1',
      appliedSummary: { settled: 1, rejected: 1, failed: 0 },
      results: [
        { row: 2, lineId: 'l-1', ok: true, error: null },
        { row: 3, lineId: 'l-2', ok: true, error: null }
      ]
    });
    mount();
    const { dialog, file } = await openAndUpload(user);
    await within(dialog).findByText('PRL-2026-0001-001');

    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(applySyndicReturnFile).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText(
        "1 règlements créent des encaissements et des reçus ; 1 rejets. Un règlement constaté à tort ne s'annule pas depuis cet écran."
      )
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: "Confirmer l'application" }));

    await waitFor(() => expect(applySyndicReturnFile).toHaveBeenCalledWith(TENANT, SYNDIC, file));
    expect(await within(dialog).findByText('Fichier retour.csv importé.')).toBeInTheDocument();
    expect(within(dialog).getByText('Réglées : 1')).toBeInTheDocument();
    // L'application relit l'historique.
    await waitFor(() => expect(listSyndicReturnImports.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('un rejet tardif du fichier est signalé comme non pris en charge', async () => {
    const user = userEvent.setup();
    previewSyndicReturnFile.mockResolvedValue({
      ...preview,
      records: [{ ...preview.records[1], match: { ...match, lineStatus: 'SETTLED' } }],
      summary: { settle: 0, reject: 1, skip: 0, errors: 0 }
    });
    mount();
    const { dialog } = await openAndUpload(user);
    await within(dialog).findByText('PRL-2026-0001-002');
    expect(
      within(dialog).getByText(
        /Le rejet d'un prélèvement déjà constaté réglé n'est pas pris en charge en copropriété : 1 enregistrements/
      )
    ).toBeInTheDocument();
  });

  it("l'erreur de l'API (fichier déjà appliqué) est affichée telle quelle", async () => {
    const user = userEvent.setup();
    previewSyndicReturnFile.mockResolvedValue(preview);
    applySyndicReturnFile.mockRejectedValue({
      response: { status: 409, data: { message: 'Ce fichier a déjà été appliqué le 06/11/2026.' } }
    });
    mount();
    const { dialog } = await openAndUpload(user);
    await within(dialog).findByText('PRL-2026-0001-001');
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    await user.click(within(dialog).getByRole('button', { name: "Confirmer l'application" }));
    expect(await within(dialog).findByText('Ce fichier a déjà été appliqué le 06/11/2026.')).toBeInTheDocument();
  });

  it("sans le droit de gestion, l'import n'est pas proposé mais l'historique reste lisible", async () => {
    permissions = new Set(['SYNDIC_DIRECT_DEBIT_VIEW']);
    mount();
    await screen.findByRole('link', { name: 'PRL-2026-0001' });
    expect(screen.queryByRole('button', { name: /Importer un retour de la banque/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Préparer une remise/ })).not.toBeInTheDocument();
    expect(await screen.findByText('avant.csv')).toBeInTheDocument();
  });

  it('sans MANAGE, aucun geste de gestion (compte, mandats, remises)', async () => {
    permissions = new Set(['SYNDIC_DIRECT_DEBIT_VIEW']);
    listSyndicMandates.mockResolvedValue({
      items: [
        {
          id: 'm-1',
          reference: 'MDT-2026-0001',
          scope: 'SYNDIC_LOT',
          status: 'DRAFT',
          creditor: { id: 'cr-1', label: 'C', creditorIdentifier: null },
          debtor: { id: 'ct-1', displayName: 'Awa Traoré', kind: 'CONTACT' },
          lease: null,
          syndicate: { id: SYNDIC, name: 'R' },
          lot: { id: 'lot-1', lotNumber: 'A01' },
          ibanMasked: 'CI•• 5678',
          bankCode: 'CI000',
          holderName: 'Awa Traoré',
          maxAmount: null,
          collectionDay: null,
          effectiveCollectionDay: 5,
          hasSignedScan: false
        }
      ],
      total: 1,
      page: 1,
      pageSize: 20
    });
    mount();
    expect(await screen.findByText('MDT-2026-0001')).toBeInTheDocument();
    for (const name of [
      /Modifier|Configurer le compte|Désactiver/,
      /Nouveau mandat/,
      /Préparer une remise/,
      /Importer un retour/,
      /Activer|Suspendre|Révoquer|autorisation|scan/i
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  });
});
