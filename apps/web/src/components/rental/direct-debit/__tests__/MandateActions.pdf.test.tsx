import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MandateActions } from '../MandateActions';

vi.mock('../../../../services/direct-debit-service', () => ({
  activateMandate: vi.fn(),
  downloadAuthorizationPdf: vi.fn(),
  downloadSignedScan: vi.fn(),
  reactivateMandate: vi.fn(),
  revokeMandate: vi.fn(),
  suspendMandate: vi.fn(),
  updateMandate: vi.fn(),
  uploadSignedScan: vi.fn(),
  SIGNED_SCAN_MAX_BYTES: 10 * 1024 * 1024,
  SIGNED_SCAN_MIME_TYPES: ['application/pdf', 'image/jpeg', 'image/png']
}));
vi.mock('../../../../utils/save-blob', () => ({ saveBlob: vi.fn() }));

const base = { id: 'm-1', reference: 'MDT-2026-0001', hasSignedScan: true, signedAt: null };

function show(status: string) {
  return render(
    <AntApp>
      <MandateActions tenantId="agence-1" mandate={{ ...base, status } as never} onChanged={vi.fn()} />
    </AntApp>
  );
}

describe('MandateActions, PDF d autorisation', () => {
  it.each(['DRAFT', 'ACTIVE', 'SUSPENDED'])('propose le PDF pour un mandat %s', status => {
    show(status);
    expect(screen.getByRole('button', { name: "Télécharger l'autorisation (PDF)" })).toBeInTheDocument();
  });

  it('ne le propose pas pour un mandat révoqué', () => {
    show('REVOKED');
    expect(screen.queryByRole('button', { name: "Télécharger l'autorisation (PDF)" })).toBeNull();
  });
});
