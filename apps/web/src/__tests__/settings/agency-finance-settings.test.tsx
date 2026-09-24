import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
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
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/tenant-1/settings/finance']}>
        <Routes>
          <Route path="/tenant/:tenantId/settings/finance" element={<AgencyFinanceSettings />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getAgencyFinanceSettings.mockResolvedValue(AGENCY_SETTINGS);
  listOwnerFeeTerms.mockResolvedValue(OWNERS);
  listAgentCommissionShares.mockResolvedValue(AGENTS);
});

describe('AgencyFinanceSettings — Lot 2, honoraires de gestion', () => {
  it('affiche les trois cartes à partir des mocks du service', async () => {
    mount();

    // « Honoraires de gestion » est à la fois le titre de la carte et le
    // libellé du compte comptable dédié, plus bas sur la même page.
    expect((await screen.findAllByText('Honoraires de gestion')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Conditions par propriétaire')).toBeTruthy();
    expect(await screen.findByText('Commission des collaborateurs')).toBeTruthy();

    // Carte propriétaires : un propriétaire sans conditions suit l'agence, un
    // second affiche le résumé de son forfait.
    expect(await screen.findByText('Amadou Diallo')).toBeTruthy();
    expect(await screen.findByText("Suit l'agence")).toBeTruthy();
    expect(await screen.findByText('Fatou Ba')).toBeTruthy();
    expect(await screen.findByText(/Forfait 15\s*000\s*FCFA/)).toBeTruthy();

    // Carte collaborateurs : les deux agents, avec ou sans part actuelle.
    expect(await screen.findByText('Boubacar Sy')).toBeTruthy();
    expect(await screen.findByText('Awa Traoré')).toBeTruthy();
  });

  it('le compte de produit des pénalités n’apparaît que si l’agence en bénéficie', async () => {
    mount();

    await screen.findAllByText('Honoraires de gestion');
    expect(screen.getByText('Pénalités de retard')).toBeTruthy();
    expect(screen.queryByLabelText('Compte de produit des pénalités')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: "L'agence" }));

    await waitFor(() => expect(screen.getByLabelText('Compte de produit des pénalités')).toBeTruthy());
  });

  it('avertit avant d’activer la retenue à la source et exige une date de départ', async () => {
    mount();

    await screen.findAllByText('Honoraires de gestion');
    expect(
      screen.getByText(
        'À activer seulement après confirmation du cabinet : statut fiscal de chaque propriétaire, assiette et échéances'
      )
    ).toBeTruthy();

    const interrupteur = screen.getByLabelText('Appliquer une retenue à la source sur les loyers');
    expect(screen.getByLabelText('Appliquer aux encaissements à partir du')).toBeDisabled();

    fireEvent.click(interrupteur);
    await waitFor(() => expect(screen.getByLabelText('Appliquer aux encaissements à partir du')).toBeEnabled());
    // Date de départ proposée à aujourd'hui.
    const aujourdHui = new Date();
    const attendu = [aujourdHui.getDate(), aujourdHui.getMonth() + 1]
      .map(n => String(n).padStart(2, '0'))
      .concat(String(aujourdHui.getFullYear()))
      .join('/');
    expect((screen.getByLabelText('Appliquer aux encaissements à partir du') as HTMLInputElement).value).toBe(attendu);
  });

  it('en mode forfait, le champ montant remplace le taux', async () => {
    mount();

    await screen.findAllByText('Honoraires de gestion');
    expect(screen.getByLabelText(/Taux d'honoraires/)).toBeTruthy();
    expect(screen.queryByLabelText(/Forfait par échéance \(FCFA\)/)).toBeNull();

    // Le bouton du `Radio.Group` masque son `<input>` (`pointer-events: none`) :
    // AntD ne le rend cliquable que via son `<label>` englobant. `userEvent`
    // refuse ce clic ; `fireEvent`, utilisé ailleurs dans les tests du dépôt
    // pour les mêmes contrôles AntD, ne fait pas cette vérification.
    fireEvent.click(screen.getByRole('radio', { name: 'Forfait par échéance' }));

    await waitFor(() => expect(screen.getByLabelText(/Forfait par échéance \(FCFA\)/)).toBeTruthy());
    expect(screen.queryByLabelText(/Taux d'honoraires/)).toBeNull();
    // L'assiette n'a plus de sens en forfait : elle disparaît avec le taux.
    expect(screen.queryByText('Calculés sur')).toBeNull();
  });

  it('enregistre la part de commission d’un collaborateur', async () => {
    updateAgentCommissionShare.mockResolvedValue({ userId: 'agent-1', sharePercent: 25 });
    mount();

    await screen.findByText('Boubacar Sy');

    const champPart = document.getElementById('agent-share-agent-1') as HTMLInputElement;
    expect(champPart).toBeTruthy();
    fireEvent.change(champPart, { target: { value: '25' } });
    fireEvent.blur(champPart);

    const ligneBoubacar = (await screen.findByText('Boubacar Sy')).closest('tr') as HTMLElement;
    // L'icône du bouton porte elle-même un `aria-label` (« save ») : le nom
    // accessible du bouton concatène cette étiquette et le texte visible, d'où
    // le motif plutôt qu'une égalité stricte sur « Enregistrer ».
    await waitFor(() => {
      expect(within(ligneBoubacar).getByRole('button', { name: /Enregistrer/ })).not.toBeDisabled();
    });
    fireEvent.click(within(ligneBoubacar).getByRole('button', { name: /Enregistrer/ }));

    await waitFor(() => expect(updateAgentCommissionShare).toHaveBeenCalledWith('tenant-1', 'agent-1', 25));
    expect(await screen.findByText('Part de Boubacar Sy enregistrée')).toBeTruthy();
  });
});
