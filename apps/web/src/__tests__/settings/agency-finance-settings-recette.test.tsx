import React from 'react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgencyFinanceSettings } from '../../pages/tenant/AgencyFinanceSettings';

/**
 * Lot 2 — « Paramètres financiers » de l'agence : mode forfait des honoraires,
 * conditions par propriétaire, commission des collaborateurs.
 *
 * Le service est mocké en entier (`vi.mock`) : Vitest, contrairement à Jest,
 * refuse tout import que la fabrique du mock ne déclare pas explicitement —
 * chaque export utilisé par la page et par les trois cartes doit donc figurer
 * ci-dessous, même celui qu'un scénario donné n'appelle jamais.
 */

const getAgencyFinanceSettings = vi.fn();
const updateAgencyFinanceSettings = vi.fn();
const listOwnerFeeTerms = vi.fn();
const updateOwnerFeeTerms = vi.fn();
const deleteOwnerFeeTerms = vi.fn();
const listAgentCommissionShares = vi.fn();
const updateAgentCommissionShare = vi.fn();
const getMenuEntitlements = vi.fn();
const getMyMenuAccess = vi.fn();

vi.mock('../../services/role-menu-service', () => ({
  getMyMenuAccess: (...a: unknown[]) => getMyMenuAccess(...a)
}));

vi.mock('../../services/entitlements-service', () => ({
  getMenuEntitlements: (...a: unknown[]) => getMenuEntitlements(...a)
}));

vi.mock('../../services/agency-finance-settings-service', () => ({
  getAgencyFinanceSettings: (...a: unknown[]) => getAgencyFinanceSettings(...a),
  updateAgencyFinanceSettings: (...a: unknown[]) => updateAgencyFinanceSettings(...a),
  listOwnerFeeTerms: (...a: unknown[]) => listOwnerFeeTerms(...a),
  updateOwnerFeeTerms: (...a: unknown[]) => updateOwnerFeeTerms(...a),
  deleteOwnerFeeTerms: (...a: unknown[]) => deleteOwnerFeeTerms(...a),
  listAgentCommissionShares: (...a: unknown[]) => listAgentCommissionShares(...a),
  updateAgentCommissionShare: (...a: unknown[]) => updateAgentCommissionShare(...a)
}));

// La carte « Paiement en ligne » (Lot 7) a ses propres tests
// (`payment-gateway-settings.test.tsx`) et interroge react-query : remplacée
// ici par un repère, pour que cette suite reste centrée sur les honoraires.
vi.mock('../../components/settings/PaymentGatewaySettingsCard', () => ({
  PaymentGatewaySettingsCard: () => <div>carte paiement en ligne</div>
}));

const AGENCY_SETTINGS = {
  vatRegistered: true,
  vatRate: 18,
  taxpayerNumber: null,
  managementFeeMode: 'PERCENT' as const,
  managementFeeRate: 10,
  managementFeeFixedAmount: null,
  managementFeeBase: 'RENT_ONLY' as const,
  ownerFundsAccountNumber: null,
  managementFeeAccountNumber: null,
  vatCollectedAccountNumber: null,
  cashShortageAccountNumber: '6588',
  cashSurplusAccountNumber: '7588',
  penaltyBeneficiary: 'OWNER' as const,
  penaltyIncomeAccountNumber: null,
  withholdingEnabled: false,
  withholdingRateIndividual: 12,
  withholdingRateCompany: 15,
  withholdingAccountNumber: '4478',
  withholdingStartsOn: null,
  isDefault: false,
  updatedAt: '2026-01-01T00:00:00.000Z'
};

const OWNERS = [
  {
    ownerClientId: 'owner-1',
    ownerName: 'Amadou Diallo',
    email: 'amadou@example.com',
    leaseCount: 3,
    terms: null,
    ownerTaxStatus: null
  },
  {
    ownerClientId: 'owner-2',
    ownerName: 'Fatou Ba',
    email: 'fatou@example.com',
    leaseCount: 1,
    terms: {
      managementFeeMode: 'FIXED' as const,
      managementFeeRate: null,
      managementFeeFixedAmount: 15000,
      managementFeeBase: 'RENT_ONLY' as const
    },
    ownerTaxStatus: 'INDIVIDUAL' as const
  }
];

const AGENTS = [
  { userId: 'agent-1', fullName: 'Boubacar Sy', email: 'boubacar@example.com', sharePercent: null },
  { userId: 'agent-2', fullName: 'Awa Traoré', email: 'awa@example.com', sharePercent: 20 }
];

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/tenant-1/settings/finance']}>
          <Routes>
            <Route path="/tenant/:tenantId/settings/finance" element={<AgencyFinanceSettings />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getMenuEntitlements.mockResolvedValue({ enforcement: 'off', moduleAccess: {}, readOnly: false, phase: 'ACTIVE' });
  getMyMenuAccess.mockResolvedValue({
    disabledMenuKeys: [],
    enabledMenuKeys: [],
    permissionKeys: ['TENANT_SETTINGS_VIEW', 'TENANT_SETTINGS_EDIT']
  });
  getAgencyFinanceSettings.mockResolvedValue(AGENCY_SETTINGS);
  listOwnerFeeTerms.mockResolvedValue(OWNERS);
  listAgentCommissionShares.mockResolvedValue(AGENTS);
});

describe('AgencyFinanceSettings — recette GL (BUG-013)', () => {
  const RENTAL_SETTINGS = {
    ...AGENCY_SETTINGS,
    withholdingEnabled: true,
    withholdingStartsOn: '2026-11-03'
  };

  it('BUG-013 : date de retenue vidée au clavier = message et aucun PUT', async () => {
    getAgencyFinanceSettings.mockResolvedValue(RENTAL_SETTINGS);
    mount();
    await screen.findAllByText('Honoraires de gestion');

    const champ = screen.getByLabelText('Appliquer aux encaissements à partir du') as HTMLInputElement;
    expect(champ.value).toBe('03/11/2026');

    const user = userEvent.setup();
    await user.click(champ);
    await user.clear(champ);
    await user.tab();
    fireEvent.click(
      screen.getAllByRole('button', { name: /Enregistrer/ }).find(b => b.getAttribute('type') === 'submit')!
    );

    expect(await screen.findByText("Indiquez à partir de quelle date la retenue s'applique")).toBeTruthy();
    expect(updateAgencyFinanceSettings).not.toHaveBeenCalled();
  }, 120_000);
});

describe('AgencyFinanceSettings — forfait et droits (BUG-2026-11-05-007/008)', () => {
  it.each([
    ['1,5', 1.5],
    ['1.5', 1.5],
    ['15', 15]
  ])('conserve la saisie %s et envoie le forfait %s', async (saisie, montant) => {
    updateAgencyFinanceSettings.mockImplementation(async (_tenantId, values) => ({ ...AGENCY_SETTINGS, ...values }));
    mount();
    await screen.findAllByText('Honoraires de gestion');

    fireEvent.click(screen.getByRole('radio', { name: 'Forfait par échéance' }));
    const champ = await screen.findByLabelText('Forfait par échéance (FCFA)');
    fireEvent.change(champ, { target: { value: saisie } });
    fireEvent.blur(champ);
    expect((champ as HTMLInputElement).value).toBe(saisie.replace('.', ','));

    expect(screen.getByLabelText('Taux de TVA (%)')).toBeEnabled();
    const bouton = within(document.querySelector('form') as HTMLFormElement).getByRole('button', {
      name: /Enregistrer/
    });
    expect(bouton).toBeEnabled();
    fireEvent.click(bouton);
    await waitFor(() => expect(updateAgencyFinanceSettings).toHaveBeenCalledTimes(1));
    expect(updateAgencyFinanceSettings.mock.calls[0][1].managementFeeFixedAmount).toBe(montant);
  });

  it('masque l’écriture et bloque tout PUT pour une personne sans TENANT_SETTINGS_EDIT', async () => {
    getMyMenuAccess.mockResolvedValue({
      disabledMenuKeys: [],
      enabledMenuKeys: [],
      permissionKeys: ['TENANT_SETTINGS_VIEW']
    });
    getAgencyFinanceSettings.mockResolvedValue({
      ...AGENCY_SETTINGS,
      withholdingEnabled: true,
      withholdingStartsOn: '2026-11-03'
    });
    mount();

    expect(await screen.findByText('Fiscalité')).toBeTruthy();
    expect(screen.getByLabelText('Taux de TVA (%)')).toBeDisabled();
    expect(screen.getByLabelText('Appliquer aux encaissements à partir du')).toBeDisabled();
    expect(
      within(document.querySelector('form') as HTMLFormElement).queryByRole('button', { name: /Enregistrer/ })
    ).toBeNull();
    expect(updateAgencyFinanceSettings).not.toHaveBeenCalled();
  });
});
