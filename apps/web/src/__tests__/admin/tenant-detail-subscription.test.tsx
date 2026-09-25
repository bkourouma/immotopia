import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { SubscriptionTab } from '../../components/admin/tenant-detail/SubscriptionTab';

/**
 * Onglet Abonnement de la fiche agence (vague 2, lot C) — abonnements par
 * packs. `services/subscription-v2-service.ts` est mocké en entier : Vitest
 * refuse tout import qu'un `vi.mock` ne déclare pas explicitement.
 */

const getSubscriptionOverview = vi.fn();
const listCatalog = vi.fn();
const previewNextInvoice = vi.fn();
const addSubscriptionItem = vi.fn();
const removeSubscriptionItem = vi.fn();
const grantCapacityOverride = vi.fn();
const revokeCapacityOverride = vi.fn();
const updateSubscriptionSettings = vi.fn();

vi.mock('../../services/subscription-v2-service', () => ({
  getSubscriptionOverview: (...a: unknown[]) => getSubscriptionOverview(...a),
  listCatalog: (...a: unknown[]) => listCatalog(...a),
  previewNextInvoice: (...a: unknown[]) => previewNextInvoice(...a),
  addSubscriptionItem: (...a: unknown[]) => addSubscriptionItem(...a),
  removeSubscriptionItem: (...a: unknown[]) => removeSubscriptionItem(...a),
  grantCapacityOverride: (...a: unknown[]) => grantCapacityOverride(...a),
  revokeCapacityOverride: (...a: unknown[]) => revokeCapacityOverride(...a),
  updateSubscriptionSettings: (...a: unknown[]) => updateSubscriptionSettings(...a)
}));

const OVERVIEW = {
  subscription: {
    id: 'sub-1',
    tenantId: 'tenant-1',
    planKey: null,
    billingCycle: 'MONTHLY' as const,
    status: 'ACTIVE' as const,
    startAt: '2026-01-01T00:00:00.000Z',
    currentPeriodStart: '2026-01-01T00:00:00.000Z',
    currentPeriodEnd: '2026-02-01T00:00:00.000Z',
    cancelAt: null,
    canceledAt: null,
    trialEndsAt: null,
    pastDueAt: null,
    graceDays: 7,
    quotaPolicy: 'BILL_OVERAGE' as const,
    comboDiscountPercent: 10,
    nextBillingAt: '2026-02-01T00:00:00.000Z'
  },
  items: [
    {
      id: 'item-1',
      code: 'AGENCE',
      kind: 'PACK' as const,
      name: 'Agence',
      quantity: 1,
      unitMonthlyPrice: 29_900,
      unitSetupPrice: 0,
      discountPercent: 0,
      status: 'ACTIVE' as const,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: null,
      endReason: null,
      replacesItemId: null,
      billedThrough: null,
      note: null
    }
  ],
  overrides: [],
  pendingLines: [],
  entitlements: {
    tenantId: 'tenant-1',
    subscriptionId: 'sub-1',
    status: 'ACTIVE' as const,
    phase: 'ACTIVE' as const,
    readOnly: false,
    readOnlyReason: null,
    trialEndsAt: null,
    graceEndsAt: null,
    billingCycle: 'MONTHLY' as const,
    currentPeriodStart: '2026-01-01T00:00:00.000Z',
    currentPeriodEnd: '2026-02-01T00:00:00.000Z',
    packs: ['AGENCE'],
    modules: ['MODULE_AGENCY'],
    moduleAccess: { MODULE_AGENCY: 'FULL', MODULE_SYNDIC: 'NONE', MODULE_PROMOTER: 'NONE' },
    features: [],
    capacities: {
      LOTS: { included: 100, extensions: 0, overrides: 0, limit: 100, used: 90, remaining: 10, overBy: 0 },
      COPROPRIETES: { included: 0, extensions: 0, overrides: 0, limit: 0, used: 0, remaining: 0, overBy: 0 },
      CHANTIERS: { included: 0, extensions: 0, overrides: 0, limit: 0, used: 0, remaining: 0, overBy: 0 }
    },
    quotaPolicy: 'BILL_OVERAGE' as const,
    enforcement: 'enforce' as const,
    computedAt: '2026-01-15T00:00:00.000Z'
  }
};

const CATALOG = [
  { id: 'c-1', code: 'AGENCE', kind: 'PACK' as const, name: 'Agence', description: null, monthlyPrice: 29_900, setupPrice: 100_000, modules: ['MODULE_AGENCY'], exclusiveGroup: null, rules: null, isSellable: true, sortOrder: 10, capacities: { LOTS: 100 } }
];

const INVOICE_PREVIEW = {
  tenantId: 'tenant-1',
  issuer: { name: 'Alliance Consultants' },
  billingCycle: 'MONTHLY' as const,
  periodStart: '2026-02-01T00:00:00.000Z',
  periodEnd: '2026-03-01T00:00:00.000Z',
  pendingLineIds: [],
  quotaPolicy: 'BILL_OVERAGE' as const,
  lines: [{ kind: 'PACK' as const, label: 'Agence', code: 'AGENCE', quantity: 1, unitPrice: 29_900, amount: 29_900 }],
  amountExclTax: 29_900,
  taxRate: 18,
  taxAmount: 5_382,
  amountTotal: 35_282
};

function mount() {
  return render(
    <AntApp>
      <SubscriptionTab tenantId="tenant-1" tenantName="Agence Demo" />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSubscriptionOverview.mockResolvedValue(OVERVIEW);
  listCatalog.mockResolvedValue(CATALOG);
  previewNextInvoice.mockResolvedValue(INVOICE_PREVIEW);
});

describe('SubscriptionTab — abonnement par packs', () => {
  it('affiche le pack en vigueur, le cycle, le statut et la consommation de lots', async () => {
    mount();

    expect(await screen.findByText('Abonnement')).toBeInTheDocument();
    expect(screen.getAllByText('Agence').length).toBeGreaterThan(0);
    expect(screen.getByText('Mensuel')).toBeInTheDocument();
    expect(screen.getByText('90 / 100')).toBeInTheDocument();
  });

  it("affiche l'aperçu de la prochaine facture avec TVA et total TTC", async () => {
    mount();

    await screen.findByText('Prochaine facture (aperçu)');
    expect(screen.getByText('TVA 18 %')).toBeInTheDocument();
    expect(screen.getByText('Total TTC')).toBeInTheDocument();
  });

  it('retire un élément à l’échéance après confirmation', async () => {
    removeSubscriptionItem.mockResolvedValue({ item: OVERVIEW.items[0], remainder: null, immediate: false, modules: null });
    mount();

    await screen.findByText('Abonnement');
    fireEvent.click(screen.getByRole('button', { name: 'Retirer à l’échéance' }));

    const dialogue = await screen.findByRole('dialog');
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Retirer à l’échéance' }));

    await waitFor(() => expect(removeSubscriptionItem).toHaveBeenCalledWith('tenant-1', 'item-1', {}));
  });

  it('accorde une dérogation de capacité', async () => {
    grantCapacityOverride.mockResolvedValue({ id: 'ov-1' });
    const user = userEvent.setup();
    mount();

    await screen.findByText('Abonnement');
    await user.click(screen.getByRole('button', { name: 'Accorder une dérogation' }));

    const dialogue = await screen.findByRole('dialog');
    await user.click(within(dialogue).getByText('Capacité').closest('.ant-form-item')!.querySelector('.ant-select-selector')!);
    await user.click(await screen.findByText('Lots', { selector: '.ant-select-item-option-content' }));

    const delta = within(dialogue).getByRole('spinbutton');
    await user.clear(delta);
    await user.type(delta, '30');

    await user.type(within(dialogue).getByPlaceholderText('Ex. : Reprise, geste commercial…'), 'Reprise après dépassement');
    await user.click(within(dialogue).getByRole('button', { name: 'Accorder' }));

    await waitFor(() => expect(grantCapacityOverride).toHaveBeenCalled());
    expect(grantCapacityOverride.mock.calls[0][1]).toMatchObject({
      capacityKey: 'LOTS',
      delta: 30,
      reason: 'Reprise après dépassement'
    });
  });
});

describe('SubscriptionTab — sans abonnement', () => {
  it("indique que l'agence n'a pas encore d'abonnement", async () => {
    getSubscriptionOverview.mockRejectedValue({ response: { status: 404 } });
    mount();

    expect(await screen.findByText('Cette agence n’a pas encore d’abonnement.')).toBeInTheDocument();
  });
});
