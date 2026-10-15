import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { InspectionViewer } from '../../components/rental/inspections/InspectionViewer';
import { toSignerInputs } from '../../components/rental/inspections/InspectionSignaturesModal';
import type { LeaseInspection } from '../../services/lease-inspections-service';

/**
 * Spec 044, S3 : bouton « Signatures » d'un état des lieux finalisé, signataires
 * préremplis par l'API, locataire présent et agent en signature sur place.
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
  reissueInPersonToken: vi.fn(),
  fetchPublicSignature: vi.fn(),
  requestPublicOtp: vi.fn(),
  submitPublicSignature: vi.fn(),
  declinePublicSignature: vi.fn(),
  publicSignatureFileUrl: (token: string) => `http://api.test/${token}`
}));

function inspection(overrides: Partial<LeaseInspection> = {}): LeaseInspection {
  return {
    id: 'insp-1',
    type: 'ENTRY',
    status: 'FINALIZED',
    inspectionDate: '2026-10-01T12:00:00Z',
    rooms: [],
    meters: null,
    keysCount: 2,
    generalComment: null,
    tenantPresent: true,
    tenantSignatoryName: 'Awa Traoré',
    agentSignatoryName: 'Agent Test',
    deductions: [],
    finalizedAt: '2026-10-01T15:00:00Z',
    photos: [],
    ...overrides
  };
}

function renderViewer(value: LeaseInspection) {
  return render(
    <AntApp>
      <InspectionViewer tenantId="t1" leaseId="l1" inspection={value} entryInspection={null} onBack={() => undefined} />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listSignatureRequests.mockResolvedValue([]);
  fetchSignatureContext.mockResolvedValue({
    kind: 'LEASE_INSPECTION',
    targetType: 'LeaseInspection',
    providerRequired: false,
    signers: [
      { role: 'LOCATAIRE', fullName: 'Awa Traoré', email: 'awa@mail.com', contactId: 'c1' },
      { role: 'BAILLEUR', fullName: 'Bailleur Un', email: 'bailleur@mail.com' },
      { role: 'AGENT', fullName: 'Agent Test', email: 'agent@mail.com' }
    ]
  });
});

describe('Signatures d’un état des lieux', () => {
  it('ouvre le panneau de signature d’un état finalisé avec le contexte de l’API', async () => {
    renderViewer(inspection());
    await userEvent.click(screen.getByRole('button', { name: /Signatures/ }));
    await waitFor(() => expect(fetchSignatureContext).toHaveBeenCalledWith('LEASE_INSPECTION', 'insp-1'));
    await waitFor(() =>
      expect(listSignatureRequests).toHaveBeenCalledWith({ targetType: 'LeaseInspection', targetId: 'insp-1' })
    );
    expect(await screen.findByText(/faites-le signer sur place/)).toBeTruthy();
  });

  it('n’affiche pas le bouton pour un brouillon', () => {
    renderViewer(inspection({ status: 'DRAFT', finalizedAt: null }));
    expect(screen.queryByRole('button', { name: /Signatures/ })).toBeNull();
  });

  it('met la signature sur place en avant pour le locataire présent et l’agent', () => {
    const signers = [
      { role: 'LOCATAIRE', fullName: 'Awa', email: 'awa@mail.com', contactId: 'c1' },
      { role: 'CO_LOCATAIRE', fullName: 'Moussa', email: 'm@mail.com' },
      { role: 'BAILLEUR', fullName: 'Bailleur', email: 'b@mail.com' },
      { role: 'AGENT', fullName: 'Agent', email: 'a@mail.com' }
    ];
    const present = toSignerInputs(signers, true);
    expect(present.map(signer => [signer.role, signer.channel, signer.contact])).toEqual([
      ['LOCATAIRE', 'IN_PERSON', ''],
      ['CO_LOCATAIRE', 'EMAIL', 'm@mail.com'],
      ['BAILLEUR', 'EMAIL', 'b@mail.com'],
      ['AGENT', 'IN_PERSON', '']
    ]);
    expect(present[0].contactId).toBe('c1');

    const absent = toSignerInputs(signers, false);
    expect(absent[0]).toMatchObject({ role: 'LOCATAIRE', channel: 'EMAIL', contact: 'awa@mail.com' });
    expect(absent[3].channel).toBe('IN_PERSON');
  });
});
