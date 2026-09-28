import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { DocumentVault } from '../../components/patrimoine/DocumentVault';
import { PaymentDeclarationsList } from '../../components/rental/PaymentDeclarationsList';

/**
 * Documents de bien et preuves de paiement : plus aucun lien vers `/uploads`
 * (le service statique répond 404). Les fichiers arrivent en blob par le
 * client API, depuis leur route authentifiée.
 */

const get = vi.fn();
vi.mock('../../utils/api-client', () => ({ default: { get: (...a: unknown[]) => get(...a) } }));

const saveBlob = vi.fn();
vi.mock('../../utils/save-blob', async importOriginal => ({
  ...(await importOriginal<typeof import('../../utils/save-blob')>()),
  saveBlob: (...a: unknown[]) => saveBlob(...a)
}));

const listPaymentDeclarations = vi.fn();
vi.mock('../../services/rental-service', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/rental-service')>()),
  listPaymentDeclarations: (...a: unknown[]) => listPaymentDeclarations(...a)
}));

vi.mock('../../components/finance/TreasuryAccountSelector', () => ({ TreasuryAccountSelector: () => null }));

const createObjectURL = vi.fn(() => 'blob:http://localhost:3000/preuve-1');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
});

function liens(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[href], [src]')).map(
    element => element.getAttribute('href') ?? element.getAttribute('src') ?? ''
  );
}

describe('DocumentVault (patrimoine) — documents de bien', () => {
  /**
   * Lot P0 : les documents patrimoniaux (`PatrimonyDocument`, `fileUrl` libre
   * — pouvait pointer vers un fichier interne ou un lien externe quelconque)
   * sont remplacés par les pièces du bien (`PropertyDocument`) : toujours un
   * fichier réellement déposé, jamais d'URL externe, toujours téléchargé par
   * la route authentifiée (`services/property-document-service.ts`
   * `PROPERTY_DOCUMENT_SELECT` ne renvoie ni `filePath` ni `fileUrl`). Le
   * scénario « lien externe » ne s'applique donc plus à ce composant — voir
   * le rapport de ce lot pour le signalement à l'équipe produit.
   */
  const documents = [
    {
      id: 'doc-1',
      propertyId: 'bien-1',
      documentType: 'TITLE_DEED',
      fileName: 'Titre foncier.pdf',
      fileSize: 2048,
      mimeType: 'application/pdf',
      isRequired: true,
      isValid: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
  ] as never[];

  it('télécharge un fichier déposé par la route du document, en blob', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    get.mockResolvedValue({
      data: blob,
      headers: { 'content-disposition': "attachment; filename*=UTF-8''Titre%20foncier.pdf" }
    });

    const { container } = render(
      <AntApp>
        <DocumentVault documents={documents} tenantId="agence-1" propertyId="bien-1" />
      </AntApp>
    );

    // Ni chemin disque ni URL de stockage : la ligne ne porte que le nom du
    // fichier, jamais un lien direct vers `/uploads`.
    expect(liens(container).some(lien => lien.includes('/uploads'))).toBe(false);

    await userEvent.click(screen.getAllByRole('button', { name: 'Télécharger' })[0]);
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        '/tenants/agence-1/properties/bien-1/documents/doc-1/file',
        expect.objectContaining({ responseType: 'blob' })
      )
    );
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'Titre foncier.pdf'));
  });
});

describe('PaymentDeclarationsList — preuve de paiement', () => {
  it('affiche la preuve par une URL blob: venue de la route authentifiée', async () => {
    listPaymentDeclarations.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'decl-1',
          created_at: '2026-04-01T00:00:00.000Z',
          payment_date: '2026-04-01T00:00:00.000Z',
          amount: 150000,
          payment_method: 'MOBILE_MONEY',
          status: 'PENDING',
          proof_file_url: '/uploads/portal/payments/agence-1/preuve.jpg',
          lease: { lease_number: 'BAIL-1', property: { title: 'Villa Cocody' } },
          declarer: { user: { fullName: 'Awa Konan' } }
        }
      ],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 }
    });
    get.mockResolvedValue({ data: new Blob(['jpg'], { type: 'image/jpeg' }), headers: {} });

    const { baseElement } = render(
      <AntApp>
        <PaymentDeclarationsList tenantId="agence-1" />
      </AntApp>
    );

    await userEvent.click(await screen.findByTitle('Voir la preuve de paiement', {}, { timeout: 8000 }));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        '/tenants/agence-1/rental/payment-declarations/decl-1/proof',
        expect.objectContaining({ responseType: 'blob' })
      )
    );
    const image = await screen.findByAltText('Preuve de paiement');
    expect(image.getAttribute('src')).toBe('blob:http://localhost:3000/preuve-1');
    expect(liens(baseElement).some(lien => lien.includes('/uploads'))).toBe(false);
  });
});
