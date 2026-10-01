import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { PropertyInsuranceTab } from '../../components/insurance/PropertyInsuranceTab';

const listInsurancePolicies = vi.fn();
const listInsuranceClaims = vi.fn();
const getInsuranceClaim = vi.fn();
const changeInsuranceClaimStatus = vi.fn();

vi.mock('../../services/insurance-service', () => ({
  __esModule: true,
  listInsurancePolicies: (...a: unknown[]) => listInsurancePolicies(...a),
  listInsuranceClaims: (...a: unknown[]) => listInsuranceClaims(...a),
  getInsuranceClaim: (...a: unknown[]) => getInsuranceClaim(...a),
  changeInsuranceClaimStatus: (...a: unknown[]) => changeInsuranceClaimStatus(...a),
  createInsurancePolicy: vi.fn(),
  updateInsurancePolicy: vi.fn(),
  deleteInsurancePolicy: vi.fn(),
  createInsuranceClaim: vi.fn(),
  attachClaimDocument: vi.fn(),
  detachClaimDocument: vi.fn()
}));
vi.mock('../../services/maintenance-service', () => ({
  __esModule: true,
  propertyMaintenanceService: { getHistory: vi.fn(async () => ({ success: true, data: [] })) }
}));
vi.mock('../../services/patrimoine-service', () => ({
  __esModule: true,
  listExpenses: vi.fn(async () => [])
}));
vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }
}));

const POLICE = {
  id: 'pol-1',
  propertyId: 'bien-1',
  propertyReference: 'REF-1',
  insurer: 'NSIA Assurances',
  policyNumber: 'P-2026-01',
  coverageType: 'MULTIRISK_HOME',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  annualPremium: 250000,
  currency: 'XOF',
  notes: null,
  documentId: null,
  status: 'EXPIRING_SOON',
  daysToExpiry: 12,
  claimsCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

const SINISTRE = {
  id: 'sin-1',
  propertyId: 'bien-1',
  propertyReference: 'REF-1',
  policyId: 'pol-1',
  policyLabel: 'NSIA Assurances · n° P-2026-01',
  ticketId: null,
  ticketTitle: null,
  expenseId: null,
  occurredAt: '2026-03-10',
  declaredAt: '2026-03-11T08:00:00.000Z',
  cause: 'WATER_DAMAGE',
  description: 'Fuite dans la cuisine',
  status: 'INSURER_NOTIFIED',
  claimedAmount: 500000,
  indemnifiedAmount: null,
  deductible: null,
  outOfPocketAmount: null,
  currency: 'XOF',
  rejectionReason: null,
  insurerNotifiedAt: '2026-03-12T08:00:00.000Z',
  expertiseAt: null,
  settledAt: null,
  rejectedAt: null,
  closedAt: null,
  allowedNextStatuses: ['EXPERTISE', 'SETTLED', 'REJECTED'],
  documentsCount: 0,
  createdAt: '2026-03-11T08:00:00.000Z',
  updatedAt: '2026-03-12T08:00:00.000Z'
};

const DETAIL = {
  ...SINISTRE,
  documents: [],
  history: [
    {
      id: 'h-1',
      fromStatus: null,
      toStatus: 'DECLARED',
      note: null,
      changedAt: '2026-03-11T08:00:00.000Z',
      changedByName: 'Awa Traoré'
    }
  ]
};

function rendre(canEdit?: boolean) {
  return render(
    <AntApp>
      <PropertyInsuranceTab propertyId="bien-1" tenantId="agence-1" canEdit={canEdit} />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listInsurancePolicies.mockResolvedValue([POLICE]);
  listInsuranceClaims.mockResolvedValue([SINISTRE]);
  getInsuranceClaim.mockResolvedValue(DETAIL);
  changeInsuranceClaimStatus.mockResolvedValue({ ...DETAIL, status: 'EXPERTISE' });
});

describe('PropertyInsuranceTab', () => {
  it('affiche la police avec son statut dérivé et le sinistre du bien', async () => {
    rendre();
    expect(await screen.findByText('NSIA Assurances')).toBeInTheDocument();
    expect(screen.getByText('P-2026-01')).toBeInTheDocument();
    expect(screen.getByText('Expire bientôt')).toBeInTheDocument();
    expect(await screen.findByText('Dégât des eaux')).toBeInTheDocument();
    expect(listInsurancePolicies).toHaveBeenCalledWith('agence-1', { propertyId: 'bien-1' });
    expect(listInsuranceClaims).toHaveBeenCalledWith('agence-1', { propertyId: 'bien-1' });
  });

  it("propose seulement les transitions de allowedNextStatuses et n'offre aucun champ de reste à charge", async () => {
    const user = userEvent.setup();
    rendre();
    await user.click(await screen.findByRole('button', { name: 'Détail' }));

    const actions = await screen.findByTestId('claim-transitions');
    expect(actions).toHaveTextContent('Passer à « Expertise »');
    expect(actions).toHaveTextContent('Passer à « Indemnisé »');
    expect(actions).toHaveTextContent('Passer à « Rejeté »');
    expect(actions).not.toHaveTextContent('Passer à « Clos »');
    expect(actions).not.toHaveTextContent('Passer à « Déclaré »');

    expect(screen.getByText('Reste à charge')).toBeInTheDocument();
    expect(screen.getByTestId('out-of-pocket')).toHaveTextContent('—');
    expect(screen.queryByLabelText(/reste à charge/i)).not.toBeInTheDocument();
    expect(screen.getByText('Awa Traoré', { exact: false })).toBeInTheDocument();
  });

  it('une transition simple part sans saisie', async () => {
    const user = userEvent.setup();
    rendre();
    await user.click(await screen.findByRole('button', { name: 'Détail' }));
    await user.click(await screen.findByRole('button', { name: /Passer à « Expertise »/ }));
    await waitFor(() =>
      expect(changeInsuranceClaimStatus).toHaveBeenCalledWith('agence-1', 'sin-1', { toStatus: 'EXPERTISE' })
    );
  });

  it("« Indemnisé » demande le montant indemnisé avant d'appeler l'API", async () => {
    const user = userEvent.setup();
    rendre();
    await user.click(await screen.findByRole('button', { name: 'Détail' }));
    await user.click(await screen.findByRole('button', { name: /Passer à « Indemnisé »/ }));
    await user.type(await screen.findByLabelText(/Montant indemnisé/), '300000');
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));
    await waitFor(() =>
      expect(changeInsuranceClaimStatus).toHaveBeenCalledWith(
        'agence-1',
        'sin-1',
        expect.objectContaining({ toStatus: 'SETTLED', indemnifiedAmount: 300000 })
      )
    );
  });

  it('masque toutes les écritures sans droit d’édition', async () => {
    const user = userEvent.setup();
    rendre(false);
    expect(await screen.findByText('NSIA Assurances')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajouter une police/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Déclarer un sinistre/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Modifier/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer/ })).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Détail' }));
    expect(await screen.findByTestId('out-of-pocket')).toBeInTheDocument();
    expect(screen.queryByTestId('claim-transitions')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajouter une pièce/ })).not.toBeInTheDocument();
  });

  it('affiche un état vide et une erreur de chargement', async () => {
    listInsurancePolicies.mockResolvedValue([]);
    listInsuranceClaims.mockResolvedValue([]);
    const { unmount } = rendre();
    expect(await screen.findByText("Aucune police d'assurance pour ce bien.")).toBeInTheDocument();
    expect(screen.getByText('Aucun sinistre déclaré pour ce bien.')).toBeInTheDocument();
    unmount();

    listInsurancePolicies.mockRejectedValue(new Error('boom'));
    rendre();
    expect(await screen.findByText('Impossible de charger les assurances.')).toBeInTheDocument();
  });

  it('après une erreur de rechargement, garde les données et propose « Réessayer »', async () => {
    const user = userEvent.setup();
    rendre();
    expect(await screen.findByText('NSIA Assurances')).toBeInTheDocument();
    // Une opération qui recharge échoue : l'alerte s'ajoute sans masquer les polices.
    listInsurancePolicies.mockRejectedValueOnce(new Error('boom'));
    await user.click(await screen.findByRole('button', { name: 'Détail' }));
    await user.click(await screen.findByRole('button', { name: /Passer à « Expertise »/ }));
    expect(await screen.findByText('Impossible de charger les assurances.')).toBeInTheDocument();
    expect(screen.getByText('NSIA Assurances')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.queryByText('Impossible de charger les assurances.')).not.toBeInTheDocument());
    expect(screen.getByText('NSIA Assurances')).toBeInTheDocument();
  });

  it('première erreur de chargement : alerte avec « Réessayer » et rien d’autre', async () => {
    listInsurancePolicies.mockRejectedValueOnce(new Error('boom'));
    rendre();
    expect(await screen.findByText('Impossible de charger les assurances.')).toBeInTheDocument();
    expect(screen.queryByText('NSIA Assurances')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('les libellés de montant suivent la devise du sinistre (pas de FCFA en dur)', async () => {
    const user = userEvent.setup();
    getInsuranceClaim.mockResolvedValue({ ...DETAIL, currency: 'EUR' });
    rendre();
    await user.click(await screen.findByRole('button', { name: 'Détail' }));
    await user.click(await screen.findByRole('button', { name: /Passer à « Indemnisé »/ }));
    expect(await screen.findByLabelText('Montant indemnisé (EUR)')).toBeInTheDocument();
    expect(screen.getByLabelText('Franchise (EUR)')).toBeInTheDocument();
  });
});
