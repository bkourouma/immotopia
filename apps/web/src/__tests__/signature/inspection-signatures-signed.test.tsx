import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { InspectionSignaturesModal } from '../../components/rental/inspections/InspectionSignaturesModal';

/** BUG-2026-11-04-032 : un état des lieux déjà signé garde ses demandes et ses PDF visibles à la réouverture. */

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

describe('InspectionSignaturesModal : cible déjà signée', () => {
  it('liste les demandes avec le PDF signé et désactive seulement l’envoi', async () => {
    fetchSignatureContext.mockResolvedValue({
      kind: 'LEASE_INSPECTION',
      targetType: 'LeaseInspection',
      canSend: false,
      reason: 'Cet état des lieux est déjà signé.',
      providerRequired: false,
      signers: []
    });
    listSignatureRequests.mockResolvedValue([
      {
        id: 'r1',
        status: 'COMPLETED',
        createdAt: '2026-10-01T10:00:00Z',
        expiresAt: '2026-10-15T10:00:00Z',
        signers: []
      }
    ]);
    render(
      <AntApp>
        <InspectionSignaturesModal
          open
          inspectionId="i1"
          type="ENTRY"
          tenantPresent={false}
          onClose={() => undefined}
        />
      </AntApp>
    );
    expect(await screen.findByText('PDF signé')).toBeTruthy();
    expect(screen.getByTestId('inspection-signature-blocked').textContent).toContain('déjà signé');
    expect((screen.getByText('Envoyer pour signature').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });
});
