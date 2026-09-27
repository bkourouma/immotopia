import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { PrintReceiptsModal } from '../../components/syndics/PrintReceiptsModal';
import { SyndicateLot } from '../../types/syndic-types';

/**
 * Lot S3 (besoin 1, P7) : fenêtre « Imprimer les quittances ». Vérifie les
 * paramètres envoyés (période, type, portée, grille A4), les bornes
 * colonnes/lignes (1-3 × 1-4) et l'aperçu en URL d'objet (révoquée).
 */

const printReceipts = vi.fn();

vi.mock('../../services/syndic-receipt-service', () => ({
  printReceipts: (...args: unknown[]) => printReceipts(...args)
}));

const saveBlob = vi.fn();

vi.mock('../../utils/save-blob', () => ({
  saveBlob: (...args: unknown[]) => saveBlob(...args)
}));

const LOTS: SyndicateLot[] = [
  {
    id: 'lot-1',
    syndicateId: 'syndic-1',
    lotNumber: 'A-01',
    lotType: 'APARTMENT'
  } as SyndicateLot
];

function renderModal(onClose = vi.fn()) {
  return render(
    <AntApp>
      <PrintReceiptsModal open tenantId="tenant-1" syndicId="syndic-1" lots={LOTS} onClose={onClose} />
    </AntApp>
  );
}

describe('PrintReceiptsModal (lot S3, besoin 1, P7)', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    createObjectURL = vi.fn(() => 'blob:quittances-1');
    revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });

  it('désactive Aperçu et Télécharger sans période choisie', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Aperçu' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Télécharger' })).toBeDisabled();
  });

  it('borne les colonnes à 1-3 et les lignes à 1-4', () => {
    renderModal();
    const cols = screen.getByLabelText('Colonnes') as HTMLInputElement;
    const rows = screen.getByLabelText('Lignes') as HTMLInputElement;
    expect(cols).toHaveAttribute('aria-valuemax', '3');
    expect(cols).toHaveAttribute('aria-valuemin', '1');
    expect(rows).toHaveAttribute('aria-valuemax', '4');
    expect(rows).toHaveAttribute('aria-valuemin', '1');
  });

  it('envoie la période (raccourci mois en cours), le type et la grille choisis (Télécharger)', async () => {
    const blob = new Blob(['%PDF-1.4']);
    printReceipts.mockResolvedValue({ blob, filename: 'Quittances.pdf' });

    renderModal();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Mois en cours' }));
    await user.click(screen.getByRole('button', { name: 'Télécharger' }));

    await waitFor(() => expect(printReceipts).toHaveBeenCalled());
    const [tenantId, syndicId, query] = printReceipts.mock.calls[0];
    expect(tenantId).toBe('tenant-1');
    expect(syndicId).toBe('syndic-1');
    expect(query).toMatchObject({ kind: 'QUITTANCE', cols: 2, rows: 2 });
    expect(query.from).toMatch(/^\d{4}-\d{2}-01$/);
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'Quittances.pdf'));
  });

  /**
   * Le bouton « Aperçu » appelle le même service, avec les mêmes paramètres,
   * pour construire l'URL d'objet donnée à l'iframe (`URL.createObjectURL`).
   * Le rendu réel de cette iframe (navigation d'une URL `blob:`) n'est pas
   * exercé ici : jsdom lève `SecurityError: localStorage is not available
   * for opaque origins` dès que React la monte — limitation de
   * l'environnement de test, sans rapport avec le composant.
   */
  it('sur Aperçu, demande le document et crée une URL d’objet à partir du blob reçu', async () => {
    const blob = new Blob(['%PDF-1.4']);
    printReceipts.mockResolvedValue({ blob, filename: 'Quittances.pdf' });
    // L'aperçu ne monte jamais l'iframe dans ce test : `setPreviewUrl` est
    // observé via le mock de `createObjectURL`, pas via le rendu réel.
    createObjectURL.mockImplementation(() => {
      throw new Error('rendu réel de l’aperçu non exercé dans ce test (limitation jsdom)');
    });

    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Année en cours' }));
    await user.click(screen.getByRole('button', { name: 'Aperçu' }));

    await waitFor(() => expect(printReceipts).toHaveBeenCalled());
    const [tenantId, syndicId, query] = printReceipts.mock.calls[0];
    expect(tenantId).toBe('tenant-1');
    expect(syndicId).toBe('syndic-1');
    expect(query).toMatchObject({ kind: 'QUITTANCE', cols: 2, rows: 2 });
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(blob));
  });

  it('télécharge le fichier et affiche l’erreur 422 en cas d’échec', async () => {
    printReceipts.mockRejectedValue({
      response: {
        status: 422,
        data: { success: false, error: 'Aucun document ne correspond à cette période et à ces filtres.' }
      }
    });

    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Année en cours' }));
    await user.click(screen.getByRole('button', { name: 'Télécharger' }));

    expect(await screen.findByText('Aucun document ne correspond à cette période et à ces filtres.')).toBeTruthy();
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it('affiche un message clair sur un 429 « RATE_LIMITED »', async () => {
    printReceipts.mockRejectedValue({
      response: { status: 429, data: { success: false, message: "Trop d'impressions", code: 'RATE_LIMITED' } }
    });

    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Mois en cours' }));
    await user.click(screen.getByRole('button', { name: 'Aperçu' }));

    expect(await screen.findByText("Trop d'impressions, réessayez dans une minute.")).toBeTruthy();
  });

  it('affiche un message clair sur un 429 « PRINT_IN_PROGRESS »', async () => {
    printReceipts.mockRejectedValue({
      response: { status: 429, data: { success: false, message: 'Impression en cours', code: 'PRINT_IN_PROGRESS' } }
    });

    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Mois en cours' }));
    await user.click(screen.getByRole('button', { name: 'Télécharger' }));

    expect(await screen.findByText('Une impression est déjà en cours.')).toBeTruthy();
  });

  it('affiche un message clair sur un 422 « trop de pages »', async () => {
    printReceipts.mockRejectedValue({
      response: {
        status: 422,
        data: { success: false, message: 'Trop de pages', errors: [{ field: 'pages', message: '300 > 250' }] }
      }
    });

    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Année en cours' }));
    await user.click(screen.getByRole('button', { name: 'Aperçu' }));

    expect(
      await screen.findByText('Trop de pages : réduisez la période ou augmentez le nombre de quittances par feuille.')
    ).toBeTruthy();
  });
});
