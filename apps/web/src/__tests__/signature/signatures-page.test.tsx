import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SignaturesPage from '../../pages/signatures/SignaturesPage';

/** Page « Signatures » (suivi global des demandes). Le mock couvre CHAQUE export utilisé. */

const listSignaturesPage = vi.fn();
const fetchSignatureSummary = vi.fn();
const fetchSignatureDetail = vi.fn();
const fetchSignatureFile = vi.fn();
const remindSignatureRequest = vi.fn();
const cancelSignatureRequest = vi.fn();
const saveBlob = vi.fn();

vi.mock('../../services/signature-admin-service', () => ({
  listSignaturesPage: (...a: unknown[]) => listSignaturesPage(...a),
  fetchSignatureSummary: (...a: unknown[]) => fetchSignatureSummary(...a),
  fetchSignatureDetail: (...a: unknown[]) => fetchSignatureDetail(...a),
  fetchSignatureFile: (...a: unknown[]) => fetchSignatureFile(...a),
  remindSignatureRequest: (...a: unknown[]) => remindSignatureRequest(...a),
  cancelSignatureRequest: (...a: unknown[]) => cancelSignatureRequest(...a)
}));
vi.mock('../../utils/save-blob', () => ({ saveBlob: (...a: unknown[]) => saveBlob(...a) }));

function request(overrides: Record<string, any> = {}) {
  return {
    id: 'r1',
    kind: 'LEASE_CONTRACT',
    targetType: 'RentalLease',
    targetId: 'lease-1',
    title: 'Bail Villa Cocody',
    status: 'SENT',
    expiresAt: '2026-12-01T00:00:00Z',
    createdAt: '2026-10-01T00:00:00Z',
    completedAt: null,
    hasSignedFile: false,
    signers: [
      {
        id: 's1',
        role: 'LOCATAIRE',
        position: 1,
        fullName: 'Awa Traoré',
        channel: 'EMAIL',
        contactMasked: 'a•••@m•••.com',
        status: 'SIGNED'
      },
      {
        id: 's2',
        role: 'BAILLEUR',
        position: 2,
        fullName: 'Koffi Yao',
        channel: 'WHATSAPP',
        contactMasked: '+225•••',
        status: 'PENDING'
      }
    ],
    ...overrides
  };
}

function renderPage() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/t1/signatures']}>
        <Routes>
          <Route path="/tenant/:tenantId/signatures" element={<SignaturesPage />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listSignaturesPage.mockResolvedValue({
    items: [request(), request({ id: 'r2', title: 'Compromis Lot 4', status: 'COMPLETED', hasSignedFile: true })],
    total: 2
  });
  fetchSignatureSummary.mockResolvedValue({
    total: 7,
    byStatus: { SENT: 3, COMPLETED: 4, DRAFT: 0, PARTIALLY_SIGNED: 0, DECLINED: 0, EXPIRED: 0, CANCELED: 0 }
  });
  fetchSignatureFile.mockResolvedValue(new Blob(['pdf']));
  remindSignatureRequest.mockResolvedValue({ reminded: 1, failed: 0 });
  cancelSignatureRequest.mockResolvedValue({});
});

describe('SignaturesPage', () => {
  it('affiche les compteurs et les lignes', async () => {
    renderPage();
    expect(await screen.findByText('Bail Villa Cocody')).toBeInTheDocument();
    expect(screen.getByText('Compromis Lot 4')).toBeInTheDocument();
    const counters = screen.getByTestId('signature-counters');
    expect(within(counters).getByText(/Toutes \(7\)/)).toBeInTheDocument();
    expect(within(counters).getByText(/Envoyée \(3\)/)).toBeInTheDocument();
    expect(within(counters).getByText(/Signée \(4\)/)).toBeInTheDocument();
    expect(screen.getAllByText('1/2 signés').length).toBe(2);
  });

  it('filtre par statut : rappelle la liste avec le paramètre', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Bail Villa Cocody');
    await user.click(within(screen.getByTestId('signature-counters')).getByText(/Signée \(4\)/));
    await waitFor(() =>
      expect(listSignaturesPage).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'COMPLETED', page: 1 }))
    );
  });

  it('relance, annule (après confirmation) et télécharge', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Bail Villa Cocody');

    // Seule la demande ouverte porte Relancer / Annuler.
    expect(screen.getAllByRole('button', { name: 'Relancer' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Relancer' }));
    await waitFor(() => expect(remindSignatureRequest).toHaveBeenCalledWith('r1'));

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.click(await screen.findByRole('button', { name: 'Annuler la demande' }));
    await waitFor(() => expect(cancelSignatureRequest).toHaveBeenCalledWith('r1'));

    const downloads = screen.getAllByRole('button', { name: 'Télécharger' });
    await user.click(downloads[0]);
    await waitFor(() => expect(fetchSignatureFile).toHaveBeenCalledWith('r1', 'source'));
    await user.click(downloads[1]);
    await waitFor(() => expect(fetchSignatureFile).toHaveBeenCalledWith('r2', 'signed'));
    expect(saveBlob).toHaveBeenCalledTimes(2);
  }, 120000);

  it('ouvre le tiroir de détail avec la piste de preuve et le lien vers le document', async () => {
    fetchSignatureDetail.mockResolvedValue({
      ...request(),
      chainIntact: true,
      events: [
        { type: 'CREATED', signerId: null, createdAt: '2026-10-01T00:00:00Z' },
        { type: 'SIGNED', signerId: 's1', createdAt: '2026-10-02T00:00:00Z' },
        { type: 'NOUVEAU_TYPE', signerId: null, createdAt: '2026-10-03T00:00:00Z' }
      ]
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Bail Villa Cocody' }));
    expect(await screen.findByText('Piste de preuve intacte')).toBeInTheDocument();
    expect(fetchSignatureDetail).toHaveBeenCalledWith('r1');
    expect(screen.getByText('Demande créée')).toBeInTheDocument();
    expect(screen.getByText(/Signature apposée/)).toBeInTheDocument();
    expect(screen.getByText('NOUVEAU_TYPE')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir le document' })).toHaveAttribute(
      'href',
      '/tenant/t1/rental/leases/lease-1'
    );
  });

  it('signale une piste altérée et n’affiche aucun lien pour un état des lieux', async () => {
    fetchSignatureDetail.mockResolvedValue({
      ...request({ kind: 'LEASE_INSPECTION', targetType: 'LeaseInspection' }),
      chainIntact: false,
      events: []
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Bail Villa Cocody' }));
    expect(await screen.findByText('Piste de preuve altérée')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ouvrir le document' })).not.toBeInTheDocument();
  }, 60000);

  it('affiche une erreur de chargement', async () => {
    listSignaturesPage.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByText('Erreur lors du chargement des signatures')).toBeInTheDocument();
  });
});
