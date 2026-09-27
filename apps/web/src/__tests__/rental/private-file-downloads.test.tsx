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
  const documents = [
    { id: 'doc-1', propertyId: 'bien-1', title: 'Titre foncier', type: 'TITLE_DEED', fileUrl: '/uploads/properties/bien-1/documents/t.pdf' },
    { id: 'doc-2', propertyId: 'bien-1', title: 'Plan', type: 'FLOOR_PLAN', fileUrl: 'https://exemple.ci/plan.pdf' }
  ] as never[];

  it('télécharge un fichier déposé par la route du document ; un lien externe reste un lien', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    get.mockResolvedValue({ data: blob, headers: { 'content-disposition': "attachment; filename*=UTF-8''Titre%20foncier.pdf" } });

    const { container } = render(
      <AntApp>
        <DocumentVault documents={documents} tenantId="agence-1" propertyId="bien-1" />
      </AntApp>
    );

    expect(liens(container).some(lien => lien.includes('/uploads'))).toBe(false);
    expect(liens(container)).toContain('https://exemple.ci/plan.pdf');

    await userEvent.click(screen.getAllByRole('button', { name: 'Ouvrir' })[0]);
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
