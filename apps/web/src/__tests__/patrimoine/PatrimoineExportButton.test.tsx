import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { PatrimoineExportButton } from '../../components/patrimoine/PatrimoineExportButton';
import { downloadPatrimoineExport } from '../../services/patrimoine-service';
import { saveBlob } from '../../utils/save-blob';

/**
 * Export du patrimoine (P3) — boutons « Synthèse PDF » / « Classeur Excel ».
 * `vi.mock` doit couvrir chaque export utilisé par le composant (AGENTS.md).
 */

vi.mock('../../services/patrimoine-service', () => ({
  downloadPatrimoineExport: vi.fn()
}));

vi.mock('../../utils/save-blob', () => ({
  saveBlob: vi.fn()
}));

const mockDownload = downloadPatrimoineExport as unknown as ReturnType<typeof vi.fn>;
const mockSaveBlob = saveBlob as unknown as ReturnType<typeof vi.fn>;

function renderButton(props: { tenantId: string; propertyId?: string }) {
  return render(
    <AntApp>
      <PatrimoineExportButton {...props} />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PatrimoineExportButton', () => {
  it('exports the whole agency in PDF (no propertyId)', async () => {
    const blob = new Blob(['pdf']);
    mockDownload.mockResolvedValueOnce({ blob, filename: 'Patrimoine.pdf' });

    renderButton({ tenantId: 'agence-1' });

    // Le libellé accessible du bouton inclut celui de l'icône (« download
    // Exporter ») : recherche par expression plutôt que texte exact.
    await userEvent.click(screen.getByRole('button', { name: /Exporter/ }));
    await userEvent.click(await screen.findByText('Synthèse PDF'));

    await waitFor(() => expect(mockDownload).toHaveBeenCalledWith('agence-1', 'pdf', undefined));
    await waitFor(() => expect(mockSaveBlob).toHaveBeenCalledWith(blob, 'Patrimoine.pdf'));
  });

  it('exports a single property in Excel, with its propertyId', async () => {
    const blob = new Blob(['xlsx']);
    mockDownload.mockResolvedValueOnce({ blob, filename: 'patrimoine.xlsx' });

    renderButton({ tenantId: 'agence-1', propertyId: 'bien-9' });

    await userEvent.click(screen.getByRole('button', { name: /Exporter/ }));
    await userEvent.click(await screen.findByText('Classeur Excel'));

    await waitFor(() => expect(mockDownload).toHaveBeenCalledWith('agence-1', 'xlsx', 'bien-9'));
    await waitFor(() => expect(mockSaveBlob).toHaveBeenCalledWith(blob, 'patrimoine.xlsx'));
  });

  it('shows the API JSON error message when the blob response carries one', async () => {
    const errorBody = new Blob([JSON.stringify({ message: 'Export réservé aux agences actives' })], {
      type: 'application/json'
    });
    mockDownload.mockRejectedValueOnce({ response: { data: errorBody } });

    renderButton({ tenantId: 'agence-1' });

    await userEvent.click(screen.getByRole('button', { name: /Exporter/ }));
    await userEvent.click(await screen.findByText('Synthèse PDF'));

    expect(await screen.findByText('Export réservé aux agences actives')).toBeInTheDocument();
    expect(mockSaveBlob).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    mockDownload.mockRejectedValueOnce(new Error('network down'));

    renderButton({ tenantId: 'agence-1' });

    await userEvent.click(screen.getByRole('button', { name: /Exporter/ }));
    await userEvent.click(await screen.findByText('Classeur Excel'));

    expect(await screen.findByText('Export impossible')).toBeInTheDocument();
  });
});
