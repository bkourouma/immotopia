import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { PropertyMaintenanceLogTab } from '../../components/insurance/PropertyMaintenanceLogTab';

const listMaintenanceLog = vi.fn();
const downloadMaintenanceLogCsv = vi.fn();
const saveBlob = vi.fn();

vi.mock('../../services/insurance-service', () => ({
  __esModule: true,
  listMaintenanceLog: (...a: unknown[]) => listMaintenanceLog(...a),
  downloadMaintenanceLogCsv: (...a: unknown[]) => downloadMaintenanceLogCsv(...a),
  createMaintenanceLogEntry: vi.fn(),
  updateMaintenanceLogEntry: vi.fn(),
  deleteMaintenanceLogEntry: vi.fn()
}));
vi.mock('../../services/maintenance-service', () => ({
  __esModule: true,
  vendorMaintenanceService: { listVendors: vi.fn(async () => ({ success: true, data: [] })) }
}));
vi.mock('../../utils/save-blob', () => ({ __esModule: true, saveBlob: (...a: unknown[]) => saveBlob(...a) }));
vi.mock('../../utils/api-client', () => ({ __esModule: true, default: { get: vi.fn(), post: vi.fn() } }));

const entree = (id: string, performedAt: string, description: string, extra = {}) => ({
  id,
  propertyId: 'bien-1',
  category: 'PLUMBING',
  performedAt,
  vendorId: null,
  vendorName: 'Plomberie Express',
  cost: 45000,
  currency: 'XOF',
  description,
  nextDueDate: null,
  warrantyEndDate: null,
  documentId: null,
  createdAt: performedAt,
  updatedAt: performedAt,
  ...extra
});

function rendre(canEdit?: boolean) {
  return render(
    <AntApp>
      <PropertyMaintenanceLogTab propertyId="bien-1" tenantId="agence-1" canEdit={canEdit} />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listMaintenanceLog.mockResolvedValue([
    entree('e-1', '2025-02-01', 'Révision ancienne'),
    entree('e-2', '2026-05-20', 'Remplacement du chauffe-eau', { warrantyEndDate: '2028-05-20' })
  ]);
  downloadMaintenanceLogCsv.mockResolvedValue({ blob: new Blob(['x']), filename: 'carnet.csv' });
});

describe('PropertyMaintenanceLogTab', () => {
  it('liste les interventions de la plus récente à la plus ancienne', async () => {
    rendre();
    await screen.findByText('Remplacement du chauffe-eau');
    const textes = screen.getByTestId('maintenance-log').textContent ?? '';
    expect(textes.indexOf('Remplacement du chauffe-eau')).toBeLessThan(textes.indexOf('Révision ancienne'));
    expect(textes).toContain('Fin de garantie');
    expect(listMaintenanceLog).toHaveBeenCalledWith('agence-1', 'bien-1', undefined);
  });

  it('exporte le carnet en CSV', async () => {
    const user = userEvent.setup();
    rendre();
    await user.click(await screen.findByRole('button', { name: /Exporter \(CSV\)/ }));
    await waitFor(() => expect(downloadMaintenanceLogCsv).toHaveBeenCalledWith('agence-1', 'bien-1'));
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
  });

  it("masque l'ajout, la modification et la suppression sans droit d'édition", async () => {
    rendre(false);
    await screen.findByText('Remplacement du chauffe-eau');
    expect(screen.queryByRole('button', { name: /Ajouter une intervention/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exporter \(CSV\)/ })).toBeInTheDocument();
  });

  it('affiche les états vide et erreur', async () => {
    listMaintenanceLog.mockResolvedValue([]);
    const { unmount } = rendre();
    expect(await screen.findByText('Aucune intervention enregistrée.')).toBeInTheDocument();
    unmount();

    listMaintenanceLog.mockRejectedValue(new Error('boom'));
    rendre();
    expect(await screen.findByText("Impossible de charger le carnet d'entretien.")).toBeInTheDocument();
  });
});
