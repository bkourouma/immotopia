import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import {
  LeaseDirectDebitPanel,
  debtorOptionsFromLease
} from '../../components/rental/direct-debit/LeaseDirectDebitPanel';

/**
 * Spec 042, lot P1 — onglet « Prélèvements » de la fiche du bail.
 * Le panneau est autonome (`{ tenantId, leaseId }`), monté sans routeur.
 */

const listMandates = vi.fn();
const listCreditors = vi.fn();
const createMandate = vi.fn();
const checkIban = vi.fn();
const activateMandate = vi.fn();
const getLease = vi.fn();

vi.mock('../../services/direct-debit-service', () => ({
  listMandates: (...a: unknown[]) => listMandates(...a),
  listCreditors: (...a: unknown[]) => listCreditors(...a),
  createMandate: (...a: unknown[]) => createMandate(...a),
  checkIban: (...a: unknown[]) => checkIban(...a),
  activateMandate: (...a: unknown[]) => activateMandate(...a),
  suspendMandate: vi.fn(),
  reactivateMandate: vi.fn(),
  revokeMandate: vi.fn(),
  updateMandate: vi.fn(),
  uploadSignedScan: vi.fn(),
  downloadSignedScan: vi.fn(),
  downloadAuthorizationPdf: vi.fn(),
  SIGNED_SCAN_MAX_BYTES: 10 * 1024 * 1024,
  SIGNED_SCAN_MIME_TYPES: ['application/pdf', 'image/jpeg', 'image/png']
}));

vi.mock('../../services/rental-service', () => ({
  getLease: (...a: unknown[]) => getLease(...a)
}));

const TENANT_ID = 'agence-1';
const LEASE_ID = 'bail-1';
const RAW_IBAN = 'CI93CI0010123456789012345678';

function makeMandate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    reference: 'MDT-2026-0001',
    scope: 'RENTAL_LEASE',
    status: 'DRAFT',
    creditor: { id: 'c-1', label: 'Compte loyers', creditorIdentifier: null },
    debtor: { id: 'client-1', displayName: 'Awa Traoré', kind: 'CLIENT' },
    syndicate: null,
    lot: null,
    lease: { id: LEASE_ID, leaseNumber: 'BAIL-001', status: 'ACTIVE' },
    ibanMasked: 'CI•• •••• •••• •••• •••• 5678',
    bankCode: 'CI001',
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
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides
  };
}

const creditor = {
  id: 'c-1',
  label: 'Compte loyers',
  scope: 'RENTAL_LEASE',
  treasuryAccountId: 'ta-1',
  treasuryAccountLabel: 'Banque principale',
  syndicate: null,
  bankName: 'Banque X',
  bankAccountRef: null,
  creditorIdentifier: null,
  fileFormat: 'GENERIC_CSV',
  collectionDay: 5,
  prenotificationBusinessDays: 5,
  rejectFeeAmount: 0,
  maxConsecutiveRejects: 2,
  isActive: true,
  openMandateCount: 0,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z'
};

function mount() {
  return render(
    <AntApp>
      <LeaseDirectDebitPanel tenantId={TENANT_ID} leaseId={LEASE_ID} />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listMandates.mockResolvedValue({ items: [makeMandate()], total: 1, page: 1, pageSize: 100 });
  listCreditors.mockResolvedValue([creditor]);
  getLease.mockResolvedValue({
    success: true,
    data: {
      id: LEASE_ID,
      primaryRenter: { id: 'client-1', user: { fullName: 'Awa Traoré' } },
      coRenters: []
    }
  });
});

describe('LeaseDirectDebitPanel', () => {
  it('liste les mandats du bail avec le masque et sans IBAN en clair', async () => {
    mount();

    expect(await screen.findByText('MDT-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('CI•• •••• •••• •••• •••• 5678')).toBeInTheDocument();
    expect(screen.getByText('CI001')).toBeInTheDocument();
    expect(screen.getByText('Brouillon')).toBeInTheDocument();
    expect(listMandates).toHaveBeenCalledWith(TENANT_ID, { leaseId: LEASE_ID, pageSize: 100 });
    expect(document.body.textContent).not.toContain(RAW_IBAN);
  });

  it('désactive « Nouveau mandat » quand un mandat ouvert existe, avec le motif en infobulle', async () => {
    mount();
    await screen.findByText('MDT-2026-0001');

    const button = screen.getByRole('button', { name: /Nouveau mandat/ });
    expect(button).toBeDisabled();
    expect(screen.getAllByText(/Un mandat ouvert existe déjà/).length).toBeGreaterThanOrEqual(1);

    // Antd pose l'infobulle sur le conteneur du bouton désactivé.
    fireEvent.mouseEnter(button.parentElement as HTMLElement);
    await waitFor(() => expect(screen.getAllByText(/Un mandat ouvert existe déjà/).length).toBeGreaterThanOrEqual(2));
  });

  it('active « Nouveau mandat » quand tous les mandats sont révoqués', async () => {
    listMandates.mockResolvedValue({
      items: [makeMandate({ status: 'REVOKED', revocationReason: 'Départ' })],
      total: 1,
      page: 1,
      pageSize: 100
    });
    mount();
    await screen.findByText('MDT-2026-0001');

    expect(screen.getByRole('button', { name: /Nouveau mandat/ })).toBeEnabled();
    expect(screen.queryByText(/Un mandat ouvert existe déjà/)).not.toBeInTheDocument();
  });

  it("désactive « Activer » tant qu'aucun scan signé n'est déposé", async () => {
    mount();
    await screen.findByText('MDT-2026-0001');

    expect(screen.getByRole('button', { name: 'Activer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Déposer le scan signé/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Voir le scan' })).not.toBeInTheDocument();
  });

  it('active « Activer » quand le scan est déposé et propose Voir le scan', async () => {
    listMandates.mockResolvedValue({
      items: [makeMandate({ hasSignedScan: true })],
      total: 1,
      page: 1,
      pageSize: 100
    });
    mount();
    await screen.findByText('MDT-2026-0001');

    expect(screen.getByRole('button', { name: 'Activer' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Voir le scan' })).toBeInTheDocument();
  });

  it("accepte la date de signature saisie en jj/mm/aaaa et l'envoie à l'API en aaaa-mm-jj", async () => {
    const user = userEvent.setup();
    listMandates.mockResolvedValue({
      items: [makeMandate({ hasSignedScan: true })],
      total: 1,
      page: 1,
      pageSize: 100
    });
    activateMandate.mockResolvedValue(makeMandate({ status: 'ACTIVE', hasSignedScan: true }));
    mount();
    await screen.findByText('MDT-2026-0001');

    await user.click(screen.getByRole('button', { name: 'Activer' }));
    const dialog = await screen.findByRole('dialog');
    const dateInput = dialog.querySelector('.ant-picker input') as HTMLInputElement;
    await user.type(dateInput, '15/10/2025{Enter}');
    await user.click(within(dialog).getByRole('button', { name: 'Activer' }));

    await waitFor(() => expect(activateMandate).toHaveBeenCalledWith(TENANT_ID, 'm-1', '2025-10-15'));
  });

  it('propose Suspendre et Révoquer sur un mandat actif, Réactiver sur un mandat suspendu', async () => {
    listMandates.mockResolvedValue({
      items: [
        makeMandate({ id: 'm-a', reference: 'MDT-2026-0002', status: 'ACTIVE', hasSignedScan: true }),
        makeMandate({ id: 'm-s', reference: 'MDT-2026-0003', status: 'SUSPENDED', hasSignedScan: true }),
        makeMandate({ id: 'm-r', reference: 'MDT-2026-0004', status: 'REVOKED', hasSignedScan: true })
      ],
      total: 3,
      page: 1,
      pageSize: 100
    });
    mount();
    await screen.findByText('MDT-2026-0002');

    expect(screen.getAllByRole('button', { name: 'Suspendre' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Réactiver' })).toHaveLength(1);
    // Révoquer : actif et suspendu, pas le mandat déjà révoqué.
    expect(screen.getAllByRole('button', { name: 'Révoquer' })).toHaveLength(2);
  });

  it("contrôle l'IBAN à la volée puis crée le mandat sans jamais réafficher l'IBAN saisi", async () => {
    const user = userEvent.setup();
    listMandates.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
    checkIban.mockResolvedValue({
      valid: true,
      ibanMasked: 'CI•• •••• •••• •••• •••• 5678',
      bankCode: 'CI001',
      error: null,
      warnings: []
    });
    createMandate.mockResolvedValue({
      mandate: makeMandate(),
      warnings: ['La clé RIB ne correspond pas au calcul habituel : vérifiez le RIB auprès du titulaire.']
    });
    mount();

    await user.click(await screen.findByRole('button', { name: /Nouveau mandat/ }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText('IBAN ou RIB'), RAW_IBAN);
    await waitFor(() => expect(checkIban).toHaveBeenCalled());
    expect(checkIban).toHaveBeenLastCalledWith(TENANT_ID, RAW_IBAN);
    expect(await within(dialog).findByText('CI001')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Titulaire du compte'), 'Awa Traoré');
    await user.click(within(dialog).getByRole('button', { name: 'Créer le mandat de prélèvement' }));

    await waitFor(() => expect(createMandate).toHaveBeenCalled());
    expect(createMandate).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        creditorId: 'c-1',
        leaseId: LEASE_ID,
        debtorClientId: 'client-1',
        iban: RAW_IBAN,
        holderName: 'Awa Traoré'
      })
    );

    // Les avertissements de l'API sont montrés, la liste affiche le masque.
    expect(await screen.findByText(/La clé RIB ne correspond pas/)).toBeInTheDocument();
    expect(await screen.findByText('MDT-2026-0001')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(RAW_IBAN);
    const ibanInputs = Array.from(document.querySelectorAll('input')).filter(input => input.value.includes('CI93'));
    expect(ibanInputs).toHaveLength(0);
  });

  it("bloque la création et affiche l'erreur quand l'IBAN est invalide", async () => {
    const user = userEvent.setup();
    listMandates.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
    checkIban.mockResolvedValue({
      valid: false,
      ibanMasked: null,
      bankCode: null,
      error: "La clé de contrôle de l'IBAN est incorrecte.",
      warnings: []
    });
    mount();

    await user.click(await screen.findByRole('button', { name: /Nouveau mandat/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('IBAN ou RIB'), 'CI00BAD');

    expect(await within(dialog).findByText("La clé de contrôle de l'IBAN est incorrecte.")).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Créer le mandat de prélèvement' })).toBeDisabled();
    expect(createMandate).not.toHaveBeenCalled();
  });
});

describe('debtorOptionsFromLease', () => {
  it('propose le locataire principal puis les colocataires, sans doublon', () => {
    const options = debtorOptionsFromLease({
      primaryRenter: { id: 'client-1', displayName: 'Awa Traoré' },
      coRenters: [
        { renterClient: { id: 'client-1' } },
        { renterClient: { id: 'client-2', user: { fullName: 'Moussa Koné' } } }
      ]
    });
    expect(options.map(option => option.id)).toEqual(['client-1', 'client-2']);
    expect(options[1].label).toContain('Moussa Koné');
  });
});
