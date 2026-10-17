import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SyndicDirectDebit } from '../../pages/syndics/SyndicDirectDebit';
import { SyndicDirectDebitRemittanceDetail } from '../../pages/syndics/SyndicDirectDebitRemittanceDetail';

/**
 * Spec 042, P4 (§9.6) : onglet « Prélèvements » de Syndic › Finances —
 * créancier du syndicat, mandats (lot → copropriétaire → IBAN), remises.
 */

// Les écrans Ant Design sont lents à monter sous charge : délais élargis pour ce fichier.
configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 120000 });

const TENANT = 'agence-1';
const SYNDIC = 'syn-1';

const getSyndicCreditor = vi.fn();
const saveSyndicCreditor = vi.fn();
const checkSyndicIban = vi.fn();
const listLotDebtors = vi.fn();
const listSyndicMandates = vi.fn();
const createSyndicMandate = vi.fn();
const updateSyndicMandate = vi.fn();
const activateSyndicMandate = vi.fn();
const suspendSyndicMandate = vi.fn();
const reactivateSyndicMandate = vi.fn();
const revokeSyndicMandate = vi.fn();
const downloadSyndicAuthorizationPdf = vi.fn();
const downloadSyndicSignedScan = vi.fn();
const uploadSyndicSignedScan = vi.fn();
const listSyndicRemittances = vi.fn();
const createSyndicRemittance = vi.fn();
const getSyndicRemittance = vi.fn();
const listSyndicateLots = vi.fn();
const saveBlob = vi.fn();

vi.mock('../../services/syndic-direct-debit-service', () => ({
  getSyndicCreditor: (...a: unknown[]) => getSyndicCreditor(...a),
  saveSyndicCreditor: (...a: unknown[]) => saveSyndicCreditor(...a),
  checkSyndicIban: (...a: unknown[]) => checkSyndicIban(...a),
  listLotDebtors: (...a: unknown[]) => listLotDebtors(...a),
  listSyndicMandates: (...a: unknown[]) => listSyndicMandates(...a),
  createSyndicMandate: (...a: unknown[]) => createSyndicMandate(...a),
  updateSyndicMandate: (...a: unknown[]) => updateSyndicMandate(...a),
  activateSyndicMandate: (...a: unknown[]) => activateSyndicMandate(...a),
  suspendSyndicMandate: (...a: unknown[]) => suspendSyndicMandate(...a),
  reactivateSyndicMandate: (...a: unknown[]) => reactivateSyndicMandate(...a),
  revokeSyndicMandate: (...a: unknown[]) => revokeSyndicMandate(...a),
  downloadSyndicAuthorizationPdf: (...a: unknown[]) => downloadSyndicAuthorizationPdf(...a),
  downloadSyndicSignedScan: (...a: unknown[]) => downloadSyndicSignedScan(...a),
  uploadSyndicSignedScan: (...a: unknown[]) => uploadSyndicSignedScan(...a),
  listSyndicRemittances: (...a: unknown[]) => listSyndicRemittances(...a),
  createSyndicRemittance: (...a: unknown[]) => createSyndicRemittance(...a),
  getSyndicRemittance: (...a: unknown[]) => getSyndicRemittance(...a)
}));

vi.mock('../../services/syndic-service', () => ({
  listSyndicateLots: (...a: unknown[]) => listSyndicateLots(...a)
}));

vi.mock('../../utils/save-blob', () => ({
  saveBlob: (...a: unknown[]) => saveBlob(...a),
  filenameFromDisposition: (_disposition: unknown, fallback: string) => fallback
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
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

function makeMandate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    reference: 'MDT-2026-0001',
    scope: 'SYNDIC_LOT',
    status: 'ACTIVE',
    creditor: { id: 'cr-1', label: creditor.label, creditorIdentifier: 'EMT-77' },
    debtor: { id: 'ct-1', displayName: 'Awa Traoré', kind: 'CONTACT' },
    lease: null,
    syndicate: { id: SYNDIC, name: 'Résidence Les Palmiers' },
    lot: { id: 'lot-1', lotNumber: 'A01' },
    ibanMasked: 'CI•• •••• •••• •••• •••• 5678',
    bankCode: 'CI000',
    holderName: 'Awa Traoré',
    maxAmount: 150000,
    collectionDay: null,
    effectiveCollectionDay: 5,
    signedAt: null,
    hasSignedScan: false,
    signedScanUploadedAt: null,
    activatedAt: null,
    suspendedAt: null,
    suspensionReason: null,
    revokedAt: null,
    revocationReason: null,
    consecutiveRejects: 0,
    notes: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides
  };
}

function makeRemittance(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r-1',
    reference: 'PRL-2026-0001',
    scope: 'SYNDIC_LOT',
    syndicate: { id: SYNDIC, name: 'Résidence Les Palmiers' },
    status: 'DRAFT',
    creditor: { id: 'cr-1', label: creditor.label, creditorIdentifier: 'EMT-77' },
    collectionDate: '2026-11-05',
    periodYear: 2026,
    periodMonth: 11,
    prenotificationDeadline: '2026-10-29',
    fileFormat: 'GENERIC_CSV',
    lineCount: 3,
    totalAmount: 450000,
    ...overrides
  };
}

const LocationProbe: React.FC = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

function mount(url = `/tenant/${TENANT}/syndics/${SYNDIC}/prelevements`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/syndics/:syndicId/prelevements" element={<SyndicDirectDebit />} />
            <Route
              path="/tenant/:tenantId/syndics/:syndicId/prelevements/remises/:remittanceId"
              element={
                <>
                  <LocationProbe />
                  <SyndicDirectDebitRemittanceDetail />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Seule la date est simulée : les minuteries de React Query restent réelles.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 16, 9, 0, 0) });
  getSyndicCreditor.mockResolvedValue(creditor);
  listSyndicMandates.mockResolvedValue({ items: [makeMandate()], total: 1, page: 1, pageSize: 20 });
  listSyndicRemittances.mockResolvedValue({ items: [makeRemittance()], total: 1, page: 1, pageSize: 20 });
  listSyndicateLots.mockResolvedValue([
    { id: 'lot-1', lotNumber: 'A01', ownersLabel: 'Awa Traoré' },
    { id: 'lot-2', lotNumber: 'B02', ownersLabel: '' }
  ]);
  listLotDebtors.mockResolvedValue([{ contactId: 'ct-1', displayName: 'Awa Traoré', hasEmail: true }]);
});

afterEach(() => {
  vi.useRealTimers();
});

async function dialog() {
  return within(await screen.findByRole('dialog'));
}

describe('SyndicDirectDebit — créancier du syndicat', () => {
  it('affiche la carte du créancier et ne propose aucun frais de rejet', async () => {
    mount();
    expect(await screen.findByText('Compte de prélèvement du syndicat')).toBeInTheDocument();
    expect(await screen.findByText('Banque Atlantique')).toBeInTheDocument();
    expect(screen.getByText('EMT-77')).toBeInTheDocument();
    expect(screen.queryByText(/Frais de rejet/)).not.toBeInTheDocument();
  });

  it('crée le créancier par PUT quand il n’existe pas encore', async () => {
    getSyndicCreditor.mockResolvedValue(null);
    saveSyndicCreditor.mockResolvedValue(creditor);
    const user = userEvent.setup();
    mount();

    expect(await screen.findByText(/Aucun compte de prélèvement configuré/)).toBeInTheDocument();
    // Sans créancier actif, mandats et remises sont verrouillés.
    expect(screen.getByRole('button', { name: /Nouveau mandat/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Préparer une remise/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Configurer le compte' }));
    const modal = await dialog();
    await user.type(modal.getByLabelText('Libellé'), 'Compte du syndicat');
    await user.type(modal.getByLabelText('Banque'), 'Banque Atlantique');
    await user.click(modal.getByRole('button', { name: /Enregistrer/ }));

    await waitFor(() => expect(saveSyndicCreditor).toHaveBeenCalledTimes(1));
    expect(saveSyndicCreditor).toHaveBeenCalledWith(TENANT, SYNDIC, {
      label: 'Compte du syndicat',
      bankName: 'Banque Atlantique',
      collectionDay: 5,
      prenotificationBusinessDays: 5,
      maxConsecutiveRejects: 2,
      isActive: true
    });
  });

  it('modifie le créancier et le désactive en conservant ses valeurs', async () => {
    saveSyndicCreditor.mockResolvedValue(creditor);
    const user = userEvent.setup();
    mount();

    await screen.findByText('Banque Atlantique');
    await user.click(screen.getByRole('button', { name: 'Désactiver' }));
    await waitFor(() => expect(saveSyndicCreditor).toHaveBeenCalledTimes(1));
    expect(saveSyndicCreditor).toHaveBeenLastCalledWith(TENANT, SYNDIC, {
      label: 'Compte Résidence Les Palmiers',
      bankName: 'Banque Atlantique',
      bankAccountRef: 'CI0001',
      creditorIdentifier: 'EMT-77',
      collectionDay: 5,
      prenotificationBusinessDays: 5,
      maxConsecutiveRejects: 2,
      isActive: false
    });

    const creditorCard = screen.getByText('Compte de prélèvement du syndicat').closest('.ant-card') as HTMLElement;
    // L'enregistrement de la désactivation doit être terminé (boutons de nouveau actifs).
    await waitFor(() => expect(within(creditorCard).getByRole('button', { name: 'Modifier' })).toBeEnabled());
    await user.click(within(creditorCard).getByRole('button', { name: 'Modifier' }));
    const modal = await dialog();
    const label = modal.getByLabelText('Libellé');
    expect(label).toHaveValue('Compte Résidence Les Palmiers');
    await user.clear(label);
    await user.type(label, 'Nouveau libellé');
    await user.click(await modal.findByRole('button', { name: /Enregistrer/ }));
    await waitFor(() => expect(saveSyndicCreditor).toHaveBeenCalledTimes(2));
    expect(saveSyndicCreditor.mock.calls[1][2]).toMatchObject({ label: 'Nouveau libellé', isActive: true });
  });
});

describe('SyndicDirectDebit — mandats', () => {
  it('affiche la table des mandats et filtre par lot et statut', async () => {
    const user = userEvent.setup();
    mount();

    const reference = await screen.findByText('MDT-2026-0001');
    const row = reference.closest('tr') as HTMLElement;
    expect(within(row).getByText('A01')).toBeInTheDocument();
    expect(within(row).getByText('Awa Traoré')).toBeInTheDocument();
    expect(within(row).getByText('Actif')).toBeInTheDocument();
    expect(row.querySelector('bdi[dir="ltr"]')).toHaveTextContent('5678');
    expect(listSyndicMandates).toHaveBeenLastCalledWith(TENANT, SYNDIC, { page: 1, pageSize: 20 });

    await user.click(screen.getByLabelText('Filtrer par lot'));
    await user.click(await screen.findByTitle('A01 — Awa Traoré'));
    await waitFor(() =>
      expect(listSyndicMandates).toHaveBeenLastCalledWith(TENANT, SYNDIC, { lotId: 'lot-1', page: 1, pageSize: 20 })
    );

    await user.click(screen.getByLabelText('Filtrer par statut'));
    await user.click(await screen.findByTitle('Suspendu'));
    await waitFor(() =>
      expect(listSyndicMandates).toHaveBeenLastCalledWith(TENANT, SYNDIC, {
        lotId: 'lot-1',
        status: 'SUSPENDED',
        page: 1,
        pageSize: 20
      })
    );
  });

  it('enchaîne lot, copropriétaire, IBAN contrôlé puis crée le mandat', async () => {
    checkSyndicIban.mockResolvedValue({
      valid: true,
      ibanMasked: 'CI•• •••• 5678',
      bankCode: 'CI000',
      error: null,
      warnings: ['Banque hors réseau']
    });
    createSyndicMandate.mockResolvedValue({ mandate: makeMandate({ id: 'm-2', status: 'DRAFT' }), warnings: [] });
    const user = userEvent.setup();
    mount();

    await screen.findByText('MDT-2026-0001');
    await user.click(screen.getByRole('button', { name: /Nouveau mandat/ }));
    const modal = await dialog();

    // Avant le choix du lot, le copropriétaire et l'IBAN restent verrouillés.
    expect(modal.getByLabelText('Copropriétaire à prélever')).toBeDisabled();
    expect(modal.getByLabelText('IBAN ou RIB')).toBeDisabled();

    await user.click(modal.getByLabelText('Lot'));
    await user.click(await screen.findByTitle('A01 — Awa Traoré'));
    await waitFor(() => expect(listLotDebtors).toHaveBeenCalledWith(TENANT, SYNDIC, 'lot-1'));
    // Un seul copropriétaire : proposé d'emblée, titulaire prérempli.
    await waitFor(() => expect(modal.getByLabelText('IBAN ou RIB')).toBeEnabled());
    expect(modal.getByLabelText('Titulaire du compte')).toHaveValue('Awa Traoré');

    await user.type(modal.getByLabelText('IBAN ou RIB'), 'CI93 CI000 01234 012345678901 23');
    await waitFor(() => expect(checkSyndicIban).toHaveBeenCalled(), { timeout: 3000 });
    expect(await modal.findByText('Banque hors réseau')).toBeInTheDocument();
    expect(modal.getByText('CI•• •••• 5678').closest('bdi')).toHaveAttribute('dir', 'ltr');

    await user.click(modal.getByRole('button', { name: 'Créer le mandat de prélèvement' }));
    await waitFor(() => expect(createSyndicMandate).toHaveBeenCalledTimes(1));
    expect(createSyndicMandate).toHaveBeenCalledWith(TENANT, SYNDIC, {
      lotId: 'lot-1',
      debtorContactId: 'ct-1',
      iban: 'CI93 CI000 01234 012345678901 23',
      holderName: 'Awa Traoré'
    });
    await waitFor(() => expect(listSyndicMandates.mock.calls.length).toBeGreaterThan(1));
  });

  it('signale un copropriétaire sans e-mail et bloque un IBAN invalide', async () => {
    listLotDebtors.mockResolvedValue([{ contactId: 'ct-9', displayName: 'Moussa Diallo', hasEmail: false }]);
    checkSyndicIban.mockResolvedValue({
      valid: false,
      ibanMasked: null,
      bankCode: null,
      error: 'IBAN invalide',
      warnings: []
    });
    const user = userEvent.setup();
    mount();

    await screen.findByText('MDT-2026-0001');
    await user.click(screen.getByRole('button', { name: /Nouveau mandat/ }));
    const modal = await dialog();
    await user.click(modal.getByLabelText('Lot'));
    await user.click(await screen.findByTitle('B02'));

    expect(await modal.findByText(/n'a pas d'adresse e-mail/)).toBeInTheDocument();
    await waitFor(() => expect(modal.getByLabelText('IBAN ou RIB')).toBeEnabled());
    await user.type(modal.getByLabelText('IBAN ou RIB'), 'XX00');
    expect(await modal.findByText('IBAN invalide', undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(modal.getByRole('button', { name: 'Créer le mandat de prélèvement' })).toBeDisabled();
    expect(createSyndicMandate).not.toHaveBeenCalled();
  });

  it('télécharge l’autorisation d’un brouillon et annonce le nom du fichier', async () => {
    listSyndicMandates.mockResolvedValue({
      items: [makeMandate({ status: 'DRAFT' })],
      total: 1,
      page: 1,
      pageSize: 20
    });
    downloadSyndicAuthorizationPdf.mockResolvedValue({
      blob: new Blob(['x']),
      filename: 'autorisation-MDT-2026-0001.pdf'
    });
    const user = userEvent.setup();
    mount();

    const row = (await screen.findByText('MDT-2026-0001')).closest('tr') as HTMLElement;
    // Sans scan déposé, l'activation est refusée.
    expect(within(row).getByRole('button', { name: 'Activer' })).toBeDisabled();
    await user.click(within(row).getByRole('button', { name: "Télécharger l'autorisation (PDF)" }));
    await waitFor(() =>
      expect(downloadSyndicAuthorizationPdf).toHaveBeenCalledWith(TENANT, SYNDIC, 'm-1', 'MDT-2026-0001.pdf')
    );
    expect(saveBlob).toHaveBeenCalled();
    expect(await screen.findByText('Autorisation téléchargée : autorisation-MDT-2026-0001.pdf')).toBeInTheDocument();
  });

  it('dépose le scan signé puis active un brouillon dont la signature est connue', async () => {
    listSyndicMandates.mockResolvedValue({
      items: [makeMandate({ status: 'DRAFT', hasSignedScan: true, signedAt: '2026-10-10T00:00:00.000Z' })],
      total: 1,
      page: 1,
      pageSize: 20
    });
    uploadSyndicSignedScan.mockResolvedValue(makeMandate({ status: 'DRAFT', hasSignedScan: true }));
    activateSyndicMandate.mockResolvedValue(makeMandate());
    const user = userEvent.setup();
    mount();

    const row = (await screen.findByText('MDT-2026-0001')).closest('tr') as HTMLElement;
    const file = new File(['pdf'], 'scan.pdf', { type: 'application/pdf' });
    await user.upload(within(row).getByTestId('signed-scan-input'), file);
    await waitFor(() => expect(uploadSyndicSignedScan).toHaveBeenCalledWith(TENANT, SYNDIC, 'm-1', file));

    await user.click(within(row).getByRole('button', { name: 'Activer' }));
    const modal = await dialog();
    await user.click(modal.getByRole('button', { name: 'Activer' }));
    await waitFor(() => expect(activateSyndicMandate).toHaveBeenCalledWith(TENANT, SYNDIC, 'm-1', undefined));
  });

  it('suspend avec un motif obligatoire', async () => {
    suspendSyndicMandate.mockResolvedValue(makeMandate({ status: 'SUSPENDED' }));
    const user = userEvent.setup();
    mount();

    const row = (await screen.findByText('MDT-2026-0001')).closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Suspendre' }));
    const modal = await dialog();
    // Le motif est obligatoire.
    await user.click(modal.getByRole('button', { name: 'Suspendre' }));
    expect(suspendSyndicMandate).not.toHaveBeenCalled();
    await user.type(modal.getByLabelText('Motif'), 'Compte clos');
    await user.click(modal.getByRole('button', { name: 'Suspendre' }));
    await waitFor(() => expect(suspendSyndicMandate).toHaveBeenCalledWith(TENANT, SYNDIC, 'm-1', 'Compte clos'));
  });

  it('révoque avec un motif après avoir prévenu que c’est définitif', async () => {
    revokeSyndicMandate.mockResolvedValue(makeMandate({ status: 'REVOKED' }));
    const user = userEvent.setup();
    mount();

    const row = (await screen.findByText('MDT-2026-0001')).closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Révoquer' }));
    const modal = await dialog();
    expect(modal.getByText(/La révocation est définitive/)).toBeInTheDocument();
    await user.type(modal.getByLabelText('Motif'), 'Vente du lot');
    await user.click(modal.getByRole('button', { name: 'Révoquer' }));
    await waitFor(() => expect(revokeSyndicMandate).toHaveBeenCalledWith(TENANT, SYNDIC, 'm-1', 'Vente du lot'));
  });

  it('réactive un mandat suspendu', async () => {
    listSyndicMandates.mockResolvedValue({
      items: [makeMandate({ status: 'SUSPENDED' })],
      total: 1,
      page: 1,
      pageSize: 20
    });
    reactivateSyndicMandate.mockResolvedValue(makeMandate());
    const user = userEvent.setup();
    mount();

    const row = (await screen.findByText('MDT-2026-0001')).closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Réactiver' }));
    await waitFor(() => expect(reactivateSyndicMandate).toHaveBeenCalledWith(TENANT, SYNDIC, 'm-1'));
  });
});

describe('SyndicDirectDebit — remises', () => {
  it('liste les remises avec le lien vers le détail', async () => {
    mount();

    const link = await screen.findByRole('link', { name: 'PRL-2026-0001' });
    expect(link).toHaveAttribute('href', `/tenant/${TENANT}/syndics/${SYNDIC}/prelevements/remises/r-1`);
    const row = link.closest('tr') as HTMLElement;
    expect(within(row).getByText('Brouillon')).toBeInTheDocument();
    expect(within(row).getByText('05/11/2026')).toBeInTheDocument();
    expect(within(row).getByText('29/10/2026')).toBeInTheDocument();
    expect(within(row).getByText('3')).toBeInTheDocument();
    expect(within(row).getByText(/450\s?000/)).toBeInTheDocument();
    expect(listSyndicRemittances).toHaveBeenLastCalledWith(TENANT, SYNDIC, { page: 1, pageSize: 20 });
  });

  it('propose la date selon le jour de collecte et le délai d’avis, sans choix de créancier', async () => {
    createSyndicRemittance.mockResolvedValue({
      remittance: makeRemittance({ id: 'r-9', reference: 'PRL-2026-0009' }),
      skipped: []
    });
    getSyndicRemittance.mockResolvedValue(makeRemittance({ id: 'r-9', reference: 'PRL-2026-0009' }));
    const user = userEvent.setup();
    mount();

    await screen.findByRole('link', { name: 'PRL-2026-0001' });
    await user.click(screen.getByRole('button', { name: /Préparer une remise/ }));
    const modal = await dialog();

    // Jour de collecte 5, avis 5 jours ouvrés : au 16/10/2026, le 05/11 est la première date possible.
    expect(modal.getByDisplayValue('05/11/2026')).toBeInTheDocument();
    expect(modal.getByText('Avis de prélèvement : 5 jours ouvrés avant la date de prélèvement.')).toBeInTheDocument();
    expect(modal.queryByText('Créancier')).not.toBeInTheDocument();

    await user.click(modal.getByRole('button', { name: 'Préparer' }));
    await waitFor(() =>
      expect(createSyndicRemittance).toHaveBeenCalledWith(TENANT, SYNDIC, { collectionDate: '2026-11-05' })
    );
    // Après création, le détail s'ouvre (page provisoire).
    expect(await screen.findByTestId('location')).toHaveTextContent(
      `/tenant/${TENANT}/syndics/${SYNDIC}/prelevements/remises/r-9`
    );
    expect(await screen.findByText('Détail complet à venir')).toBeInTheDocument();
    expect(await screen.findByText('PRL-2026-0009')).toBeInTheDocument();
  });

  it('affiche l’erreur de l’API dans la fenêtre sans la fermer', async () => {
    createSyndicRemittance.mockRejectedValue({ response: { status: 400, data: { message: 'Date trop proche' } } });
    const user = userEvent.setup();
    mount();

    await screen.findByRole('link', { name: 'PRL-2026-0001' });
    await user.click(screen.getByRole('button', { name: /Préparer une remise/ }));
    const modal = await dialog();
    await user.click(modal.getByRole('button', { name: 'Préparer' }));
    expect(await modal.findByText('Date trop proche')).toBeInTheDocument();
  });
});
