import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { PolicyList } from '../../components/insurance/PolicyList';
import { PolicyFormModal } from '../../components/insurance/PolicyFormModal';
import { MaintenanceLogFormModal } from '../../components/insurance/MaintenanceLogFormModal';
import { daysToExpiryLabel } from '../../components/insurance/insurance-labels';
import { apiErrorMessage, apiFieldErrors } from '../../components/patrimoine/patrimoine-labels';

const createInsurancePolicy = vi.fn();
const createMaintenanceLogEntry = vi.fn();
const uploadDocument = vi.fn();
const feedbackError = vi.fn();

vi.mock('../../services/insurance-service', () => ({
  __esModule: true,
  createInsurancePolicy: (...a: unknown[]) => createInsurancePolicy(...a),
  updateInsurancePolicy: vi.fn(),
  createMaintenanceLogEntry: (...a: unknown[]) => createMaintenanceLogEntry(...a),
  updateMaintenanceLogEntry: vi.fn()
}));
vi.mock('../../services/maintenance-service', () => ({
  __esModule: true,
  vendorMaintenanceService: { listVendors: vi.fn().mockResolvedValue({ success: true, data: [] }) }
}));
vi.mock('../../services/property-service', () => ({
  __esModule: true,
  uploadDocument: (...a: unknown[]) => uploadDocument(...a)
}));
vi.mock('../../lib/feedback', () => ({
  __esModule: true,
  feedback: { error: (...a: unknown[]) => feedbackError(...a), success: vi.fn() }
}));

const POLICE = {
  id: 'pol-1',
  propertyId: 'bien-1',
  propertyReference: 'REF-1',
  insurer: 'NSIA',
  policyNumber: 'POL-J30',
  coverageType: 'MULTIRISK_HOME',
  startDate: '2026-01-01',
  endDate: '2026-11-01',
  annualPremium: 1000,
  currency: 'XOF',
  notes: null,
  documentId: null,
  status: 'EXPIRING_SOON',
  daysToExpiry: 30,
  claimsCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

const MESSAGE_REGLE = "La prochaine échéance ne peut pas précéder la date d'intervention.";
const erreurValidation = {
  response: {
    status: 400,
    data: {
      message: 'Les données fournies sont invalides.',
      error: 'Les données fournies sont invalides.',
      errors: [{ field: 'nextDueDate', message: MESSAGE_REGLE }]
    }
  }
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BUG-2026-10-02-007 : jours avant l’échéance d’une police', () => {
  it('libelle le nombre de jours selon le statut', () => {
    expect(daysToExpiryLabel('EXPIRING_SOON', 30)).toBe('Dans 30 jours');
    expect(daysToExpiryLabel('ACTIVE', 1)).toBe('Dans 1 jour');
    expect(daysToExpiryLabel('EXPIRING_SOON', 0)).toBe("Expire aujourd'hui");
    expect(daysToExpiryLabel('EXPIRED', -5)).toBe('Expirée depuis 5 jours');
    expect(daysToExpiryLabel('UPCOMING', 120)).toBe('—');
  });

  it('la liste des polices affiche le statut ET le nombre de jours', () => {
    render(
      <PolicyList policies={[POLICE as never]} canEdit={false} deletingId={null} onEdit={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.getByText('Expire bientôt')).toBeInTheDocument();
    expect(screen.getByText('Dans 30 jours')).toBeInTheDocument();
  });
});

describe('BUG-2026-10-02-008 : erreur de validation serveur', () => {
  it('apiErrorMessage préfère le détail errors[] au message générique', () => {
    expect(apiFieldErrors(erreurValidation)).toHaveLength(1);
    expect(apiErrorMessage(erreurValidation, 'repli')).toBe(MESSAGE_REGLE);
    expect(apiErrorMessage({ response: { data: { error: 'Boom' } } }, 'repli')).toBe('Boom');
    expect(apiErrorMessage({}, 'repli')).toBe('repli');
  });

  it('le carnet affiche le message de la règle sur le champ fautif et dans la notification', async () => {
    const user = userEvent.setup();
    createMaintenanceLogEntry.mockRejectedValue(erreurValidation);
    render(
      <AntApp>
        <MaintenanceLogFormModal
          open
          tenantId="agence-1"
          propertyId="bien-1"
          entry={null}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </AntApp>
    );
    await user.type(await screen.findByLabelText("Date de l'intervention"), '2026-05-20');
    await user.type(screen.getByLabelText('Description'), 'Chauffe-eau');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(feedbackError).toHaveBeenCalledWith(MESSAGE_REGLE));
    // Le message est aussi posé sur le champ nextDueDate du formulaire.
    expect(await screen.findByText(MESSAGE_REGLE, { selector: '.ant-form-item-explain-error' })).toBeInTheDocument();
  });
});

describe('BUG-2026-10-02-012 : pièce justificative d’une police', () => {
  it('téléverse la pièce puis la lie à la police par documentId', async () => {
    const user = userEvent.setup();
    uploadDocument.mockResolvedValue({ id: 'doc-77' });
    createInsurancePolicy.mockResolvedValue(POLICE);
    render(
      <AntApp>
        <PolicyFormModal
          open
          tenantId="agence-1"
          propertyId="bien-1"
          policy={null}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </AntApp>
    );
    await user.type(await screen.findByLabelText('Assureur'), 'NSIA');
    await user.type(screen.getByLabelText('Numéro de police'), 'P-1');
    await user.type(screen.getByLabelText('Début'), '2026-01-01');
    await user.type(screen.getByLabelText('Fin'), '2026-12-31');
    await user.upload(
      screen.getByTestId('policy-file-input'),
      new File(['x'], 'attestation.pdf', { type: 'application/pdf' })
    );
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(createInsurancePolicy).toHaveBeenCalledWith('agence-1', expect.objectContaining({ documentId: 'doc-77' }))
    );
    expect(uploadDocument).toHaveBeenCalledWith('agence-1', 'bien-1', expect.any(File), 'INSURANCE', undefined, false);
  });
});
