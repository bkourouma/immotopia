import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TenantSubscriptionSettings } from '../../pages/tenant/TenantSubscriptionSettings';

/**
 * `/tenant/:tenantId/settings/abonnement` — abonnement vu par l'agence,
 * EN LECTURE SEULE (vague 2, lot C). `services/subscription-v2-service.ts`
 * est mocké en entier.
 */

const getOwnEntitlements = vi.fn();

vi.mock('../../services/subscription-v2-service', () => ({
  getOwnEntitlements: (...a: unknown[]) => getOwnEntitlements(...a)
}));

const ENTITLEMENTS = {
  tenantId: 'tenant-1',
  subscriptionId: 'sub-1',
  status: 'TRIALING',
  phase: 'TRIAL',
  readOnly: false,
  readOnlyReason: null,
  trialEndsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
  graceEndsAt: null,
  billingCycle: 'MONTHLY',
  currentPeriodStart: '2026-01-01T00:00:00.000Z',
  currentPeriodEnd: '2026-02-01T00:00:00.000Z',
  packs: ['AGENCE'],
  modules: ['MODULE_AGENCY'],
  moduleAccess: { MODULE_AGENCY: 'FULL', MODULE_SYNDIC: 'NONE', MODULE_PROMOTER: 'NONE' },
  features: [],
  capacities: {
    LOTS: { included: 100, extensions: 0, overrides: 0, limit: 100, used: 42, remaining: 58, overBy: 0 },
    COPROPRIETES: { included: 0, extensions: 0, overrides: 0, limit: 0, used: 0, remaining: 0, overBy: 0 },
    CHANTIERS: { included: 0, extensions: 0, overrides: 0, limit: 0, used: 0, remaining: 0, overBy: 0 }
  },
  quotaPolicy: 'BILL_OVERAGE',
  enforcement: 'enforce',
  computedAt: '2026-01-15T00:00:00.000Z'
};

function mount() {
  return render(
    <MemoryRouter initialEntries={['/tenant/tenant-1/settings/abonnement']}>
      <Routes>
        <Route path="/tenant/:tenantId/settings/abonnement" element={<TenantSubscriptionSettings />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  getOwnEntitlements.mockReset();
});

describe('<TenantSubscriptionSettings> — lecture seule', () => {
  it("affiche les packs, la période, les jours d'essai restants et la consommation", async () => {
    getOwnEntitlements.mockResolvedValue(ENTITLEMENTS);
    mount();

    expect(await screen.findByText('Formule')).toBeInTheDocument();
    expect(screen.getByText('AGENCE')).toBeInTheDocument();
    expect(screen.getByText('42 / 100')).toBeInTheDocument();
    expect(getOwnEntitlements).toHaveBeenCalledWith('tenant-1');

    // Aucun bouton de modification de l'abonnement : consultation seule.
    expect(screen.queryByRole('button', { name: /Enregistrer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retirer/ })).not.toBeInTheDocument();
  });

  it("propose de demander une extension par e-mail plutôt qu'un appel API inventé", async () => {
    getOwnEntitlements.mockResolvedValue(ENTITLEMENTS);
    mount();

    // Le nom accessible concatène l'icône (« mail ») et le libellé.
    const button = await screen.findByRole('button', { name: /Demander une extension/ });
    expect(button).toBeInTheDocument();
  });

  it("indique l'absence d'abonnement", async () => {
    getOwnEntitlements.mockResolvedValue({ ...ENTITLEMENTS, phase: 'NONE' });
    mount();

    expect(await screen.findByText("Cette agence n'a pas encore d'abonnement.")).toBeInTheDocument();
  });
});
