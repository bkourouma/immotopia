import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { ClaimDocuments } from '../../components/insurance/ClaimDocuments';

const attachClaimDocument = vi.fn();
const detachClaimDocument = vi.fn();
const uploadDocument = vi.fn();
const downloadPropertyDocumentFile = vi.fn();
const saveBlob = vi.fn();
const feedbackError = vi.fn();
const feedbackSuccess = vi.fn();

vi.mock('../../services/insurance-service', () => ({
  __esModule: true,
  attachClaimDocument: (...a: unknown[]) => attachClaimDocument(...a),
  detachClaimDocument: (...a: unknown[]) => detachClaimDocument(...a)
}));
vi.mock('../../services/property-service', () => ({
  __esModule: true,
  uploadDocument: (...a: unknown[]) => uploadDocument(...a),
  downloadPropertyDocumentFile: (...a: unknown[]) => downloadPropertyDocumentFile(...a)
}));
vi.mock('../../utils/save-blob', () => ({ __esModule: true, saveBlob: (...a: unknown[]) => saveBlob(...a) }));
vi.mock('../../lib/feedback', () => ({
  __esModule: true,
  feedback: { error: (...a: unknown[]) => feedbackError(...a), success: (...a: unknown[]) => feedbackSuccess(...a) }
}));

const CLAIM = {
  id: 'sin-1',
  propertyId: 'bien-1',
  documents: [
    {
      id: 'lien-1',
      documentId: 'doc-1',
      kind: 'QUOTE',
      fileName: 'devis.pdf',
      mimeType: 'application/pdf',
      createdAt: '2026-03-12T08:00:00.000Z'
    }
  ],
  history: []
} as never;

function rendre(onChanged = vi.fn()) {
  render(
    <AntApp>
      <ClaimDocuments tenantId="agence-1" claim={CLAIM} canEdit onChanged={onChanged} />
    </AntApp>
  );
  return onChanged;
}

beforeEach(() => {
  vi.clearAllMocks();
  downloadPropertyDocumentFile.mockResolvedValue({ blob: new Blob(['x']), filename: 'devis.pdf' });
});

describe('ClaimDocuments', () => {
  it('télécharge la pièce par la route authentifiée des documents du bien', async () => {
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByRole('button', { name: /Télécharger devis\.pdf/ }));
    await waitFor(() =>
      expect(downloadPropertyDocumentFile).toHaveBeenCalledWith('agence-1', 'bien-1', 'doc-1', 'devis.pdf')
    );
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'devis.pdf'));
  });

  it('téléverse puis rattache la pièce', async () => {
    const user = userEvent.setup();
    uploadDocument.mockResolvedValue({ id: 'doc-9' });
    attachClaimDocument.mockResolvedValue({});
    const onChanged = rendre();
    await user.upload(screen.getByTestId('claim-file-input'), new File(['x'], 'photo.png', { type: 'image/png' }));
    await waitFor(() =>
      expect(attachClaimDocument).toHaveBeenCalledWith('agence-1', 'sin-1', {
        documentId: 'doc-9',
        kind: 'PHOTO_BEFORE'
      })
    );
    expect(uploadDocument).toHaveBeenCalledWith('agence-1', 'bien-1', expect.any(File), 'INSURANCE', undefined, false);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('dit clairement que le fichier reste dans les documents du bien si le rattachement échoue', async () => {
    const user = userEvent.setup();
    uploadDocument.mockResolvedValue({ id: 'doc-9' });
    attachClaimDocument.mockRejectedValue(new Error('boom'));
    rendre();
    await user.upload(screen.getByTestId('claim-file-input'), new File(['x'], 'photo.png', { type: 'image/png' }));
    await waitFor(() => expect(feedbackError).toHaveBeenCalled());
    expect(String(feedbackError.mock.calls[0][0])).toContain('téléversé dans les documents du bien');
    expect(String(feedbackError.mock.calls[0][0])).toContain('pas pu être rattaché');
  });
});
