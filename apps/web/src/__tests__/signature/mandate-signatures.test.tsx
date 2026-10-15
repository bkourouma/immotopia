import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MandateSignatures } from '../../components/signature/MandateSignatures';
import { PropertyMandatesTab } from '../../components/properties/PropertyMandatesTab';

/**
 * Spec 044, S2 : signature des mandats (gestion et vente). Le panneau préremplit
 * ses signataires depuis le contexte de la cible ; l'onglet des mandats d'un bien
 * affiche « Signé le … » et ouvre le panneau. Le mock couvre CHAQUE export utilisé.
 */

const fetchSignatureContext = vi.fn();
const listSignatureRequests = vi.fn();

vi.mock('../../services/signature-service', () => ({
  fetchSignatureContext: (...a: unknown[]) => fetchSignatureContext(...a),
  listSignatureRequests: (...a: unknown[]) => listSignatureRequests(...a),
  createSignatureRequest: vi.fn(),
  cancelSignatureRequest: vi.fn(),
  remindSignatureRequest: vi.fn(),
  fetchSignatureFile: vi.fn(),
  reissueInPersonToken: vi.fn()
}));

const getPropertyMandates = vi.fn();
vi.mock('../../services/property-service', () => ({
  createMandate: vi.fn(),
  getPropertyMandates: (...a: unknown[]) => getPropertyMandates(...a),
  revokeMandate: vi.fn(),
  updateProperty: vi.fn()
}));
vi.mock('../../services/crm-service', () => ({ listContacts: vi.fn(async () => ({ success: true, contacts: [] })) }));

const CONTEXT = {
  kind: 'SALE_MANDATE',
  targetType: 'SaleMandate',
  providerRequired: false,
  signers: [
    { role: 'VENDEUR', fullName: 'Awa Konan', email: 'awa@example.test', phone: null, contactId: 'contact-1' },
    { role: 'AGENT', fullName: 'Marc Agent', email: 'marc@example.test', phone: null, contactId: null }
  ]
};

function renderInApp(node: React.ReactElement) {
  return render(<AntApp>{node}</AntApp>);
}

beforeEach(() => {
  vi.clearAllMocks();
  listSignatureRequests.mockResolvedValue([]);
});

describe('MandateSignatures', () => {
  it('liste les demandes du mandat et préremplit les signataires du contexte', async () => {
    fetchSignatureContext.mockResolvedValue(CONTEXT);
    const user = userEvent.setup();
    renderInApp(<MandateSignatures kind="SALE_MANDATE" mandateId="mandat-1" fileLabel="mandat-vente-MV-1" />);

    const send = await screen.findByRole('button', { name: 'Envoyer pour signature' });
    expect(fetchSignatureContext).toHaveBeenCalledWith('SALE_MANDATE', 'mandat-1');
    expect(listSignatureRequests).toHaveBeenCalledWith({ targetType: 'SaleMandate', targetId: 'mandat-1' });

    await user.click(send);
    const names = (await screen.findAllByLabelText('Nom complet')) as HTMLInputElement[];
    expect(names.map(input => input.value)).toEqual(['Awa Konan', 'Marc Agent']);
    const contacts = screen.getAllByDisplayValue(/@example\.test$/) as HTMLInputElement[];
    expect(contacts.map(input => input.value)).toEqual(['awa@example.test', 'marc@example.test']);
  });

  it('reste utilisable (liste vide) si le contexte est refusé', async () => {
    fetchSignatureContext.mockRejectedValue(new Error('403'));
    renderInApp(<MandateSignatures kind="MANAGEMENT_MANDATE" mandateId="mandat-2" fileLabel="mandat-gestion" />);
    expect(await screen.findByRole('button', { name: 'Envoyer pour signature' })).toBeInTheDocument();
    expect(listSignatureRequests).toHaveBeenCalledWith({ targetType: 'PropertyMandate', targetId: 'mandat-2' });
  });
});

describe('PropertyMandatesTab : signatures', () => {
  const mandate = (overrides: Record<string, unknown> = {}) => ({
    id: 'm-1',
    propertyId: 'p-1',
    tenantId: 't-1',
    ownerUserId: 'u-1',
    startDate: '2026-01-01T00:00:00Z',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    owner: { id: 'u-1', email: 'awa@example.test', fullName: 'Awa Konan' },
    ...overrides
  });

  it('affiche « Signé le » et ouvre le panneau de signatures du mandat', async () => {
    getPropertyMandates.mockResolvedValue([mandate({ signedAt: '2026-10-16T10:00:00Z' })]);
    fetchSignatureContext.mockResolvedValue({ ...CONTEXT, kind: 'MANAGEMENT_MANDATE', targetType: 'PropertyMandate' });
    const user = userEvent.setup();
    renderInApp(<PropertyMandatesTab tenantId="t-1" propertyId="p-1" ownershipType="CLIENT" />);

    expect(await screen.findByText(/^Signé le /)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Signatures' }));
    await waitFor(() => expect(fetchSignatureContext).toHaveBeenCalledWith('MANAGEMENT_MANDATE', 'm-1'));
    expect(await screen.findByRole('button', { name: 'Envoyer pour signature' })).toBeInTheDocument();
  });

  it("n'offre pas la signature d'un mandat résilié", async () => {
    getPropertyMandates.mockResolvedValue([mandate({ isActive: false, revokedAt: '2026-05-01T00:00:00Z' })]);
    renderInApp(<PropertyMandatesTab tenantId="t-1" propertyId="p-1" ownershipType="CLIENT" />);
    expect(await screen.findByText('Résilié')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Signatures' })).not.toBeInTheDocument();
  });
});
