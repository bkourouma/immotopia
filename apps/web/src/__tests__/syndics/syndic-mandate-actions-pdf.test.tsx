import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { SyndicMandateActions } from '../../components/syndics/direct-debit/SyndicMandateActions';
import type { MandateDto } from '../../services/direct-debit-service';

/**
 * Le bouton « Télécharger l'autorisation (PDF) » reste visible tant que le mandat
 * n'est pas révoqué (brouillon, actif, suspendu), comme en locatif
 * (`MandateActions`). L'API ne limite pas ce téléchargement au brouillon.
 */

vi.mock('../../services/syndic-direct-debit-service', () => ({
  activateSyndicMandate: vi.fn(),
  downloadSyndicAuthorizationPdf: vi.fn(),
  downloadSyndicSignedScan: vi.fn(),
  reactivateSyndicMandate: vi.fn(),
  revokeSyndicMandate: vi.fn(),
  suspendSyndicMandate: vi.fn(),
  updateSyndicMandate: vi.fn(),
  uploadSyndicSignedScan: vi.fn()
}));
vi.mock('../../utils/save-blob', () => ({ saveBlob: vi.fn() }));

const PDF = "Télécharger l'autorisation (PDF)";

function renderActions(status: string) {
  const mandate = {
    id: 'm-1',
    reference: 'MDT-2026-0001',
    status,
    hasSignedScan: true,
    maxAmount: null,
    collectionDay: null,
    notes: null
  } as unknown as MandateDto;
  return render(
    <AntApp>
      <SyndicMandateActions tenantId="agence-1" syndicId="syn-1" mandate={mandate} onChanged={vi.fn()} />
    </AntApp>
  );
}

describe('SyndicMandateActions : autorisation PDF', () => {
  it.each(['DRAFT', 'ACTIVE', 'SUSPENDED'])('propose le téléchargement pour un mandat %s', status => {
    renderActions(status);
    expect(screen.getByRole('button', { name: PDF })).toBeInTheDocument();
  });

  it('ne le propose pas pour un mandat révoqué', () => {
    renderActions('REVOKED');
    expect(screen.queryByRole('button', { name: PDF })).not.toBeInTheDocument();
  });
});
