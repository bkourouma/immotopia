import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { NetWorthExportButtons } from '../../components/patrimoine/actifs/NetWorthExportButtons';
import { downloadNetWorthExport } from '../../services/patrimoine-net-worth-export-service';
import { saveBlob } from '../../utils/save-blob';

/**
 * Export de la situation patrimoniale (lot 5) — boutons PDF et Excel.
 * `vi.mock` couvre chaque export utilisé par le composant (AGENTS.md).
 */

vi.mock('../../services/patrimoine-net-worth-export-service', () => ({
  downloadNetWorthExport: vi.fn()
}));

vi.mock('../../utils/save-blob', () => ({
  saveBlob: vi.fn(),
  filenameFromDisposition: vi.fn()
}));

const mockDownload = downloadNetWorthExport as unknown as ReturnType<typeof vi.fn>;
const mockSaveBlob = saveBlob as unknown as ReturnType<typeof vi.fn>;

function monter() {
  return render(
    <AntApp>
      <NetWorthExportButtons tenantId="agence-1" />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<NetWorthExportButtons>', () => {
  it('télécharge la situation patrimoniale en PDF', async () => {
    const blob = new Blob(['pdf']);
    mockDownload.mockResolvedValueOnce({ blob, filename: 'situation-patrimoniale-2026-09-29.pdf' });
    monter();

    await userEvent.click(screen.getByRole('button', { name: /Exporter en PDF/ }));

    await waitFor(() => expect(mockDownload).toHaveBeenCalledWith('agence-1', 'pdf'));
    await waitFor(() => expect(mockSaveBlob).toHaveBeenCalledWith(blob, 'situation-patrimoniale-2026-09-29.pdf'));
  });

  it('télécharge la situation patrimoniale en Excel', async () => {
    const blob = new Blob(['xlsx']);
    mockDownload.mockResolvedValueOnce({ blob, filename: 'situation-patrimoniale.xlsx' });
    monter();

    await userEvent.click(screen.getByRole('button', { name: /Exporter en Excel/ }));

    await waitFor(() => expect(mockDownload).toHaveBeenCalledWith('agence-1', 'xlsx'));
    await waitFor(() => expect(mockSaveBlob).toHaveBeenCalledWith(blob, 'situation-patrimoniale.xlsx'));
  });

  it("affiche le message du serveur quand l'export échoue, sans rien enregistrer", async () => {
    const body = new Blob([JSON.stringify({ message: 'Abonnement insuffisant.' })]);
    mockDownload.mockRejectedValueOnce({ response: { data: body } });
    monter();

    await userEvent.click(screen.getByRole('button', { name: /Exporter en PDF/ }));

    expect(await screen.findByText('Abonnement insuffisant.')).toBeInTheDocument();
    expect(mockSaveBlob).not.toHaveBeenCalled();
  });
});
