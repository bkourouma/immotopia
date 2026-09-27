import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { DataExportTab } from '../../components/admin/tenant-detail/DataExportTab';

/**
 * Onglet Export des données de la fiche agence (lot S7, besoin 8).
 * `services/tenant-data-export-service.ts` est mocké en entier : Vitest
 * refuse tout import qu'un `vi.mock` ne déclare pas explicitement.
 */

const listTenantDataExports = vi.fn();
const requestTenantDataExport = vi.fn();
const deleteTenantDataExport = vi.fn();
const downloadTenantDataExport = vi.fn();

vi.mock('../../services/tenant-data-export-service', () => ({
  listTenantDataExports: (...a: unknown[]) => listTenantDataExports(...a),
  requestTenantDataExport: (...a: unknown[]) => requestTenantDataExport(...a),
  deleteTenantDataExport: (...a: unknown[]) => deleteTenantDataExport(...a),
  downloadTenantDataExport: (...a: unknown[]) => downloadTenantDataExport(...a)
}));

const READY = {
  id: 'exp-1',
  tenantId: 'tenant-1',
  status: 'READY' as const,
  requestedBy: { id: 'user-1', fullName: 'Awa Koné', email: 'awa@example.com' },
  sizeBytes: 2_500_000,
  modelCount: 40,
  rowCount: 5_000,
  fileCount: 12,
  missingFileCount: 0,
  error: null,
  startedAt: '2026-09-01T10:00:00.000Z',
  finishedAt: '2026-09-01T10:05:00.000Z',
  expiresAt: '2026-09-08T10:05:00.000Z',
  createdAt: '2026-09-01T09:59:00.000Z',
  downloadPath: '/api/admin/tenants/tenant-1/data-exports/exp-1/download'
};

const RUNNING = {
  ...READY,
  id: 'exp-2',
  status: 'RUNNING' as const,
  downloadPath: null,
  requestedBy: { id: 'user-2', fullName: 'Ibrahim Traoré', email: 'ibrahim@example.com' }
};

function mount() {
  return render(
    <AntApp>
      <DataExportTab tenantId="tenant-1" />
    </AntApp>
  );
}

async function confirmDialog(buttonName: string) {
  const dialogue = await screen.findByRole('dialog');
  fireEvent.click(within(dialogue).getByRole('button', { name: buttonName }));
}

beforeEach(() => {
  vi.clearAllMocks();
  listTenantDataExports.mockResolvedValue([READY]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DataExportTab — export des données', () => {
  it('liste les exports avec statut, taille et demandeur', async () => {
    mount();
    expect(await screen.findByText('Awa Koné')).toBeInTheDocument();
    expect(screen.getByText('Prêt')).toBeInTheDocument();
    expect(screen.getByText('2.4 Mo')).toBeInTheDocument();
    expect(listTenantDataExports).toHaveBeenCalledWith('tenant-1');
  });

  it('demande un export après confirmation', async () => {
    requestTenantDataExport.mockResolvedValue({ ...RUNNING, status: 'QUEUED' });
    mount();
    await screen.findByText('Awa Koné');
    fireEvent.click(screen.getByRole('button', { name: /Préparer un export/ }));
    await confirmDialog('Préparer un export');
    await waitFor(() => expect(requestTenantDataExport).toHaveBeenCalledWith('tenant-1'));
  });

  it("affiche « un export est déjà en cours » sur un 409", async () => {
    requestTenantDataExport.mockRejectedValue({ response: { status: 409 } });
    mount();
    await screen.findByText('Awa Koné');
    fireEvent.click(screen.getByRole('button', { name: /Préparer un export/ }));
    await confirmDialog('Préparer un export');
    expect(await screen.findByText('Un export est déjà en cours')).toBeInTheDocument();
  });

  it('ne propose Télécharger que sur un export READY', async () => {
    listTenantDataExports.mockResolvedValue([READY, RUNNING]);
    mount();
    await screen.findByText('Awa Koné');
    expect(screen.getAllByRole('button', { name: /Télécharger/ })).toHaveLength(1);
    // RUNNING n'a pas non plus le bouton Supprimer.
    expect(screen.getAllByRole('button', { name: /Supprimer/ })).toHaveLength(1);
  });

  it('supprime un export après confirmation', async () => {
    deleteTenantDataExport.mockResolvedValue(undefined);
    mount();
    await screen.findByText('Awa Koné');
    fireEvent.click(screen.getByRole('button', { name: /Supprimer/ }));
    await confirmDialog('Supprimer');
    await waitFor(() => expect(deleteTenantDataExport).toHaveBeenCalledWith('tenant-1', 'exp-1'));
  });

  it("affiche « archive expirée » sur un téléchargement en 410", async () => {
    downloadTenantDataExport.mockRejectedValue({ response: { status: 410, data: { code: 'EXPORT_EXPIRED' } } });
    mount();
    await screen.findByText('Awa Koné');
    fireEvent.click(screen.getByRole('button', { name: /Télécharger/ }));
    expect(await screen.findByText('Archive expirée, préparez un nouvel export')).toBeInTheDocument();
    await waitFor(() => expect(listTenantDataExports).toHaveBeenCalledTimes(2));
  });

  it('rafraîchit toutes les 5 s tant qu’un export est en cours, puis arrête', async () => {
    vi.useFakeTimers();
    listTenantDataExports.mockResolvedValueOnce([RUNNING]);
    mount();
    await vi.waitFor(() => expect(listTenantDataExports).toHaveBeenCalledTimes(1));

    listTenantDataExports.mockResolvedValueOnce([READY]);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => expect(listTenantDataExports).toHaveBeenCalledTimes(2));

    // Tout est terminé (READY) : plus d'appel supplémentaire après 5 s.
    await vi.advanceTimersByTimeAsync(5000);
    expect(listTenantDataExports).toHaveBeenCalledTimes(2);
  });
});
