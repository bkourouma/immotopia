import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { PolicyFormModal } from '../../components/insurance/PolicyFormModal';
import { MaintenanceLogFormModal } from '../../components/insurance/MaintenanceLogFormModal';

const createInsurancePolicy = vi.fn();
const updateInsurancePolicy = vi.fn();
const createMaintenanceLogEntry = vi.fn();
const listVendors = vi.fn();

vi.mock('../../services/insurance-service', () => ({
  __esModule: true,
  createInsurancePolicy: (...a: unknown[]) => createInsurancePolicy(...a),
  updateInsurancePolicy: (...a: unknown[]) => updateInsurancePolicy(...a),
  createMaintenanceLogEntry: (...a: unknown[]) => createMaintenanceLogEntry(...a),
  updateMaintenanceLogEntry: vi.fn()
}));
vi.mock('../../services/maintenance-service', () => ({
  __esModule: true,
  vendorMaintenanceService: { listVendors: (...a: unknown[]) => listVendors(...a) }
}));
vi.mock('../../services/property-service', () => ({ __esModule: true, uploadDocument: vi.fn() }));

const POLICE = {
  id: 'pol-1',
  propertyId: 'bien-1',
  propertyReference: 'REF-1',
  insurer: 'NSIA',
  policyNumber: 'P-1',
  coverageType: 'MULTIRISK_HOME',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  annualPremium: 1000,
  currency: 'EUR',
  notes: null,
  documentId: null,
  status: 'ACTIVE',
  daysToExpiry: 100,
  claimsCount: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

const VENDOR_ID = '8c0f6e1a-0000-4000-8000-000000000001';
const ENTREE = {
  id: 'e-1',
  propertyId: 'bien-1',
  category: 'PLUMBING',
  performedAt: '2026-05-20',
  vendorId: VENDOR_ID,
  vendorName: 'Plomberie Express',
  cost: 45000,
  currency: 'USD',
  description: 'Chauffe-eau',
  nextDueDate: null,
  warrantyEndDate: null,
  documentId: null,
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T00:00:00.000Z'
};

function rendrePolice(policy: typeof POLICE | null) {
  render(
    <AntApp>
      <PolicyFormModal
        open
        tenantId="agence-1"
        propertyId="bien-1"
        policy={policy as never}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  updateInsurancePolicy.mockResolvedValue(POLICE);
  createInsurancePolicy.mockResolvedValue(POLICE);
  createMaintenanceLogEntry.mockResolvedValue(ENTREE);
  listVendors.mockResolvedValue({ success: true, data: [] });
});

describe('PolicyFormModal : devise', () => {
  it('crée avec XOF par défaut et libelle la prime en FCFA', async () => {
    const user = userEvent.setup();
    rendrePolice(null);
    expect(await screen.findByLabelText('Prime annuelle (FCFA)')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Assureur'), 'NSIA');
    await user.type(screen.getByLabelText('Numéro de police'), 'P-1');
    await user.type(screen.getByLabelText('Début'), '2026-01-01');
    await user.type(screen.getByLabelText('Fin'), '2026-12-31');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(createInsurancePolicy).toHaveBeenCalledWith('agence-1', expect.objectContaining({ currency: 'XOF' }))
    );
  });

  it("à l'édition, la devise inchangée n'est pas renvoyée dans le PATCH", async () => {
    const user = userEvent.setup();
    rendrePolice(POLICE);
    expect(await screen.findByLabelText('Prime annuelle (EUR)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(updateInsurancePolicy).toHaveBeenCalled());
    expect(updateInsurancePolicy.mock.calls[0][2]).not.toHaveProperty('currency');
  });

  it('renvoie la devise seulement si elle a été modifiée', async () => {
    const user = userEvent.setup();
    rendrePolice(POLICE);
    const champ = await screen.findByLabelText('Devise');
    await user.clear(champ);
    await user.type(champ, 'usd');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(updateInsurancePolicy).toHaveBeenCalled());
    expect(updateInsurancePolicy.mock.calls[0][2]).toMatchObject({ currency: 'USD' });
  });
});

describe('MaintenanceLogFormModal', () => {
  it('affiche le nom du prestataire absent de la liste chargée, jamais son identifiant', async () => {
    render(
      <AntApp>
        <MaintenanceLogFormModal
          open
          tenantId="agence-1"
          propertyId="bien-1"
          entry={ENTREE as never}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </AntApp>
    );
    expect(await screen.findByText('Plomberie Express')).toBeInTheDocument();
    expect(screen.queryByText(VENDOR_ID)).not.toBeInTheDocument();
    expect(await screen.findByLabelText('Coût (USD)')).toBeInTheDocument();
  });
});
